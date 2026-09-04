from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.database.base import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String) # ACCIDENT, TRAFFIC_JAM, ROAD_BLOCK
    latitude = Column(Float)
    longitude = Column(Float)
    severity = Column(String) # LOW, MEDIUM, HIGH, CRITICAL
    description = Column(String)
    status = Column(String) # ACTIVE, RESOLVED
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
