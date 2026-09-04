from pydantic import BaseModel
from typing import Optional

class SignalBase(BaseModel):
    intersection_name: str
    latitude: float
    longitude: float
    current_state: str
    cycle_time: int
    priority_status: bool

class SignalCreate(SignalBase):
    pass

class SignalUpdate(BaseModel):
    current_state: Optional[str] = None
    priority_status: Optional[bool] = None

class Signal(SignalBase):
    id: int

    class Config:
        from_attributes = True
