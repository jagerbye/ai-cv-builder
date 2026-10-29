import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveRoute, type RouteEntry } from './routes';
import { RequireSession, LogoutButton, useSessionUser } from '../features/auth/session';
import FrontDoor from './FrontDoor';
import './shell.css';

function currentPath(): string {
  return window.location.pathname;
}

// Tracks the address bar so back and forward re-resolve the route. Plain links
// do a full load, so no client-side navigate API is needed yet.
function usePathname(): string {
  const [pathname, setPathname] = useState(currentPath);
  useEffect(() => {
    const onPop = () => setPathname(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return pathname;
}

function ProtectedBranch({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}

function HeaderActions() {
  const session = useSessionUser();
  return session.data ? <LogoutButton /> : null;
}

function Screen({ route }: { route: RouteEntry }) {
  const Component = route.component;
  if (route.branch === 'protected') {
    return (
      <ProtectedBranch>
        <Component />
      </ProtectedBranch>
    );
  }
  return <Component />;
}

function NotFound() {
  return (
    <section className="screen-message">
      <h1>Page not found</h1>
      <p>The address you opened does not match a page in this app.</p>
    </section>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const pathname = usePathname();
  // "/" is not a registry entry: it redirects by session state (QA-02).
  const isFrontDoor = pathname === '/';
  const route = isFrontDoor ? undefined : resolveRoute(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="shell">
        <header className="shell-header">
          <span className="shell-brand">AI CV Builder</span>
          <HeaderActions />
        </header>
        <main className="shell-main">
          {isFrontDoor ? <FrontDoor /> : route ? <Screen route={route} /> : <NotFound />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
