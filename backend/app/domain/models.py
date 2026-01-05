from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime

class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class IssueCategory(str, Enum):
    SECURITY = "SECURITY"
    PERFORMANCE = "PERFORMANCE"
    RELIABILITY = "RELIABILITY"
    SCALABILITY = "SCALABILITY"
    COST = "COST"
    BEST_PRACTICE = "BEST_PRACTICE"

class KubernetesResource(BaseModel):
    """
    Represents a single Kubernetes object with its metadata and content.
    """
    kind: str
    name: str
    namespace: str = "default"
    api_version: str
    content: Dict[str, Any] = Field(..., description="The full raw manifest content as a dict")
    
    content: Dict[str, Any] = Field(..., description="The full raw manifest content as a dict")
    unique_id: str = "" # Populated by adapter

class Cluster(BaseModel):
    """
    Represents a Kubernetes Cluster connection.
    """
    id: str
    name: str
    kubeconfig_path: str
    is_active: bool = False

class RemediationStep(BaseModel):
    """
    A single step in a remediation plan (e.g., applying a patch).
    """
    description: str
    action_type: str  # e.g., "PATCH", "APPLY", "DELETE"
    manifest: Dict[str, Any]
    target_resource_id: str

class Issue(BaseModel):
    """
    A detected issue within the cluster or a specific resource.
    """
    severity: Severity
    category: IssueCategory
    title: str
    description: str
    remediation_suggestion: Optional[RemediationStep] = None
    affected_resource_ids: List[str] = []
    documentation_reference: Optional[str] = None

class AnalysisResult(BaseModel):
    """
    The output of an AI analysis session.
    """
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    issues: List[Issue] = []
    summary: str
    
class AuditLogEntry(BaseModel):
    """
    Immutable audit log entry for an AI action.
    """
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: str
    action: str
    details: Dict[str, Any]
    signature: str 
    previous_hash: str
