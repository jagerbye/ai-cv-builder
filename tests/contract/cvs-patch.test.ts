import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../api/src/server.js';

// T-18 (CVB-16). Contract tests for C-008 (PATCH /api/cvs/:cvId), spec.md F-006
// §3.6 and the CvItem / Fact invariants. Same harness as cvs-read.test.ts: real
// Fastify app, real Postgres, `sid` cookie whose sha256 is sessions.token_hash.
// Error envelope per C-000.
//
// Not covered here, on purpose:
//  - answering a question never touching userEdited fields: C-009, T-20.
//  - regeneration preserving userEdited items: unit level, core/cv/merge.test.ts
//    (the regenerate HTTP path is owned by lane 05 jobs).
//  - "edits saved without page navigation / survive a reload": web, lane 09.

const prisma = new PrismaClient();
let app: FastifyInstance;
const userIds: string[] = [];

interface Owner {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Owner> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `cvs-patch-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  userIds.push(userId);
  return { userId, cookie: `sid=${token}` };
}

const SOURCE_TEXT = [
  'Ada Lovelace, Backend Engineer, London. ada@example.com, +44 20 7946 0000.',
  'Lead Engineer at Babbage Works, Mar 2019 to present: reduced build times by 40 percent.',
  'Engineer at Analytical Engines, Jan 2015 to Dec 2017.',
  'BSc Mathematics, University of London, 2011 to 2014. Skills: TypeScript.',
].join(' ');

interface Seeded {
  cvId: string;
  ids: Record<string, string>;
}

// Seeds a ready CV at version 3 with one item per generator-writable field.
async function seedCv(userId: string): Promise<Seeded> {
  const cvId = randomUUID();
  const names = [
    'contact', 'summary', 'expHigh', 'expLow', 'bulletA', 'bulletB',
    'education', 'skill', 'factSummary', 'factBullet', 'factSkill', 'factDoc',
  ];
  const ids: Record<string, string> = Object.fromEntries(names.map((n) => [n, randomUUID()]));
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: SOURCE_TEXT,
      state: 'ready',
      version: 3,
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
  });
  await prisma.fact.createMany({
    data: [
      { id: ids.factSummary, cvId, kind: 'employment', text: 'Backend engineer in London', sourceQuote: 'Ada Lovelace, Backend Engineer, London', source: 'document' },
      { id: ids.factBullet, cvId, kind: 'achievement', text: 'Cut build time by 40%', sourceQuote: 'reduced build times by 40 percent', source: 'document' },
      { id: ids.factSkill, cvId, kind: 'skill', text: 'TypeScript', sourceQuote: 'Skills: TypeScript', source: 'document' },
      { id: ids.factDoc, cvId, kind: 'education', text: 'BSc Mathematics', sourceQuote: 'BSc Mathematics, University of London, 2011 to 2014', source: 'document' },
    ],
  });
  await prisma.cvItem.createMany({
    data: [
      { id: ids.contact, cvId, kind: 'contact', path: 'contact', orderIndex: 0, data: { fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London', links: ['https://example.com/ada'] }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.summary, cvId, kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Backend engineer who ships fast builds.' }, factIds: [ids.factSummary], userEdited: false },
      { id: ids.expHigh, cvId, kind: 'experience', path: 'experience[0]', orderIndex: 0, data: { employer: 'Babbage Works', role: 'Lead Engineer', period: 'Mar 2019 – Present' }, factIds: [], relevance: 0.9, userEdited: false },
      { id: ids.expLow, cvId, kind: 'experience', path: 'experience[1]', orderIndex: 1, data: { employer: 'Analytical Engines', role: 'Engineer', period: 'Jan 2015 – Dec 2017' }, factIds: [], relevance: 0.4, userEdited: false },
      { id: ids.bulletA, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Cut build time by 40%' }, factIds: [ids.factBullet], userEdited: false },
      { id: ids.bulletB, cvId, kind: 'bullet', parentId: ids.expHigh, path: 'experience[0].bullets[1]', orderIndex: 1, data: { text: 'Led a team of six' }, factIds: [], userEdited: false },
      { id: ids.education, cvId, kind: 'education', path: 'education[0]', orderIndex: 0, data: { institution: 'University of London', degree: 'BSc Mathematics', period: '2011 – 2014' }, factIds: [ids.factDoc], userEdited: false },
      { id: ids.skill, cvId, kind: 'skill', path: 'skills[0]', orderIndex: 0, data: { name: 'TypeScript', group: 'Languages' }, factIds: [ids.factSkill], userEdited: false },
    ],
  });
  return { cvId, ids };
}

function patchCv(cookie: string, cvId: string, body: unknown) {
  return app.inject({ method: 'PATCH', url: `/api/cvs/${cvId}`, headers: { cookie }, payload: body as object });
}

function getCv(cookie: string, cvId: string) {
  return app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

// C-000: every non-2xx body is { error: { code, message, details? } } and nothing
// else at the top level.
function expectEnvelope(res: { statusCode: number; json: () => any }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  const body = res.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).every((k) => ['code', 'message', 'details'].includes(k))).toBe(true);
  expect(body.error.code).toBe(code);
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await app.close();
  await prisma.$disconnect();
});

describe('C-008 PATCH /api/cvs/:cvId — partial update and version', () => {
  it('applies a partial update, bumps version 3 to 4 and leaves absent fields untouched', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);
    const before = (await getCv(owner.cookie, cv.cvId)).json();

    const newContact = {
      fullName: 'Ada King',
      email: 'ada.king@example.com',
      phone: '+44 20 7946 0000',
      location: 'Lisbon',
      links: [] as string[],
    };
    const res = await patchCv(owner.cookie, cv.cvId, { version: 3, patch: { contact: newContact } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(4);
    expect(body.contact).toEqual(newContact);
    // C-006 has no contact userEdited key; the flag lives on the cv_items row.
    const contactRow = await prisma.cvItem.findFirst({ where: { cvId: cv.cvId, kind: 'contact' } });
    expect(contactRow?.userEdited).toBe(true);

    // Absent fields are untouched, byte for byte.
    expect(body.summary).toEqual(before.summary);
    expect(body.education).toEqual(before.education);
    expect(body.skills).toEqual(before.skills);
    expect(body.experience).toEqual(before.experience);
  });

  it('answers 409 VERSION_CONFLICT for a stale version and keeps the first edit when a second device races it', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);

    // Device A saves at version 3.
    const a = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { summary: { text: 'Device A summary', factIds: [], userEdited: false } },
    });
    expect(a.statusCode).toBe(200);
    expect(a.json().version).toBe(4);

    // Device B still holds version 3 and edits the contact name.
    const b = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { contact: { fullName: 'Device B name', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London', links: [] } },
    });
    expectEnvelope(b, 409, 'VERSION_CONFLICT');

    // Nothing from device B was written; device A's edit and version 4 stand.
    const after = (await getCv(owner.cookie, cv.cvId)).json();
    expect(after.version).toBe(4);
    expect(after.summary.text).toBe('Device A summary');
    expect(after.contact.fullName).toBe('Ada Lovelace');

    // The client refetches, retries at version 4 and succeeds.
    const retry = await patchCv(owner.cookie, cv.cvId, {
      version: 4,
      patch: { contact: { fullName: 'Device B name', email: 'ada@example.com', phone: '+44 20 7946 0000', location: 'London', links: [] } },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().version).toBe(5);
    expect(retry.json().contact.fullName).toBe('Device B name');
  });

  it('answers 400 VALIDATION for a malformed body and does not bump the version', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);

    expectEnvelope(await patchCv(owner.cookie, cv.cvId, { patch: { summary: { text: 'x', factIds: [], userEdited: false } } }), 400, 'VALIDATION');
    expectEnvelope(await patchCv(owner.cookie, cv.cvId, { version: '3', patch: {} }), 400, 'VALIDATION');
    expectEnvelope(
      await patchCv(owner.cookie, cv.cvId, {
        version: 3,
        patch: { experience: [{ id: randomUUID(), role: 'Engineer', period: 'Jan 2015 – Dec 2017', order: 0, relevance: 0.5, userEdited: false, bullets: [] }] },
      }),
      400,
      'VALIDATION',
    );

    const after = (await getCv(owner.cookie, cv.cvId)).json();
    expect(after.version).toBe(3);
    expect(after.experience).toHaveLength(2);
  });

  it('answers 404 NOT_FOUND for another user\'s CV and for an unknown id, and changes nothing', async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const cv = await seedCv(owner.userId);

    // Owner-200 proof first, so the 404 below cannot pass on a missing route.
    const proof = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { summary: { text: 'Owner summary', factIds: [], userEdited: false } },
    });
    expect(proof.statusCode).toBe(200);

    expectEnvelope(
      await patchCv(stranger.cookie, cv.cvId, {
        version: 4,
        patch: { summary: { text: 'Stranger summary', factIds: [], userEdited: false } },
      }),
      404,
      'NOT_FOUND',
    );
    expectEnvelope(
      await patchCv(owner.cookie, randomUUID(), {
        version: 1,
        patch: { summary: { text: 'Nobody', factIds: [], userEdited: false } },
      }),
      404,
      'NOT_FOUND',
    );

    const after = (await getCv(owner.cookie, cv.cvId)).json();
    expect(after.version).toBe(4);
    expect(after.summary.text).toBe('Owner summary');
  });
});

describe('F-006 editable fields and their userEdited flags', () => {
  it('edits contact, summary, education and skill fields, each flagged userEdited true in the response', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);

    const s = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { summary: { text: 'Staff engineer who ships fast builds.', factIds: [], userEdited: false } },
    });
    expect(s.statusCode).toBe(200);
    expect(s.json().summary).toMatchObject({ text: 'Staff engineer who ships fast builds.', userEdited: true });

    const e = await patchCv(owner.cookie, cv.cvId, {
      version: 4,
      patch: { education: [{ id: cv.ids.education, institution: 'University of London', degree: 'MSc Mathematics', period: '2011 – 2014', order: 0, userEdited: false }] },
    });
    expect(e.statusCode).toBe(200);
    expect(e.json().version).toBe(5);
    expect(e.json().education[0]).toMatchObject({ degree: 'MSc Mathematics', userEdited: true });

    const k = await patchCv(owner.cookie, cv.cvId, {
      version: 5,
      patch: { skills: [{ id: cv.ids.skill, name: 'Rust', group: 'Languages', factIds: [], userEdited: false }] },
    });
    expect(k.statusCode).toBe(200);
    expect(k.json().version).toBe(6);
    expect(k.json().skills).toEqual([expect.objectContaining({ name: 'Rust', group: 'Languages', userEdited: true })]);
  });

  it('edits experience employer, role, period and bullet text, flagged userEdited true', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);

    const res = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: {
        experience: [
          {
            id: cv.ids.expHigh,
            employer: 'Babbage Works Ltd',
            role: 'Principal Engineer',
            period: 'Mar 2019 – Present',
            order: 0,
            relevance: 0.9,
            userEdited: false,
            bullets: [
              { id: cv.ids.bulletA, text: 'Cut build time by 55%', factIds: [cv.ids.factBullet], userEdited: false },
              { id: cv.ids.bulletB, text: 'Led a team of six', factIds: [], userEdited: false },
            ],
          },
          { id: cv.ids.expLow, employer: 'Analytical Engines', role: 'Engineer', period: 'Jan 2015 – Dec 2017', order: 1, relevance: 0.4, userEdited: false, bullets: [] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const high = res.json().experience.find((e: any) => e.id === cv.ids.expHigh);
    expect(high).toMatchObject({ employer: 'Babbage Works Ltd', role: 'Principal Engineer', userEdited: true });
    const bulletA = high.bullets.find((b: any) => b.id === cv.ids.bulletA);
    expect(bulletA).toMatchObject({ text: 'Cut build time by 55%', userEdited: true });
  });
});

describe('F-006 add, delete and reorder', () => {
  it('adds, deletes and reorders experience entries, bullets, education entries and skills', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);
    const newExpId = randomUUID();
    const newBulletId = randomUUID();

    // Experience: the high entry gets a new `order`, the low entry moves to the
    // front, and a new entry is added. Bullets: bulletA deleted, a new bullet
    // added, bulletB kept.
    const exp = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: {
        experience: [
          { id: cv.ids.expLow, employer: 'Analytical Engines', role: 'Engineer', period: 'Jan 2015 – Dec 2017', order: 0, relevance: 0.4, userEdited: false, bullets: [] },
          { id: newExpId, employer: 'Cambridge Labs', role: 'Research Engineer', period: 'Jan 2018 – Dec 2018', order: 1, relevance: 0.5, userEdited: false, bullets: [] },
          {
            id: cv.ids.expHigh,
            employer: 'Babbage Works',
            role: 'Lead Engineer',
            period: 'Mar 2019 – Present',
            order: 2,
            relevance: 0.9,
            userEdited: false,
            bullets: [
              { id: cv.ids.bulletB, text: 'Led a team of six', factIds: [], userEdited: false },
              { id: newBulletId, text: 'Shipped CI for 12 repos', factIds: [], userEdited: false },
            ],
          },
        ],
      },
    });
    expect(exp.statusCode).toBe(200);
    expect(exp.json().version).toBe(4);
    const experience = exp.json().experience as any[];
    expect(experience.map((e) => e.employer)).toEqual(['Analytical Engines', 'Cambridge Labs', 'Babbage Works']);
    const got = await app.inject({ method: 'GET', url: `/api/cvs/${cv.cvId}`, headers: { cookie: owner.cookie } });
    expect(got.json().experience.map((e: any) => e.employer)).toEqual(['Analytical Engines', 'Cambridge Labs', 'Babbage Works']);
    expect(experience.map((e) => e.employer).sort()).toEqual(['Analytical Engines', 'Babbage Works', 'Cambridge Labs']);
    expect(experience.find((e) => e.employer === 'Analytical Engines').order).toBe(0);
    expect(experience.find((e) => e.employer === 'Cambridge Labs')).toMatchObject({ id: newExpId, role: 'Research Engineer' });
    const high = experience.find((e) => e.employer === 'Babbage Works');
    expect(high.order).toBe(2);
    expect(high.bullets.map((b: any) => b.text)).toEqual(['Led a team of six', 'Shipped CI for 12 repos']);
    expect(high.bullets.find((b: any) => b.id === newBulletId)).toMatchObject({ text: 'Shipped CI for 12 repos' });
    expect(high.bullets.some((b: any) => b.id === cv.ids.bulletA)).toBe(false);

    // Bullet reorder only: swap the two bullets, version 4 to 5.
    const reorder = await patchCv(owner.cookie, cv.cvId, {
      version: 4,
      patch: {
        experience: experience.map((e) => ({
          ...e,
          bullets: e.id === cv.ids.expHigh ? [...e.bullets].reverse() : e.bullets,
        })),
      },
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().version).toBe(5);
    const reordered = reorder.json().experience.find((e: any) => e.id === cv.ids.expHigh);
    expect(reordered.bullets.map((b: any) => b.text)).toEqual(['Shipped CI for 12 repos', 'Led a team of six']);

    // Education: the only entry is replaced by a new one.
    const newEduId = randomUUID();
    const edu = await patchCv(owner.cookie, cv.cvId, {
      version: 5,
      patch: { education: [{ id: newEduId, institution: 'Open University', degree: 'Certificate in Maths', period: '2016', order: 0, userEdited: false }] },
    });
    expect(edu.statusCode).toBe(200);
    expect(edu.json().education).toEqual([expect.objectContaining({ id: newEduId, institution: 'Open University', userEdited: true })]);

    // Skills: add one, then reverse the order.
    const newSkillId = randomUUID();
    const skillsAdd = await patchCv(owner.cookie, cv.cvId, {
      version: 6,
      patch: {
        skills: [
          { id: newSkillId, name: 'Go', group: 'Languages', factIds: [], userEdited: false },
          { id: cv.ids.skill, name: 'TypeScript', group: 'Languages', factIds: [cv.ids.factSkill], userEdited: false },
        ],
      },
    });
    expect(skillsAdd.statusCode).toBe(200);
    expect(skillsAdd.json().skills.map((s: any) => s.name)).toEqual(['Go', 'TypeScript']);

    const skillsReverse = await patchCv(owner.cookie, cv.cvId, {
      version: 7,
      patch: {
        skills: [
          { id: cv.ids.skill, name: 'TypeScript', group: 'Languages', factIds: [cv.ids.factSkill], userEdited: false },
          { id: newSkillId, name: 'Go', group: 'Languages', factIds: [], userEdited: false },
        ],
      },
    });
    expect(skillsReverse.statusCode).toBe(200);
    expect(skillsReverse.json().version).toBe(8);
    expect(skillsReverse.json().skills.map((s: any) => s.name)).toEqual(['TypeScript', 'Go']);

    // Deleting every skill is allowed and leaves none.
    const skillsDelete = await patchCv(owner.cookie, cv.cvId, { version: 8, patch: { skills: [] } });
    expect(skillsDelete.statusCode).toBe(200);
    expect(skillsDelete.json().skills).toEqual([]);
  });
});

describe('F-006 user edits bypass the verifier and are recorded as user facts', () => {
  it('stores an ungrounded summary edit as a user-sourced fact, and leaves document facts alone', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);
    const claim = 'Holds a Nobel Prize in Physics, awarded 2029';

    const res = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { summary: { text: claim, factIds: [], userEdited: false } },
    });
    // Not in SOURCE_TEXT, so a verified generation would drop it; a user edit is kept.
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toMatchObject({ text: claim, userEdited: true });

    const userFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'user' } });
    expect(userFacts).toHaveLength(1);
    expect(userFacts[0].text).toContain('Nobel');
    expect(userFacts[0].sourceQuote).toBe('');

    const summaryItem = await prisma.cvItem.findFirst({ where: { cvId: cv.cvId, kind: 'summary' } });
    expect(summaryItem?.factIds).toContain(userFacts[0].id);
    expect(summaryItem?.userEdited).toBe(true);

    // Document facts are unchanged: still four, all source 'document'.
    const docFacts = await prisma.fact.findMany({ where: { cvId: cv.cvId, source: 'document' } });
    expect(docFacts).toHaveLength(4);

    // The fact is visible to the client through C-006.
    const body = (await getCv(owner.cookie, cv.cvId)).json();
    expect(body.facts.find((f: any) => f.id === userFacts[0].id)).toMatchObject({ source: 'user', sourceQuote: '' });
  });

  it('flags only the touched item userEdited in the database, not its untouched siblings', async () => {
    const owner = await seedUser();
    const cv = await seedCv(owner.userId);

    const res = await patchCv(owner.cookie, cv.cvId, {
      version: 3,
      patch: { education: [{ id: cv.ids.education, institution: 'University of London', degree: 'PhD Mathematics', period: '2011 – 2014', order: 0, userEdited: false }] },
    });
    expect(res.statusCode).toBe(200);

    const rows = await prisma.cvItem.findMany({ where: { cvId: cv.cvId } });
    const flagged = rows.filter((r) => r.userEdited).map((r) => r.id);
    expect(flagged).toEqual([cv.ids.education]);
    expect(rows.find((r) => r.id === cv.ids.summary)?.userEdited).toBe(false);
    expect(rows.find((r) => r.id === cv.ids.bulletA)?.userEdited).toBe(false);
  });
});
