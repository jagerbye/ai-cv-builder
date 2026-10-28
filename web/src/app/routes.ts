import type { ComponentType } from 'react';
import AuthRoute from '../features/auth/route';
import IntakeRoute from '../features/intake/route';
import GenerationRoute from '../features/generation/route';
import CvRoute from '../features/cv/route';

// The registry is written once here. Feature tasks fill their own route module
// and never edit this file.
//
// Path patterns: literal segments, `:name` matches one non-empty segment, and a
// trailing `*` matches the segments before it and anything under them. When
// several patterns match, the one with more literal segments wins, so
// `/cvs/new` (intake) beats `/cvs/*` (cv).
export type FeatureName = 'auth' | 'intake' | 'generation' | 'cv';
export type Branch = 'public' | 'protected';

export interface RouteEntry {
  feature: FeatureName;
  path: string;
  branch: Branch;
  component: ComponentType;
}

export const routes: RouteEntry[] = [
  { feature: 'auth', path: '/auth/*', branch: 'public', component: AuthRoute },
  { feature: 'intake', path: '/cvs/new', branch: 'protected', component: IntakeRoute },
  { feature: 'generation', path: '/jobs/:jobId', branch: 'protected', component: GenerationRoute },
  { feature: 'cv', path: '/cvs/*', branch: 'protected', component: CvRoute },
];

function segments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

// Returns the number of literal segments when the pattern matches, otherwise -1.
function matchScore(pattern: string, pathname: string): number {
  const want = segments(pattern);
  const got = segments(pathname);
  const wild = want[want.length - 1] === '*';
  const fixed = wild ? want.slice(0, -1) : want;
  if (wild ? got.length < fixed.length : got.length !== fixed.length) return -1;
  let literal = 0;
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i].startsWith(':')) {
      if (got[i].length === 0) return -1;
    } else if (fixed[i] === got[i]) {
      literal++;
    } else {
      return -1;
    }
  }
  return literal;
}

export function resolveRoute(pathname: string): RouteEntry | undefined {
  let best: RouteEntry | undefined;
  let bestScore = -1;
  for (const route of routes) {
    const score = matchScore(route.path, pathname);
    if (score > bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}
