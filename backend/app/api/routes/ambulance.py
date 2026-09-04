from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.models.ambulance import Ambulance
from app.schemas.ambulance import Ambulance as AmbulanceSchema, AmbulanceCreate, AmbulanceUpdate
from app.services.orchestrator import start_emergency as orchestrator_start_emergency
from app.api.websocket import manager
import asyncio

router = APIRouter(prefix="/ambulances", tags=["ambulances"])

def broadcast_update(message: dict):
    asyncio.run(manager.broadcast(message))

@router.get("/", response_model=List[AmbulanceSchema])
def read_ambulances(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Ambulance).offset(skip).limit(limit).all()

@router.get("/{id}", response_model=AmbulanceSchema)
def read_ambulance(id: int, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.id == id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    return ambulance

@router.post("/", response_model=AmbulanceSchema)
def create_ambulance(ambulance: AmbulanceCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_ambulance = Ambulance(**ambulance.model_dump())
    db.add(db_ambulance)
    db.commit()
    db.refresh(db_ambulance)
    return db_ambulance

@router.patch("/{id}/location", response_model=AmbulanceSchema)
def update_ambulance_location(id: int, ambulance_update: AmbulanceUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_ambulance = db.query(Ambulance).filter(Ambulance.id == id).first()
    if not db_ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    update_data = ambulance_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_ambulance, key, value)

    db.commit()
    db.refresh(db_ambulance)

    background_tasks.add_task(broadcast_update, {
        "event": "ambulance_update",
        "ambulance_id": db_ambulance.id,
        "vehicle_number": db_ambulance.vehicle_number,
        "latitude": db_ambulance.latitude,
        "longitude": db_ambulance.longitude,
        "status": db_ambulance.status,
        "eta": db_ambulance.current_eta
    })
    return db_ambulance

@router.post("/{id}/start_emergency")
def start_emergency(id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    result = orchestrator_start_emergency(id, db)

    background_tasks.add_task(broadcast_update, {
        "event": "emergency_started",
        "ambulance_id": result["ambulance_id"],
        "hospital_name": result["hospital_name"],
        "route": result["route"],
        "eta": result["eta"]
    })

    return result
