from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel
from app.database.connection import get_db
from app.ai.route_optimizer import optimize_route
from app.ai.eta_predictor import predict_eta
from app.models.route import Route
from app.models.road import Road

router = APIRouter(prefix="/routes", tags=["routes"])

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    dest_lat: float
    dest_lng: float
    traffic_density: float = 0.4

@router.get("/active/{ambulance_id}")
def get_active_route(ambulance_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    route = db.query(Route).filter(Route.ambulance_id == ambulance_id, Route.route_status == "ACTIVE").first()
    if not route:
        raise HTTPException(status_code=404, detail="No active route found for ambulance")

    coords = []
    if route.source and ";" in route.source:
        for pt in route.source.split(";"):
            if pt.strip():
                lat, lng = map(float, pt.split(","))
                coords.append({"lat": lat, "lng": lng})
    else:
        # Fallback to source & destination points
        s_lat, s_lng = map(float, route.source.split(","))
        d_lat, d_lng = map(float, route.destination.split(","))
        coords = [{"lat": s_lat, "lng": s_lng}, {"lat": d_lat, "lng": d_lng}]

    return {
        "id": route.id,
        "ambulance_id": route.ambulance_id,
        "route": coords,
        "distance_km": route.distance,
        "estimated_time_min": route.estimated_time,
        "risk_score": route.risk_score,
        "route_status": route.route_status
    }

@router.post("/optimize")
def calculate_optimized_route(req: RouteRequest, db: Session = Depends(get_db)):
    roads = db.query(Road).all()
    route_info = optimize_route(req.start_lat, req.start_lng, req.dest_lat, req.dest_lng, roads)
    eta = predict_eta(route_info["distance_km"], 40, req.traffic_density, 0)
    route_info["estimated_time_min"] = eta
    return route_info
