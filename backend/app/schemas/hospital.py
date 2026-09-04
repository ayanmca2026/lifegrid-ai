from pydantic import BaseModel
from typing import Optional

class HospitalBase(BaseModel):
    name: str
    latitude: float
    longitude: float
    icu_beds: int
    available_icu: int
    emergency_capacity: int
    available_emergency_capacity: int
    specialist_availability: str
    status: str

class HospitalCreate(HospitalBase):
    pass

class Hospital(HospitalBase):
    id: int

    class Config:
        from_attributes = True
