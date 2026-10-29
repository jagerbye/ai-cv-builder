import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';

// T-15 (CVB-7). Contract tests for C-003 (JSON, sourceText) and C-004 (multipart, PDF)
// on POST /api/cvs. Real Fastify app via buildServer() and real Postgres, never mocked:
// persistence and the 2-second budget are part of the criteria.
// Error envelope (C-000): { error: { code, message } }.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used-by-intake';

const { buildServer } = await import('../../api/src/server.js');

const MB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type App = ReturnType<typeof buildServer>;
let app: App;
let cookie: string;
let userId: string;
// POST /api/cvs commits queued jobs, and a parallel job suite's worker claims ANY
// queued row (errors.md E-002). Hold the job-suite lock so the two never overlap.
let suite: JobTestSuite | undefined;

// Same generator as the unit suite: a known career sentence, cut to exactly n characters.
function chars(n: number): string {
  const unit = 'Built payment APIs for retail clients in a team of six. ';
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
}

// Minimal structurally valid PDF with one text page per entry ('' = page with no text).
function buildPdf(pages: string[]): Buffer {
  const n = pages.length;
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const pageNum = 4 + 2 * i;
    const contentNum = 5 + 2 * i;
    objs[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`;
    const ops = text
      .split('\n')
      .map((line, j) => {
        const escaped = line.replace(/[\\()]/g, (c) => `\\${c}`);
        return `BT /F1 11 Tf 72 ${780 - j * 14} Td (${escaped}) Tj ET`;
      })
      .join('\n');
    objs[contentNum] = `<< /Length ${Buffer.byteLength(ops, 'latin1')} >>\nstream\n${ops}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let k = 1; k < objs.length; k++) {
    offsets[k] = Buffer.byteLength(out, 'latin1');
    out += `${k} 0 obj\n${objs[k]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out +=
    `xref\n0 ${objs.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
  const boundary = `----cvintake${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
        'utf8',
      ),
      file.data,
      Buffer.from('\r\n', 'utf8'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie },
  };
}

function postJson(body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/cvs',
    headers: { cookie, 'content-type': 'application/json' },
    payload: body as object,
  });
}

function postPdf(pages: string[], targetRole = 'Senior Backend Engineer') {
  return app.inject({
    method: 'POST',
    url: '/api/cvs',
    ...multipart({ targetRole }, { name: 'cv.pdf', type: 'application/pdf', data: buildPdf(pages) }),
  });
}

async function cvCount(): Promise<number> {
  return app.prisma.cv.count({ where: { userId } });
}

// One session user makes ~70 writes here; F-010 allows 60/min and 10 generations/h per user.
// The limiter stays on; each test starts with fresh counters.
beforeEach(() => {
  app.resetRateLimits();
});

beforeAll(async () => {
  app = buildServer();
  await app.ready();
  // POST /api/cvs creates the jobs over HTTP, so this suite holds the lock without enqueue().
  suite = openJobTestSuite(app.prisma);
  await suite.lock();
  // Session set up directly in the database (ADR-007, database-schema.md): the cookie
  // value is opaque and its sha256 is stored as tokenHash. This keeps intake tests
  // independent of the auth routes, which other lanes own.
  const user = await app.prisma.user.create({
    data: { email: `intake-${randomUUID()}@test.local`, passwordHash: 'not-used-by-intake-tests' },
  });
  userId = user.id;
  const token = randomBytes(32).toString('base64url');
  await app.prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  cookie = `sid=${token}`;
}, JOB_SUITE_LOCK_WAIT_MS);

afterAll(async () => {
  if (app) {
    await app.prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  }
  await suite?.release();
});

describe('POST /api/cvs, JSON body (C-003, spec §3.2)', () => {
  it('returns 201 with exactly { cvId, jobId } as uuids, and the CV is in state generating', async () => {
    const res = await postJson({ sourceText: chars(200), targetRole: 'Product Manager' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['cvId', 'jobId']);
    expect(body.cvId).toMatch(UUID);
    expect(body.jobId).toMatch(UUID);
    const cv = await app.prisma.cv.findUnique({ where: { id: body.cvId } });
    expect(cv?.state).toBe('generating');
    expect(cv?.userId).toBe(userId);
    expect(cv?.sourceKind).toBe('text');
    expect(cv?.targetRole).toBe('Product Manager');
  });

  it('enqueues a queued job for that CV, and the job id from the response is that job', async () => {
    const res = await postJson({ sourceText: chars(1200), targetRole: 'Data Engineer' });
    expect(res.statusCode).toBe(201);
    const { cvId, jobId } = res.json();
    const job = await app.prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(job?.cvId).toBe(cvId);
    expect(job?.status).toBe('queued');
  });

  it('persists the pasted sourceText VERBATIM before responding (whitespace, newlines, tabs, non-ASCII kept)', async () => {
    const sourceText = `  Иван Петров\n\tPython developer, 2020-2024  \n"quoted" and 'single' \\ ${chars(260)}\n`;
    const res = await postJson({ sourceText, targetRole: 'Python Developer' });
    expect(res.statusCode).toBe(201);
    const cv = await app.prisma.cv.findUnique({ where: { id: res.json().cvId } });
    expect(cv?.sourceText).toBe(sourceText);
  });

  it('accepts sourceText at exactly 200 and exactly 50000 characters', async () => {
    const low = await postJson({ sourceText: chars(200), targetRole: 'Analyst' });
    const high = await postJson({ sourceText: chars(50000), targetRole: 'Analyst' });
    expect(low.statusCode).toBe(201);
    expect(high.statusCode).toBe(201);
  });

  it('rejects sourceText of 199 and 50001 characters with 400 VALIDATION and creates no CV', async () => {
    const before = await cvCount();
    const short = await postJson({ sourceText: chars(199), targetRole: 'Analyst' });
    const long = await postJson({ sourceText: chars(50001), targetRole: 'Analyst' });
    for (const res of [short, long]) {
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    }
    expect(await cvCount()).toBe(before);
  });

  it('accepts targetRole of 1 and 120 characters, rejects empty and 121 characters with 400 VALIDATION', async () => {
    const ok1 = await postJson({ sourceText: chars(300), targetRole: 'x' });
    const ok120 = await postJson({ sourceText: chars(300), targetRole: 'r'.repeat(120) });
    const empty = await postJson({ sourceText: chars(300), targetRole: '' });
    const long = await postJson({ sourceText: chars(300), targetRole: 'r'.repeat(121) });
    expect(ok1.statusCode).toBe(201);
    expect(ok120.statusCode).toBe(201);
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('VALIDATION');
    expect(long.statusCode).toBe(400);
    expect(long.json().error.code).toBe('VALIDATION');
  });

  it('rejects a JSON body with no targetRole with 400 VALIDATION', async () => {
    const res = await postJson({ sourceText: chars(300) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });

  it('rejects a multipart body that supplies both sourceText and a file with 400 VALIDATION', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart(
        { targetRole: 'Backend Engineer', sourceText: chars(300) },
        { name: 'cv.pdf', type: 'application/pdf', data: buildPdf([`${chars(300)}`]) },
      ),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });

  it('rejects a request with neither sourceText nor a file with 400 VALIDATION', async () => {
    const onlyRole = await postJson({ targetRole: 'Backend Engineer' });
    const multipartNoSource = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Backend Engineer' }),
    });
    for (const res of [onlyRole, multipartNoSource]) {
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    }
  });

  it('error bodies follow the envelope with a human message and no stack trace', async () => {
    const res = await postJson({ sourceText: chars(10), targetRole: 'Analyst' });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(typeof error.message).toBe('string');
    expect(error.message.trim().length).toBeGreaterThan(10);
    expect(error.message).not.toMatch(/\n\s+at /);
  });
});

describe('POST /api/cvs, multipart PDF (C-004, spec §3.2)', () => {
  it('returns 201 for a valid two-page text PDF, stores the extracted text as the source and no binary', async () => {
    const pages = [
      `Senior backend engineer at Acme Corp, 2019 to 2024.\n${chars(150)}`,
      `Education: BSc Computer Science, 2015.\n${chars(150)}`,
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Senior Backend Engineer' }, { name: 'cv.pdf', type: 'application/pdf', data: buildPdf(pages) }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['cvId', 'jobId']);
    const cv = await app.prisma.cv.findUnique({ where: { id: body.cvId } });
    expect(cv?.state).toBe('generating');
    expect(cv?.sourceKind).toBe('pdf');
    expect(cv?.sourceText).toContain('Senior backend engineer at Acme Corp');
    expect(cv?.sourceText).toContain('BSc Computer Science');
    expect(cv?.sourceText.length).toBeGreaterThanOrEqual(200);
    // The binary is not retained anywhere on the row.
    for (const value of Object.values(cv ?? {})) {
      if (typeof value === 'string') expect(value).not.toContain('%PDF-');
    }
    const job = await app.prisma.generationJob.findUnique({ where: { id: body.jobId } });
    expect(job?.cvId).toBe(body.cvId);
    expect(job?.status).toBe('queued');
  });

  it('accepts a PDF of exactly 20 pages and rejects 21 with 400 UNSUPPORTED_SOURCE naming the 20-page limit', async () => {
    const page = (i: number) => `Page ${i}: Senior backend engineer at Acme Corp, 2019 to 2024.`;
    const twenty = await postPdf(Array.from({ length: 20 }, (_, i) => page(i + 1)));
    const twentyOne = await postPdf(Array.from({ length: 21 }, (_, i) => page(i + 1)));
    expect(twenty.statusCode).toBe(201);
    expect(twentyOne.statusCode).toBe(400);
    expect(twentyOne.json().error.code).toBe('UNSUPPORTED_SOURCE');
    expect(twentyOne.json().error.message).toMatch(/20 pages/);
  });

  it('rejects a file over 10 MB with 413 PAYLOAD_TOO_LARGE, and accepts a 9 MB PDF', async () => {
    const head = Buffer.from('%PDF-1.4\n', 'latin1');
    const tooBig = Buffer.concat([head, Buffer.alloc(10 * MB + 1 - head.length, 0x0a)]);
    const bigRes = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Analyst' }, { name: 'huge.pdf', type: 'application/pdf', data: tooBig }),
    });
    expect(bigRes.statusCode).toBe(413);
    expect(bigRes.json().error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(bigRes.json().error.message).toMatch(/10 MB/);

    // Lines stay under the page width: pdf.js drops text that runs past the page edge.
    const pdf = buildPdf([`Senior backend engineer at Acme Corp.\n${chars(80)}\n${chars(80)}\n${chars(80)}\n${chars(80)}`]);
    const nine = Buffer.concat([pdf, Buffer.alloc(9 * MB - pdf.length, 0x0a)]);
    const okRes = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Analyst' }, { name: 'nine.pdf', type: 'application/pdf', data: nine }),
    });
    expect(okRes.statusCode).toBe(201);
  });

  it('rejects bytes that are not a PDF (no %PDF- magic) with 400 UNSUPPORTED_SOURCE', async () => {
    const before = await cvCount();
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart(
        { targetRole: 'Analyst' },
        { name: 'report.pdf', type: 'application/pdf', data: Buffer.from('PK\u0003\u0004 word/document.xml', 'latin1') },
      ),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_SOURCE');
    expect(res.json().error.message).toMatch(/PDF/);
    expect(await cvCount()).toBe(before);
  });

  it('rejects a scanned PDF (no text layer) with the scan message that says to paste the text', async () => {
    const res = await postPdf(['']);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_SOURCE');
    expect(res.json().error.message).toContain('this PDF looks like a scan; paste the text instead');
  });

  it('rejects a PDF with fewer than 200 extractable characters with the same scan message', async () => {
    const res = await postPdf(['Senior backend engineer at Acme Corp, 2019 to 2024.']);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_SOURCE');
    expect(res.json().error.message).toContain('this PDF looks like a scan; paste the text instead');
  });

  it('maps a body over the transport limit (12 MB) to 413 naming the 10 MB fix', async () => {
    const head = Buffer.from('%PDF-1.4\n', 'latin1');
    const huge = Buffer.concat([head, Buffer.alloc(12 * MB - head.length, 0x0a)]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Analyst' }, { name: 'huge.pdf', type: 'application/pdf', data: huge }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(res.json().error.message).toMatch(/10 MB/);
  });

  it('gives each PDF rejection a distinct message (size, magic, pages, scan)', async () => {
    const head = Buffer.from('%PDF-1.4\n', 'latin1');
    const size = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart(
        { targetRole: 'Analyst' },
        { name: 'a.pdf', type: 'application/pdf', data: Buffer.concat([head, Buffer.alloc(10 * MB + 1 - head.length, 0x0a)]) },
      ),
    });
    const magic = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({ targetRole: 'Analyst' }, { name: 'b.pdf', type: 'application/pdf', data: Buffer.from('PK\u0003\u0004', 'latin1') }),
    });
    const pages = await postPdf(Array.from({ length: 21 }, (_, i) => `Page ${i + 1}: Senior backend engineer at Acme Corp.`));
    const scan = await postPdf(['']);
    const messages = [size, magic, pages, scan].map((r) => r.json().error.message as string);
    expect(new Set(messages).size).toBe(4);
    for (const m of messages) expect(m.trim().length).toBeGreaterThan(10);
  });

  it('rejects a multipart PDF with no targetRole with 400 VALIDATION (not a source error)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      ...multipart({}, { name: 'cv.pdf', type: 'application/pdf', data: buildPdf([`${chars(300)}`]) }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });
});

describe('POST /api/cvs timing (spec §3.2: 201 within 2 seconds)', () => {
  it('answers a JSON create within 2000 ms', async () => {
    const started = performance.now();
    const res = await postJson({ sourceText: chars(3000), targetRole: 'Platform Engineer' });
    const elapsed = performance.now() - started;
    expect(res.statusCode).toBe(201);
    expect(elapsed).toBeLessThan(2000);
  });

  it('answers a two-page PDF create within 2000 ms', async () => {
    const started = performance.now();
    const res = await postPdf([`Senior backend engineer.\n${chars(400)}`, chars(400)]);
    const elapsed = performance.now() - started;
    expect(res.statusCode).toBe(201);
    expect(elapsed).toBeLessThan(2000);
  });
});
