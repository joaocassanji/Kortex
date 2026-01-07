import { useEffect, useState } from 'react';
import { History, Shield, Zap, Search, Download, Terminal, X, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface Activity {
    id: string;
    timestamp: string;
    action: string;
    details: string;
    logs?: string[];
}

interface ActivityLogProps {
    clusterId: string;
}

export default function ActivityLog({ clusterId }: ActivityLogProps) {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!clusterId) return;
        const fetchHistory = async () => {
            try {
                const res = await axios.get(`http://localhost:8000/clusters/${clusterId}/history`);
                setActivities(res.data);
            } catch (e) {
                console.error(e);
            }
        };
        fetchHistory();
        const interval = setInterval(fetchHistory, 5000);
        return () => clearInterval(interval);
    }, [clusterId]);

    const getIcon = (action: string) => {
        if (action.includes('FIX')) return <Shield className="text-green-400 w-4 h-4" />;
        if (action.includes('ANALYSIS')) return <Search className="text-blue-400 w-4 h-4" />;
        return <History className="text-slate-500 w-4 h-4" />;
    };

    const handleExportLog = (act: Activity) => {
        if (!act.logs || act.logs.length === 0) return;

        const date = new Date(act.timestamp).toLocaleString();
        let content = `KORTEX ACTIVITY LOG\n`;
        content += `=========================\n`;
        content += `Action: ${act.action}\n`;
        content += `Details: ${act.details}\n`;
        content += `Timestamp: ${date}\n\n`;
        content += `LOG ENTRIES:\n`;
        act.logs.forEach(L => {
            content += `${L}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kortex-log-${act.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="w-full h-full p-4 overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <History size={14} /> Action History
            </h3>

            <div className="relative border-l border-slate-800 ml-2 space-y-6 pb-10">
                {activities.length === 0 ? (
                    <div className="pl-6 text-sm text-slate-600 italic">No activity recorded yet. <br /> Try analyzing a resource on the map.</div>
                ) : (
                    activities.map((act) => (
                        <div key={act.id} className="relative pl-6 group">
                            <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center z-10">
                                {getIcon(act.action)}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-500 font-mono mb-1">{new Date(act.timestamp).toLocaleTimeString()}</span>
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium text-slate-200">{act.action.replace(/_/g, ' ')}</h4>
                                    {act.logs && act.logs.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setExpandedId(expandedId === act.id ? null : act.id)}
                                                className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
                                                title="View Logs"
                                            >
                                                {expandedId === act.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                            <button
                                                onClick={() => handleExportLog(act)}
                                                className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
                                                title="Export Log"
                                            >
                                                <Download size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mt-1">{act.details}</p>

                                {/* Expanded Log View */}
                                {expandedId === act.id && act.logs && (
                                    <div className="mt-2 bg-black/60 rounded border border-slate-800 p-2 font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2">
                                        <div className="flex items-center gap-1.5 text-slate-500 mb-2 border-b border-white/5 pb-1">
                                            <Terminal size={10} />
                                            <span className="uppercase font-bold tracking-tighter">Execution Logs</span>
                                        </div>
                                        {act.logs.map((l, i) => (
                                            <div key={i} className="py-0.5 border-l border-white/5 pl-2 mb-0.5 last:mb-0 hover:bg-white/5 transition-colors">
                                                {l}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
