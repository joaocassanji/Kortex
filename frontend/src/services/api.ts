const API_BASE = 'http://localhost:8000';

export async function getClusters() {
    const res = await fetch(`${API_BASE}/clusters`);
    return res.json();
}

export async function saveCluster(data: any) {
    const res = await fetch(`${API_BASE}/clusters/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function deleteCluster(clusterId: string) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete cluster');
    return res.json();
}

export async function connectCluster(clusterId: string) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}/connect`, {
        method: 'POST'
    });
    return res.json();
}

export async function startFix(clusterId: string, resourceId: string, issue: string) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}/fix/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId, issue_description: issue })
    });
    if (!res.ok) throw new Error('Failed to start fix');
    return res.json();
}

export async function getFixStatus(workflowId: string) {
    const res = await fetch(`${API_BASE}/fix/${workflowId}`);
    if (!res.ok) throw new Error('Failed to get status');
    return res.json();
}

export async function analyzeCluster(clusterId: string) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}/analyze`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to analyze cluster');
    return res.json();
}

export async function analyzeResource(clusterId: string, resourceId: string) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}/analyze-resource`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId })
    });
    if (!res.ok) throw new Error('Failed to analyze resource');
    return res.json();
}

export async function startScan(clusterId: string, scanType: 'full' | 'smart' = 'full', filters?: string[]) {
    const res = await fetch(`${API_BASE}/clusters/${clusterId}/scan/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_type: scanType, filters: filters })
    });
    if (!res.ok) throw new Error('Failed to start scan');
    return res.json();
}

export async function getScanStatus(scanId: string) {
    const res = await fetch(`${API_BASE}/scan/${scanId}`);
    if (!res.ok) throw new Error('Failed to get scan status');
    return res.json();
}

export async function stopScan(scanId: string) {
    const res = await fetch(`${API_BASE}/scan/${scanId}/stop`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to stop scan');
    return res.json();
}
