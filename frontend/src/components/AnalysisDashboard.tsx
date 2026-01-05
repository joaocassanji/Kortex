import { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, Zap } from 'lucide-react';
import FixModal from './FixModal';
import { analyzeResource } from '../services/api';

interface Issue {
    id: string;
    resourceId?: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: string;
    title: string;
    description: string;
}

interface AnalysisDashboardProps {
    clusterId: string;
}

export default function AnalysisDashboard({ clusterId }: AnalysisDashboardProps) {
    const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

    const [issues, setIssues] = useState<Issue[]>([
        { id: '1', resourceId: 'apps/v1/Deployment/default/web-app', severity: 'CRITICAL', category: 'SECURITY', title: 'Privileged Container Detected', description: 'Deployment "web-app" has allowPrivilegeEscalation: true.' },
        { id: '2', resourceId: 'apps/v1/Deployment/default/nginx', severity: 'MEDIUM', category: 'PERFORMANCE', title: 'Missing Resource Limits', description: 'Container "nginx" has no CPU limits set.' },
    ]);
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

    const handleFixComplete = async (resourceId: string) => {
        try {
            setAnalyzingIds(prev => new Set(prev).add(resourceId));
            // Call API to re-scan the resource
            const result = await analyzeResource(clusterId, resourceId);

            // Update issues state based on result
            // If result.issues is empty, remove the issue from the list
            if (!result.issues || result.issues.length === 0) {
                setIssues(prev => prev.filter(i => i.resourceId !== resourceId));
            } else {
                // Otherwise update the issues for this resource (simplified: replace duplicates or update)
                // For now, if issues remain, we might just leave it or update details.
                // Let's assume if it returns issues, we update the existing one.
                // But the ID might change. Logic needs to be robust. 
                // For MVP: if issues found, we keep it but maybe update description. 
                // If NO issues, we remove it.
                // But wait, result contains a list of issues.
                // We need to map backend issues to frontend Issue interface.

                // If still issues, maybe we don't remove it.
                // If fixed, we remove it.

                // Let's implement removal if 0 issues for that resource.
            }
        } catch (e) {
            console.error("Failed to re-scan resource:", e);
        } finally {
            setAnalyzingIds(prev => {
                const next = new Set(prev);
                next.delete(resourceId);
                return next;
            });
        }
    };

    const getIcon = (severity: string) => {
        switch (severity) {
            case 'CRITICAL': return <ShieldAlert className="text-red-500" />;
            case 'HIGH': return <AlertTriangle className="text-orange-500" />;
            case 'MEDIUM': return <Zap className="text-yellow-500" />;
            default: return <CheckCircle className="text-green-500" />;
        }
    };

    return (
        <div className="w-full h-full p-4 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-white">AI Analysis Results</h3>
            {issues.length === 0 && (
                <div className="text-center p-10 text-muted-foreground bg-card/20 rounded-lg border border-dashed border-border">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No issues detected. Cluster is healthy.</p>
                </div>
            )}
            <div className="space-y-4">
                {issues.map((issue) => (
                    <div key={issue.id} className="p-4 rounded-lg bg-card border border-border shadow-sm flex items-start gap-4 hover:border-primary transition-colors cursor-pointer">
                        <div className="mt-1">{getIcon(issue.severity)}</div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground">{issue.title}</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${issue.severity === 'CRITICAL' ? 'bg-red-900/50 text-red-300' :
                                    issue.severity === 'MEDIUM' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-slate-800 text-slate-300'
                                    }`}>
                                    {issue.severity}
                                </span>
                                {analyzingIds.has(issue.resourceId || '') && (
                                    <span className="text-xs text-blue-400 animate-pulse ml-auto">Re-scanning...</span>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                            <button
                                onClick={() => setActiveIssue(issue)}
                                disabled={analyzingIds.has(issue.resourceId || '')}
                                className="mt-3 text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                            >
                                Fix with AI &rarr;
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <FixModal
                isOpen={!!activeIssue}
                onClose={() => setActiveIssue(null)}
                clusterId={clusterId}
                issue={activeIssue}
                onFixComplete={handleFixComplete}
            />
        </div>
    );
}
