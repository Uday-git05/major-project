"use client";

import { Billboard, Line, OrbitControls, Text as DreiText } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw, WifiOff } from "lucide-react";
import type { Mesh } from "three";
import { buildTwinPaths, deviceReadings, deviceSecurityState, positionDevices, type DeviceSecurityState, type TwinPath, type TwinPosition } from "@/features/digital-twin";
import { titleCase } from "@/lib/format";
import type { Attack, Device, PolicyState, Topology } from "@/types/api";
import { Badge, Panel } from "./ui";

interface Props {
  topology: Topology;
  devices: Device[];
  attacks: Attack[];
  policy: PolicyState;
  selectedDeviceId: string | null;
  focusedDeviceId?: string;
  focusedCorrelationId?: string;
  onSelectDevice: (deviceId: string | null) => void;
  onShowTopology: () => void;
}

const stateColors: Record<DeviceSecurityState, string> = {
  online: "#0f8f7a",
  offline: "#718096",
  isolated: "#d99a20",
  under_attack: "#d84b4b",
};

export function FarmDigitalTwin(props: Props) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);
  const motionAllowed = useSyncExternalStore(subscribeMotionPreference, getMotionPreference, () => true);
  const positions = useMemo(() => positionDevices(props.devices), [props.devices]);
  const focusedAttacks = useMemo(() => props.focusedCorrelationId ? props.attacks.filter((attack) => attack.correlation_id === props.focusedCorrelationId) : [], [props.attacks, props.focusedCorrelationId]);
  const paths = useMemo(() => buildTwinPaths(props.topology, focusedAttacks, props.policy, positions), [props.topology, focusedAttacks, props.policy, positions]);
  const selected = props.devices.find((device) => device.device_id === props.selectedDeviceId) ?? null;
  const focusedAttack = focusedAttacks.find((attack) => ["scheduled", "active"].includes(attack.status));

  useEffect(() => {
    const check = window.setTimeout(() => setWebglAvailable(hasWebglSupport()), 0);
    return () => window.clearTimeout(check);
  }, []);
  const scene = webglAvailable === false
    ? <SceneFallback onShowTopology={props.onShowTopology} />
    : webglAvailable === null
      ? <div className="twin-loading" role="status">Checking 3D compatibility…</div>
      : <TwinErrorBoundary fallback={<SceneFallback onShowTopology={props.onShowTopology} />}>
        <div className="twin-canvas-wrap" data-testid="farm-3d-scene">
          <Canvas key={cameraRevision} shadows frameloop={motionAllowed ? "always" : "demand"} camera={{ position: [11.8, 11.5, 14.5], fov: 36, near: 0.1, far: 90 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
            <FarmScene {...props} attacks={focusedAttacks} selectedDeviceId={props.selectedDeviceId} positions={positions} paths={paths} onHoverDevice={setHoveredDeviceId} hoveredDeviceId={hoveredDeviceId} />
            <OrbitControls makeDefault target={[0, 0.45, 0]} minDistance={10} maxDistance={23} minPolarAngle={0.42} maxPolarAngle={1.38} enableDamping dampingFactor={0.08} />
          </Canvas>
          <div className="twin-scene-topline"><span>Simulated IoT environment · live runtime state</span>{focusedAttack && <span className="twin-focused-scenario">Focused scenario · {titleCase(focusedAttack.attack_type.replaceAll("_", " "))}</span>}</div>
          <button className="twin-reset button" onClick={() => setCameraRevision((value) => value + 1)}><RotateCcw size={16} />Reset View</button>
        </div>
      </TwinErrorBoundary>;

  return <Panel title="Advanced 3D Farm View" kicker="Simulated IoT environment · devices and readings reflect the virtual testbed, not physical equipment." className="farm-twin-panel" action={<TwinLegend />}>
    <div className="twin-workspace">{scene}<div className="twin-inspector-rail">
      <label className="twin-device-picker">Inspect a runtime device<select value={selected?.device_id ?? ""} onChange={event => props.onSelectDevice(event.target.value || null)}><option value="">Choose device</option>{props.devices.map(device => <option key={device.device_id} value={device.device_id}>{device.name}</option>)}</select></label>
      <DeviceInspector device={selected} attacks={props.attacks} policy={props.policy} onClose={() => props.onSelectDevice(null)} />
      <p className="twin-interaction-help">Drag to orbit · Scroll to zoom · Select a marker or its label to inspect · <button type="button" onClick={() => props.onSelectDevice(null)}>Clear selection</button></p>
      {props.focusedDeviceId && <p className="twin-interaction-help">Focused target: {props.devices.find(device => device.device_id === props.focusedDeviceId)?.name ?? props.focusedDeviceId}. Target emphasis marks the active scenario only.</p>}
    </div></div>
  </Panel>;
}

function getMotionPreference() {
  return typeof window.matchMedia !== "function" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeMotionPreference(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function FarmScene({ devices, attacks, policy, selectedDeviceId, focusedDeviceId, onSelectDevice, positions, paths, onHoverDevice, hoveredDeviceId }: Props & { positions: Map<string, TwinPosition>; paths: TwinPath[]; onHoverDevice: (id: string | null) => void; hoveredDeviceId: string | null }) {
  return <>
    <color attach="background" args={["#cfe5f2"]} />
    <fog attach="fog" args={["#cfe5f2", 24, 48]} />
    <ambientLight intensity={1.15} />
    <hemisphereLight args={["#e9f7ff", "#58734a", 1.15]} />
    <directionalLight position={[7, 13, 8]} intensity={2.1} color="#fff5dc" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <directionalLight position={[-7, 6, -5]} intensity={0.55} color="#d3ebff" />
    <FarmEnvironment />
    {paths.map((path) => <CommunicationPath key={path.id} path={path} />)}
    {devices.map((device) => {
      const position = positions.get(device.device_id);
      if (!position) return null;
      return <DeviceMarker key={device.device_id} device={device} position={position} state={deviceSecurityState(device, attacks, policy)} selected={selectedDeviceId === device.device_id} hovered={hoveredDeviceId === device.device_id} focused={focusedDeviceId === device.device_id} onHover={value => onHoverDevice(value ? device.device_id : null)} onSelect={() => onSelectDevice(device.device_id)} />;
    })}
  </>;
}

function FarmEnvironment() {
  const treePositions: TwinPosition[] = [[-6.3, 0, -3.6], [-4.9, 0, -4.1], [-2.5, 0, -4.2], [2.4, 0, -4.1], [4.9, 0, -3.9], [6.2, 0, -2.5], [-6.3, 0, 2.9], [6.1, 0, 3.1], [4.9, 0, 4.0]];
  const cropRows = [-2.9, -2.15, -1.4, -0.65, 0.1, 0.85, 1.6];
  const cropPlants = cropRows.flatMap((z, row) => Array.from({ length: 11 }, (_, index) => ({ x: -4.45 + index * 0.82, z, row, index })));
  return <group>
    {/* A full field lot with cultivated soil, grass margins and a farm lane. */}
    <mesh position={[0, -0.19, 0]} receiveShadow><boxGeometry args={[14.6, 0.36, 10.4]} /><meshStandardMaterial color="#8cac65" roughness={1} /></mesh>
    <mesh position={[-0.75, 0.006, 0]}><boxGeometry args={[8.7, 0.04, 5.5]} /><meshStandardMaterial color="#684936" roughness={1} /></mesh>
    {cropPlants.map((plant) => <CropPlant key={`${plant.row}-${plant.index}`} position={[plant.x, 0.04, plant.z]} />)}
    <mesh position={[2.8, 0.02, 0.25]} rotation={[0, -0.13, 0]}><boxGeometry args={[1.25, 0.05, 9.6]} /><meshStandardMaterial color="#dfd0a9" roughness={1} /></mesh>
    <mesh position={[-4.6, 0.01, -0.1]} rotation={[0, 0.08, 0]}><boxGeometry args={[1.0, 0.04, 8.7]} /><meshStandardMaterial color="#dfd0a9" roughness={1} /></mesh>
    {/* The control shed: neutral walls, pitched roof, door, windows and a rooftop gateway antenna. */}
    <Farmhouse />
    {/* Pump basin and visible blue irrigation main with branch lines across the beds. */}
    <WaterBasin position={[-3.5, 0.03, 3.25]} />
    <Pipe start={[-3.2, 0.35, 2.55]} end={[1.8, 0.35, 2.55]} radius={0.12} color="#5798b6" />
    <Pipe start={[1.8, 0.35, 2.55]} end={[1.8, 0.35, -2.65]} radius={0.09} color="#6aa8bd" />
    {[-2.75, -1.35, 0.05, 1.35].map((z) => <Pipe key={z} start={[-3.4, 0.25, z]} end={[1.8, 0.25, z]} radius={0.035} color="#8bb6b2" />)}
    {/* Field weather mast location and low, repeating perimeter trees. */}
    {treePositions.map((position, index) => <Tree key={index} position={position} variant={index % 3} />)}
    <FarmFence />
  </group>;
}

function CropPlant({ position }: { position: TwinPosition }) {
  return <group position={[...position]}>
    <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.035, 0.045, 0.27, 5]} /><meshStandardMaterial color="#71893d" /></mesh>
    <mesh position={[-0.12, 0.18, 0]} rotation={[0, 0, 0.7]}><coneGeometry args={[0.12, 0.34, 5]} /><meshStandardMaterial color="#4b873d" /></mesh>
    <mesh position={[0.12, 0.22, 0.04]} rotation={[0, 0, -0.7]}><coneGeometry args={[0.12, 0.36, 5]} /><meshStandardMaterial color="#68a348" /></mesh>
  </group>;
}

function Farmhouse() {
  return <group position={[-5.2, 0, -2.2]}>
    <mesh position={[0, 0.82, 0]} castShadow receiveShadow><boxGeometry args={[2.25, 1.62, 1.85]} /><meshStandardMaterial color="#e8e2cf" roughness={0.9} /></mesh>
    <mesh position={[0, 1.76, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1.65, 0.82, 4]} /><meshStandardMaterial color="#53696a" roughness={0.88} /></mesh>
    <mesh position={[0, 0.62, 0.94]}><boxGeometry args={[0.43, 0.9, 0.04]} /><meshStandardMaterial color="#8c6749" /></mesh>
    {[-0.68, 0.68].map((x) => <mesh key={x} position={[x, 1.02, 0.95]}><boxGeometry args={[0.48, 0.42, 0.05]} /><meshStandardMaterial color="#8ac0cf" /></mesh>)}
    <mesh position={[0, 2.15, -0.45]}><cylinderGeometry args={[0.08, 0.08, 0.95, 8]} /><meshStandardMaterial color="#4d5f5d" /></mesh>
    <mesh position={[0, 2.64, -0.45]}><sphereGeometry args={[0.15, 10, 8]} /><meshStandardMaterial color="#2386a2" emissive="#176b84" emissiveIntensity={0.35} /></mesh>
  </group>;
}

function Tree({ position, variant }: { position: TwinPosition; variant: number }) {
  const leafColor = ["#53834d", "#689354", "#789a5b"][variant];
  return <group position={[...position]}>
    <mesh position={[0, 0.66, 0]} castShadow><cylinderGeometry args={[0.13, 0.2, 1.32, 7]} /><meshStandardMaterial color="#76533a" /></mesh>
    <mesh position={[0, 1.65, 0]} castShadow><coneGeometry args={[0.82, 1.55, 7]} /><meshStandardMaterial color={leafColor} roughness={1} /></mesh>
    <mesh position={[0.05, 2.3, 0.02]}><coneGeometry args={[0.56, 1.18, 7]} /><meshStandardMaterial color="#6e9857" roughness={1} /></mesh>
  </group>;
}

function Pipe({ start, end, radius, color }: { start: TwinPosition; end: TwinPosition; radius: number; color: string }) {
  const midpoint: TwinPosition = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const angle = Math.atan2(end[2] - start[2], end[0] - start[0]);
  return <mesh position={[...midpoint]} rotation={[0, -angle, Math.PI / 2]}><cylinderGeometry args={[radius, radius, length, 8]} /><meshStandardMaterial color={color} roughness={0.62} /></mesh>;
}

function WaterBasin({ position }: { position: TwinPosition }) {
  return <group position={[...position]}>
    <mesh position={[0, 0.13, 0]}><cylinderGeometry args={[1.0, 0.92, 0.28, 20]} /><meshStandardMaterial color="#a98b62" roughness={1} /></mesh>
    <mesh position={[0, 0.29, 0]}><cylinderGeometry args={[0.79, 0.79, 0.04, 20]} /><meshStandardMaterial color="#5faec5" metalness={0.1} roughness={0.2} /></mesh>
    <mesh position={[1.14, 0.32, -0.15]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.33, 0.33, 0.54, 12]} /><meshStandardMaterial color="#51717b" metalness={0.32} roughness={0.48} /></mesh>
    <mesh position={[1.48, 0.35, -0.15]}><cylinderGeometry args={[0.09, 0.09, 0.22, 10]} /><meshStandardMaterial color="#4f9bb7" /></mesh>
  </group>;
}

