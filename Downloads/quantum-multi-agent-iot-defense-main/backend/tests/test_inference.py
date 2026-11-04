import math

import pytest


@pytest.mark.parametrize(
    "method_name,kind,class_count,threshold",
    [
        ("predict_classical_binary", "classical_binary", 2, 0.012),
        ("predict_classical_multiclass", "classical_multiclass", 8, None),
        ("predict_qml_binary", "qml_binary", 2, 0.390),
        ("predict_qml_multiclass", "qml_multiclass", 8, None),
    ],
)
def test_frozen_model_inference(
    service, sample_features, method_name, kind, class_count, threshold
):
    from uuid import uuid4

    response = getattr(service, method_name)(sample_features, uuid4())
    assert response.model_kind == kind
    assert response.predicted_class_id in range(class_count)
    assert len(response.probabilities) == class_count
    assert sum(item.probability for item in response.probabilities) == pytest.approx(1.0, abs=1e-5)
    assert response.threshold == threshold
    assert math.isfinite(response.confidence)


def test_inference_is_deterministic(service, sample_features):
    from uuid import uuid4

    first = service.predict_qml_binary(sample_features, uuid4())
    second = service.predict_qml_binary(sample_features, uuid4())
    assert first.predicted_class_id == second.predicted_class_id
    assert first.confidence == pytest.approx(second.confidence, abs=1e-7)
