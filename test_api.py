#!/usr/bin/env python3
"""Test API endpoints locally"""
from app import app

def test_endpoint(client, path):
    print(f"\n{'='*50}")
    print(f"Testing: {path}")
    print('='*50)
    response = client.get(path)
    print(f"Status: {response.status_code}")
    data = response.get_json()
    if data:
        import json
        print(f"Data: {json.dumps(data, indent=2, default=str)[:500]}...")
    else:
        print("No data returned")

with app.test_client() as client:
    test_endpoint(client, '/api/stats/overview')
    test_endpoint(client, '/api/stats/errors')
    test_endpoint(client, '/api/stats/optouts')
    test_endpoint(client, '/api/stats/latency')
    test_endpoint(client, '/api/logs_dt?draw=1&start=0&length=5')

