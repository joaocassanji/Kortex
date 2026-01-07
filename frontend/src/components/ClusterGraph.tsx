import { useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, Node, Edge, BackgroundVariant, MiniMap, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { Bot, FileText, X, AlertTriangle, Shield, CheckCircle, Info } from 'lucide-react';
import FixModal from './FixModal';

interface K8sResource {
    kind: string;
    name: string;
    namespace: string;
    content: any;
    unique_id: string;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

interface ClusterGraphProps {
    dependencyLevel?: number;
    onDisconnect?: () => void;
    // Controlled Mode Props
    resources?: K8sResource[];
    statusMap?: Record<string, 'pending' | 'analyzed' | 'error'>;
    isLoading?: boolean;
}

export default function ClusterGraph({ dependencyLevel = 1, onDisconnect, resources: externalResources, statusMap, isLoading }: ClusterGraphProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
    const [menu, setMenu] = useState<{ id: string; top: number; left: number; resource: K8sResource } | null>(null);
    const [manifestContent, setManifestContent] = useState<any | null>(null);
    const [clusterId, setClusterId] = useState<string | null>(null);
    const [analysisData, setAnalysisData] = useState<{ loading: boolean; result: any | null; error: string | null } | null>(null);
    const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    // Keep track if we are in controlled mode
    const isControlled = !!externalResources;

    // Fix Modal State
    const [activeIssueForFix, setActiveIssueForFix] = useState<any | null>(null);

    const fetchGraph = async () => {
        if (isControlled) return; // Skip fetching if controlled

        try {
            const clusters = await axios.get('http://localhost:8000/clusters');
            if (clusters.data.length === 0) {
                if (onDisconnect) onDisconnect();
                return;
            }

            // Prefer the last connected cluster
            const activeCluster = clusters.data.find((c: any) => c.is_active) || clusters.data[clusters.data.length - 1];
            const cid = activeCluster.id;

            setClusterId(cid);

            const res = await axios.get<K8sResource[]>(`http://localhost:8000/clusters/${cid}/resources`);
            const resources = res.data;

            buildGraph(resources);
        } catch (e: any) {
            console.error("Failed to fetch graph", e);
            if (e.response && (e.response.status === 404 || e.response.status === 401)) {
                if (onDisconnect) onDisconnect();
            }
        }
    }

    // Effect to build graph when external resources change
    useEffect(() => {
        if (isControlled && externalResources) {
            buildGraph(externalResources);
        }
    }, [externalResources, isControlled]);

    useEffect(() => {
        if (!isControlled) fetchGraph();
    }, [isControlled]);

    // Effect to handle highlighting when dependencyLevel or highlightedNodeId changes
    useEffect(() => {
        if (!highlightedNodeId) {
            // Reset opacity
            setNodes((nds) =>
                nds.map((node) => ({
                    ...node,
                    style: { ...node.style, opacity: 1 },
                }))
            );
            setEdges((eds) =>
                eds.map((edge) => ({
                    ...edge,
                    style: { ...edge.style, opacity: 1, stroke: edge.style?.stroke || '#b1b1b7' },
                }))
            );
            return;
        }

        const nodesToHighlight = new Set<string>();
        nodesToHighlight.add(highlightedNodeId);

        // Build adjacency list for faster traversal
        const adj = new Map<string, string[]>();

        // Add explicit Edges
        edges.forEach(e => {
            if (!adj.has(e.source)) adj.set(e.source, []);
            if (!adj.has(e.target)) adj.set(e.target, []);
            adj.get(e.source)?.push(e.target);
            adj.get(e.target)?.push(e.source);
        });

        // Add Parent-Child Relationships (Implicit Edges)
        nodes.forEach(n => {
            if (n.parentId) {
                if (!adj.has(n.id)) adj.set(n.id, []);
                if (!adj.has(n.parentId)) adj.set(n.parentId, []);
                adj.get(n.id)?.push(n.parentId);
                adj.get(n.parentId)?.push(n.id);
            }
        });

        // BFS traversal
        let currentLevel = 0;
        let currentNodes = [highlightedNodeId];
        const visited = new Set<string>([highlightedNodeId]);

        while (currentLevel < dependencyLevel && currentNodes.length > 0) {
            const nextNodes: string[] = [];
            for (const nodeId of currentNodes) {
                const neighbors = adj.get(nodeId) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        nodesToHighlight.add(neighbor);
                        nextNodes.push(neighbor);
                    }
                }
            }
            currentNodes = nextNodes;
            currentLevel++;
        }

        // Apply styles
        setNodes((nds) =>
            nds.map((node) => {
                const shouldHighlight = nodesToHighlight.has(node.id);
                return {
                    ...node,
                    style: {
                        ...node.style,
                        opacity: shouldHighlight ? 1 : 0.1,
                    },
                };
            })
        );

        setEdges((eds) =>
            eds.map((edge) => {
                const isConnected = nodesToHighlight.has(edge.source) && nodesToHighlight.has(edge.target);
                return {
                    ...edge,
                    style: {
                        ...edge.style,
                        opacity: isConnected ? 1 : 0.05,
                    },
                };
            })
        );

    }, [highlightedNodeId, dependencyLevel, edges.length]); // Re-run when these change

    // Style nodes based on statusMap (Scan progress)
    useEffect(() => {
        if (!isControlled || !statusMap || nodes.length === 0) return;

        setNodes((nds) => nds.map((node) => {
            if (node.type === 'group') return node; // Skip group nodes

            const status = statusMap[node.id] || 'pending';
            let style = { ...node.style };

            // Base style for consistency
            if (status === 'analyzed') {
                style.background = 'rgba(76, 175, 80, 0.1)';
                style.borderColor = '#4caf50';
                style.color = '#4caf50';
                style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.2)';
                style.opacity = 1;
            } else if (status === 'error') {
                style.background = 'rgba(239, 68, 68, 0.1)';
                style.borderColor = '#ef4444';
                style.color = '#ef4444';
                style.opacity = 1;
            } else if (status === 'ignored') {
                style.background = 'rgba(100, 116, 139, 0.05)';
                style.borderColor = '#64748b';
                style.color = '#64748b';
                style.borderStyle = 'dashed';
                style.opacity = 0.5;
            } else if (status === 'pending') {
                // Dim pending nodes slightly more but keep visible
                style.background = '#0f172a';
                style.borderColor = '#334155';
                style.color = '#64748b';
                style.opacity = 0.5;
                style.boxShadow = 'none';
            }

            return { ...node, style };
        }));

    }, [isControlled, statusMap, nodes.length, setNodes]);

    const onNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            if (!node.data.resource) return;
            setMenu({
                id: node.id,
                top: event.clientY,
                left: event.clientX,
                resource: node.data.resource as K8sResource,
            });
        },
        [setMenu],
    );

    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setMenu(null); // Close menu if open
        if (highlightedNodeId === node.id) {
            setHighlightedNodeId(null); // Toggle off
        } else {
            setHighlightedNodeId(node.id);
        }
    }, [highlightedNodeId]);

    const handleMiniMapNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        const { x, y } = node.position;
        const width = node.measured?.width || node.style?.width || 0;
        const height = node.measured?.height || node.style?.height || 0;

        if (rfInstance) {
            const currentZoom = rfInstance.getZoom();
            rfInstance.setCenter(
                x + (Number(width) / 2),
                y + (Number(height) / 2),
                { zoom: currentZoom, duration: 800 }
            );
        }
    }, [rfInstance]);

    const handleMiniMapClick = useCallback((_: React.MouseEvent, position: { x: number; y: number }) => {
        if (rfInstance) {
            const currentZoom = rfInstance.getZoom();
            rfInstance.setCenter(position.x, position.y, { zoom: currentZoom, duration: 800 });
        }
    }, [rfInstance]);

    // Override onPaneClick to clear highlight as well
    const onPaneClick = useCallback(() => {
        setMenu(null);
        setHighlightedNodeId(null);
    }, [setMenu]);

    const handleAnalyze = async (resource: K8sResource) => {
        setMenu(null);
        if (!clusterId) return;

        setAnalysisData({ loading: true, result: null, error: null });

        try {
            const res = await axios.post(`http://localhost:8000/clusters/${clusterId}/analyze-resource`, {
                resource_id: resource.unique_id
            });
            const resultWithId = {
                ...res.data,
                resource_id: resource.unique_id
            };
            setAnalysisData({ loading: false, result: resultWithId, error: null });
        } catch (e: any) {
            setAnalysisData({ loading: false, result: null, error: e.message || "Analysis failed" });
        }
    };

    const handleViewManifest = (resource: K8sResource) => {
        setMenu(null);
        setManifestContent(resource.content);
    };

    const handleStartFix = (issue: any) => {
        if (!clusterId || !analysisData?.result?.resource_id) return;
        setActiveIssueForFix({
            ...issue,
            resourceId: analysisData.result.resource_id
        });
    }

    const buildGraph = (resources: K8sResource[]) => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // --- Colors ---
        const colors: Record<string, string> = {
            Node: '#e2e8f0', // slate-200
            Pod: '#4caf50', // green
            Service: '#2196f3', // blue
            Ingress: '#9c27b0', // purple
            Deployment: '#ff9800', // orange
            ReplicaSet: '#ffb74d', // orange-light
            StatefulSet: '#ff5722', // deep orange
            DaemonSet: '#795548', // brown
            Job: '#607d8b', // blue-grey
            CronJob: '#009688', // teal
            ConfigMap: '#ffeb3b', // yellow
            Secret: '#f44336', // red
            PersistentVolumeClaim: '#3f51b5', // indigo
            PersistentVolume: '#3f51b5', // indigo
            StorageClass: '#9e9e9e', // grey
            ServiceAccount: '#673ab7', // deep purple
            Role: '#00bcd4', // cyan
            RoleBinding: '#00bcd4', // cyan
            ClusterRole: '#00bcd4', // cyan
            ClusterRoleBinding: '#00bcd4', // cyan
            Namespace: '#e91e63' // pink
        };

        const clusterScopedKinds = new Set(['Node', 'PersistentVolume', 'StorageClass', 'ClusterRole', 'ClusterRoleBinding', 'Namespace']);

        // --- Layout Constants ---
        const PADDING_TOP = 50;
        const ITEM_HEIGHT = 60;
        const ITEM_WIDTH = 260;
        const GAP_X = 20;
        const GAP_Y = 20;

        let globalY = 0;
        let maxLogicalWidth = 0;

        // =================================================================================================
        // 1. CLUSTER SCOPED RESOURCES (Top Section)
        // =================================================================================================
        const clusterScopeResources = resources.filter(r => clusterScopedKinds.has(r.kind) && r.kind !== 'Namespace' && r.kind !== 'Node');
        if (clusterScopeResources.length > 0) {
            const csGroupId = 'group-cluster-scope';
            const csCount = clusterScopeResources.length;
            const csCols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(csCount))));
            const LOGICAL_X = 40;
            const LOGICAL_SECTION_WIDTH = (ITEM_WIDTH * csCols) + (GAP_X * (csCols - 1));
            const csRows = Math.ceil(csCount / csCols);
            const csHeight = PADDING_TOP + (csRows * (ITEM_HEIGHT + GAP_Y)) + 20;
            const csWidth = LOGICAL_X + LOGICAL_SECTION_WIDTH + 40;

            newNodes.push({
                id: csGroupId,
                data: { label: 'Cluster Scoped Resources' },
                position: { x: 0, y: globalY },
                style: { width: csWidth, height: csHeight, backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px dashed #475569', color: '#94a3b8', fontWeight: 'bold', borderRadius: '8px' },
                type: 'group',
            });

            clusterScopeResources.forEach((r, idx) => {
                const col = idx % csCols;
                const row = Math.floor(idx / csCols);
                newNodes.push({
                    id: r.unique_id,
                    parentId: csGroupId,
                    data: { label: `${r.kind}\n${r.name}`, resource: r },
                    position: { x: LOGICAL_X + (col * (ITEM_WIDTH + GAP_X)), y: PADDING_TOP + (row * (ITEM_HEIGHT + GAP_Y)) },
                    extent: 'parent',
                    style: { width: ITEM_WIDTH, height: 50, background: '#1e293b', color: '#f8fafc', borderLeft: `4px solid ${colors[r.kind] || '#888'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' },
                });
            });

            globalY += csHeight + 40;
            maxLogicalWidth = Math.max(maxLogicalWidth, csWidth);
        }

        // =================================================================================================
        // 2. LOGICAL ZONE (Left Column): Namespace -> Logical Resources
        // =================================================================================================
        const namespaces = Array.from(new Set(resources.map(r => r.namespace || 'default'))).sort();
        let logicalY = globalY;

        const logicalResourcesMap = new Map<string, K8sResource[]>();
        namespaces.forEach(ns => {
            const res = resources.filter(r => r.namespace === ns && !clusterScopedKinds.has(r.kind) && r.kind !== 'Pod');
            if (res.length > 0) logicalResourcesMap.set(ns, res);
        });

        logicalResourcesMap.forEach((res, ns) => {
            const nsGroupId = `group-ns-logical-${ns}`;
            const count = res.length;
            const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
            const rows = Math.ceil(count / cols);

            const groupWidth = 40 + (cols * (ITEM_WIDTH + GAP_X));
            const groupHeight = PADDING_TOP + (rows * (ITEM_HEIGHT + GAP_Y));

            maxLogicalWidth = Math.max(maxLogicalWidth, groupWidth);

            newNodes.push({
                id: nsGroupId,
                data: { label: `Namespace: ${ns} (Logical)` },
                position: { x: 0, y: logicalY },
                style: { width: groupWidth, height: groupHeight, backgroundColor: 'rgba(233, 30, 99, 0.05)', border: '1px solid #be185d', color: '#f472b6', fontWeight: 'bold', fontSize: '14px', borderRadius: '8px' },
                type: 'group',
            });

            res.forEach((r, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                newNodes.push({
                    id: r.unique_id,
                    parentId: nsGroupId,
                    data: { label: `${r.kind}\n${r.name}`, resource: r },
                    position: { x: 20 + (col * (ITEM_WIDTH + GAP_X)), y: PADDING_TOP + (row * (ITEM_HEIGHT + GAP_Y)) },
                    extent: 'parent',
                    style: { width: ITEM_WIDTH, height: 50, background: '#1e293b', color: '#f8fafc', borderLeft: `4px solid ${colors[r.kind] || '#888'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' },
                });
            });

            logicalY += groupHeight + 20;
        });

        // =================================================================================================
        // 3. PHYSICAL ZONE (Right Column): Node -> Namespace -> Pods
        // =================================================================================================
        const PHYSICAL_START_X = Math.max(maxLogicalWidth + 100, 600); // Minimum gap if logical is empty
        let physicalY = globalY;

        // Identify Nodes
        // Use explicit Node objects if available, otherwise implied by Pods
        const explicitNodes = resources.filter(r => r.kind === 'Node');
        const podResources = resources.filter(r => r.kind === 'Pod');

        let allNodeNames = Array.from(new Set(podResources.map(r => r.content.spec?.nodeName || 'unscheduled')));
        explicitNodes.forEach(n => { if (!allNodeNames.includes(n.name)) allNodeNames.push(n.name) });
        allNodeNames = allNodeNames.sort();

        allNodeNames.forEach(nodeName => {
            const nodeGroupId = `group-node-${nodeName}`;

            // Find pods on this node
            const podsOnNode = podResources.filter(p => (p.content.spec?.nodeName || 'unscheduled') === nodeName);

            // If no pods and no explicit node resource (implied ghost node), skip? 
            // Better to show it if it exists in K8s, or if it has pods.
            const hasResource = explicitNodes.find(n => n.name === nodeName);
            if (!hasResource && podsOnNode.length === 0) return;

            // Group Pods by Namespace INSIDE this Node
            const podsByNs = new Map<string, K8sResource[]>();
            podsOnNode.forEach(p => {
                const ns = p.namespace || 'default';
                if (!podsByNs.has(ns)) podsByNs.set(ns, []);
                podsByNs.get(ns)?.push(p);
            });

            // Layout Children (Namespaces inside Node)
            let currentInnerY = PADDING_TOP;
            const innerNodes: Node[] = [];
            let maxInnerWidth = 320;

            // If no pods, just show basic node box
            if (podsByNs.size === 0) {
                maxInnerWidth = 320;
                currentInnerY = 100;
            } else {
                podsByNs.forEach((pods, ns) => {
                    const innerNsGroupId = `group-node-${nodeName}-ns-${ns}`;

                    // Grid for Pods
                    const POD_WIDTH = 180;
                    const POD_COLS = 2;
                    const podRows = Math.ceil(pods.length / POD_COLS);
                    const nsBoxHeight = 40 + (podRows * 50) + 10;
                    const nsBoxWidth = 20 + (POD_COLS * (POD_WIDTH + 10)) + 10;

                    maxInnerWidth = Math.max(maxInnerWidth, nsBoxWidth + 40);

                    // Inner Namespace Group
                    innerNodes.push({
                        id: innerNsGroupId,
                        parentId: nodeGroupId,
                        data: { label: `NS: ${ns}` },
                        position: { x: 20, y: currentInnerY },
                        style: { width: nsBoxWidth, height: nsBoxHeight, backgroundColor: 'rgba(233, 30, 99, 0.1)', border: '1px dashed #ec4899', color: '#fbcfe8', fontSize: '11px', borderRadius: '4px' },
                        zIndex: 20
                    });

                    pods.forEach((p, idx) => {
                        const col = idx % POD_COLS;
                        const row = Math.floor(idx / POD_COLS);
                        innerNodes.push({
                            id: p.unique_id,
                            parentId: innerNsGroupId,
                            data: { label: `${p.kind}\n${p.name}`, resource: p },
                            position: { x: 10 + (col * (POD_WIDTH + 10)), y: 35 + (row * 50) },
                            extent: 'parent',
                            style: { width: POD_WIDTH, height: 40, background: '#0f172a', color: '#4caf50', border: `1px solid ${colors.Pod}`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace', textAlign: 'center' },
                        });
                    });

                    currentInnerY += nsBoxHeight + 10;
                });
            }

            const nodeGroupHeight = Math.max(100, currentInnerY + 20);

            // Create Node Group (Outer)
            newNodes.push({
                id: nodeGroupId,
                data: { label: `Node: ${nodeName}` },
                position: { x: PHYSICAL_START_X, y: physicalY },
                style: { width: maxInnerWidth, height: nodeGroupHeight, backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '2px solid #334155', color: '#e2e8f0', fontWeight: 'bold', fontSize: '16px', borderRadius: '8px' },
                type: 'group',
            });

            // Connect Logical Node Resource to Physical Node Group (for highlighting continuity)
            if (hasResource) {
                newEdges.push({
                    id: `link-${hasResource.unique_id}-${nodeGroupId}`,
                    source: hasResource.unique_id,
                    target: nodeGroupId,
                    type: 'default',
                    style: { stroke: 'transparent', opacity: 0 }
                });
            }

            newNodes.push(...innerNodes);

            physicalY += nodeGroupHeight + 40;
        });


        // --- Edges ---
        resources.forEach(r => {
            const resId = r.unique_id;

            // 1. Owner References
            if (r.content.metadata?.ownerReferences) {
                r.content.metadata.ownerReferences.forEach((owner: any) => {
                    const ownerId = `${owner.kind}/${r.namespace}/${owner.name}`;
                    // Only draw if target exists in graph (simple check, or ReactFlow ignores it safely)
                    newEdges.push({
                        id: `${resId}-ownedby-${ownerId}`,
                        source: ownerId,
                        target: resId,
                        type: 'smoothstep',
                        style: { stroke: '#475569', strokeWidth: 1.5 },
                        animated: false
                    });
                });
            }

            // 2. Service Selectors
            if (r.kind === 'Service' && r.content.spec?.selector) {
                const selector = r.content.spec.selector;
                resources.filter(p => p.kind === 'Pod' && p.namespace === r.namespace).forEach(pod => {
                    const podLabels = pod.content.metadata?.labels || {};
                    if (Object.entries(selector).every(([k, v]) => podLabels[k] === v)) {
                        newEdges.push({
                            id: `${r.unique_id}-selects-${pod.unique_id}`,
                            source: r.unique_id,
                            target: pod.unique_id,
                            type: 'smoothstep',
                            animated: true,
                            style: { stroke: colors['Service'], strokeWidth: 1.5, strokeDasharray: '5,5', opacity: 0.8 }
                        });
                    }
                });
            }

            // 3. Volumes & Configs (Pod -> ConfigMap/Secret/PVC)
            if (r.kind === 'Pod' && r.content.spec?.volumes) {
                r.content.spec.volumes.forEach((vol: any) => {
                    let targetKind = '', targetName = '';
                    if (vol.persistentVolumeClaim) { targetKind = 'PersistentVolumeClaim'; targetName = vol.persistentVolumeClaim.claimName; }
                    else if (vol.configMap) { targetKind = 'ConfigMap'; targetName = vol.configMap.name; }
                    else if (vol.secret) { targetKind = 'Secret'; targetName = vol.secret.secretName; }

                    if (targetKind && targetName) {
                        const targetId = `${targetKind}/${r.namespace}/${targetName}`;
                        newEdges.push({
                            id: `${r.unique_id}-uses-${targetId}`,
                            source: r.unique_id,
                            target: targetId,
                            type: 'default',
                            style: { stroke: colors[targetKind] || '#aaa', opacity: 0.4 }
                        });
                    }
                });
            }

            // 4. PVC -> PV
            if (r.kind === 'PersistentVolumeClaim' && r.content.spec?.volumeName) {
                const pv = resources.find(x => x.kind === 'PersistentVolume' && x.name === r.content.spec.volumeName);
                if (pv) {
                    newEdges.push({
                        id: `${r.unique_id}-binds-${pv.unique_id}`,
                        source: r.unique_id,
                        target: pv.unique_id,
                        type: 'default',
                        style: { stroke: colors['PersistentVolume'], strokeWidth: 2 }
                    });
                }
            }
        });

        setNodes(newNodes);
        setEdges(newEdges);
    };

    return (
        <div style={{ width: '100%', height: '100%' }} className="bg-slate-950 rounded-lg border border-slate-800 shadow-2xl overflow-hidden relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                onNodeClick={handleNodeClick}
                onInit={setRfInstance}
                fitView
                className="bg-slate-950"
            >
                <Controls className="bg-white text-black" />
                <MiniMap
                    onNodeClick={handleMiniMapNodeClick}
                    onClick={handleMiniMapClick}
                    className="bg-slate-900"
                    nodeStrokeColor={(node) => {
                        if (!node.data?.resource) return 'transparent';

                        // If statusMap is active, handle strokes based on status
                        if (statusMap) {
                            const status = statusMap[node.id] || 'pending';
                            if (status === 'pending') return '#334155'; // Visible low-contrast stroke for pending
                            if (status === 'analyzed') return '#ffffff'; // Bright stroke for analyzed
                            return 'transparent';
                        }

                        // Fallback to opacity check for highlight mode
                        const opacity = node.style?.opacity;
                        if (opacity !== undefined && Number(opacity) < 1) return 'transparent';
                        return '#ffffff';
                    }}
                    nodeStrokeWidth={3}
                    nodeColor={(node) => {
                        if (!node.data?.resource) return 'transparent';

                        const resource = node.data.resource as K8sResource;
                        let baseColor = '#64748b';

                        // Determine Base Kind Color
                        switch (resource.kind) {
                            case 'Pod': baseColor = '#4caf50'; break;
                            case 'Service': baseColor = '#2196f3'; break;
                            case 'Deployment': baseColor = '#ff9800'; break;
                            case 'Ingress': baseColor = '#9c27b0'; break;
                            case 'ConfigMap': baseColor = '#ffeb3b'; break;
                            case 'Node': baseColor = '#e2e8f0'; break;
                            case 'PersistentVolumeClaim': baseColor = '#3f51b5'; break;
                            case 'Secret': baseColor = '#f44336'; break;
                        }

                        // Handle Status Overrides
                        if (statusMap) {
                            const status = statusMap[node.id] || 'pending';
                            if (status === 'pending') return '#1e293b'; // Visible dark grey for pending
                            if (status === 'error') return '#ef4444';   // Red for error
                            // Analyzed -> Use Base Color
                            return baseColor;
                        }

                        // Check for dimming (Highlight Mode)
                        const opacity = node.style?.opacity;
                        const isDimmed = opacity !== undefined && Number(opacity) < 1;
                        if (isDimmed) return '#1e293b';

                        return baseColor;
                    }}
                />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
            </ReactFlow>

            {/* Context Menu */}
            {menu && (
                <div
                    style={{ top: menu.top, left: menu.left }}
                    className="fixed z-50 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="p-3 border-b border-slate-800 bg-slate-800/50">
                        <h3 className="font-semibold text-sm text-slate-200 truncate">{menu.resource.kind}: {menu.resource.name}</h3>
                        <p className="text-xs text-slate-400 truncate">{menu.resource.unique_id}</p>
                    </div>
                    <div className="p-1">
                        <button
                            onClick={() => handleAnalyze(menu.resource)}
                            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-400 rounded transition-colors flex items-center gap-2 group"
                        >
                            <Bot size={16} className="group-hover:animate-pulse" />
                            Analyze with AI
                        </button>
                        <button
                            onClick={() => handleViewManifest(menu.resource)}
                            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded transition-colors flex items-center gap-2"
                        >
                            <FileText size={16} />
                            View manifest
                        </button>
                    </div>
                </div>
            )}

            {/* Manifest Modal */}
            {manifestContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90%]">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <FileText size={20} className="text-blue-400" />
                                Resource Manifest
                            </h3>
                            <button
                                onClick={() => setManifestContent(null)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="overflow-auto p-4 bg-slate-950/50 font-mono text-xs text-slate-300">
                            <pre>{JSON.stringify(manifestContent, null, 2)}</pre>
                        </div>
                        <div className="p-4 border-t border-slate-800 flex justify-end">
                            <button
                                onClick={() => setManifestContent(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Analysis Modal */}
            {analysisData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90%] overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Bot size={24} className="text-indigo-400" />
                                AI Deep Analysis
                            </h3>
                            <button
                                onClick={() => setAnalysisData(null)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/50">
                            {analysisData.loading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Bot size={48} className="animate-bounce mb-4 text-indigo-500" />
                                    <p className="text-lg font-medium text-white mb-2">Analyzing Resource Context...</p>
                                    <p className="text-sm max-w-md text-center opacity-70">The AI is examining configuration, relationships, and security policies across the cluster.</p>
                                </div>
                            ) : analysisData.error ? (
                                <div className="flex flex-col items-center justify-center py-20 text-red-400">
                                    <AlertTriangle size={48} className="mb-4" />
                                    <p className="text-lg font-bold">Analysis Failed</p>
                                    <p className="text-sm opacity-80">{analysisData.error}</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Summary */}
                                    <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                        <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-2">
                                            <Info size={16} /> Executive Summary
                                        </h4>
                                        <p className="text-slate-200 leading-relaxed text-sm">
                                            {analysisData.result.summary}
                                        </p>
                                    </div>

                                    {/* Issues By Category */}
                                    <div className="space-y-4">
                                        <h4 className="text-lg font-bold text-white mb-4">Identified Insights & Issues</h4>

                                        {analysisData.result.issues.length === 0 ? (
                                            <div className="p-8 text-center border border-slate-800 rounded-lg bg-slate-900/50">
                                                <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                                                <p className="text-slate-300 font-medium">No significant issues found.</p>
                                                <p className="text-slate-500 text-sm">This resource appears to follow best practices.</p>
                                            </div>
                                        ) : (
                                            analysisData.result.issues.map((issue: any, idx: number) => (
                                                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors">
                                                    <div className="flex items-start justify-between gap-4 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            {issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? (
                                                                <AlertTriangle className="text-red-500" size={20} />
                                                            ) : issue.severity === 'MEDIUM' ? (
                                                                <AlertTriangle className="text-yellow-500" size={20} />
                                                            ) : (
                                                                <Info className="text-blue-400" size={20} />
                                                            )}
                                                            <h5 className={`font-bold ${issue.severity === 'CRITICAL' ? 'text-red-400' :
                                                                issue.severity === 'HIGH' ? 'text-orange-400' :
                                                                    issue.severity === 'MEDIUM' ? 'text-yellow-400' : 'text-blue-300'
                                                                }`}>
                                                                {issue.title}
                                                            </h5>
                                                        </div>

                                                        {/* Fix Button Here */}
                                                        <button
                                                            onClick={() => handleStartFix(issue)}
                                                            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 text-xs font-bold uppercase tracking-wider rounded border border-indigo-500/20 transition-all"
                                                        >
                                                            <Shield size={12} /> Fix with AI
                                                        </button>
                                                    </div>

                                                    <p className="text-slate-300 text-sm mb-3 pl-7">
                                                        {issue.description}
                                                    </p>

                                                    {issue.remediation_suggestion && (
                                                        <div className="ml-7 p-3 bg-slate-950 rounded border border-slate-800 text-sm">
                                                            <span className="text-green-400 font-bold text-xs uppercase mb-1 block">Suggestion</span>
                                                            <p className="text-slate-400">{issue.remediation_suggestion.description}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Fix Modal Overlay */}
            <FixModal
                isOpen={!!activeIssueForFix}
                onClose={() => setActiveIssueForFix(null)}
                clusterId={clusterId || ''}
                issue={activeIssueForFix}
            />
        </div>
    );
}
