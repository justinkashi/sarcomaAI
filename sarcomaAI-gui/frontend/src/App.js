import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { initCornerstone } from './utils/initCornerstone';
import SetupWizard from './components/SetupWizard';
import MainLayout from './components/MainLayout';

function AppInner() {
  const { isConfigured } = useApp();
  return isConfigured ? <MainLayout /> : <SetupWizard />;
}

function App() {
  useEffect(() => { initCornerstone(); }, []);
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}

export default App;
