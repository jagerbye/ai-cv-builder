import { PrismaClient } from '@prisma/client';

// Test-only vitest globalSetup for the api project (E-004, ADR-014). A suite that commits users or
// non-terminal generation_jobs rows and does not delete them poisons the shared queue for whoever runs
// next, and it looks like a flake there. This makes the leaking run fail instead.
//
// It is a DELTA against a snapshot taken before any suite: rows that existed before the run (earlier
// runs, ~580 users, terminal jobs) are not a leak, and nothing is ever deleted here. A concurrent
// second run against the same database would show up as growth; the job suites already serialise on
// the suite lock, so that is not a supported way to run the gate.
const UNFINISHED = ['queued', 'running'];

let before: { users: Set<string>; openJobs: Set<string> } | undefined;

function client(): PrismaClient {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';
  return new PrismaClient();
}

// hardening-session-<uuid>@example.test -> hardening-session-*@example.test, so the message names the suite.
function label(email: string): string {
  return email.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '*');
}

export async function setup(): Promise<void> {
  const prisma = client();
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    const jobs = await prisma.generationJob.findMany({ where: { status: { in: UNFINISHED } }, select: { id: true } });
    before = { users: new Set(users.map((u) => u.id)), openJobs: new Set(jobs.map((j) => j.id)) };
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown(): Promise<void> {
  if (!before) throw new Error('leak check: no snapshot was taken before the run');
  const prisma = client();
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    const newUsers = users.filter((u) => !before!.users.has(u.id));
    const openNow = await prisma.generationJob.findMany({
      where: { status: { in: UNFINISHED } },
      select: { id: true, user: { select: { email: true } } },
    });
    const newJobs = openNow.filter((j) => !before!.openJobs.has(j.id));
    if (newUsers.length === 0 && newJobs.length === 0) return;

    const tally = (emails: string[]) => {
      const counts = new Map<string, number>();
      for (const e of emails) counts.set(label(e), (counts.get(label(e)) ?? 0) + 1);
      return [...counts].map(([e, n]) => `${n} x ${e}`).join(', ');
    };
    const lines = ['Test run leaked rows into the shared database (E-004). Suites must delete what they create.'];
    if (newJobs.length > 0) {
      lines.push(`  ${newJobs.length} non-terminal generation_jobs row(s) (queued/running) left behind, owners: ${tally(newJobs.map((j) => j.user.email))}`);
    }
    if (newUsers.length > 0) {
      lines.push(`  ${newUsers.length} user(s) left behind (was ${before.users.size}, now ${users.length}): ${tally(newUsers.map((u) => u.email))}`);
    }
    throw new Error(lines.join('\n'));
  } finally {
    await prisma.$disconnect();
  }
}
