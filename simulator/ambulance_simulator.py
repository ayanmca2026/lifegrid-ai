import time
import requests

API_URL = "http://127.0.0.1:8000/api"

def simulate_ambulance():
    print("Starting ambulance simulator...")
    # Get active ambulances and move them along their route
    # This will be integrated with WebSockets in Phase 3
    while True:
        try:
            # Fetch all ambulances
            resp = requests.get(f"{API_URL}/ambulances")
            if resp.status_code == 200:
                ambulances = resp.json()
                for amb in ambulances:
                    if amb["status"] == "EN_ROUTE":
                        # Mock movement - just slightly changing coordinates towards a target
                        # We'll elaborate on this when routing is connected
                        new_lat = amb["latitude"] + 0.001
                        new_lng = amb["longitude"] + 0.001
                        requests.patch(f"{API_URL}/ambulances/{amb['id']}/location", json={"latitude": new_lat, "longitude": new_lng})
            time.sleep(5)
        except Exception as e:
            print(f"Simulator error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    simulate_ambulance()
