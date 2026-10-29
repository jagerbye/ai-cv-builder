import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import type { CvDraft, GenerationPipeline } from '../../api/src/core/generation/types.js';
import {
  prisma,
  userIds,
  seedUser,
  seedCv,
  draftFor,
  contactFor,
  fakePipeline,
  questionsFor,
  factIdsOf,
  factsFor,
  getCv,
  getJob,
  regenerate,
  itemsOf,
  type Owner,
} from './generation-persist.fixtures.js';

// T-28 (CVB-31). The worker persists what it generates: a verified draft is stored as the CV's
// items, the CV goes to ready, the version bumps (ADR-015), and a second run keeps userEdited items
// (merge: core/cv/merge.ts mergeRegenerated). Read back through C-006 and C-005.
// Real Postgres and Fastify; the LLM is the C-012 seam. The lease-loss fence has its own file.

const suite: JobTestSuite = openJobTestSuite(prisma);
let app: FastifyInstance;
const { buildServer } = await import('../../api/src/server.js');

const TOKEN_A = 'run-a';
const TOKEN_B = 'run-b';

function workerFor(pipeline: GenerationPipeline, workerId: string) {
  return createJobWorker({ prisma, pipeline, workerId, leaseMs: 300_000, onError: (i) => console.error('JOBERR', JSON.stringify(i)) });
}

// Runs the worker until the named job is the one that ran. Other queued rows, if any, are drained first.
async function runJob(pipeline: GenerationPipeline, jobId: string): Promise<void> {
  const worker = workerFor(pipeline, `persist-${jobId}`);
  let ran: string | null = null;
  do {
    ran = await worker.runOnce();
  } while (ran !== null && ran !== jobId);
  expect(ran).toBe(jobId);
}

// Open rows another suite committed and left behind (hardening-ratelimit does) are claimed first, because
// claimNext takes the oldest. This suite's pipelines carry fixed fact ids, so a foreign run through one of them
// stores those ids and the case's own run then hits the facts primary key (P2002, job failed INTERNAL).
// The suite lock is held, so no other suite owns an open row: clearing them is safe.
async function queueJob(owner: Owner, cvId: string): Promise<string> {
  await suite.clearOpenJobs();
  return suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });
}

// The C-006 view of a draft, in the shape the read model returns, so the comparison is field by field.
function expectedFromDraft(draft: CvDraft) {
  const byKey = (key: string) => (a: Record<string, any>, b: Record<string, any>) =>
    String(a[key]).localeCompare(String(b[key]));
  return {
    experience: [...draft.experience]
      .sort(byKey('employer'))
      .map((e) => ({
        employer: e.employer,
        role: e.role,
        period: e.period,
        location: e.location,
        relevance: e.relevance,
        userEdited: false,
        bullets: e.bullets.map((b) => ({ text: b.text, factIds: b.factIds, userEdited: false })),
      })),
    education: [...draft.education]
      .sort(byKey('institution'))
      .map((e) => ({ institution: e.institution, degree: e.degree, period: e.period, userEdited: false })),
    skills: [...draft.skills]
      .sort(byKey('name'))
      .map((s) => ({ name: s.name, group: s.group, factIds: s.factIds, userEdited: false })),
  };
}

