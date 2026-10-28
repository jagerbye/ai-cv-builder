import type { PrismaClient } from '@prisma/client';
import { assertOwnership } from '../auth/ownership.js';

// assertOwnership throws 404 for a missing or foreign CV (nothing is deleted); the userId in the
// delete's WHERE is a second guard. Facts, cv_items, questions and generation_jobs go by ON DELETE CASCADE.
export async function deleteCv(prisma: PrismaClient, userId: string, cvId: string): Promise<void> {
  const cv = await prisma.cv.findFirst({ where: { id: cvId }, select: { id: true, userId: true } });
  assertOwnership(userId, cv);
  await prisma.cv.deleteMany({ where: { id: cvId, userId } });
}
