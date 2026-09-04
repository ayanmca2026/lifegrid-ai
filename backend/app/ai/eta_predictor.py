def predict_eta(distance_km, current_speed, traffic_density, signal_count):
    # A simple linear mock model. 
    # Base time assuming 40 km/h
    base_time = distance_km / (40 / 60)

    # Traffic penalty
    traffic_penalty = traffic_density * 5.0 # up to 5 min delay due to traffic

    # Signal penalty
    signal_penalty = signal_count * 0.5 # 30 seconds per signal

    eta = base_time + traffic_penalty + signal_penalty
    return round(eta, 2)
