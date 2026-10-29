import type { PrismaClient } from '@prisma/client';
import type { ErrorCode } from '../../http/errors.js';
import { assertOwnership } from '../auth/ownership.js';
import { orderExperience } from './order.js';
import { splitQuestionPath } from './persist.js';
import type {
  CvBullet,
  CvContact,
  CvEducation,
  CvExperience,
  CvFact,
  CvQuestion,
  CvResponse,
  CvSkill,
  CvState,
  CvSummary,
} from './types.js';

// C-006 read model. cv_items.data is written only by this codebase (intake, generation, PATCH),
// so the per-kind shapes below are asserted, not re-validated here.
interface ContactData { fullName?: string; email?: string; phone?: string; location?: string; links: string[]; citations?: CvContact['citations'] }
interface TextData { text: string }
interface ExperienceData { employer: string; role: string; period: string; location?: string }
interface EducationData { institution: string; degree?: string; period: string }
interface SkillData { name: string; group?: string }

// Ownership: assertOwnership throws 404 for a missing or foreign CV.
export async function getCv(prisma: PrismaClient, userId: string, cvId: string): Promise<CvResponse> {
  const cv = await prisma.cv.findFirst({
    where: { id: cvId },
    include: {
      // orderIndex alone ties across kinds and after a PATCH; path then id make the read total (C-006).
      items: { orderBy: [{ orderIndex: 'asc' }, { path: 'asc' }, { id: 'asc' }] },
      facts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      questions: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  assertOwnership(userId, cv);
  if (!cv) throw new Error('unreachable');

  const itemsOf = (kind: string) => cv.items.filter((item) => item.kind === kind);

  const contactItem = itemsOf('contact')[0];
  const contact: CvContact = contactItem
    ? { ...(contactItem.data as unknown as ContactData), links: (contactItem.data as unknown as ContactData).links ?? [] }
    : { links: [] };

  const summaryItem = itemsOf('summary')[0];
  const summary: CvSummary | undefined = summaryItem
    ? {
        text: (summaryItem.data as unknown as TextData).text,
        factIds: summaryItem.factIds,
        userEdited: summaryItem.userEdited,
      }
    : undefined;

  const bulletsOf = (parentId: string): CvBullet[] =>
    cv.items
      .filter((item) => item.kind === 'bullet' && item.parentId === parentId)
      .map((item) => ({
        id: item.id,
        text: (item.data as unknown as TextData).text,
        factIds: item.factIds,
        userEdited: item.userEdited,
      }));

  const experienceRows: CvExperience[] =
    itemsOf('experience').map((item) => {
      const data = item.data as unknown as ExperienceData;
      return {
        id: item.id,
        employer: data.employer,
        role: data.role,
        period: data.period,
        location: data.location,
        order: item.orderIndex,
        relevance: item.relevance?.toNumber() ?? 0,
        userEdited: item.userEdited,
        bullets: bulletsOf(item.id),
      };
    });
  // Once the user has touched any entry, the stored order is theirs (C-008 reorder);
  // untouched generated sections keep the relevance presentation order.
  const experience: CvExperience[] = experienceRows.some((e) => e.userEdited)
    ? [...experienceRows].sort((a, b) => a.order - b.order)
    : orderExperience(experienceRows);

  const education: CvEducation[] = itemsOf('education').map((item) => {
    const data = item.data as unknown as EducationData;
    return {
      id: item.id,
      institution: data.institution,
      degree: data.degree,
      period: data.period,
      order: item.orderIndex,
      userEdited: item.userEdited,
    };
  });

  const skills: CvSkill[] = itemsOf('skill').map((item) => {
    const data = item.data as unknown as SkillData;
    return { id: item.id, name: data.name, group: data.group, factIds: item.factIds, userEdited: item.userEdited };
  });

  // ADR-027: a question bound to an item is addressed by where that item sits in THIS response, so the editor's
  // positional alignment is always right. One bound to no item keeps its stored path (a section, summary, contact).
  const positionOf = new Map<string, string>();
  experience.forEach((e, i) => {
    positionOf.set(e.id, `experience[${i}]`);
    e.bullets.forEach((b, j) => positionOf.set(b.id, `experience[${i}].bullets[${j}]`));
  });
  education.forEach((e, i) => positionOf.set(e.id, `education[${i}]`));
  skills.forEach((s, i) => positionOf.set(s.id, `skills[${i}]`));
  const questionPath = (q: { path: string; itemId: string | null }): string => {
    const position = q.itemId === null ? undefined : positionOf.get(q.itemId);
    const split = splitQuestionPath(q.path);
    return position !== undefined && split ? `${position}${split.field}` : q.path;
  };
  const questions: CvQuestion[] = cv.questions.map((q) => ({
    id: q.id,
    path: questionPath(q),
    text: q.text,
    status: q.status as CvQuestion['status'],
  }));

  const facts: CvFact[] = cv.facts.map((f) => ({
    id: f.id,
    kind: f.kind,
    text: f.text,
    sourceQuote: f.sourceQuote,
    source: f.source as CvFact['source'],
  }));

  return {
    id: cv.id,
    title: cv.title ?? '',
    targetRole: cv.targetRole,
    state: cv.state as CvState,
    version: cv.version,
    updatedAt: cv.updatedAt.toISOString(),
    contact,
    summary,
    experience,
    education,
    skills,
    questions,
    facts,
    ...(cv.state === 'failed' && cv.lastErrorCode && cv.lastErrorMessage
      ? { lastError: { code: cv.lastErrorCode as ErrorCode, message: cv.lastErrorMessage } }
      : {}),
  };
}
