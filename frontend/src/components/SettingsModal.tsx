import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Settings, Bot, Key, Cpu, Save, CheckCircle2, AlertTriangle, Monitor, Wifi, Trash2, RefreshCw, Download } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: () => void;
    clusterId?: string;
}

interface SettingsState {
    ai_provider: 'ollama' | 'openai';
    model_name: string;
    openai_api_key?: string;
    dependency_level: number;
    ignored_namespaces: string[];
}

export default function SettingsModal({ isOpen, onClose, onSave, clusterId }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'system'>('ai');
    const [managedCount, setManagedCount] = useState<number | null>(null);
    const [isCleaningResources, setIsCleaningResources] = useState(false);
    const [showResourceConfirm, setShowResourceConfirm] = useState(false);
    const [resourceClearStatus, setResourceClearStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [settings, setSettings] = useState<SettingsState>({
        ai_provider: 'ollama',
        model_name: 'llama3',
        openai_api_key: '',
        dependency_level: 1,
        ignored_namespaces: ['kube-system', 'monitoring']
    });
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearStatus, setClearStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // Temp state for new namespace input
    const [newNamespace, setNewNamespace] = useState('');

    const addNamespace = () => {
        if (!newNamespace.trim()) return;
        if (settings.ignored_namespaces.includes(newNamespace.trim())) return;
        setSettings(prev => ({
            ...prev,
            ignored_namespaces: [...prev.ignored_namespaces, newNamespace.trim()]
        }));
        setNewNamespace('');
    }

    const removeNamespace = (ns: string) => {
        setSettings(prev => ({
            ...prev,
            ignored_namespaces: prev.ignored_namespaces.filter(n => n !== ns)
        }));
    }

    const handleClearCache = async () => {
        setIsClearing(true);
        setClearStatus('idle');
        try {
            await axios.post('http://localhost:8000/scan/cache/clear');
            setClearStatus('success');
            setTimeout(() => {
                setClearStatus('idle');
                setShowClearConfirm(false);
            }, 3000);
        } catch (e) {
            console.error("Failed to clear cache", e);
            setClearStatus('error');
            setTimeout(() => setClearStatus('idle'), 3000);
        } finally {
            setIsClearing(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
        }
    }, [isOpen]);

    const fetchManagedResources = async () => {
        if (!clusterId) return;
        try {
            const res = await axios.get(`http://localhost:8000/clusters/${clusterId}/managed-resources`);
            setManagedCount(res.data.count);
        } catch (e) {
            console.error("Failed to fetch managed resources", e);
        }
    };

    const handleCleanupResources = async () => {
        if (!clusterId) return;
        setIsCleaningResources(true);
        setResourceClearStatus('idle');
        try {
            const res = await axios.post(`http://localhost:8000/clusters/${clusterId}/cleanup`);
            const count = res.data.cleaned_count;
            setResourceClearStatus('success');
            setManagedCount(0);
            console.log(`Successfully cleaned up ${count} resources`);
            setTimeout(() => {
                setResourceClearStatus('idle');
                setShowResourceConfirm(false);
            }, 3000);
        } catch (e) {
            console.error("Failed to cleanup resources", e);
            setResourceClearStatus('error');
            setTimeout(() => setResourceClearStatus('idle'), 3000);
        } finally {
            setIsCleaningResources(false);
        }
    };

    useEffect(() => {
        if (isOpen && activeTab === 'general') {
            fetchManagedResources();
        }
    }, [isOpen, activeTab, clusterId]);

    const fetchSettings = async () => {
        try {
            const res = await axios.get('http://localhost:8000/settings');
            setSettings(res.data);
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setSaveStatus('idle');
        try {
            await axios.post('http://localhost:8000/settings', settings);
            setSaveStatus('success');
            if (onSave) onSave();
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error("Failed to save settings", e);
            setSaveStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            await axios.post('http://localhost:8000/settings/test', settings);
            setTestResult({ success: true, message: 'Connected successfully!' });
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Connection failed';
            setTestResult({ success: false, message: msg });
        } finally {
            setIsTesting(false);
        }
    };

    const handleExportArchive = async () => {
        try {
            const response = await axios.get('http://localhost:8000/archive/export', {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `kortex-backup-${new Date().toISOString().split('T')[0]}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            console.error("Failed to export archive", e);
            alert("Failed to export archive");
        }
    };

    const handleImportArchive = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        try {
            await axios.post('http://localhost:8000/archive/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert("Import successful! The application will now reload.");
            window.location.reload();
        } catch (e) {
            console.error("Failed to import archive", e);
            alert("Import failed. Make sure it's a valid Kortex archive zip.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-4xl h-[600px] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-2">
                    <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 pl-2">
                        <Settings className="text-primary" /> Settings
                    </h2>

                    <button
                        onClick={() => setActiveTab('general')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'general' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    >
                        <Monitor size={18} /> General
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'ai' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    >
                        <Bot size={18} /> AI Services
                    </button>
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'system' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    >
                        <RefreshCw size={18} /> System & Backup
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
                        <h3 className="text-xl font-semibold text-white">
                            {activeTab === 'general' ? 'General Settings' : activeTab === 'ai' ? 'AI Configuration' : 'System & Maintenance'}
                        </h3>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 p-8 overflow-y-auto">
                        {activeTab === 'general' ? (
                            <div className="space-y-8 max-w-2xl">
                                <div>
                                    <h4 className="text-lg font-medium text-white mb-4">Visual Dependencies</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        Configure how deep the highlighting should go when clicking a resource in the cluster map.
                                    </p>

                                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <label className="text-white font-medium">Depth Level</label>
                                            <span className="text-xl font-bold text-primary">{settings.dependency_level}</span>
                                        </div>

                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            step="1"
                                            value={settings.dependency_level}
                                            onChange={(e) => setSettings({ ...settings, dependency_level: parseInt(e.target.value) })}
                                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />

                                        <div className="flex justify-between text-xs text-slate-500 mt-2">
                                            <span>Direct (1)</span>
                                            <span>Full Graph (10)</span>
                                        </div>

                                        <p className="text-xs text-slate-400 mt-4">
                                            Setting this value higher allows you to see further connections in the dependency chain, but may clutter the view.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-lg font-medium text-white mb-4">Ignored Namespaces</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        Resources in these namespaces will be visualized in the map but <strong>excluded from AI analysis and modifications</strong>.
                                    </p>

                                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
                                        <div className="flex gap-2 mb-4">
                                            <input
                                                value={newNamespace}
                                                onChange={(e) => setNewNamespace(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && addNamespace()}
                                                placeholder="e.g. kube-system"
                                                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
                                            />
                                            <button
                                                onClick={addNamespace}
                                                className="bg-primary/20 text-primary hover:bg-primary/30 px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {settings.ignored_namespaces?.map(ns => (
                                                <div key={ns} className="flex items-center gap-2 bg-slate-800 border border-slate-600 px-3 py-1.5 rounded-full text-sm text-slate-300 group hover:border-red-500/50 transition-colors">
                                                    <span>{ns}</span>
                                                    <button
                                                        onClick={() => removeNamespace(ns)}
                                                        className="text-slate-500 hover:text-red-400 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {(!settings.ignored_namespaces || settings.ignored_namespaces.length === 0) && (
                                                <span className="text-sm text-slate-600 italic">No namespaces ignored. All will be analyzed.</span>
                                            )}
                                        </div>

                                        <p className="text-xs text-slate-500 mt-4">
                                            💡 Tip: Ignored namespaces will appear with a <span className="text-slate-400 border-b border-dashed border-slate-400">dashed border</span> in the cluster map.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-lg font-medium text-white mb-4 text-red-400">Memory & Cache Management</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        Clear temporary scan data and resource snapshots stored in memory. This is useful for troubleshooting or forcing a fresh deep analysis.
                                    </p>

                                    <div className="bg-slate-900 border border-red-900/30 rounded-xl p-6">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h5 className="text-sm font-medium text-white mb-1">Clear Scan Cache</h5>
                                                <p className="text-xs text-slate-500">Removes all history for current session and resets Smart Scan trackers.</p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {clearStatus === 'success' && (
                                                    <span className="text-sm text-green-400 font-medium animate-in fade-in zoom-in duration-200">
                                                        Cleared!
                                                    </span>
                                                )}
                                                {clearStatus === 'error' && (
                                                    <span className="text-sm text-red-400 font-medium italic">
                                                        Failed to clear.
                                                    </span>
                                                )}

                                                {!showClearConfirm ? (
                                                    <button
                                                        onClick={() => setShowClearConfirm(true)}
                                                        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-sm font-medium transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                        Clear Memory
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                                                        <span className="text-xs text-slate-400 font-medium mr-2">Are you sure?</span>
                                                        <button
                                                            onClick={handleClearCache}
                                                            disabled={isClearing}
                                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                                                        >
                                                            {isClearing ? <RefreshCw size={14} className="animate-spin" /> : 'Yes, Delete'}
                                                        </button>
                                                        <button
                                                            onClick={() => setShowClearConfirm(false)}
                                                            disabled={isClearing}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-lg font-medium text-white mb-4 text-blue-400">Application Resources</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        These are resources (like VClusters and temporary patches) created by Kortex with the <code>kortex.io/managed</code> annotation.
                                    </p>

                                    <div className="bg-slate-900 border border-blue-900/30 rounded-xl p-6">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h5 className="text-sm font-medium text-white mb-1">Managed Resources</h5>
                                                <p className="text-xs text-slate-500">
                                                    {managedCount !== null
                                                        ? `${managedCount} resources currently active in the cluster.`
                                                        : 'Checking for active resources...'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {resourceClearStatus === 'success' && (
                                                    <span className="text-sm text-green-400 font-medium animate-in fade-in zoom-in duration-200">
                                                        Cleaned!
                                                    </span>
                                                )}
                                                {resourceClearStatus === 'error' && (
                                                    <span className="text-sm text-red-400 font-medium italic">
                                                        Cleanup failed.
                                                    </span>
                                                )}

                                                {!showResourceConfirm ? (
                                                    <button
                                                        onClick={() => setShowResourceConfirm(true)}
                                                        disabled={!clusterId || managedCount === 0 || managedCount === null}
                                                        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <Trash2 size={16} />
                                                        Cleanup Kortex Resources
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                                                        <span className="text-xs text-slate-400 font-medium mr-2">Wipe everything?</span>
                                                        <button
                                                            onClick={handleCleanupResources}
                                                            disabled={isCleaningResources}
                                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                                                        >
                                                            {isCleaningResources ? <RefreshCw size={14} className="animate-spin" /> : 'Confirm Cleanup'}
                                                        </button>
                                                        <button
                                                            onClick={() => setShowResourceConfirm(false)}
                                                            disabled={isCleaningResources}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : activeTab === 'ai' ? (
                            <div className="space-y-8 max-w-2xl">
                                {/* Provider Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-4">Select AI Provider</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div
                                            onClick={() => setSettings({ ...settings, ai_provider: 'ollama' })}
                                            className={`cursor-pointer p-4 rounded-xl border transition-all ${settings.ai_provider === 'ollama' ? 'bg-orange-500/10 border-orange-500 ring-1 ring-orange-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`p-2 rounded-full ${settings.ai_provider === 'ollama' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                    <Cpu size={20} />
                                                </div>
                                                <span className={`font-semibold ${settings.ai_provider === 'ollama' ? 'text-white' : 'text-slate-300'}`}>Ollama (Local)</span>
                                            </div>
                                            <p className="text-xs text-slate-400 pl-11">Run models locally. Private & cost-free.</p>
                                        </div>

                                        <div
                                            onClick={() => setSettings({ ...settings, ai_provider: 'openai' })}
                                            className={`cursor-pointer p-4 rounded-xl border transition-all ${settings.ai_provider === 'openai' ? 'bg-green-500/10 border-green-500 ring-1 ring-green-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`p-2 rounded-full ${settings.ai_provider === 'openai' ? 'bg-green-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                    <Bot size={20} />
                                                </div>
                                                <span className={`font-semibold ${settings.ai_provider === 'openai' ? 'text-white' : 'text-slate-300'}`}>OpenAI</span>
                                            </div>
                                            <p className="text-xs text-slate-400 pl-11">Powerful cloud models (GPT-4, etc).</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Configuration Fields */}
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-2">Model Name</label>
                                        <input
                                            value={settings.model_name}
                                            onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-primary outline-none transition-all"
                                            placeholder={settings.ai_provider === 'openai' ? "e.g. gpt-4-turbo" : "e.g. llama3"}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            {settings.ai_provider === 'openai'
                                                ? 'Specify the OpenAI model ID (gpt-3.5-turbo, gpt-4, etc).'
                                                : 'Must match a model installed via `ollama pull`.'}
                                        </p>
                                    </div>

                                    {settings.ai_provider === 'openai' && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-2">API Key</label>
                                            <div className="relative">
                                                <Key className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                                <input
                                                    type="password"
                                                    value={settings.openai_api_key}
                                                    onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-primary outline-none transition-all"
                                                    placeholder="sk-..."
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">Your key is stored locally in the backend config.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8 max-w-2xl">
                                <div>
                                    <h4 className="text-lg font-medium text-white mb-4">Backup & Restore</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        Archive all your activity logs, scan reports, and configurations into a single ZIP file.
                                        Cluster connections are <strong>not</strong> exported for security reasons.
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center gap-4">
                                            <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                                                <Download size={24} />
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-white mb-1">Export Data</h5>
                                                <p className="text-xs text-slate-500">Download a .zip with all application data</p>
                                            </div>
                                            <button
                                                onClick={handleExportArchive}
                                                className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors"
                                            >
                                                Generate Archive
                                            </button>
                                        </div>

                                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center gap-4">
                                            <div className="p-3 bg-green-500/10 rounded-full text-green-400">
                                                <Save size={24} />
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-white mb-1">Import Data</h5>
                                                <p className="text-xs text-slate-500">Restore from a previously exported .zip</p>
                                            </div>
                                            <label className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold transition-colors cursor-pointer text-center">
                                                Select Zip File
                                                <input
                                                    type="file"
                                                    accept=".zip"
                                                    onChange={handleImportArchive}
                                                    className="hidden"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <h4 className="text-lg font-medium text-white mb-4 text-red-400">Memory & Cache Management</h4>
                                    <p className="text-sm text-slate-400 mb-6">
                                        Clear temporary scan data and resource snapshots stored in memory.
                                    </p>

                                    <div className="bg-slate-900 border border-red-900/30 rounded-xl p-6">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h5 className="text-sm font-medium text-white mb-1">Clear Scan Cache</h5>
                                                <p className="text-xs text-slate-500">Removes all history for current session and resets Smart Scan trackers.</p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {clearStatus === 'success' && (
                                                    <span className="text-sm text-green-400 font-medium animate-in fade-in zoom-in duration-200">
                                                        Cleared!
                                                    </span>
                                                )}
                                                {!showClearConfirm ? (
                                                    <button
                                                        onClick={() => setShowClearConfirm(true)}
                                                        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-sm font-medium transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                        Clear Memory
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={handleClearCache}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-bold"
                                                        >
                                                            Confirm
                                                        </button>
                                                        <button
                                                            onClick={() => setShowClearConfirm(false)}
                                                            className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-md text-xs font-bold"
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-4">
                            {activeTab === 'ai' && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={isTesting || loading}
                                        className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {isTesting ? <Monitor className="animate-spin" size={14} /> : <Wifi size={14} />}
                                        Test Connectivity
                                    </button>
                                    {testResult && (
                                        <span className={`text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                            {testResult.message}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            {saveStatus === 'success' && (
                                <span className="text-sm text-green-400 flex items-center gap-2 animate-in fade-in">
                                    <CheckCircle2 size={16} /> Settings Saved
                                </span>
                            )}
                            {saveStatus === 'error' && (
                                <span className="text-sm text-red-400 flex items-center gap-2 animate-in fade-in">
                                    <AlertTriangle size={16} /> Save Failed
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-blue-900/20"
                            >
                                {loading ? <Monitor className="animate-spin" size={18} /> : <Save size={18} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div >
        </div >
    );
}
