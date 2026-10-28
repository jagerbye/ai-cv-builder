import { ApiError } from '../../http/errors.js';

// C-002 / F-001: another user's entity is 404, never 403, so existence does not leak.
// A missing entity takes the same path, so the two cases are indistinguishable.
// The message names neither id.
export function assertOwnership(userId: string, entity: { userId: string } | null | undefined): void {
  if (!entity || entity.userId !== userId) {
    throw new ApiError(404, 'NOT_FOUND', 'Not found.');
  }
}
