import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';
import { 
  Activity, AlertTriangle, DollarSign, Users, RefreshCw, 
  CheckCircle, XCircle, Clock, Search, Download, ChevronDown,
  TrendingUp, MessageSquare, Filter
} from 'lucide-react';

// ============================================================================
// ERROR CODE DICTIONARY
// ============================================================================
const ERROR_CODES: Record<number, { name: string; description: string; severity: 'low' | 'medium' | 'high' | 'critical' }> = {
  30001: { name: 'Queue Overflow', description: 'Message queued but carrier queue full', severity: 'medium' },
  30002: { name: 'Account Suspended', description: 'Your account has been suspended', severity: 'critical' },
  30003: { name: 'Unreachable', description: 'Destination handset unreachable', severity: 'medium' },
  30004: { name: 'Blocked', description: 'Message blocked by carrier', severity: 'high' },
  30005: { name: 'Unknown Number', description: 'Destination number does not exist', severity: 'high' },
  30006: { name: 'Landline', description: 'Cannot send SMS to landline', severity: 'low' },
  30007: { name: 'Carrier Violation', description: 'Message filtered by carrier (spam)', severity: 'critical' },
  30008: { name: 'Unknown Error', description: 'Unknown delivery error', severity: 'medium' },
  30009: { name: 'Missing Segment', description: 'Message segment missing', severity: 'medium' },
  30010: { name: 'Price Limit', description: 'Message exceeds price limit', severity: 'low' },
  30022: { name: '10DLC Issue', description: 'Number not registered for A2P 10DLC', severity: 'critical' },
  11200: { name: 'HTTP Error', description: 'HTTP retrieval failure', severity: 'medium' },
};

// ============================================================================
// TYPES
// ============================================================================
interface Stats {
  totalVolume: number;
  delivered: number;
  failed: number;
  successRate: number;
  spend: number;
  activeSegments: number;
}

interface ErrorStat {
  code: number;
  count: number;
  severity: string;
}

interface Message {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  status: string;
  errorCode?: number;
  body?: string;
  direction: string;
}

interface OptOutStats {
  delivered: number;
  defaultCount: number;
  defaultRate: number;
  customCount: number;
  customRate: number;
}

// ============================================================================
// DATA FETCHING
// ============================================================================
const fetchStats = async (): Promise<Stats> => {
  try {
    const res = await fetch('/api/stats/overview');
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { totalVolume: 0, delivered: 0, failed: 0, successRate: 0, spend: 0, activeSegments: 0 };
  }
};

const fetchErrors = async (): Promise<ErrorStat[]> => {
  try {
    const res = await fetch('/api/stats/errors');
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
};

const fetchMessages = async (startDate?: string, endDate?: string): Promise<Message[]> => {
  let url = '/api/logs_dt?draw=1&start=0&length=200';
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.data?.map((row: any) => ({
      id: row.id,
      timestamp: row.date_created,
      from: row.from_number,
      to: row.to_number,
      status: row.status?.toUpperCase() || 'UNKNOWN',
      errorCode: row.error_code,
      body: row.body,
      direction: row.direction === 'inbound' ? 'IN' : 'OUT'
    })) || [];
  } catch {
    return [];
  }
};

