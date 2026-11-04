from app.attacks.controller import AttackController
from app.features.manager import FeatureExtractionManager
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine


def attack_environment(*, simulation_seed: int = 42, emission_interval: float = 0.0):
    bus = AsyncEventBus()
    engine = SimulationEngine(seed=simulation_seed)
    engine.bus = bus
    controller = AttackController(bus, engine)
    features = FeatureExtractionManager(bus, emission_interval_seconds=emission_interval)
    return bus, engine, controller, features
