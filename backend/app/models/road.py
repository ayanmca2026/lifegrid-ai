from sqlalchemy import Column, Integer, String, Float
from app.database.base import Base

class Road(Base):
    __tablename__ = "roads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    start_lat = Column(Float)
    start_lng = Column(Float)
    end_lat = Column(Float)
    end_lng = Column(Float)
    speed_limit = Column(Float) # km/h
    road_condition = Column(String) # GOOD, FAIR, POOR
    risk_score = Column(Float, default=0.0)
