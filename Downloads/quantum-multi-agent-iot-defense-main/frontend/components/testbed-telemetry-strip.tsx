"use client";

import { Activity, Radio } from "lucide-react";
import { deviceReadings } from "@/features/digital-twin";
import type { Device } from "@/types/api";
import { Badge } from "./ui";
import { useReportedChange } from "@/hooks/use-reported-change";

export function TestbedTelemetryStrip({ devices, active, state }: { devices: Device[]; active: boolean; state: string }) {
  const readings = devices.filter(device => !["gateway", "weather_node"].includes(device.device_type));
  return <section className="testbed-telemetry-strip" aria-label="Testbed status and telemetry">
    <header><Radio size={20} aria-hidden="true" /><div><b>Virtual testbed</b><span>{devices.length} runtime devices · latest snapshot</span></div><Badge value={active ? state : "stopped"} /></header>
    <div className="telemetry-inline">{readings.map(device => <TelemetryValue key={device.device_id} device={device} active={active && state === "running"} />)}</div>
    <p><Activity size={14} aria-hidden="true" />{active && state === "running" ? "Values follow reported telemetry." : "Collection is not running; displayed values are the latest retained readings."} No physical farm is connected.</p>
  </section>;
}

function TelemetryValue({ device, active }: { device: Device; active: boolean }) {
  const reading = deviceReadings(device)[0];
  const ref = useReportedChange<HTMLDivElement>(JSON.stringify(device.telemetry_state), active);
  return <div ref={ref}><span>{device.name}</span><strong>{reading?.value ?? "Not reported"}</strong><small>{reading?.label ?? "No telemetry retained"}</small></div>;
}
