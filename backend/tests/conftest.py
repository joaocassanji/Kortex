import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient
from app.main import app, state
from app.domain.models import KubernetesResource, AnalysisResult, Issue, Severity, IssueCategory

@pytest.fixture
def mock_k8s_adapter():
    adapter = MagicMock()
    adapter.check_connection.return_value = True
    adapter.list_resources.return_value = [
        KubernetesResource(kind="Deployment", name="web", namespace="default", api_version="apps/v1", content={"metadata": {"name": "web"}})
    ]
    return adapter

@pytest.fixture
def mock_llm_adapter():
    adapter = AsyncMock()
    adapter.analyze_context.return_value = AnalysisResult(
        summary="Test Analysis",
        issues=[
            Issue(
                severity=Severity.HIGH,
                category=IssueCategory.SECURITY,
                title="Test Issue",
                description="This is a test issue."
            )
        ]
    )
    return adapter

@pytest.fixture
def client(mock_k8s_adapter, mock_llm_adapter):
    # Override global state for testing
    state.active_connections["test-cluster"] = mock_k8s_adapter
    state.llm_adapter = mock_llm_adapter
    return TestClient(app)
