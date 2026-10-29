// Progress stepper over the known sequence queued -> extracting -> composing -> verifying.
// Position in a known sequence is a fact; a percentage would be invented, so none is shown.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GenerationRoute from './route';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function show(job: Record<string, unknown>) {
  window.history.replaceState({}, '', '/jobs/job-1');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(200, {
        id: 'job-1', cvId: 'cv-1', attempt: 1, startedAt: null, finishedAt: null, ...job,
      }),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GenerationRoute />
    </QueryClientProvider>,
  );
  return screen.findByRole('list', { name: 'Generation steps' });
}

// [label, state] where state comes from the item's visible/accessible state word.
function states(list: HTMLElement): Array<[string, string]> {
  return within(list)
    .getAllByRole('listitem')
    .map((li) => {
      const label = li.querySelector('[data-step-label]')!.textContent!;
      const state = li.getAttribute('data-state')!;
      return [label, state];
    });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('progress stepper', () => {
  it('lists the four known steps in order', async () => {
    const list = await show({ status: 'running', stage: 'extracting' });
    expect(states(list).map(([l]) => l)).toEqual(['Queued', 'Extracting', 'Composing', 'Verifying']);
  });

  it('queued: Queued is current ("not started"), the rest are ahead, none done', async () => {
    const list = await show({ status: 'queued', stage: null });
    expect(states(list).map(([, s]) => s)).toEqual(['current', 'ahead', 'ahead', 'ahead']);
    const current = list.querySelector('[aria-current="step"]')!;
    expect(current.textContent).toContain('Queued');
    expect(current.textContent).toContain('Waiting to start');
  });

  it.each([
    ['extracting', ['done', 'current', 'ahead', 'ahead']],
    ['composing', ['done', 'done', 'current', 'ahead']],
    ['verifying', ['done', 'done', 'done', 'current']],
  ])('running at %s marks earlier steps done, this one current, later ones plain', async (stage, expected) => {
    const list = await show({ status: 'running', stage });
    expect(states(list).map(([, s]) => s)).toEqual(expected);
    expect(list.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it('state is in text for a screen reader, not only in styling', async () => {
    const list = await show({ status: 'running', stage: 'composing' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0].textContent).toContain('done');
    expect(items[2].getAttribute('aria-current')).toBe('step');
    expect(items[2].textContent).toContain('in progress');
    expect(items[3].textContent).not.toMatch(/done|in progress|failed/);
  });

  it('a failed job shows where it failed: earlier done, that step failed, later ahead', async () => {
    const list = await show({ status: 'failed', stage: 'composing', error: { code: 'INTERNAL', message: 'Boom.' } });
    expect(states(list).map(([, s]) => s)).toEqual(['done', 'done', 'failed', 'ahead']);
    expect(list.querySelector('[aria-current]')).toBeNull();
    expect(within(list).getAllByRole('listitem')[2].textContent).toContain('failed');
  });

  it('a failure before any stage started fails the Queued step', async () => {
    const list = await show({ status: 'failed', stage: null, error: { code: 'INTERNAL', message: 'Boom.' } });
    expect(states(list).map(([, s]) => s)).toEqual(['failed', 'ahead', 'ahead', 'ahead']);
  });

  it('never shows a percentage and never uses the progressbar role', async () => {
    const list = await show({ status: 'running', stage: 'composing' });
    expect(document.body.textContent).not.toMatch(/\d\s*%/);
    expect(document.querySelector('[role="progressbar"], progress')).toBeNull();
    expect(list.tagName).toBe('OL');
  });
});
