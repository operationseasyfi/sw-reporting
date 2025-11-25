"""
SignalWire Reporting Dashboard - Flask Backend
Optimized for high-volume SMS operations (millions of messages)
"""
from flask import Flask, jsonify, request, send_from_directory, Response
from functools import wraps
from sqlalchemy import func, text, or_
from sqlalchemy.dialects.postgresql import insert
import datetime
import os
from datetime import timedelta

# ============================================================================
# APP CONFIGURATION
# ============================================================================

app = Flask(__name__, static_folder='frontend/dist', static_url_path='')

# Simple password protection
DASHBOARD_USER = os.getenv('DASHBOARD_USER', 'admin')
DASHBOARD_PASS = os.getenv('DASHBOARD_PASS', 'signalwire2025')

# Opt-out keyword lists - TWO SEPARATE METERS
# Meter 1: Default/Standard opt-out keywords
DEFAULT_STOP_KEYWORDS = ['stop', 'unsubscribe', 'optout', 'opt-out', 'opt out']

# Meter 2: Custom/Extended opt-out keywords (user can add their own)
CUSTOM_STOP_KEYWORDS = [
    'stoop', 'stopp', 'stp', 'stip', 'atop',  # Typos of STOP
    'cancel', 'quit', 'remove', 'end',
    'leave me alone', 'take me off', 'remove me',
    'no more', 'dont text', "don't text", 'stop texting',
    'screw you', 'screw u', 'f off', 'foff', 'go away',
    'wrong number', 'who is this', 'not interested',
    'do not contact', 'dnc', 'delete my number'
]

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

try:
    from models import Session, SMSLog, get_engine
    MODELS_AVAILABLE = True
except Exception as e:
    print(f"Warning: Could not import models: {e}")
    MODELS_AVAILABLE = False
    Session = None
    SMSLog = None

# Celery is optional
try:
    from tasks import process_webhook_event, sync_historical_data, celery
    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False
    print("Celery not available - webhooks will be processed synchronously")

# ============================================================================
# AUTHENTICATION
# ============================================================================

def check_auth(username, password):
    """Check if username/password combination is valid"""
    return username == DASHBOARD_USER and password == DASHBOARD_PASS

def authenticate():
    """Send 401 response that enables basic auth"""
    return Response(
        'Authentication required', 401,
        {'WWW-Authenticate': 'Basic realm="SignalWire Dashboard"'}
    )

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def keyword_filter(keywords):
    """Build SQLAlchemy filter for keyword matching"""
    if not keywords or not MODELS_AVAILABLE:
        return None
    filters = [SMSLog.body.ilike(f'%{kw}%') for kw in keywords]
    return or_(*filters)

def get_time_window(hours=24):
    """Get datetime for N hours ago"""
    return datetime.datetime.utcnow() - timedelta(hours=hours)

def check_db():
    """Check database connectivity"""
    if not MODELS_AVAILABLE:
        return False, "Models not available"
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:
        return False, str(e)

# ============================================================================
# STATIC FILE SERVING (React Frontend)
# ============================================================================

@app.route('/')
@requires_auth
def index():
    """Serve React app"""
    try:
        return send_from_directory('frontend/dist', 'index.html')
    except Exception as e:
        return jsonify({'error': 'Frontend not built', 'details': str(e)}), 500

@app.route('/<path:path>')
@requires_auth
def serve_static(path):
    """Serve static files or fallback to React app"""
    # Skip API and webhook routes
    if path.startswith('api/') or path.startswith('webhooks/') or path == 'health':
        return jsonify({'error': 'Not found'}), 404
    
    try:
        return send_from_directory('frontend/dist', path)
    except:
        # SPA fallback - serve index.html for client-side routing
        return send_from_directory('frontend/dist', 'index.html')

# ============================================================================
# HEALTH CHECK (No auth required)
# ============================================================================

@app.route('/health')
def health_check():
    """Health check endpoint for Railway"""
    db_ok, db_error = check_db()
    return jsonify({
        'status': 'ok' if db_ok else 'degraded',
        'database': 'connected' if db_ok else f'error: {db_error}',
        'timestamp': datetime.datetime.utcnow().isoformat()
    }), 200

# ============================================================================
# WEBHOOK ENDPOINT (No auth - called by SignalWire)
# ============================================================================

