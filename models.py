from sqlalchemy import create_engine, Column, String, Integer, DateTime, Float, Index, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

Base = declarative_base()

class SMSLog(Base):
    __tablename__ = 'sms_logs'

    # Using Message SID as primary key is natural for SignalWire
    id = Column(String(34), primary_key=True) 
    
    # Core timestamps - Indexed for time-series queries
    date_created = Column(DateTime, nullable=False)
    date_sent = Column(DateTime, nullable=True)
    
    # Phone numbers - Indexed for search
    to_number = Column(String(20), nullable=True)
    from_number = Column(String(20), nullable=True)
    
    # Status tracking - Low cardinality, good for bitmap index but B-tree standard here
    status = Column(String(20), nullable=False, server_default='queued') 
    
    # Error tracking
    error_code = Column(Integer, nullable=True)
    error_message = Column(String, nullable=True)
    
    # Metadata
    direction = Column(String(20), nullable=True)
    price = Column(Float, nullable=True, server_default="0.0")
    body = Column(String, nullable=True)

    # Indexes for high-performance reporting
    __table_args__ = (
        # Compound index for the most common query: "Status count by date"
        Index('idx_date_status', 'date_created', 'status'),
        # Index for error reporting
        Index('idx_error_code', 'error_code'),
        # Index for fast lookups by phone number
        Index('idx_to_number', 'to_number'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'date_created': self.date_created.isoformat() if self.date_created else None,
            'date_sent': self.date_sent.isoformat() if self.date_sent else None,
            'to_number': self.to_number,
            'from_number': self.from_number,
            'status': self.status,
            'error_code': self.error_code,
            'error_message': self.error_message,
            'direction': self.direction,
            'body': self.body
        }

# Database Connection
# We use environment variables for connection string to work with Docker
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@db:5432/signalwire_db')

# Lazy engine creation - only create when needed
_engine = None
_Session = None

def get_engine():
    """Get or create database engine (lazy initialization)"""
    global _engine
    if _engine is None:
        try:
            _engine = create_engine(
                DATABASE_URL,
                pool_size=10,  # Reduced for Railway
                max_overflow=5,
                pool_pre_ping=True,
                connect_args={'connect_timeout': 10}  # 10 second timeout
            )
        except Exception as e:
            print(f"Error creating database engine: {e}")
            raise
    return _engine

def get_session():
    """Get or create session factory (lazy initialization)"""
    global _Session
    if _Session is None:
        _Session = sessionmaker(bind=get_engine())
    return _Session

# For backward compatibility
def Session():
    return get_session()()

# Create engine and session on first import (but handle errors gracefully)
try:
    engine = get_engine()
    Session = get_session()
except Exception as e:
    print(f"Warning: Could not initialize database on import: {e}")
    print("Database will be initialized on first use.")
    engine = None
    Session = None

def init_db():
    """Initialize database tables"""
    try:
        eng = get_engine()
        Base.metadata.create_all(eng)
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Error initializing database: {e}")
        raise
