import asyncio
import random
from collections.abc import Sequence
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.domain.simulation import (
    DeviceStatus,
    DeviceType,
    DeviceView,
    SimulationActionResponse,
    SimulationState,
    SimulationStatusResponse,
    TopologyResponse,
)

from .bus import AsyncEventBus
from .clock import SimulationClock
from .devices import VirtualDevice, create_default_devices
from .events import (
    DeviceStateEvent,
    DeviceStatePayload,
    NetworkActivityEvent,
    NetworkActivityPayload,
    PacketSample,
    SimulationEvent,
    SimulationTickEvent,
    SimulationTickPayload,
    SystemHealthEvent,
    SystemHealthPayload,
    TelemetryEvent,
    TelemetryPayload,
)
from .topology import build_topology


UNIT_MAPS: dict[DeviceType, dict[str, str]] = {
    DeviceType.SOIL_MOISTURE_SENSOR: {"moisture_percent": "%"},
    DeviceType.TEMPERATURE_SENSOR: {"temperature_c": "°C"},
    DeviceType.HUMIDITY_SENSOR: {"humidity_percent": "%"},
    DeviceType.WATER_FLOW_SENSOR: {
        "flow_liters_per_minute": "L/min",
        "pump_active": "boolean",
    },
    DeviceType.PUMP_CONTROLLER: {"pump_on": "boolean", "power_watts": "W"},
    DeviceType.WEATHER_NODE: {
        "air_temperature_c": "°C",
        "wind_speed_mps": "m/s",
        "rainfall_mm": "mm",
    },
}


