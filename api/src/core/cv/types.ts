import type { ErrorCode } from '../../http/errors.js';
// C-006 (response DTO) and C-008 (patch shape) from api-contracts.md.
// Declaration-only: types, no runtime code.

export type CvState = 'generating' | 'ready' | 'failed';

export interface CvContact {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
  // ADR-022 Amendment A: the facts that establish each generated field. Absent on intake and hand-edited contacts.
  citations?: Partial<Record<'fullName' | 'email' | 'phone' | 'location', string[]>>;
}

export interface CvSummary {
  text: string;
  factIds: string[];
  userEdited: boolean;
}

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

export interface CvFact {
  id: string;
  kind: string;
  text: string;
  sourceQuote: string;
  source: 'document' | 'user';
}

// C-006 response of GET /api/cvs/:cvId.
export interface CvResponse {
  id: string;
  title: string;
  targetRole: string;
  state: CvState;
  version: number;
  updatedAt: string;
  contact: CvContact;
  summary?: CvSummary;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  questions: CvQuestion[];
  facts: CvFact[];
  // ADR-017: present only in state failed.
  lastError?: { code: ErrorCode; message: string };
}

// C-008 patch: any field present is replaced whole; absent fields untouched.
// state, title, questions and facts are server-owned and not patchable.
export interface CvPatch {
  contact?: CvContact;
  summary?: CvSummary;
  experience?: CvExperience[];
  education?: CvEducation[];
  skills?: CvSkill[];
}

// C-008 request of PATCH /api/cvs/:cvId.
export interface CvPatchRequest {
  version: number;
  patch: CvPatch;
}
