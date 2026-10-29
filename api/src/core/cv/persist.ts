import { randomUUID } from 'node:crypto';
import type { CvItem, Prisma } from '@prisma/client';
import type { CvDraft, Fact, QuestionDraft } from '../generation/types.js';
import { mergeRegenerated } from './merge.js';

// T-28 (CVB-31). core/cv owns CV content, so this is where a verified draft becomes cv_items, questions
// and the CV's state and version (ADR-015). The job worker calls persistDraft inside the same transaction
// that marks its job succeeded, so a draft is stored only by the run that owns the job row.
//
// Merge (spec §3.6): userEdited items survive, through core/cv/merge.ts mergeRegenerated. A top-level
// entry (summary, experience, education, skill) counts as edited when it or any of its bullets is, so a
// hand-edited bullet is never orphaned by the replacement of its generated parent. The contact item is
// intake data the draft does not carry, so it is never touched.

// The verifier's questions carry reason and priority (PlannedQuestion); a bare QuestionDraft gets defaults.
export interface PersistableQuestion extends QuestionDraft {
  reason?: string;
  priority?: number;
}

interface NewItem {
  id: string;
  kind: string;
  parentId: string | null;
  path: string;
  orderIndex: number;
  data: Record<string, unknown>;
  factIds: string[];
  relevance: number | null;
}

// Drops undefined fields so the stored JSON matches what the read model expects (absent, not null).
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// The generated item set for a draft, in the path scheme of C-006: summary, experience[i],
// experience[i].bullets[j], education[i], skills[i]. Ids are fresh so children can point at parents.
export function itemsFromDraft(draft: CvDraft): NewItem[] {
  const items: NewItem[] = [];
  if (draft.summary) {
    items.push({
      id: randomUUID(),
      kind: 'summary',
      parentId: null,
      path: 'summary',
      orderIndex: 0,
      data: { text: draft.summary.text },
      factIds: draft.summary.factIds,
      relevance: null,
    });
  }
  draft.experience.forEach((entry, i) => {
    const id = randomUUID();
    items.push({
      id,
      kind: 'experience',
      parentId: null,
      path: `experience[${i}]`,
      orderIndex: i,
      data: compact({ employer: entry.employer, role: entry.role, period: entry.period, location: entry.location }),
      factIds: entry.factIds,
      relevance: entry.relevance,
    });
    entry.bullets.forEach((bullet, j) => {
      items.push({
        id: randomUUID(),
        kind: 'bullet',
        parentId: id,
        path: `experience[${i}].bullets[${j}]`,
        orderIndex: j,
        data: { text: bullet.text },
        factIds: bullet.factIds,
        relevance: null,
      });
    });
  });
  draft.education.forEach((entry, i) => {
    items.push({
      id: randomUUID(),
      kind: 'education',
      parentId: null,
      path: `education[${i}]`,
      orderIndex: i,
      data: compact({ institution: entry.institution, degree: entry.degree, period: entry.period }),
      factIds: entry.factIds,
      relevance: null,
    });
  });
  draft.skills.forEach((entry, i) => {
    items.push({
      id: randomUUID(),
      kind: 'skill',
      parentId: null,
      path: `skills[${i}]`,
      orderIndex: i,
      data: compact({ name: entry.name, group: entry.group }),
      factIds: entry.factIds,
      relevance: null,
    });
  });
  return items;
}

// What a kept entry holds once its generated fields are gone: the read model types these fields as strings
// (and orders experience by period), so they are empty strings, not absent. Only entries with bullets are
// ever kept as a shell; the other kinds are listed for completeness.
const SHELL_DATA: Record<string, Prisma.InputJsonValue> = {
  experience: { employer: '', role: '', period: '' },
  education: { institution: '', period: '' },
  skill: { name: '' },
  summary: { text: '' },
};