function FarmFence() {
  const posts: TwinPosition[] = [[-6.8, 0, -4.6], [-4.5, 0, -4.6], [-2.2, 0, -4.6], [0.1, 0, -4.6], [2.4, 0, -4.6], [4.7, 0, -4.6], [6.8, 0, -4.6], [-6.8, 0, 4.55], [-4.5, 0, 4.55], [-2.2, 0, 4.55], [0.1, 0, 4.55], [2.4, 0, 4.55], [4.7, 0, 4.55], [6.8, 0, 4.55]];
  return <group>{posts.map((position, i) => <mesh key={i} position={[position[0], 0.48, position[2]]}><boxGeometry args={[0.1, 0.9, 0.1]} /><meshStandardMaterial color="#8d7559" /></mesh>)}
    {[-4.6, 4.55].map((z) => <group key={z}>{[0.24, 0.66].map((y) => <mesh key={y} position={[0, y, z]}><boxGeometry args={[13.6, 0.07, 0.07]} /><meshStandardMaterial color="#b59a75" /></mesh>)}</group>)}
  </group>;
}

function DeviceMarker({ device, position, state, selected, hovered, focused, onHover, onSelect }: { device: Device; position: TwinPosition; state: DeviceSecurityState; selected: boolean; hovered: boolean; focused: boolean; onHover: (value: boolean) => void; onSelect: () => void }) {
  const color = stateColors[state];
  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);
  const pointer = (event: ThreeEvent<PointerEvent>, value: boolean) => { event.stopPropagation(); onHover(value); document.body.style.cursor = value ? "pointer" : "auto"; };
  return <group position={[...position]} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={(event) => pointer(event, true)} onPointerOut={(event) => pointer(event, false)}>
    <DeviceShape kind={device.device_type} color={color} emphasized={hovered || selected} />
    <mesh position={[0, -position[1] + 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[selected ? 0.47 : 0.39, selected ? 0.55 : 0.43, 28]} /><meshBasicMaterial color={selected ? "#287bd1" : color} transparent opacity={selected ? 0.9 : 0.55} /></mesh>
    {focused && <mesh position={[0, -position[1] + 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.6, 0.66, 28]} /><meshBasicMaterial color="#6d5ce7" /></mesh>}
    <Billboard position={[0, markerLabelHeight(device.device_type), 0]}>
      <mesh position={[0, 0.22, -0.035]}><planeGeometry args={[2.25, 0.72]} /><meshBasicMaterial color={selected ? "#eef4ff" : "#ffffff"} transparent opacity={0.94} depthWrite={false} /></mesh>
      <DreiText position={[0, 0.22, 0]} fontSize={0.145} lineHeight={1.25} maxWidth={2.15} textAlign="center" anchorX="center" anchorY="middle" color="#1c3446" outlineWidth={0.003} outlineColor="#ffffff">
        {`${shortDeviceName(device)}\n${deviceReadings(device).slice(0, 2).map((reading) => reading.value).join(" · ") || (device.device_type === "pump_controller" ? titleCase(String(device.telemetry_state.pump_on ?? "Off")) : titleCase(state))}\n${device.device_type === "gateway" ? "Gateway · " : ""}${titleCase(state)}`}
      </DreiText>
    </Billboard>
  </group>;
}

