from __future__ import annotations

import random
from datetime import datetime

from app.domain.simulation import (
    DeviceHealth,
    DeviceStatus,
    DeviceType,
    DeviceView,
    NetworkBehaviorProfile,
)


class VirtualDevice:
    def __init__(
        self,
        *,
        device_id: str,
        device_type: DeviceType,
        name: str,
        address: str,
        profile: NetworkBehaviorProfile,
        initial_telemetry: dict[str, float | str | bool],
    ) -> None:
        self.device_id = device_id
        self.device_type = device_type
        self.name = name
        self.address = address
        self.profile = profile
        self.status = DeviceStatus.ONLINE
        self.health = DeviceHealth.HEALTHY
        self.last_seen: datetime | None = None
        self.telemetry_state = dict(initial_telemetry)
        self._initial_telemetry = dict(initial_telemetry)
        self.irrigation_active = False

    def reset(self) -> None:
        self.status = DeviceStatus.ONLINE
        self.health = DeviceHealth.HEALTHY
        self.last_seen = None
        self.telemetry_state = dict(self._initial_telemetry)
        self.irrigation_active = False

    def is_due(self, tick_number: int) -> bool:
        return self.device_type is not DeviceType.GATEWAY and (
            tick_number % self.profile.telemetry_interval_ticks == 0
        )

    def update(self, rng: random.Random, timestamp: datetime) -> dict[str, float | str | bool]:
        if self.status in {DeviceStatus.OFFLINE, DeviceStatus.ISOLATED}:
            return dict(self.telemetry_state)
        self._update_telemetry(rng)
        self.last_seen = timestamp
        return dict(self.telemetry_state)

    def _update_telemetry(self, rng: random.Random) -> None:
        state = self.telemetry_state
        if self.device_type is DeviceType.SOIL_MOISTURE_SENSOR:
            state["moisture_percent"] = _gradual(
                float(state["moisture_percent"]), target=64.0 if self.irrigation_active else 34.0,
                noise=0.18, rng=rng, low=0, high=100
            )
        elif self.device_type is DeviceType.TEMPERATURE_SENSOR:
            state["temperature_c"] = _gradual(
                float(state["temperature_c"]), target=24.0, noise=0.18, rng=rng, low=-10, high=55
            )
        elif self.device_type is DeviceType.HUMIDITY_SENSOR:
            state["humidity_percent"] = _gradual(
                float(state["humidity_percent"]), target=62.0, noise=0.3, rng=rng, low=0, high=100
            )
        elif self.device_type is DeviceType.WATER_FLOW_SENSOR:
            target = 12.5 if bool(state.get("pump_active", False)) else 0.15
            state["flow_liters_per_minute"] = _gradual(
                float(state["flow_liters_per_minute"]), target=target, noise=0.08, rng=rng, low=0, high=30
            )
        elif self.device_type is DeviceType.WEATHER_NODE:
            state["air_temperature_c"] = _gradual(
                float(state["air_temperature_c"]), target=23.0, noise=0.2, rng=rng, low=-20, high=60
            )
            state["wind_speed_mps"] = _gradual(
                float(state["wind_speed_mps"]), target=2.8, noise=0.15, rng=rng, low=0, high=35
            )

    def view(self) -> DeviceView:
        return DeviceView(
            device_id=self.device_id,
            device_type=self.device_type,
            name=self.name,
            address=self.address,
            protocol=self.profile.protocol,
            service=self.profile.service,
            status=self.status,
            health=self.health,
            last_seen=self.last_seen,
            telemetry_state=dict(self.telemetry_state),
            network_profile=self.profile,
        )


def _gradual(
    current: float,
    *,
    target: float,
    noise: float,
    rng: random.Random,
    low: float,
    high: float,
) -> float:
    next_value = current + (target - current) * 0.04 + rng.uniform(-noise, noise)
    return round(min(high, max(low, next_value)), 3)


def create_default_devices(
    *,
    soil_count: int,
    temperature_count: int,
    humidity_count: int,
    telemetry_frequency: int,
) -> list[VirtualDevice]:
    for label, value in {
        "soil_count": soil_count,
        "temperature_count": temperature_count,
        "humidity_count": humidity_count,
        "telemetry_frequency": telemetry_frequency,
    }.items():
        if value < 1:
            raise ValueError(f"{label} must be at least one")

    devices: list[VirtualDevice] = []
    next_address = 1

    def add(
        device_type: DeviceType,
        name: str,
        service: str,
        port: int,
        payload: int,
        initial: dict[str, float | str | bool],
        protocol: str = "UDP",
    ) -> None:
        nonlocal next_address
        slug = device_type.value.replace("_sensor", "").replace("_node", "")
        number = sum(item.device_type is device_type for item in devices) + 1
        device_id = "gateway-01" if device_type is DeviceType.GATEWAY else f"{slug}-{number:02d}"
        devices.append(
            VirtualDevice(
                device_id=device_id,
                device_type=device_type,
                name=name,
                address=f"10.42.0.{next_address}",
                profile=NetworkBehaviorProfile(
                    telemetry_interval_ticks=telemetry_frequency,
                    source_port=20000 + next_address,
                    destination_port=port,
                    protocol=protocol,
                    service=service,
                    nominal_packet_count=2,
                    nominal_payload_bytes=payload,
                    header_bytes_per_packet=28 if protocol == "UDP" else 40,
                ),
                initial_telemetry=initial,
            )
        )
        next_address += 1

    add(DeviceType.GATEWAY, "Farm Gateway", "mqtt", 1883, 48, {"connected_devices": 0}, "TCP")
    for index in range(soil_count):
        add(
            DeviceType.SOIL_MOISTURE_SENSOR,
            f"Soil Moisture Sensor {index + 1}",
            "mqtt",
            1883,
            56,
            {"moisture_percent": 44.0 + index * 2.0},
            "TCP",
        )
    for index in range(temperature_count):
        add(
            DeviceType.TEMPERATURE_SENSOR,
            f"Temperature Sensor {index + 1}",
            "coap",
            5683,
            42,
            {"temperature_c": 22.0 + index * 0.4},
        )
    for index in range(humidity_count):
        add(
            DeviceType.HUMIDITY_SENSOR,
            f"Humidity Sensor {index + 1}",
            "coap",
            5683,
            42,
            {"humidity_percent": 60.0 + index},
        )
    add(
        DeviceType.WATER_FLOW_SENSOR,
        "Irrigation Flow Sensor",
        "modbus-tcp",
        502,
        36,
        {"flow_liters_per_minute": 0.15, "pump_active": False},
        "TCP",
    )
    add(
        DeviceType.PUMP_CONTROLLER,
        "Main Pump Controller",
        "mqtt",
        1883,
        32,
        {"pump_on": False, "power_watts": 0.0},
        "TCP",
    )
    add(
        DeviceType.WEATHER_NODE,
        "Field Weather Node",
        "https",
        443,
        96,
        {"air_temperature_c": 22.5, "wind_speed_mps": 2.4, "rainfall_mm": 0.0},
        "TCP",
    )
    gateway = devices[0]
    gateway.telemetry_state["connected_devices"] = len(devices) - 1
    gateway._initial_telemetry["connected_devices"] = len(devices) - 1
    return devices