function sortedBy(list: any[], key: string) {
  return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

beforeAll(async () => {
  await suite.lock();
  app = buildServer({ generationPipeline: fakePipeline('unused-by-route') });
  await app.ready();
}, JOB_SUITE_LOCK_WAIT_MS);

afterEach(async () => {
  // Users cascade to sessions, cvs, cv_items, questions and generation_jobs, so no run leaks into the next case.
  const ids = userIds.splice(0);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await suite.release();
});

describe('T-28 persist: a first generation stores the verified draft as the CV content', () => {
  it('stores summary, experience with bullets, education, skills and the verifier questions, as C-006 reads them', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const draft = draftFor(TOKEN_A);
    const jobId = await queueJob(owner, cvId);

    await runJob(fakePipeline(TOKEN_A, draft), jobId);
    // runOnce returns the id whether the run stored or failed; the row says which (C-005).
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.errorMessage).toBeNull();
    expect(job.status).toBe('succeeded');

    const res = await getCv(app, owner.cookie, cvId);
    expect(res.statusCode, res.body).toBe(200);
    const cv = res.json();
    expect(cv.summary).toEqual({ text: `Summary ${TOKEN_A}`, factIds: draft.summary!.factIds, userEdited: false });
    const expected = expectedFromDraft(draft);
    expect(sortedBy(cv.experience, 'employer').map(stripIds)).toEqual(expected.experience);
    expect(sortedBy(cv.education, 'institution').map(stripIds)).toEqual(expected.education);
    expect(sortedBy(cv.skills, 'name').map(stripIds)).toEqual(expected.skills);
    expect(cv.experience).toHaveLength(2);
    expect(cv.skills).toHaveLength(2);
    expect(cv.questions.map((q: any) => ({ path: q.path, text: q.text, status: q.status }))).toEqual(
      questionsFor(TOKEN_A).map((q) => ({ ...q, status: 'open' })),
    );
  });

  it('keeps the intake contact: the draft carries none, so persist does not wipe it', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await queueJob(owner, cvId);

    await runJob(fakePipeline(TOKEN_A), jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact.fullName).toBe('Ada Lovelace');
  });

  it('stores the verifier accepted draft, not compose output: a dropped skill is absent and the question is stored', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const draft = draftFor(TOKEN_A);
    const pipeline: GenerationPipeline = {
      ...fakePipeline(TOKEN_A, draft),
      verify: (d) => ({
        accepted: { ...d, skills: d.skills.filter((s) => !s.name.startsWith('PostgreSQL')) },
        questions: [{ path: 'skills[1]', text: `Question ${TOKEN_A}: which PostgreSQL work?` }],
        dropped: [{ path: 'skills[1]', reason: 'unverifiable' }],
      }),
    };
    const jobId = await queueJob(owner, cvId);

    await runJob(pipeline, jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.skills.map((s: any) => s.name)).toEqual([`TypeScript ${TOKEN_A}`]);
    expect(cv.questions.map((q: any) => ({ path: q.path, status: q.status }))).toEqual([
      { path: 'skills[1]', status: 'open' },
    ]);
  });

  it('marks the CV ready and bumps its version by exactly one (ADR-015), and the job reads succeeded through C-005', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await queueJob(owner, cvId);

    await runJob(fakePipeline(TOKEN_A), jobId);

    const row = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'ready', version: 2 });
    const job = (await getJob(app, owner.cookie, jobId)).json();
    expect(job).toMatchObject({ id: jobId, cvId, status: 'succeeded', stage: null, attempt: 1 });
  });

  it('stores nothing and leaves the version alone when compose fails', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const failing: GenerationPipeline = {
      ...fakePipeline(TOKEN_A),
      compose: async () => {
        throw new Error('model returned nothing usable');
      },
    };
    const jobId = await queueJob(owner, cvId);

    await runJob(failing, jobId);

    const job = (await getJob(app, owner.cookie, jobId)).json();
    expect(job).toMatchObject({ status: 'failed', error: { code: 'INTERNAL' } });
    const items = (await itemsOf(cvId)).map((i) => i.kind);
    expect(items).toEqual(['contact']);
    expect((await prisma.cv.findUnique({ where: { id: cvId }, select: { version: true } }))?.version).toBe(1);
    expect((await getCv(app, owner.cookie, cvId)).json().summary).toBeUndefined();
  });
});

