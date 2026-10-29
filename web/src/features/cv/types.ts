// C-006 read shape, as the editor uses it. Kept beside the editor so the feature
// does not depend on test support.
export interface CvBullet {
  id: string;
  text: string;
  factIds: string[];
  userEdited: boolean;
}
export interface CvExperience {
  id: string;
  employer: string;
  role: string;
  period: string;
  location?: string;
  order: number;
  relevance: number;
  userEdited: boolean;
  bullets: CvBullet[];
}
export interface CvEducation {
  id: string;
  institution: string;
  degree?: string;
  period: string;
  order: number;
  userEdited: boolean;
}
export interface CvSkill {
  id: string;
  name: string;
  group?: string;
  factIds: string[];
  userEdited: boolean;
}
export interface CvQuestion {
  id: string;
  path: string;
  text: string;
  status: 'open' | 'answered' | 'dismissed';
}
export interface CvContact {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
}
export interface CvSummary {
  text: string;
  factIds: string[];
  userEdited: boolean;
}
export interface CvFact {
  id: string;
  kind: string;
  text: string;
  // Verbatim span of the source document; empty for a fact the user gave.
  sourceQuote: string;
  source: 'document' | 'user';
}
export interface CvDto {
  id: string;
  title: string;
  targetRole: string;
  state: 'generating' | 'ready' | 'failed';
  version: number;
  updatedAt: string;
  contact: CvContact;
  summary?: CvSummary;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  questions: CvQuestion[];
  facts: CvFact[];
  // C-006, ADR-017: present only when state is 'failed'.
  lastError?: { code: string; message: string };
}

export type Section = 'contact' | 'summary' | 'experience' | 'education' | 'skills';
export interface CvDraft {
  contact: CvContact;
  summary: CvSummary | undefined;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
}
export type CvPatch = Partial<CvDraft>;
