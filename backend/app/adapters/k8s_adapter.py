from typing import List, Optional, Dict, Any
from kubernetes import client, config
from kubernetes.client import ApiClient
from app.ports.interfaces import ClusterProviderPort
from app.domain.models import KubernetesResource, Cluster
import yaml
import os

class KubernetesAdapter(ClusterProviderPort):
    def __init__(self, kubeconfig_path: Optional[str] = None, kubeconfig_content: Optional[Dict[str, Any]] = None):
        self.kubeconfig_path = kubeconfig_path
        self.kubeconfig_content = kubeconfig_content
        self._load_config()
        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()
        self.batch_v1 = client.BatchV1Api()
        self.networking_v1 = client.NetworkingV1Api()
        self.rbac_v1 = client.RbacAuthorizationV1Api()
        self.storage_v1 = client.StorageV1Api()

    def _load_config(self):
        if self.kubeconfig_content:
            # Load from dict for remote/pasted configs
            config.load_kube_config_from_dict(self.kubeconfig_content)
        elif self.kubeconfig_path and os.path.exists(self.kubeconfig_path):
            config.load_kube_config(config_file=self.kubeconfig_path)
        else:
            # Fallback to in-cluster config or default ~/.kube/config
            try:
                config.load_incluster_config()
            except config.ConfigException:
                config.load_kube_config()

    def check_connection(self) -> bool:
        try:
            self.core_v1.list_node(limit=1, _request_timeout=3)
            return True
        except Exception as e:
            # Log error
            return False

    def list_resources(self, namespaces: List[str] = None) -> List[KubernetesResource]:
        resources = []
        
        # Helper to safely fetch and append
        def fetch_safe(fetch_func, kind):
            try:
                items = fetch_func().items
                for i in items:
                    resources.append(self._to_domain(i, kind))
            except Exception as e:
                print(f"Error fetching {kind}: {e}")

        # Nodes
        fetch_safe(self.core_v1.list_node, "Node")
        
        # Namespaces
        fetch_safe(self.core_v1.list_namespace, "Namespace")

        # --- Workloads ---
        fetch_safe(self.apps_v1.list_deployment_for_all_namespaces, "Deployment")
        fetch_safe(self.apps_v1.list_stateful_set_for_all_namespaces, "StatefulSet")
        fetch_safe(self.apps_v1.list_daemon_set_for_all_namespaces, "DaemonSet")
        fetch_safe(self.apps_v1.list_replica_set_for_all_namespaces, "ReplicaSet")
        fetch_safe(self.batch_v1.list_job_for_all_namespaces, "Job")
        fetch_safe(self.batch_v1.list_cron_job_for_all_namespaces, "CronJob")
        fetch_safe(self.core_v1.list_pod_for_all_namespaces, "Pod")

        # --- Network ---
        fetch_safe(self.core_v1.list_service_for_all_namespaces, "Service")
        fetch_safe(self.networking_v1.list_ingress_for_all_namespaces, "Ingress")

        # --- Config & Storage ---
        fetch_safe(self.core_v1.list_config_map_for_all_namespaces, "ConfigMap")
        fetch_safe(self.core_v1.list_secret_for_all_namespaces, "Secret")
        fetch_safe(self.core_v1.list_persistent_volume_claim_for_all_namespaces, "PersistentVolumeClaim")
        fetch_safe(self.core_v1.list_persistent_volume, "PersistentVolume")
        fetch_safe(self.storage_v1.list_storage_class, "StorageClass")

        # --- Access / RBAC ---
        fetch_safe(self.core_v1.list_service_account_for_all_namespaces, "ServiceAccount")
        fetch_safe(self.rbac_v1.list_role_for_all_namespaces, "Role")
        fetch_safe(self.rbac_v1.list_role_binding_for_all_namespaces, "RoleBinding")
        fetch_safe(self.rbac_v1.list_cluster_role, "ClusterRole")
        fetch_safe(self.rbac_v1.list_cluster_role_binding, "ClusterRoleBinding")

        return resources

    def get_resource(self, kind: str, name: str, namespace: str) -> Optional[KubernetesResource]:
        pass

    def apply_manifest(self, manifest: Dict[str, Any], namespace: str) -> bool:
        # Use kubectl apply for robustness
        import json
        import subprocess
        
        manifest_json = json.dumps(manifest)
        
        # Ensure we use the correct kubectl if bundled or relying on PATH
        kubectl_cmd = "kubectl"
        
        cmd = [kubectl_cmd, "apply", "-f", "-"]
        if namespace:
             # NOTE: valid manifests often include namespace. Overriding it might be okay.
            cmd.extend(["-n", namespace])
            
        # If we have a specific kubeconfig path, use it
        env = os.environ.copy()
        if self.kubeconfig_path:
            env["KUBECONFIG"] = self.kubeconfig_path
            
        try:
            process = subprocess.Popen(
                cmd, 
                stdin=subprocess.PIPE, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                env=env
            )
            out, err = process.communicate(input=manifest_json.encode())
            
            if process.returncode != 0:
                error_details = err.decode()
                print(f"Kubectl apply failed: {error_details}")
                raise RuntimeError(f"Kubectl apply failed: {error_details}")
            return True
        except FileNotFoundError:
             raise RuntimeError("kubectl binary not found in PATH")
        except Exception as e:
            print(f"Kubectl execution failed: {e}")
            raise e

    def _to_domain(self, k8s_obj: Any, kind: str) -> KubernetesResource:
        # Use ApiClient to get standard K8s JSON (camelCase) instead of python snake_case
        api_client = ApiClient()
        obj_dict = api_client.sanitize_for_serialization(k8s_obj)
        
        meta = obj_dict.get("metadata", {})
        
        namespace = meta.get("namespace")
        if namespace is None:
            namespace = "default"

        return KubernetesResource(
            kind=kind,
            name=meta.get("name"),
            namespace=namespace,
            api_version=obj_dict.get("apiVersion", "v1"), 
            content=obj_dict,
            unique_id=f"{kind}/{namespace}/{meta.get('name')}"
        )
