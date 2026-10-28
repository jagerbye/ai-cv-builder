// T-05 (CVB-5) — shell screens, one smoke render each. The App owns its own
// TanStack Query provider, so it is rendered with no wrapper here.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('app shell (T-05, CVB-5)', () => {
  it('renders the shell with the product name and a main region on a public route', async () => {
    const { routes } = await import('./routes');
    const { default: App } = await import('./App');
    const pub = (routes as Array<{ branch: string; path: string }>).find((r) => r.branch === 'public');
    expect(pub).toBeDefined();
    window.history.replaceState({}, '', pub!.path.replace(/:[A-Za-z_]+/g, 'test-id'));
    render(<App />);
    expect(screen.getByRole('banner').textContent).toContain('AI CV Builder');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('renders a not-found screen with non-empty heading content for an undeclared path', async () => {
    const { default: App } = await import('./App');
    window.history.replaceState({}, '', '/no-such-page');
    render(<App />);
    const heading = screen.getByRole('heading');
    expect(heading.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(screen.getByRole('banner').textContent).toContain('AI CV Builder');
  });
});
