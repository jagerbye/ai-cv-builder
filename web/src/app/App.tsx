import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveRoute, type RouteEntry } from './routes';
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

// Pass-through until T-06 decides the unauthenticated behaviour. No guard is
// specified yet, so none is invented here.
function ProtectedBranch({ children }: { children: ReactNode }) {
  return <>{children}</>;
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
  const route = resolveRoute(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="shell">
        <header className="shell-header">
          <span className="shell-brand">AI CV Builder</span>
        </header>
        <main className="shell-main">
          {route ? <Screen route={route} /> : <NotFound />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
