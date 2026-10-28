import { describe, it, expect } from 'vitest';
import { orderExperience } from './order.js';
import type { CvExperience } from './types.js';

// T-17 (CVB-15). C-006 / domain-model.md CvItem invariant: experience entries are
// presented sorted by relevance desc, then period end desc. `period` is text
// ("Mar 2021 – Jun 2022", or "Present" for an ongoing role, which counts as newest).
// Pure function, so no database is needed.

function entry(id: string, relevance: number, period: string): CvExperience {
  return {
    id,
    employer: `Employer ${id}`,
    role: `Role ${id}`,
    period,
    order: 0,
    relevance,
    userEdited: false,
    bullets: [],
  };
}

describe('orderExperience (C-006, domain-model CvItem invariant)', () => {
  it('puts the highest relevance first, regardless of period', () => {
    const input = [
      entry('recent-low', 0.2, 'Jan 2024 – Present'),
      entry('old-high', 0.9, 'Jan 2010 – Dec 2012'),
      entry('middle', 0.5, 'Jun 2018 – Mar 2020'),
    ];
    expect(orderExperience(input).map((e) => e.id)).toEqual(['old-high', 'middle', 'recent-low']);
  });

  it('breaks a relevance tie by period end, most recent first', () => {
    const input = [
      entry('early', 0.7, 'Jan 2015 – Dec 2017'),
      entry('latest', 0.7, 'Mar 2021 – Jun 2022'),
      entry('middle', 0.7, 'Feb 2018 – Nov 2020'),
    ];
    expect(orderExperience(input).map((e) => e.id)).toEqual(['latest', 'middle', 'early']);
  });

  it('treats an ongoing role ("Present") as the most recent period end on a relevance tie', () => {
    const input = [
      entry('finished', 0.4, 'Jan 2019 – Dec 2023'),
      entry('ongoing', 0.4, 'Feb 2022 – Present'),
    ];
    expect(orderExperience(input).map((e) => e.id)).toEqual(['ongoing', 'finished']);
  });

  it('returns a new array and leaves the input order untouched', () => {
    const input = [entry('a', 0.1, 'Jan 2020 – Jan 2021'), entry('b', 0.8, 'Jan 2019 – Jan 2020')];
    const before = input.map((e) => e.id);
    const result = orderExperience(input);
    expect(result).not.toBe(input);
    expect(input.map((e) => e.id)).toEqual(before);
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('returns an empty list for no entries', () => {
    expect(orderExperience([])).toEqual([]);
  });
});
