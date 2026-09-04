import time
import requests
import os
import math

API_URL = os.getenv("API_URL", "http://127.0.0.1:8000/api")

# State tracker for waypoint interpolation: {amb_id: {"idx": int, "sub": float, "last_route_id": int}}
amb_progress = {}

def simulate_loop():
    print(f"Starting LIFEGRID AI Simulation Loop connected to {API_URL}...")
    while True:
        try:
            # 1. Fetch all ambulances
            resp = requests.get(f"{API_URL}/ambulances", timeout=3)
            if resp.status_code != 200:
                time.sleep(2)
                continue

            ambulances = resp.json()
            for amb in ambulances:
                amb_id = amb["id"]
                if amb["status"] == "EN_ROUTE":
                    # Fetch its active route
                    route_resp = requests.get(f"{API_URL}/routes/active/{amb_id}", timeout=3)
                    if route_resp.status_code != 200:
                        continue
                    
                    route_data = route_resp.json()
                    coords = route_data.get("route", [])
                    route_id = route_data.get("id")

                    if not coords or len(coords) < 2:
                        continue

                    # Initialize or reset if route changed (e.g. dynamic rerouting occurred)
                    if amb_id not in amb_progress or amb_progress[amb_id].get("last_route_id") != route_id:
                        amb_progress[amb_id] = {
                            "idx": 0,
                            "sub": 0.0,
                            "last_route_id": route_id,
                            "initial_eta": route_data.get("estimated_time_min", 8.0)
                        }

                    prog = amb_progress[amb_id]
                    idx = prog["idx"]
                    sub = prog["sub"]

                    # Move forward along the waypoint segment
                    sub += 0.25  # 4 sub-steps per segment for smooth visual progression
                    if sub >= 1.0:
                        idx += 1
                        sub = 0.0
                        prog["idx"] = idx

                    prog["sub"] = sub

                    total_segments = len(coords) - 1
                    if idx >= total_segments:
                        # Reached target hospital destination!
                        dest = coords[-1]
                        print(f"Ambulance {amb['vehicle_number']} reached destination hospital!")
                        requests.patch(
                            f"{API_URL}/ambulances/{amb_id}/location",
                            json={
                                "latitude": dest["lat"],
                                "longitude": dest["lng"],
                                "status": "IDLE",
                                "current_eta": 0.0
                            },
                            timeout=3
                        )
                        del amb_progress[amb_id]
                    else:
                        p1 = coords[idx]
                        p2 = coords[idx + 1]
                        curr_lat = p1["lat"] + (p2["lat"] - p1["lat"]) * sub
                        curr_lng = p1["lng"] + (p2["lng"] - p1["lng"]) * sub

                        progress_pct = min(99.0, max(1.0, ((idx + sub) / total_segments) * 100))
                        initial_eta = prog.get("initial_eta", 8.0)
                        remaining_eta = max(0.5, round(initial_eta * (1.0 - progress_pct / 100.0), 1))

                        requests.patch(
                            f"{API_URL}/ambulances/{amb_id}/location",
                            json={
                                "latitude": curr_lat,
                                "longitude": curr_lng,
                                "current_eta": remaining_eta
                            },
                            timeout=3
                        )
                else:
                    # Clean up if not en route
                    if amb_id in amb_progress:
                        del amb_progress[amb_id]

        except Exception as e:
            # print error without crashing simulation loop
            # print(f"Simulator warning: {e}")
            pass

        time.sleep(1.5)

if __name__ == "__main__":
    simulate_loop()
