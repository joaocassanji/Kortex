import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    BarChart3,
    FileText,
    Calendar,
    ChevronRight,
    AlertCircle,
    ShieldAlert,
    ShieldQuestion,
    ShieldCheck,
    ArrowLeft,
    Download,
    LayoutDashboard,
    Loader2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ScanSummary {
    id: string;
    cluster_id: string;
    status: string;
    progress: number;
    timestamp: string;
    total_issues: number;
    type: string;
}

interface Issue {
    title: string;
    severity: string;
    category: string;
    description: string;
    affected_resource_ids?: string[];
}

interface FullScan {
    id: string;
    cluster_id: string;
    results: {
        issues: Issue[];
        summary: string;
        timestamp: string;
    };
    total_resources: number;
    analyzed_resources: number;
}

export default function ReportsDashboard() {
    const [scans, setScans] = useState<ScanSummary[]>([]);
    const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
    const [scanDetail, setScanDetail] = useState<FullScan | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchScans();
    }, []);

    const fetchScans = async () => {
        try {
            const res = await axios.get('http://localhost:8000/scans');
            setScans(res.data);
        } catch (e) {
            console.error("Failed to fetch scans", e);
        }
    };

    const handleSelectScan = async (id: string) => {
        setLoading(true);
        setSelectedScanId(id);
        try {
            const res = await axios.get(`http://localhost:8000/scan/${id}`);
            setScanDetail(res.data);
        } catch (e) {
            console.error("Failed to fetch scan detail", e);
        } finally {
            setLoading(false);
        }
    };

    const getSeverityStats = (issues: Issue[]) => {
        const stats = {
            CRITICAL: 0,
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0
        };
        issues.forEach(i => {
            const sev = (i.severity || 'LOW').toUpperCase() as keyof typeof stats;
            if (stats[sev] !== undefined) stats[sev]++;
            else stats.LOW++;
        });
        return stats;
    };

    const getCategoryStats = (issues: Issue[]) => {
        const stats: Record<string, number> = {};
        issues.forEach(i => {
            const cat = i.category || 'Uncategorized';
            stats[cat] = (stats[cat] || 0) + 1;
        });
        return stats;
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
                <Loader2 size={48} className="animate-spin text-primary mb-4" />
                <p className="text-lg font-medium animate-pulse">Loading detailed report...</p>
            </div>
        );
    }

    if (selectedScanId && scanDetail) {
        const stats = getSeverityStats(scanDetail.results?.issues || []);
        const catStats = getCategoryStats(scanDetail.results?.issues || []);
        const total = scanDetail.results?.issues?.length || 0;

        return (
            <div className="h-full flex flex-col bg-slate-950 overflow-y-auto custom-scrollbar pb-20">
                <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                setSelectedScanId(null);
                                setScanDetail(null);
                            }}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                        >
                            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                            Back to History
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={() => window.print()}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                            >
                                <Download size={16} /> Export PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                            <FileText className="text-primary" /> Analysis Report
                        </h2>
                        <p className="text-slate-400">
                            Scan ID: <span className="text-slate-200">{scanDetail.id}</span> •
                            Cluster: <span className="text-slate-200">{scanDetail.cluster_id}</span> •
                            Date: <span className="text-slate-200">{scanDetail.results?.timestamp ? new Date(scanDetail.results.timestamp).toLocaleString() : 'N/A'}</span>
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900/50 border border-red-500/30 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Critical</span>
                                <ShieldAlert className="text-red-500" size={18} />
                            </div>
                            <div className="text-3xl font-bold text-white">{stats.CRITICAL}</div>
                        </div>
                        <div className="bg-slate-900/50 border border-orange-500/30 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">High</span>
                                <AlertCircle className="text-orange-500" size={18} />
                            </div>
                            <div className="text-3xl font-bold text-white">{stats.HIGH}</div>
                        </div>
                        <div className="bg-slate-900/50 border border-yellow-500/30 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider">Medium</span>
                                <ShieldQuestion className="text-yellow-500" size={18} />
                            </div>
                            <div className="text-3xl font-bold text-white">{stats.MEDIUM}</div>
                        </div>
                        <div className="bg-slate-900/50 border border-blue-500/30 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">Low/Info</span>
                                <ShieldCheck className="text-blue-500" size={18} />
                            </div>
                            <div className="text-3xl font-bold text-white">{stats.LOW}</div>
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Severity Chart */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                                <BarChart3 className="text-primary" size={18} /> Severity Distribution
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { label: 'Critical', value: stats.CRITICAL, color: 'bg-red-500' },
                                    { label: 'High', value: stats.HIGH, color: 'bg-orange-500' },
                                    { label: 'Medium', value: stats.MEDIUM, color: 'bg-yellow-500' },
                                    { label: 'Low', value: stats.LOW, color: 'bg-blue-500' }
                                ].map(item => (
                                    <div key={item.label} className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-400">
                                            <span>{item.label}</span>
                                            <span>{Math.round((item.value / (total || 1)) * 100)}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full transition-all duration-1000", item.color)}
                                                style={{ width: `${(item.value / (total || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Category Breakdown */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                                <LayoutDashboard className="text-primary" size={18} /> Category Breakdown
                            </h3>
                            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.entries(catStats).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                                    <div key={cat} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <span className="text-sm text-slate-300">{cat}</span>
                                        </div>
                                        <span className="text-sm font-bold text-white">{val}</span>
                                    </div>
                                ))}
                                {Object.keys(catStats).length === 0 && <p className="text-slate-500 italic text-center text-sm py-4">No categories data.</p>}
                            </div>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Executive Summary</h3>
                        <div className="text-slate-300 leading-relaxed bg-slate-950/50 p-6 rounded-xl border border-slate-800">
                            {scanDetail.results?.summary || "No summary available for this scan."}
                        </div>
                    </div>

                    {/* Issues List */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Detailed Issues</h3>
                        <div className="space-y-3">
                            {(scanDetail.results?.issues || []).map((issue, i) => (
                                <div key={i} className="bg-slate-900 border border-slate-800 p-5 rounded-xl block">
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                        <div className="flex items-center gap-3">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                issue.severity === 'CRITICAL' ? "bg-red-500/20 text-red-500" :
                                                    issue.severity === 'HIGH' ? "bg-orange-500/20 text-orange-500" :
                                                        issue.severity === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-500" :
                                                            "bg-blue-500/20 text-blue-500"
                                            )}>
                                                {issue.severity}
                                            </span>
                                            <h4 className="font-bold text-white">{issue.title}</h4>
                                        </div>
                                        <span className="text-xs text-slate-500">{issue.category}</span>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-3">{issue.description}</p>
                                    {issue.affected_resource_ids && issue.affected_resource_ids.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {issue.affected_resource_ids.map(id => (
                                                <code key={id} className="text-[10px] px-2 py-0.5 bg-slate-950 rounded text-slate-500 border border-slate-800">
                                                    {id}
                                                </code>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {(!scanDetail.results?.issues || scanDetail.results.issues.length === 0) && (
                                <div className="p-8 text-center text-slate-500 italic bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                                    No specific issues were identified in this analysis.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
            <div className="p-8 max-w-5xl mx-auto w-full flex flex-col h-full space-y-8">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                        <FileText className="text-primary" /> Scan History
                    </h2>
                    <p className="text-slate-400">View and generate reports from your previous cluster analyses.</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-4">
                    {scans.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl text-slate-500 italic">
                            No scans found in history.
                        </div>
                    ) : (
                        scans.map(scan => (
                            <div
                                key={scan.id}
                                onClick={() => handleSelectScan(scan.id)}
                                className="group bg-slate-900/50 border border-slate-800 hover:border-primary/50 p-6 rounded-2xl cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/5"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="p-3 bg-slate-800 rounded-xl group-hover:bg-primary/20 transition-colors">
                                            <Calendar className="text-slate-400 group-hover:text-primary transition-colors" size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="text-lg font-bold text-white">Cluster: {scan.cluster_id}</h4>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                    scan.status === 'completed' ? "bg-green-500/20 text-green-500" :
                                                        scan.status === 'failed' ? "bg-red-500/20 text-red-500" :
                                                            "bg-yellow-500/20 text-yellow-500"
                                                )}>
                                                    {scan.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                                                <span>{scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'Date Unknown'}</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 uppercase">TYPE: {scan.type}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-white">{scan.total_issues}</div>
                                            <div className="text-xs text-slate-500 uppercase font-bold tracking-tighter">Issues Detected</div>
                                        </div>
                                        <div className="p-2 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all">
                                            <ChevronRight size={24} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                        ))}
                </div>
            </div>
        </div>
    );
}
