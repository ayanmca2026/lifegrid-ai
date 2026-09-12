# LIFEGRID AI

### AI-Powered Emergency Green Corridor & Dynamic Traffic Orchestration Platform

> **Smart India Hackathon (SIH) Prototype**  
> *From Static Navigation to Dynamic Emergency Orchestration*

---

## 1. Executive Summary & Objective

In medical emergencies, conventional GPS navigation tools only suggest static or passively updated routes without coordinating with municipal traffic infrastructure or hospital capacity. **LIFEGRID AI** is an intelligent, real-time emergency response platform that:

1. **Ranks Hospitals Dynamically:** Evaluates travel distance, live congestion, ICU bed availability, and specialty readiness.
2. **Computes Optimal Corridors via A\*:** Calculates fastest graph routes factoring road conditions, risk scores, and intersection delays.
3. **Simulates Dynamic Green Corridors:** Recommends priority signal states along active routes to minimize transit stops.
4. **Performs Real-Time Dynamic Rerouting:** Automatically recalculates alternative paths when incidents (accidents, road blocks, traffic spikes) occur on the active corridor without manual intervention.
5. **Provides Live Command-Center Telemetry:** Streams bi-directional updates over WebSockets for active ambulances, signals, incidents, and KPI analytics.

---

## 2. Architecture & Tech Stack

```text
       React + Vite + Google Maps Command Center (Port 3000)
                              ↕ [HTTP / WebSocket]
               FastAPI Central Orchestrator (Port 8000)
    ┌─────────────────────────┼─────────────────────────┐
    ↓                         ↓                         ↓
PostgreSQL DB          A* Routing & ML           Simulator Engine
(Roads, Ambulances,    (ETA, Hospital Ranking,   (Ambulance GPS,
 Signals, Incidents)    Traffic Prediction)       Incidents, Signals)
```

- **Frontend:** React 18, Vite, Tailwind CSS, Google Maps Platform (`@vis.gl/react-google-maps`), Custom Dark Theme
- **Backend:** FastAPI, Python 3.10+, SQLAlchemy, Pydantic v2, WebSockets
- **Database:** PostgreSQL (with SQLite fallback for local developer testing)
- **AI & Algorithms:** A\* Graph Search, Multi-Criteria Decision Analysis (MCDA) for Hospital Selection, Heuristic ETA Regression
- **DevOps:** Docker, Docker Compose, Pytest
- **Cloud/Deployment:** Vercel (Frontend SPA), Render (Backend + Database)

---

## 3. Real-Time Emergency Workflow

```text
[Operator / Ambulance Starts Emergency]
                 ↓
[AI Hospital Intelligence Ranks Hospitals based on ICU & Proximity]
                 ↓
[A* Engine Calculates Primary Corridor with Signal Identification]
                 ↓
[Green Corridor Priority Activated across Signals]
                 ↓
[Ambulance Moves Gradually along Coordinate Waypoints]
                 ↓
[Incident Simulated: Accident / Road Block / Traffic Jam]
                 ↓
[Backend Automatically Detects Route Blockage & Recalculates A*]
                 ↓
[Alternative Route, New ETA, and Signal Updates Pushed via WebSocket]
                 ↓
[Ambulance Arrives at Destination Hospital -> Emergency Completed]
```

---

## 4. API Endpoints Reference

### Authentication
- `POST /api/auth/login` — Issues JWT bearer token for operators (`admin` / `admin`).

### Emergency & Ambulances
- `GET /api/ambulances` — List all ambulance units and statuses (`ACTIVE`, `IDLE`, `EN_ROUTE`).
- `GET /api/ambulances/{id}` — Get single ambulance telemetry.
- `POST /api/ambulances/{id}/start_emergency` — Orchestrates emergency start, hospital ranking, A\* route, and green corridor.
- `PATCH /api/ambulances/{id}/location` — Live GPS coordinates update and ETA sync.

### Routing & Network
- `GET /api/roads` — Returns road graph nodes with real-time congestion and speed metrics.
- `GET /api/routes/active/{ambulance_id}` — Retrieves active polyline coordinates, distance, and ETA.
- `POST /api/routes/optimize` — Computes A\* optimal path between arbitrary coordinates.

### Hospitals & Traffic
- `GET /api/hospitals` — List hospital facilities and capacities.
- `GET /api/hospitals/rank?lat=X&lng=Y` — AI hospital ranking with transparent score breakdown and ICU status.
- `GET /api/signals` — Traffic signal network status (`NORMAL`, `PRIORITY`, `FAILURE`).
- `GET /api/incidents` — Active traffic blockages and accidents.
- `GET /api/dashboard/stats` — Live KPI metrics for active corridors, incidents, and saved time.