function markerLabelHeight(kind: string) {
  if (kind === "weather_node") return 3.15;
  if (kind === "gateway") return 2.4;
  if (kind === "pump_controller") return 1.3;
  return 1.15;
}

function shortDeviceName(device: Device) {
  if (device.device_type === "weather_node") return "Weather Station";
  return device.device_type === "soil_moisture_sensor" ? device.name.replace("Soil Moisture Sensor", "Soil Sensor") : device.name;
}

function DeviceShape({ kind, color, emphasized }: { kind: string; color: string; emphasized: boolean }) {
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emphasized ? 0.32 : 0.06} roughness={0.55} />;
  if (kind === "gateway") return <group><mesh position={[0, 0.24, 0]}>{/* control-room gateway */}<boxGeometry args={[0.72, 0.48, 0.62]} />{material}</mesh><mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.035, 0.035, 0.52, 8]} />{material}</mesh><mesh position={[0, 0.98, 0]}><sphereGeometry args={[0.08, 12, 8]} />{material}</mesh></group>;
  if (kind === "weather_node") return <group><mesh><cylinderGeometry args={[0.055, 0.07, 1.8, 10]} />{material}</mesh><mesh position={[0, 0.94, 0]}><sphereGeometry args={[0.19, 12, 8]} />{material}</mesh><mesh position={[0, 0.66, 0]}><boxGeometry args={[0.68, 0.08, 0.08]} />{material}</mesh></group>;
  if (kind === "pump_controller") return <group><mesh><boxGeometry args={[0.66, 0.66, 0.55]} />{material}</mesh><mesh position={[0, 0.05, 0.3]}><circleGeometry args={[0.09, 18]} /><meshStandardMaterial color="#f7fbfa" /></mesh></group>;
  if (kind === "water_flow_sensor") return <group rotation={[0, 0, Math.PI / 2]}><mesh><cylinderGeometry args={[0.2, 0.2, 0.48, 14]} />{material}</mesh><mesh position={[0, 0.34, 0]}><boxGeometry args={[0.32, 0.22, 0.26]} />{material}</mesh></group>;
  return <group><mesh><cylinderGeometry args={[0.12, 0.16, 0.65, 10]} />{material}</mesh><mesh position={[0, 0.38, 0]}><sphereGeometry args={[0.19, 12, 8]} />{material}</mesh></group>;
}

