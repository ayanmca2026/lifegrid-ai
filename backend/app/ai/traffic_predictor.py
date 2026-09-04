import random

def predict_traffic(road_id, current_density):
    # For the hackathon, we simulate a model using random walk based on current density
    # In a real scenario, this would load an XGBoost/LightGBM model
    pred_5 = min(1.0, max(0.0, current_density + random.uniform(-0.1, 0.15)))
    pred_10 = min(1.0, max(0.0, pred_5 + random.uniform(-0.1, 0.15)))
    pred_15 = min(1.0, max(0.0, pred_10 + random.uniform(-0.1, 0.2)))

    congestion = "LOW"
    if pred_5 > 0.8:
        congestion = "SEVERE"
    elif pred_5 > 0.6:
        congestion = "HIGH"
    elif pred_5 > 0.4:
        congestion = "MODERATE"

    return {
        "road_id": road_id,
        "current_density": current_density,
        "predicted_5min": round(pred_5, 2),
        "predicted_10min": round(pred_10, 2),
        "predicted_15min": round(pred_15, 2),
        "congestion_level": congestion
    }
