import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader, Terminal, ShieldCheck, CheckCircle } from 'lucide-react';
import { startFix, getFixStatus } from '../services/api';

interface FixModalProps {
    isOpen: boolean;
    onClose: () => void;
    clusterId: string;
    issue: {
        id: string;
        resourceId?: string; // Implicitly matching issue title or similar for now if not structured
        title: string;
        description: string;
    } | null;
    onFixComplete?: (resourceId: string) => void;
}

export default function FixModal({ isOpen, onClose, clusterId, issue, onFixComplete }: FixModalProps) {
    if (!isOpen || !issue) return null;

    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [status, setStatus] = useState<any>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Initial Start
    useEffect(() => {
        if (!issue) return;
        let mounted = true;
        async function begin() {
            try {
                // Mock resource ID: Using string manipulation or passed data
                // In a real scenario, the Issue object has 'affected_resource_ids' or similar.
                // Here we assume 'web-app' or similar exists, or we pass "apps/v1/Deployment/default/web-app" if known.
                // For the demo, we'll try to guess based on description or pass a fallback.
                // BUT, better to assume the Issue object coming from AnalysisDashboard has it.
                // I'll update AnalysisDashboard to include resource_id in mock data.

                const resId = issue?.resourceId || "apps/v1/Deployment/default/web-app";

                const res = await startFix(clusterId, resId, issue?.description || "Unknown Issue");
                if (mounted) setWorkflowId(res.workflow_id);
            } catch (e) {
                console.error(e);
            }
        }
        begin();
        return () => { mounted = false; };
    }, [clusterId, issue]);

    // Polling
    useEffect(() => {
        if (!workflowId) return;
        const interval = setInterval(async () => {
            try {
                const s = await getFixStatus(workflowId);
                setStatus(s);
                setLogs(s.logs || []);
                if (s.status === 'completed' || s.status === 'failed') {
                    clearInterval(interval);
                }
            } catch (e) { }
        }, 1000);
        return () => clearInterval(interval);
    }, [workflowId]);

    // Scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const steps = [
        { key: 'step_1_create_vcluster', label: 'Create Isolation Environment (VCluster)' },
        { key: 'step_2_analysis', label: 'AI Risk Analysis & Patch Generation' },
        { key: 'step_3_apply_vcluster', label: 'Apply Fix to Simulation' },
        { key: 'step_4_validate_vcluster', label: 'Verify Simulation Stability' },
        { key: 'step_5_apply_real', label: 'Deploy to Production Cluster' },
        { key: 'step_6_final_validate', label: 'Final Integrity Check' },
    ];

    // Determine progress
    // If completed, all future steps are done.
    const isComplete = status?.status === 'completed';
    const isFailed = status?.status === 'failed';

    // Find active step index
    let activeIdx = steps.findIndex(s => s.key === status?.status);
    if (activeIdx === -1 && isComplete) activeIdx = steps.length;

    // Helper to see if step is done
    const isStepDone = (idx: number) => {
        if (isComplete) return true;
        if (activeIdx === -1) return false;
        return idx < activeIdx;
    };

    const isStepActive = (idx: number) => {
        if (isComplete || isFailed) return false;
        return idx === activeIdx;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[900px] bg-[#0f1117] border border-blue-500/20 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ring-1 ring-white/10">
                {/* Header */}
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-blue-950/30 to-purple-950/10">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <ShieldCheck className="text-blue-400 w-5 h-5" />
                            Auto-Remediation Agent
                        </h2>
                        <p className="text-xs text-blue-200/60 mt-1 uppercase tracking-wider font-medium">Fixing: {issue.title}</p>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex h-full min-h-[500px]">
                    {/* Left: Steps */}
                    <div className="w-[320px] bg-black/20 p-6 border-r border-white/5 space-y-7 relative">
                        <div className="absolute top-0 left-6 bottom-0 w-px bg-white/5 z-0" /> {/* Vertical Line */}
                        {steps.map((step, idx) => {
                            const done = isStepDone(idx);
                            const active = isStepActive(idx);

                            return (
                                <div key={step.key} className={`relative z-10 flex items-start gap-4 transition-all duration-300 ${!active && !done ? 'opacity-40' : 'opacity-100'}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all shadow-lg ${done ? 'bg-green-500 border-green-500 text-black shadow-green-900/20' :
                                        active ? 'bg-blue-600 border-blue-500 text-white animate-pulse shadow-blue-900/20' :
                                            'bg-[#0f1117] border-white/20 text-white/40'
                                        }`}>
                                        {done ? <Check className="w-4 h-4" /> : <span>{idx + 1}</span>}
                                    </div>
                                    <div className="flex-1 pt-1">
                                        <p className={`text-sm font-medium leading-none ${active ? 'text-blue-400' : done ? 'text-green-400' : 'text-white'}`}>{step.label}</p>
                                        {active && (
                                            <div className="text-xs text-blue-300/50 mt-2 flex items-center gap-1.5">
                                                <Loader className="w-3 h-3 animate-spin" /> Processing...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Right: Terminal / Details */}
                    <div className="flex-1 flex flex-col bg-[#08090c]">
                        {/* Logs */}
                        <div className="flex-1 p-6 flex flex-col min-h-0">
                            <h3 className="text-xs uppercase text-white/30 font-bold mb-3 flex items-center gap-2">
                                <Terminal className="w-3 h-3" /> Agent Execution Logs
                            </h3>
                            <div className="flex-1 bg-black/40 rounded-lg p-4 font-mono text-xs text-blue-100/80 overflow-y-auto border border-white/5 shadow-inner">
                                <div className="space-y-1">
                                    {logs.map((L, i) => (
                                        <div key={i} className="break-words border-l-2 border-transparent hover:border-white/10 pl-2 py-0.5">
                                            <span className="text-white/20 mr-3 select-none">[{new Date().toLocaleTimeString()}]</span>
                                            <span className={L.includes("ERROR") ? "text-red-400" : L.includes("PASSED") ? "text-green-400 font-bold" : ""}>{L}</span>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        </div>

                        {/* Footer Status */}
                        <div className={`p-6 border-t border-white/5 transition-colors ${isComplete ? 'bg-green-500/5' : isFailed ? 'bg-red-500/5' : 'bg-transparent'}`}>
                            {isComplete ? (
                                <div className="flex items-center gap-4 animate-in slide-in-from-bottom-2">
                                    <div className="p-3 bg-green-500/20 rounded-full text-green-400">
                                        <CheckCircle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-green-400 font-bold">Fix Successfully Deployed</h3>
                                        <p className="text-xs text-green-400/60">System verified. VCluster teardown scheduled.</p>
                                    </div>
                                    <button onClick={() => {
                                        if (issue?.resourceId && onFixComplete) {
                                            onFixComplete(issue.resourceId);
                                        }
                                        onClose();
                                    }} className="ml-auto px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-900/20">
                                        Close
                                    </button>
                                </div>
                            ) : isFailed ? (
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-red-500/20 rounded-full text-red-400">
                                        <X className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-red-400 font-bold">Remediation Failed</h3>
                                        <p className="text-xs text-red-400/60">Check logs for details. System rolled back.</p>
                                    </div>
                                    <button onClick={onClose} className="ml-auto px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors">
                                        Dismiss
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between text-white/40 text-xs">
                                    <span className="flex items-center gap-2"><Loader className="w-3 h-3 animate-spin" /> Automation in progress... do not close window</span>
                                    <span>Kortex Agent v0.1</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
