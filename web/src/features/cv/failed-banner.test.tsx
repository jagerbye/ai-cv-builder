// C-006 / ADR-017: a CV in state `failed` shows lastError.message and offers
// regenerate (C-010) as the retry.
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { cvA, installApi, mountEditor, registerEditorHooks, jsonResponse } from './testkit';


registerEditorHooks();

function failedCv(code: string, message: string) {
  return { ...cvA(), state: 'failed' as const, lastError: { code, message } };
}

describe('failed CV banner', () => {
  for (const [code, message] of [
    ['LLM_AUTH_FAILED', 'The generation service rejected the configured API key.'],
    ['LLM_INVALID_REQUEST', 'The generation service rejected the request.'],
    ['A_CODE_FROM_THE_FUTURE', 'Words the client has never seen.'],
  ]) {
    it(`shows the lastError message for ${code}`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      installApi([failedCv(code, message) as any]);
      mountEditor('/cvs/cv-1');
      const banner = await screen.findByRole('alert');
      expect(banner.textContent).toContain(message);
      expect(banner.textContent).not.toContain(code);
      expect(banner.textContent).not.toContain('went wrong on our side');
    });
  }

  it('offers Regenerate, which POSTs C-010 and opens the new job', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    installApi([failedCv('LLM_UNAVAILABLE', 'The generation service is unavailable.') as any]);
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => {
      if (u === '/api/cvs/cv-1/regenerate' && i?.method === 'POST') {
        calls.push(u);
        return jsonResponse(202, { jobId: 'job-9' });
      }
      return base(u, i);
    });
    mountEditor('/cvs/cv-1');
    fireEvent.click(await screen.findByRole('button', { name: /regenerate/i }));
    await waitFor(() => expect(calls).toEqual(['/api/cvs/cv-1/regenerate']));
  });

  it('shows no banner for a ready CV', async () => {
    installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Contact' });
    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
  });
});
