import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ERROR_CODES } from '../../api/src/http/errors.js';

// ADR-017 / ADR-018 (sprint 001, lane F). last_error_code is a closed set, so the database holds it with a
// CHECK like every other enum-like column. The constraint must accept exactly the C-000 enum and nothing else.

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function constraintLiterals(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ def: string }[]>`
    SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'cvs' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%last_error_code%'`;
  expect(rows).toHaveLength(1);
  return [...rows[0]!.def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
}

// Inserts a throwaway user and CV with the given code, inside a transaction that is always rolled back.
async function tryInsert(code: string | null): Promise<'accepted' | 'rejected'> {
  const userId = randomUUID();
  const sentinel = new Error('rollback');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: `lasterr-check-${userId}@example.test`, passwordHash: 'x' } });
      await tx.cv.create({
        data: {
          userId,
          title: 't',
          targetRole: 'r',
          sourceKind: 'text',
          sourceText: 's',
          state: 'failed',
          lastErrorCode: code,
          lastErrorMessage: code === null ? null : 'm',
        },
      });
      throw sentinel;
    });
  } catch (err) {
    if (err === sentinel) return 'accepted';
    return 'rejected';
  }
  return 'rejected';
}

describe('cvs.last_error_code CHECK', () => {
  it('lists exactly the C-000 enum, so the schema and the contract cannot diverge', async () => {
    expect([...(await constraintLiterals())].sort()).toEqual([...ERROR_CODES].sort());
  });

  it('includes the two provider failures of ADR-018', () => {
    expect(ERROR_CODES).toContain('LLM_AUTH_FAILED');
    expect(ERROR_CODES).toContain('LLM_INVALID_REQUEST');
  });

  it('accepts every enum code and NULL', async () => {
    for (const code of [...ERROR_CODES, null]) {
      expect(await tryInsert(code), String(code)).toBe('accepted');
    }
  });

  it('rejects a code outside the enum, including a gateway-internal one and a lowercase spelling', async () => {
    for (const code of ['LLM_BUDGET_EXCEEDED', 'internal', '', 'ECONNREFUSED']) {
      expect(await tryInsert(code), code).toBe('rejected');
    }
  });
});
