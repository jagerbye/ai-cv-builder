import type { CvExperience } from './types.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Period end as a sortable number (year * 12 + month). "Present" sorts after every date.
// An unparseable end sorts oldest: a malformed period is data to show, not a reason to throw.
function periodEnd(period: string): number {
  const end = period.split(/[–-]/).pop()?.trim() ?? '';
  if (/^present$/i.test(end)) return Number.POSITIVE_INFINITY;
  const match = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(end);
  if (!match) return Number.NEGATIVE_INFINITY;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return Number.NEGATIVE_INFINITY;
  return Number(match[2]) * 12 + month;
}

// Descending comparison that is safe for equal infinities (Infinity - Infinity is NaN).
function desc(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

// C-006 / domain-model CvItem: experience is presented by relevance desc, then period end desc.
// Returns a new array; the input is not mutated. Equal keys keep their input order.
export function orderExperience(entries: readonly CvExperience[]): CvExperience[] {
  return entries
    .map((entry, index) => ({ entry, index, end: periodEnd(entry.period) }))
    .sort(
      (a, b) =>
        desc(a.entry.relevance, b.entry.relevance) || desc(a.end, b.end) || a.index - b.index,
    )
    .map((row) => row.entry);
}
