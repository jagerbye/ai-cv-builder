import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildSeedData, seedQaCv } from '../../scripts/seed-qa.js';
import { verify } from '../../api/src/core/generation/verify.js';
import { prisma, userIds } from './generation-persist.fixtures.js';

// E-007. The QA seed stores the questions verify() returns for its draft; it never writes a path by hand.
// This test pins the two halves: the draft yields exactly the three questions QA drives, and every path
// is in the C-006 field-level grammar (ADR-016), so a fixture cannot speak an older dialect than the verifier.

const FIELD_PATH =
  /^(summary\.text|experience\[\d+\]\.(employer|period|role)|experience\[\d+\]\.bullets\[\d+\]\.text|education\[\d+\]\.(institution|period)|skills\[\d+\]\.name)$/;

describe('QA seed questions come from verify()', () => {
  const { draft, facts } = buildSeedData();
  const { questions } = verify(draft, facts);

  it('yields three open questions on three different sections', () => {
    expect(questions).toHaveLength(3);
    const sections = questions.map((q) => q.path.split(/[.[]/)[0]).sort();
    expect(sections).toEqual(['experience', 'skills', 'summary']);
  });

  it('every question path names a field in the C-006 grammar', () => {
    for (const q of questions) expect(q.path).toMatch(FIELD_PATH);
  });

  it('never carries the pre-ADR-016 bare spellings', () => {
    const paths = questions.map((q) => q.path);
    expect(paths).not.toContain('summary');
    expect(paths.some((p) => /^skills\[\d+\]$/.test(p))).toBe(false);
  });
});

describe('the seed STORES what verify() returned', () => {
  afterAll(async () => {
    // Deletes by the id the seed returned (E-005); the user's CV, items and questions cascade.
    const ids = userIds.splice(0);
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('writes one stored question row per verify() question, with its path, text, reason and priority', async () => {
    const id = randomUUID();
    const { userId, cvId } = await seedQaCv(prisma, { email: `seed-qa-${id}@example.test`, title: `seed-qa-test-${id}` });
    userIds.push(userId);

    const { draft, facts } = buildSeedData();
    const expected = verify(draft, facts).questions.map((q) => ({ path: q.path, text: q.text, reason: q.reason, priority: q.priority, status: 'open' }));
    const stored = await prisma.question.findMany({ where: { cvId }, select: { path: true, text: true, reason: true, priority: true, status: true } });

    expect(expected).toHaveLength(3);
    const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
    expect([...stored].sort(byPath)).toEqual([...expected].sort(byPath));
  });
});
