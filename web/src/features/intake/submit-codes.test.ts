// C-000 / ADR-018: both submit paths (JSON text, multipart PDF) surface the
// server's message for provider failures and for codes the client does not know.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFromPdf, createFromText } from './submit';

afterEach(() => vi.unstubAllGlobals());

const cases: Array<[string, string]> = [
  ['LLM_AUTH_FAILED', 'The generation service rejected the configured API key.'],
  ['LLM_INVALID_REQUEST', 'The generation service rejected the request.'],
  ['A_CODE_FROM_THE_FUTURE', 'Brand new failure, said plainly by the server.'],
];

function stub(code: string, message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: { code, message } }), { status: 502 })),
  );
}

describe('submit errors keep the server message', () => {
  for (const [code, message] of cases) {
    it(`text path: ${code}`, async () => {
      stub(code, message);
      await expect(createFromText('x', 'role')).rejects.toMatchObject({ code, message });
    });
    it(`pdf path: ${code}`, async () => {
      stub(code, message);
      const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
      await expect(createFromPdf(file, 'role')).rejects.toMatchObject({ code, message });
    });
  }

  it('still maps a non-envelope body to the generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(createFromText('x', 'role')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
    });
  });
});
