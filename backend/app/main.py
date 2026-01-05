from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import os
import yaml

# Domain
# Domain
from app.domain.models import Cluster, AnalysisResult, KubernetesResource
from app.ports.interfaces import ClusterProviderPort, LLMProviderPort

# Adapters
from app.adapters.k8s_adapter import KubernetesAdapter
from app.adapters.llm_adapter import LangChainAdapter
from app.adapters.simulation_adapter import VClusterAdapter
from app.services.workflow_service import FixWorkflowService

app = FastAPI(title="Kortex API", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # TODO: restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency Injection / State
# In a real app we'd use a dependency injector framework or `Depends` with a singleton
class AppState:
    k8s_adapter: ClusterProviderPort = KubernetesAdapter() # Default generic
    llm_adapter: LLMProviderPort = None # Initialized after loading settings
    sim_adapter = VClusterAdapter()
    active_connections: dict[str, ClusterProviderPort] = {}
    settings: dict = {}
    workflow_service: FixWorkflowService = None
    history: List[dict] = [] # In-memory history for now

state = AppState()

def add_history(cluster_id: str, action: str, details: str):
    import datetime
    entry = {
        "id": os.urandom(4).hex(),
        "timestamp": datetime.datetime.now().isoformat(),
        "cluster_id": cluster_id,
        "action": action,
        "details": details
    }
    state.history.insert(0, entry) # Prepend
    # Keep last 50
    if len(state.history) > 50:
        state.history.pop()

# Routes
@app.get("/health")
def health_check():
    return {"status": "ok", "kortex": "running"}

# Persistence
CLUSTERS_FILE = "saved_clusters.json"

def _load_saved_clusters() -> List[dict]:
    if not os.path.exists(CLUSTERS_FILE):
        return []
    with open(CLUSTERS_FILE, "r") as f:
        return json.load(f)

def _save_cluster_entry(entry: dict):
    clusters = _load_saved_clusters()
    # Check duplicates
    if any(c["id"] == entry["id"] for c in clusters):
        return # Already exists
    clusters.append(entry)
    with open(CLUSTERS_FILE, "w") as f:
        json.dump(clusters, f, indent=2)

# Settings Persistence
SETTINGS_FILE = "settings.json"

def _load_settings() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return {"ai_provider": "ollama", "model_name": "llama3", "openai_api_key": ""}
    with open(SETTINGS_FILE, "r") as f:
        return json.load(f)

def _save_settings(settings: dict):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)

# Initialize Settings & LLM
state.settings = _load_settings()
if state.settings.get("ai_provider") == "openai" and state.settings.get("openai_api_key"):
    os.environ["OPENAI_API_KEY"] = state.settings["openai_api_key"]

state.llm_adapter = LangChainAdapter(
    provider=state.settings.get("ai_provider", "ollama"),
    model_name=state.settings.get("model_name", "llama3")
)

# Init Workflow Service
state.workflow_service = FixWorkflowService(
    sim_adapter=state.sim_adapter,
    llm_adapter=state.llm_adapter,
    cluster_registry=state.active_connections
)

class TestConnectionRequest(BaseModel):
    kubeconfig_path: Optional[str] = None
    kubeconfig_content: Optional[dict] = None # For remote/pasted

class SaveClusterRequest(TestConnectionRequest):
    name: str

class SettingsRequest(BaseModel):
    ai_provider: str
    model_name: str
    openai_api_key: Optional[str] = None
    dependency_level: int = 1

class ResourceAnalysisRequest(BaseModel):
    resource_id: str

class StartFixRequest(BaseModel):
    resource_id: str
    issue_description: str

@app.get("/clusters")
def get_clusters():
    """List all saved clusters."""
    return _load_saved_clusters()

