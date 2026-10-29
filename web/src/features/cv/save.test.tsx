// T-22 (CVB-15) — CV editor: saving. PATCH version rule (C-008), 409 handling,
// failed saves, and survival across a reload (F-006). Mocks only fetch.
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within, cleanup } from '@testing-library/react';
import { cvA, cvB, installApi, mountEditor, commit, registerEditorHooks } from './testkit';

registerEditorHooks();

const CONFLICT_COPY = 'This CV was changed on another device.';
const GENERIC_COPY = 'Something went wrong. Please try again.';

describe('CV editor — PATCH carries the version from the last read (C-008)', () => {
  it('sends the version of the CV it read, not a constant', async () => {
    const api = installApi([cvA(), cvB()]);
    mountEditor('/cvs/cv-2');
    const email = await screen.findByRole('textbox', { name: 'Email' });
    commit(email, 'grace@navy.example');
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    const [patch] = api.patches();
    expect(patch.url).toBe('/api/cvs/cv-2');
    expect(patch.body.version).toBe(12);
    expect(patch.body.patch.contact.email).toBe('grace@navy.example');
  });

  it('uses the version the server returned for the next save after a successful one', async () => {
    const api = installApi([cvA(), cvB()]);
    mountEditor('/cvs/cv-2');
    commit(await screen.findByRole('textbox', { name: 'Email' }), 'grace@navy.example');
    await screen.findByText('Saved');
    commit(screen.getByRole('textbox', { name: 'Summary' }), 'Compiler pioneer and admiral.');
    await waitFor(() => expect(api.patches()).toHaveLength(2));
    expect(api.patches().map((p) => p.body.version)).toEqual([12, 13]);
    expect(api.current('cv-2').version).toBe(14);
  });

  it('sends PATCH /api/cvs/:id with a JSON body of exactly {version, patch}', async () => {
    const api = installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    commit(await screen.findByRole('textbox', { name: 'Phone' }), '+44 20 7946 0555');
    await waitFor(() => expect(api.patches()).toHaveLength(1));
    const [patch] = api.patches();
    expect(patch.method).toBe('PATCH');
    expect(patch.url).toBe('/api/cvs/cv-1');
    expect(Object.keys(patch.body).sort()).toEqual(['patch', 'version']);
  });

  it('shows Saving… while the PATCH is in flight and Saved once it succeeds', async () => {
    const api = installApi([cvA()]);
    const release = api.planPatch({ kind: 'apply' }, true);
    mountEditor('/cvs/cv-1');
    const contact = await screen.findByRole('region', { name: 'Contact' });
    commit(within(contact).getByRole('textbox', { name: 'Location' }), 'Bristol');
    expect(await screen.findByText('Saving…')).toBeTruthy();
    release();
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(api.current('cv-1').contact.location).toBe('Bristol');
  });
});

