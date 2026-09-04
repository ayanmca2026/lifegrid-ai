from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.connection import engine
from app.database.base import Base

from app.api.routes import (
    ambulance,
    hospitals,
    incidents,
    traffic,
    signals,
    routes,
    auth,
    roads,
    simulation,
    dashboard
)
from app.api.websocket import router as websocket_router

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LIFEGRID AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(ambulance.router, prefix="/api")
app.include_router(hospitals.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(traffic.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(roads.router, prefix="/api")
app.include_router(simulation.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")

app.include_router(websocket_router)

@app.get("/")
def read_root():
    return {"status": "LIFEGRID AI SYSTEM ONLINE"}
