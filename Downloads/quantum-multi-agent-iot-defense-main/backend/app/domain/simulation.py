from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeviceType(StrEnum):
    GATEWAY = "gateway"
    SOIL_MOISTURE_SENSOR = "soil_moisture_sensor"
    TEMPERATURE_SENSOR = "temperature_sensor"
    HUMIDITY_SENSOR = "humidity_sensor"
    WATER_FLOW_SENSOR = "water_flow_sensor"
    PUMP_CONTROLLER = "pump_controller"
    WEATHER_NODE = "weather_node"


class DeviceStatus(StrEnum):
    ONLINE = "online"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    ISOLATED = "isolated"


class DeviceHealth(StrEnum):
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class SimulationState(StrEnum):
    STOPPED = "stopped"
    RUNNING = "running"
    PAUSED = "paused"


class NetworkBehaviorProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    telemetry_interval_ticks: int = Field(ge=1)
    source_port: int = Field(ge=1, le=65535)
    destination_port: int = Field(ge=1, le=65535)
    protocol: Literal["TCP", "UDP", "ICMP", "ARP"]
    service: str
    nominal_packet_count: int = Field(ge=1)
    nominal_payload_bytes: int = Field(ge=0)
    header_bytes_per_packet: int = Field(ge=1)


class DeviceView(BaseModel):
    device_id: str
    device_type: DeviceType
    name: str
    address: str
    protocol: str
    service: str
    status: DeviceStatus
    health: DeviceHealth
    last_seen: datetime | None
    telemetry_state: dict[str, float | str | bool]
    network_profile: NetworkBehaviorProfile


class TopologyNode(BaseModel):
    device_id: str
    device_type: DeviceType
    name: str
    address: str


class TopologyLink(BaseModel):
    source_device_id: str
    destination_device_id: str
    relationship: Literal["telemetry", "control"]


class TopologyResponse(BaseModel):
    gateway_id: str
    nodes: list[TopologyNode]
    links: list[TopologyLink]


class SimulationStatusResponse(BaseModel):
    state: SimulationState
    seed: int
    tick_number: int
    simulation_time: datetime
    tick_duration_seconds: float
    simulation_speed: float
    device_count: int
    online_devices: int
    event_count: int


class SimulationActionResponse(BaseModel):
    action: Literal["start", "pause", "resume", "reset", "tick"]
    status: SimulationStatusResponse
    events_emitted: int = Field(default=0, ge=0)


class TickRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=100)


class ResetRequest(BaseModel):
    seed: int | None = None
