// T-15 (CVB-7, C-004). A bounded multipart/form-data reader. Intake needs only text fields and at most one
// file part, from a body Fastify has already buffered under a byte cap, so @fastify/multipart's streaming
// machinery buys nothing here and its surface is larger than what this reads (architecture.md §1). That is a
// deliberate trade — hand-rolled parsing of an untrusted wire format — and the bounds are the reason it is
// defensible: MAX_PARTS, Fastify's byte cap before this runs, and no recursion.

export const MAX_PARTS = 8;

export interface MultipartFile {
  name: string;
  bytes: Buffer;
}

export interface MultipartBody {
  fields: Record<string, string>;
  files: MultipartFile[];
}

export class MultipartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MultipartError';
  }
}

export function boundaryOf(contentType: string): string | null {
  const match = /boundary=(?:"([^"]{1,200})"|([^;\s]{1,200}))/i.exec(contentType);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

export function parseMultipart(body: Buffer, contentType: string): MultipartBody {
  const boundary = boundaryOf(contentType);
  if (!boundary) throw new MultipartError('the upload has no multipart boundary');
  const delimiter = Buffer.from(`--${boundary}`, 'latin1');
  const out: MultipartBody = { fields: {}, files: [] };

  let pos = body.indexOf(delimiter);
  if (pos < 0) throw new MultipartError('the upload is not valid multipart data');
  let parts = 0;
  for (;;) {
    pos += delimiter.length;
    // "--" right after a delimiter closes the body.
    if (body.subarray(pos, pos + 2).toString('latin1') === '--') return out;
    if (body.subarray(pos, pos + 2).toString('latin1') !== '\r\n') {
      throw new MultipartError('the upload is not valid multipart data');
    }
    pos += 2;
    if (++parts > MAX_PARTS) throw new MultipartError('the upload has too many parts');

    const headEnd = body.indexOf('\r\n\r\n', pos, 'latin1');
    if (headEnd < 0) throw new MultipartError('the upload is not valid multipart data');
    const head = body.subarray(pos, headEnd).toString('utf8');
    const next = body.indexOf(Buffer.concat([Buffer.from('\r\n'), delimiter]), headEnd + 4);
    if (next < 0) throw new MultipartError('the upload is truncated');
    const content = body.subarray(headEnd + 4, next);

    const disposition = /^content-disposition:[^\r\n]*$/im.exec(head)?.[0] ?? '';
    const name = /[;\s]name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /[;\s]filename="([^"]*)"/i.exec(disposition)?.[1];
    if (name === undefined) throw new MultipartError('the upload has a part without a name');
    if (filename !== undefined) {
      if (name === 'file') out.files.push({ name: filename, bytes: Buffer.from(content) });
    } else {
      out.fields[name] = content.toString('utf8');
    }
    pos = next + 2;
  }
}
