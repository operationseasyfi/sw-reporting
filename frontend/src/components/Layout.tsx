import React from 'react';
import { LayoutDashboard, Globe, Activity, Bell, Settings, Command, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, setActiveView }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Mission Control', icon: <LayoutDashboard size={18} /> },
    { id: 'carriers', label: 'Carriers & Routes', icon: <Globe size={18} /> },
    { id: 'latency', label: 'Latency Telemetry', icon: <Activity size={18} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={18} /> },
  ];

  return (
    <div className="flex h-screen w-screen bg-obsidian text-gray-300 font-sans selection:bg-neon-blue selection:text-black">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-black font-bold text-xs shadow-[0_0_15px_rgba(0,240,255,0.5)]">
                SW
            </div>
            <div>
                <h1 className="text-sm font-bold tracking-wider text-white">TELEMETRY</h1>
                <div className="text-[10px] text-gray-500 font-mono">SIGNALWIRE_OS v2.4</div>
            </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium uppercase tracking-wide transition-all duration-200 group relative overflow-hidden ${
                activeView === item.id 
                  ? 'text-white bg-white/5 border border-white/5 shadow-[0_0_10px_rgba(255,255,255,0.05)]' 
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {activeView === item.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-neon-blue shadow-[0_0_10px_#00f0ff]"></div>
              )}
              <span className={activeView === item.id ? 'text-neon-blue' : 'group-hover:text-gray-300'}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
           <button className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 hover:text-white transition-colors">
               <Settings size={16} /> System Config
           </button>
           <div className="mt-4 px-3 py-2 rounded bg-black/50 border border-white/5">
              <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                  <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse"></div>
                  SYSTEM OPERATIONAL
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#050505] relative overflow-y-auto">
         <div className="absolute inset-0 grid-bg pointer-events-none z-0"></div>

         {/* Top Bar */}
         <header className="h-14 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 z-10 shrink-0">
             <div className="flex items-center gap-4">
                 <button className="md:hidden text-gray-400" onClick={() => setMobileMenuOpen(true)}>
                     <Menu size={20} />
                 </button>
                 <div className="hidden md:flex items-center gap-2 text-gray-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 hover:border-white/20 transition-colors cursor-text group">
                     <Command size={14} className="group-hover:text-neon-blue transition-colors" />
                     <span className="text-xs font-mono">Search telemetry...</span>
                     <span className="ml-4 text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-gray-600 border border-white/5">⌘K</span>
                 </div>
             </div>
             
             <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-gray-500 font-mono uppercase">Current Period</div>
                    <div className="text-xs font-bold text-white">LAST 24 HOURS</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-800 border border-white/10"></div>
             </div>
         </header>

         {/* View Content */}
         <div className="flex-1 relative z-10">
            {children}
         </div>
      </main>
      
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl md:hidden flex flex-col p-6">
              <div className="flex justify-end mb-8">
                  <button onClick={() => setMobileMenuOpen(false)}><X className="text-white" /></button>
              </div>
              <nav className="space-y-4">
                  {navItems.map(item => (
                      <button 
                        key={item.id}
                        onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}
                        className="text-xl font-display font-bold text-white block w-full text-left"
                    >
                          {item.label}
                      </button>
                  ))}
              </nav>
          </div>
      )}
    </div>
  );
};

