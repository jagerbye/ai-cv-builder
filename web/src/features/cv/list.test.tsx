// QA-03 (sprint 001, lane B) — /cvs is the CV list. It fetches C-007
// (GET /api/cvs) and renders each item; only a genuinely empty list may say
// "You have no CVs yet.". Only fetch is stubbed: CvRoute, the client and
// TanStack Query run for real. Link targets and visible values are the handles.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CvRoute from './route';

interface ListItem {
  id: string;
  title: string;
  targetRole: string;
  state: 'generating' | 'ready' | 'failed';
  updatedAt: string;
}

// C-007 items, newest first, one per state the list has to show.
const items: ListItem[] = [
  { id: 'cv-a1', title: 'Payments backend', targetRole: 'Senior backend engineer', state: 'ready', updatedAt: '2026-10-27T09:00:00.000Z' },
  { id: 'cv-b2', title: 'Compilers', targetRole: 'Principal engineer', state: 'generating', updatedAt: '2026-10-20T08:00:00.000Z' },
  { id: 'cv-c3', title: 'Data platform', targetRole: 'Staff engineer', state: 'failed', updatedAt: '2026-09-02T12:30:00.000Z' },
];

// Exact text per row, so a wrong day or year fails.
const UPDATED_TEXT: Record<string, string> = {
  'cv-a1': 'Updated Oct 27, 2026',
  'cv-b2': 'Updated Oct 20, 2026',
  'cv-c3': 'Updated Sep 2, 2026',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Stubs fetch and returns the URLs it was called with.
function stubFetch(reply: () => Response | Promise<Response>): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      return reply();
    }),
  );
  return calls;
}

function mountList() {
  window.history.replaceState({}, '', '/cvs');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CvRoute />
    </QueryClientProvider>,
  );
}

// The row for one item: the nearest ancestor of its editor link that holds the
// target role. It must hold no other item's title, so a shared container fails.
function rowFor(item: ListItem): HTMLElement {
  let el: HTMLElement | null = document.querySelector<HTMLElement>(`a[href="/cvs/${item.id}"]`);
  expect(el, `editor link for ${item.title}`).not.toBeNull();
  while (el && !el.textContent?.includes(item.targetRole)) el = el.parentElement;
  expect(el, `row for ${item.title}`).not.toBeNull();
  for (const other of items.filter((o) => o.id !== item.id)) {
    expect(el!.textContent, `row for ${item.title} must not hold ${other.title}`).not.toContain(other.title);
  }
  return el!;
}

// Every editor link on the page, excluding the create link.
function editorLinks(): string[] {
  return Array.from(document.querySelectorAll('a[href^="/cvs/"]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((href) => href !== '/cvs/new');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('CV list — fetch and render (QA-03, C-007)', () => {
  it('GETs /api/cvs once and links one row per CV to its editor, in the order the server sent', async () => {
    const calls = stubFetch(() => json(200, { items }));
    mountList();
    await screen.findByText('Payments backend');
    expect(calls).toEqual(['/api/cvs']);
    expect(editorLinks()).toEqual(['/cvs/cv-a1', '/cvs/cv-b2', '/cvs/cv-c3']);
  });

  it("renders each CV's title, target role, state and updated date from its C-007 item", async () => {
    stubFetch(() => json(200, { items }));
    mountList();
    await screen.findByText('Compilers');
    for (const item of items) {
      const row = rowFor(item);
      expect(row.textContent, `${item.title} title`).toContain(item.title);
      expect(row.textContent, `${item.title} target role`).toContain(item.targetRole);
      expect(row.textContent, `${item.title} state`).toMatch(new RegExp(item.state, 'i'));
      expect(row.querySelector('time')?.textContent, `${item.title} updated`).toBe(UPDATED_TEXT[item.id]);
    }
  });

  it('shows the empty state only for a user who genuinely has no CVs, with a way to create one', async () => {
    stubFetch(() => json(200, { items: [] }));
    mountList();
    expect(await screen.findByText('You have no CVs yet.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your CVs' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create your first CV' }).getAttribute('href')).toBe('/cvs/new');
    expect(editorLinks()).toEqual([]);
  });

  it('does not say the user has no CVs while the list is still loading (negative case)', () => {
    stubFetch(() => new Promise<Response>(() => {}));
    mountList();
    expect(screen.queryByText('You have no CVs yet.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the list could not load on a 500 envelope and never claims the user has no CVs (error case)', async () => {
    stubFetch(() => json(500, { error: { code: 'INTERNAL', message: 'The CV list is unavailable right now.' } }));
    mountList();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The CV list is unavailable right now.');
    expect(screen.queryByText('You have no CVs yet.')).toBeNull();
    expect(editorLinks()).toEqual([]);
  });

  it('says the list could not load when the request never reaches the server (error case)', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    mountList();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(screen.queryByText('You have no CVs yet.')).toBeNull();
  });
});
