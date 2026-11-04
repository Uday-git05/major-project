from collections.abc import Sequence

from .contract import feature_contract, validate_feature_mapping
from .flow import FlowPacket, FlowState


class SyntheticFarmFlowExtractor:
    """Deterministic project compatibility formulas over synthetic packet metadata."""

    def extract(self, flow: FlowState) -> dict[str, float]:
        forward = [packet for packet in flow.packets if packet.direction == "forward"]
        backward = [packet for packet in flow.packets if packet.direction == "backward"]
        ordered = flow.packets
        duration = max(0.0, (flow.flow_end - flow.flow_start).total_seconds())

        orig_pkts = len(forward)
        resp_pkts = len(backward)
        total_pkts = orig_pkts + resp_pkts
        fwd_payload = sum(packet.payload_bytes for packet in forward)
        bwd_payload = sum(packet.payload_bytes for packet in backward)
        total_payload = fwd_payload + bwd_payload
        fwd_iats = _inter_arrivals(forward)
        bwd_iats = _inter_arrivals(backward)
        flow_iats = _inter_arrivals(ordered)

        computed = {
            "missed_bytes": float(sum(packet.missed_bytes for packet in ordered)),
            "orig_pkts": float(orig_pkts),
            "orig_ip_bytes": float(sum(packet.total_bytes for packet in forward)),
            "resp_pkts": float(resp_pkts),
            "resp_ip_bytes": float(sum(packet.total_bytes for packet in backward)),
            "fwd_pkts_per_sec": _safe_div(orig_pkts, duration),
            "bwd_pkts_per_sec": _safe_div(resp_pkts, duration),
            "flow_pkts_per_sec": _safe_div(total_pkts, duration),
            "down_up_ratio": _safe_div(resp_pkts, orig_pkts),
            "fwd_header_size_tot": float(sum(packet.header_bytes for packet in forward)),
            "fwd_header_size_min": float(min((packet.header_bytes for packet in forward), default=0)),
            "fwd_header_size_max": float(max((packet.header_bytes for packet in forward), default=0)),
            "bwd_header_size_tot": float(sum(packet.header_bytes for packet in backward)),
            "bwd_header_size_min": float(min((packet.header_bytes for packet in backward), default=0)),
            "bwd_header_size_max": float(max((packet.header_bytes for packet in backward), default=0)),
            "fwd_pkts_payload.tot": float(fwd_payload),
            "fwd_pkts_payload.avg": _safe_div(fwd_payload, orig_pkts),
            "bwd_pkts_payload.tot": float(bwd_payload),
            "bwd_pkts_payload.avg": _safe_div(bwd_payload, resp_pkts),
            "flow_pkts_payload.tot": float(total_payload),
            "flow_pkts_payload.avg": _safe_div(total_payload, total_pkts),
            "fwd_iat.tot": float(sum(fwd_iats)),
            "fwd_iat.avg": _safe_div(sum(fwd_iats), len(fwd_iats)),
            "bwd_iat.tot": float(sum(bwd_iats)),
            "bwd_iat.avg": _safe_div(sum(bwd_iats), len(bwd_iats)),
            "flow_iat.tot": float(sum(flow_iats)),
            "flow_iat.avg": _safe_div(sum(flow_iats), len(flow_iats)),
        }
        _, feature_names = feature_contract()
        features = {name: computed[name] for name in feature_names}
        validate_feature_mapping(features)
        return features


def _safe_div(numerator: float | int, denominator: float | int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


def _inter_arrivals(packets: Sequence[FlowPacket]) -> list[float]:
    if len(packets) < 2:
        return []
    ordered = sorted(
        packets,
        key=lambda packet: (packet.timestamp, str(packet.source_event_id), packet.sample_index),
    )
    return [
        max(0.0, (current.timestamp - previous.timestamp).total_seconds())
        for previous, current in zip(ordered, ordered[1:])
    ]
