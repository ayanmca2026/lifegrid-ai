from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database.connection import get_db
from app.models.traffic import Traffic
from app.schemas.traffic import Traffic as TrafficSchema
from app.ai.traffic_predictor import predict_traffic

router = APIRouter(prefix="/traffic", tags=["traffic"])

@router.get("/", response_model=List[TrafficSchema])
def read_traffic(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Traffic).offset(skip).limit(limit).all()

@router.get("/prediction")
def get_traffic_prediction(road_id: int, current_density: float, db: Session = Depends(get_db)):
    prediction = predict_traffic(road_id, current_density)
    return prediction
