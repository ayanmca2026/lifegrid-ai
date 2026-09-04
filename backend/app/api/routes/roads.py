from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database.connection import get_db
from app.models.road import Road
from app.models.traffic import Traffic

router = APIRouter(prefix="/roads", tags=["roads"])

@router.get("/")
def get_roads(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    roads = db.query(Road).all()
    result = []
    for r in roads:
        traffic = db.query(Traffic).filter(Traffic.road_id == r.id).order_by(Traffic.id.desc()).first()
        density = traffic.density if traffic else 0.3
        congestion = traffic.congestion_level if traffic else "LOW"
        speed = traffic.average_speed if traffic else r.speed_limit
        result.append({
            "id": r.id,
            "name": r.name,
            "start_lat": r.start_lat,
            "start_lng": r.start_lng,
            "end_lat": r.end_lat,
            "end_lng": r.end_lng,
            "speed_limit": r.speed_limit,
            "road_condition": r.road_condition,
            "risk_score": r.risk_score,
            "density": density,
            "congestion_level": congestion,
            "average_speed": speed
        })
    return result
