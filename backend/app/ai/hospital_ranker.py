import math

def calculate_distance(lat1, lon1, lat2, lon2):
    return math.sqrt((lat2 - lat1)**2 + (lon2 - lon1)**2) * 111.0  # approx km

def rank_hospitals(ambulance_lat, ambulance_lng, hospitals):
    ranked = []
    for h in hospitals:
        dist = calculate_distance(ambulance_lat, ambulance_lng, h.latitude, h.longitude)
        
        # Base score 100
        score = 100
        reasons = []

        # Distance penalty
        dist_penalty = min(40, dist * 3.5)
        score -= dist_penalty
        if dist < 4.0:
            reasons.append(f"Proximity: Excellent ({round(dist, 1)} km)")
        elif dist < 8.0:
            reasons.append(f"Proximity: Moderate ({round(dist, 1)} km)")
        else:
            reasons.append(f"Proximity: Distant ({round(dist, 1)} km)")

        # ICU availability evaluation
        if h.available_icu == 0:
            score -= 35
            reasons.append("ICU: 0 Available (Critical Shortage)")
        elif h.available_icu < 5:
            score -= 10
            reasons.append(f"ICU: {h.available_icu} Available (Limited)")
        else:
            reasons.append(f"ICU: {h.available_icu} Available (Optimal)")

        # Emergency capacity evaluation
        if h.available_emergency_capacity == 0:
            score -= 30
            reasons.append("Emergency Capacity: Full")
        elif h.available_emergency_capacity < 5:
            score -= 10
            reasons.append(f"Emergency Capacity: {h.available_emergency_capacity} Beds")
        else:
            reasons.append(f"Emergency Capacity: {h.available_emergency_capacity} Beds (Ready)")

        # Overall Status
        if h.status == "FULL":
            score -= 40
            reasons.append("Status: Diverting non-critical")
        elif h.status == "BUSY":
            score -= 10
            reasons.append("Status: Busy")
        else:
            reasons.append("Status: Available & Ready")

        final_score = max(5, min(100, int(score)))

        ranked.append({
            "hospital": h,
            "score": final_score,
            "distance": round(dist, 2),
            "estimated_eta": round(dist / (40 / 60), 1),
            "reasons": reasons,
            "icu_available": h.available_icu,
            "emergency_capacity": h.available_emergency_capacity,
            "status": h.status
        })

    # Sort descending by final score
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked
