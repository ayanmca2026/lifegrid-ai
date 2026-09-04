from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.database.base import Base

class GreenCorridor(Base):
    __tablename__ = "green_corridors"

    id = Column(Integer, primary_key=True, index=True)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id"))
    signal_id = Column(Integer, ForeignKey("signals.id"))
    priority_start = Column(DateTime)
    priority_end = Column(DateTime)
    status = Column(String) # SCHEDULED, ACTIVE, COMPLETED
