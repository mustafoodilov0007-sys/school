import { useState } from 'react';
import { t } from '@pep/shared';
import { ErrorState, Loading } from './components/ui';
import { useAuth } from './lib/auth';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { ExamPage } from './pages/ExamPage';
import { ResultsPage } from './pages/Simple';
import { SchoolPage } from './pages/School';
import { ParentApp } from './pages/Parent';
import { LinkScreen } from './pages/Link';

type Tab = 'home' | 'exam' | 'school' | 'results' | 'profile';
const TABS: { id: Tab; label: () => string; icon: string }[] = [
  { id: 'home', label: () => t('app_nav_home'), icon: '🏠' },
  { id: 'exam', label: () => t('app_nav_exam'), icon: '📝' },
  { id: 'school', label: () => 'Maktab', icon: '🏫' },
  { id: 'results', label: () => t('app_nav_results'), icon: '📊' },
  { id: 'profile', label: () => t('app_nav_profile'), icon: '👤' },
];

export function App() {
  const { state, retry, link } = useAuth();
  const [tab, setTab] = useState<Tab>('home');

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'unlinked') return <LinkScreen onLink={link} />;
  if (state.status === 'ready' && state.role === 'parent') return <ParentApp parent={state.parent} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.retryable ? retry : undefined} />;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      <main className="flex-1 pb-24">
        {tab === 'home' && <Home onOpenExam={() => setTab('exam')} />}
        {tab === 'exam' && <ExamPage />}
        {tab === 'school' && <SchoolPage />}
        {tab === 'results' && <ResultsPage />}
        {tab === 'profile' && <Profile />}
      </main>
      <nav aria-label="Asosiy navigatsiya" className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-xl">
          {TABS.map((x) => (
            <li key={x.id} className="flex-1">
              <button
                onClick={() => setTab(x.id)}
                aria-current={tab === x.id ? 'page' : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs ${tab === x.id ? 'font-semibold text-brand' : 'text-mute'}`}
              >
                <span aria-hidden="true" className="text-lg">{x.icon}</span>
                {x.label()}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
