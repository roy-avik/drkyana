import { useRouter } from './router';
import { Home } from './pages/Home';
import { ReceptionistPage } from './pages/ReceptionistPage';
import { AccountPage } from './pages/AccountPage';

export function App() {
  const { path } = useRouter();
  if (path === '/receptionist') return <ReceptionistPage />;
  if (path === '/account') return <AccountPage />;
  return <Home />;
}
