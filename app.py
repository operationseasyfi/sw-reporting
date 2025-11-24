from flask import Flask, render_template, jsonify, request, send_from_directory, send_from_directory
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert
import datetime
import os
from datetime import timedelta

app = Flask(__name__, static_folder='frontend/dist', template_folder='frontend/dist')

# Import models with error handling
try:
    from models import Session, SMSLog, get_engine
    MODELS_AVAILABLE = True
except Exception as e:
    print(f"Warning: Could not import models: {e}")
    MODELS_AVAILABLE = False
    Session = None
    SMSLog = None

# Try to import Celery tasks (optional - works without it)
try:
    from tasks import process_webhook_event, sync_historical_data, celery
    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False
    print("Celery not available - webhooks will be processed synchronously")

def process_webhook_sync(data):
    """
    Synchronous webhook processor (works without Celery/Redis).
    Handles real-time status updates from SignalWire DLR Webhooks.
    """
    if not MODELS_AVAILABLE:
        print("Error: Models not available, cannot process webhook")
        return
    
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
        date_created = datetime.datetime.utcnow()
        date_sent = None
        
        # Try to parse DateCreated if provided
        date_created_str = data.get('DateCreated')
        if date_created_str:
            try:
                from datetime import datetime as dt_parse
                try:
                    date_created = dt_parse.strptime(date_created_str, '%a, %d %b %Y %H:%M:%S %z')
                except:
                    date_created = datetime.datetime.utcnow()
            except:
                pass
        
        # Set date_sent if status indicates sent
        if status in ['sent', 'delivered', 'failed', 'undelivered']:
            date_sent = datetime.datetime.utcnow()
        
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
    finally:
        session.close()

def check_db():
    """Check if database is available"""
    if not MODELS_AVAILABLE:
        return False, "Database not available"
    try:
        from models import get_engine
        engine = get_engine()
        # Try a simple connection test
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:
        return False, str(e)

@app.route('/')
def index():
    """Serve React app"""
    return send_from_directory('frontend/dist', 'index.html')

@app.route('/<path:path>')
def serve_react(path):
    """Serve React static files"""
    if path.startswith('api/') or path.startswith('webhooks/'):
        # Don't interfere with API routes
        return None
    try:
        return send_from_directory('frontend/dist', path)
    except:
        # Fallback to index.html for React Router
        return send_from_directory('frontend/dist', 'index.html')

@app.route('/health')
def health_check():
    """Health check endpoint for Railway"""
    db_ok, db_error = check_db()
    return jsonify({
        'status': 'ok' if db_ok else 'error',
        'database': 'connected' if db_ok else f'error: {db_error}',
        'models_available': MODELS_AVAILABLE
    }), 200 if db_ok else 503

@app.route('/webhooks/signalwire', methods=['POST'])
def signalwire_webhook():
    """
    Webhook endpoint for SignalWire DLR notifications.
    Works with or without Celery - processes synchronously if Celery unavailable.
    """
    data = request.form.to_dict()
    
    # Try Celery if available, otherwise process directly
    if CELERY_AVAILABLE:
        try:
            process_webhook_event.delay(data)
            return '', 200
        except Exception:
            # Fallback to sync if Celery fails
            process_webhook_sync(data)
            return '', 200
    else:
        # Process synchronously
        process_webhook_sync(data)
        return '', 200

@app.route('/api/trigger-sync', methods=['POST'])
def trigger_sync():
    """Manually trigger historical sync via API"""
    if not CELERY_AVAILABLE:
        return jsonify({'status': 'Sync not available - Celery not configured'}), 503
    
    days = request.json.get('days', 30)
    try:
        sync_historical_data.delay(days_back=days)
        return jsonify({'status': 'Sync started in background'}), 202
    except Exception as e:
        return jsonify({'status': f'Sync failed: {str(e)}'}), 500

@app.route('/api/sync-status')
def sync_status():
    """
    Check if any sync tasks are currently running.
    """
    if not CELERY_AVAILABLE:
        return jsonify({'syncing': False})
    
    try:
        i = celery.control.inspect()
        active = i.active()
        
        is_syncing = False
        if active:
            for worker, tasks in active.items():
                for task in tasks:
                    if 'sync_historical_data' in task['name']:
                        is_syncing = True
                        break
        
        return jsonify({'syncing': is_syncing})
    except Exception:
        return jsonify({'syncing': False})