describe('T-28 persist: a second run keeps userEdited items and replaces the rest', () => {
  it('keeps the hand-edited experience row (same id, same values) and replaces every generated row', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));

    // Hand edit: experience[1] is the user's entry; its generated bullets are replaced by run B's.
    const edited = await prisma.cvItem.update({
      where: { cvId_path: { cvId, path: 'experience[1]' } },
      data: {
        userEdited: true,
        data: { employer: 'Hand Employer', role: 'Analyst', period: 'Hand-set period' },
      },
    });

    const second = draftFor(TOKEN_B);
    const res = await regenerate(app, owner.cookie, cvId);
    expect(res.statusCode).toBe(202);
    await runJob(fakePipeline(TOKEN_B, second), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    const kept = cv.experience.filter((e: any) => e.userEdited);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: edited.id, employer: 'Hand Employer', role: 'Analyst', period: 'Hand-set period', userEdited: true });

    // Replaced: nothing from run A survives, and the generated run-B entry takes the free path[0].
    const flat = JSON.stringify(cv);
    expect(flat).not.toContain(TOKEN_A);
    expect(cv.experience.map((e: any) => e.employer)).toContain(`Employer ${TOKEN_B} A`);
    expect(cv.experience.map((e: any) => e.employer)).not.toContain(`Employer ${TOKEN_B} B`);
    expect(cv.summary.text).toBe(`Summary ${TOKEN_B}`);
    expect(cv.summary.userEdited).toBe(false);
    expect(cv.contact.fullName).toBe('Ada Lovelace');

    // The kept entry carries run B's bullets, none of run A's.
    expect(kept[0].bullets.map((b: any) => b.text)).toEqual([`Bullet ${TOKEN_B} B1`]);

    // The stored row is the same row: the edited id still exists at its path.
    expect((await prisma.cvItem.findUnique({ where: { cvId_path: { cvId, path: 'experience[1]' } } }))?.id).toBe(edited.id);
  });

  it('keeps one hand-edited bullet, replaces its siblings, and attaches run B bullets to the kept entry', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));

    const bullet = await prisma.cvItem.update({
      where: { cvId_path: { cvId, path: 'experience[0].bullets[0]' } },
      data: { userEdited: true, data: { text: 'Hand-written bullet' } },
    });
    const parentId = bullet.parentId;

    const second = draftFor(TOKEN_B);
    second.experience[0].bullets.push({ text: `Bullet ${TOKEN_B} A3`, factIds: [] });
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, second), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    const entry = cv.experience.find((e: any) => e.id === parentId);
    expect(entry).toBeDefined();
    const texts = entry.bullets.map((b: any) => b.text).sort();
    expect(texts).toEqual(['Hand-written bullet', `Bullet ${TOKEN_B} A2`, `Bullet ${TOKEN_B} A3`].sort());
    const edited = entry.bullets.find((b: any) => b.userEdited);
    expect(edited).toMatchObject({ id: bullet.id, text: 'Hand-written bullet' });
    expect(JSON.stringify(cv)).not.toContain(TOKEN_A);
    expect(cv.experience.filter((e: any) => e.id === parentId)).toHaveLength(1);
  });

  it('bumps the version once per successful run: 1, then 2, then 3', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B), res.json().jobId);

    const row = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'ready', version: 3 });
  });
});

// Drops the ids and read-order fields the draft never carries, so rows compare by content only.
function stripIds(item: Record<string, any>): Record<string, any> {
  const { id: _id, order: _order, bullets, ...rest } = item;
  void _id;
  void _order;
  const out: Record<string, any> = { ...rest };
  if (bullets !== undefined) out.bullets = bullets.map((b: Record<string, any>) => ({ text: b.text, factIds: b.factIds, userEdited: b.userEdited }));
  return out;
}

describe('T-28 persist: a kept entry whose parent run B did not generate carries no run A generated field', () => {
  it('keeps the entry as a shell for the edited bullet; employer, role, period and location are blank, factIds and relevance are cleared', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));

    const bullet = await prisma.cvItem.update({
      where: { cvId_path: { cvId, path: 'experience[1].bullets[0]' } },
      data: { userEdited: true, data: { text: 'Hand-written bullet' } },
    });
    const parentId = bullet.parentId!;

    // Run B generates no experience at all, so nothing in run B replaces experience[1].
    const second = draftFor(TOKEN_B);
    second.experience = [];
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, second), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(JSON.stringify(cv)).not.toContain(TOKEN_A);
    expect(cv.experience).toHaveLength(1);
    const entry = cv.experience[0];
    expect(entry.id).toBe(parentId);
    expect(entry.employer).toBe('');
    expect(entry.role).toBe('');
    expect(entry.period).toBe('');
    expect(entry.location).toBeUndefined();
    expect(entry.order).toBe(1);
    expect(entry.relevance).toBe(0);
    expect(entry.bullets).toHaveLength(1);
    expect(entry.bullets[0]).toMatchObject({ id: bullet.id, text: 'Hand-written bullet', userEdited: true });
    const row = await prisma.cvItem.findUniqueOrThrow({ where: { id: parentId } });
    expect(row.factIds).toEqual([]);
    expect(row.relevance).toBeNull();
  });
});

