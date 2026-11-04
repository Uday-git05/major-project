// Explicit test inputs matching the eight simulator device identities; not live measurements.
import type { Device } from "@/types/api";
import { dashboardSnapshot } from "./fixtures";
import { noisyData } from "./noise-fixtures";

export function visualData(noisy = false) {
  const data = noisy ? noisyData() : dashboardSnapshot();
  const base = dashboardSnapshot().devices[0];
  const definitions: [string, string, string, Device["telemetry_state"]][] = [
    ["gateway-01", "gateway", "Farm Gateway", { connected_devices: 7 }],
    ["soil_moisture-01", "soil_moisture_sensor", "Soil Moisture Sensor 1", { moisture_percent: 44 }],
    ["soil_moisture-02", "soil_moisture_sensor", "Soil Moisture Sensor 2", { moisture_percent: 46 }],
    ["temperature-01", "temperature_sensor", "Temperature Sensor 1", { temperature_c: 22 }],
    ["humidity-01", "humidity_sensor", "Humidity Sensor 1", { humidity_percent: 60 }],
    ["water_flow-01", "water_flow_sensor", "Irrigation Flow Sensor", { flow_liters_per_minute: .15, pump_active: false }],
    ["pump_controller-01", "pump_controller", "Main Pump Controller", { pump_on: false, power_watts: 0 }],
    ["weather-01", "weather_node", "Field Weather Node", { air_temperature_c: 22.5, wind_speed_mps: 2.4, rainfall_mm: 0 }],
  ];
  data.devices = definitions.map(([device_id, device_type, name, telemetry_state], index) => ({ ...base, device_id, device_type, name, telemetry_state, address: `10.42.0.${index + 1}` }));
  data.topology = { gateway_id: "gateway-01", nodes: data.devices.map(({device_id, device_type, name, address}) => ({device_id,device_type,name,address})), links: data.devices.slice(1).map(device => ({source_device_id:device.device_id,destination_device_id:"gateway-01",relationship:"telemetry"})) };
  data.simulation = {...data.simulation,device_count:8,online_devices:8};
  data.agents = ["monitoring","classical-ml","quantum-ml","threat-analysis","defense","recovery"].map((id,index) => ({...baseAgent(),agent_id:`${id}-agent`,agent_type:id,name:id,processed_event_count:index + 1}));
  data.flows = data.devices.slice(1).map((device,index) => ({flow_id:`fixture-flow-${index}`,source_device_id:device.device_id,destination_device_id:"gateway-01",source_address:device.address,destination_address:"10.42.0.1",source_port:20002 + index,destination_port:1883,protocol:index % 2 ? "UDP" : "TCP",flow_start:"2026-01-01T00:00:01Z",flow_end:"2026-01-01T00:00:07Z",packet_count:6,source_event_count:3}));
  data.events.push(...data.flows.map((flow,index) => ({event_id:`fixture-network-${index}`,event_type:"network_activity",timestamp:flow.flow_end,source:"simulator",correlation_id:flow.flow_id,payload:{...flow,direction:"device_to_gateway",service:index % 2 ? "coap" : "mqtt"}})));
  return data;
}
function baseAgent() { return dashboardSnapshot().agents[0]; }
