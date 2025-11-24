web: gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app
worker: celery -A tasks.celery worker --loglevel=info

