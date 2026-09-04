from sqlalchemy.orm import Session
from app.models.ambulance import Ambulance
from app.models.hospital import Hospital
from app.models.road import Road
from app.models.route import Route
from app.models.signal import Signal
from app.models.incident import Incident
from app.ai.hospital_ranker import rank_hospitals
from app.ai.route_optimizer import optimize_route
from app.ai.eta_predictor import predict_eta

def start_emergency(ambulance_id: int, db: Session, priority: str = "CRITICAL"):
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        return None

    hospitals = db.query(Hospital).all()
    roads = db.query(Road).all()
    
    # 1. Hospital ranking
    ranked = rank_hospitals(ambulance.latitude, ambulance.longitude, hospitals)
    best_hospital_obj = ranked[0]["hospital"]
    best_score = ranked[0]["score"]
    best_reasons = ranked[0]["reasons"]
    
    # 2. Optimize Route using A*
    route_res = optimize_route(
        ambulance.latitude, ambulance.longitude,
        best_hospital_obj.latitude, best_hospital_obj.longitude,
        roads
    )
    
    # 3. Calculate ETA
    eta = predict_eta(route_res["distance_km"], 45, 0.4, len(route_res.get("signals_on_route", [])))
    
    # 4. Save polyline
    route_str = ";".join([f"{r['lat']},{r['lng']}" for r in route_res["route"]])
    
    # Deactivate old routes
    old_routes = db.query(Route).filter(Route.ambulance_id == ambulance_id).all()
    for oroute in old_routes:
        oroute.route_status = "COMPLETED"
        
    db_route = Route(
        ambulance_id=ambulance.id,
        source=route_str,
        destination=f"{best_hospital_obj.latitude},{best_hospital_obj.longitude}",
        distance=route_res["distance_km"],
        estimated_time=eta,
        risk_score=route_res["risk_score"],
        route_status="ACTIVE"
    )
    db.add(db_route)
    
    ambulance.status = "EN_ROUTE"
    ambulance.emergency_priority = priority
    ambulance.destination_hospital_id = best_hospital_obj.id
    ambulance.current_eta = eta
    
    # 5. Green Corridor Signal Priority
    signals = db.query(Signal).all()
    priority_signals = []
    for s in signals:
        # Check proximity to any node along route
        for coord in route_res["route"]:
            dist_sq = (s.latitude - coord["lat"])**2 + (s.longitude - coord["lng"])**2
            if dist_sq < 0.0001:
                s.priority_status = True
                s.current_state = "GREEN"
                priority_signals.append({
                    "id": s.id,
                    "name": s.intersection_name,
                    "state": "PRIORITY_GREEN"
                })
                break

    db.commit()
    return {
        "ambulance_id": ambulance.id,
        "vehicle_number": ambulance.vehicle_number,
        "priority": priority,
        "hospital_id": best_hospital_obj.id,
        "hospital_name": best_hospital_obj.name,
        "hospital_score": best_score,
        "hospital_reasons": best_reasons,
        "route": route_res["route"],
        "distance_km": route_res["distance_km"],
        "eta": eta,
        "signals_prioritized": len(priority_signals),
        "signals_details": priority_signals
    }

def handle_incident(incident_id: int, db: Session):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        return []

    roads = db.query(Road).all()
    
    # Increase risk score heavily for roads near incident
    affected_roads = []
    for r in roads:
        d1 = (r.start_lat - incident.latitude)**2 + (r.start_lng - incident.longitude)**2
        d2 = (r.end_lat - incident.latitude)**2 + (r.end_lng - incident.longitude)**2
        if d1 < 0.002 or d2 < 0.002:
            r.risk_score += 15.0  # Heavy penalty for routing
            affected_roads.append(r.name)

    # Recalculate routes for active ambulances
    return recalculate_all_active_routes(db, reason=f"{incident.type} detected on primary corridor")

def recalculate_all_active_routes(db: Session, reason: str = "Traffic condition changed"):
    roads = db.query(Road).all()
    active_routes = db.query(Route).filter(Route.route_status == "ACTIVE").all()
    rerouted = []
    
    for route in active_routes:
        amb = db.query(Ambulance).filter(Ambulance.id == route.ambulance_id).first()
        if not amb:
            continue
            
        dest_lat, dest_lng = map(float, route.destination.split(','))
        new_route_res = optimize_route(amb.latitude, amb.longitude, dest_lat, dest_lng, roads)
        
        old_eta = route.estimated_time
        # Recalculate new ETA
        new_eta = predict_eta(new_route_res["distance_km"], 40, 0.4, len(new_route_res.get("signals_on_route", [])))
        
        # Calculate time saved comparison (if stayed on blocked route vs taking alternative)
        penalty_eta = old_eta + 5.5
        time_saved = max(1.2, round(penalty_eta - new_eta, 1))

        route.route_status = "ABORTED"
        route_str = ";".join([f"{r['lat']},{r['lng']}" for r in new_route_res["route"]])
        
        new_route = Route(
            ambulance_id=amb.id,
            source=route_str,
            destination=route.destination,
            distance=new_route_res["distance_km"],
            estimated_time=new_eta,
            risk_score=new_route_res["risk_score"],
            route_status="ACTIVE"
        )
        db.add(new_route)
        
        amb.current_eta = new_eta

        # Re-evaluate signals on new route
        signals = db.query(Signal).all()
        active_signals = []
        for s in signals:
            is_on_route = False
            for coord in new_route_res["route"]:
                if (s.latitude - coord["lat"])**2 + (s.longitude - coord["lng"])**2 < 0.0001:
                    is_on_route = True
                    break
            if is_on_route and s.current_state != "FAILURE":
                s.priority_status = True
                s.current_state = "GREEN"
                active_signals.append(s.id)
            elif not is_on_route and s.priority_status:
                s.priority_status = False
                s.current_state = "RED"

        rerouted.append({
            "ambulance_id": amb.id,
            "vehicle_number": amb.vehicle_number,
            "old_eta": old_eta,
            "new_eta": new_eta,
            "time_saved": time_saved,
            "reason": reason,
            "distance_km": new_route_res["distance_km"],
            "route": new_route_res["route"],
            "signals_prioritized": len(active_signals)
        })
        
    db.commit()
    return rerouted
