from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.domain.schemas import (
    CombinedInferenceResponse,
    FeatureVectorRequest,
    HealthResponse,
    InferenceResponse,
    ModelInfo,
)
from app.inference.registry import ArtifactRegistry
from app.inference.service import InferenceService


router = APIRouter()


@lru_cache
def get_registry() -> ArtifactRegistry:
    return ArtifactRegistry(get_settings())


@lru_cache
def get_inference_service() -> InferenceService:
    return InferenceService(get_registry())


Service = Annotated[InferenceService, Depends(get_inference_service)]


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.app_name, version=settings.app_version)


@router.get("/v1/models", response_model=ModelInfo, tags=["inference"])
def model_info(service: Service) -> ModelInfo:
    registry = service.registry
    return ModelInfo(
        feature_count=len(registry.feature_names),
        feature_names=list(registry.feature_names),
        qml_device=registry.qml_device,
        models={
            "classical_binary": "binary_xgboost_gpu_v1.json",
            "classical_multiclass": "multiclass_logistic_regression_v1.joblib",
            "qml_binary": "binary_qml_amplitude_v1.pt",
            "qml_multiclass": "multiclass_qml_selected_final_v1.pt",
        },
        thresholds={
            "classical_binary": registry.binary_xgb_threshold,
            "qml_binary": registry.binary_qml_threshold,
        },
    )


@router.post(
    "/v1/inference/classical/binary", response_model=InferenceResponse, tags=["inference"]
)
def classical_binary(request: FeatureVectorRequest, service: Service) -> InferenceResponse:
    return service.predict_classical_binary(request.features, request.correlation_id)


@router.post(
    "/v1/inference/classical/multiclass", response_model=InferenceResponse, tags=["inference"]
)
def classical_multiclass(request: FeatureVectorRequest, service: Service) -> InferenceResponse:
    return service.predict_classical_multiclass(request.features, request.correlation_id)


@router.post("/v1/inference/qml/binary", response_model=InferenceResponse, tags=["inference"])
def qml_binary(request: FeatureVectorRequest, service: Service) -> InferenceResponse:
    return service.predict_qml_binary(request.features, request.correlation_id)


@router.post(
    "/v1/inference/qml/multiclass", response_model=InferenceResponse, tags=["inference"]
)
def qml_multiclass(request: FeatureVectorRequest, service: Service) -> InferenceResponse:
    return service.predict_qml_multiclass(request.features, request.correlation_id)


@router.post("/v1/inference/all", response_model=CombinedInferenceResponse, tags=["inference"])
def all_models(request: FeatureVectorRequest, service: Service) -> CombinedInferenceResponse:
    results = [
        service.predict_classical_binary(request.features, request.correlation_id),
        service.predict_classical_multiclass(request.features, request.correlation_id),
        service.predict_qml_binary(request.features, request.correlation_id),
        service.predict_qml_multiclass(request.features, request.correlation_id),
    ]
    return CombinedInferenceResponse(correlation_id=request.correlation_id, results=results)
