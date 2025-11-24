import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw } from 'lucide-react';

interface LatencyData {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  distribution: Array<{
    time: string;
    p50: number;
    p95: number;
    p99: number;
  }>;
}

export const LatencyView: React.FC = () => {
  const [latencyData, setLatencyData] = useState<LatencyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatency = async () => {
    try {
      const res = await fetch('/api/stats/latency');
      const data = await res.json();
      setLatencyData(data);
    } catch (err) {
      console.error("Failed to fetch latency stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatency();
    const interval = setInterval(fetchLatency, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const chartData = latencyData?.distribution || [];

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-display font-bold text-white">Latency Telemetry</h2>
        <button 
          onClick={fetchLatency}
          disabled={loading}
          className="px-3 py-1 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue text-xs font-bold uppercase tracking-wider rounded hover:bg-neon-blue/20 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>
      
      <div className="glass-panel p-6 rounded-xl h-[500px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold uppercase text-gray-400 tracking-widest">Global Latency Distribution (ms)</h3>
            <div className="flex gap-4">
                <div className="flex items-center text-xs font-mono text-neon-green">
                    <div className="w-3 h-1 bg-neon-green mr-2"></div> P50
                </div>
                <div className="flex items-center text-xs font-mono text-neon-amber">
                    <div className="w-3 h-1 bg-neon-amber mr-2"></div> P95
                </div>
                <div className="flex items-center text-xs font-mono text-neon-red">
                    <div className="w-3 h-1 bg-neon-red mr-2"></div> P99
                </div>
            </div>
        </div>
        
        <div className="flex-1">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#666" tick={{fontSize: 12, fill: '#888'}} />
                <YAxis stroke="#666" tick={{fontSize: 12, fill: '#888'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#050505', borderColor: '#333', color: '#fff' }}
                  itemStyle={{ fontSize: 12 }}
                />
                <Line type="monotone" dataKey="p99" stroke="#ff003c" strokeWidth={1} dot={false} activeDot={{r: 4}} />
                <Line type="monotone" dataKey="p95" stroke="#ffae00" strokeWidth={1} dot={false} activeDot={{r: 4}} />
                <Line type="monotone" dataKey="p50" stroke="#0aff0a" strokeWidth={2} dot={false} activeDot={{r: 4}} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {loading ? 'Loading latency data...' : 'No latency data available'}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
          <div className="glass-panel p-4 rounded-xl text-center">
              <div className="text-gray-500 text-xs uppercase font-mono mb-2">P50 (Median)</div>
              <div className="text-white text-xl font-bold">{latencyData ? `${Math.round(latencyData.p50)}ms` : '—'}</div>
              <div className="text-neon-green text-sm font-mono mt-1">50th percentile</div>
          </div>
          <div className="glass-panel p-4 rounded-xl text-center">
              <div className="text-gray-500 text-xs uppercase font-mono mb-2">P95</div>
              <div className="text-white text-xl font-bold">{latencyData ? `${Math.round(latencyData.p95)}ms` : '—'}</div>
              <div className="text-neon-amber text-sm font-mono mt-1">95th percentile</div>
          </div>
          <div className="glass-panel p-4 rounded-xl text-center">
              <div className="text-gray-500 text-xs uppercase font-mono mb-2">P99</div>
              <div className="text-white text-xl font-bold">{latencyData ? `${Math.round(latencyData.p99)}ms` : '—'}</div>
              <div className="text-neon-red text-sm font-mono mt-1">99th percentile</div>
          </div>
      </div>
    </div>
  );
};