@app.route('/webhooks/signalwire', methods=['GET', 'POST'])
def signalwire_webhook():
    """
    Webhook endpoint for SignalWire DLR notifications.
    NOTE: Keep this DISABLED for now to avoid overwhelming the system.
    """
    if request.method == 'GET':
        return jsonify({
            'status': 'ok',
            'message': 'Webhook endpoint active (currently paused)',
            'timestamp': datetime.datetime.utcnow().isoformat()
        })
    
    # For now, just acknowledge without processing
    # This prevents SignalWire from retrying
    return '', 200

# ============================================================================
# API ENDPOINTS (Protected)
# ============================================================================

@app.route('/api/stats/overview')
@requires_auth
def get_overview_stats():
    """Main dashboard KPIs with optional date filtering"""
    if not MODELS_AVAILABLE:
        return jsonify({'error': 'Database unavailable'}), 503

    session = Session()
    try:
        # Date filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date:
            try:
                start_dt = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            except:
                start_dt = get_time_window(24)
        else:
            start_dt = get_time_window(24)
        
        if end_date:
            try:
                end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            except:
                end_dt = datetime.datetime.utcnow()
        else:
            end_dt = datetime.datetime.utcnow()
        
        # Use efficient single query with conditional aggregation
        stats = session.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('delivered', 'sent')) as delivered,
                COUNT(*) FILTER (WHERE status IN ('failed', 'undelivered')) as failed,
                COALESCE(SUM(price), 0) as spend,
                COUNT(DISTINCT to_number) as segments,
                AVG(EXTRACT(EPOCH FROM (date_sent - date_created)) * 1000) 
                    FILTER (WHERE date_sent IS NOT NULL) as avg_latency
            FROM sms_logs 
            WHERE date_created >= :start_dt AND date_created < :end_dt
        """), {'start_dt': start_dt, 'end_dt': end_dt}).fetchone()
        
        total = stats[0] or 0
        delivered = stats[1] or 0
        failed = stats[2] or 0
        
        return jsonify({
            'totalVolume': total,
            'delivered': delivered,
            'failed': failed,
            'successRate': round((delivered / total * 100), 2) if total > 0 else 0,
            'spend': round(float(stats[3] or 0), 2),
            'activeSegments': stats[4] or 0,
            'avgLatency': round(float(stats[5] or 0), 0)
        })
    except Exception as e:
        print(f"Error in overview stats: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()

@app.route('/api/stats/optouts')
@requires_auth
def get_optout_stats():
    """
    Two separate opt-out meters with date filtering:
    1. Default: STOP, UNSUBSCRIBE (standard carrier keywords)
    2. Custom: User-defined keywords for edge cases
    """
    if not MODELS_AVAILABLE:
        return jsonify({'error': 'Database unavailable'}), 503

    session = Session()
    try:
        # Date filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date:
            try:
                start_dt = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            except:
                start_dt = get_time_window(24)
        else:
            start_dt = get_time_window(24)
        
        if end_date:
            try:
                end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            except:
                end_dt = datetime.datetime.utcnow()
        else:
            end_dt = datetime.datetime.utcnow()
        
        # Count delivered outbound messages
        delivered = session.query(func.count(SMSLog.id)).filter(
            SMSLog.date_created >= start_dt,
            SMSLog.date_created < end_dt,
            SMSLog.direction == 'outbound-api',
            SMSLog.status.in_(['delivered', 'sent'])
        ).scalar() or 0

        # Meter 1: Default keywords (STOP, UNSUBSCRIBE only)
        default_filter = keyword_filter(DEFAULT_STOP_KEYWORDS)
        default_count = 0
        if default_filter is not None:
            default_count = session.query(func.count(SMSLog.id)).filter(
                SMSLog.date_created >= start_dt,
                SMSLog.date_created < end_dt,
                SMSLog.direction == 'inbound',
                SMSLog.body.isnot(None),
                default_filter
            ).scalar() or 0

        # Meter 2: Custom keywords (user-defined)
        custom_filter = keyword_filter(CUSTOM_STOP_KEYWORDS)
        custom_count = 0
        if custom_filter is not None:
            custom_count = session.query(func.count(SMSLog.id)).filter(
                SMSLog.date_created >= start_dt,
                SMSLog.date_created < end_dt,
                SMSLog.direction == 'inbound',
                SMSLog.body.isnot(None),
                custom_filter
            ).scalar() or 0

        return jsonify({
            'delivered': delivered,
            # Meter 1: Default
            'defaultCount': default_count,
            'defaultRate': round((default_count / delivered * 100), 3) if delivered > 0 else 0,
            'defaultKeywords': DEFAULT_STOP_KEYWORDS,
            # Meter 2: Custom
            'customCount': custom_count,
            'customRate': round((custom_count / delivered * 100), 3) if delivered > 0 else 0,
            'customKeywords': CUSTOM_STOP_KEYWORDS
        })
    except Exception as e:
        print(f"Error in optout stats: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()

@app.route('/api/stats/errors')
@requires_auth
def get_error_stats():
    """Top error codes with severity classification and date filtering"""
    if not MODELS_AVAILABLE:
        return jsonify([]), 503
    
    session = Session()
    try:
        # Date filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date:
            try:
                start_dt = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            except:
                start_dt = get_time_window(24)
        else:
            start_dt = get_time_window(24)
        
        if end_date:
            try:
                end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            except:
                end_dt = datetime.datetime.utcnow()
        else:
            end_dt = datetime.datetime.utcnow()
        
        results = session.execute(text("""
            SELECT error_code, COUNT(*) as cnt
            FROM sms_logs 
            WHERE error_code IS NOT NULL
              AND date_created >= :start_dt AND date_created < :end_dt
            GROUP BY error_code
            ORDER BY cnt DESC
            LIMIT 10
        """), {'start_dt': start_dt, 'end_dt': end_dt}).fetchall()
        
        def get_severity(count):
            if count >= 500: return 'critical'
            if count >= 100: return 'high'
            if count >= 25: return 'medium'
            return 'low'
        
        return jsonify([{
            'code': r[0],
            'count': r[1],
            'severity': get_severity(r[1])
        } for r in results])
    finally:
        session.close()

@app.route('/api/stats/timeseries')
@requires_auth
def get_timeseries_stats():
    """Daily message volume for charts"""
    if not MODELS_AVAILABLE:
        return jsonify({}), 503
    
    session = Session()
    try:
        cutoff = datetime.datetime.utcnow() - timedelta(days=7)
        
        results = session.execute(text("""
            SELECT 
                DATE(date_created) as day,
                status,
                COUNT(*) as cnt
            FROM sms_logs
            WHERE date_created >= :cutoff
            GROUP BY DATE(date_created), status
            ORDER BY day
        """), {'cutoff': cutoff}).fetchall()
        
        data = {}
        for date_val, status, count in results:
            if not date_val:
                continue
            d_str = date_val.strftime('%Y-%m-%d') if hasattr(date_val, 'strftime') else str(date_val)
            if d_str not in data:
                data[d_str] = {'delivered': 0, 'failed': 0, 'total': 0}
            
            data[d_str]['total'] += count
            if status in ('delivered', 'sent'):
                data[d_str]['delivered'] += count
            elif status in ('failed', 'undelivered'):
                data[d_str]['failed'] += count
        
        return jsonify(data)
    except Exception as e:
        print(f"Error in timeseries: {e}")
        return jsonify({}), 500
    finally:
        session.close()

@app.route('/api/stats/latency')
@requires_auth
def get_latency_stats():
    """Latency percentiles (P50, P95, P99)"""
    if not MODELS_AVAILABLE:
        return jsonify({'p50': 0, 'p95': 0, 'p99': 0}), 503
    
    session = Session()
    try:
        # Get latency values efficiently
        results = session.execute(text("""
            SELECT 
                EXTRACT(EPOCH FROM (date_sent - date_created)) * 1000 as latency_ms
            FROM sms_logs
            WHERE date_sent IS NOT NULL 
              AND date_created IS NOT NULL
              AND date_created >= NOW() - INTERVAL '24 hours'
            ORDER BY latency_ms
        """)).fetchall()
        
        latencies = [r[0] for r in results if r[0] and 0 < r[0] < 60000]
        
        if not latencies:
            return jsonify({'p50': 0, 'p95': 0, 'p99': 0, 'samples': 0})
        
        latencies.sort()
        n = len(latencies)
        
        return jsonify({
            'p50': round(latencies[int(n * 0.50)], 0),
            'p95': round(latencies[int(n * 0.95)], 0),
            'p99': round(latencies[min(int(n * 0.99), n-1)], 0),
            'samples': n
        })
    except Exception as e:
        print(f"Error in latency stats: {e}")
        return jsonify({'p50': 0, 'p95': 0, 'p99': 0}), 500
    finally:
        session.close()

@app.route('/api/logs_dt')
@requires_auth
def get_logs_datatable():
    """Paginated message logs with date filtering"""
    if not MODELS_AVAILABLE:
        return jsonify({'draw': 1, 'recordsTotal': 0, 'recordsFiltered': 0, 'data': []})
    
    session = Session()
    try:
        draw = int(request.args.get('draw', 1))
        start = int(request.args.get('start', 0))
        length = min(int(request.args.get('length', 100)), 500)  # Allow up to 500
        
        # Date filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Build query
        query = session.query(SMSLog)
        
        # Apply date filters if provided
        if start_date:
            try:
                from datetime import datetime
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(SMSLog.date_created >= start_dt)
            except:
                pass
        
        if end_date:
            try:
                from datetime import datetime
                # Add 1 day to include the end date fully
                end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(SMSLog.date_created < end_dt)
            except:
                pass
        
        # Order and paginate
        logs = query.order_by(SMSLog.date_created.desc())\
            .offset(start)\
            .limit(length)\
            .all()
        
        # Get filtered count
        total = query.count()
        
        data = [{
            'id': log.id,
            'date_created': log.date_created.isoformat() if log.date_created else None,
            'date_sent': log.date_sent.isoformat() if log.date_sent else None,
            'to_number': log.to_number,
            'from_number': log.from_number,
            'status': log.status,
            'error_code': log.error_code,
            'error_message': log.error_message,
            'direction': log.direction,
            'body': log.body[:160] if log.body else None,  # Show more of message
            'price': float(log.price) if log.price else 0
        } for log in logs]
        
        return jsonify({
            'draw': draw,
            'recordsTotal': total,
            'recordsFiltered': total,
            'data': data
        })
    except Exception as e:
        print(f"Error in logs_dt: {e}")
        return jsonify({'draw': 1, 'recordsTotal': 0, 'recordsFiltered': 0, 'data': []})
    finally:
        session.close()

@app.route('/api/alerts')
@requires_auth
def get_alerts():
    """Generate alerts based on recent activity"""
    if not MODELS_AVAILABLE:
        return jsonify([])
    
    session = Session()
    try:
        alerts = []
        window = get_time_window(1)  # Last hour
        
        # Check failure rate
        stats = session.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('failed', 'undelivered')) as failed
            FROM sms_logs 
            WHERE date_created >= :window
        """), {'window': window}).fetchone()
        
        if stats[0] > 0:
            failure_rate = (stats[1] / stats[0]) * 100
            if failure_rate > 20:
                alerts.append({
                    'id': 'high-failure',
                    'severity': 'critical',
                    'message': f'High failure rate: {failure_rate:.1f}% in last hour',
                    'timestamp': datetime.datetime.utcnow().isoformat()
                })
            elif failure_rate > 10:
                alerts.append({
                    'id': 'elevated-failure',
                    'severity': 'warning',
                    'message': f'Elevated failure rate: {failure_rate:.1f}% in last hour',
                    'timestamp': datetime.datetime.utcnow().isoformat()
                })
        
        return jsonify(alerts)
    except Exception as e:
        print(f"Error in alerts: {e}")
        return jsonify([])
    finally:
        session.close()

