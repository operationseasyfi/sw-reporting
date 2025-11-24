import os
import time
from datetime import datetime, timedelta
from celery import Celery
from signalwire.rest import Client as SignalWireClient
from models import Session, SMSLog, init_db
from sqlalchemy.dialects.postgresql import insert

# Configuration
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

celery = Celery('tasks', broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

# Ensure DB is ready (mostly for the worker process)
# In production, migrations (Alembic) should handle this.
try:
    init_db()
except Exception:
    pass # Flask app might have initialized it or DB not ready yet

def get_sw_client():
    project_id = os.getenv('SIGNALWIRE_PROJECT_ID')
    token = os.getenv('SIGNALWIRE_AUTH_TOKEN')
    space = os.getenv('SIGNALWIRE_SPACE_URL')
    return SignalWireClient(project_id, token, signalwire_space_url=space)

@celery.task(bind=True, max_retries=3)
def process_webhook_event(self, data):
    """
    Handles real-time status updates from SignalWire DLR Webhooks.
    SignalWire uses Twilio-compatible webhook format (form-encoded).
    Keys: MessageSid, MessageStatus, From, To, ErrorCode, ErrorMessage, etc.
    """
    session = Session()
    try:
        message_sid = data.get('MessageSid') or data.get('SmsSid')
        if not message_sid:
            print("Warning: Webhook missing MessageSid")
            return
        
        # Parse status - normalize to lowercase for consistency
        status = (data.get('MessageStatus') or data.get('SmsStatus') or 'unknown').lower()
        
        # Parse error code if present
        error_code = None
        error_code_str = data.get('ErrorCode') or data.get('SmsErrorCode')
        if error_code_str:
            try:
                error_code = int(error_code_str)
            except (ValueError, TypeError):
                pass
        
        # Parse timestamps if available
        date_created = datetime.utcnow()  # Default to now
        date_sent = None
        
        # Try to parse DateCreated if provided
        date_created_str = data.get('DateCreated')
        if date_created_str:
            try:
                # SignalWire/Twilio format: "Mon, 1 Jan 2024 12:00:00 +0000"
                # Try parsing with datetime first (simpler, no extra dependency)
                from datetime import datetime as dt_parse
                # If that fails, try dateutil (if available)
                try:
                    date_created = dt_parse.strptime(date_created_str, '%a, %d %b %Y %H:%M:%S %z')
                except:
                    # Fallback to simple parsing
                    date_created = datetime.utcnow()
            except:
                pass
        
        # Set date_sent if status indicates sent
        if status in ['sent', 'delivered', 'failed', 'undelivered']:
            date_sent = datetime.utcnow()
        
        stmt = insert(SMSLog).values(
            id=message_sid,
            status=status,
            to_number=data.get('To'),
            from_number=data.get('From'),
            date_created=date_created,
            date_sent=date_sent,
            error_code=error_code,
            error_message=data.get('ErrorMessage') or data.get('SmsErrorMessage'),
            direction=data.get('Direction', 'outbound-api'),
            body=data.get('Body') or data.get('MessageBody')
        )
        
        # Update columns on conflict (upsert)
        do_update_stmt = stmt.on_conflict_do_update(
            index_elements=['id'],
            set_={
                'status': stmt.excluded.status,
                'error_code': stmt.excluded.error_code,
                'error_message': stmt.excluded.error_message,
                'date_sent': stmt.excluded.date_sent
            }
        )

        session.execute(do_update_stmt)
        session.commit()
        
    except Exception as exc:
        session.rollback()
        print(f"Webhook processing error: {exc}")
        # Retry on DB lock or temp failure
        raise self.retry(exc=exc, countdown=5)
    finally:
        session.close()

@celery.task(bind=True, max_retries=5)
def sync_historical_data(self, days_back=30, minutes_back=None):
    """
    Background job to backfill data from SignalWire API.
    Handles pagination and rate limits properly.
    
    Args:
        days_back: Number of days to sync (if minutes_back not specified)
        minutes_back: Number of minutes to sync (takes precedence)
    """
    client = get_sw_client()
    session = Session()
    
    # Calculate date range
    if minutes_back:
        start_date = datetime.utcnow() - timedelta(minutes=minutes_back)
        print(f"Starting sync for past {minutes_back} minutes...")
    else:
        start_date = datetime.utcnow() - timedelta(days=days_back)
        print(f"Starting historical sync for past {days_back} days...")
    
    try:
        # Use stream() which handles pagination automatically
        # SignalWire rate limit: ~10 requests/second
        batch = []
        batch_size = 1000
        count = 0
        
        for msg in client.messages.stream(date_sent_after=start_date):
            record = {
                'id': msg.sid,
                'date_created': msg.date_created,
                'date_sent': msg.date_sent,
                'to_number': msg.to,
                'from_number': msg.from_,
                'status': msg.status.lower() if msg.status else 'unknown',
                'error_code': msg.error_code,
                'error_message': msg.error_message,
                'direction': msg.direction,
                'price': float(msg.price) if msg.price else 0.0,
                'body': msg.body
            }
            batch.append(record)
            count += 1
            
            # Rate limiting: add small delay every 50 messages
            if count % 50 == 0:
                time.sleep(0.1)  # 100ms delay
            
            if len(batch) >= batch_size:
                bulk_upsert(session, batch)
                batch = []
                print(f"Synced {count} messages so far...")
                
        if batch:
            bulk_upsert(session, batch)
        
        print(f"✅ Sync complete: {count} total messages")
            
    except Exception as exc:
        # If we hit a rate limit (429), SignalWire SDK might raise exception
        # We can catch and retry the task
        print(f"Sync Error: {exc}")
        raise self.retry(exc=exc, countdown=60) # Wait 60s and try again
    finally:
        session.close()

def bulk_upsert(session, records):
    if not records:
        return
        
    stmt = insert(SMSLog).values(records)
    
    do_update_stmt = stmt.on_conflict_do_update(
        index_elements=['id'],
        set_={
            'status': stmt.excluded.status,
            'error_code': stmt.excluded.error_code,
            'error_message': stmt.excluded.error_message,
            'price': stmt.excluded.price
        }
    )
    
    session.execute(do_update_stmt)
    session.commit()
    print(f"Synced batch of {len(records)} records.")