function CommunicationPath({ path }: { path: TwinPath }) {
  const color = path.state === "attack" ? "#d84b4b" : path.state === "blocked" ? "#d99a20" : "#258f82";
  const midpoint: TwinPosition = [(path.source[0] + path.target[0]) / 2, Math.max(path.source[1], path.target[1]) + (path.state === "normal" ? 0.45 : 1.0), (path.source[2] + path.target[2]) / 2];
  const points: TwinPosition[] = [path.source, midpoint, path.target];
  return <group>
    <Line points={points.map((point) => [...point])} color={color} lineWidth={path.state === "attack" ? 2.7 : 1.45} dashed={path.state === "blocked"} dashSize={0.18} gapSize={0.13} transparent opacity={path.state === "normal" ? 0.62 : 0.96} />
    {path.state !== "blocked" && [0, 1, 2].map((index) => <PathPacket key={index} points={points} color={color} phase={index / 3} />)}
    {path.state === "blocked" && <mesh position={[...midpoint]}><octahedronGeometry args={[0.18, 0]} /><meshStandardMaterial color="#d99a20" emissive="#a96d11" emissiveIntensity={0.26} /></mesh>}
    {path.state !== "normal" && <Billboard position={[...midpoint]}>
      <mesh position={[0, 0, -0.035]}><planeGeometry args={[path.state === "attack" ? 1.55 : 0.9, 0.32]} /><meshBasicMaterial color={path.state === "attack" ? "#fff0ee" : "#fff6e6"} transparent opacity={0.96} depthWrite={false} /></mesh>
      <DreiText fontSize={0.14} anchorX="center" anchorY="middle" color={path.state === "attack" ? "#b3342d" : "#94630e"}>
        {path.state === "attack" ? "Focused attack" : "Blocked"}
      </DreiText>
    </Billboard>}
  </group>;
}