describe('T-28 persist: run B generates experience[0] only, the edited bullet sits under experience[1]', () => {
  it('experience[0] is run B, experience[1] is a blank shell carrying the edited bullet, no run A text anywhere', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));
    const bullet = await prisma.cvItem.update({
      where: { cvId_path: { cvId, path: 'experience[1].bullets[0]' } },
      data: { userEdited: true, data: { text: 'Hand-written bullet' } },
    });

    const second = draftFor(TOKEN_B);
    second.experience = second.experience.slice(0, 1);
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, second), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(JSON.stringify(cv)).not.toContain(TOKEN_A);
    expect(cv.experience).toHaveLength(2);
    expect(cv.experience[0].employer).toContain(TOKEN_B);
    const shell = cv.experience.find((e: any) => e.id === bullet.parentId);
    expect(shell).toMatchObject({ employer: '', role: '', period: '' });
    expect(shell.bullets).toHaveLength(1);
    expect(shell.bullets[0]).toMatchObject({ id: bullet.id, text: 'Hand-written bullet', userEdited: true });
    const row = await prisma.cvItem.findUniqueOrThrow({ where: { id: bullet.parentId! } });
    expect(row.factIds).toEqual([]);
    expect(row.relevance).toBeNull();
  });
});

describe('T-28 persist: rows left by another suite', () => {
  it('a queued job another suite left behind does not run through this case pipeline or fail the case', async () => {
    const stranger = await seedUser();
    await suite.enqueue({ cvId: await seedCv(stranger.userId), userId: stranger.userId, status: 'queued' });
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await queueJob(owner, cvId);

    await runJob(fakePipeline(TOKEN_A), jobId);

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.errorMessage).toBeNull();
    expect(job.status).toBe('succeeded');
  });
});

describe('T-28 persist: the extracted facts are stored with the draft (C-006 facts, F-004)', () => {
  it('stores the document facts and every factId of every item resolves to a stored fact', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const draft = draftFor(TOKEN_A);
    await runJob(fakePipeline(TOKEN_A, draft), await queueJob(owner, cvId));

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    const ids = factIdsOf(draft);
    expect(ids.length).toBeGreaterThan(0);
    expect(sortedBy(cv.facts, 'id')).toEqual(
      sortedBy(factsFor(TOKEN_A, draft).map((f) => ({ ...f })), 'id'),
    );
    const stored = new Set(cv.facts.map((f: any) => f.id));
    const cited: string[] = [
      ...cv.summary.factIds,
      ...cv.experience.flatMap((e: any) => e.bullets.flatMap((b: any) => b.factIds)),
      ...cv.skills.flatMap((s: any) => s.factIds),
    ];
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(stored.has(id)).toBe(true);
    for (const row of await prisma.cvItem.findMany({ where: { cvId } })) {
      for (const id of row.factIds) expect(stored.has(id)).toBe(true);
    }
  });

  it('a regeneration replaces the document facts and keeps the user facts untouched', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));
    const userFact = await prisma.fact.create({
      data: { cvId, kind: 'answer', text: 'I led a team of five', sourceQuote: '', source: 'user' },
    });

    const second = draftFor(TOKEN_B);
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, second), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.facts.filter((f: any) => f.source === 'user')).toEqual([
      { id: userFact.id, kind: 'answer', text: 'I led a team of five', sourceQuote: '', source: 'user' },
    ]);
    const documentFacts = cv.facts.filter((f: any) => f.source === 'document');
    expect(sortedBy(documentFacts, 'id')).toEqual(sortedBy(factsFor(TOKEN_B, second), 'id'));
    expect(JSON.stringify(cv)).not.toContain(TOKEN_A);
    const stored = new Set(cv.facts.map((f: any) => f.id));
    for (const row of await prisma.cvItem.findMany({ where: { cvId } })) {
      for (const id of row.factIds) expect(stored.has(id)).toBe(true);
    }
  });

  it('a kept hand-edited bullet does not cite a document fact the regeneration replaced', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));
    const bullet = await prisma.cvItem.update({
      where: { cvId_path: { cvId, path: 'experience[0].bullets[0]' } },
      data: { userEdited: true, data: { text: 'Hand-written bullet' } },
    });
    expect(bullet.factIds).toHaveLength(1);

    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    const kept = cv.experience.flatMap((e: any) => e.bullets).find((b: any) => b.id === bullet.id);
    expect(kept.text).toBe('Hand-written bullet');
    const stored = new Set(cv.facts.map((f: any) => f.id));
    expect(kept.factIds).toEqual([]);
    for (const id of kept.factIds) expect(stored.has(id)).toBe(true);
  });

  it('a draft citing a fact the extract stage did not produce fails the run and stores nothing', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const draft = draftFor(TOKEN_A);
    const missing = draft.summary!.factIds[0];
    const pipeline: GenerationPipeline = {
      ...fakePipeline(TOKEN_A, draft),
      extract: async () => factsFor(TOKEN_A, draft).filter((f) => f.id !== missing),
    };
    const jobId = await queueJob(owner, cvId);

    await runJob(pipeline, jobId);

    const job = (await getJob(app, owner.cookie, jobId)).json();
    expect(job).toMatchObject({ status: 'failed', error: { code: 'INTERNAL' } });
    expect((await itemsOf(cvId)).map((i) => i.kind)).toEqual(['contact']);
    expect(await prisma.fact.count({ where: { cvId } })).toBe(0);
    expect((await prisma.cv.findUnique({ where: { id: cvId }, select: { version: true } }))?.version).toBe(1);
  });
});

