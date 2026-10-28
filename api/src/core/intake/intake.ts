import { PDFParse } from 'pdf-parse';

// T-15 (CVB-7, spec §3.2, C-003/C-004). Turns the user's input into the verbatim
// source text. No database and no LLM here: persistence lives in persist.ts and
// the generation pipeline never sees the raw binary.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;
export const MIN_SOURCE_CHARS = 200;
export const MAX_SOURCE_CHARS = 50000;

export type IntakeErrorCode = 'VALIDATION' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_SOURCE';

export class IntakeError extends Error {
  constructor(
    readonly code: IntakeErrorCode,
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

export type SourceInput = { kind: 'text'; text: string } | { kind: 'pdf'; bytes: Buffer };

export interface ExtractedSource {
  kind: 'pdf' | 'text';
  text: string;
}

export async function extractSource(input: SourceInput): Promise<ExtractedSource> {
  return input.kind === 'text' ? checkText(input.text) : extractPdf(input.bytes);
}

function checkText(text: string): ExtractedSource {
  if (text.length < MIN_SOURCE_CHARS) {
    throw new IntakeError(
      'VALIDATION',
      400,
      `sourceText must be at least ${MIN_SOURCE_CHARS} characters; paste more of your work history`,
    );
  }
  if (text.length > MAX_SOURCE_CHARS) {
    throw new IntakeError(
      'VALIDATION',
      400,
      `sourceText must be at most ${MAX_SOURCE_CHARS} characters; shorten it or split it into two CVs`,
    );
  }
  return { kind: 'text', text };
}

export const PDF_TOO_LARGE_MESSAGE = 'the PDF is larger than 10 MB; export a smaller file or paste the text instead';

async function extractPdf(bytes: Buffer): Promise<ExtractedSource> {
  if (bytes.length > MAX_PDF_BYTES) {
    throw new IntakeError(
      'PAYLOAD_TOO_LARGE',
      413,
      PDF_TOO_LARGE_MESSAGE,
    );
  }
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new IntakeError(
      'UNSUPPORTED_SOURCE',
      400,
      'this file is not a PDF (the file signature is wrong); upload a .pdf or paste the text instead',
    );
  }
  const { pages, text } = await readPdf(bytes);
  if (pages > MAX_PDF_PAGES) {
    throw new IntakeError(
      'UNSUPPORTED_SOURCE',
      400,
      `this PDF has more than ${MAX_PDF_PAGES} pages; upload a shorter one or paste the text instead`,
    );
  }
  // Whitespace does not count: a page of blank lines is still a scan.
  if (text.replace(/\s+/g, '').length < MIN_SOURCE_CHARS) {
    throw new IntakeError('UNSUPPORTED_SOURCE', 400, 'this PDF looks like a scan; paste the text instead');
  }
  return { kind: 'pdf', text };
}

async function readPdf(bytes: Buffer): Promise<{ pages: number; text: string }> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return { pages: result.total, text: result.text };
  } catch {
    // Acted on: a malformed PDF becomes a user-facing fix, not a 500.
    throw new IntakeError('UNSUPPORTED_SOURCE', 400, 'this PDF could not be read; paste the text instead');
  } finally {
    await parser.destroy();
  }
}
