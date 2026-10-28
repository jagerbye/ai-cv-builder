import { describe, it, expect } from 'vitest';
// T-19 (CVB-18). Not yet implemented: pdfFilename(fullName, targetRole) is the seam under test.
import { pdfFilename } from './filename.js';

// api-contracts.md C-011: filename="<slug(fullName)>-<slug(targetRole)>.pdf"
describe('pdfFilename (C-011)', () => {
  it('derives a lower-case, hyphenated filename from the name and target role', () => {
    expect(pdfFilename('Ada Lovelace', 'Backend Engineer')).toBe('ada-lovelace-backend-engineer.pdf');
  });

  it('collapses punctuation and repeated separators into single hyphens', () => {
    expect(pdfFilename('  Ada   Lovelace, PhD ', 'Senior Data/ML  Engineer!')).toBe(
      'ada-lovelace-phd-senior-data-ml-engineer.pdf',
    );
  });

  it('never yields a leading or trailing hyphen', () => {
    const name = pdfFilename('--Ada--', '(Backend)');
    expect(name).toBe('ada-backend.pdf');
  });
});
