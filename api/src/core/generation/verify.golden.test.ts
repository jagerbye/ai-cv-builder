import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verify } from './verify.js';
import type { PlannedQuestion } from './questions.js';
import type { CvDraft, Fact } from './types.js';

// T-12 (CVB-12), reopened by ADR-013: entries cite their own facts (factIds), and a bullet inherits its parent entry's facts (ADR-002). Golden adversarial fixtures (spec §3.4 F-004, testing-strategy.md "adversarial sources").
// Fixtures live in tests/fixtures/golden/*.json. Each holds the facts and the draft that extract/compose
// would have produced, plus the exact golden output. This file never calls the gateway or any LLM.
// Stub test: every fixture that expects drops must fail a verifier returning accepted = draft unchanged.

interface GoldenFixture {
  name: string;
  description: string;
  source: string;
  facts: Fact[];
  draft: CvDraft;
  expect: {
    accepted: CvDraft;
    droppedPaths: string[];
    questions: { path: string; reason: string }[];
  };
}

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/golden', import.meta.url));

const fixtures: GoldenFixture[] = readdirSync(GOLDEN_DIR)
  .filter((n) => n.endsWith('.json'))
  .sort()
  .map((n) => JSON.parse(readFileSync(`${GOLDEN_DIR}/${n}`, 'utf8')) as GoldenFixture);

const byKey = (a: { path: string; reason?: string }, b: { path: string; reason?: string }): number =>
  `${a.path}|${a.reason ?? ''}`.localeCompare(`${b.path}|${b.reason ?? ''}`);

describe('golden adversarial fixtures (F-004)', () => {
  it('has at least five adversarial fixtures covering the five named kinds', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    expect(fixtures.map((f) => f.name)).toEqual(
      expect.arrayContaining(['almost-empty', 'date-gap', 'first-person', 'prompt-injection', 'ambiguous-role', 'reformatted-dates', 'derived-quantity', 'contact-near-miss']),
    );
  });

  for (const fx of fixtures) {
    describe(fx.name, () => {
      it('matches the golden output exactly (accepted, dropped paths, question path and reason)', () => {
        const result = verify(structuredClone(fx.draft), structuredClone(fx.facts));
        expect(result.accepted).toEqual(fx.expect.accepted);
        expect(result.dropped.map((d) => d.path).sort()).toEqual([...fx.expect.droppedPaths].sort());
        const got = result.questions
          .map((q) => ({ path: q.path, reason: (q as PlannedQuestion).reason }))
          .sort(byKey);
        expect(got).toEqual([...fx.expect.questions].sort(byKey));
      });

      it('gives every question non-empty text', () => {
        const result = verify(structuredClone(fx.draft), structuredClone(fx.facts));
        expect(result.questions.every((q) => q.text.trim().length > 0)).toBe(true);
      });

      it('binds a question to every dropped item', () => {
        const result = verify(structuredClone(fx.draft), structuredClone(fx.facts));
        for (const d of result.dropped) {
          expect(result.questions.some((q) => q.path === d.path || q.path.startsWith(`${d.path}.`))).toBe(true);
        }
      });

      it('is not the draft returned unchanged when it expects drops (stub test)', () => {
        if (fx.expect.droppedPaths.length === 0) return;
        const result = verify(structuredClone(fx.draft), structuredClone(fx.facts));
        expect(result.accepted).not.toEqual(fx.draft);
        expect(result.dropped.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('prompt-injection fixture keeps the output structure', () => {
  const fx = fixtures.find((f) => f.name === 'prompt-injection');

  it('the fixture exists', () => {
    expect(fx).toBeDefined();
  });

  it('returns exactly accepted, questions and dropped', () => {
    const result = verify(structuredClone(fx!.draft), structuredClone(fx!.facts));
    expect(Object.keys(result).sort()).toEqual(['accepted', 'dropped', 'questions']);
  });

  it('accepted has the composed top-level keys, minus the injected summary', () => {
    const result = verify(structuredClone(fx!.draft), structuredClone(fx!.facts));
    expect(Object.keys(result.accepted).sort()).toEqual(['education', 'experience', 'skills', 'targetRole']);
  });

  it('every accepted experience entry and bullet has the composed shape', () => {
    const result = verify(structuredClone(fx!.draft), structuredClone(fx!.facts));
    expect(result.accepted.experience.length).toBeGreaterThan(0);
    for (const e of result.accepted.experience) {
      expect(Object.keys(e).sort()).toEqual(['bullets', 'employer', 'factIds', 'period', 'relevance', 'role']);
      for (const b of e.bullets) {
        expect(Object.keys(b).sort()).toEqual(['factIds', 'text']);
      }
    }
  });

  it('the injected employer, period and accuracy claim appear nowhere in the accepted output', () => {
    const result = verify(structuredClone(fx!.draft), structuredClone(fx!.facts));
    const serialized = JSON.stringify(result.accepted);
    expect(serialized).not.toContain('Google');
    expect(serialized).not.toContain('99%');
    expect(serialized).not.toContain('2010');
  });
});
