"""
Database configuration and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL

# Create engine
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}  # SQLite specific
    )
else:
    engine = create_engine(DATABASE_URL)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and run safe migrations"""
    from app.models import user, voice_profile, chat_history  # noqa: import models for create_all
    from app.database import Base, engine
    Base.metadata.create_all(bind=engine)

    # Safe migration: add new columns if they don't exist (SQLite compatible)
    with engine.connect() as conn:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        existing_cols = [col['name'] for col in inspector.get_columns('users')]

        if 'tts_generation_count' not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN tts_generation_count INTEGER DEFAULT 0"))
            conn.commit()

        if 'document_processed_count' not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN document_processed_count INTEGER DEFAULT 0"))
            conn.commit()

        if 'avatar_url' not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))
            conn.commit()
