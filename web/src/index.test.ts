import { describe, it, expect } from 'vitest';
import { serviceName } from './index';

// T-01 placeholder (B-001). Asserts a concrete value, not expect(true).
describe('web workspace', () => {
  it('reports its service name as "web"', () => {
    expect(serviceName()).toBe('web');
  });
});
