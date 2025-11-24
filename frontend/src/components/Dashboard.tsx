import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from 'recharts';
import { Activity, ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, DollarSign, Database } from 'lucide-react';
import { LogStream } from './LogStream';
import { LogEntry, TimeSeriesPoint, ErrorCluster } from '../types';
import { generateLogEntry, ERROR_CLUSTERS } from '../constants';

// Helper to fetch real logs
async function fetchLogs(): Promise<LogEntry[]> {
    try {
        const res = await fetch('/api/logs_dt?draw=1&start=0&length=50');
        if (!res.ok) return [];
        const data = await res.json();
        // Map backend DB model to UI LogEntry
        return data.data.map((row: any) => ({
            id: row.id,
            timestamp: row.date_created,
            from: row.from_number,
            to: row.to_number,
            carrier: 'Unknown', // Backend doesn't have carrier info yet
            status: row.status?.toUpperCase() || 'UNKNOWN',
            errorCode: row.error_code ? String(row.error_code) : undefined,
            latency: Math.floor(Math.random() * 200 + 100), // Fake latency for now
            type: 'SMS',
            direction: row.direction === 'inbound' ? 'MO' : 'MT',
            cost: row.price || 0
        }));
    } catch (e) {
        console.error("Failed to fetch logs", e);
        return [];
    }
}

async function fetchTimeSeries(): Promise<TimeSeriesPoint[]> {
    try {
        const res = await fetch('/api/stats/timeseries');
        if(!res.ok) return [];
        const data = await res.json();
        
        // Transform { "2023-10-25": { delivered: 10... } } to array
        // Sorting by date keys
        const sortedKeys = Object.keys(data).sort();
        return sortedKeys.map(dateStr => {
            const day = data[dateStr];
            return {
                time: dateStr,
                throughput: day.total,
                latency: Math.floor(Math.random() * 50 + 100), // Placeholder
                errors: day.failed
            };
        });
    } catch(e) {
        return [];
    }
}

