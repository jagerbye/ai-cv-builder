// T-13 (CVB-13) — intake screen, F-002 / spec §3.2 / C-003 + C-004.
// Assumed UI names (no spec wording exists for them; the developer should use these):
//   tabs "Paste text" and "Upload PDF" (role=tab); textarea labelled "Paste your CV text";
//   file input labelled "PDF file"; field labelled "Target role"; submit button "Generate CV";
//   every validation or server message is rendered inside role=alert.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntakeRoute from './route';

const MB = 1024 * 1024;
const NARROW = 375;
const WIDE = 1280;
const CV_ID = '3f2c9a1e-7b4d-4e8a-9c2d-1a2b3c4d5e6f';
const JOB_ID = '9d1e2f3a-4b5c-4d6e-8f70-123456789abc';

function textOfLength(n: number): string {
  return 'Built payment services in Go and led two migrations. '.repeat(Math.ceil(n / 50)).slice(0, n);
}

// Evaluates (min-width: Npx) / (max-width: Npx) conditions against a viewport width.
function mediaMatches(query: string, width: number): boolean {
  const conds = [...query.matchAll(/\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g)];
  if (conds.length === 0) return false;
  return conds.every(([, kind, px]) => (kind === 'min' ? width >= Number(px) : width <= Number(px)));
}

function setViewport(width: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mediaMatches(query, width),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function stubFetch(status: number, body: unknown, contentType = 'application/json') {
  const payload = contentType === 'application/json' ? JSON.stringify(body) : String(body);
  const fn = vi.fn(async () => new Response(payload, { status, headers: { 'content-type': contentType } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <IntakeRoute />
    </QueryClientProvider>,
  );
}

function fillText(text: string, role = 'Staff engineer') {
  fireEvent.change(screen.getByLabelText(/paste your cv text/i), { target: { value: text } });
  fireEvent.change(screen.getByLabelText(/target role/i), { target: { value: role } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /generate cv/i }));
}

function alertTexts(): string {
  return screen
    .queryAllByRole('alert')
    .map((el) => el.textContent ?? '')
    .join(' | ');
}

function pdfFile(sizeBytes: number): File {
  const file = new File(['%PDF-1.7 minimal'], 'old-cv.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function choosePdf(file: File) {
  fireEvent.click(screen.getByRole('tab', { name: /upload pdf/i }));
  fireEvent.change(screen.getByLabelText(/pdf file/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/target role/i), { target: { value: 'Staff engineer' } });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/cvs/new');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('intake modes (spec §3.2, CVB-13)', () => {
  it('defaults to the free-text tab on a narrow viewport', () => {
    setViewport(NARROW);
    renderRoute();
    expect(screen.getByRole('tab', { name: /paste/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /upload pdf/i }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByLabelText(/paste your cv text/i)).toBeTruthy();
  });

  it('offers both input modes on a wide viewport', () => {
    setViewport(WIDE);
    renderRoute();
    expect(screen.getByRole('tab', { name: /paste/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /upload pdf/i }));
    expect(screen.getByRole('tab', { name: /upload pdf/i }).getAttribute('aria-selected')).toBe('true');
    const input = screen.getByLabelText(/pdf file/i);
    expect(input.getAttribute('accept') ?? '').toMatch(/pdf/);
  });

  it('switches from free text to the PDF tab on a narrow viewport', () => {
    setViewport(NARROW);
    renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /upload pdf/i }));
    expect(screen.getByRole('tab', { name: /upload pdf/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /paste/i }).getAttribute('aria-selected')).toBe('false');
  });
});

describe('target role field (C-003 targetRole 1..120)', () => {
  it('blocks submit with an explanation when the target role is empty', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(400), '');
    submit();
    await waitFor(() => expect(alertTexts()).toMatch(/target role/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a 120-character role and rejects a 121-character role before any request', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(400), 'r'.repeat(121));
    submit();
    await waitFor(() => expect(alertTexts()).toMatch(/120/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a 120-character role unchanged', async () => {
    setViewport(NARROW);
    const role = 'R'.repeat(120);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(400), role);
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).targetRole).toBe(role);
  });
});

