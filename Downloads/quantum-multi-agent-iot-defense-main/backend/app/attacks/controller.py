from collections import deque
from datetime import datetime
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from app.domain.simulation import DeviceView
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine
from app.simulation.events import (
    AttackActivityEvent,
    AttackActivityPayload,
    AttackCancelledEvent,
    AttackCompletedEvent,
    AttackLifecyclePayload,
    AttackScheduledEvent,
    AttackStartedEvent,
    SimulationEvent,
    SimulationTickEvent,
)

from .presets import PRESETS, AttackPreset
from .scenarios import generate_attack_network_events
from .schemas import (
    AttackScenario,
    AttackStatus,
    GroundTruthRecord,
    ScheduleAttackRequest,
)


class AttackControllerError(ValueError):
    pass


class AttackController:
    """Schedules synthetic metadata patterns against the in-memory topology only."""

    def __init__(
        self,
        bus: AsyncEventBus,
        simulation: SimulationEngine,
        *,
        history_limit: int = 500,
        ground_truth_limit: int = 20_000,
    ) -> None:
        self.bus = bus
        self.simulation = simulation
        self.history_limit = history_limit
        self.ground_truth_limit = ground_truth_limit
        self.scenarios: dict[str, AttackScenario] = {}
        self._history_ids: deque[str] = deque(maxlen=history_limit)
        self._ground_truth: dict[UUID, GroundTruthRecord] = {}
        self._ground_truth_order: deque[UUID] = deque()
        self._subscription_token: UUID | None = None
        self.running = False
        self.security_policy = None

    def attach_security_policy(self, policy) -> None:
        self.security_policy = policy

    async def start(self) -> None:
        if self.running:
            return
        self._subscription_token = await self.bus.subscribe("simulation_tick", self.handle_event)
        self.running = True

    async def stop(self) -> None:
        if self._subscription_token is not None:
            await self.bus.unsubscribe(self._subscription_token)
            self._subscription_token = None
        self.running = False

    async def schedule(self, request: ScheduleAttackRequest) -> AttackScenario:
        preset = PRESETS[request.attack_type]
        target = self._resolve_target(request.target_device_id, preset)
        current_tick = self.simulation.clock.tick_number
        start_tick = request.start_tick if request.start_tick is not None else current_tick + 1
        if start_tick <= current_tick:
            raise AttackControllerError("start_tick must be later than the current simulation tick")
        duration = request.duration_ticks or preset.default_duration_ticks
        intensity = request.intensity or preset.default_intensity
        # The correlation ID remains deterministic for lineage, while the public
        # simulation ID must never collide with an earlier run after a reset.
        attack_id = f"simulation-{uuid4()}"
        correlation_id = uuid5(NAMESPACE_URL, f"{attack_id}:correlation")
        # Keep the synthetic identity label-neutral; attack type remains private ground truth.
        source_device_id = request.source_device_id or f"synthetic-source-{request.seed}"
        source_address = self._synthetic_source_address(
            request.seed, preset, target
        )
        scenario = AttackScenario(
            attack_id=attack_id,
            attack_type=request.attack_type,
            name=preset.name,
            description=preset.description,
            target_device_id=target.device_id,
            source_device_id=source_device_id,
            status=AttackStatus.SCHEDULED,
            severity_hint=preset.severity_hint,
            start_tick=start_tick,
            end_tick=start_tick + duration - 1,
            duration_ticks=duration,
            intensity=intensity,
            seed=request.seed,
            correlation_id=correlation_id,
            metadata={
                "synthetic_source_address": source_address,
                "protocol": preset.protocol,
                "service": preset.service,
                "software_only": True,
            },
        )
        self.scenarios[attack_id] = scenario
        await self.bus.publish(
            AttackScheduledEvent(
                **self._identity(scenario, "scheduled", current_tick),
                payload=self._lifecycle_payload(scenario),
            )
        )
        return scenario

    async def start_attack(self, attack_id: str) -> AttackScenario:
        scenario = self.get(attack_id)
        if scenario.status is not AttackStatus.SCHEDULED:
            raise AttackControllerError(f"Cannot start attack while {scenario.status}")
        scenario.start_tick = self.simulation.clock.tick_number + 1
        scenario.end_tick = scenario.start_tick + scenario.duration_ticks - 1
        scenario.status = AttackStatus.ACTIVE
        await self.bus.publish(
            AttackStartedEvent(
                **self._identity(scenario, "started", self.simulation.clock.tick_number),
                payload=self._lifecycle_payload(scenario),
            )
        )
        return scenario

    async def cancel(self, attack_id: str) -> AttackScenario:
        scenario = self.get(attack_id)
        if scenario.status not in {AttackStatus.SCHEDULED, AttackStatus.ACTIVE}:
            raise AttackControllerError(f"Cannot cancel attack while {scenario.status}")
        scenario.status = AttackStatus.CANCELLED
        self._record_history(scenario.attack_id)
        await self.bus.publish(
            AttackCancelledEvent(
                **self._identity(scenario, "cancelled", self.simulation.clock.tick_number),
                payload=self._lifecycle_payload(scenario),
            )
        )
        return scenario

    async def handle_event(self, event: SimulationEvent) -> None:
        if not isinstance(event, SimulationTickEvent):
            return
        tick = event.payload.tick_number
        for scenario in tuple(self.scenarios.values()):
            if scenario.status is AttackStatus.SCHEDULED and tick >= scenario.start_tick:
                scenario.status = AttackStatus.ACTIVE
                await self.bus.publish(
                    AttackStartedEvent(
                        **self._identity(scenario, "started", tick, timestamp=event.timestamp),
                        payload=self._lifecycle_payload(scenario),
                    )
                )
            if scenario.status is not AttackStatus.ACTIVE or tick < scenario.start_tick:
                continue
            if tick > scenario.end_tick:
                await self._complete(scenario, tick, event.timestamp)
                continue
            try:
                target = self._device(scenario.target_device_id)
                network_events = generate_attack_network_events(
                    scenario,
                    PRESETS[scenario.attack_type],
                    target,
                    tick_number=tick,
                    timestamp=event.timestamp,
                )
                if self.security_policy is not None:
                    network_events = self.security_policy.filter_attack_events(network_events)
                for network_event in network_events:
                    self._remember_ground_truth(network_event.event_id, scenario)
                    await self.bus.publish(network_event)
                scenario.ticks_active += 1
                scenario.network_events_generated += len(network_events)
                await self.bus.publish(
                    AttackActivityEvent(
                        **self._identity(scenario, "activity", tick, timestamp=event.timestamp),
                        payload=AttackActivityPayload(
                            attack_id=scenario.attack_id,
                            attack_type=scenario.attack_type,
                            tick_number=tick,
                            generated_network_event_ids=[item.event_id for item in network_events],
                            generated_event_count=len(network_events),
                        ),
                    )
                )
            except Exception:
                scenario.status = AttackStatus.FAILED
                self._record_history(scenario.attack_id)
                raise
            if tick >= scenario.end_tick:
                await self._complete(scenario, tick, event.timestamp)

    async def _complete(self, scenario: AttackScenario, tick: int, timestamp: datetime) -> None:
        if scenario.status is AttackStatus.COMPLETED:
            return
        scenario.status = AttackStatus.COMPLETED
        self._record_history(scenario.attack_id)
        await self.bus.publish(
            AttackCompletedEvent(
                **self._identity(scenario, "completed", tick, timestamp=timestamp),
                payload=self._lifecycle_payload(scenario),
            )
        )

    def get(self, attack_id: str) -> AttackScenario:
        try:
            return self.scenarios[attack_id]
        except KeyError as exc:
            raise AttackControllerError(f"Unknown attack ID: {attack_id}") from exc

    def all_attacks(self) -> list[AttackScenario]:
        return list(self.scenarios.values())

    def active_attacks(self) -> list[AttackScenario]:
        return [item for item in self.scenarios.values() if item.status is AttackStatus.ACTIVE]

    def history(self) -> list[AttackScenario]:
        return [self.scenarios[attack_id] for attack_id in self._history_ids]

    def reset(self) -> None:
        self.scenarios.clear()
        self._history_ids.clear()
        self._ground_truth.clear()
        self._ground_truth_order.clear()

    def ground_truth_for_event(self, event_id: UUID) -> GroundTruthRecord | None:
        return self._ground_truth.get(event_id)

    def _resolve_target(self, requested_id: str | None, preset: AttackPreset) -> DeviceView:
        devices = self.simulation.device_views()
        if requested_id is None:
            target = next(
                (device for device in devices if device.device_type in preset.allowed_target_types),
                None,
            )
        else:
            target = next((device for device in devices if device.device_id == requested_id), None)
        if target is None:
            raise AttackControllerError(f"Unknown or unavailable target: {requested_id}")
        if target.device_type not in preset.allowed_target_types:
            allowed = [item.value for item in preset.allowed_target_types]
            raise AttackControllerError(
                f"Target {target.device_id} is not appropriate for {preset.attack_type}; allowed={allowed}"
            )
        return target

    def _device(self, device_id: str) -> DeviceView:
        for device in self.simulation.device_views():
            if device.device_id == device_id:
                return device
        raise AttackControllerError(f"Target disappeared from topology: {device_id}")

    def _synthetic_source_address(
        self, seed: int, preset: AttackPreset, target: DeviceView
    ) -> str:
        if preset.identity_conflict:
            for device in self.simulation.device_views():
                if device.device_id != target.device_id:
                    return device.address
        return f"172.31.{abs(seed) % 250}.{(abs(seed) * 17) % 250 + 1}"

    def _lifecycle_payload(self, scenario: AttackScenario) -> AttackLifecyclePayload:
        return AttackLifecyclePayload(
            attack_id=scenario.attack_id,
            attack_type=scenario.attack_type,
            target_device_id=scenario.target_device_id,
            status=scenario.status,
            start_tick=scenario.start_tick,
            end_tick=scenario.end_tick,
            intensity=scenario.intensity,
            severity_hint=scenario.severity_hint,
        )

    def _identity(
        self,
        scenario: AttackScenario,
        kind: str,
        tick: int,
        *,
        timestamp: datetime | None = None,
    ) -> dict[str, object]:
        return {
            "event_id": uuid5(NAMESPACE_URL, f"{scenario.attack_id}:{kind}:{tick}"),
            "timestamp": timestamp or self.simulation.clock.current_time,
            "source": "attack-controller",
            "correlation_id": scenario.correlation_id,
        }

    def _remember_ground_truth(self, event_id: UUID, scenario: AttackScenario) -> None:
        if len(self._ground_truth_order) >= self.ground_truth_limit:
            oldest = self._ground_truth_order.popleft()
            self._ground_truth.pop(oldest, None)
        self._ground_truth_order.append(event_id)
        self._ground_truth[event_id] = GroundTruthRecord(
            attack_id=scenario.attack_id,
            attack_type=scenario.attack_type,
            correlation_id=scenario.correlation_id,
        )

    def _record_history(self, attack_id: str) -> None:
        if attack_id not in self._history_ids:
            if len(self._history_ids) >= self.history_limit:
                oldest = self._history_ids.popleft()
                self.scenarios.pop(oldest, None)
            self._history_ids.append(attack_id)
