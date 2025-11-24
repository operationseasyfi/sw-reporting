import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CarrierView } from './components/CarrierView';
import { LatencyView } from './components/LatencyView';
import { AlertsView } from './components/AlertsView';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('dashboard');

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'carriers': return <CarrierView />;
      case 'latency': return <LatencyView />;
      case 'alerts': return <AlertsView />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout activeView={activeView} setActiveView={setActiveView}>
      {renderContent()}
    </Layout>
  );
};

export default App;

