from __future__ import annotations

from app.simulation.events import NetworkActivityEvent

from .schemas import PolicyStateView


class VirtualSecurityPolicyStore:
    """In-memory controls that can only affect the FarmFlow simulator."""

    def __init__(self) -> None:
        self.isolated_devices: set[str] = set()
        self.quarantined_sources: set[str] = set()
        self.rate_limited_services: dict[str, float] = {}
        self.restricted_ports: set[int] = set()
        self.gateway_protection = False
        self._snapshots: dict[str, dict[str, object]] = {}
        self.counters = {
            "normal_events_suppressed": 0,
            "attack_events_suppressed": 0,
            "attack_events_rate_limited": 0,
        }

    def apply(self, action_id: str, action_type: str, target: str) -> dict[str, object]:
        if action_id in self._snapshots:
            return {"changed": False, "idempotent": True}
        snapshot: dict[str, object] = {"action_type": action_type, "target": target}
        if action_type == "isolate_virtual_device":
            snapshot["was_present"] = target in self.isolated_devices
            self.isolated_devices.add(target)
        elif action_type == "quarantine_synthetic_source":
            snapshot["was_present"] = target in self.quarantined_sources
            self.quarantined_sources.add(target)
        elif action_type == "rate_limit_virtual_service":
            snapshot["previous"] = self.rate_limited_services.get(target)
            self.rate_limited_services[target] = 0.25
        elif action_type == "restrict_virtual_port":
            port = int(target)
            if not 1 <= port <= 65535:
                raise ValueError("Virtual port must be between 1 and 65535")
            snapshot["was_present"] = port in self.restricted_ports
            self.restricted_ports.add(port)
        elif action_type == "protect_gateway_mode":
            snapshot["previous"] = self.gateway_protection
            self.gateway_protection = True
        elif action_type == "restore_normal_policy":
            snapshot["full"] = self._full_snapshot()
            self.isolated_devices.clear()
            self.quarantined_sources.clear()
            self.rate_limited_services.clear()
            self.restricted_ports.clear()
            self.gateway_protection = False
        else:
            raise ValueError(f"Unsupported defense action: {action_type}")
        self._snapshots[action_id] = snapshot
        return {"changed": True, "simulator_only": True}

    def rollback(self, action_id: str) -> dict[str, object]:
        snapshot = self._snapshots.pop(action_id, None)
        if snapshot is None:
            return {"changed": False, "idempotent": True}
        action_type, target = str(snapshot["action_type"]), str(snapshot["target"])
        if action_type == "isolate_virtual_device" and not snapshot["was_present"]:
            self.isolated_devices.discard(target)
        elif action_type == "quarantine_synthetic_source" and not snapshot["was_present"]:
            self.quarantined_sources.discard(target)
        elif action_type == "rate_limit_virtual_service":
            previous = snapshot["previous"]
            if previous is None:
                self.rate_limited_services.pop(target, None)
            else:
                self.rate_limited_services[target] = float(previous)
        elif action_type == "restrict_virtual_port" and not snapshot["was_present"]:
            self.restricted_ports.discard(int(target))
        elif action_type == "protect_gateway_mode":
            self.gateway_protection = bool(snapshot["previous"])
        elif action_type == "restore_normal_policy":
            self._restore_full(snapshot["full"])
        return {"changed": True, "simulator_only": True}

    def allows_normal_device(self, device_id: str) -> bool:
        allowed = device_id not in self.isolated_devices
        if not allowed:
            self.counters["normal_events_suppressed"] += 1
        return allowed

    def filter_attack_events(self, events: list[NetworkActivityEvent]) -> list[NetworkActivityEvent]:
        accepted: list[NetworkActivityEvent] = []
        service_seen: dict[str, int] = {}
        for event in events:
            p = event.payload
            blocked = (
                p.source_device_id in self.quarantined_sources
                or p.destination_device_id in self.isolated_devices
                or p.destination_port in self.restricted_ports
                or (self.gateway_protection and p.direction == "synthetic_to_target")
            )
            if blocked:
                self.counters["attack_events_suppressed"] += 1
                continue
            limit = self.rate_limited_services.get(p.service)
            if limit is not None:
                count = service_seen.get(p.service, 0)
                service_seen[p.service] = count + 1
                stride = max(1, round(1 / limit))
                if count % stride:
                    self.counters["attack_events_rate_limited"] += 1
                    continue
            accepted.append(event)
        return accepted

    def view(self) -> PolicyStateView:
        return PolicyStateView(
            isolated_devices=sorted(self.isolated_devices),
            quarantined_sources=sorted(self.quarantined_sources),
            rate_limited_services=dict(sorted(self.rate_limited_services.items())),
            restricted_ports=sorted(self.restricted_ports),
            gateway_protection=self.gateway_protection,
            counters=dict(self.counters),
            action_count=len(self._snapshots),
        )

    def reset(self) -> None:
        self.isolated_devices.clear()
        self.quarantined_sources.clear()
        self.rate_limited_services.clear()
        self.restricted_ports.clear()
        self.gateway_protection = False
        self._snapshots.clear()
        for key in self.counters:
            self.counters[key] = 0

    def _full_snapshot(self) -> dict[str, object]:
        return {"isolated": set(self.isolated_devices), "quarantined": set(self.quarantined_sources),
                "rates": dict(self.rate_limited_services), "ports": set(self.restricted_ports),
                "gateway": self.gateway_protection}

    def _restore_full(self, value: object) -> None:
        state = value if isinstance(value, dict) else {}
        self.isolated_devices = set(state.get("isolated", set()))
        self.quarantined_sources = set(state.get("quarantined", set()))
        self.rate_limited_services = dict(state.get("rates", {}))
        self.restricted_ports = set(state.get("ports", set()))
        self.gateway_protection = bool(state.get("gateway", False))
