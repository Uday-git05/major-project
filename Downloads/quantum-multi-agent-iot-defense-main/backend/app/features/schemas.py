from datetime import datetime

from pydantic import BaseModel, Field


class FeatureSchemaResponse(BaseModel):
    feature_schema_version: str
    extractor_version: str
    feature_count: int
    feature_names: list[str]
    compatibility_notice: str
    formulas: dict[str, str]


class FeatureExtractorStatus(BaseModel):
    running: bool
    extractor_version: str
    active_flow_count: int = Field(ge=0)
    flows_created: int = Field(ge=0)
    vectors_emitted: int = Field(ge=0)
    invalid_events: int = Field(ge=0)
    duplicate_events: int = Field(ge=0)
    out_of_order_events: int = Field(ge=0)
    flow_inactivity_timeout_seconds: float
    flow_max_age_seconds: float
    emission_interval_seconds: float
    minimum_packets: int


class ActiveFlowView(BaseModel):
    flow_id: str
    source_address: str
    destination_address: str
    source_port: int
    destination_port: int
    protocol: str
    source_device_id: str
    destination_device_id: str
    flow_start: datetime
    flow_end: datetime
    packet_count: int
    source_event_count: int