describe('pasted text guards (sourceText 200..50000)', () => {
  it('blocks 199 characters and explains how to fix it', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(199));
    submit();
    await waitFor(() => expect(alertTexts()).toMatch(/200/));
    expect(alertTexts()).toMatch(/add|more|detail/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 200 characters', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(200));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('accepts exactly 50000 characters', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(50000));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('blocks 50001 characters and says how much to trim', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(50001));
    submit();
    await waitFor(() => expect(alertTexts()).toMatch(/50[,. ]?000/));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PDF guards (10 MB)', () => {
  it('blocks a file over 10 MB before upload and suggests pasting the text', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    choosePdf(pdfFile(10 * MB + 1));
    submit();
    await waitFor(() => expect(alertTexts()).toMatch(/10 ?MB/i));
    expect(alertTexts()).toMatch(/paste/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 10 MB and uploads it as multipart', async () => {
    setViewport(NARROW);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    choosePdf(pdfFile(10 * MB));
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('targetRole')).toBe('Staff engineer');
    expect(body.has('sourceText')).toBe(false);
  });
});

describe('request shape (C-003 JSON, C-004 multipart)', () => {
  it('posts pasted text as JSON to /api/cvs with exactly sourceText and targetRole', async () => {
    setViewport(NARROW);
    const text = textOfLength(300);
    const fetchMock = stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(text, 'Platform lead');
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cvs');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toMatch(/application\/json/);
    expect(JSON.parse(String(init.body))).toEqual({ sourceText: text, targetRole: 'Platform lead' });
  });
});

describe('server rejections render as human messages', () => {
  it('shows the scanned-PDF message verbatim and never the error code', async () => {
    setViewport(NARROW);
    stubFetch(400, {
      error: {
        code: 'UNSUPPORTED_SOURCE',
        message: 'This PDF looks like a scan; paste the text instead.',
      },
    });
    renderRoute();
    choosePdf(pdfFile(1 * MB));
    submit();
    await waitFor(() => expect(alertTexts()).toContain('This PDF looks like a scan; paste the text instead.'));
    expect(document.body.textContent).not.toContain('UNSUPPORTED_SOURCE');
  });

  it('shows the server message for a 413 PAYLOAD_TOO_LARGE rejection', async () => {
    setViewport(NARROW);
    stubFetch(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'That file is over 10 MB. Compress it or paste the text.' } });
    renderRoute();
    choosePdf(pdfFile(1 * MB));
    submit();
    await waitFor(() => expect(alertTexts()).toContain('That file is over 10 MB. Compress it or paste the text.'));
    expect(document.body.textContent).not.toContain('PAYLOAD_TOO_LARGE');
  });

  it('shows the server message for a 429 RATE_LIMITED rejection', async () => {
    setViewport(NARROW);
    stubFetch(429, { error: { code: 'RATE_LIMITED', message: 'You have reached 10 generations this hour. Try again later.' } });
    renderRoute();
    fillText(textOfLength(400));
    submit();
    await waitFor(() => expect(alertTexts()).toContain('You have reached 10 generations this hour. Try again later.'));
    expect(document.body.textContent).not.toContain('RATE_LIMITED');
  });

  it('shows the server message for a 400 VALIDATION rejection', async () => {
    setViewport(NARROW);
    stubFetch(400, {
      error: {
        code: 'VALIDATION',
        message: 'Check the highlighted fields.',
        details: [{ path: 'targetRole', message: 'Target role is required.' }],
      },
    });
    renderRoute();
    fillText(textOfLength(400));
    submit();
    await waitFor(() => expect(alertTexts()).toContain('Check the highlighted fields.'));
    expect(document.body.textContent).not.toContain('VALIDATION');
  });

  it('shows a generic message, not the raw body, for a non-JSON 500', async () => {
    setViewport(NARROW);
    stubFetch(500, '<html><body>Stack trace: db password</body></html>', 'text/html');
    renderRoute();
    fillText(textOfLength(400));
    submit();
    await waitFor(() => expect(alertTexts().length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toContain('Stack trace');
    expect(document.body.textContent).not.toContain('db password');
  });
});

describe('success navigates to the progress view', () => {
  it('moves to the progress view carrying the returned jobId and cvId', async () => {
    setViewport(NARROW);
    stubFetch(201, { cvId: CV_ID, jobId: JOB_ID });
    renderRoute();
    fillText(textOfLength(400));
    submit();
    await waitFor(() => expect(window.location.href).toContain(JOB_ID));
    expect(window.location.href).toContain(CV_ID);
    expect(window.location.pathname).not.toBe('/cvs/new');
  });

  it('stays on the intake screen when the server rejects the request', async () => {
    setViewport(NARROW);
    stubFetch(429, { error: { code: 'RATE_LIMITED', message: 'Slow down.' } });
    renderRoute();
    fillText(textOfLength(400));
    submit();
    await waitFor(() => expect(alertTexts()).toContain('Slow down.'));
    expect(window.location.pathname).toBe('/cvs/new');
  });
});
