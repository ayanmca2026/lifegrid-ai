import json
import math
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal, engine
from app.models.hospital import Hospital
from app.models.ambulance import Ambulance
from app.models.road import Road
from app.models.signal import Signal
from app.models.traffic import Traffic
from app.database.base import Base

def seed_data():
    db: Session = SessionLocal()

    # We want to clear and reseed for clean state
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("Seeding database...")

    hospitals = [
        Hospital(name="City Hospital", latitude=12.9592, longitude=77.6485, icu_beds=50, available_icu=12, emergency_capacity=30, available_emergency_capacity=15, specialist_availability='["CARDIOLOGY", "NEUROLOGY"]', status="AVAILABLE"),
        Hospital(name="General Hospital", latitude=12.8960, longitude=77.5980, icu_beds=40, available_icu=5, emergency_capacity=20, available_emergency_capacity=4, specialist_availability='["ORTHOPEDICS", "TRAUMA"]', status="BUSY"),
        Hospital(name="Metro Hospital", latitude=12.9850, longitude=77.5950, icu_beds=30, available_icu=2, emergency_capacity=15, available_emergency_capacity=1, specialist_availability='["CARDIOLOGY"]', status="FULL")
    ]

    # Ambulance starting point
    ambulances = [
        Ambulance(vehicle_number="A102", latitude=12.9716, longitude=77.5946, status="IDLE", emergency_priority="LOW", patient_condition="STABLE")
    ]

    # Intersections
    nodes = [
        (12.9716, 77.5946), # 0 (Start)
        (12.9719, 77.6015), # 1
        (12.9784, 77.6408), # 2
        (12.9592, 77.6485), # 3 (City Hospital)
        (12.9650, 77.6100), # 4
        (12.9550, 77.6200), # 5
        (12.9450, 77.6300)  # 6
    ]

    # Edges (Roads)
    edges = [
        (0, 1, "Route A1"),
        (1, 4, "Route A2"),
        (4, 5, "Route A3"),
        (5, 6, "Route A4"),
        (6, 3, "Route A5"), # Path A

        (1, 2, "Route B1"),
        (2, 3, "Route B2"), # Path B (Fast but prone to traffic)

        (0, 4, "Route C1")  # Direct shortcut
    ]

    roads = []
    signals = []
    traffics = []
    for start_idx, end_idx, name in edges:
        n1 = nodes[start_idx]
        n2 = nodes[end_idx]
        dist = math.sqrt((n2[0]-n1[0])**2 + (n2[1]-n1[1])**2) * 111.0 # km
        r = Road(
            name=name,
            start_lat=n1[0], start_lng=n1[1],
            end_lat=n2[0], end_lng=n2[1],
            speed_limit=40.0,
            road_condition="GOOD",
            risk_score=0.1
        )
        roads.append(r)

        signals.append(Signal(
            intersection_name=f"Int {start_idx}-{end_idx}",
            latitude=n2[0], longitude=n2[1],
            current_state="GREEN",
            cycle_time=60
        ))

    db.add_all(hospitals)
    db.add_all(ambulances)
    db.add_all(roads)
    db.add_all(signals)
    db.commit()

    # Add initial traffic
    for r in roads:
        traffics.append(Traffic(
            road_id=r.id,
            vehicle_count=50,
            average_speed=35.0,
            density=0.3,
            congestion_level="LOW"
        ))
    db.add_all(traffics)
    db.commit()

    db.close()
    print("Seeding completed with road graph.")

if __name__ == "__main__":
    seed_data()
