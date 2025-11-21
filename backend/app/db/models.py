"""
Database models
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Float, JSON
from sqlalchemy.sql import func
from app.db.database import Base

class Meeting(Base):
    """Meeting model compatible with current app logic"""
    __tablename__ = "meetings"
    
    id = Column(String, primary_key=True, index=True)  # UUID
    title = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    duration = Column(Integer, default=0)
    language = Column(String, default="en")
    confidence = Column(Float, default=0.0)
    audio_format = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Extra fields for future compatibility
    key_points = Column(JSON, nullable=True)
    action_items = Column(JSON, nullable=True)
