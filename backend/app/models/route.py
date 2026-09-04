from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String
from datetime import datetime
from app.database.base import Base

class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id"))
    source = Column(String) # lat,lng
    destination = Column(String) # lat,lng
    distance = Column(Float) # km
    estimated_time = Column(Float) # minutes
    risk_score = Column(Float)
    route_status = Column(String) # ACTIVE, COMPLETED, ABORTED
    created_at = Column(DateTime, default=datetime.utcnow)
