import { useRef, useState, useEffect, useCallback } from 'react'
import { ReactFlow, Controls, Background, BackgroundVariant, MiniMap, useNodesState, useEdgesState, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loader2, CheckCircle2, AlertTriangle, Circle } from 'lucide-react'

interface K8sResource {
    kind: string;
    name: string;
    namespace: string;
    unique_id: string;
    content: any;
}

interface ScanProgressMapProps {
    resources: K8sResource[]
    statusMap: Record<string, 'pending' | 'analyzed' | 'error'>
    activeScanId: string | null
}

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

export default function ScanProgressMap({ resources, statusMap, activeScanId }: ScanProgressMapProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [built, setBuilt] = useState(false)

    // Build Graph on initial mount or resource list change
    useEffect(() => {
        if (!resources || resources.length === 0) return;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Simple layout: Group by Namespace
        const namespaces = Array.from(new Set(resources.map(r => r.namespace || 'default'))).sort();

        let globalY = 0;
        const NS_WIDTH = 800;
        const PADDING = 20;
        const COLUMNS = 5;
        const ITEM_W = 140;
        const ITEM_H = 50;
        const GAP = 15;

        namespaces.forEach(ns => {
            const nsResources = resources.filter(r => r.namespace === ns);
            const count = nsResources.length;
            const rows = Math.ceil(count / COLUMNS);

            const groupHeight = 60 + (rows * (ITEM_H + GAP));

            const nsGroupId = `group-${ns}`;

            newNodes.push({
                id: nsGroupId,
                data: { label: ns },
                position: { x: 0, y: globalY },
                style: {
                    width: NS_WIDTH,
                    height: groupHeight,
                    backgroundColor: 'rgba(30, 41, 59, 0.3)',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    paddingTop: '10px'
                },
                type: 'group',
            });

            nsResources.forEach((r, idx) => {
                const col = idx % COLUMNS;
                const row = Math.floor(idx / COLUMNS);

                newNodes.push({
                    id: r.unique_id,
                    parentId: nsGroupId,
                    data: { label: r.name, kind: r.kind },
                    position: {
                        x: PADDING + (col * (ITEM_W + GAP)),
                        y: 40 + (row * (ITEM_H + GAP))
                    },
                    extent: 'parent',
                    style: {
                        width: ITEM_W,
                        height: ITEM_H,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: '#cbd5e1',
                        fontFamily: 'monospace',
                        transition: 'all 0.3s ease'
                    }
                });
            });

            globalY += groupHeight + 40;
        });

        setNodes(newNodes);
        setEdges(newEdges); // Edges can be added if needed, but keeping it simple for progress map
        setBuilt(true);

    }, [resources, setNodes, setEdges]);

    // Update Node Styles based on Status
    useEffect(() => {
        if (!built) return;

        setNodes(nds => nds.map(node => {
            if (node.type === 'group') return node;

            const status = statusMap[node.id] || 'pending';
            let style = { ...node.style };

            if (status === 'analyzed') {
                style.background = 'rgba(76, 175, 80, 0.1)';
                style.borderColor = '#4caf50';
                style.color = '#4caf50';
                style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.2)';
            } else if (status === 'pending') {
                // Check if it's currently being "processed" - simulated by naive check or passed prop
                // For now just default
                style.background = '#0f172a';
                style.borderColor = '#334155';
                style.color = '#64748b';
            } else if (status === 'error') {
                style.background = 'rgba(239, 68, 68, 0.1)';
                style.borderColor = '#ef4444';
                style.color = '#ef4444';
            }

            return { ...node, style };
        }));

    }, [built, statusMap, setNodes]);

    return (
        <div className="w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                minZoom={0.5}
                maxZoom={2}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
                <Controls className="bg-white text-black" />
            </ReactFlow>

            {/* Legend */}
            <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur border border-slate-700 p-3 rounded-lg flex flex-col gap-2 z-10">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                    <div className="w-3 h-3 rounded-full border border-slate-600 bg-slate-950"></div>
                    <span>Pending</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-400">
                    <div className="w-3 h-3 rounded-full border border-green-500 bg-green-500/20 shadow-[0_0_8px_rgba(76,175,80,0.5)]"></div>
                    <span>Analyzed</span>
                </div>
            </div>
        </div>
    )
}
