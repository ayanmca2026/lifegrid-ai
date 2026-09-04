from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.models.incident import Incident
from app.schemas.incident import Incident as IncidentSchema, IncidentCreate, IncidentUpdate
from app.services.orchestrator import handle_incident
from app.api.websocket import manager
import asyncio

router = APIRouter(prefix="/incidents", tags=["incidents"])

def broadcast_update(message: dict):
    asyncio.run(manager.broadcast(message))

@router.get("/", response_model=List[IncidentSchema])
def read_incidents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Incident).offset(skip).limit(limit).all()

@router.post("/", response_model=IncidentSchema)
def create_incident(incident: IncidentCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_incident = Incident(**incident.model_dump())
    db.add(db_incident)
    db.commit()
    db.refresh(db_incident)

    # Trigger orchestrator dynamic rerouting
    reroutes = handle_incident(db_incident.id, db)

    background_tasks.add_task(broadcast_update, {
        "event": "incident_created",
        "incident_id": db_incident.id,
        "latitude": db_incident.latitude,
        "longitude": db_incident.longitude,
        "severity": db_incident.severity
    })

    # Broadcast reroute events
    for r in reroutes:
        background_tasks.add_task(broadcast_update, {
            "event": "route_updated",
            "ambulance_id": r["ambulance_id"],
            "old_eta": r["old_eta"],
            "new_eta": r["new_eta"],
            "route": r["route"]
        })

    return db_incident

@router.patch("/{id}", response_model=IncidentSchema)
def update_incident(id: int, incident_update: IncidentUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_incident = db.query(Incident).filter(Incident.id == id).first()
    if not db_incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    update_data = incident_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_incident, key, value)

    db.commit()
    db.refresh(db_incident)

    if db_incident.status == "RESOLVED":
        background_tasks.add_task(broadcast_update, {
            "event": "incident_resolved",
            "incident_id": db_incident.id
        })

    return db_incident
