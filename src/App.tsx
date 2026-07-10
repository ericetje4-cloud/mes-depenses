// ===========================================================================
// App : racine. Initialise le store + PWA, branche le routing et les
// providers (Toasts). Affiche un splash le temps de l'init IndexedDB.
// ===========================================================================

import { useEffect, useState } from 'react';
import { initStore, useStore } from '@/hooks/useStore';
import { setupPWA } from '@/lib/pwa';
import { getSetting } from '@/lib/db';
import { setApiKey, setModel, DEFAULT_MODEL } from '@/lib/gemini';
import { useNavigation } from '@/hooks/useNavigation';
import { ToastProvider } from '@/components/ui';
import { DashboardPage } from '@/pages/DashboardPage';
import { AddPage } from '@/pages/AddPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { RecurringPage } from '@/pages/RecurringPage';
import { AgentPage } from '@/pages/AgentPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  const { ready } = useStore();
  const { route } = useNavigation();
  const [inited, setInited] = useState(false);

  // Initialisation unique : IndexedDB + Service Worker + clé Gemini.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initStore();
      // Charge la clé API + le modèle sauvegardés pour l'agent.
      const key = await getSetting('geminiKey');
      if (key) setApiKey(key);
      const model = await getSetting('geminiModel');
      setModel(model ?? DEFAULT_MODEL);
      setupPWA();
      if (!cancelled) setInited(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Splash pendant l'initialisation.
  if (!inited || !ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-brand-600 text-white">
          <span className="text-2xl">€</span>
        </div>
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      {renderRoute(route)}
    </ToastProvider>
  );
}

function renderRoute(route: ReturnType<typeof useNavigation>['route']) {
  switch (route) {
    case 'dashboard':
      return <DashboardPage />;
    case 'add':
      return <AddPage />;
    case 'history':
      return <HistoryPage />;
    case 'budgets':
      return <BudgetsPage />;
    case 'recurring':
      return <RecurringPage />;
    case 'agent':
      return <AgentPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}
