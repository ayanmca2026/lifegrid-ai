import time
import random
import requests

API_URL = "http://127.0.0.1:8000/api"

def generate_incident():
    print("Starting incident generator...")
    while True:
        # Randomly create an incident every 60 seconds
        time.sleep(60)
        if random.random() < 0.3: # 30% chance
            print("Generating simulated accident...")
            incident_data = {
                "type": "ACCIDENT",
                "latitude": 12.9716 + random.uniform(-0.05, 0.05),
                "longitude": 77.5946 + random.uniform(-0.05, 0.05),
                "severity": random.choice(["HIGH", "CRITICAL"]),
                "description": "Simulated traffic accident",
                "status": "ACTIVE"
            }
            try:
                requests.post(f"{API_URL}/incidents/", json=incident_data)
            except:
                pass

if __name__ == "__main__":
    generate_incident()
