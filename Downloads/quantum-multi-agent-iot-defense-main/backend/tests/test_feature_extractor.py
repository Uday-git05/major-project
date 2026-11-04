from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.features.contract import EXTRACTOR_VERSION, feature_contract
from app.features.extractor import SyntheticFarmFlowExtractor
from app.features.flow import FlowKey, FlowState
from app.simulation.events import FeatureVectorEvent, FeatureVectorPayload, PacketSample

from feature_test_utils import network_event, packet


def _worked_flow():
    samples = [
        packet(0.0, "forward", 20, 80, missed=5),
        packet(1.0, "forward", 24, 76),
        packet(2.0, "backward", 20, 30),
        packet(4.0, "backward", 24, 26),
    ]
    event = network_event(samples)
    flow = FlowState(
        key=FlowKey.from_event(event),
        source_device_id="sensor-01",
        destination_device_id="gateway-01",
        provenance_limit=64,
    )
    flow.add_event(event)
    return event, flow


def test_exact_frozen_feature_order_and_artifact_compatibility():
    schema_version, names = feature_contract()
    _, flow = _worked_flow()
    features = SyntheticFarmFlowExtractor().extract(flow)
    assert schema_version == "2.0"
    assert len(names) == 27
    assert tuple(features) == names


def test_reverse_response_canonicalizes_to_initiator_flow_key():
    forward = network_event(
        [packet(0.0, "forward", 20, 10), packet(0.1, "backward", 20, 10)]
    )
    payload = forward.payload
    reverse = forward.model_copy(
        update={
            "payload": payload.model_copy(
                update={
                    "source_device_id": payload.destination_device_id,
                    "destination_device_id": payload.source_device_id,
                    "source_address": payload.destination_address,
                    "destination_address": payload.source_address,
                    "source_port": payload.destination_port,
                    "destination_port": payload.source_port,
                    "direction": "device_response",
                }
            )
        }
    )
    assert FlowKey.from_event(forward) == FlowKey.from_event(reverse)


def test_hand_calculated_four_packet_flow_all_27_features():
    _, flow = _worked_flow()
    actual = SyntheticFarmFlowExtractor().extract(flow)
    expected = {
        "missed_bytes": 5.0,
        "orig_pkts": 2.0,
        "orig_ip_bytes": 200.0,
        "resp_pkts": 2.0,
        "resp_ip_bytes": 100.0,
        "fwd_pkts_per_sec": 0.5,
        "bwd_pkts_per_sec": 0.5,
        "flow_pkts_per_sec": 1.0,
        "down_up_ratio": 1.0,
        "fwd_header_size_tot": 44.0,
        "fwd_header_size_min": 20.0,
        "fwd_header_size_max": 24.0,
        "bwd_header_size_tot": 44.0,
        "bwd_header_size_min": 20.0,
        "bwd_header_size_max": 24.0,
        "fwd_pkts_payload.tot": 156.0,
        "fwd_pkts_payload.avg": 78.0,
        "bwd_pkts_payload.tot": 56.0,
        "bwd_pkts_payload.avg": 28.0,
        "flow_pkts_payload.tot": 212.0,
        "flow_pkts_payload.avg": 53.0,
        "fwd_iat.tot": 1.0,
        "fwd_iat.avg": 1.0,
        "bwd_iat.tot": 2.0,
        "bwd_iat.avg": 2.0,
        "flow_iat.tot": 4.0,
        "flow_iat.avg": pytest.approx(4.0 / 3.0),
    }
    assert actual == expected


def test_zero_duration_one_packet_and_forward_only_policy():
    event = network_event([packet(0.0, "forward", 20, 80)])
    flow = FlowState(
        key=FlowKey.from_event(event),
        source_device_id="sensor-01",
        destination_device_id="gateway-01",
        provenance_limit=10,
    )
    flow.add_event(event)
    features = SyntheticFarmFlowExtractor().extract(flow)
    assert features["orig_pkts"] == 1.0
    assert features["resp_pkts"] == 0.0
    assert features["fwd_pkts_per_sec"] == 0.0
    assert features["down_up_ratio"] == 0.0
    assert features["bwd_header_size_min"] == 0.0
    assert features["flow_iat.tot"] == 0.0


def test_no_forward_packets_has_deterministic_zero_denominators():
    event = network_event([packet(0.0, "backward", 20, 30)])
    flow = FlowState(
        key=FlowKey.from_event(event),
        source_device_id="sensor-01",
        destination_device_id="gateway-01",
        provenance_limit=10,
    )
    flow.add_event(event)
    features = SyntheticFarmFlowExtractor().extract(flow)
    assert features["orig_pkts"] == 0.0
    assert features["resp_pkts"] == 1.0
    assert features["down_up_ratio"] == 0.0
    assert features["fwd_pkts_payload.avg"] == 0.0


def test_same_timestamp_packets_produce_zero_iats_and_rates():
    event = network_event(
        [packet(0.0, "forward", 20, 10), packet(0.0, "backward", 20, 10)]
    )
    flow = FlowState(
        key=FlowKey.from_event(event),
        source_device_id="sensor-01",
        destination_device_id="gateway-01",
        provenance_limit=10,
    )
    flow.add_event(event)
    features = SyntheticFarmFlowExtractor().extract(flow)
    assert features["flow_pkts_per_sec"] == 0.0
    assert features["flow_iat.tot"] == 0.0
    assert features["flow_iat.avg"] == 0.0


@pytest.mark.parametrize(
    "field,value",
    [
        ("relative_timestamp_seconds", float("nan")),
        ("relative_timestamp_seconds", float("inf")),
        ("relative_timestamp_seconds", -1.0),
        ("header_bytes", -1),
        ("payload_bytes", -1),
        ("missed_bytes", -1),
    ],
)
def test_packet_metadata_rejects_non_finite_and_negative_values(field, value):
    values = {
        "relative_timestamp_seconds": 0.0,
        "direction": "forward",
        "header_bytes": 20,
        "payload_bytes": 10,
        "total_bytes": 30,
        "missed_bytes": 0,
    }
    values[field] = value
    with pytest.raises(ValidationError):
        PacketSample(**values)


def test_feature_event_rejects_wrong_order_and_non_finite_values():
    event, flow = _worked_flow()
    features = SyntheticFarmFlowExtractor().extract(flow)
    schema_version, _ = feature_contract()
    common = dict(
        event_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        source="extractor",
        correlation_id=event.correlation_id,
    )
    payload = dict(
        feature_schema_version=schema_version,
        extractor_version=EXTRACTOR_VERSION,
        flow_id=flow.key.flow_id,
        flow_start=flow.flow_start,
        flow_end=flow.flow_end,
        packet_count=4,
        is_partial_window=True,
        source_device_id="sensor-01",
        destination_device_id="gateway-01",
        source_event_ids=[event.event_id],
    )
    reversed_features = dict(reversed(list(features.items())))
    with pytest.raises(ValidationError, match="names/order"):
        FeatureVectorEvent(**common, payload={**payload, "features": reversed_features})
    invalid = dict(features)
    invalid["missed_bytes"] = float("nan")
    with pytest.raises(ValidationError, match="finite"):
        FeatureVectorEvent(**common, payload={**payload, "features": invalid})
