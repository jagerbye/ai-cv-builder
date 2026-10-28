// T-14 (CVB-14) — progress view for one generation job (spec §3.3, C-005, C-010, ADR-003).
// The server is the only source of progress: every mount fetches GET /api/jobs/:id,
// the query polls every 2 s while the job is queued or running, and polling stops
// on a terminal status. Nothing is written to browser storage.
import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../api/client';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
type JobStage = 'extracting' | 'composing' | 'verifying';

interface JobView {
  id: string;
  cvId: string;
  status: JobStatus;
  stage: JobStage | null;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error?: { code: string; message: string };
}

const POLL_MS = 2000;

// Named stages only, never a percentage (spec §3.3: the UI shows the stage).
const STAGE_COPY: Record<JobStage, string> = {
  extracting: 'Extracting facts from your text',
  composing: 'Composing the draft from those facts',
  verifying: 'Verifying every line against its source',
};

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

// RouteEntry components take no props, so the job id comes from the address.
function jobIdFromPath(pathname: string): string | null {
  const match = /^\/jobs\/([^/]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}

function isActive(status: JobStatus | undefined): boolean {
  return status === 'queued' || status === 'running';
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_MESSAGE;
}

export default function GenerationRoute() {
  const jobId = jobIdFromPath(window.location.pathname);

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiFetch<JobView>(`/jobs/${encodeURIComponent(jobId ?? '')}`),
    enabled: jobId !== null,
    // Keep polling only while the server says the job is still moving. An
    // error on the first fetch leaves no data, so polling stops there.
    refetchInterval: (query) => (isActive(query.state.data?.status) ? POLL_MS : false),
  });

  const data = job.data;

  // A succeeded job moves to the CV view. A full load, like every other link in
  // the app, so the back button does not bounce the user into this screen again.
  useEffect(() => {
    if (data?.status === 'succeeded') {
      window.location.replace(`/cvs/${encodeURIComponent(data.cvId)}`);
    }
  }, [data?.status, data?.cvId]);

  const regenerate = useMutation({
    mutationFn: (cvId: string) =>
      apiFetch<{ jobId: string }>(`/cvs/${encodeURIComponent(cvId)}/regenerate`, { method: 'POST' }),
    onSuccess: (result) => {
      // C-010 answers 202 { jobId }; the new job gets its own progress view.
      window.location.assign(`/jobs/${encodeURIComponent(result.jobId)}`);
    },
  });

  if (jobId === null) {
    return (
      <section className="screen-message">
        <h1>Progress unavailable</h1>
        <p role="alert">This address does not point to a generation job.</p>
      </section>
    );
  }

  if (job.isError) {
    return (
      <section className="screen-message">
        <h1>Progress unavailable</h1>
        <p role="alert">{errorMessage(job.error)}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="screen-message">
        <p role="status">Loading your generation…</p>
      </section>
    );
  }

  if (data.status === 'failed') {
    return (
      <section className="screen-message">
        <h1>Generation failed</h1>
        <p role="alert">{data.error ? data.error.message : FALLBACK_MESSAGE}</p>
        <p>Your source text is kept, so you can try again.</p>
        <button
          type="button"
          onClick={() => regenerate.mutate(data.cvId)}
          disabled={regenerate.isPending}
        >
          Regenerate
        </button>
        {regenerate.isError ? <p role="alert">{errorMessage(regenerate.error)}</p> : null}
      </section>
    );
  }

  if (data.status === 'succeeded') {
    return (
      <section className="screen-message">
        <p role="status">Done. Opening your CV…</p>
      </section>
    );
  }

  const attemptNote = data.attempt > 1 ? <p>Attempt {data.attempt}</p> : null;

  if (data.status === 'queued') {
    return (
      <section className="screen-message">
        <p role="status">Queued. It will start shortly.</p>
        {attemptNote}
      </section>
    );
  }

  return (
    <section className="screen-message">
      <p role="status" aria-live="polite">
        {data.stage ? STAGE_COPY[data.stage] : 'Starting…'}
      </p>
      {attemptNote}
    </section>
  );
}