@app.route('/api/stats/timeseries')
def get_timeseries_stats():
    """
    Returns aggregated messages per day for charting.
    """
    if not MODELS_AVAILABLE:
        return jsonify({}), 503
    
    session = Session()
    try:
        # Filter for last 30 days
        cutoff = datetime.datetime.utcnow() - timedelta(days=30)
        
        results = session.query(
            func.date_trunc('day', SMSLog.date_created).label('day'),
            SMSLog.status,
            func.count(SMSLog.id)
        ).filter(
            SMSLog.date_created >= cutoff
        ).group_by('day', SMSLog.status).all()
        
        data = {}
        for date_val, status, count in results:
            if not date_val: continue
            d_str = date_val.strftime('%Y-%m-%d')
            if d_str not in data:
                data[d_str] = {'delivered': 0, 'failed': 0, 'undelivered': 0, 'total': 0}
            
            status_lower = status.lower()
            data[d_str]['total'] += count
            
            if status_lower in ['delivered', 'sent']:
                data[d_str]['delivered'] += count
            elif status_lower in ['failed']:
                data[d_str]['failed'] += count
            elif status_lower in ['undelivered']:
                data[d_str]['undelivered'] += count
                
        return jsonify(data)
    except Exception as e:
        print(f"Error in timeseries: {e}")
        return jsonify({})
    finally:
        session.close()

@app.route('/api/stats/errors')
def get_error_stats():
    session = Session()
    try:
        # Top 10 Error Codes
        results = session.query(
            SMSLog.error_code, func.count(SMSLog.id)
        ).filter(
            SMSLog.error_code != None
        ).group_by(SMSLog.error_code)\
         .order_by(func.count(SMSLog.id).desc()).limit(10).all()
         
        return jsonify([{'code': r[0], 'count': r[1]} for r in results])
    finally:
        session.close()

@app.route('/api/alerts')
def get_alerts():
    """
    Generates real-time alerts based on recent traffic (last 15-60 mins).
    """
    session = Session()
    alerts = []
    try:
        # Time window: Last 15 minutes
        now = datetime.datetime.utcnow()
        window_start = now - timedelta(minutes=15)
        
        # 1. Check Failure Rates by Carrier (implied by network prefix or just global for now)
        # Grouping by 'status' for recent messages
        stats = session.query(
            SMSLog.status, func.count(SMSLog.id)
        ).filter(
            SMSLog.date_created >= window_start
        ).group_by(SMSLog.status).all()
        
        total = 0
        failed = 0
        for status, count in stats:
            total += count
            if status and status.lower() in ['failed', 'undelivered']:
                failed += count
                
        if total > 10: # Minimum volume to alert
            failure_rate = (failed / total) * 100
            if failure_rate > 5: # Threshold: 5%
                alerts.append({
                    'id': 'alert-fail-rate',
                    'title': 'High Failure Rate Detected',
                    'description': f'Failure rate is {failure_rate:.1f}% in the last 15 mins ({failed}/{total} messages).',
                    'severity': 'critical' if failure_rate > 15 else 'warning',
                    'timestamp': 'Just now',
                    'active': True
                })

        # 2. Check Latency (if we had a latency column, we would check it here)
        # For now, we can check for high volume of "queued" messages which implies latency
        queued_count = session.query(func.count(SMSLog.id)).filter(
            SMSLog.status == 'queued',
            SMSLog.date_created < (now - timedelta(minutes=5)) # Queued for > 5 mins
        ).scalar()

        if queued_count and queued_count > 50:
             alerts.append({
                    'id': 'alert-queue-backup',
                    'title': 'Queue Processing Delay',
                    'description': f'{queued_count} messages have been queued for more than 5 minutes.',
                    'severity': 'warning',
                    'timestamp': 'Just now',
                    'active': True
                })

        return jsonify(alerts)
    except Exception as e:
        print(f"Alert Error: {e}")
        return jsonify([])
    finally:
        session.close()

@app.route('/api/stats/carriers')
def get_carrier_stats():
    """
    Returns carrier statistics for the last 24 hours.
    Note: Carrier detection from phone numbers is simplified.
    """
    session = Session()
    try:
        # Last 24 hours
        cutoff = datetime.datetime.utcnow() - timedelta(hours=24)
        
        # Get all messages in last 24h
        messages = session.query(SMSLog).filter(
            SMSLog.date_created >= cutoff
        ).all()
        
        # Simple carrier detection from phone number prefix
        # This is a simplified version - you may want to use a proper carrier lookup service
        carrier_map = {
            'verizon': ['+1'],
            'att': ['+1'],
            't-mobile': ['+1'],
        }
        
        # Aggregate by status
        stats = {}
        for msg in messages:
            # Simplified: use first 3 digits of to_number for carrier detection
            # In production, use a proper carrier lookup API
            carrier = 'Unknown'
            if msg.to_number:
                # Very basic detection - you should use a proper service
                if msg.to_number.startswith('+1'):
                    carrier = 'US Carrier'  # Generic for now
            
            if carrier not in stats:
                stats[carrier] = {
                    'total': 0,
                    'delivered': 0,
                    'failed': 0,
                    'undelivered': 0
                }
            
            stats[carrier]['total'] += 1
            status_lower = (msg.status or '').lower()
            if status_lower in ['delivered', 'sent']:
                stats[carrier]['delivered'] += 1
            elif status_lower == 'failed':
                stats[carrier]['failed'] += 1
            elif status_lower == 'undelivered':
                stats[carrier]['undelivered'] += 1
        
        # Format response
        result = []
        for carrier_name, data in stats.items():
            delivery_rate = (data['delivered'] / data['total'] * 100) if data['total'] > 0 else 0
            result.append({
                'name': carrier_name,
                'deliveryRate': round(delivery_rate, 1),
                'volume': data['total'],
                'status': 'operational' if delivery_rate > 95 else 'degraded' if delivery_rate > 90 else 'critical'
            })
        
        return jsonify(result)
    except Exception as e:
        print(f"Error in carrier stats: {e}")
        return jsonify([])
    finally:
        session.close()

