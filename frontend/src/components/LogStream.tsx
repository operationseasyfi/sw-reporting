import React, { useRef } from 'react';
import { LogEntry } from '../types';
import { Badge } from '../ui/Badge';
import { Pause, Play, Radio } from 'lucide-react';

interface LogStreamProps {
  logs: LogEntry[];
  paused: boolean;
  setPaused: (p: boolean) => void;
}

export const LogStream: React.FC<LogStreamProps> = ({ logs, paused, setPaused }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('en-US', { 
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });
    } catch {
      return '—';
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '—';
    // Show last 4 digits for privacy but keep it readable
    return phone.length > 4 ? `•••${phone.slice(-4)}` : phone;
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Radio size={14} className="text-cyan-400" />
            Live Message Feed
          </h3>
          <span className="text-xs text-gray-500 font-mono">{logs.length} messages</span>
        </div>
        
        <button 
          onClick={() => setPaused(!paused)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${paused 
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-3 px-5 py-2.5 text-[11px] font-semibold text-gray-500 
                      border-b border-white/5 bg-black/20 uppercase tracking-wider">
        <div className="col-span-1">Time</div>
        <div className="col-span-1">Dir</div>
        <div className="col-span-2">From</div>
        <div className="col-span-2">To</div>
        <div className="col-span-3">Message</div>
        <div className="col-span-1">Latency</div>
        <div className="col-span-2 text-right">Status</div>
      </div>

      {/* Log Rows */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Waiting for messages...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div 
              key={log.id || idx}
              className="grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-white/5 
                         hover:bg-white/5 transition-colors items-center group"
            >
              {/* Time */}
              <div className="col-span-1 text-[12px] text-gray-400 font-mono">
                {formatTime(log.timestamp)}
              </div>
              
              {/* Direction */}
              <div className="col-span-1">
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded
                  ${log.direction === 'MT' 
                    ? 'bg-cyan-500/20 text-cyan-400' 
                    : 'bg-purple-500/20 text-purple-400'
                  }`}>
                  {log.direction}
                </span>
              </div>
              
              {/* From */}
              <div className="col-span-2 text-[12px] text-gray-300 font-mono">
                {formatPhone(log.from)}
              </div>
              
              {/* To */}
              <div className="col-span-2 text-[12px] text-gray-300 font-mono">
                {formatPhone(log.to)}
              </div>
              
              {/* Message Preview */}
              <div className="col-span-3 text-[12px] text-gray-500 truncate group-hover:text-gray-300 transition-colors">
                {log.body || '—'}
              </div>
              
              {/* Latency */}
              <div className="col-span-1 text-[12px] text-gray-500 font-mono">
                {typeof log.latency === 'number' && log.latency > 0 
                  ? `${log.latency.toLocaleString()}ms` 
                  : '—'
                }
              </div>
              
              {/* Status */}
              <div className="col-span-2 flex justify-end">
                <Badge variant={
                  log.status === 'DELIVERED' || log.status === 'SENT' ? 'success' : 
                  log.status === 'FAILED' ? 'error' : 
                  log.status === 'UNDELIVERED' ? 'warning' : 'neutral'
                }>
                  {log.errorCode ? `E${log.errorCode}` : log.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
