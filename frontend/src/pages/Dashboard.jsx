import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// Custom Offline-Ready DivIcons
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
const ambulanceIdleIcon = createDivIcon('🚑', 'bg-slate-700', 'border-slate-500');
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
    const [activityLogs, setActivityLogs] = useState([
        { time: new Date().toLocaleTimeString(), text: 'LIFEGRID AI Command Center initialized', type: 'info' }
    ]);

    const [kpi, setKpi] = useState({
        activeAmbulances: 0,
        totalAmbulances: 1,
        activeEmergencies: 0,
        activeIncidents: 0,
        hospitalsReady: 3,
        greenCorridors: 0,
        signalsPrioritized: 0,
        avgEta: '0.0 min',
        timeSaved: '0.0 min'
    });

    const wsRef = useRef(null);
    const logEndRef = useRef(null);

    const addLog = (text, type = 'info') => {
        const time = new Date().toLocaleTimeString();
        setActivityLogs(prev => [
            ...prev.slice(-30), // keep last 30 logs
            { time, text, type }
        ]);
    };

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [activityLogs]);

    // Initial Fetch & WebSocket setup
    useEffect(() => {
        fetchAllData();

        let reconnectTimer;
        const connectWebSocket = () => {
            const defaultWs = window.location.protocol === 'https:' 
                ? `wss://${window.location.hostname}:8000/ws/realtime` 
                : 'ws://localhost:8000/ws/realtime';
            const wsUrl = import.meta.env.VITE_WS_URL || defaultWs;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setWsConnected(true);
                addLog('WebSocket telemetry link established', 'success');
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
                addLog('WebSocket link interrupted - attempting reconnection...', 'warning');
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
                    ? { 
                        ...a, 
                        latitude: data.latitude, 
                        longitude: data.longitude, 
                        status: data.status || a.status, 
                        current_eta: data.eta !== undefined ? data.eta : a.current_eta,
                        speed: data.speed !== undefined ? data.speed : a.speed,
                        distance_km: data.distance_km !== undefined ? data.distance_km : a.distance_km
                    }
                    : a
            ));

            if (emergencyState && emergencyState.ambulance_id === data.ambulance_id) {
                setEmergencyState(prev => prev ? {
                    ...prev,
                    eta: data.eta !== undefined ? data.eta : prev.eta,
                    speed: data.speed !== undefined ? data.speed : prev.speed,
                    distance_km: data.distance_km !== undefined ? data.distance_km : prev.distance_km
                } : null);
            }
        }
        else if (data.event === 'emergency_started') {
            const coords = data.route.map(r => [r.lat, r.lng]);
            setActiveRoute(coords);
            setPreviousRoute([]);
            setCompletionSummary(null);
            setAiRecommendation(null);
            
            const ambVehicle = data.vehicle_number || 'A102';
            setEmergencyState({
                ambulance_id: data.ambulance_id,
                vehicle_number: ambVehicle,
                hospital_name: data.hospital_name,
                hospital_score: data.hospital_score || 95,
                hospital_reasons: data.hospital_reasons || [],
                eta: data.eta,
                original_eta: data.eta,
                priority: data.priority || 'CRITICAL',
                route_changes: 0,
                time_saved: '0.0 min',
                signals_prioritized: data.signals_prioritized || 3,
                speed: 48.0,
                distance_km: data.distance_km || 4.2
            });

            addLog(`Emergency ${ambVehicle} initiated [${data.priority || 'CRITICAL'}]`, 'emergency');
            addLog(`AI Hospital Intelligence selected ${data.hospital_name}`, 'ai');
            addLog(`A* Corridor generated: ${coords.length} waypoints, ETA ${data.eta.toFixed(1)} min`, 'ai');
            addLog(`Green Corridor active: ${data.signals_prioritized || 3} signals prioritized`, 'corridor');

            fetchAllData();
        }
        else if (data.event === 'route_updated') {
            setActiveRoute(prev => {
                if (prev.length > 0) setPreviousRoute(prev);
                return data.route.map(r => [r.lat, r.lng]);
            });

            const savedMin = data.time_saved ? Number(data.time_saved) : 3.8;
            setEmergencyState(prev => prev ? {
                ...prev,
                eta: data.new_eta,
                route_changes: (prev.route_changes || 0) + 1,
                time_saved: `${savedMin.toFixed(1)} min`
            } : null);

            setAiRecommendation({
                incident: "ACCIDENT / ROAD BLOCK",
                road_status: "BLOCKED",
                old_eta: data.old_eta,
                new_eta: data.new_eta,
                time_saved: savedMin,
                reason: data.reason || "Obstruction detected on active corridor",
                algorithm: "A* Dynamic Routing",
                status: "ROUTE OPTIMIZED",
                timestamp: new Date().toLocaleTimeString()
            });

            addLog(`Incident detected: ${data.reason || 'Road obstruction'}`, 'alert');
            addLog(`A* Dynamic Reroute complete: ${data.old_eta.toFixed(1)}m → ${data.new_eta.toFixed(1)}m (+${savedMin.toFixed(1)}m saved)`, 'ai');
            fetchAllData();
        }
        else if (data.event === 'emergency_completed') {
            setCompletionSummary({
                ambulance_id: data.ambulance_id,
                vehicle_number: data.vehicle_number || 'A102',
                hospital_name: data.hospital_name,
                original_eta: emergencyState ? `${emergencyState.original_eta?.toFixed(1) || 8.5} min` : '10.2 min',
                final_eta: '0.0 min',
                time_saved: emergencyState?.time_saved || data.time_saved || '4.2 min',
                route_changes: emergencyState?.route_changes || data.route_changes || 1,
                signals_optimized: emergencyState?.signals_prioritized || data.signals_optimized || 4,
                arrival_time: data.arrival_time || new Date().toLocaleTimeString()
            });

            addLog(`Ambulance reached destination ${data.hospital_name}! Emergency complete.`, 'success');
            setEmergencyState(null);
            setActiveRoute([]);
            setPreviousRoute([]);
            fetchAllData();
        }
        else if (data.event === 'incident_created') {
            addLog(`Incident reported: ${data.type || 'ACCIDENT'} (${data.severity || 'HIGH'})`, 'alert');
            fetchAllData();
        }
        else if (data.event === 'traffic_update') {
            addLog(`Traffic density updated: ${data.congestion_level || 'SEVERE'}`, 'info');
            fetchAllData();
        }
        else if (data.event === 'signal_priority') {
            addLog(`Signal state updated for intersection #${data.signal_id}: ${data.state}`, 'corridor');
            fetchAllData();
        }
        else if (data.event === 'hospital_update') {
            addLog(`Hospital capacity change: ${data.name || 'Hospital'} ICU full`, 'alert');
            fetchAllData();
        }
        else if (data.event === 'reset_completed') {
            setActiveRoute([]);
            setPreviousRoute([]);
            setEmergencyState(null);
            setAiRecommendation(null);
            setCompletionSummary(null);
            setLiveAlert(null);
            setActivityLogs([{ time: new Date().toLocaleTimeString(), text: 'System initialized & baseline restored', type: 'info' }]);
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
                    totalAmbulances: statRes.data.total_ambulances || ambRes.data.length,
                    activeEmergencies: statRes.data.active_emergencies,
                    activeIncidents: statRes.data.active_incidents,
                    hospitalsReady: statRes.data.hospitals_ready || hosRes.data.filter(h => h.status === 'AVAILABLE').length,
                    greenCorridors: statRes.data.green_corridors,
                    signalsPrioritized: statRes.data.signals_prioritized || 0,
                    avgEta: `${statRes.data.avg_eta} min`,
                    timeSaved: `${statRes.data.time_saved} min`
                });
            }

            // Fetch hospital ranking
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

    // Simulation Trigger Handlers
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

    const getRoadColor = (density, risk_score) => {
        if (risk_score > 5.0) return '#ef4444'; // Red for blocked/accident
        if (density >= 0.7) return '#f97316';  // Orange / Severe
        if (density >= 0.45) return '#eab308'; // Yellow / Moderate
        return '#10b981'; // Green / Clear
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex justify-between items-center shadow-lg shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-cyan-500/15 border border-cyan-500/40 p-2 rounded-lg text-cyan-400 font-bold text-xl">
                        🚑
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black tracking-wider text-cyan-400">LIFEGRID AI</h1>
                            <span className="bg-cyan-950 border border-cyan-800 text-cyan-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                                SIH 2026 PROD
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">AI Emergency Green Corridor & Dynamic Traffic Orchestration Platform</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-md border border-slate-700">
                        <span className="text-slate-400 font-medium">SYSTEM:</span>
                        <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-md border border-slate-700">
                        <span className="text-slate-400 font-medium">WEBSOCKET:</span>
                        <span className={`font-mono font-bold flex items-center gap-1 ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                            {wsConnected ? 'LIVE' : 'RECONNECTING'}
                        </span>
                    </div>
                    <div className="bg-slate-800/90 px-3 py-1.5 rounded-md border border-slate-700 text-cyan-400 font-mono text-xs font-semibold">
                        {emergencyState ? '🚨 EMERGENCY ACTIVE' : '● SYSTEM READY'}
                    </div>
                </div>
            </header>

            {/* Live Notification Banner */}
            {liveAlert && (
                <div className="bg-rose-950/90 border-y border-rose-800 px-6 py-2 flex items-center justify-between text-xs text-rose-200 animate-pulse shrink-0">
                    <div className="flex items-center gap-2 font-bold">
                        <span>⚠</span>
                        <span className="uppercase tracking-wider">{liveAlert.title || 'SYSTEM ALERT'}:</span>
                        <span className="font-normal">{liveAlert.message}</span>
                    </div>
                    <button onClick={() => setLiveAlert(null)} className="text-rose-400 hover:text-white font-bold">✕</button>
                </div>
            )}

            {/* Top Live KPI Dashboard Bar */}
            <div className="grid grid-cols-7 gap-3 px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 shrink-0">
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Active Emergencies</span>
                    <div className="text-lg font-black text-cyan-400 mt-0.5">{emergencyState ? "1" : "0"}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Ambulances</span>
                    <div className="text-lg font-black text-white mt-0.5">{kpi.totalAmbulances}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Hospitals Ready</span>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">{kpi.hospitalsReady}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Green Corridors</span>
                    <div className="text-lg font-black text-purple-400 mt-0.5">{emergencyState ? "1" : "0"}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Signals Prioritized</span>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                        {emergencyState ? emergencyState.signals_prioritized || 3 : 0}
                    </div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Current ETA</span>
                    <div className="text-lg font-black text-amber-400 mt-0.5">
                        {emergencyState ? `${emergencyState.eta.toFixed(1)}m` : '--'}
                    </div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Time Saved</span>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                        {emergencyState ? emergencyState.time_saved || '4.2 min' : '0.0 min'}
                    </div>
                </div>
            </div>

            {/* Main Center Area */}
            <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
                
                {/* Left & Center: Live Map & Activity Log */}
                <div className="col-span-8 flex flex-col gap-3 min-h-0 overflow-hidden">
                    
                    {/* Live Map Box */}
                    <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative shadow-2xl">
                        <MapContainer 
                            center={[12.9680, 77.6200]} 
                            zoom={13} 
                            scrollWheelZoom={true} 
                            style={{ height: '100%', width: '100%', background: '#0f172a' }}
                        >
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
                                    opacity={0.8}
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
                                            Emergency Capacity: <strong>{h.available_emergency_capacity}</strong>
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
                                            Speed: {a.speed ? `${a.speed} km/h` : '48 km/h'}<br/>
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

                        {/* Map Overlay Legend */}
                        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md p-2.5 rounded-lg border border-slate-800 text-[10px] text-slate-300 shadow-xl space-y-1">
                            <div className="font-bold text-slate-200 border-b border-slate-700 pb-0.5">LIVE MAP LAYERS</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-cyan-400 rounded"></span> Active Green Corridor</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-rose-500 border-dashed border-b border-rose-500"></span> Blocked / Detour Prior Route</div>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Priority Signal (Green)</div>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Signal Failure</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-emerald-500"></span> Free Flow Road</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-1 bg-amber-500"></span> Congested Road</div>
                        </div>
                    </div>

                    {/* Bottom Activity Event Stream */}
                    <div className="h-28 bg-slate-900 rounded-xl border border-slate-800 p-2.5 shadow-lg flex flex-col shrink-0">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800 pb-1 mb-1">
                            <span className="flex items-center gap-1 text-cyan-400 font-mono">
                                <span>⚡</span> REAL-TIME COMMAND EVENT LOG
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{activityLogs.length} events logged</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] pr-1">
                            {activityLogs.map((log, idx) => (
                                <div key={idx} className="flex items-start gap-2 leading-tight">
                                    <span className="text-slate-500 shrink-0">{log.time}</span>
                                    <span className={
                                        log.type === 'emergency' ? 'text-cyan-300 font-semibold' :
                                        log.type === 'alert' ? 'text-rose-400 font-semibold' :
                                        log.type === 'ai' ? 'text-purple-300' :
                                        log.type === 'corridor' ? 'text-emerald-400' :
                                        log.type === 'success' ? 'text-emerald-300 font-bold' :
                                        'text-slate-300'
                                    }>
                                        {log.text}
                                    </span>
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                </div>

                {/* Right Column: Controls, Telemetry, AI Recommendation, Hospitals */}
                <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">

                    {/* Simulation Control Center */}
                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-lg shrink-0">
                        <div className="flex items-center justify-between mb-2.5">
                            <h2 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                <span>⚙</span> SIMULATION CONTROL CENTER
                            </h2>
                            {actionLoading && (
                                <span className="text-[10px] text-cyan-400 animate-pulse font-mono font-bold">PROCESSING...</span>
                            )}
                        </div>

                        {/* Start Emergency Control Box */}
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 mb-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Ambulance Unit</label>
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
                                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Priority Level</label>
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

                        {/* Interactive Scenario Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={triggerAccident}
                                disabled={actionLoading}
                                className="bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>💥</span> SIMULATE ACCIDENT
                            </button>
                            <button
                                onClick={triggerTrafficJam}
                                disabled={actionLoading}
                                className="bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>🚗</span> TRAFFIC JAM
                            </button>
                            <button
                                onClick={triggerRoadBlock}
                                disabled={actionLoading}
                                className="bg-orange-950/70 hover:bg-orange-900 text-orange-300 border border-orange-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>🚧</span> ROAD BLOCK
                            </button>
                            <button
                                onClick={triggerSignalFailure}
                                disabled={actionLoading}
                                className="bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>🚦</span> SIGNAL FAILURE
                            </button>
                            <button
                                onClick={triggerHospitalCapacity}
                                disabled={actionLoading}
                                className="bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5 col-span-2"
                            >
                                <span>🏥</span> HOSPITAL ICU CAPACITY SPIKE
                            </button>
                            <button
                                onClick={triggerRecalculateRoute}
                                disabled={actionLoading}
                                className="bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>⚡</span> RECALCULATE A*
                            </button>
                            <button
                                onClick={triggerResetSimulation}
                                disabled={actionLoading}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-semibold text-left transition flex items-center gap-1.5"
                            >
                                <span>↻</span> RESET DEMO
                            </button>
                        </div>
                    </div>

                    {/* Telemetry Panel */}
                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-lg shrink-0 space-y-2">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                <span>📡</span> EMERGENCY TELEMETRY
                            </h3>
                            <span className={emergencyState ? "bg-rose-950 border border-rose-800 text-rose-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase animate-pulse" : "bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded font-bold"}>
                                {emergencyState ? "EN ROUTE" : "STANDBY"}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Ambulance</span>
                                <span className="font-bold text-white font-mono">{emergencyState ? emergencyState.vehicle_number : 'A102'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Priority</span>
                                <span className="font-bold text-rose-400">{emergencyState ? emergencyState.priority : 'STANDARD'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Speed</span>
                                <span className="font-bold text-white font-mono">{emergencyState ? `${emergencyState.speed || 48} km/h` : '0 km/h'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Live ETA</span>
                                <span className="font-bold text-amber-400 font-mono">{emergencyState ? `${emergencyState.eta.toFixed(1)} min` : '--'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Target Hospital</span>
                                <span className="font-bold text-emerald-400 truncate block">{emergencyState ? emergencyState.hospital_name : 'City Hospital'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Distance Remaining</span>
                                <span className="font-bold text-cyan-300 font-mono">{emergencyState ? `${emergencyState.distance_km || 3.2} km` : '--'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Corridor Status</span>
                                <span className="font-bold text-emerald-400">{emergencyState ? 'ACTIVE 🟢' : 'INACTIVE ⚪'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Time Saved</span>
                                <span className="font-bold text-purple-400">{emergencyState ? emergencyState.time_saved || '4.2 min' : '0.0 min'}</span>
                            </div>
                        </div>
                    </div>

                    {/* AI Dynamic Rerouting Card */}
                    {aiRecommendation && (
                        <div className="bg-slate-900 p-3.5 rounded-xl border-l-4 border-amber-500 shadow-xl space-y-2 shrink-0">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                    <span>🤖</span> AI REROUTING ENGINE
                                </h3>
                                <span className="text-[10px] text-slate-400 font-mono">{aiRecommendation.timestamp}</span>
                            </div>

                            <div className="text-xs space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Incident:</span>
                                    <span className="text-rose-400 font-bold">{aiRecommendation.incident}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Road Status:</span>
                                    <span className="text-rose-400 font-bold">{aiRecommendation.road_status}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-slate-800">
                                    <span className="text-slate-400">Original ETA:</span>
                                    <span className="text-rose-300 line-through">{aiRecommendation.old_eta.toFixed(1)} min</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-200">New Detour ETA:</span>
                                    <span className="text-emerald-400 font-bold">{aiRecommendation.new_eta.toFixed(1)} min</span>
                                </div>
                                <div className="flex justify-between text-cyan-300 font-bold pt-1 border-t border-slate-800">
                                    <span>Estimated Time Saved:</span>
                                    <span>+{aiRecommendation.time_saved} min</span>
                                </div>
                                <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800 text-[10px]">
                                    <span>Algorithm:</span>
                                    <span className="text-purple-300">{aiRecommendation.algorithm}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hospital Intelligence Ranking Card */}
                    <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-lg space-y-2 shrink-0">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                <span>🏥</span> AI HOSPITAL SELECTION & RANKING
                            </h3>
                        </div>
                        <div className="space-y-1.5">
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
                                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
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

            {/* Emergency Completion Summary Modal Overlay */}
            {completionSummary && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border-2 border-emerald-500/70 p-6 rounded-2xl shadow-2xl max-w-md w-full space-y-4 animate-scaleIn">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/20 border border-emerald-500/40 p-3 rounded-full text-2xl">
                                🚑
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-emerald-400 tracking-wide">EMERGENCY MISSION COMPLETED</h2>
                                <p className="text-xs text-slate-400">Ambulance arrived at destination safely.</p>
                            </div>
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
                            <div className="flex justify-between border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Ambulance:</span>
                                <span className="font-bold text-white">{completionSummary.vehicle_number}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Hospital Reached:</span>
                                <span className="font-bold text-emerald-400">{completionSummary.hospital_name}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Arrival Time:</span>
                                <span className="text-white">{completionSummary.arrival_time}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Estimated Time Saved:</span>
                                <span className="font-bold text-purple-400">{completionSummary.time_saved}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Dynamic Reroutes:</span>
                                <span className="font-bold text-cyan-400">{completionSummary.route_changes}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Corridor Signals Optimized:</span>
                                <span className="font-bold text-emerald-400">{completionSummary.signals_optimized} Signals</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setCompletionSummary(null)}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-lg text-xs transition"
                            >
                                CLOSE SUMMARY
                            </button>
                            <button
                                onClick={() => {
                                    setCompletionSummary(null);
                                    triggerResetSimulation();
                                }}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs transition"
                            >
                                ↻ RESET DEMO
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