describe('CV editor — 409 VERSION_CONFLICT (C-008, design: conflict_409)', () => {
  it('shows the conflict message with Reload latest, keeps the typed text, and does not retry on its own', async () => {
    const api = installApi([cvA()]);
    // Another device saved version 9 after this page read version 7.
    const other = cvA();
    other.version = 9;
    other.contact.email = 'other@device.example';
    mountEditor('/cvs/cv-1');
    const email = await screen.findByRole('textbox', { name: 'Email' });
    api.setServer('cv-1', other);
    commit(email, 'my-typed@example.com');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(CONFLICT_COPY);
    expect(within(alert).getByRole('button', { name: 'Reload latest' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement).value).toBe('my-typed@example.com');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(api.patches()).toHaveLength(1);
    expect(api.gets()).toHaveLength(1);
    expect(api.current('cv-1').contact.email).toBe('other@device.example');
    expect(screen.queryByText(GENERIC_COPY)).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('Reload latest fetches the CV again and shows the other device\'s value in place of the typed one', async () => {
    const api = installApi([cvA()]);
    const other = cvA();
    other.version = 9;
    other.contact.email = 'other@device.example';
    mountEditor('/cvs/cv-1');
    const email = await screen.findByRole('textbox', { name: 'Email' });
    api.setServer('cv-1', other);
    commit(email, 'my-typed@example.com');
    const reload = await screen.findByRole('button', { name: 'Reload latest' });
    reload.click();
    await waitFor(() => expect(api.gets()).toHaveLength(2));
    expect(await screen.findByDisplayValue('other@device.example')).toBeTruthy();
    expect(screen.queryByDisplayValue('my-typed@example.com')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a 409 on a structural change (delete) shows the same conflict message (error case)', async () => {
    const api = installApi([cvA()]);
    const other = cvA();
    other.version = 9;
    mountEditor('/cvs/cv-1');
    const experience = await screen.findByRole('region', { name: 'Experience' });
    api.setServer('cv-1', other);
    within(within(experience).getAllByRole('article')[1]).getByRole('button', { name: 'Delete' }).click();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(CONFLICT_COPY);
    expect(api.current('cv-1').experience).toHaveLength(2);
  });
});

describe('CV editor — failed saves keep the text (design: save_error)', () => {
  it('a 500 with a non-envelope body shows the generic message, keeps the text, and Retry resends the same version', async () => {
    const api = installApi([cvA()]);
    api.planPatch({ kind: 'respond', status: 500, body: '<html>db password=hunter2</html>' });
    mountEditor('/cvs/cv-1');
    const summary = await screen.findByRole('region', { name: 'Summary' });
    commit(within(summary).getByRole('textbox', { name: 'Summary' }), 'Keep me, please.');
    expect(await screen.findByText(GENERIC_COPY)).toBeTruthy();
    expect(screen.queryByText(/hunter2/)).toBeNull();
    expect((within(summary).getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe(
      'Keep me, please.',
    );
    within(summary).getByRole('button', { name: 'Retry' }).click();
    await waitFor(() => expect(api.current('cv-1').summary?.text).toBe('Keep me, please.'));
    expect(api.patches().map((p) => p.body.version)).toEqual([7, 7]);
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a network failure keeps the text and shows Retry; after a reload the unsaved text is gone (negative case)', async () => {
    const api = installApi([cvA()]);
    api.planPatch({ kind: 'network' });
    mountEditor('/cvs/cv-1');
    const summary = await screen.findByRole('region', { name: 'Summary' });
    commit(within(summary).getByRole('textbox', { name: 'Summary' }), 'Unsaved draft line.');
    await within(summary).findByRole('button', { name: 'Retry' });
    expect((within(summary).getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe(
      'Unsaved draft line.',
    );
    cleanup();
    mountEditor('/cvs/cv-1');
    const reloaded = await screen.findByRole('region', { name: 'Summary' });
    expect((within(reloaded).getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe(
      'Backend engineer with nine years of payments work.',
    );
    expect(screen.queryByDisplayValue('Unsaved draft line.')).toBeNull();
    expect(api.current('cv-1').summary?.text).toBe('Backend engineer with nine years of payments work.');
  });
});

describe('CV editor — saves survive a reload, without navigation (F-006)', () => {
  it('a saved edit is shown again after a fresh mount, from the server, with nothing in browser storage', async () => {
    installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    commit(await screen.findByRole('textbox', { name: 'Email' }), 'ana@kept.example');
    await screen.findByText('Saved');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    cleanup();
    mountEditor('/cvs/cv-1');
    expect(await screen.findByDisplayValue('ana@kept.example')).toBeTruthy();
    expect(screen.queryByDisplayValue('ana@example.com')).toBeNull();
  });

  it('a save does not navigate: the same section node stays mounted and the path is unchanged', async () => {
    installApi([cvA()]);
    mountEditor('/cvs/cv-1');
    const contact = await screen.findByRole('region', { name: 'Contact' });
    commit(within(contact).getByRole('textbox', { name: 'Location' }), 'Leeds');
    await screen.findByText('Saved');
    expect(screen.getByRole('region', { name: 'Contact' })).toBe(contact);
    expect(window.location.pathname).toBe('/cvs/cv-1');
    expect((within(contact).getByRole('textbox', { name: 'Location' }) as HTMLInputElement).value).toBe('Leeds');
  });
});
