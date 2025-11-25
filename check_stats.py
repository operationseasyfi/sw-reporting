#!/usr/bin/env python3
"""Quick script to check database stats"""
from models import Session, SMSLog
from sqlalchemy import func

session = Session()

print("=== DATABASE STATS ===")
print(f"Total messages: {session.query(SMSLog).count()}")
print()

# Status breakdown
statuses = session.query(SMSLog.status, func.count(SMSLog.id)).group_by(SMSLog.status).all()
print("Status breakdown:")
for status, count in statuses:
    print(f"  {status}: {count}")

print()

# Direction breakdown
directions = session.query(SMSLog.direction, func.count(SMSLog.id)).group_by(SMSLog.direction).all()
print("Direction breakdown:")
for direction, count in directions:
    print(f"  {direction}: {count}")

print()

# Total spend
total_spend = session.query(func.sum(SMSLog.price)).scalar() or 0
print(f"Total spend: ${total_spend:.2f}")

# Error codes
errors = session.query(SMSLog.error_code, func.count(SMSLog.id)).filter(SMSLog.error_code.isnot(None)).group_by(SMSLog.error_code).order_by(func.count(SMSLog.id).desc()).limit(10).all()
if errors:
    print()
    print("Top error codes:")
    for code, count in errors:
        print(f"  Error {code}: {count}")

session.close()