function PathPacket({ points, color, phase }: { points: TwinPosition[]; color: string; phase: number }) {
  const ref = useRef<Mesh>(null);
  const progress = useRef(phase);
  useEffect(() => {
    if (!ref.current) return;
    const along = (points.length - 1) * phase;
    const index = Math.min(points.length - 2, Math.floor(along));
    const t = along - index;
    const start = points[index];
    const end = points[index + 1];
    ref.current.position.set(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t + 0.035, start[2] + (end[2] - start[2]) * t);
  }, [phase, points]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    progress.current = (progress.current + delta * 0.2) % 1;
    const along = (points.length - 1) * progress.current;
    const index = Math.min(points.length - 2, Math.floor(along));
    const t = along - index;
    const start = points[index];
    const end = points[index + 1];
    ref.current.position.set(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t + 0.035, start[2] + (end[2] - start[2]) * t);
  });
  return <mesh ref={ref}><sphereGeometry args={[0.055, 8, 6]} /><meshBasicMaterial color={color} /></mesh>;
}

function DeviceInspector({ device, attacks, policy, onClose }: { device: Device | null; attacks: Attack[]; policy: PolicyState; onClose: () => void }) {
  if (!device) return <div className="twin-inspector-empty">Select a device in either view to inspect its live state.</div>;
  const state = deviceSecurityState(device, attacks, policy);
  const readings = deviceReadings(device);
  return <aside className="twin-device-inspector" aria-label="Selected device inspector">
    <button aria-label="Close inspector" onClick={onClose}>×</button>
    <header><div><span className="kicker">DEVICE INSPECTOR</span><h3>{device.name}</h3></div><Badge value={state} /></header>
    <dl><dt>Type</dt><dd>{titleCase(device.device_type)}</dd><dt>Address</dt><dd>{device.address}</dd><dt>Device state</dt><dd>{titleCase(device.status)}</dd><dt>Security state</dt><dd>{titleCase(state)}</dd><dt>Health</dt><dd>{titleCase(device.health)}</dd></dl>
    {readings.length > 0 && <div className="twin-readings">{readings.map((reading) => <div key={reading.key}><span>{reading.label}</span><strong>{reading.value}</strong></div>)}</div>}
  </aside>;
}

function TwinLegend() {
  return <div className="legend twin-legend" aria-label="Communication state legend"><i className="normal" />Normal<i className="attack" />Attack<i className="blocked" />Blocked</div>;
}

function SceneFallback({ onShowTopology }: { onShowTopology: () => void }) {
  return <div className="twin-fallback" role="status"><WifiOff /><div><strong>3D view unavailable</strong><p>This browser could not start WebGL. Device state and telemetry remain available in the technical view.</p><button className="button" onClick={onShowTopology}>Open Network Topology</button></div></div>;
}

function hasWebglSupport() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch { return false; }
}

class TwinErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("3D testbed rendering failed", error, info); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
