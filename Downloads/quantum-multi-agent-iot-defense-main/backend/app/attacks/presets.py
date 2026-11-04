from dataclasses import dataclass
from typing import Literal

from app.domain.simulation import DeviceType

from .schemas import AttackIntensity, AttackPresetView, AttackType


# Attack scenarios emit synthetic metadata to the simulator's registered
# in-memory endpoints; every virtual device can therefore be a target.
SIMULATOR_TARGET_TYPES = tuple(DeviceType)


@dataclass(frozen=True)
class AttackPreset:
    attack_type: AttackType
    name: str
    description: str
    allowed_target_types: tuple[DeviceType, ...]
    default_duration_ticks: int
    default_intensity: AttackIntensity
    severity_hint: Literal["low", "medium", "high", "critical"]
    protocol: Literal["TCP", "UDP", "ICMP", "ARP"]
    service: str
    destination_port: int
    base_events_per_tick: int
    base_forward_packets: int
    response_ratio: float
    payload_range: tuple[int, int]
    header_sizes: tuple[int, ...]
    base_duration_seconds: float
    port_spread: int = 1
    identity_conflict: bool = False

    def view(self) -> AttackPresetView:
        return AttackPresetView(
            attack_type=self.attack_type,
            name=self.name,
            description=self.description,
            default_target_types=[value.value for value in self.allowed_target_types],
            default_duration_ticks=self.default_duration_ticks,
            default_intensity=self.default_intensity,
            protocol=self.protocol,
            service=self.service,
            behavior_summary=(
                f"{self.base_events_per_tick} base event(s)/tick, "
                f"{self.base_forward_packets} base forward packets, "
                f"response ratio {self.response_ratio}, relative port spread {self.port_spread}."
            ),
        )


PRESETS: dict[AttackType, AttackPreset] = {
    AttackType.ARP_SPOOFING: AttackPreset(
        attack_type=AttackType.ARP_SPOOFING,
        name="Synthetic address identity conflict",
        description="Conflicting virtual address-resolution announcements; no ARP frames are sent.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="ARP",
        service="arp-sim",
        destination_port=1,
        base_events_per_tick=2,
        base_forward_packets=3,
        response_ratio=0.2,
        payload_range=(18, 32),
        header_sizes=(28,),
        base_duration_seconds=0.025,
        identity_conflict=True,
    ),
    AttackType.HTTP_FLOOD: AttackPreset(
        attack_type=AttackType.HTTP_FLOOD,
        name="Synthetic HTTP request flood",
        description="Compressed high-volume request metadata toward a virtual HTTP service.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="TCP",
        service="http",
        destination_port=8080,
        base_events_per_tick=2,
        base_forward_packets=12,
        response_ratio=0.15,
        payload_range=(90, 320),
        header_sizes=(40, 52),
        base_duration_seconds=0.04,
    ),
    AttackType.ICMP_FLOOD: AttackPreset(
        attack_type=AttackType.ICMP_FLOOD,
        name="Synthetic ICMP-style flood",
        description="High-volume ICMP-like metadata without emitting real ICMP packets.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="ICMP",
        service="icmp-sim",
        destination_port=1,
        base_events_per_tick=2,
        base_forward_packets=18,
        response_ratio=0.05,
        payload_range=(32, 96),
        header_sizes=(20, 28),
        base_duration_seconds=0.025,
    ),
    AttackType.MQTT_FLOOD: AttackPreset(
        attack_type=AttackType.MQTT_FLOOD,
        name="Synthetic MQTT broker flood",
        description="Repeated high-frequency publish metadata toward the virtual MQTT service.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="TCP",
        service="mqtt",
        destination_port=1883,
        base_events_per_tick=3,
        base_forward_packets=10,
        response_ratio=0.1,
        payload_range=(24, 180),
        header_sizes=(40,),
        base_duration_seconds=0.03,
    ),
    AttackType.PORT_SCANNING: AttackPreset(
        attack_type=AttackType.PORT_SCANNING,
        name="Synthetic multi-port probe",
        description="Low-volume connection metadata distributed over virtual destination ports.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=2,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="medium",
        protocol="TCP",
        service="port-probe-sim",
        destination_port=1000,
        base_events_per_tick=1,
        base_forward_packets=1,
        response_ratio=1.0,
        payload_range=(0, 12),
        header_sizes=(40,),
        base_duration_seconds=0.015,
        port_spread=4,
    ),
    AttackType.TCP_FLOOD: AttackPreset(
        attack_type=AttackType.TCP_FLOOD,
        name="Synthetic TCP flood",
        description="High-rate TCP-style connection metadata with sparse responses.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="TCP",
        service="tcp-sim",
        destination_port=9000,
        base_events_per_tick=2,
        base_forward_packets=16,
        response_ratio=0.04,
        payload_range=(0, 48),
        header_sizes=(40, 52),
        base_duration_seconds=0.02,
    ),
    AttackType.UDP_FLOOD: AttackPreset(
        attack_type=AttackType.UDP_FLOOD,
        name="Synthetic UDP flood",
        description="High-volume connectionless UDP-style metadata with no responses.",
        allowed_target_types=SIMULATOR_TARGET_TYPES,
        default_duration_ticks=3,
        default_intensity=AttackIntensity.MEDIUM,
        severity_hint="high",
        protocol="UDP",
        service="udp-sim",
        destination_port=9001,
        base_events_per_tick=2,
        base_forward_packets=20,
        response_ratio=0.0,
        payload_range=(64, 512),
        header_sizes=(28,),
        base_duration_seconds=0.02,
    ),
}


INTENSITY_MULTIPLIERS = {
    AttackIntensity.LOW: 1,
    AttackIntensity.MEDIUM: 2,
    AttackIntensity.HIGH: 4,
}
