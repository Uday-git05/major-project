def test_simulation_read_endpoints(simulation_client):
    status = simulation_client.get("/v1/simulation/status")
    devices = simulation_client.get("/v1/simulation/devices")
    topology = simulation_client.get("/v1/simulation/topology")
    assert status.status_code == 200
    assert status.json()["state"] == "stopped"
    assert len(devices.json()) == status.json()["device_count"]
    assert topology.json()["gateway_id"] == "gateway-01"


def test_simulation_control_and_event_endpoints(simulation_client):
    started = simulation_client.post("/v1/simulation/start")
    ticked = simulation_client.post("/v1/simulation/tick", json={"count": 2})
    paused = simulation_client.post("/v1/simulation/pause")
    blocked_tick = simulation_client.post("/v1/simulation/tick", json={"count": 1})
    resumed = simulation_client.post("/v1/simulation/resume")
    events = simulation_client.get(
        "/v1/simulation/events", params={"event_type": "telemetry", "limit": 1000}
    )
    reset = simulation_client.post("/v1/simulation/reset", json={"seed": 99})

    assert started.status_code == 200
    assert ticked.json()["status"]["tick_number"] == 2
    assert paused.json()["status"]["state"] == "paused"
    assert blocked_tick.status_code == 409
    assert resumed.json()["status"]["state"] == "running"
    assert events.status_code == 200
    assert events.json()
    assert all(event["event_type"] == "telemetry" for event in events.json())
    assert reset.json()["status"]["seed"] == 99
    assert reset.json()["status"]["event_count"] == 0


def test_simulation_api_validates_inputs_and_transitions(simulation_client):
    assert simulation_client.post("/v1/simulation/pause").status_code == 409
    assert simulation_client.post("/v1/simulation/tick", json={"count": 0}).status_code == 422
    assert simulation_client.get(
        "/v1/simulation/events", params={"event_type": "unknown"}
    ).status_code == 422
