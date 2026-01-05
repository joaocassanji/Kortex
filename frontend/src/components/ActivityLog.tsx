import { useEffect, useState } from 'react';
import { History, Shield, Zap, Search } from 'lucide-react';
import axios from 'axios';

interface Activity {
    id: string;
    timestamp: string;
    action: string;
    details: string;
}

interface ActivityLogProps {
    clusterId: string;
}

export default function ActivityLog({ clusterId }: ActivityLogProps) {
    const [activities, setActivities] = useState<Activity[]>([]);

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

    return (
        <div className="w-full h-full p-4 overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <History size={14} /> Action History
            </h3>

            <div className="relative border-l border-slate-800 ml-2 space-y-6">
                {activities.length === 0 ? (
                    <div className="pl-6 text-sm text-slate-600 italic">No activity recorded yet. <br /> Try analyzing a resource on the map.</div>
                ) : (
                    activities.map((act) => (
                        <div key={act.id} className="relative pl-6">
                            <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                                {getIcon(act.action)}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-500 font-mono mb-1">{new Date(act.timestamp).toLocaleTimeString()}</span>
                                <h4 className="text-sm font-medium text-slate-200">{act.action.replace('_', ' ')}</h4>
                                <p className="text-xs text-slate-400 mt-1">{act.details}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
