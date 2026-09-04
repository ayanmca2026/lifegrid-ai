from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any
from app.database.connection import get_db
from app.database.seed import seed_data
from app.models.incident import Incident
from app.models.signal import Signal
from app.models.hospital import Hospital
from app.models.traffic import Traffic
from app.models.road import Road
from app.models.ambulance import Ambulance
from app.models.route import Route
from app.services.orchestrator import handle_incident, recalculate_all_active_routes, start_emergency
from app.api.websocket import dispatch_event

router = APIRouter(prefix="/simulation", tags=["simulation"])

@router.post("/reset")
def reset_simulation(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Resets database and simulation to initial deterministic seed state."""
    seed_data()
    dispatch_event({
        "event": "reset_completed",
        "message": "Simulation reset to initial deterministic state"
    })
    return {"status": "SUCCESS", "message": "Simulation state successfully reset"}

@router.post("/accident")
def simulate_accident(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Simulates a major traffic accident on the active route."""
    # Find active route coordinates if possible
    active_route = db.query(Route).filter(Route.route_status == "ACTIVE").first()
    lat = 12.9719
    lng = 77.6015
    if active_route and ";" in active_route.source:
        points = active_route.source.split(";")
        if len(points) > 1:
            mid = points[min(2, len(points) - 1)].split(",")
            lat = float(mid[0])
            lng = float(mid[1])

    incident = Incident(
        type="ACCIDENT",
        latitude=lat,
        longitude=lng,
        severity="CRITICAL",
        description="Multi-vehicle collision on primary corridor",
        status="ACTIVE"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    reroutes = handle_incident(incident.id, db)

    dispatch_event({
        "event": "incident_created",
        "incident_id": incident.id,
        "type": incident.type,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "severity": incident.severity,
        "description": incident.description
    })

    for r in reroutes:
        dispatch_event({
            "event": "route_updated",
            "ambulance_id": r["ambulance_id"],
            "old_eta": r["old_eta"],
            "new_eta": r["new_eta"],
            "time_saved": r["time_saved"],
            "reason": r["reason"],
            "route": r["route"]
        })

    dispatch_event({
        "event": "alert",
        "title": "ACCIDENT DETECTED",
        "severity": "HIGH",
        "message": f"Critical accident at ({round(lat, 4)}, {round(lng, 4)}). Dynamic reroute active."
    })

    return {"status": "SUCCESS", "incident_id": incident.id, "rerouted": reroutes}

@router.post("/traffic_jam")
def simulate_traffic_jam(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Simulates severe traffic congestion on major road segments."""
    roads = db.query(Road).all()
    for r in roads[:2]:
        r.risk_score += 8.0
        traffic = db.query(Traffic).filter(Traffic.road_id == r.id).first()
        if traffic:
            traffic.density = 0.94
            traffic.average_speed = 7.5
            traffic.congestion_level = "SEVERE"
            traffic.vehicle_count = 210

    db.commit()

    reroutes = recalculate_all_active_routes(db, reason="Severe traffic jam detected (Density > 0.90)")

    dispatch_event({
        "event": "traffic_update",
        "congestion_level": "SEVERE",
        "average_density": 0.94,
        "predicted_5min": 0.98
    })

    for r in reroutes:
        dispatch_event({
            "event": "route_updated",
            "ambulance_id": r["ambulance_id"],
            "old_eta": r["old_eta"],
            "new_eta": r["new_eta"],
            "time_saved": r["time_saved"],
            "reason": r["reason"],
            "route": r["route"]
        })

    dispatch_event({
        "event": "alert",
        "title": "TRAFFIC CONGESTION SPIKE",
        "severity": "MEDIUM",
        "message": "Heavy congestion buildup. Rerouting ambulance to preserve ETA."
    })

    return {"status": "SUCCESS", "rerouted": reroutes}

@router.post("/road_block")
def simulate_road_block(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Simulates a complete road blockage due to construction or downed infrastructure."""
    active_route = db.query(Route).filter(Route.route_status == "ACTIVE").first()
    lat = 12.9650
    lng = 77.6100
    if active_route and ";" in active_route.source:
        points = active_route.source.split(";")
        if len(points) > 1:
            pt = points[1].split(",")
            lat, lng = float(pt[0]), float(pt[1])

    incident = Incident(
        type="ROAD_BLOCK",
        latitude=lat,
        longitude=lng,
        severity="HIGH",
        description="Emergency road blockage / debris",
        status="ACTIVE"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    reroutes = handle_incident(incident.id, db)

    dispatch_event({
        "event": "incident_created",
        "incident_id": incident.id,
        "type": incident.type,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "severity": incident.severity
    })

    for r in reroutes:
        dispatch_event({
            "event": "route_updated",
            "ambulance_id": r["ambulance_id"],
            "old_eta": r["old_eta"],
            "new_eta": r["new_eta"],
            "time_saved": r["time_saved"],
            "reason": "Complete road block on prior route",
            "route": r["route"]
        })

    return {"status": "SUCCESS", "incident_id": incident.id, "rerouted": reroutes}

@router.post("/signal_failure")
def simulate_signal_failure(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Simulates failure of an intersection traffic signal."""
    signal = db.query(Signal).filter(Signal.priority_status == True).first()
    if not signal:
        signal = db.query(Signal).first()

    if signal:
        signal.current_state = "FAILURE"
        signal.priority_status = False
        db.commit()

        dispatch_event({
            "event": "signal_priority",
            "signal_id": signal.id,
            "intersection": signal.intersection_name,
            "state": "FAILURE"
        })

        dispatch_event({
            "event": "alert",
            "title": "SIGNAL FAILURE",
            "severity": "HIGH",
            "message": f"Intersection {signal.intersection_name} signal failure. Alternative coordination applied."
        })

    return {"status": "SUCCESS", "signal_id": signal.id if signal else None, "state": "FAILURE"}

@router.post("/hospital_capacity")
def simulate_hospital_capacity(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Simulates ICU beds becoming completely full at City Hospital, triggering reroute to alternate hospital."""
    hospital = db.query(Hospital).filter(Hospital.name.like("%City Hospital%")).first()
    if hospital:
        hospital.available_icu = 0
        hospital.status = "FULL"
        db.commit()

        # Re-trigger emergency routing for active ambulance so it picks alternate hospital
        active_amb = db.query(Ambulance).filter(Ambulance.status == "EN_ROUTE").first()
        res = None
        if active_amb:
            res = start_emergency(active_amb.id, db, priority=active_amb.emergency_priority)
            dispatch_event({
                "event": "emergency_started",
                "ambulance_id": res["ambulance_id"],
                "hospital_name": res["hospital_name"],
                "route": res["route"],
                "eta": res["eta"]
            })

        dispatch_event({
            "event": "hospital_update",
            "hospital_id": hospital.id,
            "name": hospital.name,
            "available_icu": 0,
            "status": "FULL"
        })

        dispatch_event({
            "event": "alert",
            "title": "HOSPITAL CAPACITY ALERT",
            "severity": "CRITICAL",
            "message": f"{hospital.name} ICU full. Ambulance redirected to alternative facility."
        })

        return {"status": "SUCCESS", "hospital": hospital.name, "reroute": res}

    return {"status": "FAIL", "message": "Hospital not found"}

@router.post("/recalculate_route")
def manual_recalculate_route(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Manually triggers A* dynamic reroute evaluation."""
    reroutes = recalculate_all_active_routes(db, reason="Manual optimization requested by operator")
    for r in reroutes:
        dispatch_event({
            "event": "route_updated",
            "ambulance_id": r["ambulance_id"],
            "old_eta": r["old_eta"],
            "new_eta": r["new_eta"],
            "time_saved": r["time_saved"],
            "reason": r["reason"],
            "route": r["route"]
        })
    return {"status": "SUCCESS", "rerouted": reroutes}
