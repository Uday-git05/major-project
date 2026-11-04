from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from app.simulation.events import NetworkActivityEvent, PacketSample


@dataclass(frozen=True, order=True)
class FlowKey:
    """Directional five-tuple; initiator is always the forward/orig endpoint."""

    source_address: str
    destination_address: str
    source_port: int
    destination_port: int
    protocol: str

    @classmethod
    def from_event(cls, event: NetworkActivityEvent) -> "FlowKey":
        payload = event.payload
        if payload.direction == "device_response":
            return cls(
                source_address=payload.destination_address,
                destination_address=payload.source_address,
                source_port=payload.destination_port,
                destination_port=payload.source_port,
                protocol=payload.protocol,
            )
        return cls(
            source_address=payload.source_address,
            destination_address=payload.destination_address,
            source_port=payload.source_port,
            destination_port=payload.destination_port,
            protocol=payload.protocol,
        )

    @property
    def flow_id(self) -> str:
        value = (
            f"{self.source_address}|{self.destination_address}|{self.source_port}|"
            f"{self.destination_port}|{self.protocol}"
        )
        return str(uuid5(NAMESPACE_URL, f"farmflow-flow:{value}"))


@dataclass(frozen=True)
class FlowPacket:
    timestamp: datetime
    direction: str
    header_bytes: int
    payload_bytes: int
    total_bytes: int
    missed_bytes: int
    success: bool
    source_event_id: UUID
    sample_index: int


@dataclass
class FlowState:
    key: FlowKey
    source_device_id: str
    destination_device_id: str
    provenance_limit: int
    packets: list[FlowPacket] = field(default_factory=list)
    source_event_ids: deque[UUID] = field(init=False)
    correlation_id: UUID | None = None
    first_event_time: datetime | None = None
    last_event_time: datetime | None = None
    last_emitted_at: datetime | None = None

    def __post_init__(self) -> None:
        self.source_event_ids = deque(maxlen=self.provenance_limit)

    def add_event(self, event: NetworkActivityEvent) -> bool:
        """Add samples, returning True when the event arrived before existing activity."""
        if not event.payload.packet_samples:
            raise ValueError("Network activity has no packet_samples")
        out_of_order = self.last_event_time is not None and event.timestamp < self.last_event_time
        self.first_event_time = (
            event.timestamp
            if self.first_event_time is None
            else min(self.first_event_time, event.timestamp)
        )
        self.last_event_time = (
            event.timestamp
            if self.last_event_time is None
            else max(self.last_event_time, event.timestamp)
        )
        self.correlation_id = event.correlation_id
        self.source_event_ids.append(event.event_id)
        reverse_event = event.payload.direction == "device_response"
        for index, sample in enumerate(event.payload.packet_samples):
            direction = _direction_for_flow(sample, reverse_event)
            self.packets.append(
                FlowPacket(
                    timestamp=event.timestamp
                    + timedelta(seconds=sample.relative_timestamp_seconds),
                    direction=direction,
                    header_bytes=sample.header_bytes,
                    payload_bytes=sample.payload_bytes,
                    total_bytes=sample.total_bytes,
                    missed_bytes=sample.missed_bytes,
                    success=sample.success,
                    source_event_id=event.event_id,
                    sample_index=index,
                )
            )
        self.packets.sort(key=lambda packet: (packet.timestamp, str(packet.source_event_id), packet.sample_index))
        return out_of_order

    @property
    def flow_start(self) -> datetime:
        if not self.packets:
            raise ValueError("Flow has no packets")
        return self.packets[0].timestamp

    @property
    def flow_end(self) -> datetime:
        if not self.packets:
            raise ValueError("Flow has no packets")
        return self.packets[-1].timestamp


def _direction_for_flow(sample: PacketSample, reverse_event: bool) -> str:
    if not reverse_event:
        return sample.direction
    return "backward" if sample.direction == "forward" else "forward"
