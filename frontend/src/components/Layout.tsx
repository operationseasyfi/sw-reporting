import React from 'react';
import { LayoutDashboard, Bell, Menu, X, Zap } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, setActiveView }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={18} /> },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0a] text-gray-300">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-white/5 bg-[#080808]">
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-white/5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 
                          flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">SignalWire</h1>
            <div className="text-[10px] text-gray-600">Analytics Dashboard</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm 
                          font-medium transition-all duration-150 ${
                activeView === item.id 
                  ? 'text-white bg-white/10 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className={activeView === item.id ? 'text-cyan-400' : ''}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-[11px] text-gray-600">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            System Online
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-white/5 bg-[#0a0a0a] flex items-center 
                          justify-between px-5 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 hover:bg-white/5 rounded-lg text-gray-400" 
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="text-sm text-gray-400 font-medium">
              {navItems.find(n => n.id === activeView)?.label || 'Dashboard'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider">Period</div>
              <div className="text-xs font-semibold text-white">Last 24 Hours</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
          {children}
        </div>
      </main>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col h-full p-6">
            <div className="flex justify-end mb-8">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X className="text-white" size={24} />
              </button>
            </div>
            <nav className="space-y-2">
              {navItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-4 w-full p-4 rounded-xl text-lg font-semibold
                    ${activeView === item.id ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};