### Simulation Controls
- `POST /api/simulation/reset` — Deterministically resets demo database to baseline.
- `POST /api/simulation/accident` — Spawns multi-vehicle accident on primary corridor, triggering automatic reroute.
- `POST /api/simulation/traffic_jam` — Spikes congestion on key arterial roads (density > 0.90).
- `POST /api/simulation/road_block` — Creates critical road closure incident.
- `POST /api/simulation/signal_failure` — Simulates intersection signal outage.
- `POST /api/simulation/hospital_capacity` — Fills primary hospital ICUs, diverting ambulance to alternative facility.
- `POST /api/simulation/recalculate_route` — Manually forces A\* path re-evaluation.

---

## 5. WebSocket Event Architecture (`/ws/realtime`)

The platform uses a unified, low-latency WebSocket connection:
- `ambulance_update`: Live GPS coordinates, heading, and remaining ETA.
- `emergency_started`: Dispatches initial corridor polyline, hospital target, and signal counts.
- `route_updated`: Emitted when an incident triggers an automatic alternative route.
- `incident_created` / `incident_resolved`: Broadcasts road obstruction changes.
- `signal_priority`: Real-time updates to signal states along the corridor.
- `hospital_update`: Emitted when hospital bed availability changes.
- `alert`: High-priority command center alerts for accidents or failures.
- `emergency_completed`: Triggered when ambulance safely reaches destination.
- `reset_completed`: Refreshes all connected dashboard states to baseline.

---

## 6. Google Maps API Key Setup

This project uses the **Google Maps JavaScript API** to render the interactive command center map.
Before running the frontend locally or deploying, you **must** configure a valid API key:

1. Follow the instructions in [docs/GOOGLE_MAPS_SETUP.md](./docs/GOOGLE_MAPS_SETUP.md) to generate a key.
2. In the `frontend/` directory, copy `.env.example` to `.env`.
3. Set your key: `VITE_GOOGLE_MAPS_API_KEY=your_api_key_here`.

---

## 7. Running with Docker Compose (Recommended)

To start the full stack:
```bash
docker compose up --build
```

Services:
- **Web Command Center:** `http://localhost:3000`
- **FastAPI Interactive Docs:** `http://localhost:8000/docs`
- **PostgreSQL Database:** `localhost:5432`
- **Simulation Loop:** Runs automatically in the background

---

## 8. Running Locally (Alternative)

### Backend
```bash
cd backend
pip install -r requirements.txt
python app/database/seed.py
uvicorn app.main:app --reload --port 8000
```

### Simulator Loop
```bash
python simulator/main_sim.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 9. SIH Demonstration Walkthrough

1. Open `http://localhost:3000` to access the Command Center.
2. Verify all indicators show **SYSTEM ONLINE** and **WEBSOCKET LIVE**.
3. Select **Ambulance A102** and Priority **CRITICAL**, then click **`▶ START EMERGENCY`**.
   - Notice the AI selects the optimal hospital based on proximity and ICU beds.
   - The cyan Green Corridor polyline is drawn on the map.
   - Signals along the route turn **GREEN (PRIORITY)**.
   - The ambulance marker begins moving smoothly along the road waypoints.
4. Click **`💥 SIMULATE ACCIDENT`**.
   - An accident marker appears directly on the active corridor.
   - The system **automatically detects the blockage** and triggers an A\* recalculation.
   - The old route is archived (red dashed line) and a new, optimized detour route appears in bright cyan.
   - The **AI Recommendation Panel** displays the exact time saved and justification.
5. Click **`🚦 SIGNAL FAILURE`** or **`🚗 TRAFFIC JAM`** to observe secondary dynamic responses.
6. Watch the ambulance reach the hospital destination. An **Emergency Mission Completed** summary dialog will celebrate arrival with recorded metrics.
7. Click **`↻ RESET DEMO`** to return the platform to its deterministic initial state.

---

## 10. Prototype & Ethical Disclaimer

*LIFEGRID AI is a prototype designed for demonstration purposes at the Smart India Hackathon (SIH). Traffic simulation data, signal priority states, and congestion metrics are generated synthetically for demo cities. This system represents an architectural simulation and decision-support recommendation layer; it does not directly control municipal or governmental physical traffic signals.*
