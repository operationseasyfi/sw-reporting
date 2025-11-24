#!/usr/bin/env python3
"""Start script for Railway deployment"""
import os
import sys

port = os.getenv('PORT', '5000')

# Start gunicorn
os.execvp('gunicorn', [
    'gunicorn',
    '--bind', f'0.0.0.0:{port}',
    '--workers', '2',
    '--timeout', '120',
    'app:app'
])

