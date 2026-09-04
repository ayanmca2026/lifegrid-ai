from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AmbulanceBase(BaseModel):
    vehicle_number: str
    latitude: float
    longitude: float
    status: str
    emergency_priority: str
    patient_condition: str
    destination_hospital_id: Optional[int] = None
    current_eta: Optional[float] = None

class AmbulanceCreate(AmbulanceBase):
    pass

class AmbulanceUpdate(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    current_eta: Optional[float] = None
    speed: Optional[float] = None
    distance_km: Optional[float] = None

class Ambulance(AmbulanceBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