@app.post("/clusters/test")
def test_connection(req: TestConnectionRequest):
    """Test connectivity without saving."""
    try:
        adapter = KubernetesAdapter(
            kubeconfig_path=req.kubeconfig_path, 
            kubeconfig_content=req.kubeconfig_content
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config: {str(e)}")

    if adapter.check_connection():
        return {"status": "ok", "message": "Connection successful"}
    
    raise HTTPException(status_code=400, detail="Could not connect to cluster API")

@app.post("/clusters/save")
def save_cluster(req: SaveClusterRequest):
    """Test and then save the cluster configuration."""
    # 1. Test first
    try:
        adapter = KubernetesAdapter(
            kubeconfig_path=req.kubeconfig_path, 
            kubeconfig_content=req.kubeconfig_content
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config: {str(e)}")

    if not adapter.check_connection():
            raise HTTPException(status_code=400, detail="Connection test failed")

    # 2. Save
    cluster_id = req.name.lower().replace(" ", "-")
    entry = {
        "id": cluster_id,
        "name": req.name,
        "type": "local" if req.kubeconfig_path else "remote",
        "kubeconfig_path": req.kubeconfig_path,
        "kubeconfig_content": req.kubeconfig_content # In real app, encrypt this!
    }
    _save_cluster_entry(entry)
    return {"id": cluster_id, "status": "saved"}

@app.post("/clusters/{cluster_id}/connect")
def connect_saved_cluster(cluster_id: str):
    """Activate a saved cluster session."""
    clusters = _load_saved_clusters()
    cluster = next((c for c in clusters if c["id"] == cluster_id), None)
    
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    adapter = KubernetesAdapter(
        kubeconfig_path=cluster.get("kubeconfig_path"),
        kubeconfig_content=cluster.get("kubeconfig_content")
    )
    
    if not adapter.check_connection():
        raise HTTPException(status_code=500, detail="Cluster is unreachable")
        
    state.active_connections[cluster_id] = adapter
    return {"id": cluster_id, "status": "connected", "name": cluster["name"]}

@app.get("/clusters/{cluster_id}/resources")
def list_resources(cluster_id: str):
    adapter = state.active_connections.get(cluster_id)
    if not adapter:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    resources = adapter.list_resources()
    # Serialize for frontend
    return resources

@app.post("/clusters/{cluster_id}/analyze")
async def analyze_cluster(cluster_id: str):
    adapter = state.active_connections.get(cluster_id)
    if not adapter:
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    resources = adapter.list_resources() # Get everything
    # Analyze logic
    result = await state.llm_adapter.analyze_context(resources, "Identify top 3 security risks.")
    return result

@app.post("/clusters/{cluster_id}/analyze-resource")
async def analyze_specific_resource(cluster_id: str, req: ResourceAnalysisRequest):
    adapter = state.active_connections.get(cluster_id)
    if not adapter:
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    resources = adapter.list_resources() 
    
    target = next((r for r in resources if r.unique_id == req.resource_id), None)
    
    if not target:
        raise HTTPException(status_code=404, detail=f"Resource {req.resource_id} not found in cluster")

    # Analyze
    result = await state.llm_adapter.analyze_resource(target, resources)
    
    add_history(cluster_id, "ANALYSIS", f"Analyzed {target.kind}/{target.name}. Found {len(result.issues)} issues.")
    
    return result

@app.post("/clusters/{cluster_id}/fix/start")
async def start_fix(cluster_id: str, req: StartFixRequest):
    if not state.llm_adapter:
        raise HTTPException(status_code=400, detail="LLM not configured")
        
    # Ensure workflow service has latest LLM
    state.workflow_service.llm_adapter = state.llm_adapter
    
    wf_id = await state.workflow_service.start_fix_workflow(cluster_id, req.resource_id, req.issue_description)
    
    add_history(cluster_id, "FIX_STARTED", f"Started remediation for {req.resource_id}")
    
    return {"workflow_id": wf_id}

@app.get("/fix/{workflow_id}")
def get_fix_status(workflow_id: str):
    status = state.workflow_service.get_workflow_status(workflow_id)
    if not status:
         raise HTTPException(status_code=404, detail="Workflow not found")
    return status

@app.get("/clusters/{cluster_id}/history")
def get_cluster_history(cluster_id: str):
    return [h for h in state.history if h["cluster_id"] == cluster_id]

@app.get("/settings")
def get_settings():
    return _load_settings()

@app.post("/settings")
def update_settings(req: SettingsRequest):
    settings = req.dict()
    _save_settings(settings)
    
    # Update State
    state.settings = settings
    if settings.get("ai_provider") == "openai" and settings.get("openai_api_key"):
        os.environ["OPENAI_API_KEY"] = settings["openai_api_key"]
        
    # Re-init Adapter
    try:
        state.llm_adapter = LangChainAdapter(
            provider=settings["ai_provider"],
            model_name=settings["model_name"]
        )
        state.workflow_service.llm_adapter = state.llm_adapter
    except Exception as e:
        print(f"Failed to re-init LLM adapter: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to initialize LLM provider: {str(e)}")
    
    return {"status": "updated"}

@app.post("/settings/test")
async def test_settings_connection(req: SettingsRequest):
    settings = req.dict()
    
    # Temporarily set env var for OpenAI if needed
    if settings.get("ai_provider") == "openai" and settings.get("openai_api_key"):
        os.environ["OPENAI_API_KEY"] = settings["openai_api_key"]
        
    try:
        adapter = LangChainAdapter(
            provider=settings["ai_provider"],
            model_name=settings["model_name"]
        )
        await adapter.test_connection()
        return {"status": "ok", "message": "Connection successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
