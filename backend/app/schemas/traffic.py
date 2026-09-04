from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TrafficBase(BaseModel):
    road_id: int
    vehicle_count: int
    average_speed: float
    density: float
    congestion_level: str

class TrafficCreate(TrafficBase):
    pass

class Traffic(TrafficBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
