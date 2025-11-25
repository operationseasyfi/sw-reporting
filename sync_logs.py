#!/usr/bin/env python3
"""
SignalWire Message Sync Script
Fetches historical message data from SignalWire API and stores in PostgreSQL.

Usage:
    python sync_logs.py              # Sync last 24 hours (default)
    python sync_logs.py --hours 1    # Sync last 1 hour
    python sync_logs.py --days 7     # Sync last 7 days
    python sync_logs.py --test       # Test connection only
"""

import os
import sys
import time
import argparse
import signal
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from requests.auth import HTTPBasicAuth

# Load environment variables
load_dotenv()

# Configuration from environment
PROJECT_ID = os.getenv('SIGNALWIRE_PROJECT_ID')
AUTH_TOKEN = os.getenv('SIGNALWIRE_AUTH_TOKEN')
SPACE_URL = os.getenv('SIGNALWIRE_SPACE_URL')

def print_config():
    """Print current configuration (masked for security)"""
    print("\n=== CONFIGURATION ===")
    print(f"Project ID: {PROJECT_ID[:8]}...{PROJECT_ID[-4:] if PROJECT_ID and len(PROJECT_ID) > 12 else 'NOT SET'}")
    print(f"Auth Token: {'*' * 8}...{AUTH_TOKEN[-4:] if AUTH_TOKEN and len(AUTH_TOKEN) > 4 else 'NOT SET'}")
    print(f"Space URL:  {SPACE_URL or 'NOT SET'}")
    print("=" * 30)

def validate_config():
    """Validate that all required config is present"""
    missing = []
    if not PROJECT_ID:
        missing.append("SIGNALWIRE_PROJECT_ID")
    if not AUTH_TOKEN:
        missing.append("SIGNALWIRE_AUTH_TOKEN")
    if not SPACE_URL:
        missing.append("SIGNALWIRE_SPACE_URL")
    
    if missing:
        print(f"\n❌ ERROR: Missing required environment variables:")
        for var in missing:
            print(f"   - {var}")
        print("\nPlease set these in your .env file:")
        print("   SIGNALWIRE_PROJECT_ID=your-project-id")
        print("   SIGNALWIRE_AUTH_TOKEN=your-auth-token")
        print("   SIGNALWIRE_SPACE_URL=your-space.signalwire.com")
        return False
    return True

def get_api_base_url():
    """Get the SignalWire API base URL"""
    # Remove protocol if present
    space = SPACE_URL.replace('https://', '').replace('http://', '')
    return f"https://{space}/api/laml/2010-04-01/Accounts/{PROJECT_ID}"

def api_request(endpoint, params=None):
    """Make authenticated request to SignalWire API"""
    url = f"{get_api_base_url()}{endpoint}"
    auth = HTTPBasicAuth(PROJECT_ID, AUTH_TOKEN)
    
    try:
        response = requests.get(url, auth=auth, params=params, timeout=120)  # 2 minute timeout
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        print(f"❌ API Error: {e}")
        print(f"   Response: {e.response.text if e.response else 'No response'}")
        return None
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return None

def test_connection():
    """Test SignalWire API connection"""
    print("\n🔍 Testing SignalWire connection...")
    
    # Try to fetch just a few messages
    result = api_request("/Messages.json", params={'PageSize': 5})
    
    if result is None:
        return False
    
    messages = result.get('messages', [])
    
    if len(messages) > 0:
        msg = messages[0]
        print(f"✅ Connection successful!")
        print(f"   Found messages in account")
        print(f"   Sample message SID: {msg.get('sid')}")
        print(f"   Status: {msg.get('status')}")
        print(f"   Date: {msg.get('date_created')}")
        return True
    else:
        print("✅ Connection successful, but no messages found in account.")
        return True

def get_db_session():
    """Get database session"""
    try:
        from models import Session
        return Session()
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return None

def parse_signalwire_date(date_str):
    """Parse SignalWire date string to datetime"""
    if not date_str:
        return None
    try:
        # SignalWire format: "Mon, 25 Nov 2024 12:34:56 +0000"
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str)
    except:
        try:
            # Fallback ISO format
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return None

