from sqlalchemy import Column, Integer, String, Float, Boolean
from app.database.base import Base

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    intersection_name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    current_state = Column(String) # RED, GREEN, YELLOW
    cycle_time = Column(Integer) # seconds
    priority_status = Column(Boolean, default=False)
