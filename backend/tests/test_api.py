from unittest.mock import patch
import app.main

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "kortex": "running"}

def test_list_resources(client):
    # 'test-cluster' is pre-seeded in client fixture
    response = client.get("/clusters/test-cluster/resources")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "web"

def test_analyze_cluster(client):
    response = client.post("/clusters/test-cluster/analyze")
    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "Test Analysis"
    assert len(data["issues"]) == 1
    assert data["issues"][0]["severity"] == "HIGH"
