from sqlalchemy import Column, Integer, String, Float
from app.database.base import Base

class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    icu_beds = Column(Integer)
    available_icu = Column(Integer)
    emergency_capacity = Column(Integer)
    available_emergency_capacity = Column(Integer)
    specialist_availability = Column(String) # JSON or Comma separated
    status = Column(String) # AVAILABLE, BUSY, FULL
