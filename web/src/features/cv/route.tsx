import { useQuery } from '@tanstack/react-query';
import { ApiError, GENERIC_MESSAGE, apiFetch } from '../../api/client';
import { CvEditor } from './editor';
import type { CvDto } from './types';
import './cv.css';

// /cvs/:id opens the editor. Any other /cvs/* path has no CV to show yet.
export default function CvRoute() {
  const id = cvIdFromPath(window.location.pathname);
  if (id === null) {
    return (
      <section className="screen-message">
        <h1>Your CVs</h1>
        <p>You have no CVs yet.</p>
        <a href="/cvs/new">Create your first CV</a>
      </section>
    );
  }
  return <CvPage id={id} />;
}

function cvIdFromPath(pathname: string): string | null {
  const match = /^\/cvs\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function CvPage({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['cv', id],
    queryFn: () => apiFetch<CvDto>(`/cvs/${encodeURIComponent(id)}`),
    // A 4xx is an answer, not a blip: only transport failures are retried.
    retry: (failureCount, error) => failureCount < 2 && !(error instanceof ApiError),
  });
  // Every state of /cvs/:id carries a heading: a slow or failed request still
  // leaves the user something to orient on, and the route registry proves it.
  if (query.isPending) {
    return (
      <section className="screen-message">
        <h1>Your CV</h1>
        <p role="status">Loading the CV…</p>
      </section>
    );
  }
  if (query.isError) {
    const message = query.error instanceof ApiError ? query.error.message : GENERIC_MESSAGE;
    return (
      <section className="screen-message">
        <h1>CV unavailable</h1>
        <p role="alert">{message}</p>
      </section>
    );
  }
  // A new read remounts the editor, so a reload shows the stored version only.
  return <CvEditor key={query.dataUpdatedAt} cv={query.data} onReload={() => void query.refetch()} />;
}
