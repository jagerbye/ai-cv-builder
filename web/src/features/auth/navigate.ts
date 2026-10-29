// Client-side navigation for the shell router. App re-resolves the route on
// popstate, so a navigation dispatches one after updating the address bar.
export function navigate(path: string, mode: 'push' | 'replace' = 'push'): void {
  if (mode === 'replace') {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Sign-in is reached from a deep link with ?next=<path>. The destination must be
// a path inside this app: no protocol-relative or absolute URLs, and no /auth
// paths, which would send a signed-in visitor back to the form in a loop.
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  if (!next) return '/cvs';
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return '/cvs';
  }
  if (url.origin !== window.location.origin) return '/cvs';
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return '/cvs';
  return url.pathname + url.search + url.hash;
}

// The sign-in path that carries the visitor's current destination.
export function loginPathFor(destination: string): string {
  return `/auth/login?next=${encodeURIComponent(destination)}`;
}
