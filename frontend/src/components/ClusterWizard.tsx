import { useState, useEffect } from 'react';
import axios from 'axios';
import { Server, Wifi, Save, PlayCircle, Plus, HardDrive, Globe, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { deleteCluster } from '../services/api';

interface SavedCluster {
    id: string;
    name: string;
    type: 'local' | 'remote';
}

interface ClusterWizardProps {
    onConnect: (clusterId: string, clusterName: string) => void;
}

export default function ClusterWizard({ onConnect }: ClusterWizardProps) {
    const [mode, setMode] = useState<'local' | 'remote'>('local');
    const [name, setName] = useState('');
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState<string | React.ReactNode>('');
    const [savedClusters, setSavedClusters] = useState<SavedCluster[]>([]);
    const [view, setView] = useState<'list' | 'add'>('list');

    // New state for list view connection feedback
    const [connectingId, setConnectingId] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<React.ReactNode | null>(null);
    const [deletingClusterId, setDeletingClusterId] = useState<string | null>(null);

    useEffect(() => {
        fetchClusters();
    }, []);

    const fetchClusters = async () => {
        try {
            const res = await axios.get('http://localhost:8000/clusters');
            setSavedClusters(res.data);
            if (res.data.length === 0) setView('add');
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, clusterId: string) => {
        e.stopPropagation();
        setDeletingClusterId(clusterId);
    }

    const confirmDelete = async () => {
        if (!deletingClusterId) return;
        try {
            await deleteCluster(deletingClusterId);
            setDeletingClusterId(null);
            fetchClusters();
        } catch (e) {
            console.error("Failed to delete", e);
        }
    }

    const cancelDelete = () => {
        setDeletingClusterId(null);
    }

    const handleTest = async () => {
        // ... existing handleTest ...
        setLoading(true);
        setTestStatus('idle');
        setTestMessage('');
        try {
            const payload = mode === 'local'
                ? { kubeconfig_path: path }
                : { kubeconfig_content: JSON.parse(JSON.stringify(yamlToJson(content))) };

            await axios.post('http://localhost:8000/clusters/test', payload, { timeout: 10000 });
            setTestStatus('success');
            setTestMessage('Successfully connected to cluster!');
        } catch (err: any) {
            setTestStatus('error');
            const status = err.response?.status || 'Unknown';
            const detail = err.response?.data?.detail;
            let msg = '';

            if (Array.isArray(detail)) {
                msg = detail.map((e: any) => e.msg).join(', ');
            } else {
                msg = typeof detail === 'string' ? detail.replace("Connection failed: ", "") : 'Connection failed';
            }

            setTestMessage(
                <span className="block">
                    <span className="font-bold">Error {status}:</span> {msg}
                </span>
            );
        } finally {
            setLoading(false);
        }
    };

    const getPayload = () => {
        if (mode === 'local') return { kubeconfig_path: path };
        try {
            return { kubeconfig_content: JSON.parse(content) };
        } catch (e) {
            return null;
        }
    }

    const handleSaveAndConnect = async () => {
        if (!name.trim()) {
            setTestStatus('error');
            setTestMessage("Please enter a name for this cluster.");
            return;
        }

        setLoading(true);
        setTestStatus('idle');
        setTestMessage('');
        try {
            let payload: any = getPayload();

            // If parsing failed for remote
            if (!payload && mode === 'remote') {
                setTestStatus('error');
                setTestMessage("Invalid Format. For this MVP, please paste Kubeconfig in JSON format.");
                setLoading(false);
                return;
            }

            payload = { ...payload, name };

            // Save
            const saveRes = await axios.post('http://localhost:8000/clusters/save', payload, { timeout: 10000 });
            const id = saveRes.data.id;

            // Connect
            await axios.post(`http://localhost:8000/clusters/${id}/connect`);
            onConnect(id, name);
        } catch (err: any) {
            setTestStatus('error');
            const status = err.response?.status || 'Unknown';
            const detail = err.response?.data?.detail;
            let msg = '';

            if (Array.isArray(detail)) {
                msg = detail.map((e: any) => e.msg).join(', ');
            } else {
                msg = typeof detail === 'string' ? detail.replace("Connection failed: ", "") : 'Save failed';
            }

            setTestMessage(
                <span className="block">
                    <span className="font-bold">Error {status}:</span> {msg}
                </span>
            );
        } finally {
            setLoading(false);
        }
    };

    const connectToSaved = async (c: SavedCluster) => {
        if (connectingId || deletingClusterId) return; // Prevent multiple clicks
        setConnectingId(c.id);
        setConnectionError(null);

        try {
            await axios.post(`http://localhost:8000/clusters/${c.id}/connect`, {}, { timeout: 10000 });
            onConnect(c.id, c.name);
        } catch (err: any) {
            console.error(err);
            const status = err.response?.status || 'Unknown';
            const detail = err.response?.data?.detail;
            let msg = '';

            if (Array.isArray(detail)) {
                msg = detail.map((e: any) => e.msg).join(', ');
            } else {
                msg = typeof detail === 'string' ? (detail.replace("Connection failed: ", "") || 'Unknown Error') : 'Connection failed';
            }

            setConnectionError(
                <span className="block">
                    <span className="font-bold">Error {status}:</span> {msg}
                </span>
            );
        } finally {
            setConnectingId(null);
        }
    };

    // Simple yaml-to-json placeholder? No.
    const yamlToJson = (str: string) => { return {} };

    if (view === 'list' && savedClusters.length > 0) {
        return (
            <div className="w-full max-w-md mx-auto mt-20 p-6 bg-card border border-border rounded-lg shadow-xl relative">
                {/* Delete Confirmation Overlay */}
                {deletingClusterId && (
                    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg p-6 animate-in fade-in duration-200">
                        <div className="text-center space-y-4">
                            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-semibold">Delete Cluster?</h3>
                            <p className="text-sm text-muted-foreground">
                                Are you sure you want to remove
                                <span className="font-medium text-foreground mx-1">
                                    {savedClusters.find(c => c.id === deletingClusterId)?.name}
                                </span>
                                from your saved list?
                            </p>
                            <div className="flex gap-3 justify-center pt-2">
                                <button
                                    onClick={cancelDelete}
                                    className="px-4 py-2 rounded-md hover:bg-muted font-medium text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium text-sm transition-colors shadow-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <h2 className="text-2xl font-bold mb-6 text-center">Select Cluster</h2>

                {connectionError && (
                    <div className="mb-4 p-3 rounded text-sm flex items-start gap-2 bg-red-500/10 text-red-400 border border-red-500/20 animate-in fade-in slide-in-from-top-2">
                        <div className="mt-0.5"><AlertTriangle size={16} /></div>
                        <div className="flex flex-col">
                            <span className="font-bold">Connection Failed</span>
                            <span className="text-xs opacity-90">{connectionError}</span>
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {savedClusters.map(c => (
                        <div
                            key={c.id}
                            onClick={() => connectToSaved(c)}
                            className={`relative flex items-center justify-between p-4 bg-muted/30 border border-border rounded-lg cursor-pointer transition-colors group ${connectingId === c.id ? 'bg-muted/50 border-primary/50' : 'hover:bg-muted/50'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${c.type === 'local' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'} ${connectingId === c.id ? 'animate-pulse' : ''}`}>
                                    {c.type === 'local' ? <HardDrive size={18} /> : <Globe size={18} />}
                                </div>
                                <div className="font-medium">
                                    {c.name}
                                    {connectingId === c.id && <span className="text-xs font-normal text-muted-foreground ml-2 animate-pulse">Connecting...</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {connectingId === c.id ? (
                                    <Loader2 className="animate-spin text-primary" size={20} />
                                ) : (
                                    <>
                                        <button
                                            onClick={(e) => handleDeleteClick(e, c.id)}
                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                            title="Remove Cluster"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <PlayCircle className="opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <button onClick={() => setView('add')} className="w-full mt-6 py-3 border border-dashed border-border text-muted-foreground hover:bg-muted/20 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    <Plus size={18} /> Add New Cluster
                </button>
            </div>
        )
    }

    return (
        <div className="w-full max-w-2xl mx-auto mt-20 bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border bg-muted/10 flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Server className="text-primary" /> Connect Cluster
                </h2>
                {savedClusters.length > 0 && (
                    <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-white">Cancel</button>
                )}
            </div>

            <div className="p-6 space-y-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium mb-2 text-muted-foreground">Cluster Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-background border border-border rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                        placeholder="e.g. Production US-East"
                    />
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setMode('local')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${mode === 'local' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                    >
                        <HardDrive size={16} /> Local Kubeconfig
                    </button>
                    <button
                        onClick={() => setMode('remote')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${mode === 'remote' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                    >
                        <Globe size={16} /> Remote / Paste (JSON)
                    </button>
                </div>

                <div>
                    {mode === 'local' ? (
                        <div>
                            <label className="block text-sm font-medium mb-2 text-muted-foreground">Kubeconfig File Path</label>
                            <input
                                value={path}
                                onChange={e => setPath(e.target.value)}
                                className="w-full bg-background border border-border rounded p-2.5 focus:ring-1 focus:ring-primary outline-none"
                                placeholder="C:\Users\You\.kube\config"
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium mb-2 text-muted-foreground">Kubeconfig Content (JSON)</label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                className="w-full h-32 bg-background border border-border rounded p-2.5 focus:ring-1 focus:ring-primary outline-none font-mono text-xs"
                                placeholder='{"apiVersion": "v1", ...}'
                            />
                            <p className="text-xs text-muted-foreground mt-1">For MVP, please convert your YAML to JSON before pasting.</p>
                        </div>
                    )}
                </div>

                {/* Status Area */}
                {testStatus !== 'idle' && (
                    <div className={`p-3 rounded text-sm flex items-start gap-2 ${testStatus === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        <div className="mt-0.5">{testStatus === 'success' ? <Wifi size={16} /> : <AlertTriangle size={16} />}</div>
                        <div className="flex flex-col">
                            {testStatus === 'error' && <span className="font-bold">Connection Failed</span>}
                            <span className="text-xs opacity-90">{testMessage}</span>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-4 pt-4">
                    <button
                        onClick={handleTest}
                        disabled={loading}
                        className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted font-medium transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Testing...' : 'Test Connectivity'}
                    </button>
                    <button
                        onClick={handleSaveAndConnect}
                        disabled={loading}
                        className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-white/90 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={18} /> Save & Connect
                    </button>
                </div>
            </div>
        </div>
    );
}
