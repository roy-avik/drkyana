import { useRouter } from './router';
import { Home } from './pages/Home';
import { ReceptionistPage } from './pages/ReceptionistPage';
import { AccountPage } from './pages/AccountPage';
import { LegalPage } from './pages/LegalPage';
import { NotFound } from './pages/NotFound';

export function App() {
  const { path } = useRouter();
  // Normalize a trailing slash so "/terms/" is the same page as "/terms".
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path;

  if (p === '/') return <Home />;
  if (p === '/receptionist') return <ReceptionistPage />;
  if (p === '/account') return <AccountPage />;
  if (p === '/terms') return <LegalPage page="terms" />;
  if (p === '/privacy') return <LegalPage page="privacy" />;
  if (p === '/support') return <LegalPage page="support" />;
  // Anything else is a genuine 404 — not a silent render of Home.
  return <NotFound />;
}
