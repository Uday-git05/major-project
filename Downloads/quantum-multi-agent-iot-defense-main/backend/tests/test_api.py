from uuid import uuid4


def test_health_endpoint_does_not_require_model_loading(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_models_endpoint_reports_contract(client):
    response = client.get("/v1/models")
    assert response.status_code == 200
    body = response.json()
    assert body["feature_count"] == 27
    assert body["thresholds"] == {"classical_binary": 0.012, "qml_binary": 0.39}


def test_all_inference_endpoint_preserves_correlation_id(client, sample_features):
    correlation_id = str(uuid4())
    response = client.post(
        "/v1/inference/all",
        json={"features": sample_features, "correlation_id": correlation_id},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["correlation_id"] == correlation_id
    assert len(body["results"]) == 4
    assert {result["model_kind"] for result in body["results"]} == {
        "classical_binary",
        "classical_multiclass",
        "qml_binary",
        "qml_multiclass",
    }
    assert all(result["correlation_id"] == correlation_id for result in body["results"])


def test_api_rejects_incomplete_feature_vector(client, sample_features):
    sample_features.pop(next(iter(sample_features)))
    response = client.post("/v1/inference/classical/binary", json={"features": sample_features})
    assert response.status_code == 422
    assert "missing=" in response.json()["detail"]
