import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Settings, Bot, Key, Cpu, Save, CheckCircle2, AlertTriangle, Monitor, Wifi } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: () => void;
}

interface SettingsState {
    ai_provider: 'ollama' | 'openai';
    model_name: string;
    openai_api_key?: string;
    dependency_level: number;
}

export default function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'general' | 'ai'>('ai');
    const [settings, setSettings] = useState<SettingsState>({
        ai_provider: 'ollama',
        model_name: 'llama3',
        openai_api_key: '',
        dependency_level: 1
    });
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
        }
    }, [isOpen]);

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
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
                        <h3 className="text-xl font-semibold text-white">
                            {activeTab === 'general' ? 'General Settings' : 'AI Configuration'}
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
                            </div>
                        ) : (
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
