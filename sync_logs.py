import os
import time
import threading
import queue
import signal
import sys
from datetime import datetime, timedelta, date
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from signalwire.rest import Client as SignalWireClient
from models import Session, SMSLog
from sqlalchemy.exc import IntegrityError
from tqdm import tqdm
import logging

# Setup logging
logging.basicConfig(filename='sync_debug.log', level=logging.ERROR, 
                    format='%(asctime)s %(levelname)s:%(message)s')

load_dotenv()

# Configuration
PROJECT_ID = os.getenv('SIGNALWIRE_PROJECT_ID')
AUTH_TOKEN = os.getenv('SIGNALWIRE_AUTH_TOKEN')
SPACE_URL = os.getenv('SIGNALWIRE_SPACE_URL')
MAX_WORKERS = 3  # Reduced to avoid rate limits (SignalWire has strict limits)
MINUTES_TO_SYNC = 10  # Only sync last 10 minutes to avoid pulling millions

if not all([PROJECT_ID, AUTH_TOKEN, SPACE_URL]):
    print("Error: Please set SIGNALWIRE_PROJECT_ID, SIGNALWIRE_AUTH_TOKEN, and SIGNALWIRE_SPACE_URL in .env file")
    exit(1)

# Queue for database writes
write_queue = queue.Queue()
stop_flag = threading.Event()  # Thread-safe flag for graceful shutdown

def get_client():
    return SignalWireClient(PROJECT_ID, AUTH_TOKEN, signalwire_space_url=SPACE_URL)

def db_writer():
    """
    Dedicated thread to write to Postgres.
    Serializes writes to avoid connection pool exhaustion.
    """
    session = Session()
    batch = []
    batch_size = 500
    
    while not stop_flag.is_set():
        try:
            # Use timeout so we can check stop_flag periodically
            item = write_queue.get(timeout=1.0)
            if item is None:  # Sentinel to stop
                if batch:
                    save_batch(session, batch)
                break
            
            batch.append(item)
            
            if len(batch) >= batch_size:
                save_batch(session, batch)
                batch = []
        except queue.Empty:
            # Timeout - check if we should stop
            if stop_flag.is_set():
                if batch:
                    save_batch(session, batch)
                break
            continue
            
    session.close()

def save_batch(session, batch):
    """Bulk upsert using PostgreSQL's ON CONFLICT for high performance"""
    if not batch:
        return
    try:
        from sqlalchemy.dialects.postgresql import insert
        
        records = [{
            'id': log.id,
            'date_created': log.date_created,
            'date_sent': log.date_sent,
            'to_number': log.to_number,
            'from_number': log.from_number,
            'status': log.status,
            'error_code': log.error_code,
            'error_message': log.error_message,
            'direction': log.direction,
            'price': log.price,
            'body': log.body
        } for log in batch]
        
        stmt = insert(SMSLog).values(records)
        do_update = stmt.on_conflict_do_update(
            index_elements=['id'],
            set_={
                'status': stmt.excluded.status,
                'error_code': stmt.excluded.error_code,
                'error_message': stmt.excluded.error_message,
                'date_sent': stmt.excluded.date_sent
            }
        )
        session.execute(do_update)
        session.commit()
    except Exception as e:
        session.rollback()
        logging.error(f"Database Error: {e}")
        print(f"DB Error: {e}")

def fetch_recent_messages(start_time, pbar):
    """
    Fetches logs for a specific time window using SignalWire API.
    Uses proper pagination to handle large volumes efficiently.
    """
    client = get_client()
    
    try:
        # SignalWire API: Use date_sent_after for time-based filtering
        # The API handles pagination automatically when iterating
        count = 0
        page_size = 50  # SignalWire default page size
        
        # Use stream() which handles pagination automatically
        # SignalWire rate limit: ~10 requests/second, so we add small delays
        for msg in client.messages.stream(date_sent_after=start_time):
            if stop_flag.is_set():
                break
                
            log = SMSLog(
                id=msg.sid,
                date_created=msg.date_created,
                date_sent=msg.date_sent,
                to_number=msg.to,
                from_number=msg.from_,
                status=msg.status,
                error_code=msg.error_code,
                error_message=msg.error_message,
                direction=msg.direction,
                price=float(msg.price) if msg.price else 0.0,
                body=msg.body
            )
            write_queue.put(log)
            count += 1
            pbar.update(1)
            
            # Rate limiting: SignalWire allows ~10 req/sec, so we add small delay
            # every 50 messages (roughly 1 page)
            if count % 50 == 0:
                time.sleep(0.1)  # 100ms delay to stay under rate limit
            
        return count
    except Exception as e:
        logging.error(f"Error fetching messages: {e}")
        print(f"Error: {e}")
        return 0

def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully"""
    print("\n\n⚠️  Interrupt received. Stopping sync gracefully...")
    stop_flag.set()
    # Put sentinel to wake up db_writer
    try:
        write_queue.put_nowait(None)
    except queue.Full:
        pass

def main():
    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print(f"--- SIGNALWIRE SYNC ENGINE ---")
    print(f"Syncing last {MINUTES_TO_SYNC} minutes of messages.")
    print(f"Press Ctrl+C to stop gracefully.\n")
    
    # Calculate start time (10 minutes ago)
    start_time = datetime.utcnow() - timedelta(minutes=MINUTES_TO_SYNC)
    print(f"Fetching messages after: {start_time.isoformat()}")
    
    # Start DB Writer Thread
    writer_thread = threading.Thread(target=db_writer, daemon=False)
    writer_thread.start()
    
    try:
        with tqdm(desc="Fetching Messages", unit="msg", leave=True) as pbar:
            # Single-threaded fetch to respect rate limits
            # SignalWire has strict rate limits, parallel workers can cause issues
            count = fetch_recent_messages(start_time, pbar)
            
            if stop_flag.is_set():
                print("\n⚠️  Sync interrupted by user.")
            else:
                print(f"\n✅ Fetched {count} messages.")
    
    except KeyboardInterrupt:
        print("\n⚠️  Interrupt received.")
        stop_flag.set()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        stop_flag.set()
    finally:
        # Stop writer thread
        stop_flag.set()
        try:
            write_queue.put_nowait(None)
        except queue.Full:
            pass
        
        writer_thread.join(timeout=5)
        if writer_thread.is_alive():
            print("⚠️  Writer thread did not stop cleanly.")
        else:
            print("✅ Sync stopped cleanly.")

if __name__ == "__main__":
    main()