class SimulationEngine:
    """Coordinates the clock, devices, normal traffic, and typed event stream."""

    def __init__(
        self,
        *,
        seed: int = 42,
        tick_duration_seconds: float = 1.0,
        simulation_speed: float = 1.0,
        telemetry_frequency: int = 1,
        soil_sensor_count: int = 2,
        temperature_sensor_count: int = 1,
        humidity_sensor_count: int = 1,
        event_history_limit: int = 10_000,
    ) -> None:
        if simulation_speed <= 0:
            raise ValueError("simulation_speed must be positive")
        if event_history_limit < 1:
            raise ValueError("event_history_limit must be positive")
        self.seed = seed
        self.simulation_speed = float(simulation_speed)
        self.clock = SimulationClock(tick_duration_seconds)
        self.bus = AsyncEventBus()
        self._device_args = {
            "soil_count": soil_sensor_count,
            "temperature_count": temperature_sensor_count,
            "humidity_count": humidity_sensor_count,
            "telemetry_frequency": telemetry_frequency,
        }
        self.devices = create_default_devices(**self._device_args)
        self._rng = random.Random(seed)
        self._events: list[SimulationEvent] = []
        self._event_history_limit = event_history_limit
        self._event_sequence = 0
        self._operation_lock = asyncio.Lock()
        self.security_policy: Any | None = None

    def attach_security_policy(self, policy: Any) -> None:
        self.security_policy = policy

    async def start(self) -> SimulationActionResponse:
        async with self._operation_lock:
            self.clock.start()
            emitted = 0
            for device in self.devices:
                event = DeviceStateEvent(
                    **self._event_identity("device_state", device.device_id),
                    payload=DeviceStatePayload(
                        device_id=device.device_id,
                        status=device.status,
                        health=device.health,
                        reason="simulation_started",
                    ),
                )
                await self._emit(event)
                emitted += 1
            return self._action("start", emitted)

    async def pause(self) -> SimulationActionResponse:
        async with self._operation_lock:
            self.clock.pause()
            return self._action("pause", 0)

    async def resume(self) -> SimulationActionResponse:
        async with self._operation_lock:
            self.clock.resume()
            return self._action("resume", 0)

    async def reset(self, seed: int | None = None) -> SimulationActionResponse:
        async with self._operation_lock:
            if seed is not None:
                self.seed = seed
            self.clock.reset()
            self._rng = random.Random(self.seed)
            self._events.clear()
            self._event_sequence = 0
            for device in self.devices:
                device.reset()
            return self._action("reset", 0)

    async def tick(self, count: int = 1) -> SimulationActionResponse:
        if count < 1 or count > 100:
            raise ValueError("tick count must be between 1 and 100")
        async with self._operation_lock:
            before = len(self._events)
            for _ in range(count):
                await self._tick_once()
            return self._action("tick", len(self._events) - before)

    async def _tick_once(self) -> None:
        timestamp = self.clock.advance()
        soil_sensors = [device for device in self.devices if device.device_type is DeviceType.SOIL_MOISTURE_SENSOR]
        pump = next(device for device in self.devices if device.device_type is DeviceType.PUMP_CONTROLLER)
        flow_sensor = next(device for device in self.devices if device.device_type is DeviceType.WATER_FLOW_SENSOR)
        irrigation_devices = [*soil_sensors, pump, flow_sensor]
        if (self.security_policy is None or all(
            self.security_policy.allows_normal_device(device.device_id) for device in irrigation_devices
        )):
            average_moisture = sum(float(device.telemetry_state["moisture_percent"]) for device in soil_sensors) / len(soil_sensors)
            pump_on = bool(pump.telemetry_state["pump_on"])
            if not pump_on and average_moisture <= 40.0:
                pump_on = True
            elif pump_on and average_moisture >= 58.0:
                pump_on = False
            pump.telemetry_state.update({"pump_on": pump_on, "power_watts": 420.0 if pump_on else 0.0})
            flow_sensor.telemetry_state["pump_active"] = pump_on
            for sensor in soil_sensors:
                sensor.irrigation_active = pump_on
        tick_correlation = self._deterministic_uuid(f"tick:{self.clock.tick_number}")
        await self._emit(
            SimulationTickEvent(
                **self._event_identity(
                    "simulation_tick", "simulation-clock", correlation_id=tick_correlation
                ),
                payload=SimulationTickPayload(
                    tick_number=self.clock.tick_number,
                    tick_duration_seconds=self.clock.tick_duration_seconds,
                    state=self.clock.state,
                ),
            )
        )

        gateway = self._gateway
        gateway.last_seen = timestamp
        for device in self.devices:
            if not device.is_due(self.clock.tick_number):
                continue
            if self.security_policy is not None and not self.security_policy.allows_normal_device(device.device_id):
                continue
            correlation_id = self._deterministic_uuid(
                f"telemetry:{self.clock.tick_number}:{device.device_id}"
            )
            readings = device.update(self._rng, timestamp)
            await self._emit(
                TelemetryEvent(
                    **self._event_identity(
                        "telemetry", device.device_id, correlation_id=correlation_id
                    ),
                    payload=TelemetryPayload(
                        device_id=device.device_id,
                        readings=readings,
                        unit_map=UNIT_MAPS.get(device.device_type, {}),
                    ),
                )
            )
            await self._emit(self._telemetry_network_event(device, gateway, correlation_id))

        if (self.clock.tick_number % 3 == 0
                and (self.security_policy is None
                     or self.security_policy.allows_normal_device("pump_controller-01"))):
            await self._emit_gateway_pump_exchange(gateway)
        await self._emit_system_health(tick_correlation)

    def _telemetry_network_event(
        self, device: VirtualDevice, gateway: VirtualDevice, correlation_id: UUID
    ) -> NetworkActivityEvent:
        profile = device.profile
        jitter = self._rng.randint(-1, 1)
        packets = max(1, profile.nominal_packet_count + jitter)
        payload_bytes = max(1, profile.nominal_payload_bytes + self._rng.randint(-4, 4))
        header_bytes = packets * profile.header_bytes_per_packet
        response_packets = 1
        response_payload = 18
        response_bytes = response_payload + profile.header_bytes_per_packet
        duration = round(0.012 + packets * 0.004, 6)
        packet_samples = _request_response_samples(
            forward_packets=packets,
            forward_header_bytes=profile.header_bytes_per_packet,
            forward_payload_bytes=payload_bytes,
            backward_packets=response_packets,
            backward_header_bytes=profile.header_bytes_per_packet,
            backward_payload_bytes=response_payload,
            duration_seconds=duration,
        )
        return NetworkActivityEvent(
            **self._event_identity(
                "network_activity", device.device_id, correlation_id=correlation_id
            ),
            payload=NetworkActivityPayload(
                source_device_id=device.device_id,
                destination_device_id=gateway.device_id,
                source_address=device.address,
                destination_address=gateway.address,
                source_port=profile.source_port,
                destination_port=profile.destination_port,
                protocol=profile.protocol,
                service=profile.service,
                direction="device_to_gateway",
                packet_count=packets,
                byte_count=payload_bytes + header_bytes,
                payload_bytes=payload_bytes,
                header_bytes=header_bytes,
                duration_seconds=duration,
                inter_arrival_time_seconds=round(0.004 + packets * 0.001, 6),
                response_packet_count=response_packets,
                response_byte_count=response_bytes,
                success=True,
                packet_samples=packet_samples,
            ),
        )

    async def _emit_gateway_pump_exchange(self, gateway: VirtualDevice) -> None:
        pump = next(
            device for device in self.devices if device.device_type is DeviceType.PUMP_CONTROLLER
        )
        correlation_id = self._deterministic_uuid(f"pump-command:{self.clock.tick_number}")
        profile = pump.profile
        await self._emit(
            NetworkActivityEvent(
                **self._event_identity(
                    "network_activity", gateway.device_id, correlation_id=correlation_id
                ),
                payload=NetworkActivityPayload(
                    source_device_id=gateway.device_id,
                    destination_device_id=pump.device_id,
                    source_address=gateway.address,
                    destination_address=pump.address,
                    source_port=1883,
                    destination_port=profile.destination_port,
                    protocol="TCP",
                    service="mqtt",
                    direction="gateway_to_device",
                    packet_count=2,
                    byte_count=104,
                    payload_bytes=24,
                    header_bytes=80,
                    duration_seconds=0.018,
                    inter_arrival_time_seconds=0.009,
                    response_packet_count=1,
                    response_byte_count=52,
                    success=True,
                    packet_samples=_request_response_samples(
                        forward_packets=2,
                        forward_header_bytes=40,
                        forward_payload_bytes=24,
                        backward_packets=1,
                        backward_header_bytes=40,
                        backward_payload_bytes=12,
                        duration_seconds=0.018,
                    ),
                ),
            )
        )

    async def _emit_system_health(self, correlation_id: UUID) -> None:
        counts = {status: 0 for status in DeviceStatus}
        for device in self.devices:
            counts[device.status] += 1
        await self._emit(
            SystemHealthEvent(
                **self._event_identity(
                    "system_health", "farm-testbed", correlation_id=correlation_id
                ),
                payload=SystemHealthPayload(
                    total_devices=len(self.devices),
                    online_devices=counts[DeviceStatus.ONLINE],
                    degraded_devices=counts[DeviceStatus.DEGRADED],
                    offline_devices=counts[DeviceStatus.OFFLINE],
                    isolated_devices=counts[DeviceStatus.ISOLATED],
                    healthy=counts[DeviceStatus.ONLINE] == len(self.devices),
                ),
            )
        )

    async def _emit(self, event: SimulationEvent) -> None:
        self._events.append(event)
        if len(self._events) > self._event_history_limit:
            del self._events[: len(self._events) - self._event_history_limit]
        await self.bus.publish(event)

    def _event_identity(
        self, event_type: str, source: str, *, correlation_id: UUID | None = None
    ) -> dict[str, object]:
        self._event_sequence += 1
        return {
            "event_id": self._deterministic_uuid(f"event:{self._event_sequence}:{event_type}:{source}"),
            "timestamp": self.clock.current_time,
            "source": source,
            "correlation_id": correlation_id
            or self._deterministic_uuid(f"correlation:{self._event_sequence}"),
        }

    def _deterministic_uuid(self, value: str) -> UUID:
        return uuid5(NAMESPACE_URL, f"farmflow:{self.seed}:{value}")

    @property
    def _gateway(self) -> VirtualDevice:
        return next(device for device in self.devices if device.device_type is DeviceType.GATEWAY)

    def status(self) -> SimulationStatusResponse:
        return SimulationStatusResponse(
            state=self.clock.state,
            seed=self.seed,
            tick_number=self.clock.tick_number,
            simulation_time=self.clock.current_time,
            tick_duration_seconds=self.clock.tick_duration_seconds,
            simulation_speed=self.simulation_speed,
            device_count=len(self.devices),
            online_devices=sum(device.status is DeviceStatus.ONLINE for device in self.devices),
            event_count=len(self._events),
        )

    def device_views(self) -> list[DeviceView]:
        return [device.view() for device in self.devices]

    def topology(self) -> TopologyResponse:
        return build_topology(self.devices)

    def events(
        self, *, event_type: str | None = None, limit: int = 100
    ) -> Sequence[SimulationEvent]:
        selected = self._events
        if event_type is not None:
            selected = [event for event in selected if event.event_type == event_type]
        return tuple(selected[-limit:])

    def _action(self, action: str, events_emitted: int) -> SimulationActionResponse:
        return SimulationActionResponse(
            action=action,
            status=self.status(),
            events_emitted=events_emitted,
        )


