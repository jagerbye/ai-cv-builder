// QA-13: an untitled CV must read the same in the list and in the editor.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { cvDisplayTitle } from './title';
import { cvA, installApi, mountEditor, registerEditorHooks } from './testkit';

registerEditorHooks();
afterEach(() => cleanup());

describe('cvDisplayTitle', () => {
  it('falls back for empty and blank titles, keeps real ones', () => {
    expect(cvDisplayTitle('')).toBe('Untitled CV');
    expect(cvDisplayTitle('   ')).toBe('Untitled CV');
    expect(cvDisplayTitle(undefined)).toBe('Untitled CV');
    expect(cvDisplayTitle('Payments backend')).toBe('Payments backend');
  });
});

describe('QA-13 editor heading', () => {
  it('renders "Untitled CV" in the single h1 when the title is empty', async () => {
    installApi([{ ...cvA(), title: '' }]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Contact' });
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Untitled CV');
  });

  it('keeps a real title as is', async () => {
    installApi([{ ...cvA(), title: 'Payments backend' }]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Contact' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Payments backend');
  });
});

describe('QA-13 list uses the same function', () => {
  it('shows the fallback for an untitled row', async () => {
    const { default: CvRoute } = await import('./route');
    const { render } = await import('@testing-library/react');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    window.history.replaceState({}, '', '/cvs');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ items: [{ id: 'x', title: '', targetRole: 'R', state: 'ready', updatedAt: '2026-10-01T00:00:00Z' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CvRoute />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('link', { name: 'Untitled CV' })).toBeTruthy();
  });
});
