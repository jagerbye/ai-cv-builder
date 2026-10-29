// QA seed (tooling, not product code). Idempotent: creates or reuses one QA user and rebuilds one
// 'ready' CV for that user, so the editor and question column can be checked against stored data.
// Run from the repo root: npx vite-node scripts/seed-qa.ts
// DATABASE_URL defaults to the local compose database. Needs no ANTHROPIC_API_KEY.
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword, verifyPassword } from '../api/src/core/auth/password.ts';
import { itemsFromDraft } from '../api/src/core/cv/persist.ts';
import type { CvDraft, Fact } from '../api/src/core/generation/types.ts';

const EMAIL = 'qa.seed@example.test';
const PASSWORD = 'qa-seed-password-2026';
const CV_TITLE = 'QA seed CV';
const TARGET_ROLE = 'Senior Backend Engineer';

// Deliberately long content for the grid checklist. Lengths are asserted below.
const EMPLOYER_LONG = 'Northwind Global Logistics, Freight Forwarding and Customs Brokerage Holdings Limited (UK)';
const BULLET_LONG =
  'Led the migration of the shipment tracking API from one monolith into four services that each own their data store, routing traffic through the edge so every cut-over could be rolled back within minutes, cutting p95 latency from 820 ms to 240 ms and ending the nightly batch window during peak weeks.';

const CONTACT = {
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  phone: '+44 20 7946 0958',
  location: 'London, UK',
  links: ['https://github.com/janedoe'],
};

const PROFILE_LINE = 'Backend engineer with seven years of experience building payment and logistics APIs in TypeScript and Go.';
const SKILLS_LINE = 'TypeScript, Go, PostgreSQL, Kubernetes, AWS, Terraform';
const SUMMARY_TEXT = 'Backend engineer with seven years of building payment and logistics APIs, focused on latency and reliable event delivery.';

const ROLES = [
  {
    employer: EMPLOYER_LONG,
    role: 'Senior Software Engineer',
    period: '2022 - 2025',
    location: 'London, UK',
    relevance: 0.95,
    bullets: [
      BULLET_LONG,
      'Designed a Postgres partitioning scheme for 300 million tracking events, reducing nightly report runtime by 70%.',
      'Mentored three engineers through their first production on-call rotations.',
    ],
  },
  {
    employer: 'Brightpath Payments',
    role: 'Software Engineer',
    period: '2019 - 2022',
    location: 'Manchester, UK',
    relevance: 0.72,
    bullets: [
      'Built the webhook delivery service that processes 1.2 million events per day with at-least-once guarantees.',
      'Added idempotency keys to the payments API, eliminating duplicate charge reports from the support queue.',
    ],
  },
  {
    employer: 'Ferro Systems',
    role: 'Junior Developer',
    period: '2018 - 2019',
    location: 'Leeds, UK',
    relevance: 0.41,
    bullets: ['Maintained internal reporting tools written in Python and Django.'],
  },
];

const EDUCATION = [
  { institution: 'University of Leeds', degree: 'BSc Computer Science', period: '2014 - 2017' },
  { institution: 'Leeds College of Technology', degree: 'Diploma in Software Engineering', period: '2017 - 2018' },
];

const SKILLS = [
  { name: 'TypeScript', group: 'Languages' },
  { name: 'Go', group: 'Languages' },
  { name: 'PostgreSQL', group: 'Data' },
  { name: 'Kubernetes', group: 'Platform' },
  { name: 'AWS', group: 'Platform' },
  { name: 'Terraform', group: 'Platform' },
];

const roleLine = (r: (typeof ROLES)[number]) => `${r.role}, ${r.employer}, ${r.location.split(',')[0]}, ${r.period}`;
const educationLine = (e: (typeof EDUCATION)[number]) => `${e.degree}, ${e.institution}, ${e.period}`;

// The source text is built from the same constants the facts quote, so every sourceQuote is verbatim by construction.
const sourceText = [
  CONTACT.fullName,
  `${CONTACT.email} | ${CONTACT.phone} | ${CONTACT.location} | github.com/janedoe`,
  '',
  PROFILE_LINE,
  '',
  'Experience',
  ...ROLES.flatMap((r) => [roleLine(r), ...r.bullets.map((b) => `- ${b}`)]),
  '',
  'Education',
  ...EDUCATION.map(educationLine),
  '',
  'Skills',
  SKILLS_LINE,
].join('\n');

function exact(value: string, length: number, label: string): string {
  if (value.length !== length) throw new Error(`${label} must be ${length} characters, is ${value.length}`);
  return value;
}
exact(EMPLOYER_LONG, 90, 'EMPLOYER_LONG');
exact(BULLET_LONG, 300, 'BULLET_LONG');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/ai_cv_builder',
});

async function ensureUser(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!existing) {
    const created = await prisma.user.create({ data: { email: EMAIL, passwordHash: await hashPassword(PASSWORD) } });
    return created.id;
  }
  // Reuse the row; re-hash only when the known password no longer verifies.
  if (!(await verifyPassword(PASSWORD, existing.passwordHash))) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
  }
  return existing.id;
}

