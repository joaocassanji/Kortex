from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import os
import yaml
import shutil
import zipfile
import io
from fastapi.responses import StreamingResponse
from fastapi import UploadFile, File

# Domain
# Domain
from app.domain.models import Cluster, AnalysisResult, KubernetesResource
from app.ports.interfaces import ClusterProviderPort, LLMProviderPort

# Adapters
from app.adapters.k8s_adapter import KubernetesAdapter
from app.adapters.llm_adapter import LangChainAdapter
from app.adapters.simulation_adapter import VClusterAdapter
from app.services.workflow_service import FixWorkflowService
from app.services.scan_service import ScanService

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
    scan_service: ScanService = None
    history: List[dict] = []
    
state = AppState()
HISTORY_FILE = "data/history.json"

def _load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except: return []
    return []

def _save_history():
    try:
        if not os.path.exists("data"): os.mkdir("data")
        with open(HISTORY_FILE, "w") as f:
            json.dump(state.history, f, indent=2)
    except: pass

state.history = _load_history()

def add_history(cluster_id: str, action: str, details: str, logs: List[str] = None, workflow_id: str = None):
    import datetime
    entry = {
        "id": os.urandom(4).hex(),
        "timestamp": datetime.datetime.now().isoformat(),
        "cluster_id": cluster_id,
        "action": action,
        "details": details,
        "logs": logs or [],
        "workflow_id": workflow_id
    }
    state.history.insert(0, entry) # Prepend
    if len(state.history) > 100:
        state.history.pop()
    _save_history()
    return entry["id"]

def on_workflow_complete(workflow_id: str, workflow_state: Dict[str, Any]):
    # Sync logs from workflow to history
    for h in state.history:
        if h.get("workflow_id") == workflow_id:
            h["logs"] = workflow_state.get("logs", [])
            h["action"] = "FIX_COMPLETED" if workflow_state.get("status") == "completed" else "FIX_FAILED"
            _save_history()
            break

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
        return {
            "ai_provider": "ollama", 
            "model_name": "llama3", 
            "openai_api_key": "",
            "ignored_namespaces": ["kube-system", "kube-public", "monitoring"] # Safe defaults
        }
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
    cluster_registry=state.active_connections,
    on_workflow_complete=on_workflow_complete
)

