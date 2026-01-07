import asyncio
import subprocess
import os
import sys
from typing import Optional
from app.ports.interfaces import SimulationEnginePort
from app.domain.models import Cluster

class VClusterAdapter(SimulationEnginePort):
    def __init__(self, base_path: str = None):
        # Use a local temp dir or provided one
        if not base_path:
            self.base_path = os.path.join(os.getcwd(), "temp_vclusters")
        else:
            self.base_path = base_path
            
        os.makedirs(self.base_path, exist_ok=True)
        
        # Locate vcluster binary
        self.vcluster_bin = os.path.join(os.getcwd(), "vcluster.exe") 
        if not os.path.exists(self.vcluster_bin):
            # Fallback to system path
            self.vcluster_bin = "vcluster"

        # Keep track of background port-forward procedures
        self._bg_processes = {}

    async def create_shadow_env(self, source_cluster: Cluster) -> Cluster:
        # Create a unique name for the shadow cluster
        shadow_name = f"shadow-{source_cluster.id}-{os.urandom(4).hex()}"
        # Use a dedicated namespace for this simulation to avoid conflicts and ensure clean teardown
        shadow_namespace = shadow_name 
        
        shadow_kubeconfig = os.path.join(self.base_path, f"{shadow_name}.yaml")
        
        # Ensure strict isolation and use the source cluster as host
        # We need to set KUBECONFIG to the source cluster's config so vcluster creates it there
        env = os.environ.copy()
        if source_cluster.kubeconfig_path:
             env["KUBECONFIG"] = source_cluster.kubeconfig_path
             
        # Add current directory to PATH to find local tools (helm, vcluster)
        env["PATH"] = os.getcwd() + os.pathsep + env.get("PATH", "")

        # 1. Create vcluster (Blocking, but fast with --connect=false)
        cmd_create = [
            self.vcluster_bin, "create", shadow_name,
            "-n", shadow_namespace,
            "--isolate",
            "--connect=false" 
        ]
        
        # Ensure all args are strings
        cmd_create = [str(arg) for arg in cmd_create]
        
        print(f"Executing VCluster Create: {' '.join(cmd_create)}")
        
        def run_create():
            return subprocess.run(
                cmd_create,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                check=False,
                timeout=300 # 5 minute timeout
            )

        loop = asyncio.get_running_loop()
        res_create = await loop.run_in_executor(None, run_create)
        
        if res_create.returncode != 0:
            err_msg = res_create.stderr.decode()
            out_msg = res_create.stdout.decode()
            full_msg = f"Stderr: {err_msg} | Stdout: {out_msg}"
            print(f"VCluster creation failed: {full_msg}")
            raise RuntimeError(f"Failed to create shadow cluster: {full_msg}")
            
        
        print("VCluster created. Annotating namespace for management...")
        from app.adapters.k8s_adapter import KORTEX_ANNOTATION, KORTEX_VALUE
        
        # Annotate the namespace
        cmd_ann = [
            "kubectl", "annotate", "namespace", shadow_namespace,
            f"{KORTEX_ANNOTATION}={KORTEX_VALUE}",
            "--overwrite"
        ]
        def run_ann():
            return subprocess.run(cmd_ann, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        await loop.run_in_executor(None, run_ann)

        print("Namespace annotated. Starting background connect tunnel...")
        
        # 2. Start Kubeconfig Export & Tunnel (Background)
        # vcluster connect ... --kube-config ...
        # This process MUST stay alive to keep 127.0.0.1 port forwarding active.
        # Fixed flag: --update-current instead of --update-current-kubeconfig
        cmd_connect = [
            self.vcluster_bin, "connect", shadow_name,
            "-n", shadow_namespace,
            "--update-current=false",
            "--kube-config", shadow_kubeconfig
        ]
        
        cmd_connect = [str(arg) for arg in cmd_connect]
        
        # We use Popen directly here (non-blocking)
        # We assume 'connect' will write the file quickly then hold the connection.
        # We need to wait for the file to exist before returning.
        
        proc = subprocess.Popen(
            cmd_connect,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env
        )
        
        self._bg_processes[shadow_name] = proc
        
        # Wait for kubeconfig to appear (up to 30s)
        for i in range(30):
            if os.path.exists(shadow_kubeconfig) and os.path.getsize(shadow_kubeconfig) > 0:
                print("Kubeconfig generated. Tunnel active.")
                break
            await asyncio.sleep(1)
            # Check if process died
            if proc.poll() is not None:
                stdout, stderr = proc.communicate()
                raise RuntimeError(f"VCluster connect process died unexpectedly: {stderr.decode()}")
        
        if not os.path.exists(shadow_kubeconfig):
             proc.kill()
             raise RuntimeError("Timed out waiting for vcluster kubeconfig generation")

        return Cluster(
            id=shadow_name,
            name=shadow_name,
            kubeconfig_path=shadow_kubeconfig,
            is_active=True
        )

    async def destroy_shadow_env(self, cluster_id: str):
        # 1. Kill background tunnel if exists
        # NOTE: cluster_id here matches shadow_name from creation
        if cluster_id in self._bg_processes:
            print(f"Terminating tunnel for {cluster_id}")
            proc = self._bg_processes[cluster_id]
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except:
                proc.kill()
            del self._bg_processes[cluster_id]

        # 2. Delete the vcluster resource
        # Warning: This basic implementation assumes the default KUBECONFIG or context 
        # is still valid for deletion, or effectively leaks if context switched.
        # Ideally, we should pass the host cluster config here too.
        # For now, we attempt deletion.
        # Assuming namespace == cluster_id as per creation logic
        cmd = [self.vcluster_bin, "delete", cluster_id, "-n", cluster_id]
        
        def run_sync():
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            if res.returncode != 0:
                 print(f"Failed to delete vcluster: {res.stderr.decode()}")
            return res

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, run_sync)
