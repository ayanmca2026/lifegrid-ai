from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal, engine
from app.database.base import Base
from app.database.seed import seed_data

client = TestClient(app)

def setup_module(module):
    Base.metadata.create_all(bind=engine)
    seed_data()

def test_complete_emergency_scenario():
    # 1. Authentication Check
    login_resp = client.post("/api/auth/login", data={"username": "admin", "password": "admin"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    assert token is not None

    # 2. Reset Simulation Baseline
    reset_resp = client.post("/api/simulation/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["status"] == "SUCCESS"

    # 3. Verify Hospital Ranking
    rank_resp = client.get("/api/hospitals/rank?lat=12.9716&lng=77.5946")
    assert rank_resp.status_code == 200
    ranked = rank_resp.json()
    assert len(ranked) >= 2
    assert "score" in ranked[0]
    assert "reasons" in ranked[0]

    # 4. Start Emergency
    start_resp = client.post("/api/ambulances/1/start_emergency?priority=CRITICAL")
    assert start_resp.status_code == 200
    data = start_resp.json()
    assert "hospital_name" in data
    assert "route" in data
    assert len(data["route"]) > 0
    assert data["eta"] > 0
    assert data["signals_prioritized"] >= 1
    initial_eta = data["eta"]

    # 5. Verify Active Route Query
    route_resp = client.get("/api/routes/active/1")
    assert route_resp.status_code == 200
    route_data = route_resp.json()
    assert len(route_data["route"]) == len(data["route"])

    # 6. Simulate Accident and Verify Dynamic Rerouting
    accident_resp = client.post("/api/simulation/accident")
    assert accident_resp.status_code == 200
    acc_data = accident_resp.json()
    assert acc_data["status"] == "SUCCESS"
    assert len(acc_data["rerouted"]) >= 1
    rerouted_info = acc_data["rerouted"][0]
    assert "new_eta" in rerouted_info
    assert "time_saved" in rerouted_info
    assert len(rerouted_info["route"]) > 0

    # 7. Simulate Signal Failure
    sig_resp = client.post("/api/simulation/signal_failure")
    assert sig_resp.status_code == 200
    assert sig_resp.json()["status"] == "SUCCESS"

    # 8. Simulate Traffic Jam
    traffic_resp = client.post("/api/simulation/traffic_jam")
    assert traffic_resp.status_code == 200
    assert traffic_resp.json()["status"] == "SUCCESS"

    # 9. Verify Dashboard Stats
    stats_resp = client.get("/api/dashboard/stats")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["active_emergencies"] >= 1
    assert stats["active_incidents"] >= 1
    assert stats["green_corridors"] >= 1

    # 10. Simulate Ambulance Arrival (Location Patch to Destination)
    dest_coord = data["route"][-1]
    arrival_resp = client.patch("/api/ambulances/1/location", json={
        "latitude": dest_coord["lat"],
        "longitude": dest_coord["lng"],
        "status": "IDLE",
        "current_eta": 0.0
    })
    assert arrival_resp.status_code == 200
    assert arrival_resp.json()["status"] == "IDLE"
