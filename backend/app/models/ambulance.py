from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.database.base import Base

class Ambulance(Base):
    __tablename__ = "ambulances"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String, unique=True, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String) # ACTIVE, IDLE, EN_ROUTE
    emergency_priority = Column(String) # CRITICAL, HIGH, MEDIUM, LOW
    patient_condition = Column(String)
    destination_hospital_id = Column(Integer, nullable=True)
    current_eta = Column(Float, nullable=True) # minutes
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
