import { randomUUID } from 'node:crypto';
import type { CvItem, Prisma, PrismaClient } from '@prisma/client';
import { getCv } from './read.js';
import type { CvResponse } from './types.js';

// T-18 (CVB-16). C-008 PATCH /api/cvs/:cvId: partial update with optimistic concurrency.
// Rules (spec §3.6, domain-model CvItem and Fact):
//  - a field present in the patch is replaced whole; absent fields are untouched;
//  - arrays are sent whole: array position is the new order and the new path;
//  - an item whose content or position changed is userEdited=true; a changed content also
//    writes a source='user' fact (no quote). The groundedness verifier never runs here;
//  - the version guard is the first write in one transaction, so a stale version writes nothing.

type Rec = Record<string, unknown>;

class ValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_FIELDS = ['contact', 'summary', 'experience', 'education', 'skills'];
const MAX_ITEMS = 100;

export type PatchResult =
  | { ok: true; cv: CvResponse }
  | { ok: false; reason: 'NOT_FOUND' | 'VERSION_CONFLICT' }
  | { ok: false; reason: 'VALIDATION'; message: string };

interface ContactIn { fullName: string; email?: string; phone?: string; location?: string; links: string[] }
interface SummaryIn { text: string; factIds?: string[] }
interface BulletIn { id: string; text: string; factIds?: string[] }
interface ExperienceIn { id: string; employer: string; role: string; period: string; location?: string; relevance?: number; bullets: BulletIn[] }
interface EducationIn { id: string; institution: string; degree?: string; period: string }
interface SkillIn { id: string; name: string; group?: string; factIds?: string[] }

interface ParsedPatch {
  version: number;
  contact?: ContactIn;
  summary?: SummaryIn;
  experience?: ExperienceIn[];
  education?: EducationIn[];
  skills?: SkillIn[];
}

// ---- body parsing: every failure is a ValidationError, mapped to 400 VALIDATION ----

function fail(message: string): never {
  throw new ValidationError(message);
}

function asRecord(value: unknown, where: string): Rec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} must be an object`);
  return value as Rec;
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  if (value.length > MAX_ITEMS) fail(`${where} can hold at most ${MAX_ITEMS} items`);
  return value;
}

function text(value: unknown, where: string, min: number, max: number): string {
  if (typeof value !== 'string') fail(`${where} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) fail(`${where} must be ${min} to ${max} characters`);
  return trimmed;
}

function optionalText(value: unknown, where: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = text(value, where, 0, max);
  return trimmed === '' ? undefined : trimmed;
}

function uuid(value: unknown, where: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${where} must be a uuid`);
  return value.toLowerCase();
}

// A new item may omit its id; the server then assigns one.
function itemId(value: unknown, where: string): string {
  return value === undefined || value === null ? randomUUID() : uuid(value, where);
}

function optionalFactIds(value: unknown, where: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return [...new Set(asArray(value, where).map((id, i) => uuid(id, `${where}[${i}]`)))];
}

function optionalRelevance(value: unknown, where: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${where} must be a number from 0 to 1`);
  }
  return value;
}

function parseContact(value: unknown): ContactIn {
  const r = asRecord(value, 'patch.contact');
  const links =
    r.links === undefined ? [] : asArray(r.links, 'patch.contact.links').map((l, i) => text(l, `patch.contact.links[${i}]`, 1, 500));
  return {
    fullName: text(r.fullName, 'patch.contact.fullName', 1, 200),
    email: optionalText(r.email, 'patch.contact.email', 200),
    phone: optionalText(r.phone, 'patch.contact.phone', 50),
    location: optionalText(r.location, 'patch.contact.location', 200),
    links,
  };
}

function parseSummary(value: unknown): SummaryIn {
  const r = asRecord(value, 'patch.summary');
  return {
    text: text(r.text, 'patch.summary.text', 1, 2000),
    factIds: optionalFactIds(r.factIds, 'patch.summary.factIds'),
  };
}

function parseBullet(value: unknown, where: string): BulletIn {
  const r = asRecord(value, where);
  return {
    id: itemId(r.id, `${where}.id`),
    text: text(r.text, `${where}.text`, 1, 2000),
    factIds: optionalFactIds(r.factIds, `${where}.factIds`),
  };
}

