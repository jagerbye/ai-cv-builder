// One fallback for a CV with no title, shared by the list and the editor (QA-13).
export const UNTITLED_CV = 'Untitled CV';

export function cvDisplayTitle(title: string | null | undefined): string {
  const trimmed = (title ?? '').trim();
  return trimmed === '' ? UNTITLED_CV : trimmed;
}
