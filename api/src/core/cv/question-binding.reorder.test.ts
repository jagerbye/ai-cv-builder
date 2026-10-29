import { describe, it, expect, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { verify } from '../generation/verify.js';
import type { CvDraft, Fact } from '../generation/types.js';
import { persistDraft } from './persist.js';
import { getCv } from './read.js';

// ADR-027 decision 1, read half. After the drop AND after the user reorders what remains (C-008), a question's C-006
// path is derived from where its item sits NOW. Identity is asserted by the item's content, never by index.

const prisma = new PrismaClient();
const userIds: string[] = [];
afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('a question follows its item through a reorder (ADR-027)', () => {
  it('drop an entry, reorder the rest, delete one: each question path points at the item it was about', async () => {
    const userId = randomUUID();
    userIds.push(userId);
    await prisma.user.create({ data: { id: userId, email: `binding-reorder-${userId}@example.test`, passwordHash: `x-${randomBytes(4).toString('hex')}` } });
    const cvId = randomUUID();
    await prisma.cv.create({ data: { id: cvId, userId, title: 't', targetRole: 'Engineer', sourceKind: 'text', sourceText: 's', state: 'generating', version: 1 } });
    const f = [randomUUID(), randomUUID(), randomUUID()];
    const facts: Fact[] = [
      { id: f[0], kind: 'employment', text: 'Barista at Costa Cafe, 2018-2020', sourceQuote: 'q', source: 'document' },
      { id: f[1], kind: 'employment', text: 'Lead engineer at Harbour Labs, 2021-2024', sourceQuote: 'q', source: 'document' },
      { id: f[2], kind: 'employment', text: 'Analyst at Northwind, 2015-2017', sourceQuote: 'q', source: 'document' },
    ];
    const draft: CvDraft = {
      targetRole: 'Engineer',
      experience: [
        { employer: 'Google', role: 'Barista', period: '2018-2020', relevance: 0.99, factIds: [f[0]], bullets: [] },
        { employer: 'Costa Cafe', role: 'Barista', period: '2018-2021', relevance: 0.5, factIds: [f[0]], bullets: [] },
        { employer: 'Harbour Labs', role: 'Lead engineer', period: '2021-2024', relevance: 0.4, factIds: [f[1]], bullets: [] },
        { employer: 'Northwind', role: 'Analyst', period: '2015-2018', relevance: 0.3, factIds: [f[2]], bullets: [] },
      ],
      education: [],
      skills: [],
    };
    const verdict = verify(draft, facts);
    await prisma.$transaction((tx) => persistDraft(tx, cvId, verdict.accepted, verdict.questions, facts));

    // The user reorders: Northwind first, Harbour Labs second, Costa Cafe last (touching an entry makes the stored order theirs).
    const byEmployer = async (employer: string) =>
      (await prisma.cvItem.findMany({ where: { cvId, kind: 'experience' } })).find((i) => (i.data as { employer: string }).employer === employer)!;
    const order = ['Northwind', 'Harbour Labs', 'Costa Cafe'];
    for (const [i, name] of order.entries()) {
      const item = await byEmployer(name);
      await prisma.cvItem.update({ where: { id: item.id }, data: { orderIndex: i, userEdited: true } });
    }

    const cv = await getCv(prisma, userId, cvId);
    expect(cv.experience.map((e) => e.employer)).toEqual(order);
    const asked = (employer: string) => {
      const q = cv.questions.find((x) => x.path.endsWith('.period') && x.text.startsWith('What were the exact dates') && /^experience\[\d+\]/.test(x.path) &&
        cv.experience[Number(/^experience\[(\d+)\]/.exec(x.path)![1])].employer === employer);
      return q;
    };
    // Costa Cafe's and Northwind's periods are unstated by their facts: both questions exist and sit on their own entries.
    expect(asked('Costa Cafe')).toBeDefined();
    expect(asked('Northwind')).toBeDefined();
    expect(asked('Harbour Labs')).toBeUndefined();
    // The dropped Google entry is not bound to any item.
    const google = cv.questions.find((q) => q.text.startsWith('Which employer did this role happen at?'));
    expect(google?.path).toBe('experience');

    // Deleting an item unbinds its question: the section, never an index that now means another job.
    const costa = await byEmployer('Costa Cafe');
    await prisma.cvItem.delete({ where: { id: costa.id } });
    const after = await getCv(prisma, userId, cvId);
    expect(after.questions.filter((q) => /^experience\[/.test(q.path)).every((q) => after.experience[Number(/^experience\[(\d+)\]/.exec(q.path)![1])].employer !== 'Costa Cafe')).toBe(true);
    expect(after.questions.some((q) => q.path === 'experience' && q.text.includes('dates'))).toBe(true);
  });
});
