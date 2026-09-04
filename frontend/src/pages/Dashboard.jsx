import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';

const API_BASE = 'http://localhost:8000/api';

// Custom Offline DivIcons
const createDivIcon = (emoji, bgClass, borderClass = 'border-white') => {
    return L.divIcon({
        html: `<div class="${bgClass} text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-xl border-2 ${borderClass} text-sm transform hover:scale-125 transition-transform duration-200">${emoji}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
    });
};

const ambulanceIcon = createDivIcon('🚑', 'bg-cyan-500 animate-pulse', 'border-cyan-200');
const ambulanceIdleIcon = createDivIcon('🚑', 'bg-slate-600', 'border-slate-400');
const hospitalIcon = createDivIcon('🏥', 'bg-emerald-600', 'border-emerald-200');
const hospitalFullIcon = createDivIcon('🏥', 'bg-amber-600', 'border-amber-300');
const incidentAccidentIcon = createDivIcon('💥', 'bg-rose-600 animate-bounce', 'border-rose-300');
const incidentBlockIcon = createDivIcon('🚧', 'bg-orange-600 animate-pulse', 'border-orange-300');

export default function Dashboard() {
    const [ambulances, setAmbulances] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [hospitals, setHospitals] = useState([]);
    const [signals, setSignals] = useState([]);
    const [roads, setRoads] = useState([]);
    const [activeRoute, setActiveRoute] = useState([]);
    const [previousRoute, setPreviousRoute] = useState([]);
    const [emergencyState, setEmergencyState] = useState(null);
    const [selectedAmbulanceId, setSelectedAmbulanceId] = useState(null);
    const [emergencyPriority, setEmergencyPriority] = useState('CRITICAL');
    const [aiRecommendation, setAiRecommendation] = useState(null);
    const [hospitalRanking, setHospitalRanking] = useState([]);
    const [completionSummary, setCompletionSummary] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [wsConnected, setWsConnected] = useState(false);
    const [liveAlert, setLiveAlert] = useState(null);

    const [kpi, setKpi] = useState({
        activeAmbulances: 0,
        activeEmergencies: 0,
        activeIncidents: 0,
        greenCorridors: 0,
        avgEta: '0.0 min',
        timeSaved: '0.0 min'
    });

    const wsRef = useRef(null);

    // Initial Fetch & WebSocket setup
    useEffect(() => {
        fetchAllData();

        let reconnectTimer;
        const connectWebSocket = () => {
            const ws = new WebSocket('ws://localhost:8000/ws/realtime');
            wsRef.current = ws;

            ws.onopen = () => {
                setWsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (err) {
                    console.error("WS parse error:", err);
                }
            };

            ws.onclose = () => {
                setWsConnected(false);
                reconnectTimer = setTimeout(connectWebSocket, 3000);
            };

            ws.onerror = () => {
                ws.close();
            };
        };

        connectWebSocket();

        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };
    }, []);

    const handleWebSocketMessage = (data) => {
        if (data.event === 'ambulance_update') {
            setAmbulances(prev => prev.map(a => 
                a.id === data.ambulance_id 
                    ? { ...a, latitude: data.latitude, longitude: data.longitude, status: data.status || a.status, current_eta: data.eta !== undefined ? data.eta : a.current_eta }
                    : a
            ));

            if (data.status === 'IDLE' && emergencyState) {
                // Emergency Completed
                setCompletionSummary({
                    ambulance_id: data.ambulance_id,
                    hospital_name: emergencyState.hospital_name,
                    final_eta: '0.0 min',
                    time_saved: emergencyState.time_saved || '4.2 min',
                    route_changes: emergencyState.route_changes || 1,
                    signals_prioritized: emergencyState.signals_prioritized || 3
                });
                setEmergencyState(null);
                setActiveRoute([]);
                setPreviousRoute([]);
                fetchAllData();
            } else if (emergencyState) {
                setEmergencyState(prev => prev ? { ...prev, eta: data.eta || prev.eta } : null);
            }
        }
        else if (data.event === 'emergency_started') {
            const coords = data.route.map(r => [r.lat, r.lng]);
            setActiveRoute(coords);
            setPreviousRoute([]);
            setCompletionSummary(null);
            setEmergencyState({
                ambulance_id: data.ambulance_id,
                vehicle_number: data.vehicle_number || 'A102',
                hospital_name: data.hospital_name,
                hospital_score: data.hospital_score || 94,
                hospital_reasons: data.hospital_reasons || [],
                eta: data.eta,
                priority: data.priority || 'CRITICAL',
                route_changes: 0,
                time_saved: '3.8 min',
                signals_prioritized: data.signals_prioritized || 2
            });
            fetchAllData();
        }
        else if (data.event === 'route_updated') {
            // Archive current route to previous route (rendered in dashed red)
            setActiveRoute(prev => {
                if (prev.length > 0) setPreviousRoute(prev);
                return data.route.map(r => [r.lat, r.lng]);
            });

            setEmergencyState(prev => prev ? {
                ...prev,
                eta: data.new_eta,
                route_changes: (prev.route_changes || 0) + 1,
                time_saved: `${data.time_saved} min`
            } : null);

            setAiRecommendation({
                title: "DYNAMIC REROUTE APPLIED",
                reason: data.reason || "Traffic incident on primary route.",
                old_eta: data.old_eta,
                new_eta: data.new_eta,
                time_saved: data.time_saved,
                timestamp: new Date().toLocaleTimeString()
            });

            fetchAllData();
        }
        else if (data.event === 'incident_created' || data.event === 'incident_resolved') {
            fetchAllData();
        }
        else if (data.event === 'traffic_update') {
            fetchAllData();
        }
        else if (data.event === 'signal_priority') {
            fetchAllData();
        }
        else if (data.event === 'hospital_update') {
            fetchAllData();
        }
        else if (data.event === 'reset_completed') {
            setActiveRoute([]);
            setPreviousRoute([]);
            setEmergencyState(null);
            setAiRecommendation(null);
            setCompletionSummary(null);
            setLiveAlert({ type: 'INFO', message: 'Simulation baseline reset completed.' });
            fetchAllData();
        }
        else if (data.event === 'alert') {
            setLiveAlert({ title: data.title, message: data.message, severity: data.severity });
            setTimeout(() => setLiveAlert(null), 8000);
        }
    };

    const fetchAllData = async () => {
        try {
            const [ambRes, incRes, hosRes, sigRes, roaRes, statRes] = await Promise.all([
                axios.get(`${API_BASE}/ambulances`),
                axios.get(`${API_BASE}/incidents`),
                axios.get(`${API_BASE}/hospitals`),
                axios.get(`${API_BASE}/signals`),
                axios.get(`${API_BASE}/roads`),
                axios.get(`${API_BASE}/dashboard/stats`).catch(() => null)
            ]);

            setAmbulances(ambRes.data);
            setIncidents(incRes.data);
            setHospitals(hosRes.data);
            setSignals(sigRes.data);
            setRoads(roaRes.data);

            if (ambRes.data.length > 0 && !selectedAmbulanceId) {
                setSelectedAmbulanceId(ambRes.data[0].id);
            }

            if (statRes && statRes.data) {
                setKpi({
                    activeAmbulances: statRes.data.active_ambulances,
                    activeEmergencies: statRes.data.active_emergencies,
                    activeIncidents: statRes.data.active_incidents,
                    greenCorridors: statRes.data.green_corridors,
                    avgEta: `${statRes.data.avg_eta} min`,
                    timeSaved: `${statRes.data.time_saved} min`
                });
            }

            // Fetch hospital ranking for selected ambulance
            if (ambRes.data.length > 0) {
                const amb = ambRes.data[0];
                const rankRes = await axios.get(`${API_BASE}/hospitals/rank?lat=${amb.latitude}&lng=${amb.longitude}`).catch(() => null);
                if (rankRes && rankRes.data) {
                    setHospitalRanking(rankRes.data);
                }
            }
        } catch (err) {
            console.error("Error fetching data:", err);
        }
    };

    // API Simulation Triggers
    const triggerStartEmergency = async () => {
        const ambId = selectedAmbulanceId || (ambulances[0] ? ambulances[0].id : 1);
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/ambulances/${ambId}/start_emergency?priority=${emergencyPriority}`);
        } catch (err) {
            console.error("Start emergency error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerAccident = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/accident`);
        } catch (err) {
            console.error("Accident simulation error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerTrafficJam = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/traffic_jam`);
        } catch (err) {
            console.error("Traffic jam error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerRoadBlock = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/road_block`);
        } catch (err) {
            console.error("Road block error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerSignalFailure = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/signal_failure`);
        } catch (err) {
            console.error("Signal failure error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerHospitalCapacity = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/hospital_capacity`);
        } catch (err) {
            console.error("Hospital capacity error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerRecalculateRoute = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/recalculate_route`);
        } catch (err) {
            console.error("Recalculate route error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const triggerResetSimulation = async () => {
        setActionLoading(true);
        try {
            await axios.post(`${API_BASE}/simulation/reset`);
        } catch (err) {
            console.error("Reset error:", err);
        } finally {
            setActionLoading(false);
        }
    };

    // Road color coding based on traffic density
    const getRoadColor = (density, risk_score) => {
        if (risk_score > 5.0) return '#ef4444'; // Red for incident blockage
        if (density >= 0.7) return '#f97316';  // Orange / Severe
        if (density >= 0.45) return '#eab308'; // Yellow / Moderate
        return '#22c55e'; // Green / Free Flow
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex justify-between items-center shadow-lg shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-cyan-500/10 border border-cyan-500/30 p-2 rounded-lg">
                        <span className="text-xl">🚑</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black tracking-wider text-cyan-400">LIFEGRID AI</h1>
                            <span className="bg-cyan-950 border border-cyan-800 text-cyan-300 text-xs px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                                SIH PROTOTYPE
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">AI Emergency Green Corridor & Dynamic Orchestration Platform</p>
                    </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                    <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-700">
                        <span className="text-slate-400">API:</span>
                        <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE
                        </span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-700">
                        <span className="text-slate-400">WEBSOCKET:</span>
                        <span className={`font-mono font-bold flex items-center gap-1 ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                            {wsConnected ? 'LIVE' : 'DISCONNECTED'}
                        </span>
                    </div>
                    <div className="bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-700 text-cyan-400 font-mono">
                        DEMO AREA: BANGALORE CENTRAL
                    </div>
                </div>
            </header>

            {/* Live Notification Bar */}
            {liveAlert && (
                <div className="bg-rose-950 border-y border-rose-800 px-6 py-2 flex items-center justify-between text-xs text-rose-200 animate-pulse shrink-0">
                    <div className="flex items-center gap-2 font-bold">
                        <span>⚠</span>
                        <span className="uppercase tracking-wider">{liveAlert.title || 'SYSTEM ALERT'}:</span>
                        <span className="font-normal">{liveAlert.message}</span>
                    </div>
                    <button onClick={() => setLiveAlert(null)} className="text-rose-400 hover:text-white">✕</button>
                </div>
            )}

            {/* KPI Stat Cards */}
            <div className="grid grid-cols-6 gap-3 px-6 py-3 bg-slate-900/60 border-b border-slate-800/80 shrink-0">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Ambulances</span>
                    <div className="text-xl font-bold text-white mt-0.5">{kpi.activeAmbulances}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Emergencies</span>
                    <div className="text-xl font-bold text-cyan-400 mt-0.5">{emergencyState ? "1" : "0"}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Corridor Signals</span>
                    <div className="text-xl font-bold text-emerald-400 mt-0.5">
                        {emergencyState ? emergencyState.signals_prioritized || 3 : 0} PRIORITY
                    </div>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Incidents</span>
                    <div className="text-xl font-bold text-rose-400 mt-0.5">{incidents.length}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Current ETA</span>
                    <div className="text-xl font-bold text-amber-400 mt-0.5">
                        {emergencyState ? `${emergencyState.eta.toFixed(1)} min` : '--'}
                    </div>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Est. Time Saved</span>
                    <div className="text-xl font-bold text-purple-400 mt-0.5">
                        {emergencyState ? emergencyState.time_saved || '4.2 min' : '0.0 min'}
                    </div>
                </div>
            </div>

            {/* Main Application Body */}
            <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
                
                {/* Center Map Area */}
                <div className="col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative shadow-2xl flex flex-col">
                    <div className="flex-1 relative">
                        <MapContainer center={[12.9680, 77.6200]} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                                attribution='&copy; CARTO'
                                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            />

                            {/* Road Network with Traffic Colors */}
                            {roads.map(r => (
                                <Polyline
                                    key={`road-${r.id}`}
                                    positions={[[r.start_lat, r.start_lng], [r.end_lat, r.end_lng]]}
                                    color={getRoadColor(r.density, r.risk_score)}
                                    weight={4}
                                    opacity={0.65}
                                >
                                    <Popup>
                                        <div className="text-xs text-slate-900">
                                            <strong>{r.name}</strong><br/>
                                            Congestion: <span className="font-bold">{r.congestion_level}</span> ({Math.round(r.density * 100)}%)<br/>
                                            Speed Limit: {r.speed_limit} km/h (Avg: {Math.round(r.average_speed || 35)} km/h)
                                        </div>
                                    </Popup>
                                </Polyline>
                            ))}

                            {/* Prior Inactive/Blocked Route (Rendered in Dashed Red) */}
                            {previousRoute.length > 0 && (
                                <Polyline
                                    positions={previousRoute}
                                    color="#f43f5e"
                                    weight={4}
                                    dashArray="8, 8"
                                    opacity={0.7}
                                />
                            )}

                            {/* Active Green Corridor Polyline (Bright Cyan) */}
                            {activeRoute.length > 0 && (
                                <Polyline
                                    positions={activeRoute}
                                    color="#06b6d4"
                                    weight={6}
                                    opacity={0.9}
                                />
                            )}

                            {/* Traffic Signals */}
                            {signals.map(s => {
                                let signalColor = '#94a3b8';
                                if (s.current_state === 'GREEN') signalColor = '#10b981';
                                else if (s.current_state === 'FAILURE') signalColor = '#ef4444';
                                else if (s.current_state === 'RED') signalColor = '#f43f5e';

                                return (
                                    <CircleMarker
                                        key={`sig-${s.id}`}
                                        center={[s.latitude, s.longitude]}
                                        radius={s.priority_status ? 7 : 5}
                                        fillColor={signalColor}
                                        color={s.priority_status ? '#ffffff' : '#475569'}
                                        weight={s.priority_status ? 2 : 1}
                                        fillOpacity={0.9}
                                    >
                                        <Popup>
                                            <div className="text-xs text-slate-900">
                                                <strong>{s.intersection_name}</strong><br/>
                                                Status: {s.current_state}<br/>
                                                Priority Mode: {s.priority_status ? '🟢 GREEN CORRIDOR ACTIVE' : '⚪ NORMAL'}
                                            </div>
                                        </Popup>
                                    </CircleMarker>
                                );
                            })}

                            {/* Hospitals */}
                            {hospitals.map(h => (
                                <Marker
                                    key={`hosp-${h.id}`}
                                    position={[h.latitude, h.longitude]}
                                    icon={h.status === 'FULL' ? hospitalFullIcon : hospitalIcon}
                                >
                                    <Popup>
                                        <div className="text-xs text-slate-900">
                                            <strong className="text-sm">{h.name}</strong><br/>
                                            Status: <span className={h.status === 'AVAILABLE' ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>{h.status}</span><br/>
                                            Available ICU: <strong>{h.available_icu}</strong> / {h.icu_beds}<br/>
                                            Emergency Beds: <strong>{h.available_emergency_capacity}</strong>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}

                            {/* Ambulances */}
                            {ambulances.map(a => (
                                <Marker
                                    key={`amb-${a.id}`}
                                    position={[a.latitude, a.longitude]}
                                    icon={a.status === 'EN_ROUTE' ? ambulanceIcon : ambulanceIdleIcon}
                                >
                                    <Popup>
                                        <div className="text-xs text-slate-900">
                                            <strong>Ambulance: {a.vehicle_number}</strong><br/>
                                            Status: <span className="font-bold text-cyan-600">{a.status}</span><br/>
                                            Priority: {a.emergency_priority}<br/>
                                            Live ETA: {a.current_eta ? `${a.current_eta.toFixed(1)} min` : 'N/A'}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}

                            {/* Incidents */}
                            {incidents.map(i => (
                                <Marker
                                    key={`inc-${i.id}`}
                                    position={[i.latitude, i.longitude]}
                                    icon={i.type === 'ROAD_BLOCK' ? incidentBlockIcon : incidentAccidentIcon}
                                >
                                    <Popup>
                                        <div className="text-xs text-slate-900">
                                            <strong className="text-rose-600">{i.type}</strong><br/>
                                            Severity: <strong>{i.severity}</strong><br/>
                                            {i.description}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>

                        {/* Map Legend Overlay */}
                        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-lg border border-slate-800 text-[11px] text-slate-300 shadow-xl space-y-1.5">
                            <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">LIVE MAP LEGEND</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-cyan-400 rounded"></span> Active Green Corridor</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-rose-500 border-dashed border-b border-rose-500"></span> Blocked / Prior Route</div>
                            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Priority Signal (Green)</div>
                            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Signal Failure</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-emerald-500"></span> Low Traffic Road</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-amber-500"></span> Congested Road</div>
                        </div>
                    </div>
                </div>

                {/* Right Control & Telemetry Panel */}
                <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">

                    {/* Simulation Control Center */}
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                                <span>⚙</span> SIMULATION CONTROL CENTER
                            </h2>
                            {actionLoading && (
                                <span className="text-[10px] text-cyan-400 animate-pulse font-mono font-bold">PROCESSING...</span>
                            )}
                        </div>

                        {/* Start Emergency Control */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Ambulance</label>
                                    <select 
                                        value={selectedAmbulanceId || ''} 
                                        onChange={e => setSelectedAmbulanceId(Number(e.target.value))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                    >
                                        {ambulances.map(a => (
                                            <option key={a.id} value={a.id}>{a.vehicle_number} ({a.status})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Priority</label>
                                    <select 
                                        value={emergencyPriority} 
                                        onChange={e => setEmergencyPriority(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                    >
                                        <option value="CRITICAL">CRITICAL</option>
                                        <option value="HIGH">HIGH</option>
                                        <option value="MEDIUM">MEDIUM</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                onClick={triggerStartEmergency}
                                disabled={actionLoading || (emergencyState && emergencyState.eta > 0)}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-2 rounded text-xs transition duration-150 flex items-center justify-center gap-2 shadow-lg"
                            >
                                ▶ START EMERGENCY & ORCHESTRATION
                            </button>
                        </div>

                        {/* Simulation Incident Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={triggerAccident}
                                disabled={actionLoading}
                                className="bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>💥</span> SIMULATE ACCIDENT
                            </button>
                            <button
                                onClick={triggerTrafficJam}
                                disabled={actionLoading}
                                className="bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>🚗</span> TRAFFIC JAM
                            </button>
                            <button
                                onClick={triggerRoadBlock}
                                disabled={actionLoading}
                                className="bg-orange-950/70 hover:bg-orange-900 text-orange-300 border border-orange-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>🚧</span> ROAD BLOCK
                            </button>
                            <button
                                onClick={triggerSignalFailure}
                                disabled={actionLoading}
                                className="bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>🚦</span> SIGNAL FAILURE
                            </button>
                            <button
                                onClick={triggerHospitalCapacity}
                                disabled={actionLoading}
                                className="bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2 col-span-2"
                            >
                                <span>🏥</span> HOSPITAL ICU CAPACITY SPIKE
                            </button>
                            <button
                                onClick={triggerRecalculateRoute}
                                disabled={actionLoading}
                                className="bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>⚡</span> RECALCULATE A*
                            </button>
                            <button
                                onClick={triggerResetSimulation}
                                disabled={actionLoading}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded px-3 py-2 text-xs font-semibold text-left transition flex items-center gap-2"
                            >
                                <span>↻</span> RESET DEMO
                            </button>
                        </div>
                    </div>

                    {/* Active Emergency Card */}
                    {emergencyState ? (
                        <div className="bg-slate-900 p-4 rounded-xl border-l-4 border-cyan-500 shadow-xl space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                                    ACTIVE EMERGENCY ORCHESTRATION
                                </h3>
                                <span className="bg-rose-950 border border-rose-800 text-rose-300 text-[10px] px-2 py-0.5 rounded font-bold">
                                    {emergencyState.priority}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                                <div>
                                    <span className="text-slate-400 text-[10px] block">AMBULANCE</span>
                                    <span className="font-bold text-white">{emergencyState.vehicle_number}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 text-[10px] block">DESTINATION</span>
                                    <span className="font-bold text-emerald-400">{emergencyState.hospital_name}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 text-[10px] block">LIVE ETA</span>
                                    <span className="font-bold text-amber-400 text-sm">{emergencyState.eta.toFixed(1)} min</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 text-[10px] block">CORRIDOR SIGNALS</span>
                                    <span className="font-bold text-cyan-400">{emergencyState.signals_prioritized || 3} GREEN</span>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* Emergency Completed Summary Modal */}
                    {completionSummary && (
                        <div className="bg-emerald-950/80 p-4 rounded-xl border border-emerald-500/50 shadow-2xl space-y-2">
                            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                                <span>🎉</span> EMERGENCY MISSION COMPLETED
                            </div>
                            <p className="text-xs text-slate-300">Ambulance reached <strong>{completionSummary.hospital_name}</strong> safely.</p>
                            <div className="grid grid-cols-3 gap-2 text-xs bg-slate-900/90 p-2 rounded border border-emerald-900">
                                <div>
                                    <span className="text-[10px] text-slate-400 block">TIME SAVED</span>
                                    <span className="font-bold text-emerald-400">{completionSummary.time_saved}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 block">REROUTES</span>
                                    <span className="font-bold text-cyan-400">{completionSummary.route_changes}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 block">CORRIDOR</span>
                                    <span className="font-bold text-purple-400">{completionSummary.signals_prioritized} Signals</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setCompletionSummary(null)} 
                                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-xs py-1 rounded font-bold"
                            >
                                DISMISS
                            </button>
                        </div>
                    )}

                    {/* AI Dynamic Recommendation Card */}
                    {aiRecommendation && (
                        <div className="bg-slate-900 p-4 rounded-xl border-l-4 border-amber-500 shadow-xl space-y-2">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                    <span>🤖</span> AI REROUTING ENGINE
                                </h3>
                                <span className="text-[10px] text-slate-400">{aiRecommendation.timestamp}</span>
                            </div>

                            <p className="text-xs text-rose-300 font-semibold">{aiRecommendation.reason}</p>

                            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1">
                                <div className="flex justify-between text-slate-400">
                                    <span>Prior Blocked ETA:</span>
                                    <span className="text-rose-400 font-bold line-through">{aiRecommendation.old_eta.toFixed(1)} min</span>
                                </div>
                                <div className="flex justify-between text-slate-200">
                                    <span>New Optimized ETA:</span>
                                    <span className="text-emerald-400 font-bold">{aiRecommendation.new_eta.toFixed(1)} min</span>
                                </div>
                                <div className="flex justify-between text-cyan-300 font-bold border-t border-slate-800 pt-1">
                                    <span>Estimated Time Saved:</span>
                                    <span>+{aiRecommendation.time_saved} min</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hospital Intelligence Ranking Card */}
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg space-y-2.5">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                            <span>🏥</span> HOSPITAL INTELLIGENCE RANKING
                        </h3>
                        <div className="space-y-2">
                            {hospitalRanking.map((h, idx) => (
                                <div key={h.hospital.id} className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-white flex items-center gap-1">
                                            <span className="text-cyan-400 font-mono">#{idx + 1}</span> {h.hospital.name}
                                        </span>
                                        <span className="bg-cyan-950 border border-cyan-800 text-cyan-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                            Score: {h.score}/100
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                                        <span>Dist: {h.distance} km</span>
                                        <span>ICU: {h.hospital.available_icu}</span>
                                        <span>Status: {h.hospital.status}</span>
                                    </div>
                                    {h.reasons && h.reasons.length > 0 && (
                                        <div className="text-[10px] text-emerald-400/90 mt-1 border-t border-slate-800/80 pt-1">
                                            ✓ {h.reasons.slice(0, 2).join(" • ")}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
