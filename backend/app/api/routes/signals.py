from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.models.signal import Signal
from app.schemas.signal import Signal as SignalSchema, SignalUpdate

router = APIRouter(prefix="/signals", tags=["signals"])

@router.get("/", response_model=List[SignalSchema])
def read_signals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Signal).offset(skip).limit(limit).all()

@router.post("/priority")
def set_signal_priority(signal_ids: List[int], db: Session = Depends(get_db)):
    # TODO: Actual Green Corridor Engine logic
    signals = db.query(Signal).filter(Signal.id.in_(signal_ids)).all()
    for signal in signals:
        signal.priority_status = True
        signal.current_state = "GREEN"
    db.commit()
    return {"message": "Priority set for signals", "count": len(signals)}
