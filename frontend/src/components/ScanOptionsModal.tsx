import { useState } from 'react'
import { X, Play, Shield, Zap, Filter } from 'lucide-react'

interface ScanOptionsModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (scanType: 'full' | 'smart', filters?: string[]) => void
}

const RESOURCE_TYPES = [
    "Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob",
    "Service", "Ingress",
    "ConfigMap", "Secret",
    "PersistentVolumeClaim", "PersistentVolume",
    "ServiceAccount", "Role", "RoleBinding", "ClusterRole", "ClusterRoleBinding"
]

export default function ScanOptionsModal({ isOpen, onClose, onConfirm }: ScanOptionsModalProps) {
    const [scanType, setScanType] = useState<'full' | 'smart'>('full')
    const [selectedFilters, setSelectedFilters] = useState<string[]>([])

    if (!isOpen) return null

    const toggleFilter = (type: string) => {
        if (selectedFilters.includes(type)) {
            setSelectedFilters(selectedFilters.filter(t => t !== type))
        } else {
            setSelectedFilters([...selectedFilters, type])
        }
    }

    const toggleAllFilters = () => {
        if (selectedFilters.length === RESOURCE_TYPES.length) {
            setSelectedFilters([])
        } else {
            setSelectedFilters([...RESOURCE_TYPES])
        }
    }

    const handleStart = () => {
        onConfirm(scanType, scanType === 'smart' && selectedFilters.length > 0 ? selectedFilters : undefined)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card w-[600px] border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Shield className="text-primary" />
                            Start New Analysis
                        </h2>
                        <p className="text-muted-foreground text-sm">Select the scope of your security scan.</p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">

                    {/* Scan Types */}
                    <div className="space-y-4 mb-8">
                        <div
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${scanType === 'full'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                            onClick={() => setScanType('full')}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scanType === 'full' ? 'border-primary' : 'border-muted-foreground'}`}>
                                    {scanType === 'full' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                </div>
                                <h3 className="font-semibold text-lg">Full Cluster Scan</h3>
                            </div>
                            <p className="text-sm text-muted-foreground ml-8">
                                Analyzes every single resource in the cluster. Best for initial assessment or thorough audits.
                            </p>
                        </div>

                        <div
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${scanType === 'smart'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                            onClick={() => setScanType('smart')}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${scanType === 'smart' ? 'border-primary' : 'border-muted-foreground'}`}>
                                    {scanType === 'smart' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                </div>
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    Smart Incremental Scan
                                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Recommended</span>
                                </h3>
                            </div>
                            <p className="text-sm text-muted-foreground ml-8">
                                Only analyzes resources that are new or have changed since the last scan. Can be filtered by type.
                            </p>
                        </div>
                    </div>

                    {/* Filters (only for smart scan) */}
                    {scanType === 'smart' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium flex items-center gap-2">
                                    <Filter size={16} />
                                    Resource Filters (Optional)
                                </h4>
                                <button
                                    onClick={toggleAllFilters}
                                    className="text-xs text-primary hover:underline"
                                >
                                    {selectedFilters.length === RESOURCE_TYPES.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {RESOURCE_TYPES.map(type => (
                                    <div
                                        key={type}
                                        onClick={() => toggleFilter(type)}
                                        className={`px-3 py-2 rounded-md text-sm border cursor-pointer flex items-center justify-between transition-colors ${selectedFilters.includes(type)
                                                ? 'bg-primary/10 border-primary/40 text-primary-foreground'
                                                : 'bg-secondary/30 border-border opacity-70 hover:opacity-100'
                                            }`}
                                    >
                                        {type}
                                        {selectedFilters.includes(type) && <Zap size={14} className="text-primary" />}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                * If no filters are selected, all changed resources will be scanned.
                            </p>
                        </div>
                    )}

                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-secondary/20">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStart}
                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-medium flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        <Play size={18} fill="currentColor" />
                        Start Analysis
                    </button>
                </div>

            </div>
        </div>
    )
}
