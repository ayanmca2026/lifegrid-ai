from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.ambulance import Ambulance
from app.models.incident import Incident
from app.models.route import Route
from app.models.hospital import Hospital

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    active_ambulances = db.query(Ambulance).filter(Ambulance.status == "EN_ROUTE").count()
    active_incidents = db.query(Incident).filter(Incident.status == "ACTIVE").count()
    active_routes = db.query(Route).filter(Route.route_status == "ACTIVE").all()
    
    avg_eta = 0.0
    if active_routes:
        avg_eta = round(sum(r.estimated_time for r in active_routes) / len(active_routes), 1)
    
    green_corridors = len(active_routes)
    time_saved = round(len(active_routes) * 3.8, 1) if active_routes else 0.0

    return {
        "active_ambulances": active_ambulances,
        "active_emergencies": len(active_routes),
        "active_incidents": active_incidents,
        "green_corridors": green_corridors,
        "avg_eta": avg_eta,
        "time_saved": time_saved,
        "system_status": "ONLINE",
        "simulation_mode": "ACTIVE"
    }
