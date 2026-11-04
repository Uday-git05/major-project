from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.simulation.events import NetworkActivityEvent, NetworkActivityPayload, PacketSample


def packet(
    timestamp: float,
    direction: str,
    header: int,
    payload: int,
    *,
    missed: int = 0,
) -> PacketSample:
    return PacketSample(
        relative_timestamp_seconds=timestamp,
        direction=direction,
        header_bytes=header,
        payload_bytes=payload,
        total_bytes=header + payload,
        missed_bytes=missed,
    )


def network_event(
    samples: list[PacketSample],
    *,
    timestamp: datetime | None = None,
    event_id: UUID | None = None,
    correlation_id: UUID | None = None,
    source_port: int = 21000,
) -> NetworkActivityEvent:
    forward = [sample for sample in samples if sample.direction == "forward"]
    backward = [sample for sample in samples if sample.direction == "backward"]
    return NetworkActivityEvent(
        event_id=event_id or uuid4(),
        timestamp=timestamp or datetime(2026, 1, 1, tzinfo=timezone.utc),
        source="sensor-01",
        correlation_id=correlation_id or uuid4(),
        payload=NetworkActivityPayload(
            source_device_id="sensor-01",
            destination_device_id="gateway-01",
            source_address="10.42.0.2",
            destination_address="10.42.0.1",
            source_port=source_port,
            destination_port=1883,
            protocol="TCP",
            service="mqtt",
            direction="device_to_gateway",
            packet_count=len(forward),
            byte_count=sum(sample.total_bytes for sample in forward),
            payload_bytes=sum(sample.payload_bytes for sample in forward),
            header_bytes=sum(sample.header_bytes for sample in forward),
            duration_seconds=max(
                (sample.relative_timestamp_seconds for sample in samples), default=0.0
            ),
            inter_arrival_time_seconds=0.0,
            response_packet_count=len(backward),
            response_byte_count=sum(sample.total_bytes for sample in backward),
            success=True,
            packet_samples=samples,
        ),
    )
