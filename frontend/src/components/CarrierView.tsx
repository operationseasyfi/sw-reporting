import React, { useState, useEffect } from 'react';
import { Badge } from '../ui/Badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Globe, Server, RefreshCw } from 'lucide-react';

interface CarrierStat {
  name: string;
  deliveryRate: number;
  volume: number;
  status: 'operational' | 'degraded' | 'critical';
}

export const CarrierView: React.FC = () => {
  const [carriers, setCarriers] = useState<CarrierStat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCarriers = async () => {
    try {
      const res = await fetch('/api/stats/carriers');
      const data = await res.json();
      setCarriers(data);
    } catch (err) {
      console.error("Failed to fetch carrier stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCarriers();
    const interval = setInterval(fetchCarriers, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const totalCarriers = carriers.length;
  const degradedCount = carriers.filter(c => c.status === 'degraded' || c.status === 'critical').length;
  const totalVolume = carriers.reduce((sum, c) => sum + c.volume, 0);
  const avgDeliveryRate = carriers.length > 0 
    ? carriers.reduce((sum, c) => sum + c.deliveryRate, 0) / carriers.length 
    : 0;

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex justify-between items-end border-b border-white/10 pb-4">
        <div>
           <h2 className="text-2xl font-display font-bold text-white mb-2">Carrier Network Status</h2>
           <p className="text-gray-400 text-sm font-mono">Global delivery performance monitoring across tier-1 aggregators.</p>
        </div>
        <div className="flex gap-4 items-center">
            <button 
              onClick={fetchCarriers}
              disabled={loading}
              className="px-3 py-1 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue text-xs font-bold uppercase tracking-wider rounded hover:bg-neon-blue/20 transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={14} /> : 'Refresh'}
            </button>
            <div className="flex gap-2">
                <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase font-mono">Total Carriers</div>
                    <div className="text-xl font-bold text-neon-blue">{totalCarriers}</div>
                </div>
                 <div className="w-[1px] bg-white/10 h-10 mx-4"></div>
                 <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase font-mono">Degraded</div>
                    <div className="text-xl font-bold text-neon-amber">{degradedCount}</div>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-80">
        {/* Chart */}
        <div className="glass-panel p-4 rounded-xl">
           <h3 className="text-xs font-bold uppercase text-gray-400 mb-4 flex items-center gap-2">
             <Server size={14} /> Delivery Success Rate (%)
           </h3>
           <ResponsiveContainer width="100%" height="90%">
             {carriers.length > 0 ? (
               <BarChart data={carriers} layout="vertical" margin={{ left: 40 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" stroke="#666" fontSize={12} width={80} />
                  <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      contentStyle={{ backgroundColor: '#050505', borderColor: '#333', color: '#fff' }}
                  />
                  <Bar dataKey="deliveryRate" barSize={20} radius={[0, 4, 4, 0]}>
                    {carriers.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.deliveryRate > 98 ? '#0aff0a' : entry.deliveryRate > 94 ? '#ffae00' : '#ff003c'} />
                    ))}
                  </Bar>
               </BarChart>
             ) : (
               <div className="flex items-center justify-center h-full text-gray-500">
                 {loading ? 'Loading...' : 'No carrier data available'}
               </div>
             )}
           </ResponsiveContainer>
        </div>

        {/* Globe Placeholder / Metric Map */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-center relative overflow-hidden">
           <div className="absolute inset-0 opacity-20 flex items-center justify-center pointer-events-none">
              <Globe size={200} className="text-neon-blue animate-pulse-slow" />
           </div>
           <div className="grid grid-cols-2 gap-8 z-10">
               <div className="text-center">
                 <div className="text-4xl font-display font-bold text-white">{totalVolume.toLocaleString()}</div>
                 <div className="text-xs font-mono text-gray-500 uppercase mt-1">Total Volume (24h)</div>
               </div>
               <div className="text-center">
                 <div className="text-4xl font-display font-bold text-white">{avgDeliveryRate.toFixed(1)}%</div>
                 <div className="text-xs font-mono text-gray-500 uppercase mt-1">Global Success Rate</div>
               </div>
           </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-[10px] uppercase text-gray-400 font-mono">
              <th className="p-4">Carrier Name</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Delivery Rate</th>
              <th className="p-4 text-right">Latency (ms)</th>
              <th className="p-4 text-right">Volume (24h)</th>
            </tr>
          </thead>
          <tbody className="text-sm font-mono text-gray-300">
            {carriers.length > 0 ? (
              carriers.map((carrier) => (
                <tr key={carrier.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-white">{carrier.name}</td>
                  <td className="p-4">
                    <Badge variant={carrier.status === 'operational' ? 'success' : carrier.status === 'degraded' ? 'warning' : 'error'}>
                      {carrier.status}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                      <span className={carrier.deliveryRate < 95 ? 'text-neon-amber' : 'text-neon-green'}>
                          {carrier.deliveryRate}%
                      </span>
                  </td>
                  <td className="p-4 text-right">—</td>
                  <td className="p-4 text-right">{carrier.volume.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  {loading ? 'Loading carrier data...' : 'No carrier data available'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

