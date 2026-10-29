// T-22 (CVB-15) — CV editor: fetch, render, edit in place, add/delete/reorder,
// design rules. Acceptance tests written before code; they fail until the
// editor exists. Mocks only fetch; see testkit.tsx for the DOM contract.
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { cvA, cvB, installApi, mountEditor, commit, registerEditorHooks } from './testkit';

registerEditorHooks();

describe('CV editor — fetch and render (F-006, C-006)', () => {
  it('GETs the CV named in the path and renders the contact details', async () => {
    const api = installApi([cvA(), cvB()]);
    mountEditor('/cvs/cv-1');
    const contact = await screen.findByRole('region', { name: 'Contact' });
    expect(api.gets()).toEqual(['/api/cvs/cv-1']);
    expect(within(contact).getByRole('textbox', { name: 'Full name' })).toHaveProperty('value', 'Ana Lovelace');
    expect(within(contact).getByRole('textbox', { name: 'Email' })).toHaveProperty('value', 'ana@example.com');
    expect(within(contact).getByRole('textbox', { name: 'Phone' })).toHaveProperty('value', '+44 20 7946 0001');
    expect(within(contact).getByRole('textbox', { name: 'Location' })).toHaveProperty('value', 'London');
    expect(within(contact).getByRole('textbox', { name: 'Links' })).toHaveProperty('value', 'https://github.com/ana-l');
  });

  it('renders the summary and each experience entry with employer, role, period and bullets', async () => {
    installApi([cvA(), cvB()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Experience' });
    expect(screen.getByRole('textbox', { name: 'Summary' })).toHaveProperty(
      'value',
      'Backend engineer with nine years of payments work.',
    );
    const entries = within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article');
    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByRole('textbox', { name: 'Employer' })).toHaveProperty('value', 'Northwind Labs');
    expect(within(entries[0]).getByRole('textbox', { name: 'Role' })).toHaveProperty('value', 'Senior engineer');
    expect(within(entries[0]).getByRole('textbox', { name: 'Period' })).toHaveProperty('value', '2019 – 2023');
    const bullets0 = within(entries[0]).getAllByRole('textbox', { name: 'Bullet' });
    expect(bullets0.map((b) => (b as HTMLInputElement).value)).toEqual([
      'Cut settlement latency by 40%.',
      'Led a team of four.',
    ]);
    expect(within(entries[1]).getByRole('textbox', { name: 'Employer' })).toHaveProperty('value', 'Acme Corp');
    expect(within(entries[1]).getByRole('textbox', { name: 'Period' })).toHaveProperty('value', '2015 – 2019');
  });

  it('renders the education entry and the skills of the CV in the path, not the other one', async () => {
    installApi([cvA(), cvB()]);
    mountEditor('/cvs/cv-2');
    const education = await screen.findByRole('region', { name: 'Education' });
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveProperty('value', 'Grace Hopper');
    const entry = within(education).getByRole('article');
    expect(within(entry).getByRole('textbox', { name: 'Institution' })).toHaveProperty('value', 'Vassar College');
    expect(within(entry).getByRole('textbox', { name: 'Degree' })).toHaveProperty('value', 'BA Mathematics');
    expect(within(entry).getByRole('textbox', { name: 'Period' })).toHaveProperty('value', '1924 – 1928');
    const skills = within(screen.getByRole('region', { name: 'Skills' })).getAllByRole('textbox', { name: 'Skill' });
    expect(skills.map((s) => (s as HTMLInputElement).value)).toEqual(['COBOL']);
    expect(screen.queryByDisplayValue('Ana Lovelace')).toBeNull();
  });

  it('shows the server message for a 404 envelope and renders no editable fields (error case)', async () => {
    installApi([cvA()]);
    mountEditor('/cvs/cv-404');
    expect(await screen.findByText('No CV with that id.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Contact' })).toBeNull();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('shows the generic message for a non-JSON 500 and never the raw body (error case)', async () => {
    const api = installApi([cvA()]);
    api.nextGet(new Response('<html>stack trace at editor.js:9</html>', { status: 500 }));
    mountEditor('/cvs/cv-1');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/stack trace/)).toBeNull();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

describe('CV editor — edit in place (F-006 "every field the generator can write")', () => {
  it('commits a contact edit as a PATCH whose patch carries the whole contact object', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const email = await screen.findByRole('textbox', { name: 'Email' });
    commit(email, 'ana@new.example');
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    const { body } = api.patches()[0];
    expect(body.patch.contact.email).toBe('ana@new.example');
    expect(body.patch.contact.fullName).toBe('Ana Lovelace');
    expect(Object.keys(body.patch)).toEqual(['contact']);
  });

  it('every generator-written field saves its edited value to the server', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Contact' });
    const edits: Array<[string, string, string]> = [
      ['Contact', 'Full name', 'Ana Byron'],
      ['Contact', 'Phone', '+44 20 7946 0999'],
      ['Contact', 'Location', 'Cambridge'],
      ['Contact', 'Links', 'https://example.org/ana'],
      ['Summary', 'Summary', 'Payments lead.'],
      ['Experience', 'Employer', 'Globex'],
      ['Experience', 'Role', 'Staff engineer'],
      ['Experience', 'Period', '2020 – 2024'],
      ['Experience', 'Location', 'Berlin'],
      ['Experience', 'Bullet', 'Owned the ledger rewrite.'],
      ['Education', 'Institution', 'Imperial College'],
      ['Education', 'Degree', 'MSc Distributed Systems'],
      ['Education', 'Period', '2014 – 2015'],
      ['Skills', 'Skill', 'Rust'],
    ];
    // Each save must land before the next, so the next PATCH carries the version
    // the server returned (C-008). Otherwise the fake answers 409.
    for (const [i, [region, name, value]] of edits.entries()) {
      const scope = within(screen.getByRole('region', { name: region }));
      commit(scope.getAllByRole('textbox', { name })[0], value);
      await waitFor(() => expect(api.current('cv-1').version).toBe(7 + i + 1));
    }
    await waitFor(() => {
      const saved = api.current('cv-1');
      expect(saved.contact).toMatchObject({ fullName: 'Ana Byron', phone: '+44 20 7946 0999', location: 'Cambridge' });
      expect(saved.contact.links).toEqual(['https://example.org/ana']);
      expect(saved.summary?.text).toBe('Payments lead.');
      expect(saved.experience[0]).toMatchObject({ employer: 'Globex', role: 'Staff engineer', period: '2020 – 2024', location: 'Berlin' });
      expect(saved.experience[0].bullets[0].text).toBe('Owned the ledger rewrite.');
      expect(saved.education[0]).toMatchObject({ institution: 'Imperial College', degree: 'MSc Distributed Systems', period: '2014 – 2015' });
      expect(saved.skills[0].name).toBe('Rust');
    });
  });

  it('shows the server field message under the field when a PATCH answers 400 VALIDATION (error case)', async () => {
    const api = installApi([cvA()]);
    api.planPatch({
      kind: 'respond',
      status: 400,
      body: {
        error: {
          code: 'VALIDATION',
          message: 'Check the highlighted fields.',
          details: [{ path: 'contact.email', message: 'Not a valid email' }],
        },
      },
    });
    mountEditor('/cvs/cv-1');
    const email = await screen.findByRole('textbox', { name: 'Email' });
    commit(email, 'not-an-email');
    expect(await screen.findByText('Not a valid email')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement).value).toBe('not-an-email');
    expect(api.current('cv-1').contact.email).toBe('ana@example.com');
  });
});

describe('CV editor — add, delete and reorder (F-006)', () => {
  it('adds an experience entry, an education entry and a skill, and saves them', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    fireAdd(experience, 'Add experience');
    expect(within(experience).getAllByRole('article')).toHaveLength(3);
    const newEntry = within(experience).getAllByRole('article')[2];
    commit(within(newEntry).getByRole('textbox', { name: 'Employer' }), 'Initech');
    await waitFor(() => expect(api.current('cv-1').experience).toHaveLength(3));
    expect(api.current('cv-1').experience[2].employer).toBe('Initech');

    const education = screen.getByRole('region', { name: 'Education' });
    fireAdd(education, 'Add education');
    commit(within(within(education).getAllByRole('article')[1]).getByRole('textbox', { name: 'Institution' }), 'Bletchley Park');
    await waitFor(() => expect(api.current('cv-1').education).toHaveLength(2));
    expect(api.current('cv-1').education[1].institution).toBe('Bletchley Park');

    const skills = screen.getByRole('region', { name: 'Skills' });
    fireAdd(skills, 'Add skill');
    const newSkill = within(skills).getAllByRole('textbox', { name: 'Skill' })[2];
    commit(newSkill, 'Rust');
    await waitFor(() => expect(api.current('cv-1').skills.map((s) => s.name)).toEqual(['PostgreSQL', 'Go', 'Rust']));
  });

  it('does not save an empty new skill until the user has typed a name (negative case)', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const skills = await screen.findByRole('region', { name: 'Skills' });
    fireAdd(skills, 'Add skill');
    expect(within(skills).getAllByRole('textbox', { name: 'Skill' })).toHaveLength(3);
    expect(api.patches()).toHaveLength(0);
    expect(api.current('cv-1').skills).toHaveLength(2);
  });

  it('adds a bullet to an experience entry and saves it as the entry\'s last bullet', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    const entry = within(experience).getAllByRole('article')[0];
    fireAdd(entry, 'Add bullet');
    const bullets = within(entry).getAllByRole('textbox', { name: 'Bullet' });
    expect(bullets).toHaveLength(3);
    commit(bullets[2], 'Ran the on-call rota.');
    await waitFor(() => expect(api.current('cv-1').experience[0].bullets).toHaveLength(3));
    expect(api.current('cv-1').experience[0].bullets[2].text).toBe('Ran the on-call rota.');
  });

  it('deletes an experience entry at once and the saved list no longer has it', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    fireClick(within(within(experience).getAllByRole('article')[1]).getByRole('button', { name: 'Delete' }));
    expect(within(experience).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByDisplayValue('Acme Corp')).toBeNull();
    await waitFor(() => expect(api.current('cv-1').experience.map((e) => e.id)).toEqual(['exp-1']));
  });

  it('deletes a bullet, an education entry and a skill, each saved', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    const bulletItem = within(experience).getAllByRole('article')[0].querySelectorAll('li')[0] as HTMLElement;
    fireClick(within(bulletItem).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.current('cv-1').experience[0].bullets.map((b) => b.text)).toEqual(['Led a team of four.']));

    const education = screen.getByRole('region', { name: 'Education' });
    fireClick(within(education).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.current('cv-1').education).toEqual([]));
    expect(within(education).queryAllByRole('article')).toHaveLength(0);

    const skills = screen.getByRole('region', { name: 'Skills' });
    fireClick(within(skills).getByRole('button', { name: 'Delete skill Go' }));
    await waitFor(() => expect(api.current('cv-1').skills.map((s) => s.name)).toEqual(['PostgreSQL']));
  });

  it('moves an experience entry up and sends the whole array in the new order', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    fireClick(within(within(experience).getAllByRole('article')[1]).getByRole('button', { name: 'Move up' }));
    const employers = within(experience)
      .getAllByRole('article')
      .map((a) => (within(a).getByRole('textbox', { name: 'Employer' }) as HTMLInputElement).value);
    expect(employers).toEqual(['Acme Corp', 'Northwind Labs']);
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    expect(api.patches()[0].body.patch.experience.map((e: { id: string }) => e.id)).toEqual(['exp-2', 'exp-1']);
    expect(api.current('cv-1').experience.map((e) => e.employer)).toEqual(['Acme Corp', 'Northwind Labs']);
  });

  it('moves a bullet up and a skill up, each saved in the new order', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    const secondBullet = within(experience).getAllByRole('article')[0].querySelectorAll('li')[1] as HTMLElement;
    fireClick(within(secondBullet).getByRole('button', { name: 'Move up' }));
    await waitFor(() => expect(api.current('cv-1').experience[0].bullets.map((b) => b.id)).toEqual(['b-2', 'b-1']));

    const skills = screen.getByRole('region', { name: 'Skills' });
    const secondSkill = skills.querySelectorAll('li')[1] as HTMLElement;
    fireClick(within(secondSkill).getByRole('button', { name: 'Move up' }));
    await waitFor(() => expect(api.current('cv-1').skills.map((s) => s.name)).toEqual(['Go', 'PostgreSQL']));
  });

  it('disables Move up on the first entry and Move down on the last, and saves nothing (negative case)', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    const [first, last] = within(experience).getAllByRole('article');
    expect((within(first).getByRole('button', { name: 'Move up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(last).getByRole('button', { name: 'Move down' }) as HTMLButtonElement).disabled).toBe(true);
    fireClick(within(first).getByRole('button', { name: 'Move up' }));
    expect(within(experience).getAllByRole('article')[0]).toBe(first);
    expect(api.patches()).toHaveLength(0);
  });
});

describe('CV editor — design rules (design.json: icons, text controls)', () => {
  it('uses text for every control except the trash icon, and the trash icon sits only on a skill (negative case for extra icons)', async () => {
    installApi([cvA()]);
    const { container } = mountEditor('/cvs/cv-1');
    await screen.findByRole('region', { name: 'Experience' });
    const svgs = Array.from(container.querySelectorAll('svg'));
    for (const svg of svgs) {
      const button = svg.closest('button');
      expect(button).not.toBeNull();
      expect(button!.getAttribute('aria-label') ?? button!.textContent ?? '').toMatch(/^Delete skill /);
    }
    const moveButtons = screen.getAllByRole('button', { name: 'Move up' });
    expect(moveButtons.length).toBeGreaterThan(0);
    for (const b of moveButtons) {
      expect(b.textContent).toBe('Move up');
      expect(b.querySelector('svg')).toBeNull();
    }
  });
});

function fireAdd(scope: HTMLElement, name: string) {
  fireEvent.click(within(scope).getByRole('button', { name }));
}
function fireClick(el: HTMLElement) {
  fireEvent.click(el);
}