def _distribute_bytes(total: int, count: int) -> list[int]:
    if count == 0:
        return []
    base, remainder = divmod(total, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]


def _request_response_samples(
    *,
    forward_packets: int,
    forward_header_bytes: int,
    forward_payload_bytes: int,
    backward_packets: int,
    backward_header_bytes: int,
    backward_payload_bytes: int,
    duration_seconds: float,
) -> list[PacketSample]:
    """Create deterministic metadata samples; no real packets are generated."""
    samples: list[PacketSample] = []
    forward_payloads = _distribute_bytes(forward_payload_bytes, forward_packets)
    for index, payload in enumerate(forward_payloads):
        relative = (
            0.0
            if forward_packets == 1
            else (duration_seconds * 0.6 * index / (forward_packets - 1))
        )
        samples.append(
            PacketSample(
                relative_timestamp_seconds=round(relative, 9),
                direction="forward",
                header_bytes=forward_header_bytes,
                payload_bytes=payload,
                total_bytes=forward_header_bytes + payload,
            )
        )
    backward_payloads = _distribute_bytes(backward_payload_bytes, backward_packets)
    for index, payload in enumerate(backward_payloads):
        relative = duration_seconds * (
            0.8 + (0.2 * (index + 1) / max(1, backward_packets))
        )
        samples.append(
            PacketSample(
                relative_timestamp_seconds=round(relative, 9),
                direction="backward",
                header_bytes=backward_header_bytes,
                payload_bytes=payload,
                total_bytes=backward_header_bytes + payload,
            )
        )
    return samples
