from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database.connection import get_db
from app.models.hospital import Hospital
from app.schemas.hospital import Hospital as HospitalSchema
from app.ai.hospital_ranker import rank_hospitals as ai_rank_hospitals

router = APIRouter(prefix="/hospitals", tags=["hospitals"])

@router.get("/", response_model=List[HospitalSchema])
def read_hospitals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Hospital).offset(skip).limit(limit).all()

@router.get("/rank")
def rank_hospitals(lat: float, lng: float, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    hospitals = db.query(Hospital).all()
    ranked = ai_rank_hospitals(lat, lng, hospitals)

    result = []
    for r in ranked:
        h_dict = {
            "id": r["hospital"].id,
            "name": r["hospital"].name,
            "latitude": r["hospital"].latitude,
            "longitude": r["hospital"].longitude,
            "icu_beds": r["hospital"].icu_beds,
            "available_icu": r["hospital"].available_icu,
            "emergency_capacity": r["hospital"].emergency_capacity,
            "available_emergency_capacity": r["hospital"].available_emergency_capacity,
            "status": r["hospital"].status
        }
        result.append({
            "hospital": h_dict,
            "score": r["score"],
            "distance": r["distance"],
            "estimated_eta": r.get("estimated_eta", 0.0),
            "reasons": r.get("reasons", [])
        })
    return result