export const Dashboard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chartData, setChartData] = useState<TimeSeriesPoint[]>([]);
  const [paused, setPaused] = useState(false);
  const [hoveredCluster, setHoveredCluster] = useState<ErrorCluster | null>(null);

  // Initialize Data
  useEffect(() => {
    // Initial Fetch
    Promise.all([fetchLogs(), fetchTimeSeries()]).then(([realLogs, realChart]) => {
        if (realLogs.length > 0) setLogs(realLogs);
        else setLogs(Array.from({ length: 15 }).map(generateLogEntry)); // Fallback to fake if empty

        if (realChart.length > 0) setChartData(realChart);
    });
  }, []);

  // Live Tick
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(async () => {
      // Fetch real latest logs every second? Maybe too aggressive.
      // Let's simulate or poll less frequently.
      // For "Elite" feel, we simulate local updates or poll efficiently.
      
      // Poll real data
      const newLogs = await fetchLogs();
      if (newLogs.length > 0) {
          setLogs(newLogs);
      } else {
          // Fallback simulation if offline/empty
          const newLog = generateLogEntry();
          setLogs(prev => [newLog, ...prev].slice(0, 50));
      }

      // Update chart (mock movement for live effect if using static daily data)
      setChartData(prev => {
          if (prev.length === 0) return [];
          const last = prev[prev.length - 1];
          // Only append if it's a live chart, but we have daily data.
          // Let's stick to the daily data or just wiggle the last point for "live" feel
          return prev;
      });

    }, 3000);
    return () => clearInterval(interval);
  }, [paused]);

  const currentThroughput = chartData.length > 0 ? chartData.reduce((acc, cur) => acc + cur.throughput, 0) : 0; // Total Volume
  const currentLatency = 128; // Placeholder

  // Custom Treemap Content
  const CustomTreemapItem = (props: any) => {
    const { x, y, width, height, payload, name } = props;
    
    let fill = '#333';
    let borderColor = 'rgba(255,255,255,0.1)';
    let textColor = '#aaa';
    
    if (payload?.severity === 'critical') {
      fill = 'rgba(255, 0, 60, 0.2)';
      borderColor = '#ff003c';
      textColor = '#ff003c';
    } else if (payload?.severity === 'high') {
      fill = 'rgba(255, 174, 0, 0.15)';
      borderColor = '#ffae00';
      textColor = '#ffae00';
    } else if (payload?.severity === 'medium') {
      fill = 'rgba(0, 240, 255, 0.1)';
      borderColor = '#00f0ff';
      textColor = '#00f0ff';
    } else {
        fill = 'rgba(255, 255, 255, 0.05)';
        borderColor = 'rgba(255, 255, 255, 0.2)';
    }

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: fill,
            stroke: borderColor,
            strokeWidth: 1,
            strokeOpacity: 1,
            transition: 'all 0.3s ease',
          }}
          className="hover:brightness-125 cursor-pointer"
          onMouseEnter={() => payload && setHoveredCluster(payload)}
          onMouseLeave={() => setHoveredCluster(null)}
        />
        {width > 50 && height > 30 && (
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            fill={textColor}
            fontSize={12}
            fontWeight="bold"
            className="font-mono"
            dy={-6}
          >
            {name}
          </text>
        )}
         {width > 50 && height > 30 && payload?.count && (
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize={10}
            className="font-mono"
            dy={10}
          >
            {payload.count}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-y-auto">
      {/* 1. LIVE PULSE SECTION */}
      <section className="relative w-full h-64 glass-panel rounded-xl overflow-hidden shrink-0">
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-6">
           <div>
              <div className="text-[10px] uppercase text-gray-500 font-mono tracking-widest mb-1">Total Volume (30d)</div>
              <div className="text-2xl font-display font-bold text-white flex items-baseline">
                {currentThroughput.toLocaleString()} 
                <span className="text-xs text-neon-blue ml-2 font-mono">msgs</span>
              </div>
           </div>
           <div>
              <div className="text-[10px] uppercase text-gray-500 font-mono tracking-widest mb-1">Avg Latency</div>
              <div className="text-2xl font-display font-bold text-white flex items-baseline">
                {currentLatency}
                <span className="text-xs text-neon-amber ml-2 font-mono">ms</span>
              </div>
           </div>
        </div>
        
        <div className="absolute inset-0 grid-bg opacity-30"></div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#050505', borderColor: '#333', color: '#fff' }}
              itemStyle={{ color: '#00f0ff' }}
            />
            <Area 
              type="monotone" 
              dataKey="throughput" 
              stroke="#00f0ff" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorThroughput)" 
              isAnimationActive={false} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* 2. MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-96 shrink-0">
        <div className="flex flex-col gap-4">
          <KPICard 
            title="Success Rate" 
            value="98.4%" 
            trend="+0.2%" 
            trendUp={true} 
            color="text-neon-green"
            icon={<Activity size={16} />}
          />
          <KPICard 
            title="Total Spend (24h)" 
            value="$42,891.04" 
            trend="+$12/s" 
            trendUp={false} 
            color="text-neon-amber"
            icon={<DollarSign size={16} />}
          />
           <KPICard 
            title="Failed Messages" 
            value="1,204" 
            trend="-5%" 
            trendUp={true} 
            color="text-neon-red"
            icon={<AlertTriangle size={16} />}
          />
           <KPICard 
            title="Active Segments" 
            value="89.2M" 
            trend="Stable" 
            trendUp={true} 
            color="text-neon-blue"
            icon={<Database size={16} />}
          />
        </div>

        <div className="lg:col-span-3 glass-panel rounded-xl p-4 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neon-red flex items-center gap-2">
              <Zap size={16} /> Kill Zone Analysis (Error Codes)
            </h3>
            {hoveredCluster && (
              <div className="text-xs font-mono text-white animate-pulse">
                {hoveredCluster.description} ({hoveredCluster.count} events)
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0">
             <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={ERROR_CLUSTERS}
                dataKey="count"
                aspectRatio={4 / 3}
                stroke="#050505"
                content={<CustomTreemapItem />}
              />
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. LOG STREAM */}
      <div className="flex-1 min-h-[300px]">
        <LogStream logs={logs} paused={paused} setPaused={setPaused} />
      </div>
    </div>
  );
};

const KPICard = ({ title, value, trend, trendUp, color, icon }: any) => (
  <div className="flex-1 glass-panel p-4 rounded-xl flex flex-col justify-center relative overflow-hidden group hover:border-white/20 transition-all">
    <div className={`absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity ${color}`}>
      {icon}
    </div>
    <div className="text-[10px] uppercase text-gray-500 font-mono tracking-widest mb-1">{title}</div>
    <div className="text-xl font-display font-bold text-white mb-1">{value}</div>
    <div className={`text-xs font-mono flex items-center ${trendUp ? 'text-neon-green' : 'text-neon-amber'}`}>
      {trendUp ? <ArrowUpRight size={12} className="mr-1"/> : <ArrowDownRight size={12} className="mr-1"/>}
      {trend}
    </div>
  </div>
);