// Writes a verified draft into the CV. Must run inside the caller's transaction: the caller's fenced job
// update comes first, so a run that lost its lease rolls this whole write back.
export async function persistDraft(
  tx: Prisma.TransactionClient,
  cvId: string,
  draft: CvDraft,
  questions: PersistableQuestion[],
  facts: Fact[],
): Promise<void> {
  // Facts first: a draft that cites a fact the extract stage did not produce is a pipeline bug. It is surfaced
  // (the run fails, nothing is stored), never filtered, so an item never points at a row that does not exist.
  const factIds = new Set(facts.map((fact) => fact.id));
  for (const item of itemsFromDraft(draft)) {
    const unknown = item.factIds.filter((id) => !factIds.has(id));
    if (unknown.length > 0) throw new Error(`draft cites facts the extract stage did not produce: ${unknown.join(', ')} at ${item.path}`);
  }

  // Document facts are the run's: the previous run's are replaced. User facts (C-009 answers) are the user's
  // trusted input and are never touched. Written in this transaction, before the items that cite them.
  await tx.fact.deleteMany({ where: { cvId, source: 'document' } });
  if (facts.length > 0) {
    await tx.fact.createMany({
      data: facts.map((fact) => ({
        id: fact.id,
        cvId,
        kind: fact.kind,
        text: fact.text,
        sourceQuote: fact.sourceQuote,
        source: 'document',
      })),
    });
  }

  const stored = await tx.cvItem.findMany({ where: { cvId }, orderBy: { orderIndex: 'asc' } });
  const content = stored.filter((item) => item.kind !== 'contact');
  const childrenOf = new Map<string, CvItem[]>();
  for (const item of content) {
    if (item.parentId === null) continue;
    const list = childrenOf.get(item.parentId) ?? [];
    list.push(item);
    childrenOf.set(item.parentId, list);
  }
  const storedTop = content.filter((item) => item.parentId === null);
  const storedIds = new Set(storedTop.map((item) => item.id));

  const generated = itemsFromDraft(draft);
  const merged = mergeRegenerated(
    storedTop.map((item) => ({
      id: item.id,
      path: item.path,
      userEdited: item.userEdited || (childrenOf.get(item.id) ?? []).some((child) => child.userEdited),
    })),
    generated.filter((item) => item.parentId === null).map((item) => ({ id: item.id, path: item.path, userEdited: false })),
  );
  const keptIds = new Set(merged.filter((item) => storedIds.has(item.id)).map((item) => item.id));
  const addedIds = new Set(merged.filter((item) => !storedIds.has(item.id)).map((item) => item.id));

  // Replaced: every stored top-level entry that is not kept. Its bullets go with it (cascade).
  const replacedIds = storedTop.filter((item) => !keptIds.has(item.id)).map((item) => item.id);
  if (replacedIds.length > 0) await tx.cvItem.deleteMany({ where: { id: { in: replacedIds } } });

  // A kept entry is kept whole only as far as its edited children go: its other stored children are replaced
  // (spec §3.6), deleted before the inserts below so @@unique([cvId, path]) holds.
  const keptTop = storedTop.filter((item) => keptIds.has(item.id));
  const keptChildren = keptTop.flatMap((item) => childrenOf.get(item.id) ?? []);
  const staleChildIds = keptChildren.filter((child) => !child.userEdited).map((child) => child.id);
  if (staleChildIds.length > 0) await tx.cvItem.deleteMany({ where: { id: { in: staleChildIds } } });
  const occupiedPaths = new Set(keptChildren.filter((child) => child.userEdited).map((child) => child.path));

  // Added: a generated entry the merge took, and its bullets. The generated bullets of a kept entry attach to
  // the kept entry's id, minus any path an edited bullet occupies (the mergeRegenerated rule).
  const keptIdByPath = new Map(keptTop.map((item) => [item.path, item.id]));
  const generatedById = new Map(generated.map((item) => [item.id, item]));
  // An entry kept only for its edited bullet has no edit of its own: its fields take the generated values.
  for (const item of keptTop) {
    if (item.userEdited) continue;
    const fresh = generated.find((g) => g.parentId === null && g.path === item.path);
    if (!fresh) {
      // Run B produced nothing at this path. The entry survives only as the carrier of the user's edited
      // bullet; every generated field run A put on it goes, so run A text does not outlive a run that did not make it.
      const slot = /\[(\d+)\]$/.exec(item.path);
      await tx.cvItem.update({
        where: { id: item.id },
        data: { data: SHELL_DATA[item.kind] ?? {}, factIds: [], relevance: null, orderIndex: slot ? Number(slot[1]) : 0 },
      });
      continue;
    }
    await tx.cvItem.update({
      where: { id: item.id },
      data: { data: fresh.data as Prisma.InputJsonValue, factIds: fresh.factIds, relevance: fresh.relevance },
    });
  }
  const toInsert: NewItem[] = [];
  for (const item of generated) {
    if (item.parentId === null) {
      if (addedIds.has(item.id)) toInsert.push(item);
      continue;
    }
    if (addedIds.has(item.parentId)) {
      toInsert.push(item);
      continue;
    }
    const parentPath = generatedById.get(item.parentId)?.path;
    const keptParentId = parentPath === undefined ? undefined : keptIdByPath.get(parentPath);
    if (keptParentId !== undefined && !occupiedPaths.has(item.path)) toInsert.push({ ...item, parentId: keptParentId });
  }
  const rows = (items: NewItem[]) =>
    items.map((item) => ({
      id: item.id,
      cvId,
      kind: item.kind,
      parentId: item.parentId,
      path: item.path,
      orderIndex: item.orderIndex,
      data: item.data as Prisma.InputJsonValue,
      factIds: item.factIds,
      relevance: item.relevance,
      userEdited: false,
    }));
  const tops = toInsert.filter((item) => item.parentId === null);
  const children = toInsert.filter((item) => item.parentId !== null);
  if (tops.length > 0) await tx.cvItem.createMany({ data: rows(tops) });
  if (children.length > 0) await tx.cvItem.createMany({ data: rows(children) });

  // A kept, user-edited item may still cite a document fact of the previous run, which is now replaced.
  // Those ids are dropped from the kept item (the fact is gone); ids of facts that still exist stay.
  const liveFactIds = new Set((await tx.fact.findMany({ where: { cvId }, select: { id: true } })).map((f) => f.id));
  const keptRows = [...keptTop, ...keptChildren.filter((child) => child.userEdited)];
  for (const row of keptRows) {
    const current = row.userEdited ? row.factIds : [];
    const live = current.filter((id) => liveFactIds.has(id));
    if (live.length !== current.length) await tx.cvItem.update({ where: { id: row.id }, data: { factIds: live } });
  }

  // Open questions are the last run's; answered and dismissed ones are the user's record and stay.
  await tx.question.deleteMany({ where: { cvId, status: 'open' } });
  if (questions.length > 0) {
    await tx.question.createMany({
      data: questions.map((q) => ({
        cvId,
        path: q.path,
        text: q.text,
        reason: q.reason ?? 'vague',
        status: 'open',
        priority: q.priority ?? 100,
      })),
    });
  }

  // ADR-015: the stored content changed, so the version bumps and the CV is ready.
  await tx.cv.update({ where: { id: cvId }, data: { state: 'ready', version: { increment: 1 }, lastErrorCode: null, lastErrorMessage: null } });
}
