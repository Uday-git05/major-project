from datetime import datetime
import random
from uuid import NAMESPACE_URL, uuid5

from app.domain.simulation import DeviceView
from app.simulation.events import NetworkActivityEvent, NetworkActivityPayload, PacketSample

from ..presets import INTENSITY_MULTIPLIERS, AttackPreset
from ..schemas import AttackScenario


def generate_attack_network_events(
    scenario: AttackScenario,
    preset: AttackPreset,
    target: DeviceView,
    *,
    tick_number: int,
    timestamp: datetime,
) -> list[NetworkActivityEvent]:
    """Generate metadata objects only; this function performs no network I/O."""
    rng = random.Random(f"{scenario.seed}:{scenario.attack_type}:{tick_number}")
    multiplier = INTENSITY_MULTIPLIERS[scenario.intensity]
    count = (
        preset.port_spread * multiplier
        if preset.port_spread > 1
        else preset.base_events_per_tick * multiplier
    )
    events: list[NetworkActivityEvent] = []
    for event_index in range(count):
        destination_port = (
            preset.destination_port + event_index if preset.port_spread > 1 else preset.destination_port
        )
        forward_count = (
            preset.base_forward_packets
            if preset.port_spread > 1
            else preset.base_forward_packets * multiplier + rng.randint(0, multiplier)
        )
        backward_count = int(round(forward_count * preset.response_ratio))
        duration = round(
            max(
                0.0001,
                preset.base_duration_seconds * rng.uniform(0.8, 1.2) / multiplier,
            ),
            9,
        )
        samples = _packet_samples(
            rng,
            preset,
            forward_count=forward_count,
            backward_count=backward_count,
            duration=duration,
            high_intensity=scenario.intensity.value == "high",
        )
        forward = [sample for sample in samples if sample.direction == "forward"]
        backward = [sample for sample in samples if sample.direction == "backward"]
        event_id = uuid5(
            NAMESPACE_URL,
            f"{scenario.attack_id}:network:{tick_number}:{event_index}",
        )
        source_port = 1 if preset.protocol in {"ARP", "ICMP"} else 40000 + rng.randint(0, 2000)
        events.append(
            NetworkActivityEvent(
                event_id=event_id,
                timestamp=timestamp,
                source=scenario.source_device_id,
                correlation_id=scenario.correlation_id,
                payload=NetworkActivityPayload(
                    source_device_id=scenario.source_device_id,
                    destination_device_id=target.device_id,
                    source_address=str(scenario.metadata["synthetic_source_address"]),
                    destination_address=target.address,
                    source_port=source_port,
                    destination_port=destination_port,
                    protocol=preset.protocol,
                    service=preset.service,
                    direction="synthetic_to_target",
                    packet_count=len(forward),
                    byte_count=sum(sample.total_bytes for sample in forward),
                    payload_bytes=sum(sample.payload_bytes for sample in forward),
                    header_bytes=sum(sample.header_bytes for sample in forward),
                    duration_seconds=duration,
                    inter_arrival_time_seconds=(duration / max(1, len(samples) - 1)),
                    response_packet_count=len(backward),
                    response_byte_count=sum(sample.total_bytes for sample in backward),
                    success=True,
                    packet_samples=samples,
                ),
            )
        )
    return events


def _packet_samples(
    rng: random.Random,
    preset: AttackPreset,
    *,
    forward_count: int,
    backward_count: int,
    duration: float,
    high_intensity: bool,
) -> list[PacketSample]:
    samples: list[PacketSample] = []
    for index in range(forward_count):
        header = rng.choice(preset.header_sizes)
        payload = rng.randint(*preset.payload_range)
        relative = 0.0 if forward_count == 1 else duration * 0.75 * index / (forward_count - 1)
        missed = rng.randint(1, 16) if high_intensity and rng.random() < 0.08 else 0
        samples.append(
            PacketSample(
                relative_timestamp_seconds=round(relative, 9),
                direction="forward",
                header_bytes=header,
                payload_bytes=payload,
                total_bytes=header + payload,
                missed_bytes=missed,
            )
        )
    for index in range(backward_count):
        header = rng.choice(preset.header_sizes)
        payload = rng.randint(*preset.payload_range)
        relative = duration * (0.8 + 0.2 * (index + 1) / max(1, backward_count))
        samples.append(
            PacketSample(
                relative_timestamp_seconds=round(relative, 9),
                direction="backward",
                header_bytes=header,
                payload_bytes=payload,
                total_bytes=header + payload,
            )
        )
    return samples
