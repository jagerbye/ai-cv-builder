import type { PrismaClient } from '@prisma/client';

// Returns false when the CV does not exist or belongs to someone else (nothing is deleted).
// The owner is part of the delete's WHERE, so ownership and removal are one statement.
// Facts, cv_items, questions and generation_jobs go by ON DELETE CASCADE in the migration.
export async function deleteCv(prisma: PrismaClient, userId: string, cvId: string): Promise<boolean> {
  const { count } = await prisma.cv.deleteMany({ where: { id: cvId, userId } });
  return count === 1;
}