function parseExperience(value: unknown): ExperienceIn[] {
  return asArray(value, 'patch.experience').map((item, i) => {
    const where = `patch.experience[${i}]`;
    const r = asRecord(item, where);
    return {
      id: itemId(r.id, `${where}.id`),
      employer: text(r.employer, `${where}.employer`, 1, 200),
      role: text(r.role, `${where}.role`, 1, 200),
      period: text(r.period, `${where}.period`, 1, 100),
      location: optionalText(r.location, `${where}.location`, 200),
      relevance: optionalRelevance(r.relevance, `${where}.relevance`),
      bullets: asArray(r.bullets, `${where}.bullets`).map((b, j) => parseBullet(b, `${where}.bullets[${j}]`)),
    };
  });
}

function parseEducation(value: unknown): EducationIn[] {
  return asArray(value, 'patch.education').map((item, i) => {
    const where = `patch.education[${i}]`;
    const r = asRecord(item, where);
    return {
      id: itemId(r.id, `${where}.id`),
      institution: text(r.institution, `${where}.institution`, 1, 200),
      degree: optionalText(r.degree, `${where}.degree`, 200),
      period: text(r.period, `${where}.period`, 1, 100),
    };
  });
}

function parseSkills(value: unknown): SkillIn[] {
  return asArray(value, 'patch.skills').map((item, i) => {
    const where = `patch.skills[${i}]`;
    const r = asRecord(item, where);
    return {
      id: itemId(r.id, `${where}.id`),
      name: text(r.name, `${where}.name`, 1, 100),
      group: optionalText(r.group, `${where}.group`, 100),
      factIds: optionalFactIds(r.factIds, `${where}.factIds`),
    };
  });
}

function assertUniqueIds(p: ParsedPatch): void {
  const ids = [
    ...(p.experience ?? []).flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ...(p.education ?? []).map((e) => e.id),
    ...(p.skills ?? []).map((s) => s.id),
  ];
  if (new Set(ids).size !== ids.length) fail('an id appears more than once in the patch');
}

function parsePatchBody(body: unknown): ParsedPatch {
  const root = asRecord(body, 'body');
  if (!Number.isInteger(root.version) || (root.version as number) < 0) {
    fail('version must be a non-negative integer');
  }
  const patch = asRecord(root.patch, 'patch');
  for (const key of Object.keys(patch)) {
    if (!SECTION_FIELDS.includes(key)) fail(`patch.${key} is not an editable field`);
  }
  const parsed: ParsedPatch = { version: root.version as number };
  if (patch.contact !== undefined) parsed.contact = parseContact(patch.contact);
  if (patch.summary !== undefined) parsed.summary = parseSummary(patch.summary);
  if (patch.experience !== undefined) parsed.experience = parseExperience(patch.experience);
  if (patch.education !== undefined) parsed.education = parseEducation(patch.education);
  if (patch.skills !== undefined) parsed.skills = parseSkills(patch.skills);
  assertUniqueIds(parsed);
  return parsed;
}

// ---- writing ----

const FACT_KIND: Record<string, string> = {
  contact: 'contact',
  summary: 'other',
  experience: 'employment',
  bullet: 'achievement',
  education: 'education',
  skill: 'skill',
};

// Kinds a patched section owns. Deleting and re-inserting the section avoids clashes on the
// unique (cvId, path) while paths are renumbered; ids and createdAt are carried over.
const SECTION_KINDS = {
  contact: ['contact'],
  summary: ['summary'],
  experience: ['experience', 'bullet'],
  education: ['education'],
  skills: ['skill'],
} as const;

type Section = keyof typeof SECTION_KINDS;

