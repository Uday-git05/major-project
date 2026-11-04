from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.simulation import get_simulation_engine
from app.config import get_settings
from app.features.contract import EXTRACTOR_VERSION, feature_contract
from app.features.manager import FeatureExtractionManager
from app.features.schemas import ActiveFlowView, FeatureExtractorStatus, FeatureSchemaResponse
from app.simulation.events import FeatureVectorEvent


COMPATIBILITY_NOTICE = (
    "The live extractor is a deterministic compatibility layer for the project's virtual "
    "IoT testbed. It uses the same 27-feature contract expected by the frozen models, but "
    "it is not claimed to exactly reproduce the original dataset author's packet-to-flow "
    "implementation."
)


FORMULAS = {
    "missed_bytes": "sum(packet.missed_bytes)",
    "orig_pkts": "count(forward packets)",
    "orig_ip_bytes": "sum(forward packet total_bytes)",
    "resp_pkts": "count(backward packets)",
    "resp_ip_bytes": "sum(backward packet total_bytes)",
    "fwd_pkts_per_sec": "orig_pkts / flow_duration_seconds; 0 when duration is 0",
    "bwd_pkts_per_sec": "resp_pkts / flow_duration_seconds; 0 when duration is 0",
    "flow_pkts_per_sec": "(orig_pkts + resp_pkts) / flow_duration_seconds; 0 when duration is 0",
    "down_up_ratio": "resp_pkts / orig_pkts; 0 when orig_pkts is 0",
    "fwd_header_size_tot": "sum(forward header_bytes)",
    "fwd_header_size_min": "min(forward header_bytes); 0 with no forward packets",
    "fwd_header_size_max": "max(forward header_bytes); 0 with no forward packets",
    "bwd_header_size_tot": "sum(backward header_bytes)",
    "bwd_header_size_min": "min(backward header_bytes); 0 with no backward packets",
    "bwd_header_size_max": "max(backward header_bytes); 0 with no backward packets",
    "fwd_pkts_payload.tot": "sum(forward payload_bytes)",
    "fwd_pkts_payload.avg": "forward payload total / orig_pkts; 0 with no forward packets",
    "bwd_pkts_payload.tot": "sum(backward payload_bytes)",
    "bwd_pkts_payload.avg": "backward payload total / resp_pkts; 0 with no backward packets",
    "flow_pkts_payload.tot": "forward payload total + backward payload total",
    "flow_pkts_payload.avg": "total payload / total packets; 0 with no packets",
    "fwd_iat.tot": "sum(seconds between timestamp-sorted consecutive forward packets)",
    "fwd_iat.avg": "forward IAT total / forward interval count; 0 with fewer than 2 packets",
    "bwd_iat.tot": "sum(seconds between timestamp-sorted consecutive backward packets)",
    "bwd_iat.avg": "backward IAT total / backward interval count; 0 with fewer than 2 packets",
    "flow_iat.tot": "sum(seconds between all timestamp-sorted consecutive packets)",
    "flow_iat.avg": "flow IAT total / (total packets - 1); 0 with fewer than 2 packets",
}


router = APIRouter(prefix="/v1/features", tags=["features"])


@lru_cache
def get_feature_manager() -> FeatureExtractionManager:
    settings = get_settings()
    return FeatureExtractionManager(
        get_simulation_engine().bus,
        inactivity_timeout_seconds=settings.feature_flow_inactivity_timeout_seconds,
        max_flow_age_seconds=settings.feature_flow_max_age_seconds,
        emission_interval_seconds=settings.feature_emission_interval_seconds,
        minimum_packets=settings.feature_min_packets,
        history_limit=settings.feature_history_limit,
        provenance_limit=settings.feature_provenance_limit,
    )


FeatureManager = Annotated[FeatureExtractionManager, Depends(get_feature_manager)]


@router.get("/schema", response_model=FeatureSchemaResponse)
def schema() -> FeatureSchemaResponse:
    version, names = feature_contract()
    return FeatureSchemaResponse(
        feature_schema_version=version,
        extractor_version=EXTRACTOR_VERSION,
        feature_count=len(names),
        feature_names=list(names),
        compatibility_notice=COMPATIBILITY_NOTICE,
        formulas=FORMULAS,
    )


@router.get("/status", response_model=FeatureExtractorStatus)
def status(manager: FeatureManager) -> FeatureExtractorStatus:
    return manager.status()


@router.get("/flows", response_model=list[ActiveFlowView])
def flows(manager: FeatureManager) -> list[ActiveFlowView]:
    return manager.flow_views()


@router.get("/recent", response_model=list[FeatureVectorEvent])
def recent(
    manager: FeatureManager, limit: int = Query(default=100, ge=1, le=500)
) -> list[FeatureVectorEvent]:
    return list(manager.recent_vectors)[-limit:]
