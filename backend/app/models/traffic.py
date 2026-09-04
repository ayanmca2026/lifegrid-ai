from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String
from datetime import datetime
from app.database.base import Base

class Traffic(Base):
    __tablename__ = "traffic"

    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(Integer, ForeignKey("roads.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    vehicle_count = Column(Integer)
    average_speed = Column(Float)
    density = Column(Float) # 0.0 to 1.0
    congestion_level = Column(String) # LOW, MODERATE, HIGH, SEVERE