interface Slot {
  existing: CvItem | undefined;
  kind: string;
  id: string;
  parentId: string | null;
  path: string;
  orderIndex: number;
  data: Record<string, unknown>;
  relevance: number | null;
  // Client-cited facts. Used only when the item's content changed; an unchanged item keeps its own.
  factIds: string[] | undefined;
  factText: string;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

// Key-sorted JSON: jsonb reorders keys, so comparisons must not depend on key order.
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function settle(slot: Slot, cvId: string, facts: Prisma.FactCreateManyInput[]): Prisma.CvItemCreateManyInput {
  const { existing } = slot;
  const contentChanged =
    !existing ||
    canon(existing.data) !== canon(slot.data) ||
    (existing.relevance?.toNumber() ?? null) !== slot.relevance;
  const moved = !!existing && (existing.orderIndex !== slot.orderIndex || existing.parentId !== slot.parentId);

  let factIds: string[];
  if (contentChanged) {
    const factId = randomUUID();
    facts.push({ id: factId, cvId, kind: FACT_KIND[slot.kind] ?? 'other', text: slot.factText, sourceQuote: '', source: 'user' });
    factIds = [...(slot.factIds ?? existing?.factIds ?? []), factId];
  } else {
    factIds = existing?.factIds ?? [];
  }

  return {
    id: slot.id,
    cvId,
    kind: slot.kind,
    parentId: slot.parentId,
    path: slot.path,
    orderIndex: slot.orderIndex,
    data: slot.data as Prisma.InputJsonValue,
    factIds,
    relevance: slot.relevance,
    userEdited: existing?.userEdited === true || contentChanged || moved,
    createdAt: existing?.createdAt,
  };
}

async function writePatch(tx: Prisma.TransactionClient, cvId: string, p: ParsedPatch): Promise<void> {
  const items = await tx.cvItem.findMany({ where: { cvId } });
  const byId = new Map(items.map((item) => [item.id, item]));
  const ofKind = (kind: string) => items.filter((item) => item.kind === kind);

  // Ids the client names must be this CV's own items of the same kind, or new ids.
  const named: [string, string][] = [];
  for (const e of p.experience ?? []) {
    named.push([e.id, 'experience']);
    for (const b of e.bullets) named.push([b.id, 'bullet']);
  }
  for (const e of p.education ?? []) named.push([e.id, 'education']);
  for (const s of p.skills ?? []) named.push([s.id, 'skill']);
  for (const [id, kind] of named) {
    const existing = byId.get(id);
    if (existing && existing.kind !== kind) fail(`${id} is not a ${kind} of this CV`);
  }
  if (named.length > 0) {
    const elsewhere = await tx.cvItem.count({ where: { id: { in: named.map(([id]) => id) }, cvId: { not: cvId } } });
    if (elsewhere > 0) fail('an id belongs to another CV');
  }

  const cited = new Set<string>([
    ...(p.summary?.factIds ?? []),
    ...(p.experience ?? []).flatMap((e) => e.bullets.flatMap((b) => b.factIds ?? [])),
    ...(p.skills ?? []).flatMap((s) => s.factIds ?? []),
  ]);
  if (cited.size > 0) {
    const found = await tx.fact.count({ where: { cvId, id: { in: [...cited] } } });
    if (found !== cited.size) fail('factIds must name facts of this CV');
  }

  const replaced: string[] = [];
  const facts: Prisma.FactCreateManyInput[] = [];
  const experienceRows: Prisma.CvItemCreateManyInput[] = [];
  const bulletRows: Prisma.CvItemCreateManyInput[] = [];
  const otherRows: Prisma.CvItemCreateManyInput[] = [];

  const sectionKinds = (section: Section): string[] => [...SECTION_KINDS[section]];

  if (p.contact) {
    const c = p.contact;
    replaced.push(...sectionKinds('contact'));
    const existing = ofKind('contact')[0];
    otherRows.push(
      settle(
        {
          existing,
          kind: 'contact',
          id: existing?.id ?? randomUUID(),
          parentId: null,
          path: 'contact',
          orderIndex: 0,
          data: compact({ fullName: c.fullName, email: c.email, phone: c.phone, location: c.location, links: c.links }),
          relevance: null,
          factIds: undefined,
          factText: [c.fullName, c.email, c.phone, c.location].filter(Boolean).join(', '),
        },
        cvId,
        facts,
      ),
    );
  }

  if (p.summary) {
    const s = p.summary;
    replaced.push(...sectionKinds('summary'));
    const existing = ofKind('summary')[0];
    otherRows.push(
      settle(
        {
          existing,
          kind: 'summary',
          id: existing?.id ?? randomUUID(),
          parentId: null,
          path: 'summary',
          orderIndex: 0,
          data: { text: s.text },
          relevance: null,
          factIds: s.factIds,
          factText: s.text,
        },
        cvId,
        facts,
      ),
    );
  }

  if (p.experience) {
    replaced.push(...sectionKinds('experience'));
    p.experience.forEach((e, i) => {
      const existing = byId.get(e.id);
      const expRow = settle(
        {
          existing,
          kind: 'experience',
          id: e.id,
          parentId: null,
          path: `experience[${i}]`,
          orderIndex: i,
          data: compact({ employer: e.employer, role: e.role, period: e.period, location: e.location }),
          relevance: e.relevance ?? existing?.relevance?.toNumber() ?? 0,
          factIds: undefined,
          factText: `${e.role} at ${e.employer} (${e.period})`,
        },
        cvId,
        facts,
      );
      experienceRows.push(expRow);
      e.bullets.forEach((b, j) => {
        bulletRows.push(
          settle(
            {
              existing: byId.get(b.id),
              kind: 'bullet',
              id: b.id,
              parentId: e.id,
              path: `experience[${i}].bullets[${j}]`,
              orderIndex: j,
              data: { text: b.text },
              relevance: null,
              factIds: b.factIds,
              factText: b.text,
            },
            cvId,
            facts,
          ),
        );
      });
    });
  }

  if (p.education) {
    replaced.push(...sectionKinds('education'));
    p.education.forEach((ed, i) => {
      otherRows.push(
        settle(
          {
            existing: byId.get(ed.id),
            kind: 'education',
            id: ed.id,
            parentId: null,
            path: `education[${i}]`,
            orderIndex: i,
            data: compact({ institution: ed.institution, degree: ed.degree, period: ed.period }),
            relevance: null,
            factIds: undefined,
            factText: `${ed.degree ? `${ed.degree}, ` : ''}${ed.institution} (${ed.period})`,
          },
          cvId,
          facts,
        ),
      );
    });
  }

  if (p.skills) {
    replaced.push(...sectionKinds('skills'));
    p.skills.forEach((s, i) => {
      otherRows.push(
        settle(
          {
            existing: byId.get(s.id),
            kind: 'skill',
            id: s.id,
            parentId: null,
            path: `skills[${i}]`,
            orderIndex: i,
            data: compact({ name: s.name, group: s.group }),
            relevance: null,
            factIds: s.factIds,
            factText: s.name,
          },
          cvId,
          facts,
        ),
      );
    });
  }

  if (replaced.length > 0) await tx.cvItem.deleteMany({ where: { cvId, kind: { in: replaced } } });
  if (facts.length > 0) await tx.fact.createMany({ data: facts });
  if (experienceRows.length > 0) await tx.cvItem.createMany({ data: experienceRows });
  if (bulletRows.length > 0) await tx.cvItem.createMany({ data: bulletRows });
  if (otherRows.length > 0) await tx.cvItem.createMany({ data: otherRows });
}

type TxOutcome = { kind: 'done' } | { kind: 'conflict' } | { kind: 'notFound' };

export async function applyCvPatch(
  prisma: PrismaClient,
  userId: string,
  cvId: string,
  body: unknown,
): Promise<PatchResult> {
  let patch: ParsedPatch;
  try {
    patch = parsePatchBody(body);
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, reason: 'VALIDATION', message: err.message };
    throw err;
  }

  let outcome: TxOutcome;
  try {
    outcome = await prisma.$transaction(async (tx): Promise<TxOutcome> => {
      // The guarded update runs first: it locks the CV row, so a concurrent PATCH carrying the
      // same version waits here and then finds count 0. Any throw below rolls the bump back.
      const guard = await tx.cv.updateMany({
        where: { id: cvId, userId, version: patch.version },
        data: { version: { increment: 1 } },
      });
      if (guard.count === 0) {
        const exists = await tx.cv.findFirst({ where: { id: cvId, userId }, select: { id: true } });
        return exists ? { kind: 'conflict' } : { kind: 'notFound' };
      }
      await writePatch(tx, cvId, patch);
      return { kind: 'done' };
    });
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, reason: 'VALIDATION', message: err.message };
    throw err;
  }

  if (outcome.kind === 'conflict') return { ok: false, reason: 'VERSION_CONFLICT' };
  if (outcome.kind === 'notFound') return { ok: false, reason: 'NOT_FOUND' };
  const cv = await getCv(prisma, userId, cvId);
  return cv ? { ok: true, cv } : { ok: false, reason: 'NOT_FOUND' };
}
