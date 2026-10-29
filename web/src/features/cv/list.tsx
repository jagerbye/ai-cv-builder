// /cvs — the signed-in user's CVs (C-007, GET /api/cvs). Each row links to its
// editor. Only a successful, empty response shows the "no CVs" message; a failed
// load says so instead (QA-03).
import { useQuery } from '@tanstack/react-query';
import { ApiError, GENERIC_MESSAGE, apiFetch } from '../../api/client';
import { cvDisplayTitle } from './title';
import './list.css';

export type CvState = 'generating' | 'ready' | 'failed';

export interface CvListItem {
  id: string;
  title: string;
  targetRole: string;
  state: CvState;
  updatedAt: string;
}

interface CvListResponse {
  items: CvListItem[];
}

const STATE_LABEL: Record<CvState, string> = {
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
};

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CvList() {
  const query = useQuery({
    queryKey: ['cvs'],
    queryFn: () => apiFetch<CvListResponse>('/cvs'),
    // No automatic retry: a failed load is shown at once, and the user retries by
    // reloading. Silent retries would leave the screen pending for seconds.
    retry: false,
  });

  const items = query.data?.items ?? [];

  return (
    <section className="page cv-list" aria-labelledby="cv-list-heading">
      <div className="cv-list-head">
        <h1 id="cv-list-heading">Your CVs</h1>
        {query.isSuccess && items.length > 0 && (
          <a className="cv-list-new" href="/cvs/new">
            New CV
          </a>
        )}
      </div>

      {query.isPending && <p role="status">Loading your CVs…</p>}

      {query.isError && (
        <p role="alert" className="cv-list-error">
          {query.error instanceof ApiError ? query.error.message : GENERIC_MESSAGE}
        </p>
      )}

      {query.isSuccess && items.length === 0 && (
        <div className="cv-list-empty">
          <p>You have no CVs yet.</p>
          <a href="/cvs/new">Create your first CV</a>
        </div>
      )}

      {query.isSuccess && items.length > 0 && (
        <ul className="cv-list-items">
          {items.map((item) => (
            <li key={item.id} className="cv-list-row">
              <a className="cv-list-title" href={`/cvs/${encodeURIComponent(item.id)}`}>
                {cvDisplayTitle(item.title)}
              </a>
              <span className="cv-list-role">{item.targetRole}</span>
              <span className={`cv-list-state cv-list-state-${item.state}`}>{STATE_LABEL[item.state]}</span>
              <time className="cv-list-updated" dateTime={item.updatedAt}>
                Updated {formatUpdated(item.updatedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