describe('T-28 persist: the contact block is stored with its citations (ADR-022 Amendment A, F-004)', () => {
  it('stores the drafted contact and C-006 returns every value with its own factIds', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const contact = contactFor(TOKEN_A);
    const draft = { ...draftFor(TOKEN_A), contact };
    await runJob(fakePipeline(TOKEN_A, draft), await queueJob(owner, cvId));

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact).toMatchObject({
      fullName: 'Ada Lovelace',
      email: contact.email!.value,
      phone: '+44 20 7946 0000',
      location: contact.location!.value,
      links: [],
      citations: {
        fullName: contact.fullName!.factIds,
        email: contact.email!.factIds,
        phone: contact.phone!.factIds,
        location: contact.location!.factIds,
      },
    });
    // One contact row, its factIds the union of its fields', every one resolving to a stored fact.
    const rows = (await itemsOf(cvId)).filter((r) => r.kind === 'contact');
    expect(rows).toHaveLength(1);
    expect([...rows[0].factIds].sort()).toEqual(Object.values(contact).flatMap((f) => f!.factIds).sort());
    const stored = new Set(cv.facts.map((f: any) => f.id));
    for (const id of rows[0].factIds) expect(stored.has(id)).toBe(true);
  });

  it('a draft with no contact leaves the intake contact alone', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A), await queueJob(owner, cvId));
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact).toEqual({ fullName: 'Ada Lovelace', links: [] });
  });

  it('a regeneration replaces an unedited generated contact: run B values, no run A citation survives', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A, { ...draftFor(TOKEN_A), contact: contactFor(TOKEN_A) }), await queueJob(owner, cvId));

    // Run B's verifier dropped the phone: it must not linger from run A, whose fact is gone.
    const b = contactFor(TOKEN_B);
    delete b.phone;
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, { ...draftFor(TOKEN_B), contact: b }), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact.email).toBe(b.email!.value);
    expect(cv.contact.phone).toBeUndefined();
    expect(cv.contact.citations.email).toEqual(b.email!.factIds);
    expect(JSON.stringify(cv.contact)).not.toContain(TOKEN_A);
  });

  it('a regeneration whose draft has no contact strips the previous run\'s cited fields and keeps intake data', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A, { ...draftFor(TOKEN_A), contact: contactFor(TOKEN_A) }), await queueJob(owner, cvId));
    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B), res.json().jobId);
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact).toEqual({ links: [] });
  });

  it('a userEdited contact survives a regeneration verbatim, like any other edited item', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await runJob(fakePipeline(TOKEN_A, { ...draftFor(TOKEN_A), contact: contactFor(TOKEN_A) }), await queueJob(owner, cvId));
    const row = await prisma.cvItem.findUniqueOrThrow({ where: { cvId_path: { cvId, path: 'contact' } } });
    await prisma.cvItem.update({
      where: { id: row.id },
      data: { userEdited: true, data: { fullName: 'Ada Hand', email: 'hand@example.test', links: [] }, factIds: [] },
    });

    const res = await regenerate(app, owner.cookie, cvId);
    await runJob(fakePipeline(TOKEN_B, { ...draftFor(TOKEN_B), contact: contactFor(TOKEN_B) }), res.json().jobId);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.contact).toEqual({ fullName: 'Ada Hand', email: 'hand@example.test', links: [] });
    expect((await prisma.cvItem.findUniqueOrThrow({ where: { cvId_path: { cvId, path: 'contact' } } })).id).toBe(row.id);
  });
});