state.scan_service = ScanService(
    cluster_registry=state.active_connections,
    llm_adapter=state.llm_adapter
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
    ignored_namespaces: List[str] = []

class ResourceAnalysisRequest(BaseModel):
    resource_id: str

class StartFixRequest(BaseModel):
    resource_id: str
    issue_description: str

@app.get("/clusters")
def get_clusters():
    """List all saved clusters."""
    return _load_saved_clusters()

@app.delete("/clusters/{cluster_id}")
def delete_cluster(cluster_id: str):
    """Remove a saved cluster."""
    clusters = _load_saved_clusters()
    new_clusters = [c for c in clusters if c["id"] != cluster_id]
    
    if len(new_clusters) == len(clusters):
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    with open(CLUSTERS_FILE, "w") as f:
        json.dump(new_clusters, f, indent=2)
        
    return {"status": "deleted", "id": cluster_id}

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
    
    add_history(cluster_id, "FIX_STARTED", f"Started remediation for {req.resource_id}", logs=[], workflow_id=wf_id)
    
    return {"workflow_id": wf_id}

@app.post("/clusters/{cluster_id}/history")
def add_custom_history(cluster_id: str, req: Dict[str, Any]):
    # Allow frontend to push history (e.g. batch fix completion)
    h_id = add_history(
        cluster_id, 
        req.get("action", "ACTIVITY"), 
        req.get("details", ""), 
        logs=req.get("logs", [])
    )
    return {"id": h_id}

@app.get("/clusters/{cluster_id}/managed-resources")
def get_managed_resources(cluster_id: str):
    adapter = state.active_connections.get(cluster_id)
    if not adapter:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    managed = adapter.get_managed_resources()
    return {
        "count": len(managed),
        "resources": [r.unique_id for r in managed]
    }

@app.post("/clusters/{cluster_id}/cleanup")
async def cleanup_managed_resources(cluster_id: str):
    adapter = state.active_connections.get(cluster_id)
    if not adapter:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    managed = adapter.get_managed_resources()
    count = 0
    for r in managed:
        if adapter.delete_resource(r.kind, r.name, r.namespace):
            count += 1
            
    add_history(cluster_id, "CLEANUP", f"Cleaned up {count} resources created by Kortex.")
    return {"status": "ok", "cleaned_count": count}

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

class StartScanRequest(BaseModel):
    scan_type: str = "full" # full, smart
    filters: Optional[List[str]] = None

@app.post("/clusters/{cluster_id}/scan/start")
async def start_cluster_scan(cluster_id: str, req: StartScanRequest = StartScanRequest()):
    # Auto-connect if not active but valid
    if not state.active_connections.get(cluster_id):
        # Try to reactivate from saved
        clusters = _load_saved_clusters()
        cluster = next((c for c in clusters if c["id"] == cluster_id), None)
        if cluster:
            print(f"Auto-connecting cluster {cluster_id} for scan...")
            try:
                adapter = KubernetesAdapter(
                    kubeconfig_path=cluster.get("kubeconfig_path"),
                    kubeconfig_content=cluster.get("kubeconfig_content")
                )
                if adapter.check_connection():
                    state.active_connections[cluster_id] = adapter
                else:
                    raise Exception("Check failed")
            except Exception as e:
                print(f"Auto-connect failed: {e}")
                raise HTTPException(status_code=404, detail="Cluster not connected and could not auto-connect")
        else:
             raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Ensure scan service has latest LLM if settings changed
    state.scan_service.llm_adapter = state.llm_adapter
    state.scan_service.settings = state.settings
    
    scan_id = await state.scan_service.start_global_scan(cluster_id, req.scan_type, req.filters)
    return {"scan_id": scan_id, "status": "initializing"}

@app.get("/scan/{scan_id}")
def get_scan_status(scan_id: str):
    status = state.scan_service.get_scan_status(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan session not found")
    return status

@app.get("/scans")
def list_scans():
    return state.scan_service.list_scans()

@app.post("/scan/{scan_id}/stop")
async def stop_scan(scan_id: str):
    await state.scan_service.stop_scan(scan_id)
    return {"status": "stopping"}

@app.post("/scan/cache/clear")
def clear_scan_cache():
    state.scan_service.clear_cache()
    return {"status": "ok", "message": "Scan cache cleared"}

@app.get("/archive/export")
async def export_archive():
    """Export all application data (scans, history, settings) as a zip file."""
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add data directory
        if os.path.exists("data"):
            for root, dirs, files in os.walk("data"):
                for file in files:
                    file_path = os.path.join(root, file)
                    zipf.write(file_path, file_path)
        
        # Add settings
        if os.path.exists(SETTINGS_FILE):
            zipf.write(SETTINGS_FILE, SETTINGS_FILE)
            
    memory_file.seek(0)
    return StreamingResponse(
        memory_file,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=kortex-archive.zip"}
    )

@app.post("/archive/import")
async def import_archive(file: UploadFile = File(...)):
    """Import application data from a zip file, overwriting existing but preserving clusters."""
    try:
        contents = await file.read()
        memory_file = io.BytesIO(contents)
        
        with zipfile.ZipFile(memory_file, 'r') as zipf:
            # Validate contents? For now just extract
            # We only extract what's allowed
            allowed_files = [SETTINGS_FILE]
            for f in zipf.namelist():
                if f.startswith("data/") or f == SETTINGS_FILE:
                    zipf.extract(f, ".")
        
        # Reload state
        global state
        state.history = _load_history()
        state.settings = _load_settings()
        
        # Re-sync scan service and others if needed
        # (Simplified: reload trigger)
        
        return {"status": "ok", "message": "Archive imported successfully. Please refresh the page."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

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
