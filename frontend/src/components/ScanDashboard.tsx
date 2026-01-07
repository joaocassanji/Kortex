import { useState, useEffect, useRef } from 'react'
import { startScan, getScanStatus, startFix, getFixStatus, stopScan } from '../services/api'
import { Play, Loader2, CheckCircle2, AlertTriangle, Shield, Terminal, Wrench, Octagon, FileText, Download } from 'lucide-react'
import FixModal from './FixModal'
import ScanOptionsModal from './ScanOptionsModal'
import axios from 'axios'
import ClusterGraph from './ClusterGraph'

interface Issue {
    severity: string
    category: string
    title: string
    description: string
    remediation_suggestion: { manifest: any, description: string }
    affected_resource_ids: string[]
}

interface ScanResult {
    summary: string
    issues: Issue[]
    timestamp: string
}

interface ScanDashboardProps {
    clusterId: string
    onDisconnect?: () => void
    activeScanId?: string | null
    onScanStarted?: (id: string) => void
}

export default function ScanDashboard({ clusterId, onDisconnect, activeScanId, onScanStarted }: ScanDashboardProps) {

    const [scanId, setScanId] = useState<string | null>(activeScanId || null)
    // Initialize as initializing if we have an ID to avoid flash of idle state
    const [status, setStatus] = useState<string>(activeScanId ? 'initializing' : 'idle')
    const [progress, setProgress] = useState(0)
    const [logs, setLogs] = useState<{ timestamp: string, message: string }[]>([])
    const [results, setResults] = useState<ScanResult | null>(null)

    // Map State
    const [mapResources, setMapResources] = useState<any[]>([])
    const [mapStatus, setMapStatus] = useState<Record<string, 'pending' | 'analyzed' | 'error'>>({})

    // UI Confirmation & Alert States
    const [showBatchConfirm, setShowBatchConfirm] = useState(false)
    const [isGeneratingReport, setIsGeneratingReport] = useState(false)
    const [toastMessage, setToastMessage] = useState<string | null>(null)

    // Polling Logic
    useEffect(() => {
        if (!scanId || status === 'completed' || status === 'failed' || status === 'stopped') return

        const interval = setInterval(async () => {
            try {
                const res = await getScanStatus(scanId)

                // Update basic status
                if (res.status) setStatus(res.status)
                if (res.progress) setProgress(res.progress)
                if (res.logs) setLogs(res.logs)

                // Update results if done
                if (res.status === 'completed' && res.results) {
                    setResults(res.results)
                }

                // Update Map Data
                if (res.resources_list) setMapResources(res.resources_list)
                if (res.resource_status) setMapStatus(res.resource_status)

            } catch (e) {
                console.error("Polling error:", e)
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [scanId, status])

    // Batch Fix State
    const [isBatchFixing, setIsBatchFixing] = useState(false)
    const [batchProgress, setBatchProgress] = useState<{ current: number, total: number, currentIssueId: string }>({ current: 0, total: 0, currentIssueId: '' })
    const [batchLogs, setBatchLogs] = useState<string[]>([])

    // Fix Modal State
    const [fixModalOpen, setFixModalOpen] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [showScanOptions, setShowScanOptions] = useState(false)

    const scrollRef = useRef<HTMLDivElement>(null)
    const batchLogRef = useRef<HTMLDivElement>(null)

    const handleStartScan = () => {
        setShowScanOptions(true)
    }

    const confirmStartScan = async (scanType: 'full' | 'smart', filters?: string[]) => {
        setShowScanOptions(false)
        try {
            setResults(null)
            setLogs([])
            setProgress(0)
            const res = await startScan(clusterId, scanType, filters)
            setScanId(res.scan_id)
            if (onScanStarted) onScanStarted(res.scan_id)
            setStatus('initializing')
        } catch (e) {
            console.error(e)
            setToastMessage("Failed to start scan")
            setTimeout(() => setToastMessage(null), 3000)
        }
    }

    const handleStopScan = async () => {
        if (!scanId) return
        try {
            // Optimistic update to prevent UI lag
            setStatus('stopped')
            await stopScan(scanId)
        } catch (e) {
            console.error(e)
            setToastMessage("Failed to stop scan")
            setTimeout(() => setToastMessage(null), 3000)
        }
    }

    const handleFixClick = (issue: Issue) => {
        setSelectedIssue(issue)
        setFixModalOpen(true)
    }

    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

    const toggleIssueSelection = (index: number) => {
        const newSet = new Set(selectedIndices)
        if (newSet.has(index)) {
            newSet.delete(index)
        } else {
            newSet.add(index)
        }
        setSelectedIndices(newSet)
    }

    const toggleSelectAll = () => {
        if (!results) return
        if (selectedIndices.size === results.issues.length) {
            setSelectedIndices(new Set())
        } else {
            const all = new Set(results.issues.map((_, i) => i))
            setSelectedIndices(all)
        }
    }

    const handleGenerateReport = () => {
        if (!results) return

        const date = new Date().toLocaleString()
        let md = `# Kortex Scan Report\n**Date:** ${date}\n**Cluster:** ${clusterId}\n\n`
        md += `## Executive Summary\n${results.summary}\n\n`
        md += `## Identified Issues (${results.issues.length})\n\n`

        results.issues.forEach((issue, i) => {
            md += `### ${i + 1}. ${issue.title} [${issue.severity}]\n`
            md += `**Category:** ${issue.category}\n`
            md += `**Resource:** ${issue.affected_resource_ids?.join(', ') || 'N/A'}\n`
            md += `**Description:** ${issue.description}\n\n`
            md += `---\n\n`
        })

        const blob = new Blob([md], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `kortex-report-${new Date().toISOString().split('T')[0]}.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleBatchFix = () => {
        if (!results || !results.issues.length) return
        setShowBatchConfirm(true)
    }

    const handleExportBatchLogs = () => {
        const date = new Date().toLocaleString()
        let content = `KORTEX BATCH REMEDIATION LOG\n`
        content += `===============================\n`
        content += `Date: ${date}\n`
        content += `Cluster: ${clusterId}\n\n`
        content += `TOTAL ISSUES PROCESSED: ${batchProgress.total}\n`
        content += `SUCCESSFUL: ${batchLogs.filter(L => L.includes("[SUCCESS]")).length}\n`
        content += `FAILED/ERROR: ${batchLogs.filter(L => L.includes("[FAILED]") || L.includes("[ERROR]")).length}\n\n`
        content += `FULL LOG:\n`
        batchLogs.forEach(L => {
            content += `${L}\n`
        })

        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `kortex-batch-fix-log-${new Date().toISOString().split('T')[0]}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const executeBatchFix = async () => {
        if (!results || !results.issues.length) return
        setShowBatchConfirm(false)

        // Determine targets: Selection or All
        const targets = selectedIndices.size > 0
            ? results.issues.filter((_, i) => selectedIndices.has(i))
            : results.issues

        // Filter fixable issues (must have resource ID)
        const fixableIssues = targets.filter(i => i.affected_resource_ids && i.affected_resource_ids.length > 0)

        if (fixableIssues.length === 0) {
            setToastMessage("No fixable issues found in selection (missing resource IDs).")
            setTimeout(() => setToastMessage(null), 3000)
            return
        }

        setIsBatchFixing(true)
        setBatchProgress({ current: 0, total: fixableIssues.length, currentIssueId: '' })
        setBatchLogs(["Starting Batch Remediation Process..."])

        const currentBatchLogs: string[] = []

        for (let i = 0; i < fixableIssues.length; i++) {
            const issue = fixableIssues[i]
            const resourceId = issue.affected_resource_ids[0]

            setBatchProgress({ current: i + 1, total: fixableIssues.length, currentIssueId: issue.title })
            const startLog = `[${i + 1}/${fixableIssues.length}] Starting fix for: ${issue.title} (${resourceId})...`
            setBatchLogs(prev => [...prev, startLog])
            currentBatchLogs.push(startLog)

            try {
                // 1. Start Fix Workflow
                const startRes = await startFix(clusterId, resourceId, issue.description)
                const workflowId = startRes.workflow_id

                // 2. Poll until complete
                let isDone = false
                while (!isDone) {
                    await new Promise(r => setTimeout(r, 2000)) // Wait 2s
                    const wfStatus = await getFixStatus(workflowId)

                    if (wfStatus.status === 'completed') {
                        const successLog = `[SUCCESS] Fixed: ${issue.title}`
                        setBatchLogs(prev => [...prev, successLog])
                        currentBatchLogs.push(successLog)
                        isDone = true
                    } else if (wfStatus.status === 'failed') {
                        const failedLog = `[FAILED] Could not fix: ${issue.title}`
                        setBatchLogs(prev => [...prev, failedLog])
                        currentBatchLogs.push(failedLog)
                        isDone = true
                    }
                }
            } catch (e) {
                console.error(e)
                const errorLog = `[ERROR] Exception fixing ${issue.title}: ${e}`
                setBatchLogs(prev => [...prev, errorLog])
                currentBatchLogs.push(errorLog)
            }
        }

        const completionLog = "Batch Process Completed."
        setBatchLogs(prev => [...prev, completionLog])
        currentBatchLogs.push(completionLog)
        setIsBatchFixing(false)

        // Save to History
        try {
            await axios.post(`http://localhost:8000/clusters/${clusterId}/history`, {
                action: "BATCH_FIX_COMPLETED",
                details: `Processed ${fixableIssues.length} issues.`,
                logs: currentBatchLogs // Use the collected logs for history
            })
        } catch (e) {
            console.error("Failed to save history", e)
        }

        setToastMessage("Batch Fix Completed. Check the logs for details.")
        setTimeout(() => setToastMessage(null), 5000)
        handleStartScan() // Auto rescan
    }

    const getSeverityColor = (sev: string) => {
        switch (sev.toUpperCase()) {
            case 'CRITICAL': return 'bg-red-500/20 text-red-500 border-red-500/50'
            case 'HIGH': return 'bg-orange-500/20 text-orange-500 border-orange-500/50'
            case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50'
            default: return 'bg-blue-500/20 text-blue-500 border-blue-500/50'
        }
    }

    return (
        <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden bg-background/50 backdrop-blur-sm relative">

            <ScanOptionsModal
                isOpen={showScanOptions}
                onClose={() => setShowScanOptions(false)}
                onConfirm={confirmStartScan}
            />

            {/* Batch Fix Overlay */}
            {isBatchFixing && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-10 animate-in fade-in duration-300">
                    <div className="w-[600px] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-primary/20 rounded-full">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Auto-Remediating Cluster</h2>
                                <p className="text-slate-400">Applying fixes sequentially via VCluster validation.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium text-slate-200">
                                <span>Progress</span>
                                <span>{batchProgress.current} / {batchProgress.total}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500"
                                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-400 animate-pulse">
                                Processing: {batchProgress.currentIssueId}
                            </p>
                        </div>

                        <div className="bg-black/50 p-4 rounded-md h-40 overflow-y-auto font-mono text-xs text-white/70 border border-white/5" ref={batchLogRef}>
                            {batchLogs.map((l, i) => (
                                <div key={i} className="py-0.5">{l}</div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <div>
                                {!isBatchFixing && (
                                    <div className="text-xs text-white/40 mt-1">
                                        Batch remediation completed.
                                    </div>
                                )}
                                {isBatchFixing && (
                                    <div className="text-xs text-white/40 mt-1">
                                        Currently processing: <span className="text-blue-400 font-mono">{batchProgress.currentIssueId}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {!isBatchFixing && (
                                    <button
                                        onClick={handleExportBatchLogs}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-white/10"
                                    >
                                        <Download size={14} /> Export Logs
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsBatchFixing(false)}
                                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    {isBatchFixing ? "Working..." : "Close Output"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight mb-1">Full Cluster Analysis</h2>
                    <p className="text-slate-400">Deep scan of all resources for security, performance, and best practices.</p>
                </div>
                {status === 'idle' || status === 'completed' || status === 'failed' || status === 'stopped' ? (
                    <button
                        onClick={handleStartScan}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Play size={18} fill="currentColor" />
                        {status === 'stopped' ? 'Resume / New Scan' : 'Start New Scan'}
                    </button>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
                            <Loader2 className="animate-spin text-primary" size={20} />
                            <span className="font-mono text-sm text-slate-200">
                                {status === 'initializing' ? 'Initializing Map...' : `Scanning... ${progress}%`}
                            </span>
                        </div>
                        <button
                            onClick={handleStopScan}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded-md transition-colors border border-red-500/20"
                            title="Stop Analysis"
                        >
                            <Octagon size={18} />
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-6 overflow-hidden">

                {/* Left: Results or Empty State */}
                <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 shadow-inner">
                    {(status === 'idle' || status === 'stopped') && !results && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-10 text-center">
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <Shield className="w-10 h-10 text-primary" />
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2">
                                {status === 'stopped' ? 'Scan Stopped' : 'Ready to Scan'}
                            </h3>
                            <p className="max-w-md text-slate-400">
                                {status === 'stopped'
                                    ? 'The analysis was stopped by the user. Click "Resume / New Scan" to restart.'
                                    : 'Kortex will analyze every resource in your cluster (Deployment, Service, Ingress, etc.) using AI to detect potential issues and relationship gaps.'}
                            </p>
                        </div>
                    )}

                    {/* Loading / Initialization State */}
                    {((['initializing', 'fetching_resources'].includes(status)) || (status === 'analyzing' && mapResources.length === 0)) && !results && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
                            <div className="mb-8 p-6 rounded-full bg-primary/5 relative">
                                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-primary">
                                    {progress}%
                                </div>
                            </div>
                            <h3 className="text-xl text-white font-medium mb-3 capitalize">
                                {status === 'fetching_resources' ? 'Fetching Cluster Resources...' : 'Building Analysis Map...'}
                            </h3>
                            <p className="text-sm opacity-70 mb-8 max-w-sm text-center">
                                {status === 'fetching_resources'
                                    ? 'Contacting Kubernetes API to retrieve resource definitions...'
                                    : 'Preparing visualization and starting intelligence engine...'}
                            </p>

                            {/* Loading Progress Bar */}
                            <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500 ease-out"
                                    style={{ width: `${Math.max(5, progress)}%` }} // Always show a little bit
                                />
                            </div>
                        </div>
                    )}

                    {/* Active Scan Map View */}
                    {(status !== 'idle' && status !== 'completed' && status !== 'failed' && status !== 'stopped') && !results && mapResources.length > 0 && (
                        <div className="flex-1 flex flex-col h-full bg-slate-950 p-4 relative">
                            {/* Real-time Map */}
                            <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                                <ClusterGraph
                                    resources={mapResources}
                                    statusMap={mapStatus}
                                    dependencyLevel={1}
                                    isLoading={true} // Hint to graph
                                />

                                {/* Overlay Stats */}
                                <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-lg z-10 shadow-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full border-4 border-slate-700 flex items-center justify-center">
                                                <span className="text-xs font-bold text-white">{progress}%</span>
                                            </div>
                                            <svg className="absolute top-0 left-0 w-12 h-12 transform -rotate-90 pointer-events-none">
                                                <circle
                                                    cx="24" cy="24" r="22"
                                                    stroke="currentColor" strokeWidth="4" fill="transparent"
                                                    className="text-primary"
                                                    strokeDasharray={138}
                                                    strokeDashoffset={138 - (138 * progress) / 100}
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white capitalize">{status.replace('_', ' ')}...</h4>
                                            <p className="text-xs text-slate-400">
                                                {Object.values(mapStatus).filter(s => s === 'analyzed').length} / {mapResources.length} Analyzed
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {results && (
                        <div className="flex flex-col h-full bg-slate-900/50">
                            {/* Summary Header */}
                            <div className="p-6 border-b border-slate-800 bg-slate-900">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-lg ${results.issues.length > 0 ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>
                                        {results.issues.length > 0 ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-white">{results.summary}</h3>
                                        <p className="text-sm text-slate-400 mt-1">Scan completed on {new Date().toLocaleString()}</p>
                                    </div>
                                    <button
                                        onClick={handleGenerateReport}
                                        className="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md border border-slate-700 transition-colors flex items-center gap-2"
                                    >
                                        <FileText size={16} />
                                        Generate Report
                                    </button>
                                </div>
                                <div className="flex gap-4 mt-6">
                                    <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-md border border-slate-800 flex-1">
                                        <div className="text-2xl font-bold text-red-500">{results.issues.filter(i => i.severity === 'CRITICAL').length}</div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Critical</div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-md border border-slate-800 flex-1">
                                        <div className="text-2xl font-bold text-orange-500">{results.issues.filter(i => i.severity === 'HIGH').length}</div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">High</div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-md border border-slate-800 flex-1">
                                        <div className="text-2xl font-bold text-yellow-500">{results.issues.filter(i => i.severity === 'MEDIUM').length}</div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Medium</div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-md border border-slate-800 flex-1">
                                        <div className="text-2xl font-bold text-blue-500">{results.issues.filter(i => i.severity === 'LOW').length}</div>
                                        <div className="text-xs text-slate-500 uppercase font-bold">Low</div>
                                    </div>
                                </div>
                            </div>

                            {/* Issues List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                <div className="flex items-center justify-between px-2 mb-2">
                                    <h4 className="font-bold pb-2 text-sm text-slate-400">Detected Issues</h4>
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        {selectedIndices.size === results.issues.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>

                                {results.issues.map((issue, idx) => (
                                    <div key={idx} className={`group bg-slate-900/50 border hover:border-primary/50 transition-all rounded-lg p-4 shadow-sm relative ${selectedIndices.has(idx) ? 'border-primary ring-1 ring-primary/20' : 'border-slate-800'}`}>
                                        <div className="flex items-start gap-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIndices.has(idx)}
                                                onChange={() => toggleIssueSelection(idx)}
                                                className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityColor(issue.severity)}`}>
                                                        {issue.severity}
                                                    </span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-400 border-slate-700">
                                                        {issue.category}
                                                    </span>
                                                    <span className="text-sm font-mono text-slate-500">
                                                        {issue.affected_resource_ids?.[0] || "Global"}
                                                    </span>
                                                </div>
                                                <h4 className="font-medium text-white">{issue.title}</h4>
                                                <p className="text-sm text-slate-400 mt-1 line-clamp-2 group-hover:line-clamp-none transition-all">
                                                    {issue.description}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleFixClick(issue)}
                                                className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-sm font-medium transition-colors"
                                            >
                                                <Wrench size={14} />
                                                Fix with IA
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer Actions */}
                            {results.issues.length > 0 && (
                                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
                                    <div className="text-sm text-slate-400">
                                        {selectedIndices.size > 0
                                            ? `${selectedIndices.size} issues selected`
                                            : "Select issues to fix locally or individually"
                                        }
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleBatchFix}
                                            disabled={selectedIndices.size === 0}
                                            className={`px-4 py-2 text-white rounded-md font-medium transition-colors shadow-lg flex items-center gap-2 ${selectedIndices.size > 0
                                                ? 'bg-primary hover:bg-primary/90 shadow-primary/20'
                                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                }`}
                                        >
                                            <Shield size={16} />
                                            {selectedIndices.size > 0 ? `Fix ${selectedIndices.size} Selected` : 'Select Issues to Fix'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right/Bottom: Logs Terminal */}
                <div className={`flex flex-col border border-slate-800 rounded-xl bg-black/90 shadow-2xl transition-all duration-300 ${status === 'idle' && !results ? 'w-[300px]' : 'w-[400px]'}`}>
                    <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5">
                        <div className="flex items-center gap-2 text-sm font-mono text-slate-400">
                            <Terminal size={14} />
                            <span>Scan Logs</span>
                        </div>
                        <div className="flex gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                        </div>
                    </div>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 custom-scrollbar pr-2">
                        {logs.length === 0 && <span className="text-white/30 italic">Waiting for logs...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className="break-all text-white/80 border-l-2 border-transparent hover:border-primary pl-2 transition-colors">
                                <span className="text-white/40 opacity-50 select-none mr-2">{log.timestamp}</span>
                                {log.message}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Fix Modal */}
            {selectedIssue && (
                <FixModal
                    isOpen={fixModalOpen}
                    onClose={() => setFixModalOpen(false)}
                    clusterId={clusterId}
                    issue={{
                        id: 'scan-issue',
                        resourceId: selectedIssue.affected_resource_ids?.[0],
                        title: selectedIssue.title,
                        description: selectedIssue.description
                    }}
                />
            )}

            {/* Batch Fix Confirmation Modal */}
            {showBatchConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-4 mb-4 text-primary">
                            <div className="p-3 bg-primary/10 rounded-full">
                                <Shield size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-white">Confirm Batch Fix</h3>
                        </div>

                        <p className="text-slate-300 mb-6 leading-relaxed">
                            You are about to attempt to fix <strong>{selectedIndices.size > 0 ? selectedIndices.size : results?.issues.length}</strong> issues sequentially.
                            This process will use AI to generate and apply fixes. This may take some time depending on the number of resources.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={executeBatchFix}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-all shadow-lg shadow-primary/20"
                            >
                                Start Remediation
                            </button>
                            <button
                                onClick={() => setShowBatchConfirm(false)}
                                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global/Context Message Toast */}
            {toastMessage && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className="bg-primary text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-medium border border-white/20">
                        <CheckCircle2 size={20} />
                        {toastMessage}
                    </div>
                </div>
            )}
        </div>
    )
}
