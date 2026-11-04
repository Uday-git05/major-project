from app.inference.service import InferenceService
from app.simulation.bus import AsyncEventBus

from .classical_ml import ClassicalMLAgent
from .defense import DefenseAgent
from .manager import AgentManager
from .monitoring import MonitoringAgent
from .quantum_ml import QuantumMLAgent
from .recovery import RecoveryAgent
from .threat_analysis import ThreatAnalysisAgent
from app.defense.manager import DefenseManager
from app.recovery.manager import RecoveryManager


def create_default_agent_manager(
    bus: AsyncEventBus, inference_service: InferenceService, *, audit_limit: int = 500,
    defense_manager: DefenseManager | None = None,
    recovery_manager: RecoveryManager | None = None,
) -> AgentManager:
    manager = AgentManager()
    manager.register(MonitoringAgent(bus, audit_limit=audit_limit))
    manager.register(ClassicalMLAgent(bus, inference_service, audit_limit=audit_limit))
    manager.register(QuantumMLAgent(bus, inference_service, audit_limit=audit_limit))
    manager.register(ThreatAnalysisAgent(bus, audit_limit=audit_limit))
    manager.register(DefenseAgent(bus, manager=defense_manager, audit_limit=audit_limit))
    manager.register(RecoveryAgent(bus, manager=recovery_manager, audit_limit=audit_limit))
    return manager
