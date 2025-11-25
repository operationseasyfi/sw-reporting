import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, AlertTriangle, DollarSign, Users, RefreshCw, 
  CheckCircle, XCircle, Download, MessageSquare, Filter,
  Calendar, Database, Loader2, Cloud, ChevronRight
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

interface DbStats {
  total_messages: number;
  oldest_message: string | null;
  newest_message: string | null;
}

// ============================================================================
// DATA FETCHING
// ============================================================================
const fetchStats = async (startDate?: string, endDate?: string): Promise<Stats> => {
  try {
    let url = '/api/stats/overview';
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      url += '?' + params.toString();
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { totalVolume: 0, delivered: 0, failed: 0, successRate: 0, spend: 0, activeSegments: 0 };
  }
};

const fetchErrors = async (startDate?: string, endDate?: string): Promise<ErrorStat[]> => {
  try {
    let url = '/api/stats/errors';
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      url += '?' + params.toString();
    }
    const res = await fetch(url);
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

const fetchOptOuts = async (startDate?: string, endDate?: string): Promise<OptOutStats> => {
  try {
    let url = '/api/stats/optouts';
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      url += '?' + params.toString();
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { delivered: 0, defaultCount: 0, defaultRate: 0, customCount: 0, customRate: 0 };
  }
};

const fetchDbStats = async (): Promise<DbStats | null> => {
  try {
    const res = await fetch('/api/db/stats');
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
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
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Date filter - default to today
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [activeDate, setActiveDate] = useState(today);
  
  // Sync state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [syncHours, setSyncHours] = useState(24);
  const [syncResult, setSyncResult] = useState<{success: boolean; message: string} | null>(null);

  // Load all data with date filter
  const loadData = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    const [statsData, errorsData, messagesData, optoutsData, dbStatsData] = await Promise.all([
      fetchStats(start, end),
      fetchErrors(start, end),
      fetchMessages(start, end),
      fetchOptOuts(start, end),
      fetchDbStats()
    ]);
    setStats(statsData);
    setErrors(errorsData);
    setMessages(messagesData);
    setOptouts(optoutsData);
    setDbStats(dbStatsData);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  // Apply date filter
  const handleFilter = async () => {
    setMessagesLoading(true);
    setActiveDate(startDate);
    await loadData(startDate, endDate);
    setMessagesLoading(false);
  };

  // Sync from SignalWire
  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress('Connecting to SignalWire...');
    setSyncResult(null);
    
    try {
      setSyncProgress('Fetching messages from SignalWire API...');
      
      const res = await fetch(`/api/sync/trigger?hours=${syncHours}&limit=1000`);
      const data = await res.json();
      
      if (data.error) {
        setSyncResult({ success: false, message: data.error });
      } else {
        setSyncResult({ 
          success: true, 
          message: `Successfully fetched ${data.fetched} messages, saved ${data.saved} new messages to database.`
        });
        // Refresh the dashboard data
        await loadData(startDate, endDate);
        // Update db stats
        const newDbStats = await fetchDbStats();
        setDbStats(newDbStats);
      }
    } catch (error) {
      setSyncResult({ success: false, message: 'Failed to connect to sync API' });
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  // Initial load
  useEffect(() => {
    loadData(today, today);
  }, []);

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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

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
      {/* Header with Date Context */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            <Calendar size={14} className="inline mr-1" />
            Showing data for: <strong className="text-slate-700">{formatDate(activeDate)}</strong>
          </p>
          {lastUpdate && (
            <p className="text-xs text-slate-400 mt-1">
              Last refreshed: {lastUpdate.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* SYNC BUTTON - Primary Action */}
          <button
            onClick={() => setSyncModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 
                       text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 
                       shadow-lg shadow-blue-500/25 transition-all font-semibold"
          >
            <Cloud size={18} />
            Sync from SignalWire
          </button>
          <button
            onClick={() => loadData(startDate, endDate)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 
                       text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Database Status Banner */}
      {dbStats && (
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <Database size={20} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                Database: <strong className="text-slate-900">{dbStats.total_messages.toLocaleString()}</strong> messages
              </p>
              <p className="text-xs text-slate-500">
                {dbStats.oldest_message && dbStats.newest_message 
                  ? `From ${new Date(dbStats.oldest_message).toLocaleDateString()} to ${new Date(dbStats.newest_message).toLocaleDateString()}`
                  : 'No messages yet'
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => setSyncModalOpen(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            Load more data <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          icon={<MessageSquare className="text-blue-600" />}
          label="Total Messages"
          value={stats.totalVolume.toLocaleString()}
          subtext={formatDate(activeDate)}
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
          subtext="This period"
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
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              Error Code Breakdown
              <span className="text-sm font-normal text-slate-400">({formatDate(activeDate)})</span>
            </h3>
          </div>
          <div className="p-4">
            {errors.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {errors.map((err) => {
                  const info = ERROR_CODES[err.code] || { name: `Error ${err.code}`, description: 'Unknown error', severity: 'medium' };
                  return (
                    <div key={err.code} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className={`w-3 h-3 rounded-full ${severityColor(info.severity)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700">{err.code}</span>
                          <span className="font-medium text-slate-800">{info.name}</span>
                        </div>
                        <p className="text-sm text-slate-500 truncate">{info.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-slate-800">{err.count.toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle size={40} className="mx-auto mb-2 text-emerald-400" />
                <p className="font-medium">No errors detected</p>
                <p className="text-sm">All messages delivered successfully</p>
              </div>
            )}
          </div>
        </div>

        {/* Opt-Out Stats */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Activity size={20} className="text-blue-500" />
              Opt-Out Rates
              <span className="text-sm font-normal text-slate-400">({formatDate(activeDate)})</span>
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-xl p-5">
                <div className="text-sm text-blue-600 font-medium mb-2">Standard Opt-Outs</div>
                <div className="text-4xl font-bold text-blue-700">{optouts.defaultRate.toFixed(2)}%</div>
                <div className="text-sm text-blue-500 mt-2">
                  {optouts.defaultCount.toLocaleString()} STOP/UNSUBSCRIBE
                </div>
                <div className="text-xs text-blue-400 mt-1">
                  of {optouts.delivered.toLocaleString()} delivered
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl p-5">
                <div className="text-sm text-amber-600 font-medium mb-2">Custom Opt-Outs</div>
                <div className="text-4xl font-bold text-amber-700">{optouts.customRate.toFixed(2)}%</div>
                <div className="text-sm text-amber-500 mt-2">
                  {optouts.customCount.toLocaleString()} custom keywords
                </div>
                <div className="text-xs text-amber-400 mt-1">
                  Extended keyword matching
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
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
                  {messagesLoading ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />}
                  Apply
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
                    <MessageSquare size={40} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No messages found</p>
                    <p className="text-sm">Try syncing more data from SignalWire</p>
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

      {/* SYNC MODAL */}
      {syncModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Cloud className="text-blue-600" />
                Sync Data from SignalWire
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Pull message history directly from SignalWire API into your database.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Time Range Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  How far back to sync?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 6, 12, 24].map((h) => (
                    <button
                      key={h}
                      onClick={() => setSyncHours(h)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors
                        ${syncHours === h 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {h} {h === 1 ? 'hour' : 'hours'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress */}
              {syncing && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 size={20} className="animate-spin text-blue-600" />
                    <span className="font-medium text-blue-800">Syncing in progress...</span>
                  </div>
                  <p className="text-sm text-blue-600">{syncProgress}</p>
                  <div className="mt-3 h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              )}

              {/* Result */}
              {syncResult && (
                <div className={`rounded-xl p-4 ${syncResult.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {syncResult.success 
                      ? <CheckCircle className="text-emerald-600" size={20} />
                      : <XCircle className="text-red-600" size={20} />
                    }
                    <span className={`font-medium ${syncResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
                      {syncResult.success ? 'Sync Complete!' : 'Sync Failed'}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${syncResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {syncResult.message}
                  </p>
                </div>
              )}

              {/* Info */}
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                <p><strong>Note:</strong> This will fetch up to 1,000 messages from SignalWire. 
                For larger syncs, use the command line:</p>
                <code className="block mt-2 bg-slate-200 px-3 py-2 rounded text-xs font-mono">
                  python sync_logs.py --hours {syncHours}
                </code>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setSyncModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl
                           hover:bg-blue-700 disabled:opacity-50 font-semibold"
              >
                {syncing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Start Sync
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
  <div className={`bg-white border rounded-xl p-5 shadow-sm ${
    highlight === 'green' ? 'border-emerald-200 bg-emerald-50/30' : 
    highlight === 'red' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'
  }`}>
    <div className="flex items-center gap-3 mb-3">
      {icon}
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
    <div className="text-3xl font-bold text-slate-800">{value}</div>
    <div className="text-sm text-slate-400 mt-1">{subtext}</div>
  </div>
);

export default Dashboard;
