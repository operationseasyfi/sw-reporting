import React, { useRef, useState } from 'react';
import { LogEntry } from '../types';
import { Badge } from '../ui/Badge';
import { MessageSquare, Calendar, Search, AlertCircle } from 'lucide-react';

// Error code translator
const ERROR_CODES: Record<string, string> = {
  '30001': 'Queue overflow - Message queued but not sent',
  '30002': 'Account suspended',
  '30003': 'Unreachable destination handset',
  '30004': 'Message blocked by carrier',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier violation - Message filtered',
  '30008': 'Unknown error',
  '30009': 'Missing segment',
  '30010': 'Message price exceeds max price',
  '30022': 'US A2P 10DLC - Phone number not in campaign',
  '11200': 'HTTP retrieval failure',
  '21610': 'Attempt to send to unsubscribed recipient',
  '21611': 'Invalid To phone number',
  '21612': 'Invalid From phone number',
  '21614': 'Invalid To number for region',
  '21617': 'Message body is required',
};

interface LogStreamProps {
  logs: LogEntry[];
  onDateFilter: (startDate: string, endDate: string) => void;
  loading?: boolean;
}

export const LogStream: React.FC<LogStreamProps> = ({ logs, onDateFilter, loading }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hoveredError, setHoveredError] = useState<string | null>(null);

  // Convert UTC to PST
  const formatTimePST = (timestamp: string) => {
    if (!timestamp) return '—';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch {
      return '—';
    }
  };

  const formatDatePST = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const handleFilter = () => {
    if (startDate || endDate) {
      onDateFilter(startDate, endDate);
    }
  };

  const getErrorDescription = (code: string): string => {
    return ERROR_CODES[code] || `Unknown error code: ${code}`;
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-3">
          <MessageSquare size={16} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Message Feed</h3>
          <span className="text-xs text-gray-500 font-mono">{logs.length} messages</span>
          {loading && (
            <span className="text-xs text-cyan-400 animate-pulse">Loading...</span>
          )}
        </div>
        
        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300
                       focus:outline-none focus:border-cyan-500/50"
            placeholder="Start"
          />
          <span className="text-gray-600 text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300
                       focus:outline-none focus:border-cyan-500/50"
            placeholder="End"
          />
          <button
            onClick={handleFilter}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all
                       disabled:opacity-50"
          >
            <Search size={12} />
            Fetch
          </button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-2 px-5 py-2.5 text-[11px] font-semibold text-gray-500 
                      border-b border-white/5 bg-black/20 uppercase tracking-wider">
        <div className="col-span-1">Time (PST)</div>
        <div className="col-span-1">Type</div>
        <div className="col-span-2">From</div>
        <div className="col-span-2">To</div>
        <div className="col-span-3">Message</div>
        <div className="col-span-1">Error</div>
        <div className="col-span-2 text-right">Status</div>
      </div>

      {/* Log Rows */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
            <MessageSquare size={32} className="opacity-30" />
            <span>No messages found</span>
            <span className="text-xs text-gray-700">Select a date range and click Fetch</span>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div 
              key={log.id || idx}
              className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-white/5 
                         hover:bg-white/5 transition-colors items-center group text-[12px]"
            >
              {/* Time (PST) */}
              <div className="col-span-1 text-gray-400 font-mono">
                <div>{formatTimePST(log.timestamp)}</div>
                <div className="text-[10px] text-gray-600">{formatDatePST(log.timestamp)}</div>
              </div>
              
              {/* Direction - Readable */}
              <div className="col-span-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded
                  ${log.direction === 'MT' 
                    ? 'bg-cyan-500/20 text-cyan-400' 
                    : 'bg-purple-500/20 text-purple-400'
                  }`}>
                  {log.direction === 'MT' ? 'OUT' : 'IN'}
                </span>
              </div>
              
              {/* From - Full Number */}
              <div className="col-span-2 text-gray-300 font-mono truncate" title={log.from}>
                {log.from || '—'}
              </div>
              
              {/* To - Full Number */}
              <div className="col-span-2 text-gray-300 font-mono truncate" title={log.to}>
                {log.to || '—'}
              </div>
              
              {/* Message Preview */}
              <div className="col-span-3 text-gray-500 truncate group-hover:text-gray-300 transition-colors" 
                   title={log.body || ''}>
                {log.body || '—'}
              </div>
              
              {/* Error Code with Tooltip */}
              <div className="col-span-1 relative">
                {log.errorCode ? (
                  <div 
                    className="flex items-center gap-1 cursor-help"
                    onMouseEnter={() => setHoveredError(log.id)}
                    onMouseLeave={() => setHoveredError(null)}
                  >
                    <AlertCircle size={12} className="text-rose-400" />
                    <span className="text-rose-400 font-mono text-[11px]">{log.errorCode}</span>
                    
                    {/* Tooltip */}
                    {hoveredError === log.id && (
                      <div className="absolute left-0 bottom-full mb-2 z-50 w-64 p-2 
                                      bg-gray-900 border border-white/10 rounded-lg shadow-xl
                                      text-xs text-gray-300">
                        <div className="font-semibold text-rose-400 mb-1">Error {log.errorCode}</div>
                        <div>{getErrorDescription(log.errorCode)}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-700">—</span>
                )}
              </div>
              
              {/* Status */}
              <div className="col-span-2 flex justify-end">
                <Badge variant={
                  log.status === 'DELIVERED' || log.status === 'SENT' ? 'success' : 
                  log.status === 'FAILED' || log.status === 'UNDELIVERED' ? 'error' : 
                  log.status === 'QUEUED' ? 'warning' : 'neutral'
                }>
                  {log.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
