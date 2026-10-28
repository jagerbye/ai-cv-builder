import { describe, it, expect } from 'vitest';
import { serviceName } from './index';

// T-01 placeholder (B-001). Asserts a concrete value, not expect(true).
describe('api workspace', () => {
  it('reports its service name as "api"', () => {
    expect(serviceName()).toBe('api');
  });
});
