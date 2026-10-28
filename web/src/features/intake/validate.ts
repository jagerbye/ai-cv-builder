// Client-side guards for the intake form. They mirror the server limits in
// spec §3.2 and C-003 / C-004 so the user learns the fix before a request is
// sent. The server stays the authority: its messages are shown when it refuses.

export const INTAKE_LIMITS = {
  pdfMaxBytes: 10 * 1024 * 1024,
  textMin: 200,
  textMax: 50000,
  roleMax: 120,
} as const;

// Each function returns the message to show, or null when the value is fine.

export function roleProblem(role: string): string | null {
  if (role.length === 0) {
    return 'Enter a target role, for example "Staff engineer". It is required.';
  }
  if (role.length > INTAKE_LIMITS.roleMax) {
    return `The target role is ${role.length} characters. Shorten it to ${INTAKE_LIMITS.roleMax} characters or fewer.`;
  }
  return null;
}

export function textProblem(text: string): string | null {
  const n = text.length;
  if (n === 0) {
    return `Paste your CV text to continue. It needs at least ${INTAKE_LIMITS.textMin} characters.`;
  }
  if (n < INTAKE_LIMITS.textMin) {
    const missing = INTAKE_LIMITS.textMin - n;
    return `Your text is ${n} characters. Add at least ${missing} more (the minimum is ${INTAKE_LIMITS.textMin}): the roles you held, what you built, and the results you got.`;
  }
  if (n > INTAKE_LIMITS.textMax) {
    const excess = n - INTAKE_LIMITS.textMax;
    return `Your text is ${n} characters, over the 50,000 limit. Remove at least ${excess} characters, for example older roles or repeated detail.`;
  }
  return null;
}

export function pdfProblem(file: File | null): string | null {
  if (file === null) {
    return 'Choose a PDF file first.';
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return 'That file is not a PDF. Choose a PDF, or paste the text instead.';
  }
  if (file.size > INTAKE_LIMITS.pdfMaxBytes) {
    return 'That PDF is larger than the 10 MB limit. Compress it, or paste the text instead.';
  }
  return null;
}
