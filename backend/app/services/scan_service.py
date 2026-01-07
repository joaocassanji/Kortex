import logging
import uuid
import asyncio
from typing import Dict, List, Any
from app.ports.interfaces import ClusterProviderPort, LLMProviderPort
from app.domain.models import AnalysisResult, Issue, Severity, IssueCategory

logger = logging.getLogger(__name__)

import json
import os
import datetime

# In-memory store for scan states
# { "scan_id": { "id": str, "cluster_id": str, "status": str, "progress": int, "logs": [], "results": AnalysisResult, "current_step": str } }
scan_store = {}
SCANS_FILE = "data/scans.json"
SNAPSHOTS_FILE = "data/snapshots.json"

class ScanService:
    def __init__(self, cluster_registry: Dict[str, ClusterProviderPort], llm_adapter: LLMProviderPort):
        self.cluster_registry = cluster_registry
        self.llm_adapter = llm_adapter
        self.resource_snapshots = self._load_json(SNAPSHOTS_FILE, {})
        self.settings = {} # Injected by main
        self._load_scans()

    def _load_json(self, path, default):
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except:
                return default
        return default

    def _save_json(self, path, data):
        try:
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save {path}: {e}")

    def _load_scans(self):
        global scan_store
        scan_store = self._load_json(SCANS_FILE, {})
        # Reset any stuck 'analyzing' or 'initializing' scans on restart
        for sId, data in scan_store.items():
            if data["status"] in ["analyzing", "initializing", "fetching_resources"]:
                data["status"] = "failed"
                data["logs"].append({
                    "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
                    "message": "Scan interrupted by system restart."
                })

    def _save_scans(self):
        # Exclude 'task' key which is not serializable
        clean_store = {}
        for sId, data in scan_store.items():
            clean_store[sId] = {k: v for k, v in data.items() if k != "task"}
        self._save_json(SCANS_FILE, clean_store)
        self._save_json(SNAPSHOTS_FILE, self.resource_snapshots)

    async def start_global_scan(self, cluster_id: str, scan_type: str = "full", filters: List[str] = None) -> str:
        scan_id = str(uuid.uuid4())
        logger.info(f"Initiating scan {scan_id} for cluster {cluster_id}")
        scan_store[scan_id] = {
            "id": scan_id,
            "cluster_id": cluster_id,
            "status": "initializing",
            "type": scan_type,
            "filters": filters,
            "progress": 0,
            "logs": [{
                "timestamp": __import__("datetime").datetime.now().strftime("%H:%M:%S"),
                "message": f"Initializing {scan_type} cluster scan..."
            }],
            "results": {"issues": [], "summary": "", "timestamp": None},
            "total_resources": 0,
            "analyzed_resources": 0,
            "resource_status": {}, # { unique_id: "pending" | "analyzed" | "error" }
            "resources_list": [],  # Lightweight list of resources for frontend graph [ {kind, name, namespace, unique_id} ]
            "task": None  # Store task
        }
        
        task = asyncio.create_task(self._run_scan(scan_id))
        scan_store[scan_id]["task"] = task
        self._save_scans()
        return scan_id

    async def stop_scan(self, scan_id: str):
        if scan_id in scan_store:
            task = scan_store[scan_id].get("task")
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            # If status wasn't updated by CancelledError catch yet (race condition sort of)
            if scan_store[scan_id]["status"] != "stopped":
                scan_store[scan_id]["status"] = "stopped"
                self._log_message(scan_id, "Scan stopped by user.")
            self._save_scans()

    def get_scan_status(self, scan_id: str) -> Dict[str, Any]:
        data = scan_store.get(scan_id)
        if data:
            return {k: v for k, v in data.items() if k != "task"}
        return None

    def list_scans(self) -> List[Dict[str, Any]]:
        """Returns a list of all scans in the store."""
        scans = []
        for sId, data in scan_store.items():
            scans.append({
                "id": sId,
                "cluster_id": data.get("cluster_id"),
                "status": data.get("status"),
                "progress": data.get("progress"),
                "timestamp": data.get("results", {}).get("timestamp") or data.get("logs", [{}])[0].get("timestamp"),
                "total_issues": len(data.get("results", {}).get("issues", [])),
                "type": data.get("type", "full")
            })
        # Sort by timestamp (newest first)
        return sorted(scans, key=lambda x: str(x["timestamp"]), reverse=True)

    def clear_cache(self):
        """Clears all in-memory scan history and resource snapshots."""
        global scan_store
        scan_store.clear()
        self.resource_snapshots.clear()
        logger.info("Scan cache and resource snapshots cleared.")

    def _log_message(self, scan_id, msg):
        logger.info(f"SCAN {scan_id}: {msg}")
        if scan_id not in scan_store: return
        import datetime
        entry = {
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
            "message": msg
        }
        scan_store[scan_id]["logs"].append(entry)
        if len(scan_store[scan_id]["logs"]) > 1000:
            scan_store[scan_id]["logs"] = scan_store[scan_id]["logs"][-1000:]

    async def _run_scan(self, scan_id: str):
        logger.info(f"Running scan task for {scan_id}")
        state = scan_store[scan_id]
        scan_type = state.get("type", "full")
        filters = state.get("filters") or []
        cluster_id = state["cluster_id"]
        
        def log(msg):
            self._log_message(scan_id, msg)

        try:
            adapter = self.cluster_registry.get(cluster_id)
            if not adapter:
                raise ValueError(f"Cluster {cluster_id} not found or disconnected")

            await asyncio.sleep(0.1) # Force yield to ensure status propogates if task started synchronously
            state["status"] = "fetching_resources"
            log("Fetching all cluster resources...")
            
            try:
                # Run blocking I/O in thread to avoid freezing loop, with timeout
                all_resources = await asyncio.wait_for(
                    asyncio.to_thread(adapter.list_resources), 
                    timeout=60.0 # 60s timeout for large clusters
                )
                log(f"Fetched {len(all_resources)} total resources.")
            except asyncio.TimeoutError:
                raise Exception("Timed out fetching resources from Kubernetes API")
            
            # Filter Logic
            resources_to_scan = []
            previous_snapshot = self.resource_snapshots.get(cluster_id, {})
            current_snapshot = {}
            ignored_namespaces = self.settings.get("ignored_namespaces", [])
            
            skipped_count = 0
            
            for r in all_resources:
                rv = r.content.get("metadata", {}).get("resourceVersion", "0")
                current_snapshot[r.unique_id] = rv
                
                # 1. Apply Kind Filters (If provided, filter both Map and Scan)
                if filters and r.kind not in filters:
                    continue

                # 2. Add to map data
                state["resources_list"].append({
                    "kind": r.kind,
                    "name": r.name,
                    "namespace": r.namespace,
                    "unique_id": r.unique_id,
                    "content": r.content
                })

                # 3. Handle Ignored Namespaces (Map only, no analysis)
                if r.namespace in ignored_namespaces:
                    state["resource_status"][r.unique_id] = "ignored"
                    continue

                # 4. Smart Scan logic (Skip if unchanged)
                if scan_type == "smart":
                    if previous_snapshot.get(r.unique_id) == rv:
                        skipped_count += 1
                        state["resource_status"][r.unique_id] = "analyzed" # Already analyzed
                        continue
                
                # 5. Queue for AI analysis
                state["resource_status"][r.unique_id] = "pending"
                resources_to_scan.append(r)
            
            if scan_type == "smart":
                log(f"Smart Scan: {len(resources_to_scan)}/ {len(all_resources)} resources selected ({skipped_count} skipped).")
            else:
                log(f"Full Scan: {len(resources_to_scan)} resources queued.")

            state["total_resources"] = len(resources_to_scan)

            if not resources_to_scan:
                log("No resources to analyze.")
                state["status"] = "completed"
                state["progress"] = 100
                state["results"]["summary"] = "No changes detected or no resources found matching filters."
                state["results"]["timestamp"] = __import__("datetime").datetime.now().isoformat()
                self.resource_snapshots[cluster_id] = current_snapshot
                return

            state["pending_snapshot"] = current_snapshot # Temporarily store to save on success

            issues_found = []
            
            resources_by_ns = {}
            for r in resources_to_scan:
                if r.namespace not in resources_by_ns:
                    resources_by_ns[r.namespace] = []
                resources_by_ns[r.namespace].append(r)
            
            namespaces = list(resources_by_ns.keys())
            total_ns = len(namespaces)
            
            state["status"] = "analyzing"
            
            processed_count = 0
            
            for i, ns in enumerate(namespaces):
                ns_resources = resources_by_ns[ns]
                
                # Detailed resource logging
                resource_counts = {}
                for r in ns_resources:
                    resource_counts[r.kind] = resource_counts.get(r.kind, 0) + 1
                    # Verbose log for user visibility
                    log(f"Analyzing {r.kind}/{r.name}...")
                
                summary_str = ", ".join([f"{k}: {v}" for k, v in resource_counts.items()])
                log(f"Namespace '{ns}' Summary: {summary_str}")
                log(f"Sending batch to AI for deep inspection of all resources including Deployments, ConfigMaps, Secrets, Services, etc...")
                
                try:
                    import time
                    t0 = time.time()
                    
                    partial_result = await self.llm_adapter.analyze_context(
                        ns_resources, 
                        f"Analyze every single provided resource in namespace '{ns}'. Thoroughly inspect Deployments, ConfigMaps, Secrets, Services, and anything else. Detect security risks, misconfigurations, and specific issues for each resource."
                    )
                    
                    duration = time.time() - t0
                    log(f"AI Analysis completed for {ns} in {duration:.1f}s")
                    
                    if partial_result and partial_result.issues:
                        log(f"AI detected {len(partial_result.issues)} issues in {ns}:")
                        for issue in partial_result.issues:
                            # Enrich issue with resource ID if missing
                            if not issue.affected_resource_ids:
                                pass
                            issues_found.extend(partial_result.issues)
                            log(f"  - [{issue.severity}] {issue.title}")
                    else:
                        log(f"No issues detected in {ns}.")
                    
                except Exception as e:
                    log(f"Error analyzing namespace {ns}: {str(e)}")
                    for r in ns_resources:
                         state["resource_status"][r.unique_id] = "error"
                
                # Mark as done
                for r in ns_resources:
                    if state["resource_status"][r.unique_id] != "error":
                         state["resource_status"][r.unique_id] = "analyzed"

                processed_count += len(ns_resources)
                state["analyzed_resources"] = processed_count
                state["progress"] = int((processed_count / state["total_resources"]) * 100)
                await asyncio.sleep(0.1) # Yield
            
            # Finalize
            state["results"]["issues"] = [i.dict() for i in issues_found]
            state["results"]["summary"] = f"Scan complete. Found {len(issues_found)} issues across {state['total_resources']} resources."
            
            log("Analysis passed. Generating final summary...")
            
            # Commit snapshot
            if "pending_snapshot" in state:
                self.resource_snapshots[cluster_id] = state["pending_snapshot"]
                
            state["status"] = "completed"
            state["progress"] = 100
            log("Scan completed successfully.")
            self._save_scans()
            
        except asyncio.CancelledError:
            state["status"] = "stopped"
            log("Scan stopped by user.")
            self._save_scans()
            
        except Exception as e:
            import traceback
            state["status"] = "failed"
            log(f"Scan failed: {str(e)}")
            self._save_scans()
            log(traceback.format_exc())
