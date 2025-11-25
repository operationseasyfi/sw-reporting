import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from 'recharts';
import { Activity, Zap, AlertTriangle, DollarSign, Users, RefreshCw, TrendingUp, TrendingDown, Shield, MessageSquare } from 'lucide-react';
import { LogStream } from './LogStream';
import { LogEntry, TimeSeriesPoint, ErrorCluster } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface OverviewStats {
  totalVolume: number;
  delivered: number;
  failed: number;
  successRate: number;
  spend: number;
  activeSegments: number;
  avgLatency: number;
}

interface OptOutStats {
  delivered: number;
  defaultCount: number;
  defaultRate: number;
  defaultKeywords: string[];
  customCount: number;
  customRate: number;
  customKeywords: string[];
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  samples: number;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

const fetchJSON = async <T,>(url: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`Failed to fetch ${url}:`, e);
    return fallback;
  }
};

const fetchLogs = (startDate?: string, endDate?: string, limit: number = 100): Promise<LogEntry[]> => {
  let url = `/api/logs_dt?draw=1&start=0&length=${limit}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;
  
  return fetchJSON<any>(url, { data: [] })
    .then(data => data.data?.map((row: any) => ({
      id: row.id,
      timestamp: row.date_created,
      from: row.from_number,
      to: row.to_number,
      carrier: '—',
      status: (row.status || 'UNKNOWN').toUpperCase(),
      errorCode: row.error_code ? String(row.error_code) : undefined,
      latency: row.date_created && row.date_sent 
        ? Math.max(new Date(row.date_sent).getTime() - new Date(row.date_created).getTime(), 0) 
        : undefined,
      type: row.body?.length > 160 ? 'MMS' : 'SMS',
      direction: row.direction === 'inbound' ? 'MO' : 'MT',
      cost: row.price || 0,
      body: row.body
    })) || []);
};

const fetchTimeSeries = (): Promise<TimeSeriesPoint[]> =>
  fetchJSON<Record<string, any>>('/api/stats/timeseries', {})
    .then(data => Object.keys(data).sort().map(dateStr => ({
      time: dateStr,
      throughput: data[dateStr].total || 0,
      latency: data[dateStr].latencyAvg || 0,
      errors: data[dateStr].failed || 0
    })));

const fetchErrorClusters = (): Promise<ErrorCluster[]> =>
  fetchJSON<ErrorCluster[]>('/api/stats/errors', []);

const fetchOverview = (): Promise<OverviewStats> =>
  fetchJSON('/api/stats/overview', {
    totalVolume: 0, delivered: 0, failed: 0, successRate: 0, 
    spend: 0, activeSegments: 0, avgLatency: 0
  });

const fetchOptOuts = (): Promise<OptOutStats> =>
  fetchJSON('/api/stats/optouts', {
    delivered: 0, defaultCount: 0, defaultRate: 0, defaultKeywords: [],
    customCount: 0, customRate: 0, customKeywords: []
  });

const fetchLatencyStats = (): Promise<LatencyStats> =>
  fetchJSON('/api/stats/latency', { p50: 0, p95: 0, p99: 0, samples: 0 });

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export const Dashboard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chartData, setChartData] = useState<TimeSeriesPoint[]>([]);
  const [hoveredCluster, setHoveredCluster] = useState<ErrorCluster | null>(null);
  const [errorClusters, setErrorClusters] = useState<ErrorCluster[]>([]);
  const [overview, setOverview] = useState<OverviewStats>({
    totalVolume: 0, delivered: 0, failed: 0, successRate: 0,
    spend: 0, activeSegments: 0, avgLatency: 0
  });
  const [optouts, setOptouts] = useState<OptOutStats>({
    delivered: 0, defaultCount: 0, defaultRate: 0, defaultKeywords: [],
    customCount: 0, customRate: 0, customKeywords: []
  });
  const [latencyStats, setLatencyStats] = useState<LatencyStats>({ p50: 0, p95: 0, p99: 0, samples: 0 });
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load dashboard stats
  const loadStats = useCallback(async () => {
    setLoading(true);
    const [series, clusters, overviewData, optoutData, latencyData] = await Promise.all([
      fetchTimeSeries(),
      fetchErrorClusters(),
      fetchOverview(),
      fetchOptOuts(),
      fetchLatencyStats()
    ]);
    setChartData(series);
    setErrorClusters(clusters);
    setOverview(overviewData);
    setOptouts(optoutData);
    setLatencyStats(latencyData);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  // Load logs with optional date filter
  const loadLogs = useCallback(async (startDate?: string, endDate?: string) => {
    setLogsLoading(true);
    const logsData = await fetchLogs(startDate, endDate, 100);
    setLogs(logsData);
    setLogsLoading(false);
  }, []);

  // Handle date filter from LogStream
  const handleDateFilter = useCallback((startDate: string, endDate: string) => {
    loadLogs(startDate, endDate);
  }, [loadLogs]);

  // Initial load
  useEffect(() => {
    loadStats();
    loadLogs();
  }, [loadStats, loadLogs]);

  // Periodic refresh of stats (not logs - those are fetched on demand)
  useEffect(() => {
    const interval = setInterval(loadStats, 60000); // Refresh stats every minute
    return () => clearInterval(interval);
  }, [loadStats]);

  // Treemap custom renderer
  const TreemapCell = (props: any) => {
    const { x, y, width, height, payload, name } = props;
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      critical: { bg: 'rgba(255,0,60,0.25)', border: '#ff003c', text: '#ff003c' },
      high: { bg: 'rgba(255,174,0,0.2)', border: '#ffae00', text: '#ffae00' },
      medium: { bg: 'rgba(0,240,255,0.15)', border: '#00f0ff', text: '#00f0ff' },
      low: { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.3)', text: '#888' }
    };
    const c = colors[payload?.severity] || colors.low;

    return (
      <g>
        <rect
          x={x} y={y} width={width} height={height}
          fill={c.bg} stroke={c.border} strokeWidth={1.5}
          className="cursor-pointer transition-all hover:brightness-125"
          onMouseEnter={() => setHoveredCluster(payload)}
          onMouseLeave={() => setHoveredCluster(null)}
        />
        {width > 45 && height > 35 && (
          <>
            <text x={x + width/2} y={y + height/2 - 6} textAnchor="middle" 
                  fill={c.text} fontSize={13} fontWeight="bold" className="font-mono">
              {name}
            </text>
            <text x={x + width/2} y={y + height/2 + 10} textAnchor="middle" 
                  fill="rgba(255,255,255,0.5)" fontSize={10} className="font-mono">
              {payload?.count?.toLocaleString()}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col gap-5 p-5 pb-24 min-h-full">
      
      {/* HEADER BAR */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">SignalWire Analytics</h1>
          <p className="text-xs text-gray-500 font-mono">
            {lastUpdate ? `Last updated: ${lastUpdate.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => { loadStats(); loadLogs(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 
                     text-sm text-gray-300 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* VOLUME CHART */}
      <section className="glass-panel rounded-2xl overflow-hidden h-[220px] relative">
        <div className="absolute top-4 left-5 z-10 flex gap-8">
          <div>
            <div className="text-[10px] uppercase text-gray-500 tracking-widest mb-1">24h Volume</div>
            <div className="text-3xl font-bold text-white">
              {overview.totalVolume.toLocaleString()}
              <span className="text-sm text-neon-blue ml-2 font-normal">msgs</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 tracking-widest mb-1">Avg Latency</div>
            <div className="text-3xl font-bold text-white">
              {Math.round(overview.avgLatency)}
              <span className="text-sm text-neon-amber ml-2 font-normal">ms</span>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 opacity-20 grid-bg"></div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 80, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="throughputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.4}/>
                <stop offset="100%" stopColor="#00f0ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 8 }}
              labelStyle={{ color: '#888' }}
              itemStyle={{ color: '#00f0ff' }}
            />
            <Area type="monotone" dataKey="throughput" stroke="#00f0ff" strokeWidth={2}
                  fill="url(#throughputGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Activity />} label="Success Rate" 
                 value={`${overview.successRate.toFixed(1)}%`} 
                 color="green" trend={overview.successRate > 80 ? 'up' : 'down'} />
        <KPICard icon={<DollarSign />} label="Spend (24h)" 
                 value={`$${overview.spend.toFixed(2)}`} color="amber" />
        <KPICard icon={<AlertTriangle />} label="Failed" 
                 value={overview.failed.toLocaleString()} color="red" />
        <KPICard icon={<Users />} label="Recipients" 
                 value={overview.activeSegments.toLocaleString()} color="blue" />
      </div>

      {/* ERROR TREEMAP */}
      <section className="glass-panel rounded-2xl p-5 min-h-[240px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-neon-red flex items-center gap-2">
            <Zap size={16} /> Error Code Analysis
          </h3>
          {hoveredCluster && (
            <span className="text-xs text-white/70 font-mono animate-pulse">
              Error {hoveredCluster.code}: {hoveredCluster.count?.toLocaleString()} occurrences
            </span>
          )}
        </div>
        {errorClusters.length > 0 ? (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={errorClusters} dataKey="count" stroke="#0a0a0a" content={<TreemapCell />} />
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
            No errors detected — looking good! ✓
          </div>
        )}
      </section>

      {/* OPT-OUT METERS + LATENCY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <OptOutMeter
          title="Standard Opt-Outs"
          subtitle="STOP • UNSUBSCRIBE"
          icon={<Shield size={18} />}
          count={optouts.defaultCount}
          rate={optouts.defaultRate}
          delivered={optouts.delivered}
          keywords={optouts.defaultKeywords}
          color="blue"
        />
        <OptOutMeter
          title="Custom Opt-Outs"
          subtitle="Extended keyword watch"
          icon={<MessageSquare size={18} />}
          count={optouts.customCount}
          rate={optouts.customRate}
          delivered={optouts.delivered}
          keywords={optouts.customKeywords}
          color="amber"
        />
        <LatencyCard stats={latencyStats} />
      </div>

      {/* MESSAGE FEED */}
      <section className="flex-1 min-h-[400px]">
        <LogStream 
          logs={logs} 
          onDateFilter={handleDateFilter}
          loading={logsLoading}
        />
      </section>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const KPICard = ({ icon, label, value, color, trend }: {
  icon: React.ReactNode; label: string; value: string; color: string; trend?: 'up' | 'down';
}) => {
  const colors: Record<string, string> = {
    green: 'text-emerald-400', amber: 'text-amber-400', 
    red: 'text-rose-400', blue: 'text-cyan-400'
  };
  return (
    <div className="glass-panel rounded-xl p-4 hover:border-white/20 transition-all group">
      <div className={`${colors[color]} opacity-40 group-hover:opacity-70 transition-opacity mb-2`}>
        {icon}
      </div>
      <div className="text-[10px] uppercase text-gray-500 tracking-widest mb-1">{label}</div>
      <div className="text-xl font-bold text-white flex items-center gap-2">
        {value}
        {trend && (
          trend === 'up' 
            ? <TrendingUp size={14} className="text-emerald-400" />
            : <TrendingDown size={14} className="text-rose-400" />
        )}
      </div>
    </div>
  );
};

const OptOutMeter = ({ title, subtitle, icon, count, rate, delivered, keywords, color }: {
  title: string; subtitle: string; icon: React.ReactNode;
  count: number; rate: number; delivered: number; keywords: string[]; color: 'blue' | 'amber';
}) => {
  const accent = color === 'blue' ? 'text-cyan-400 bg-cyan-500/10' : 'text-amber-400 bg-amber-500/10';
  const barColor = color === 'blue' ? 'bg-cyan-500' : 'bg-amber-500';
  
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{subtitle}</div>
        </div>
      </div>
      
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-white">
            {rate > 0 ? `${rate.toFixed(2)}%` : '—'}
          </div>
          <div className="text-xs text-gray-500">
            {count.toLocaleString()} of {delivered.toLocaleString()} delivered
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(rate * 10, 100)}%` }} />
      </div>
      
      {/* Keywords preview */}
      {keywords.length > 0 && (
        <div className="text-[10px] text-gray-600 truncate">
          Tracking: {keywords.slice(0, 4).join(', ')}{keywords.length > 4 ? '...' : ''}
        </div>
      )}
    </div>
  );
};

const LatencyCard = ({ stats }: { stats: LatencyStats }) => (
  <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
    <div className="text-sm font-semibold text-white">Latency Distribution</div>
    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
      {stats.samples.toLocaleString()} samples (24h)
    </div>
    
    <div className="grid grid-cols-3 gap-3 mt-2">
      <div className="text-center">
        <div className="text-2xl font-bold text-emerald-400">{Math.round(stats.p50)}</div>
        <div className="text-[10px] text-gray-500">P50 (ms)</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-amber-400">{Math.round(stats.p95)}</div>
        <div className="text-[10px] text-gray-500">P95 (ms)</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-rose-400">{Math.round(stats.p99)}</div>
        <div className="text-[10px] text-gray-500">P99 (ms)</div>
      </div>
    </div>
  </div>
);

export default Dashboard;
