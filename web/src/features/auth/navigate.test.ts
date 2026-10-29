import { describe, it, expect } from 'vitest';
import { nextPath } from './navigate';

const q = (next: string) => `?next=${encodeURIComponent(next)}`;

describe('nextPath (QA-09, open-redirect guard)', () => {
  it.each(['/\\evil.example/x', '//evil.example', 'https://evil.example/', '/auth', '/auth/signup'])(
    'falls back to /cvs for %s',
    (next) => {
      expect(nextPath(q(next))).toBe('/cvs');
    },
  );

  it('falls back to /cvs when next is missing', () => {
    expect(nextPath('')).toBe('/cvs');
  });

  it('preserves an in-app path with its query', () => {
    expect(nextPath(q('/cvs/cv-1?x=1'))).toBe('/cvs/cv-1?x=1');
  });
});
