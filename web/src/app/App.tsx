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

// aria-current="page" only on the exact page; inside a CV (/cvs/:id) the list is
// the section the user is in, which is "true", not "page".
function navCurrent(pathname: string, target: '/cvs' | '/cvs/new'): 'page' | 'true' | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (target === '/cvs/new') return path === '/cvs/new' ? 'page' : undefined;
  if (path === '/cvs') return 'page';
  return path.startsWith('/cvs/') && path !== '/cvs/new' ? 'true' : undefined;
}

// Shown only with a session (useSessionUser is the one source of that state), so a
// signed-out visitor sees the brand and nothing to click. Plain links: a full
// load, like every other link here. No icons (design.json icons.needed is empty).
function HeaderActions({ pathname }: { pathname: string }) {
  const session = useSessionUser();
  if (!session.data) return null;
  return (
    <>
      <nav className="shell-nav" aria-label="Main">
        <a href="/cvs" aria-current={navCurrent(pathname, '/cvs')}>My CVs</a>
        <a href="/cvs/new" aria-current={navCurrent(pathname, '/cvs/new')}>New CV</a>
      </nav>
      <LogoutButton />
    </>
  );
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
    <section className="page screen-message">
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
          <HeaderActions pathname={pathname} />
        </header>
        <main className="shell-main">
          {isFrontDoor ? <FrontDoor /> : route ? <Screen route={route} /> : <NotFound />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
