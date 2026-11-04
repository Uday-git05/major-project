from functools import lru_cache

from app.api.simulation import get_simulation_engine
from app.config import get_settings

from .manager import DefenseManager
from .policy import VirtualSecurityPolicyStore


@lru_cache
def get_policy_store() -> VirtualSecurityPolicyStore:
    policy = VirtualSecurityPolicyStore()
    get_simulation_engine().attach_security_policy(policy)
    return policy


@lru_cache
def get_defense_manager() -> DefenseManager:
    settings = get_settings()
    engine = get_simulation_engine()
    return DefenseManager(
        engine.bus, engine, get_policy_store(),
        enabled=settings.autonomous_defense_enabled,
        minimum_severity=settings.autonomous_defense_minimum_severity,
        max_concurrent=settings.max_concurrent_defense_actions,
    )
