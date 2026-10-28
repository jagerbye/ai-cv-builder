import { describe, it, expect } from 'vitest';
import { extractSource, IntakeError } from './intake.js';

// T-15 (CVB-7, spec.md §3.2, C-003/C-004). Unit tests for the intake core:
// it turns a PDF or pasted text into the verbatim source text, or throws an
// IntakeError with a stable code, HTTP status and a human message naming the fix.
//
// Interface under test (to be implemented by the developer):
//   extractSource({ kind: 'text', text }) | ({ kind: 'pdf', bytes: Buffer })
//     -> Promise<{ kind: 'pdf' | 'text'; text: string }>
//   IntakeError: { code, status, message }
// No Buffer and no PDF bytes are returned; the caller keeps nothing else.

const MB = 1024 * 1024;

// Repeats a sentence and cuts it to exactly n characters.
function chars(n: number): string {
  const unit = 'Built payment APIs for retail clients in a team of six. ';
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
}

// Minimal but structurally valid PDF with one text page per entry.
// An empty string makes a page with no text operators (a scan look-alike).
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
    // pdf.js clips glyphs past the MediaBox, so long lines are wrapped like a real page.
    const wrapped = text.split('\n').flatMap((l) => l.match(/.{1,85}/g) ?? ['']);
    const ops = wrapped
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

const CAREER_LINE = 'Senior backend engineer at Acme Corp, 2019 to 2024. Owned the billing platform.';

async function rejection(p: Promise<unknown>): Promise<IntakeError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(IntakeError);
    return err as IntakeError;
  }
  throw new Error('expected extractSource to reject, but it resolved');
}

describe('extractSource: pasted text (C-003, F-002 sourceText rule)', () => {
  it('returns the pasted text verbatim at the 200-character lower bound', async () => {
    const text = chars(200);
    const out = await extractSource({ kind: 'text', text });
    expect(out.kind).toBe('text');
    expect(out.text).toBe(text);
    expect(out.text.length).toBe(200);
  });

  it('returns the pasted text verbatim at the 50000-character upper bound', async () => {
    const text = chars(50000);
    const out = await extractSource({ kind: 'text', text });
    expect(out.text).toBe(text);
    expect(out.text.length).toBe(50000);
  });

  it('keeps whitespace, newlines and non-ASCII exactly as pasted (no trimming, no normalising)', async () => {
    const text = `  Иван Петров\n\tPython developer, 2020-2024  \n${chars(260)}\n`;
    const out = await extractSource({ kind: 'text', text });
    expect(out.text).toBe(text);
  });

  it('rejects 199 characters with a VALIDATION error naming the minimum', async () => {
    const err = await rejection(extractSource({ kind: 'text', text: chars(199) }));
    expect(err.code).toBe('VALIDATION');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/200/);
  });

  it('rejects 50001 characters with a VALIDATION error naming the maximum', async () => {
    const err = await rejection(extractSource({ kind: 'text', text: chars(50001) }));
    expect(err.code).toBe('VALIDATION');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/50\s?000/);
  });

  it('rejects an empty string with VALIDATION', async () => {
    const err = await rejection(extractSource({ kind: 'text', text: '' }));
    expect(err.code).toBe('VALIDATION');
    expect(err.status).toBe(400);
  });
});

