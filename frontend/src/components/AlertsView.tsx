import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, Bell, CheckCircle, RefreshCw } from 'lucide-react';

interface AlertData {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    timestamp: string;
    active: boolean;
}

export const AlertsView: React.FC = () => {
    const [alerts, setAlerts] = useState<AlertData[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        try {
            const res = await fetch('/api/alerts');
            const data = await res.json();
            setAlerts(data);
        } catch (err) {
            console.error("Failed to fetch alerts", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        // Poll every 30 seconds
        const interval = setInterval(fetchAlerts, 30000);
        return () => clearInterval(interval);
    }, []);

  return (
    <div className="p-6 h-full overflow-y-auto max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
                <h2 className="text-2xl font-display font-bold text-white">Active System Alerts</h2>
                {loading && <RefreshCw className="animate-spin text-neon-blue" size={16} />}
            </div>
            <button 
                onClick={fetchAlerts}
                className="px-4 py-2 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue text-xs font-bold uppercase tracking-wider rounded hover:bg-neon-blue/20 transition-colors">
                Refresh Analysis
            </button>
        </div>

        <div className="space-y-4">
            {alerts.length === 0 && !loading && (
                <div className="text-center p-10 glass-panel rounded-lg border border-white/5">
                    <CheckCircle className="mx-auto text-neon-green mb-3" size={32} />
                    <p className="text-gray-400">All systems normal. No active alerts.</p>
                </div>
            )}

            {alerts.map(alert => (
                <div key={alert.id} className="glass-panel p-5 rounded-lg border-l-4 border-l-neon-red flex items-start gap-4 hover:bg-white/5 transition-colors cursor-pointer group">
                    <div className={`p-2 rounded bg-opacity-20 ${alert.severity === 'critical' ? 'bg-neon-red text-neon-red' : 'bg-neon-amber text-neon-amber'}`}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wide group-hover:text-neon-blue transition-colors">{alert.title}</h3>
                            <span className="text-xs font-mono text-gray-500">{alert.timestamp}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{alert.description}</p>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-white/10 rounded text-xs text-white hover:bg-white/20 transition-all">
                        Investigate
                    </button>
                </div>
            ))}

            {/* Past Alerts */}
             <div className="mt-8 pt-8 border-t border-white/5">
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-4">Resolved Incidents (Last 24h)</h3>
                <div className="glass-panel p-4 rounded-lg flex items-center gap-4 opacity-60">
                    <div className="p-2 bg-neon-green/10 text-neon-green rounded">
                        <CheckCircle size={16} />
                    </div>
                    <div>
                        <div className="text-sm text-gray-300 font-bold">Throughput Degradation - Route B</div>
                        <div className="text-xs text-gray-500 font-mono">Resolved 4 hours ago</div>
                    </div>
                </div>
             </div>
        </div>
    </div>
  );
};

