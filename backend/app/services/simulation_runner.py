import time
import math
import threading
from app.database.connection import SessionLocal
from app.models.ambulance import Ambulance
from app.models.route import Route
from app.models.hospital import Hospital
from app.api.websocket import dispatch_event

def get_distance(lat1, lon1, lat2, lon2):
    return math.sqrt((lat2 - lat1)**2 + (lon2 - lon1)**2) * 111.0

def calculate_remaining_distance(coords, curr_idx, curr_lat, curr_lng):
    if not coords or curr_idx >= len(coords):
        return 0.0
    dist = get_distance(curr_lat, curr_lng, coords[curr_idx]["lat"], coords[curr_idx]["lng"])
    for i in range(curr_idx, len(coords) - 1):
        dist += get_distance(coords[i]["lat"], coords[i]["lng"], coords[i+1]["lat"], coords[i+1]["lng"])
    return round(dist, 2)

amb_progress = {}

def simulation_worker():
    print("LIFEGRID AI: Internal Background Simulator Thread Started! (Zero-Cost Embedded Daemon)")
    step_counter = 0
    while True:
        try:
            step_counter += 1
            db = SessionLocal()
            try:
                en_route_ambs = db.query(Ambulance).filter(Ambulance.status == "EN_ROUTE").all()
                for amb in en_route_ambs:
                    amb_id = amb.id
                    route = db.query(Route).filter(Route.ambulance_id == amb_id, Route.route_status == "ACTIVE").first()
                    if not route or not route.source:
                        continue
                    
                    coords = []
                    if ";" in route.source:
                        for pt in route.source.split(";"):
                            if pt.strip():
                                lat, lng = map(float, pt.split(","))
                                coords.append({"lat": lat, "lng": lng})
                    else:
                        s_lat, s_lng = map(float, route.source.split(","))
                        d_lat, d_lng = map(float, route.destination.split(","))
                        coords = [{"lat": s_lat, "lng": s_lng}, {"lat": d_lat, "lng": d_lng}]

                    if len(coords) < 2:
                        continue

                    route_id = route.id
                    if amb_id not in amb_progress or amb_progress[amb_id].get("last_route_id") != route_id:
                        amb_progress[amb_id] = {
                            "idx": 0,
                            "sub": 0.0,
                            "last_route_id": route_id,
                            "initial_eta": route.estimated_time or 8.0
                        }

                    prog = amb_progress[amb_id]
                    idx = prog["idx"]
                    sub = prog["sub"]

                    sub += 0.25
                    if sub >= 1.0:
                        idx += 1
                        sub = 0.0
                        prog["idx"] = idx
                    prog["sub"] = sub

                    total_segments = len(coords) - 1
                    if idx >= total_segments:
                        dest = coords[-1]
                        amb.latitude = dest["lat"]
                        amb.longitude = dest["lng"]
                        amb.status = "IDLE"
                        amb.current_eta = 0.0
                        db.commit()

                        dispatch_event({
                            "event": "ambulance_update",
                            "ambulance_id": amb.id,
                            "vehicle_number": amb.vehicle_number,
                            "latitude": dest["lat"],
                            "longitude": dest["lng"],
                            "status": "IDLE",
                            "eta": 0.0,
                            "speed": 0.0,
                            "distance_km": 0.0
                        })

                        hospital_name = "Apex Trauma Center"
                        if amb.destination_hospital_id:
                            hosp = db.query(Hospital).filter(Hospital.id == amb.destination_hospital_id).first()
                            if hosp:
                                hospital_name = hosp.name

                        dispatch_event({
                            "event": "emergency_completed",
                            "ambulance_id": amb.id,
                            "vehicle_number": amb.vehicle_number,
                            "priority": amb.emergency_priority or "CRITICAL",
                            "hospital_name": hospital_name,
                            "original_eta": prog.get("initial_eta", 8.0),
                            "final_eta": 0.0,
                            "time_saved": 3.5,
                            "reroutes_count": 1,
                            "signals_optimized": 6,
                            "status": "SUCCESS"
                        })

                        if amb_id in amb_progress:
                            del amb_progress[amb_id]
                    else:
                        p1 = coords[idx]
                        p2 = coords[idx + 1]
                        curr_lat = p1["lat"] + (p2["lat"] - p1["lat"]) * sub
                        curr_lng = p1["lng"] + (p2["lng"] - p1["lng"]) * sub

                        progress_pct = min(99.0, max(1.0, ((idx + sub) / total_segments) * 100))
                        initial_eta = prog.get("initial_eta", 8.0)
                        remaining_eta = max(0.5, round(initial_eta * (1.0 - progress_pct / 100.0), 1))
                        speed = round(48.0 + 4.0 * math.sin(step_counter * 0.5), 1)
                        dist_rem = calculate_remaining_distance(coords, idx + 1, curr_lat, curr_lng)

                        amb.latitude = curr_lat
                        amb.longitude = curr_lng
                        amb.current_eta = remaining_eta
                        db.commit()

                        dispatch_event({
                            "event": "ambulance_update",
                            "ambulance_id": amb.id,
                            "vehicle_number": amb.vehicle_number,
                            "latitude": curr_lat,
                            "longitude": curr_lng,
                            "status": amb.status,
                            "eta": remaining_eta,
                            "speed": speed,
                            "distance_km": dist_rem
                        })

            finally:
                db.close()

        except Exception as e:
            pass

        time.sleep(1.5)

def start_internal_simulator():
    thread = threading.Thread(target=simulation_worker, daemon=True)
    thread.start()
