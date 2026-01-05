from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from app.domain.models import KubernetesResource, AnalysisResult, RemediationStep, Cluster

class ClusterProviderPort(ABC):
    """
    Port for interacting with Kubernetes clusters (Real or Virtual).
    """
    
    @abstractmethod
    def list_resources(self, namespaces: List[str] = None) -> List[KubernetesResource]:
        """Fetches all resources from the cluster."""
        pass

    @abstractmethod
    def get_resource(self, kind: str, name: str, namespace: str) -> Optional[KubernetesResource]:
        """Fetches a specific resource."""
        pass

    @abstractmethod
    def apply_manifest(self, manifest: Dict[str, Any], namespace: str) -> bool:
        """Applies a manifest to the cluster."""
        pass
        
    @abstractmethod
    def check_connection(self) -> bool:
        """Verifies connectivity to the cluster."""
        pass

class SimulationEnginePort(ABC):
    """
    Port for managing Shadow Environments (vcluster).
    """
    
    @abstractmethod
    async def create_shadow_env(self, source_cluster: Cluster) -> Cluster:
        """Creates a temporary vcluster mirroring the source cluster."""
        pass
        
    @abstractmethod
    async def destroy_shadow_env(self, cluster_id: str):
        """Tears down the shadow environment."""
        pass

class LLMProviderPort(ABC):
    """
    Port for AI/LLM interactions.
    """
    
    @abstractmethod
    async def analyze_context(self, context: List[KubernetesResource], query: str) -> AnalysisResult:
        """Analyzes a set of resources and returns structured issues."""
        pass
        
    @abstractmethod
    async def generate_remediation(self, issue: Any) -> RemediationStep:
        """Generates a fix for a specific issue."""
        pass
