import type { CvBullet, CvDraft, CvDto, CvEducation, CvExperience, CvSkill, Section } from './types';

let counter = 0;

// Ids for entries the user adds. The server replaces none of them, so they only
// need to be unique within this page.
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-new-${counter}`;
}

export function toDraft(cv: CvDto): CvDraft {
  return {
    contact: cv.contact,
    summary: cv.summary,
    experience: cv.experience,
    education: cv.education,
    skills: cv.skills,
  };
}

export function blankBullet(): CvBullet {
  return { id: localId('b'), text: '', factIds: [], userEdited: true };
}

export function blankExperience(): CvExperience {
  return {
    id: localId('exp'),
    employer: '',
    role: '',
    period: '',
    order: 0,
    relevance: 0,
    userEdited: true,
    bullets: [],
  };
}

export function blankEducation(): CvEducation {
  return { id: localId('edu'), institution: '', period: '', order: 0, userEdited: true };
}

export function blankSkill(): CvSkill {
  return { id: localId('sk'), name: '', factIds: [], userEdited: true };
}

export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function remove<T>(list: T[], index: number): T[] {
  return list.filter((_, k) => k !== index);
}

// What goes on the wire for a section. Blank skills are kept in the editor but
// not saved, and array order is the stored order.
export function toWire<K extends Section>(section: K, value: CvDraft[K]): CvDraft[K] {
  if (section === 'skills') {
    return (value as CvSkill[]).filter((s) => s.name.trim() !== '') as CvDraft[K];
  }
  if (section === 'experience') {
    return (value as CvExperience[]).map((e, i) => ({ ...e, order: i })) as CvDraft[K];
  }
  if (section === 'education') {
    return (value as CvEducation[]).map((e, i) => ({ ...e, order: i })) as CvDraft[K];
  }
  return value;
}
