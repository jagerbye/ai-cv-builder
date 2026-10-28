// T-14 (CVB-14) — progress view. Acceptance tests written before code.
// Contract the developer implements (spec §3.3, C-005, ADR-003):
//   web/src/features/generation/route.tsx default-exports the progress screen.
//   The screen reads the job id from the pathname `/jobs/:jobId` (RouteEntry
//   components take no props). It polls GET /api/jobs/:id every 2 s through
//   TanStack Query while status is queued|running, stops on a terminal status,
//   and never writes progress to browser storage.
// Tests mock only the network (fetch); the component and the query client run
// for real.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GenerationRoute from './route';

const JOB_PATH = '/api/jobs/job-1';

interface JobBody {
  id: string;
  cvId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'extracting' | 'composing' | 'verifying' | null;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error?: { code: string; message: string };
}

const baseJob: JobBody = {
  id: 'job-1',
  cvId: 'cv-1',
  status: 'running',
  stage: 'extracting',
  attempt: 1,
  startedAt: '2026-10-28T10:00:00.000Z',
  finishedAt: null,
};

// The "server" the mocked network answers from. Tests change it to simulate
// the job moving on, or the browser reloading into a changed world.
let serverJob: JobBody = { ...baseJob };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockNetwork() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === JOB_PATH && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(200, serverJob);
    }
    if (url === '/api/cvs/cv-1/regenerate' && init?.method === 'POST') {
      return jsonResponse(202, { ...baseJob, id: 'job-2', status: 'queued', stage: null });
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jobCalls(fetchMock: ReturnType<typeof mockNetwork>): number {
  return fetchMock.mock.calls.filter(([url, init]) => url === JOB_PATH && (init?.method ?? 'GET') === 'GET').length;
}

// A fresh QueryClient per mount is what a browser reload does: nothing survives
// in memory, so whatever the screen shows must come from the server.
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GenerationRoute />
    </QueryClientProvider>,
  );
}

async function flushFakeTime(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  serverJob = { ...baseJob };
  window.history.replaceState({}, '', '/jobs/job-1');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('progress view — polling (C-005, ADR-003, CVB-14)', () => {
  it('polls GET /api/jobs/:id every 2 s while the job is running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const fetchMock = mockNetwork();
    mount();
    await flushFakeTime(0);
    expect(jobCalls(fetchMock)).toBe(1);
    await flushFakeTime(1999);
    expect(jobCalls(fetchMock)).toBe(1);
    await flushFakeTime(1);
    expect(jobCalls(fetchMock)).toBe(2);
    await flushFakeTime(2000);
    expect(jobCalls(fetchMock)).toBe(3);
  });

  it('keeps polling while the job is queued', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    serverJob = { ...baseJob, status: 'queued', stage: null };
    const fetchMock = mockNetwork();
    mount();
    await flushFakeTime(0);
    await flushFakeTime(2000);
    expect(jobCalls(fetchMock)).toBe(2);
  });

  it('stops polling once the job has succeeded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    serverJob = { ...baseJob, status: 'succeeded', stage: null, finishedAt: '2026-10-28T10:01:00.000Z' };
    const fetchMock = mockNetwork();
    mount();
    await flushFakeTime(0);
    const after = jobCalls(fetchMock);
    expect(after).toBe(1);
    await flushFakeTime(10000);
    expect(jobCalls(fetchMock)).toBe(after);
  });

  it('stops polling once the job has failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    serverJob = {
      ...baseJob,
      status: 'failed',
      stage: 'composing',
      finishedAt: '2026-10-28T10:01:00.000Z',
      error: { code: 'JOB_TIMEOUT', message: 'Generation took longer than 180 seconds.' },
    };
    const fetchMock = mockNetwork();
    mount();
    await flushFakeTime(0);
    const after = jobCalls(fetchMock);
    expect(after).toBe(1);
    await flushFakeTime(10000);
    expect(jobCalls(fetchMock)).toBe(after);
  });
});

