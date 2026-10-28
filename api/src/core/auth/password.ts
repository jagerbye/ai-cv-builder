import * as nodeCrypto from 'node:crypto';
import { promisify } from 'node:util';

// argon2id (domain-model.md User.passwordHash). Built on node:crypto.argon2,
// available from Node 24.7. No npm dependency is added.
// Parameters follow the OWASP minimum for argon2id: 19 MiB memory, 2 passes, 1 lane.
// The stored form is the PHC string, so the salt travels with the hash (per-user salt).

type Argon2Fn = (
  algorithm: 'argon2id',
  parameters: { message: Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number },
) => Promise<Buffer>;

// @types/node 22 does not declare crypto.argon2 yet, so the binding is narrowed here.
// A Node without it fails loudly on the first hash, never with a weaker fallback.
function loadArgon2(): Argon2Fn {
  const fn = (nodeCrypto as unknown as { argon2?: (...a: unknown[]) => void }).argon2;
  if (typeof fn !== 'function') {
    throw new Error('argon2id unavailable: node:crypto.argon2 needs Node 24.7 or later');
  }
  return promisify(fn) as unknown as Argon2Fn;
}

// Resolved on first use, not at import: on Node 22 (the container runtime) an import-time throw
// would stop the whole server from booting, taking every other lane's routes with it.
let argon2Cached: Argon2Fn | undefined;
const argon2Async: Argon2Fn = (algorithm, parameters) => (argon2Cached ??= loadArgon2())(algorithm, parameters);
const { randomBytes, timingSafeEqual } = nodeCrypto;

const MEMORY_KIB = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const tag = await argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
    memory: MEMORY_KIB,
    passes: PASSES,
  });
  return `$argon2id$v=19$m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}$${salt.toString('base64url')}$${tag.toString('base64url')}`;
}

// Verifies a PHC string produced by hashPassword. Used by login (T-04).
export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(phc);
  if (!m) return false;
  const expected = Buffer.from(m[5], 'base64url');
  const actual = await argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: Buffer.from(m[4], 'base64url'),
    parallelism: Number(m[3]),
    tagLength: expected.length,
    memory: Number(m[1]),
    passes: Number(m[2]),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
