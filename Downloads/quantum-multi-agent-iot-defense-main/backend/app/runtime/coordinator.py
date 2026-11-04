import asyncio
from datetime import datetime, timezone

from app.agents.manager import AgentManager
from app.attacks.controller import AttackController
from app.attacks.presets import PRESETS
from app.defense.manager import DefenseManager
from app.domain.simulation import SimulationState
from app.features.contract import feature_contract
from app.features.manager import FeatureExtractionManager
from app.inference.registry import ArtifactRegistry
from app.recovery.manager import RecoveryManager
from app.simulation.engine import SimulationEngine

from .broadcaster import LiveEventBroadcaster
from .runner import AutomaticSimulationRunner


class RuntimeCoordinator:
    """Coordinates component lifecycles; domain decisions stay inside existing managers."""

    def __init__(self, *, simulation: SimulationEngine, features: FeatureExtractionManager,
                 agents: AgentManager, attacks: AttackController, defense: DefenseManager,
                 recovery: RecoveryManager, registry: ArtifactRegistry,
                 broadcaster: LiveEventBroadcaster, runner: AutomaticSimulationRunner,
                 demo_seed: int = 1515, recent_event_limit: int = 500) -> None:
        self.simulation, self.features, self.agents = simulation, features, agents
        self.attacks, self.defense, self.recovery = attacks, defense, recovery
        self.registry, self.broadcaster, self.runner = registry, broadcaster, runner
        self.demo_seed, self.recent_event_limit = demo_seed, recent_event_limit
        self.active = False
        self.initialized = False
        self.startup_order: list[str] = []
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        if self.initialized:
            return
        self.validate_startup()
        await self.broadcaster.start()
        self.initialized = True

    def validate_startup(self) -> None:
        version, names = feature_contract()
        if len(names) != 27 or tuple(names) != self.registry.feature_names:
            raise RuntimeError("Frozen 27-feature runtime contract validation failed")
        if not version or self.registry.binary_qml_threshold != 0.390:
            raise RuntimeError("Frozen inference startup validation failed")

    async def activate(self) -> dict[str, object]:
        async with self._lock:
            await self.initialize()
            if self.active:
                return self.status()
            self.startup_order = []
            await self.features.start(); self.startup_order.append("feature_manager")
            await self.attacks.start(); self.startup_order.append("attack_controller")
            await self.agents.start_all(); self.startup_order.append("agent_manager")
            if self.simulation.clock.state is SimulationState.STOPPED:
                await self.simulation.start()
            elif self.simulation.clock.state is SimulationState.PAUSED:
                await self.simulation.resume()
            self.startup_order.append("simulation_engine")
            await self.runner.start(); self.startup_order.append("automatic_runner")
            self.active = True
            return self.status()

    async def deactivate(self) -> dict[str, object]:
        async with self._lock:
            await self.runner.stop()
            if self.simulation.clock.state is SimulationState.RUNNING:
                await self.simulation.pause()
            await self.agents.stop_all()
            await self.attacks.stop()
            await self.features.stop()
            self.active = False
            return self.status()

    async def reset(self) -> dict[str, object]:
        async with self._lock:
            was_active = self.active
            await self.runner.stop()
            if any(view.status != "stopped" for view in self.agents.views()):
                await self.agents.stop_all()
            await self.simulation.reset(seed=self.demo_seed)
            await self.features.reset()
            self.attacks.reset()
            self.defense.reset()
            self.recovery.reset()
            self.agents.reset_operational_state()
            self.broadcaster.new_epoch()
            if was_active:
                await self.agents.start_all()
                await self.simulation.start()
                await self.runner.start()
            self.active = was_active
            return self.status()

    async def shutdown(self) -> None:
        if self.active:
            await self.deactivate()
        else:
            await self.runner.stop()
            await self.agents.stop_all()
            await self.attacks.stop()
            await self.features.stop()
        await self.broadcaster.stop()
        self.initialized = False

    def status(self) -> dict[str, object]:
        views = self.agents.views()
        qml = next((item for item in views if item.agent_type == "quantum_ml"), None)
        classical = next((item for item in views if item.agent_type == "classical_ml"), None)
        components = {
            "backend_api": "healthy", "simulation": self.simulation.clock.state,
            "event_bus": "healthy", "feature_extractor": "healthy" if self.features.running else "stopped",
            "agents": "degraded" if any(item.error_count for item in views) else ("healthy" if self.active else "stopped"),
            "classical_inference": "degraded" if classical and classical.error_count else "healthy",
            "qml_inference": "degraded" if qml and qml.error_count else "healthy",
            "attack_controller": "healthy" if self.attacks.running else "stopped",
            "defense_manager": "healthy", "recovery_manager": "healthy",
            "websocket": "healthy" if self.broadcaster.health()["running"] else "stopped",
        }
        overall = "degraded" if "degraded" in components.values() else ("live" if self.active else "offline")
        return {"active": self.active, "initialized": self.initialized, "overall": overall,
                "epoch": self.broadcaster.epoch, "sequence": self.broadcaster.sequence,
                "simulation": self.simulation.status().model_dump(mode="json"),
                "runner": {"running": self.runner.running, "tick_errors": self.runner.tick_errors,
                           "tick_interval_seconds": self.runner.tick_interval},
                "components": components, "websocket": self.broadcaster.health(),
                "startup_order": self.startup_order,
                "checked_at": datetime.now(timezone.utc).isoformat()}

    def snapshot(self) -> dict[str, object]:
        events = list(self.broadcaster.recent_events)[-self.recent_event_limit:]
        latest_incidents: dict[str, object] = {}
        for event in events:
            if event.event_type == "threat_assessment":
                latest_incidents[event.payload.incident_id] = event.model_dump(mode="json")
        return {"epoch": self.broadcaster.epoch, "sequence": self.broadcaster.sequence,
                "health": {"status": "ok", "service": "FarmFlow IDS Inference API", "version": "0.1.0"},
                "models": {"feature_count": len(self.registry.feature_names),
                    "feature_names": list(self.registry.feature_names), "qml_device": self.registry.qml_device,
                    "models": {"classical_binary": "binary_xgboost_gpu_v1.json",
                               "classical_multiclass": "multiclass_logistic_regression_v1.joblib",
                               "qml_binary": "binary_qml_amplitude_v1.pt",
                               "qml_multiclass": "multiclass_qml_selected_final_v1.pt"},
                    "thresholds": {"classical_binary": self.registry.binary_xgb_threshold,
                                   "qml_binary": self.registry.binary_qml_threshold}},
                "attack_types": [preset.view().model_dump(mode="json") for preset in PRESETS.values()],
                "status": self.status(), "simulation": self.simulation.status().model_dump(mode="json"),
                "devices": [item.model_dump(mode="json") for item in self.simulation.device_views()],
                "topology": self.simulation.topology().model_dump(mode="json"),
                "events": [item.model_dump(mode="json") for item in events],
                "feature_status": self.features.status().model_dump(mode="json"),
                "flows": [item.model_dump(mode="json") for item in self.features.flow_views()],
                "recent_features": [item.model_dump(mode="json") for item in self.features.recent_vectors],
                "agents": [item.model_dump(mode="json") for item in self.agents.views()],
                "agent_health": self.agents.health().model_dump(mode="json"),
                "audit": [item.model_dump(mode="json") for item in self.agents.audit(limit=150)],
                "attacks": [item.model_dump(mode="json") for item in self.attacks.all_attacks()],
                "active_attacks": [item.model_dump(mode="json") for item in self.attacks.active_attacks()],
                "defenses": [item.model_dump(mode="json") for item in self.defense.history()],
                "policy": self.defense.policy.view().model_dump(mode="json"),
                "recoveries": [item.model_dump(mode="json") for item in self.recovery.history()],
                "latest_incidents": latest_incidents}
