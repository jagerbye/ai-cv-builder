// Requests for POST /api/cvs (C-003 JSON, C-004 multipart) and the hand-off to
// the progress view. Pasted text goes through the shared client; the PDF body
// is multipart, which the shared client does not send yet (see the lane report).

import { ApiError, ERROR_CODES, apiFetch } from '../../api/client';

export interface CreatedCv {
  cvId: string;
  jobId: string;
}

const NETWORK_MESSAGE = 'We could not reach the server. Check your connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export function createFromText(sourceText: string, targetRole: string): Promise<CreatedCv> {
  return apiFetch<CreatedCv>('/cvs', { method: 'POST', body: { sourceText, targetRole } });
}

export function createFromPdf(file: File, targetRole: string): Promise<CreatedCv> {
  const body = new FormData();
  body.append('file', file);
  body.append('targetRole', targetRole);
  return postMultipart(body);
}

// Moves to /jobs/:jobId without a reload. The App listens for popstate, so the
// dispatched event re-resolves the route to the progress view.
export function openProgress(created: CreatedCv): void {
  const url = `/jobs/${encodeURIComponent(created.jobId)}?cvId=${encodeURIComponent(created.cvId)}`;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

async function postMultipart(body: FormData): Promise<CreatedCv> {
  let res: Response;
  try {
    res = await fetch('/api/cvs', { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'INTERNAL', NETWORK_MESSAGE);
  }
  if (!res.ok) throw await envelopeError(res);
  return (await res.json()) as CreatedCv;
}

// Same C-000 envelope rules as web/src/api/client.ts: anything that is not the
// envelope becomes a generic message, and the raw body is never shown.
async function envelopeError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiError(res.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  const error = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
  if (!error || typeof error.message !== 'string' || !(ERROR_CODES as readonly unknown[]).includes(error.code)) {
    return new ApiError(res.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  const details = Array.isArray(error.details)
    ? error.details.filter(
        (d): d is { path: string; message: string } =>
          !!d && typeof d.path === 'string' && typeof d.message === 'string',
      )
    : undefined;
  return new ApiError(res.status, error.code as ApiError['code'], error.message, details);
}
