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
