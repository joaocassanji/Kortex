from app.domain.models import KubernetesResource, Severity

def test_k8s_resource_unique_id():
    res = KubernetesResource(
        kind="Pod",
        name="nginx",
        namespace="default",
        api_version="v1",
        content={}
    )
    assert res.unique_id == "Pod/default/nginx"

def test_severity_enum():
    assert Severity.HIGH == "HIGH"