const fetchOptOuts = async (): Promise<OptOutStats> => {
  try {
    const res = await fetch('/api/stats/optouts');
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { delivered: 0, defaultCount: 0, defaultRate: 0, customCount: 0, customRate: 0 };
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({ totalVolume: 0, delivered: 0, failed: 0, successRate: 0, spend: 0, activeSegments: 0 });
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [optouts, setOptouts] = useState<OptOutStats>({ delivered: 0, defaultCount: 0, defaultRate: 0, customCount: 0, customRate: 0 });
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    const [statsData, errorsData, messagesData, optoutsData] = await Promise.all([
      fetchStats(),
      fetchErrors(),
      fetchMessages(),
      fetchOptOuts()
    ]);
    setStats(statsData);
    setErrors(errorsData);
    setMessages(messagesData);
    setOptouts(optoutsData);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  // Filter messages by date
  const handleFilter = async () => {
    setMessagesLoading(true);
    const data = await fetchMessages(startDate, endDate);
    setMessages(data);
    setMessagesLoading(false);
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Filter messages by status
  const filteredMessages = statusFilter === 'all' 
    ? messages 
    : messages.filter(m => m.status.toLowerCase() === statusFilter);

  // Format time to PST
  const formatTime = (timestamp: string) => {
    if (!timestamp) return '—';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '—';
    }
  };

  // Severity colors
  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-slate-400';
    }
  };

  const statusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered': return 'bg-emerald-100 text-emerald-700';
      case 'sent': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'undelivered': return 'bg-red-100 text-red-700';
      case 'queued': return 'bg-amber-100 text-amber-700';
      case 'received': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {lastUpdate ? `Last updated: ${lastUpdate.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg 
                     hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          icon={<MessageSquare className="text-blue-600" />}
          label="Total Messages"
          value={stats.totalVolume.toLocaleString()}
          subtext="Last 24 hours"
        />
        <KPICard 
          icon={<CheckCircle className="text-emerald-600" />}
          label="Delivered"
          value={stats.delivered.toLocaleString()}
          subtext={`${stats.successRate.toFixed(1)}% success`}
          highlight="green"
        />
        <KPICard 
          icon={<XCircle className="text-red-600" />}
          label="Failed"
          value={stats.failed.toLocaleString()}
          subtext="Need attention"
          highlight="red"
        />
        <KPICard 
          icon={<DollarSign className="text-amber-600" />}
          label="Spend"
          value={`$${stats.spend.toFixed(2)}`}
          subtext="Last 24 hours"
        />
        <KPICard 
          icon={<Users className="text-purple-600" />}
          label="Recipients"
          value={stats.activeSegments.toLocaleString()}
          subtext="Unique numbers"
        />
      </div>

      {/* Error Analysis + Opt-Out Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error Code Breakdown */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            Error Code Breakdown
          </h3>
          {errors.length > 0 ? (
            <div className="space-y-3">
              {errors.map((err) => {
                const info = ERROR_CODES[err.code] || { name: `Error ${err.code}`, description: 'Unknown error', severity: 'medium' };
                return (
                  <div key={err.code} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${severityColor(info.severity)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-700">{err.code}</span>
                        <span className="font-medium text-slate-800">{info.name}</span>
                      </div>
                      <p className="text-sm text-slate-500 truncate">{info.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-800">{err.count.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">occurrences</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400" />
              <p>No errors detected</p>
            </div>
          )}
        </div>

        {/* Opt-Out Stats */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-blue-500" />
            Opt-Out Rates
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-sm text-blue-600 font-medium mb-1">Standard Opt-Outs</div>
              <div className="text-3xl font-bold text-blue-700">{optouts.defaultRate.toFixed(2)}%</div>
              <div className="text-sm text-blue-500 mt-1">
                {optouts.defaultCount.toLocaleString()} STOP/UNSUBSCRIBE
              </div>
              <div className="text-xs text-blue-400 mt-2">
                of {optouts.delivered.toLocaleString()} delivered
              </div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="text-sm text-amber-600 font-medium mb-1">Custom Opt-Outs</div>
              <div className="text-3xl font-bold text-amber-700">{optouts.customRate.toFixed(2)}%</div>
              <div className="text-sm text-amber-500 mt-1">
                {optouts.customCount.toLocaleString()} custom keywords
              </div>
              <div className="text-xs text-amber-400 mt-2">
                Extended keyword matching
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="card">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-500" />
              Message Feed
              <span className="text-sm font-normal text-slate-400">
                ({filteredMessages.length} messages)
              </span>
            </h3>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="delivered">Delivered</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="queued">Queued</option>
                <option value="received">Received</option>
              </select>

              {/* Date Range */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleFilter}
                  disabled={messagesLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg
                             hover:bg-slate-900 disabled:opacity-50 text-sm font-medium"
                >
                  <Filter size={14} />
                  {messagesLoading ? 'Loading...' : 'Filter'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Time (PST)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">From</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">To</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Message</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Error</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No messages found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {formatTime(msg.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full
                        ${msg.direction === 'OUT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {msg.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{msg.from}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">{msg.to}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={msg.body}>
                      {msg.body || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {msg.errorCode ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 
                                         text-xs font-mono rounded" title={ERROR_CODES[msg.errorCode]?.description}>
                          {msg.errorCode}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColor(msg.status)}`}>
                        {msg.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Activity className="text-blue-500 mt-0.5" size={20} />
        <div>
          <p className="text-sm text-blue-800 font-medium">
            Currently showing {messages.length} messages from your database.
          </p>
          <p className="text-sm text-blue-600 mt-1">
            Run <code className="bg-blue-100 px-1 rounded">python sync_logs.py --hours 24</code> to pull more messages from SignalWire.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================
const KPICard = ({ icon, label, value, subtext, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  highlight?: 'green' | 'red';
}) => (
  <div className={`card p-5 ${highlight === 'green' ? 'border-emerald-200 bg-emerald-50/50' : 
                              highlight === 'red' ? 'border-red-200 bg-red-50/50' : ''}`}>
    <div className="flex items-center gap-3 mb-3">
      {icon}
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
    <div className="text-2xl font-bold text-slate-800">{value}</div>
    <div className="text-sm text-slate-400 mt-1">{subtext}</div>
  </div>
);

export default Dashboard;
