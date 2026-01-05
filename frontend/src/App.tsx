import { useState, useEffect } from 'react'
import axios from 'axios'
import { Layout, Server, Activity, Settings, ChevronRight, ChevronLeft } from 'lucide-react'
import ClusterGraph from './components/ClusterGraph'
import ActivityLog from './components/ActivityLog'
import ClusterWizard from './components/ClusterWizard'
import SettingsModal from './components/SettingsModal'

function App() {
    const [activeTab, setActiveTab] = useState<'graph' | 'analysis'>('graph')
    const [isConnected, setIsConnected] = useState(false)
    const [clusterName, setClusterName] = useState('')
    const [activeClusterId, setActiveClusterId] = useState('')
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [dependencyLevel, setDependencyLevel] = useState(1)

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await axios.get('http://localhost:8000/settings');
            if (res.data.dependency_level) {
                setDependencyLevel(res.data.dependency_level);
            }
        } catch (e) {
            console.error("Failed to fetch settings", e);
        }
    };

    const handleConnect = (id: string, name: string) => {
        setClusterName(name);
        setActiveClusterId(id);
        setIsConnected(true);
    }

    const handleSettingsSaved = () => {
        fetchSettings();
        setIsSettingsOpen(false);
    }

    if (!isConnected) {
        return (
            <div className="flex flex-col h-screen w-full bg-background text-foreground">
                <header className="flex items-center justify-between h-16 px-6 border-b border-border">
                    <div className="flex items-center">
                        <Layout className="w-6 h-6 mr-2 text-primary" />
                        <h1 className="text-xl font-bold tracking-tight">Kortex</h1>
                    </div>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                        title="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </header>
                <main className="flex-1 p-6 relative">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
                    <div className="relative z-10 w-full h-full flex items-start justify-center">
                        <ClusterWizard onConnect={handleConnect} />
                    </div>
                </main>
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={handleSettingsSaved} />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card/50 backdrop-blur-sm z-50">
                <div className="flex items-center gap-2">
                    <Layout className="w-6 h-6 text-primary" />
                    <h1 className="text-xl font-bold tracking-tight">Kortex <span className="text-xs font-normal text-muted-foreground ml-2">v0.1.0</span></h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Connected: {clusterName}
                    </div>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                        title="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">
                {/* Graph Area */}
                <div className="flex-1 relative border-r border-border">
                    <ClusterGraph dependencyLevel={dependencyLevel} />
                    {/* Overlay Tools */}
                    <div className="absolute top-4 left-4 bg-card/90 p-2 rounded-md border border-border shadow-lg">
                        <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Filters</h3>
                        <div className="flex gap-2">
                            <button className="text-xs px-2 py-1 bg-primary/20 text-primary rounded">Deployments</button>
                            <button className="text-xs px-2 py-1 hover:bg-muted text-muted-foreground rounded">Services</button>
                            <button className="text-xs px-2 py-1 hover:bg-muted text-muted-foreground rounded">Ingress</button>
                        </div>
                    </div>
                </div>

                {/* Sidebar / Dashboard */}
                <div
                    className={`${isSidebarOpen ? 'w-[400px]' : 'w-0'} flex flex-col bg-card/30 backdrop-blur-md transition-all duration-300 ease-in-out relative border-l border-border`}
                >
                    {/* Toggle Button */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="absolute top-4 -left-8 bg-card border border-border p-1.5 rounded-l-md text-muted-foreground hover:text-foreground shadow-md transition-colors z-50 flex items-center justify-center"
                        style={{ width: '32px', height: '32px' }}
                    >
                        {isSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>

                    <div className="w-[400px] flex flex-col h-full">
                        <div className="flex items-center border-b border-border">
                            <div
                                className={`flex-1 flex items-center justify-center py-3 text-sm font-medium border-b-2 transition-colors border-primary text-primary`}
                            >
                                <Activity className="w-4 h-4 mr-2" />
                                Activity Log
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative">
                            {isSidebarOpen && <ActivityLog clusterId={activeClusterId} />}
                        </div>
                    </div>
                </div>
            </main>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    )
}

export default App
