import React from 'react';
import { LayoutDashboard, Bell, Menu, X, Zap, RefreshCw } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, setActiveView }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={20} /> },
  ];

  return (
    <div className="flex h-screen w-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200">
        {/* Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 
                            flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">SignalWire</h1>
              <div className="text-xs text-slate-400">Analytics</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm 
                          font-medium transition-all ${
                activeView === item.id 
                  ? 'text-blue-600 bg-blue-50 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Connected
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center 
                          justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600" 
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {navItems.find(n => n.id === activeView)?.label || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Time Period</div>
              <div className="text-sm font-medium text-slate-700">Last 24 Hours</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex flex-col h-full p-6">
            <div className="flex justify-end mb-8">
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            <nav className="space-y-2">
              {navItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-4 w-full p-4 rounded-xl text-lg font-medium
                    ${activeView === item.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
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