describe('progress view — named stage, no fake percentage (spec §3.3)', () => {
  it.each([
    ['extracting', /extracting/i],
    ['composing', /composing/i],
    ['verifying', /verifying/i],
  ])('shows the server stage "%s" by name', async (stage, label) => {
    serverJob = { ...baseJob, stage: stage as JobBody['stage'] };
    mockNetwork();
    mount();
    expect(await screen.findByText(label)).toBeTruthy();
  });

  it('never shows a percentage while the job runs', async () => {
    serverJob = { ...baseJob, stage: 'composing' };
    mockNetwork();
    const { container } = mount();
    await screen.findByText(/composing/i);
    expect(container.textContent ?? '').not.toMatch(/\d\s*%/);
  });

  it('does not show a stage name the server did not send', async () => {
    serverJob = { ...baseJob, stage: 'extracting' };
    mockNetwork();
    mount();
    await screen.findByText(/extracting/i);
    expect(screen.queryByText(/verifying/i)).toBeNull();
    expect(screen.queryByText(/composing/i)).toBeNull();
  });
});

describe('progress view — reload safety (spec §3.3, ADR-003)', () => {
  it('a fresh mount fetches from the server and shows the stage the server holds now', async () => {
    serverJob = { ...baseJob, stage: 'extracting' };
    const fetchMock = mockNetwork();
    const first = mount();
    await screen.findByText(/extracting/i);
    first.unmount();

    // The job moved on while the page was gone.
    serverJob = { ...baseJob, stage: 'verifying' };
    mount();
    expect(await screen.findByText(/verifying/i)).toBeTruthy();
    expect(screen.queryByText(/extracting/i)).toBeNull();
    expect(jobCalls(fetchMock)).toBe(2);
  });

  it('writes no progress state to localStorage or sessionStorage', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    serverJob = { ...baseJob, stage: 'composing' };
    mockNetwork();
    mount();
    await screen.findByText(/composing/i);
    expect(setLocal).not.toHaveBeenCalled();
  });
});

describe('progress view — failed job (spec §3.3 criterion 5)', () => {
  it('shows the classified reason from the server', async () => {
    serverJob = {
      ...baseJob,
      status: 'failed',
      stage: 'verifying',
      finishedAt: '2026-10-28T10:01:00.000Z',
      error: { code: 'JOB_TIMEOUT', message: 'Generation took longer than 180 seconds.' },
    };
    mockNetwork();
    mount();
    expect(await screen.findByText(/longer than 180 seconds/i)).toBeTruthy();
    expect(screen.queryByText(/extracting|composing|verifying/i)).toBeNull();
  });

  it('offers regenerate and POSTs it for the job CV', async () => {
    serverJob = {
      ...baseJob,
      status: 'failed',
      stage: 'composing',
      finishedAt: '2026-10-28T10:01:00.000Z',
      error: { code: 'LLM_INVALID_OUTPUT', message: 'The draft could not be verified.' },
    };
    const fetchMock = mockNetwork();
    mount();
    const button = await screen.findByRole('button', { name: /regenerate/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/cvs/cv-1/regenerate' && init?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('shows the not-found reason for an unknown job instead of a spinner', async () => {
    mockNetwork();
    window.history.replaceState({}, '', '/jobs/missing-job');
    serverJob = baseJob;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <GenerationRoute />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/no such route/i)).toBeTruthy();
    expect(screen.queryByText(/extracting|composing|verifying/i)).toBeNull();
  });
});

describe('progress view — succeeded job (spec §3.3)', () => {
  it('moves to the CV view when the job succeeds', async () => {
    serverJob = { ...baseJob, status: 'succeeded', stage: null, finishedAt: '2026-10-28T10:01:00.000Z' };
    mockNetwork();
    mount();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/cvs/cv-1');
    });
  });
});
