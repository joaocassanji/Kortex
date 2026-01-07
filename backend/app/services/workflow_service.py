from typing import Dict, Any, List
import uuid
import asyncio
import logging
from app.domain.models import Cluster, KubernetesResource, RemediationStep, AnalysisResult
from app.ports.interfaces import ClusterProviderPort, SimulationEnginePort, LLMProviderPort
from app.adapters.k8s_adapter import KubernetesAdapter

# Simple in-memory store for workflows
# { "workflow_id": { "status": "...", "logs": [], "current_step": "...", "vcluster_id": "...", "target_cluster_id": "..." } }
workflow_store = {}

logger = logging.getLogger(__name__)

class FixWorkflowService:
    def __init__(self, 
                 sim_adapter: SimulationEnginePort, 
                 llm_adapter: LLMProviderPort,
                 cluster_registry: Dict[str, ClusterProviderPort],
                 on_workflow_complete: Any = None):
        self.sim_adapter = sim_adapter
        self.llm_adapter = llm_adapter
        self.cluster_registry = cluster_registry # Active connections
        self.on_workflow_complete = on_workflow_complete

    async def start_fix_workflow(self, cluster_id: str, resource_id: str, issue_description: str) -> str:
        workflow_id = str(uuid.uuid4())
        workflow_store[workflow_id] = {
            "id": workflow_id,
            "cluster_id": cluster_id,
            "resource_id": resource_id,
            "issue": issue_description,
            "status": "initializing",
            "logs": ["Workflow initialized. Starting Process..."],
            "steps": []
        }
        
        # Start async process
        asyncio.create_task(self._run_workflow(workflow_id))
        
        return workflow_id

    async def _run_workflow(self, workflow_id: str):
        state = workflow_store[workflow_id]
        
        def log(msg):
            print(f"[Workflow {workflow_id}] {msg}")
            state["logs"].append(msg)
            
        try:
            target_adapter = self.cluster_registry.get(state["cluster_id"])
            
            # Debug: Check registry keys if missing
            if not target_adapter:
                print(f"DEBUG: Available Clusters: {list(self.cluster_registry.keys())}")
                print(f"DEBUG: Requested Cluster: {state['cluster_id']}")
                raise ValueError(f"Target cluster {state['cluster_id']} disconnected or not found in registry")
            
            # Step 1: Create VCluster
            state["status"] = "step_1_create_vcluster"
            log("Step 1: Creating VCluster environment inside target cluster...")
            
            # Reconstruct Cluster object with proper path
            # We must ensure the adapter has a valid kubeconfig_path for vcluster to mount
            if not target_adapter.kubeconfig_path:
                 # If we are using in-memory content, we might need to dump it to a temp file first for vcluster to see it
                 # For now, we assume local file path exists if we connected via file
                 # If connected via content paste, we need to handle that. 
                 # Let's assume for this MVP we connected via file or the adapter has a path.
                 pass

            source_cluster = Cluster(
                id=state["cluster_id"], 
                name=state["cluster_id"], 
                kubeconfig_path=target_adapter.kubeconfig_path, 
                is_active=True
            )
            
            shadow_cluster = await self.sim_adapter.create_shadow_env(source_cluster)
            state["vcluster_id"] = shadow_cluster.id
            log(f"VCluster {shadow_cluster.id} created successfully with isolation.")
            
            # Connect to VCluster
            vcluster_adapter = KubernetesAdapter(kubeconfig_path=shadow_cluster.kubeconfig_path)
            # Connectivity check might take a moment if pods are spinning up
            for i in range(10):
                if vcluster_adapter.check_connection():
                    break
                log("Waiting for vcluster connectivity...")
                await asyncio.sleep(2)
            
            if not vcluster_adapter.check_connection():
                 raise RuntimeError("Could not connect to VCluster after creation")
            
            log("VCluster Connected.")

            # Step 2: Analyze & Generate Fix
            state["status"] = "step_2_analysis"
            log("Step 2: Analyzing resource and generating AI fix...")
            
            resources = target_adapter.list_resources()
            target_res = next((r for r in resources if r.unique_id == state["resource_id"]), None)
            
            if not target_res:
                raise ValueError(f"Resource {state['resource_id']} not found in target cluster")
                
            remediation = await self.llm_adapter.generate_remediation({
                "resource": target_res.dict(),
                "issue": state["issue"]
            })
            
            log(f"AI Generated Remediation: {remediation.description}")
            state["remediation"] = remediation.dict()
            
            # Step 3: Apply to VCluster
            state["status"] = "step_3_apply_vcluster"
            log("Step 3: Applying fix to VCluster for validation...")
            
            # NOTE: If we want to test the fix relative to the ORIGINAL state, we should ideally
            # replicate the original resource in VCluster first.
            # Assuming VCluster is empty, applying the 'Fixed Manifest' will created it in the 'Fixed' state.
            # This verifies the manifest is valid and runnable, but not necessarily a "Fix" from "Broken".
            # However, for this flow, validating that the new manifest works is the key Test.
            
            success = vcluster_adapter.apply_manifest(remediation.manifest, target_res.namespace)
            if not success:
                raise RuntimeError("Failed to apply fix to VCluster")
            
            log("Fix applied to VCluster. Running validation scan...")
            
            # Step 4: Validate in VCluster
            state["status"] = "step_4_validate_vcluster"
            await asyncio.sleep(5) # Let it settle
            
            v_resources = vcluster_adapter.list_resources()
            # We assume the resource ID/Name is preserved in the manifest
            v_res = next((r for r in v_resources if r.kind == target_res.kind and r.name == target_res.name), None)
            
            if not v_res:
                 log("Warning: Resource not found in VCluster after apply. Check Namespace?")
            
            v_analysis = await self.llm_adapter.analyze_context(v_resources, "Check if the specific issue is resolved and ensure no new vulnerabilities are introduced.")
            
            log(f"VCluster Safety Analysis: {v_analysis.summary}")
            
            # Basic Gate
            if "high" in v_analysis.summary.lower() or "critical" in v_analysis.summary.lower():
                 log("VCluster validation flagged potential issues. Aborting real deployment.")
                 raise RuntimeError("VCluster validation failed due to high severity risks detected.")
                 
            log("VCluster validation PASSED. Proceeding to Real Cluster...")
            
            # Step 5: Apply to Real Cluster
            state["status"] = "step_5_apply_real"
            log("Step 5: Applying fix to Production/Real Cluster...")
            
            real_success = target_adapter.apply_manifest(remediation.manifest, target_res.namespace)
            if not real_success:
                raise RuntimeError("Failed to apply to Real Cluster")
                
            log("Fix applied to Real Cluster. Final Validation...")
            
            # Step 6: Final Validation
            state["status"] = "step_6_final_validate"
            await asyncio.sleep(5)
            
            final_resources = target_adapter.list_resources()
            final_res = next((r for r in final_resources if r.unique_id == state["resource_id"]), None)
            
            final_analysis = await self.llm_adapter.analyze_resource(final_res, final_resources)
            state["final_analysis"] = final_analysis.dict()
            
            log("Detailed post-fix analysis complete.")
            log("Process Finished Successfully.")
            state["status"] = "completed"
            if self.on_workflow_complete:
                self.on_workflow_complete(workflow_id, state)
            
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            log(f"CRITICAL ERROR: {repr(e)}\nTraceback:\n{tb}")
            state["status"] = "failed"
            logging.exception("Workflow Failed")
        finally:
            if "vcluster_id" in state and state["vcluster_id"]:
                log(f"Automatic Cleanup: Destroying VCluster {state['vcluster_id']}...")
                try:
                    # Clear reference so it doesn't try twice if workflow complete callback triggers again
                    vid = state["vcluster_id"]
                    state["vcluster_id"] = None
                    await self.sim_adapter.destroy_shadow_env(vid)
                    log("VCluster destroyed successfully.")
                except Exception as cleanup_err:
                    log(f"Warning during cleanup: {cleanup_err}")

            if self.on_workflow_complete:
                self.on_workflow_complete(workflow_id, state)

    def get_workflow_status(self, workflow_id: str):
        return workflow_store.get(workflow_id)
