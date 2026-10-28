// T-19 (CVB-18). C-011 download filename: "<slug(fullName)>-<slug(targetRole)>.pdf".
// The header value must be ASCII (Node rejects other characters in headers), so names
// are folded to ASCII first: "Zürich" becomes "zurich". A part that folds to nothing,
// such as an all-Cyrillic name, is dropped; if both parts are empty the name is "cv".

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pdfFilename(fullName: string | undefined, targetRole: string): string {
  const parts = [slugify(fullName ?? ''), slugify(targetRole)].filter((part) => part.length > 0);
  return `${parts.join('-') || 'cv'}.pdf`;
}
