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
  if (query.isPending) return <p className="cv-message">Loading the CV…</p>;
  if (query.isError) {
    const message = query.error instanceof ApiError ? query.error.message : GENERIC_MESSAGE;
    return <p className="cv-message">{message}</p>;
  }
  // A new read remounts the editor, so a reload shows the stored version only.
  return <CvEditor key={query.dataUpdatedAt} cv={query.data} onReload={() => void query.refetch()} />;
}
