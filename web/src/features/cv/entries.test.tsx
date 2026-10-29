// QA-11 (visual). design.json icons.rule keeps one icon, and it is used only where a
// control repeats per row and has no room for a label. Every other control is a text
// label. The editor used a trash icon for skills and the word "Delete" everywhere
// else. This suite holds the editor to the text treatment: each delete control shows
// the word "Delete" and no icon appears in the editor. Accessible names are unchanged.
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { cvA, installApi, mountEditor, registerEditorHooks, setViewport } from './testkit';

registerEditorHooks();

describe('QA-11: one treatment for delete, at 375px', () => {
  it('the skill delete button shows the word Delete, like every other delete, with no icon inside it', async () => {
    setViewport(375);
    installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const skills = await screen.findByRole('region', { name: 'Skills' });
    const row = within(skills).getAllByRole('listitem')[0];
    const remove = within(row).getByRole('button', { name: 'Delete skill PostgreSQL' });
    expect(remove.textContent?.trim()).toBe('Delete');
    expect(remove.querySelector('svg')).toBeNull();
  });

  it('every delete control in the editor shows the word Delete, and no icon appears anywhere in the editor', async () => {
    setViewport(375);
    installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Skills' });
    const deletes = screen
      .getAllByRole('button')
      .filter((b) => /^Delete\b/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
    expect(deletes.length).toBeGreaterThan(0);
    for (const button of deletes) {
      expect(button.textContent?.trim().startsWith('Delete')).toBe(true);
      expect(button.querySelector('svg')).toBeNull();
    }
    expect(document.querySelectorAll('.cv-page svg')).toHaveLength(0);
  });
});