@app.route('/api/stats/latency')
def get_latency_stats():
    """
    Returns latency statistics (simplified - calculates from timestamps).
    """
    session = Session()
    try:
        # Last 24 hours, grouped by hour
        cutoff = datetime.datetime.utcnow() - timedelta(hours=24)
        
        messages = session.query(SMSLog).filter(
            SMSLog.date_created >= cutoff,
            SMSLog.date_sent != None
        ).all()
        
        # Calculate latency (date_sent - date_created) in milliseconds
        latencies = []
        for msg in messages:
            if msg.date_created and msg.date_sent:
                delta = (msg.date_sent - msg.date_created).total_seconds() * 1000
                if delta > 0 and delta < 60000:  # Reasonable range: 0-60 seconds
                    latencies.append(delta)
        
        if not latencies:
            return jsonify({
                'p50': 0,
                'p95': 0,
                'p99': 0,
                'avg': 0,
                'distribution': []
            })
        
        latencies.sort()
        n = len(latencies)
        
        p50 = latencies[int(n * 0.5)]
        p95 = latencies[int(n * 0.95)] if n > 20 else latencies[-1]
        p99 = latencies[int(n * 0.99)] if n > 100 else latencies[-1]
        avg = sum(latencies) / n
        
        # Hourly distribution (last 24 hours)
        hourly_data = {}
        for msg in messages:
            if msg.date_created:
                hour_key = msg.date_created.strftime('%H:00')
                if hour_key not in hourly_data:
                    hourly_data[hour_key] = []
                if msg.date_created and msg.date_sent:
                    delta = (msg.date_sent - msg.date_created).total_seconds() * 1000
                    if 0 < delta < 60000:
                        hourly_data[hour_key].append(delta)
        
        distribution = []
        for hour in sorted(hourly_data.keys()):
            hour_latencies = hourly_data[hour]
            if hour_latencies:
                hour_latencies.sort()
                n_hour = len(hour_latencies)
                distribution.append({
                    'time': hour,
                    'p50': hour_latencies[int(n_hour * 0.5)],
                    'p95': hour_latencies[int(n_hour * 0.95)] if n_hour > 20 else hour_latencies[-1],
                    'p99': hour_latencies[int(n_hour * 0.99)] if n_hour > 100 else hour_latencies[-1]
                })
        
        return jsonify({
            'p50': round(p50, 0),
            'p95': round(p95, 0),
            'p99': round(p99, 0),
            'avg': round(avg, 0),
            'distribution': distribution
        })
    except Exception as e:
        print(f"Error in latency stats: {e}")
        return jsonify({
            'p50': 0,
            'p95': 0,
            'p99': 0,
            'avg': 0,
            'distribution': []
        })
    finally:
        session.close()

@app.route('/api/logs_dt')
def get_logs_datatable():
    """
    Server-side processing for DataTables.
    """
    session = Session()
    try:
        draw = int(request.args.get('draw', 1))
        start = int(request.args.get('start', 0))
        length = int(request.args.get('length', 10))
        search_value = request.args.get('search[value]', '')
        
        query = session.query(SMSLog)
        
        if search_value:
            query = query.filter(
                (SMSLog.to_number.ilike(f'%{search_value}%')) |
                (SMSLog.from_number.ilike(f'%{search_value}%')) |
                (SMSLog.id.ilike(f'%{search_value}%'))
            )
            
        total_filtered = query.count()
        
        # Sort by date desc default
        query = query.order_by(SMSLog.date_created.desc())
        
        logs = query.offset(start).limit(length).all()
        
        data = [log.to_dict() for log in logs]
        
        return jsonify({
            "draw": draw,
            "recordsTotal": session.query(SMSLog).count(),
            "recordsFiltered": total_filtered,
            "data": data
        })
    except Exception as e:
        print(f"Error in logs_dt: {e}")
        return jsonify({
            "draw": 1,
            "recordsTotal": 0,
            "recordsFiltered": 0,
            "data": [],
            "error": str(e)
        })
    finally:
        session.close()

if __name__ == '__main__':
    # Use PORT from environment (for production) or default to 5000
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)
