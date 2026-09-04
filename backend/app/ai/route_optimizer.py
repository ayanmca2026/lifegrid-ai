import math
import heapq

def get_distance(lat1, lon1, lat2, lon2):
    return math.sqrt((lat2-lat1)**2 + (lon2-lon1)**2) * 111.0

def optimize_route(start_lat, start_lng, dest_lat, dest_lng, roads):
    # Build graph from roads
    # Node key: string "lat,lng"
    graph = {}
    for r in roads:
        n1 = f"{r.start_lat},{r.start_lng}"
        n2 = f"{r.end_lat},{r.end_lng}"
        if n1 not in graph: graph[n1] = []
        if n2 not in graph: graph[n2] = []

        # Treat roads as directed or undirected? For simplicity, undirected.
        # Real traffic would use a directed graph.
        # cost = distance * (1 + risk_score) + traffic_penalty etc.
        # For this demo, let's say risk_score factors heavily
        dist = get_distance(r.start_lat, r.start_lng, r.end_lat, r.end_lng)
        cost = dist * (1 + r.risk_score)

        graph[n1].append((n2, cost, r))
        graph[n2].append((n1, cost, r))

    # We must snap start and dest to nearest nodes in graph
    def snap_to_node(lat, lng):
        nodes = list(graph.keys())
        if not nodes: return None
        best = nodes[0]
        best_dist = float('inf')
        for n in nodes:
            n_lat, n_lng = map(float, n.split(','))
            d = get_distance(lat, lng, n_lat, n_lng)
            if d < best_dist:
                best_dist = d
                best = n
        return best

    start_node = snap_to_node(start_lat, start_lng)
    dest_node = snap_to_node(dest_lat, dest_lng)

    # A* Algorithm
    def heuristic(n1, n2):
        lat1, lng1 = map(float, n1.split(','))
        lat2, lng2 = map(float, n2.split(','))
        return get_distance(lat1, lng1, lat2, lng2)

    pq = [(0, start_node, [])]
    visited = set()
    best_cost = {start_node: 0}

    best_path_nodes = []
    best_path_roads = []

    while pq:
        cost, current, path = heapq.heappop(pq)

        if current in visited:
            continue
        visited.add(current)

        if current == dest_node:
            best_path_nodes = path + [current]
            break

        for neighbor, edge_cost, road in graph[current]:
            new_cost = best_cost[current] + edge_cost
            if neighbor not in best_cost or new_cost < best_cost[neighbor]:
                best_cost[neighbor] = new_cost
                priority = new_cost + heuristic(neighbor, dest_node)
                heapq.heappush(pq, (priority, neighbor, path + [current]))

    # Reconstruct route
    route_coords = []
    total_dist = 0
    total_risk = 0
    for i in range(len(best_path_nodes)):
        lat, lng = map(float, best_path_nodes[i].split(','))
        route_coords.append({"lat": lat, "lng": lng})
        if i > 0:
            total_dist += get_distance(
                float(best_path_nodes[i-1].split(',')[0]), float(best_path_nodes[i-1].split(',')[1]),
                lat, lng
            )

    return {
        "route": route_coords,
        "distance_km": round(total_dist, 2),
        "estimated_time_min": round(total_dist / (40/60), 2),
        "risk_score": total_risk,
        "signals_on_route": []
    }