def sync_messages(hours=24, days=None):
    """
    Sync messages from SignalWire to local database.
    
    Args:
        hours: Number of hours to look back (default 24)
        days: Number of days to look back (overrides hours if set)
    """
    from models import SMSLog
    from sqlalchemy.dialects.postgresql import insert
    import pytz
    
    # Calculate time window (use timezone-aware datetime)
    if days:
        lookback = timedelta(days=days)
        period_desc = f"{days} day(s)"
    else:
        lookback = timedelta(hours=hours)
        period_desc = f"{hours} hour(s)"
    
    start_time = datetime.now(pytz.UTC) - lookback
    # Format for SignalWire API: YYYY-MM-DD
    start_date_str = start_time.strftime('%Y-%m-%d')
    
    print(f"\n📥 Syncing messages from the last {period_desc}")
    print(f"   Start date: {start_date_str}")
    print(f"   Looking for messages after: {start_time.isoformat()}Z")
    
    # Get database session
    session = get_db_session()
    if not session:
        return False
    
    # Track progress
    total_fetched = 0
    total_saved = 0
    batch = []
    batch_size = 100
    page = 0
    
    # Handle Ctrl+C gracefully
    stop_requested = False
    def signal_handler(sig, frame):
        nonlocal stop_requested
        print("\n\n⚠️  Stop requested. Finishing current batch...")
        stop_requested = True
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        print(f"\n🔄 Fetching messages from SignalWire...")
        
        next_page_uri = None
        
        while not stop_requested:
            # Build request params
            if next_page_uri:
                # Use the next page URI directly with retry logic
                url = f"https://{SPACE_URL.replace('https://', '').replace('http://', '')}{next_page_uri}"
                auth = HTTPBasicAuth(PROJECT_ID, AUTH_TOKEN)
                
                # Retry up to 3 times on timeout
                for attempt in range(3):
                    try:
                        response = requests.get(url, auth=auth, timeout=120)
                        result = response.json() if response.ok else None
                        break
                    except requests.exceptions.ReadTimeout:
                        if attempt < 2:
                            print(f"\n   ⏳ Timeout on page {page+1}, retrying ({attempt+2}/3)...")
                            time.sleep(2)
                        else:
                            print(f"\n   ❌ Page {page+1} timed out after 3 attempts")
                            result = None
                            break
            else:
                # First page - use date filter
                params = {
                    'PageSize': 100,
                    'DateSent>': start_date_str
                }
                result = api_request("/Messages.json", params=params)
            
            if result is None:
                print("❌ Failed to fetch messages")
                break
            
            messages = result.get('messages', [])
            next_page_uri = result.get('next_page_uri')
            
            if not messages:
                break
            
            page += 1
            
            for msg in messages:
                if stop_requested:
                    break
                
                # Parse dates
                date_created = parse_signalwire_date(msg.get('date_created'))
                date_sent = parse_signalwire_date(msg.get('date_sent'))
                
                # Skip if before our start time (API filter is by date, not datetime)
                # Make comparison timezone-aware
                if date_created:
                    # Ensure both datetimes are comparable (both aware or both naive)
                    if date_created.tzinfo is None:
                        import pytz
                        date_created = pytz.UTC.localize(date_created)
                    if date_created < start_time:
                        continue
                
                total_fetched += 1
                
                # Parse error code
                error_code = None
                if msg.get('error_code'):
                    try:
                        error_code = int(msg.get('error_code'))
                    except:
                        pass
                
                # Parse price
                price = 0.0
                if msg.get('price'):
                    try:
                        price = abs(float(msg.get('price')))
                    except:
                        pass
                
                # Create record for upsert
                record = {
                    'id': msg.get('sid'),
                    'date_created': date_created,
                    'date_sent': date_sent,
                    'to_number': msg.get('to'),
                    'from_number': msg.get('from'),
                    'status': msg.get('status'),
                    'error_code': error_code,
                    'error_message': msg.get('error_message'),
                    'direction': msg.get('direction'),
                    'price': price,
                    'body': msg.get('body')[:500] if msg.get('body') else None
                }
                batch.append(record)
                
                # Save batch when full
                if len(batch) >= batch_size:
                    saved = save_batch(session, batch, SMSLog)
                    total_saved += saved
                    batch = []
                    print(f"   Page {page}: Processed {total_fetched} messages, saved {total_saved}...", end='\r')
            
            # Small delay between pages to respect rate limits
            time.sleep(0.1)
            
            # No more pages
            if not next_page_uri:
                break
        
        # Save any remaining records
        if batch:
            saved = save_batch(session, batch, SMSLog)
            total_saved += saved
        
        print(f"\n\n✅ Sync complete!")
        print(f"   Pages fetched: {page}")
        print(f"   Total fetched: {total_fetched}")
        print(f"   Total saved:   {total_saved}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during sync: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        session.close()

def save_batch(session, records, SMSLog):
    """Save a batch of records using upsert"""
    if not records:
        return 0
    
    try:
        from sqlalchemy.dialects.postgresql import insert
        
        stmt = insert(SMSLog).values(records)
        do_update = stmt.on_conflict_do_update(
            index_elements=['id'],
            set_={
                'status': stmt.excluded.status,
                'error_code': stmt.excluded.error_code,
                'error_message': stmt.excluded.error_message,
                'date_sent': stmt.excluded.date_sent,
                'price': stmt.excluded.price
            }
        )
        session.execute(do_update)
        session.commit()
        return len(records)
        
    except Exception as e:
        session.rollback()
        print(f"\n⚠️  Batch save error: {e}")
        return 0

def main():
    parser = argparse.ArgumentParser(description='Sync SignalWire messages to database')
    parser.add_argument('--hours', type=int, default=24, help='Hours to look back (default: 24)')
    parser.add_argument('--days', type=int, help='Days to look back (overrides --hours)')
    parser.add_argument('--test', action='store_true', help='Test connection only')
    parser.add_argument('--debug', action='store_true', help='Show debug info')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("   SIGNALWIRE MESSAGE SYNC")
    print("=" * 50)
    
    # Always show config in debug mode
    if args.debug:
        print_config()
    
    # Validate configuration
    if not validate_config():
        sys.exit(1)
    
    # Test mode
    if args.test:
        print_config()
        success = test_connection()
        sys.exit(0 if success else 1)
    
    # Test connection first
    if not test_connection():
        sys.exit(1)
    
    # Test database connection
    print("\n🔍 Testing database connection...")
    session = get_db_session()
    if not session:
        sys.exit(1)
    print("✅ Database connection successful!")
    session.close()
    
    # Run sync
    success = sync_messages(hours=args.hours, days=args.days)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
