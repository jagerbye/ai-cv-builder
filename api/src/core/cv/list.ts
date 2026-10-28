import type { PrismaClient } from '@prisma/client';
import type { CvResponse } from './types.js';

// C-007 list row: the five summary fields, nothing from the body of the CV.
export type CvListItem = Pick<CvResponse, 'id' | 'title' | 'targetRole' | 'state' | 'updatedAt'>;

// Only the session user's CVs, newest first.
export async function listCvs(prisma: PrismaClient, userId: string): Promise<CvListItem[]> {
  const rows = await prisma.cv.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, targetRole: true, state: true, updatedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    targetRole: row.targetRole,
    state: row.state as CvListItem['state'],
    updatedAt: row.updatedAt.toISOString(),
  }));
}