async function main(): Promise<void> {
  const userId = await ensureUser();

  // Facts: one per draft line, each sourceQuote verbatim from sourceText.
  const facts: Array<Fact & { quote: string }> = [];
  const fact = (kind: string, text: string, quote: string): string => {
    if (!sourceText.includes(quote)) throw new Error(`sourceQuote is not verbatim in the source: ${quote.slice(0, 60)}`);
    const id = randomUUID();
    facts.push({ id, kind, text, sourceQuote: quote, source: 'document', quote });
    return id;
  };
  const profileFact = fact('profile', 'Seven years building payment and logistics APIs in TypeScript and Go', PROFILE_LINE);
  const roleFacts = ROLES.map((r) => fact('role', `${r.role} at ${r.employer}, ${r.period}`, roleLine(r)));
  const bulletFacts = ROLES.map((r) => r.bullets.map((b) => fact('achievement', b, b)));
  const educationFacts = EDUCATION.map((e) => fact('education', `${e.degree}, ${e.institution}`, educationLine(e)));
  const skillFacts = SKILLS.map((s) => fact('skill', `Lists ${s.name} as a skill`, SKILLS_LINE));

  const draft: CvDraft = {
    targetRole: TARGET_ROLE,
    summary: { text: SUMMARY_TEXT, factIds: [profileFact] },
    experience: ROLES.map((r, i) => ({
      employer: r.employer,
      role: r.role,
      period: r.period,
      location: r.location,
      relevance: r.relevance,
      factIds: [roleFacts[i]],
      bullets: r.bullets.map((b, j) => ({ text: b, factIds: [bulletFacts[i][j]] })),
    })),
    education: EDUCATION.map((e, i) => ({ institution: e.institution, degree: e.degree, period: e.period, factIds: [educationFacts[i]] })),
    skills: SKILLS.map((s, i) => ({ name: s.name, group: s.group, factIds: [skillFacts[i]] })),
  };

  const cvId = await prisma.$transaction(async (tx) => {
    // Idempotent: the previous seed CV goes first; its facts, items and questions cascade.
    await tx.cv.deleteMany({ where: { userId, title: CV_TITLE } });
    const cv = await tx.cv.create({
      data: { userId, title: CV_TITLE, targetRole: TARGET_ROLE, sourceKind: 'text', sourceText, state: 'ready', version: 1 },
      select: { id: true },
    });

    await tx.fact.createMany({
      data: facts.map((f) => ({ id: f.id, cvId: cv.id, kind: f.kind, text: f.text, sourceQuote: f.sourceQuote, source: 'document' })),
    });

    // Items in the shape persist.ts writes (itemsFromDraft), plus the contact item persist never touches.
    const generated = itemsFromDraft(draft);
    const edited = generated.find((item) => item.path === 'experience[0].bullets[2]');
    if (!edited) throw new Error('experience[0].bullets[2] missing from the draft');
    edited.data = { text: 'Mentored three engineers through their first on-call rotations and wrote the runbook the team still uses.' };
    const userEditedId = edited.id;

    const rows = (items: typeof generated) =>
      items.map((item) => ({
        id: item.id,
        cvId: cv.id,
        kind: item.kind,
        parentId: item.parentId,
        path: item.path,
        orderIndex: item.orderIndex,
        data: item.data as Prisma.InputJsonValue,
        factIds: item.factIds,
        relevance: item.relevance,
        userEdited: item.id === userEditedId,
      }));
    const contact = [
      {
        id: randomUUID(),
        cvId: cv.id,
        kind: 'contact',
        parentId: null,
        path: 'contact',
        orderIndex: 0,
        data: CONTACT as Prisma.InputJsonValue,
        factIds: [],
        relevance: null,
        userEdited: false,
      },
    ];
    const tops = generated.filter((item) => item.parentId === null);
    const children = generated.filter((item) => item.parentId !== null);
    await tx.cvItem.createMany({ data: [...contact, ...rows(tops)] });
    await tx.cvItem.createMany({ data: rows(children) });

    // Three open questions on different paths: a period, a skill and a summary claim.
    await tx.question.createMany({
      data: [
        {
          cvId: cv.id,
          path: 'experience[1].period',
          text: 'Brightpath Payments has a year range but no start month. Which month did you join?',
          reason: 'missing',
          status: 'open',
          priority: 1,
        },
        {
          cvId: cv.id,
          path: 'skills[5]',
          text: 'Terraform is listed under skills, but no line describes a project that used it. Where did you use it?',
          reason: 'unverifiable',
          status: 'open',
          priority: 2,
        },
        {
          cvId: cv.id,
          path: 'summary',
          text: 'The summary says seven years of experience, and the dated roles span 2018 to 2025. Is seven the number to state?',
          reason: 'vague',
          status: 'open',
          priority: 3,
        },
      ],
    });
    return cv.id;
  });

  console.log(JSON.stringify({ email: EMAIL, password: PASSWORD, cvId, url: `http://127.0.0.1:5273/cvs/${cvId}` }, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
