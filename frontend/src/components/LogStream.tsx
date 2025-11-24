import React, { useRef } from 'react';
import { LogEntry } from '../types';
import { Badge } from '../ui/Badge';
import { Pause, Play, Download, Search } from 'lucide-react';

interface LogStreamProps {
  logs: LogEntry[];
  paused: boolean;
  setPaused: (p: boolean) => void;
}

export const LogStream: React.FC<LogStreamProps> = ({ logs, paused, setPaused }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full glass-panel rounded-lg overflow-hidden border-t-2 border-t-neon-blue/50">
      {/* Header Controls */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-neon-green animate-pulse"></div>
          <h3 className="text-xs font-bold font-display uppercase tracking-widest text-neon-blue">Live Telemetry Feed</h3>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="relative group">
            <Search className="absolute left-2 top-1.5 w-3 h-3 text-gray-500" />
            <input 
              type="text" 
              placeholder="FILTER STREAM..." 
              className="bg-black/40 border border-white/10 rounded px-2 pl-7 py-1 text-[10px] w-48 text-white focus:border-neon-blue focus:outline-none font-mono"
            />
          </div>
          <div className="h-4 w-[1px] bg-white/10"></div>
          <button 
            onClick={() => setPaused(!paused)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${paused ? 'text-neon-amber' : 'text-gray-400'}`}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button className="p-1.5 rounded hover:bg-white/10 text-gray-400">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Log Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-mono text-gray-500 border-b border-white/5 uppercase tracking-wider bg-black/40">
        <div className="col-span-2">Timestamp</div>
        <div className="col-span-1">Direction</div>
        <div className="col-span-2">From</div>
        <div className="col-span-2">To</div>
        <div className="col-span-2">Carrier</div>
        <div className="col-span-1">Latency</div>
        <div className="col-span-2 text-right">Status</div>
      </div>

      {/* Log Body */}
      <div className="flex-1 overflow-y-auto font-mono text-xs relative" ref={scrollRef}>
         {logs.map((log) => (
           <div 
             key={log.id} 
             className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 hover:bg-white/5 transition-colors items-center animate-in fade-in slide-in-from-top-2 duration-300"
           >
             <div className="col-span-2 text-gray-400 text-[10px]">
               {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
               <span className="text-gray-600 ml-1">.{new Date(log.timestamp).getMilliseconds()}</span>
             </div>
             <div className="col-span-1">
                <span className={`text-[10px] ${log.direction === 'MT' ? 'text-neon-blue' : 'text-neon-purple'}`}>
                  {log.direction}
                </span>
             </div>
             <div className="col-span-2 text-gray-300">{log.from}</div>
             <div className="col-span-2 text-gray-300">{log.to}</div>
             <div className="col-span-2 text-gray-400">{log.carrier}</div>
             <div className="col-span-1 text-gray-400">{log.latency}ms</div>
             <div className="col-span-2 flex justify-end">
               <Badge variant={
                   log.status === 'DELIVERED' || log.status === 'SENT' ? 'success' : 
                   log.status === 'FAILED' ? 'error' : 
                   log.status === 'UNDELIVERED' ? 'warning' : 'neutral'
               }>
                 {log.errorCode ? `ERR ${log.errorCode}` : log.status}
               </Badge>
             </div>
           </div>
         ))}
      </div>
    </div>
  );
};