describe('extractSource: PDF (C-004, F-002 rejection rules)', () => {
  it('extracts the selectable text of a valid two-page PDF and reports kind pdf', async () => {
    const pdf = buildPdf([`${CAREER_LINE}\n${chars(150)}`, `Education: BSc Computer Science, 2015.\n${chars(150)}`]);
    const out = await extractSource({ kind: 'pdf', bytes: pdf });
    expect(out.kind).toBe('pdf');
    expect(out.text).toContain('Senior backend engineer at Acme Corp');
    expect(out.text).toContain('BSc Computer Science');
    expect(out.text.length).toBeGreaterThanOrEqual(200);
  });

  it('does not return the binary: no Buffer in the result and no PDF header in the text', async () => {
    const pdf = buildPdf([`${CAREER_LINE}\n${chars(300)}`]);
    const out = await extractSource({ kind: 'pdf', bytes: pdf });
    expect(Object.values(out).some((v) => Buffer.isBuffer(v))).toBe(false);
    expect(out.text).not.toContain('%PDF-');
  });

  it('rejects a file over 10 MB with 413 PAYLOAD_TOO_LARGE naming the 10 MB limit', async () => {
    const head = Buffer.from('%PDF-1.4\n', 'latin1');
    const big = Buffer.concat([head, Buffer.alloc(10 * MB + 1 - head.length, 0x0a)]);
    const err = await rejection(extractSource({ kind: 'pdf', bytes: big }));
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.status).toBe(413);
    expect(err.message).toMatch(/10 MB/);
  });

  it('accepts a 9 MB PDF (under the limit) and extracts its text', async () => {
    const pdf = buildPdf([`${CAREER_LINE}\n${chars(300)}`]);
    const padded = Buffer.concat([pdf, Buffer.alloc(9 * MB - pdf.length, 0x0a)]);
    const out = await extractSource({ kind: 'pdf', bytes: padded });
    expect(out.text).toContain('Senior backend engineer at Acme Corp');
  });

  it('rejects bytes that do not start with %PDF- with UNSUPPORTED_SOURCE and a message naming the fix', async () => {
    const docxLike = Buffer.from('PK\u0003\u0004 word/document.xml Senior engineer at Acme', 'latin1');
    const err = await rejection(extractSource({ kind: 'pdf', bytes: docxLike }));
    expect(err.code).toBe('UNSUPPORTED_SOURCE');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/PDF/);
  });

  it('rejects plain text sent as a PDF with the same magic-bytes error (a different input, same rule)', async () => {
    const err = await rejection(extractSource({ kind: 'pdf', bytes: Buffer.from(chars(400), 'latin1') }));
    expect(err.code).toBe('UNSUPPORTED_SOURCE');
    expect(err.status).toBe(400);
  });

  it('accepts a PDF of exactly 20 pages', async () => {
    const pages = Array.from({ length: 20 }, (_, i) => `Page ${i + 1}: ${CAREER_LINE}`);
    const out = await extractSource({ kind: 'pdf', bytes: buildPdf(pages) });
    expect(out.text).toContain('Page 20');
  });

  it('rejects a PDF of 21 pages with UNSUPPORTED_SOURCE naming the 20-page limit', async () => {
    const pages = Array.from({ length: 21 }, (_, i) => `Page ${i + 1}: ${CAREER_LINE}`);
    const err = await rejection(extractSource({ kind: 'pdf', bytes: buildPdf(pages) }));
    expect(err.code).toBe('UNSUPPORTED_SOURCE');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/20 pages/);
  });

  it('rejects a scanned PDF (no text layer) with the scan message that tells the user to paste the text', async () => {
    const err = await rejection(extractSource({ kind: 'pdf', bytes: buildPdf(['']) }));
    expect(err.code).toBe('UNSUPPORTED_SOURCE');
    expect(err.status).toBe(400);
    expect(err.message).toContain('this PDF looks like a scan; paste the text instead');
  });

  it('rejects a PDF with fewer than 200 extractable characters with the same scan message', async () => {
    const err = await rejection(extractSource({ kind: 'pdf', bytes: buildPdf([CAREER_LINE]) }));
    expect(err.code).toBe('UNSUPPORTED_SOURCE');
    expect(err.message).toContain('this PDF looks like a scan; paste the text instead');
  });

  it('gives each PDF rejection its own human message (size, magic bytes, pages, scan)', async () => {
    const head = Buffer.from('%PDF-1.4\n', 'latin1');
    const tooBig = Buffer.concat([head, Buffer.alloc(10 * MB + 1 - head.length, 0x0a)]);
    const notPdf = Buffer.from('PK\u0003\u0004 word/document.xml', 'latin1');
    const tooManyPages = buildPdf(Array.from({ length: 21 }, (_, i) => `Page ${i + 1}: ${CAREER_LINE}`));
    const scan = buildPdf(['']);

    const messages = [
      (await rejection(extractSource({ kind: 'pdf', bytes: tooBig }))).message,
      (await rejection(extractSource({ kind: 'pdf', bytes: notPdf }))).message,
      (await rejection(extractSource({ kind: 'pdf', bytes: tooManyPages }))).message,
      (await rejection(extractSource({ kind: 'pdf', bytes: scan }))).message,
    ];
    for (const m of messages) {
      expect(m.trim().length).toBeGreaterThan(10);
      expect(m).not.toMatch(/\n\s+at /);
    }
    expect(new Set(messages).size).toBe(4);
  });
});
