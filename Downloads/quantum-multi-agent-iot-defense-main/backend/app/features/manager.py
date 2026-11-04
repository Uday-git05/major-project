from collections import deque
from datetime import datetime
from uuid import UUID, uuid4

from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    FeatureVectorEvent,
    FeatureVectorPayload,
    NetworkActivityEvent,
    SimulationEvent,
    SimulationTickEvent,
)

from .contract import EXTRACTOR_VERSION, feature_contract
from .extractor import SyntheticFarmFlowExtractor
from .flow import FlowKey, FlowState
from .schemas import ActiveFlowView, FeatureExtractorStatus


class FeatureExtractionManager:
    """Aggregates live flow state and publishes validated feature vectors."""

    def __init__(
        self,
        bus: AsyncEventBus,
        *,
        inactivity_timeout_seconds: float = 5.0,
        max_flow_age_seconds: float = 30.0,
        emission_interval_seconds: float = 1.0,
        minimum_packets: int = 2,
        history_limit: int = 500,
        provenance_limit: int = 64,
        duplicate_history_limit: int = 10_000,
    ) -> None:
        if inactivity_timeout_seconds <= 0 or max_flow_age_seconds <= 0:
            raise ValueError("Flow timeout and maximum age must be positive")
        if emission_interval_seconds < 0 or minimum_packets < 1:
            raise ValueError("Invalid feature emission configuration")
        self.bus = bus
        self.inactivity_timeout_seconds = inactivity_timeout_seconds
        self.max_flow_age_seconds = max_flow_age_seconds
        self.emission_interval_seconds = emission_interval_seconds
        self.minimum_packets = minimum_packets
        self.provenance_limit = provenance_limit
        self.extractor = SyntheticFarmFlowExtractor()
        self.active_flows: dict[FlowKey, FlowState] = {}
        self.recent_vectors: deque[FeatureVectorEvent] = deque(maxlen=history_limit)
        self._seen_event_ids: set[UUID] = set()
        self._seen_order: deque[UUID] = deque()
        self._duplicate_history_limit = duplicate_history_limit
        self._subscription_tokens: list[UUID] = []
        self.running = False
        self.flows_created = 0
        self.vectors_emitted = 0
        self.invalid_events = 0
        self.duplicate_events = 0
        self.out_of_order_events = 0
        self._last_simulation_time: datetime | None = None

    async def start(self) -> None:
        if self.running:
            return
        self._subscription_tokens = [
            await self.bus.subscribe("network_activity", self.handle_event),
            await self.bus.subscribe("simulation_tick", self.handle_event),
        ]
        self.running = True

    async def stop(self) -> None:
        for token in self._subscription_tokens:
            await self.bus.unsubscribe(token)
        self._subscription_tokens.clear()
        self.running = False

    async def reset(self) -> None:
        self.active_flows.clear()
        self.recent_vectors.clear()
        self._seen_event_ids.clear()
        self._seen_order.clear()
        self.flows_created = 0
        self.vectors_emitted = 0
        self.invalid_events = 0
        self.duplicate_events = 0
        self.out_of_order_events = 0
        self._last_simulation_time = None

    async def handle_event(self, event: SimulationEvent) -> None:
        if isinstance(event, SimulationTickEvent):
            if self._last_simulation_time is not None and event.timestamp <= self._last_simulation_time:
                await self.reset()
            self._last_simulation_time = event.timestamp
            await self.expire_flows(event.timestamp)
            return
        if not isinstance(event, NetworkActivityEvent):
            return
        if event.event_id in self._seen_event_ids:
            self.duplicate_events += 1
            return
        self._remember_event_id(event.event_id)
        if (
            event.timestamp.tzinfo is None
            or not event.payload.packet_samples
            or not _metadata_matches_aggregates(event)
        ):
            self.invalid_events += 1
            return
        await self.expire_flows(event.timestamp)
        key = FlowKey.from_event(event)
        flow = self.active_flows.get(key)
        if flow is None:
            source_id, destination_id = _initiator_devices(event)
            flow = FlowState(
                key=key,
                source_device_id=source_id,
                destination_device_id=destination_id,
                provenance_limit=self.provenance_limit,
            )
            self.active_flows[key] = flow
            self.flows_created += 1
        try:
            if flow.add_event(event):
                self.out_of_order_events += 1
        except ValueError:
            self.invalid_events += 1
            return
        if self._should_emit(flow, event.timestamp):
            await self._emit(flow, is_partial=True)
            flow.last_emitted_at = event.timestamp

    async def expire_flows(self, now: datetime) -> None:
        expired: list[FlowKey] = []
        for key, flow in self.active_flows.items():
            if flow.last_event_time is None:
                continue
            inactive = max(0.0, (now - flow.last_event_time).total_seconds())
            age = max(0.0, (now - flow.flow_start).total_seconds())
            if inactive >= self.inactivity_timeout_seconds or age >= self.max_flow_age_seconds:
                if len(flow.packets) >= self.minimum_packets:
                    await self._emit(flow, is_partial=False)
                expired.append(key)
        for key in expired:
            del self.active_flows[key]

    def _should_emit(self, flow: FlowState, now: datetime) -> bool:
        if len(flow.packets) < self.minimum_packets:
            return False
        if flow.last_emitted_at is None:
            return True
        elapsed = (now - flow.last_emitted_at).total_seconds()
        return elapsed >= self.emission_interval_seconds

    async def _emit(self, flow: FlowState, *, is_partial: bool) -> None:
        schema_version, _ = feature_contract()
        event = FeatureVectorEvent(
            event_id=uuid4(),
            timestamp=flow.flow_end,
            source="feature-extraction-manager",
            correlation_id=flow.correlation_id or uuid4(),
            payload=FeatureVectorPayload(
                feature_schema_version=schema_version,
                extractor_version=EXTRACTOR_VERSION,
                flow_id=flow.key.flow_id,
                flow_start=flow.flow_start,
                flow_end=flow.flow_end,
                packet_count=len(flow.packets),
                is_partial_window=is_partial,
                source_device_id=flow.source_device_id,
                destination_device_id=flow.destination_device_id,
                source_event_ids=list(flow.source_event_ids),
                features=self.extractor.extract(flow),
            ),
        )
        self.recent_vectors.append(event)
        self.vectors_emitted += 1
        await self.bus.publish(event)

    def _remember_event_id(self, event_id: UUID) -> None:
        if len(self._seen_order) >= self._duplicate_history_limit:
            oldest = self._seen_order.popleft()
            self._seen_event_ids.discard(oldest)
        self._seen_order.append(event_id)
        self._seen_event_ids.add(event_id)

    def status(self) -> FeatureExtractorStatus:
        return FeatureExtractorStatus(
            running=self.running,
            extractor_version=EXTRACTOR_VERSION,
            active_flow_count=len(self.active_flows),
            flows_created=self.flows_created,
            vectors_emitted=self.vectors_emitted,
            invalid_events=self.invalid_events,
            duplicate_events=self.duplicate_events,
            out_of_order_events=self.out_of_order_events,
            flow_inactivity_timeout_seconds=self.inactivity_timeout_seconds,
            flow_max_age_seconds=self.max_flow_age_seconds,
            emission_interval_seconds=self.emission_interval_seconds,
            minimum_packets=self.minimum_packets,
        )

    def flow_views(self) -> list[ActiveFlowView]:
        return [
            ActiveFlowView(
                flow_id=flow.key.flow_id,
                source_address=flow.key.source_address,
                destination_address=flow.key.destination_address,
                source_port=flow.key.source_port,
                destination_port=flow.key.destination_port,
                protocol=flow.key.protocol,
                source_device_id=flow.source_device_id,
                destination_device_id=flow.destination_device_id,
                flow_start=flow.flow_start,
                flow_end=flow.flow_end,
                packet_count=len(flow.packets),
                source_event_count=len(flow.source_event_ids),
            )
            for flow in self.active_flows.values()
        ]


def _initiator_devices(event: NetworkActivityEvent) -> tuple[str, str]:
    if event.payload.direction == "device_response":
        return event.payload.destination_device_id, event.payload.source_device_id
    return event.payload.source_device_id, event.payload.destination_device_id


def _metadata_matches_aggregates(event: NetworkActivityEvent) -> bool:
    payload = event.payload
    forward = [sample for sample in payload.packet_samples if sample.direction == "forward"]
    backward = [sample for sample in payload.packet_samples if sample.direction == "backward"]
    if any(sample.relative_timestamp_seconds > payload.duration_seconds for sample in payload.packet_samples):
        return False
    return (
        len(forward) == payload.packet_count
        and sum(sample.total_bytes for sample in forward) == payload.byte_count
        and sum(sample.payload_bytes for sample in forward) == payload.payload_bytes
        and sum(sample.header_bytes for sample in forward) == payload.header_bytes
        and len(backward) == payload.response_packet_count
        and sum(sample.total_bytes for sample in backward) == payload.response_byte_count
    )
