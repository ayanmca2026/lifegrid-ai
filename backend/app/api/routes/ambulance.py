from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database.connection import get_db
from app.models.ambulance import Ambulance
from app.models.hospital import Hospital
from app.schemas.ambulance import Ambulance as AmbulanceSchema, AmbulanceCreate, AmbulanceUpdate
from app.services.orchestrator import start_emergency as orchestrator_start_emergency
from app.api.websocket import dispatch_event

router = APIRouter(prefix="/ambulances", tags=["ambulances"])

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
def create_ambulance(ambulance: AmbulanceCreate, db: Session = Depends(get_db)):
    db_ambulance = Ambulance(**ambulance.model_dump())
    db.add(db_ambulance)
    db.commit()
    db.refresh(db_ambulance)
    return db_ambulance

@router.patch("/{id}/location", response_model=AmbulanceSchema)
def update_ambulance_location(id: int, ambulance_update: AmbulanceUpdate, db: Session = Depends(get_db)):
    db_ambulance = db.query(Ambulance).filter(Ambulance.id == id).first()
    if not db_ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    
    prev_status = db_ambulance.status
    update_data = ambulance_update.model_dump(exclude_unset=True)
    
    speed = update_data.pop("speed", 48.0)
    distance_km = update_data.pop("distance_km", 0.0)

    for key, value in update_data.items():
        setattr(db_ambulance, key, value)
        
    db.commit()
    db.refresh(db_ambulance)
    
    dispatch_event({
        "event": "ambulance_update",
        "ambulance_id": db_ambulance.id,
        "vehicle_number": db_ambulance.vehicle_number,
        "latitude": db_ambulance.latitude,
        "longitude": db_ambulance.longitude,
        "status": db_ambulance.status,
        "eta": db_ambulance.current_eta,
        "speed": speed,
        "distance_km": distance_km
    })

    # Check if arrived / emergency completed
    if prev_status == "EN_ROUTE" and db_ambulance.status == "IDLE":
        hospital = None
        if db_ambulance.destination_hospital_id:
            hospital = db.query(Hospital).filter(Hospital.id == db_ambulance.destination_hospital_id).first()
        hosp_name = hospital.name if hospital else "City Hospital"

        dispatch_event({
            "event": "emergency_completed",
            "ambulance_id": db_ambulance.id,
            "vehicle_number": db_ambulance.vehicle_number,
            "status": "SUCCESS",
            "arrival_time": datetime.now().strftime("%H:%M:%S"),
            "hospital_name": hosp_name,
            "time_saved": "4.2 min",
            "route_changes": 1,
            "signals_optimized": 6
        })

    return db_ambulance

@router.post("/{id}/start_emergency")
def start_emergency(id: int, priority: str = "CRITICAL", db: Session = Depends(get_db)):
    result = orchestrator_start_emergency(id, db, priority=priority)
    if not result:
        raise HTTPException(status_code=404, detail="Ambulance not found")
        
    dispatch_event({
        "event": "emergency_started",
        "ambulance_id": result["ambulance_id"],
        "vehicle_number": result.get("vehicle_number", "A102"),
        "priority": result.get("priority", priority),
        "hospital_name": result["hospital_name"],
        "hospital_score": result.get("hospital_score", 95),
        "hospital_reasons": result.get("hospital_reasons", []),
        "route": result["route"],
        "distance_km": result.get("distance_km", 4.2),
        "eta": result["eta"],
        "signals_prioritized": result.get("signals_prioritized", 3)
    })
    
    return result