# ============================================================================
# SIGNALWIRE DIRECT FETCH (for real-time data)
# ============================================================================

@app.route('/api/sync/trigger')
@requires_auth
def trigger_sync():
    """
    Trigger a sync from SignalWire API.
    This pulls recent messages directly from SignalWire and stores them.
    Supports pagination to fetch multiple pages.
    """
    import requests
    from requests.auth import HTTPBasicAuth
    
    PROJECT_ID = os.getenv('SIGNALWIRE_PROJECT_ID')
    AUTH_TOKEN = os.getenv('SIGNALWIRE_AUTH_TOKEN')
    SPACE_URL = os.getenv('SIGNALWIRE_SPACE_URL', '')
    
    if not all([PROJECT_ID, AUTH_TOKEN, SPACE_URL]):
        return jsonify({'error': 'SignalWire credentials not configured'}), 500
    
    # Clean up space URL
    space = SPACE_URL.replace('https://', '').replace('http://', '').rstrip('/')
    base_url = f"https://{space}/api/laml/2010-04-01/Accounts/{PROJECT_ID}/Messages.json"
    
    hours = int(request.args.get('hours', 1))
    
    # Calculate date range - use proper datetime format
    start_time = datetime.datetime.utcnow() - timedelta(hours=hours)
    
    try:
        auth = HTTPBasicAuth(PROJECT_ID, AUTH_TOKEN)
        all_messages = []
        next_page_uri = None
        page_count = 0
        # No artificial limit - fetch ALL messages in the time range
        # Set very high safety limit (500k messages = 5000 pages)
        max_pages = 5000
        
        # Initial request - SignalWire API uses DateSent> with YYYY-MM-DD format
        # Note: This filters by date, not exact time, so we may get messages slightly before the exact hour mark
        params = {
            'PageSize': 100,
            'DateSent>': start_time.strftime('%Y-%m-%d')
        }
        
        while page_count < max_pages:
            if next_page_uri:
                # Use the full next_page_uri for pagination
                full_url = f"https://{space}{next_page_uri}"
                response = requests.get(full_url, auth=auth, timeout=60)
            else:
                response = requests.get(base_url, auth=auth, params=params, timeout=60)
            
            response.raise_for_status()
            data = response.json()
            
            messages = data.get('messages', [])
            if not messages:
                break
            
            all_messages.extend(messages)
            page_count += 1
            
            # Check for next page
            next_page_uri = data.get('next_page_uri')
            if not next_page_uri:
                break
            
            # Safety check - if we hit max pages, warn user
            if page_count >= max_pages:
                print(f"Warning: Hit max_pages limit ({max_pages}). There may be more messages to fetch.")
                break
        
        saved_count = 0
        skipped_count = 0
        hit_limit = page_count >= max_pages
        
        if MODELS_AVAILABLE and all_messages:
            session = Session()
            try:
                # Get existing IDs in bulk
                sids = [msg['sid'] for msg in all_messages]
                existing_ids = set(
                    row[0] for row in session.query(SMSLog.id).filter(SMSLog.id.in_(sids)).all()
                )
                
                for msg in all_messages:
                    if msg['sid'] in existing_ids:
                        skipped_count += 1
                        continue
                        
                    try:
                        log = SMSLog(
                            id=msg['sid'],
                            date_created=datetime.datetime.fromisoformat(msg['date_created'].replace('Z', '+00:00')) if msg.get('date_created') else None,
                            date_sent=datetime.datetime.fromisoformat(msg['date_sent'].replace('Z', '+00:00')) if msg.get('date_sent') else None,
                            to_number=msg.get('to'),
                            from_number=msg.get('from'),
                            status=msg.get('status'),
                            error_code=int(msg['error_code']) if msg.get('error_code') else None,
                            error_message=msg.get('error_message'),
                            direction=msg.get('direction'),
                            body=msg.get('body'),
                            price=float(msg['price']) if msg.get('price') else 0
                        )
                        session.add(log)
                        saved_count += 1
                    except Exception as e:
                        print(f"Error parsing message {msg['sid']}: {e}")
                
                session.commit()
            except Exception as e:
                session.rollback()
                print(f"Error saving messages: {e}")
                return jsonify({'error': f'Database error: {str(e)}'}), 500
            finally:
                session.close()
        
        message = f'Fetched {len(all_messages):,} messages from {page_count} pages, saved {saved_count:,} new (skipped {skipped_count:,} existing)'
        if hit_limit:
            message += f'. WARNING: Hit page limit ({max_pages} pages). There may be more messages - consider syncing in smaller time windows.'
        
        return jsonify({
            'success': True,
            'fetched': len(all_messages),
            'saved': saved_count,
            'skipped': skipped_count,
            'pages': page_count,
            'hit_limit': hit_limit,
            'message': message
        })
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'SignalWire API error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/db/stats')
@requires_auth  
def get_db_stats():
    """Get database statistics"""
    if not MODELS_AVAILABLE:
        return jsonify({'error': 'Database not available'}), 503
    
    session = Session()
    try:
        total = session.execute(text("SELECT COUNT(*) FROM sms_logs")).scalar()
        oldest = session.execute(text("SELECT MIN(date_created) FROM sms_logs")).scalar()
        newest = session.execute(text("SELECT MAX(date_created) FROM sms_logs")).scalar()
        
        return jsonify({
            'total_messages': total,
            'oldest_message': oldest.isoformat() if oldest else None,
            'newest_message': newest.isoformat() if newest else None
        })
    finally:
        session.close()

# ============================================================================
# STARTUP
# ============================================================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"Starting SignalWire Dashboard on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
