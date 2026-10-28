// Session state for the protected branch (C-002). The signed-in user is cached
// under one query key; logout clears that key, so no stale user survives it.
import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../api/client';
import { navigate } from './navigate';

export interface SessionUser {
  id: string;
  email: string;
}

export const sessionKey = ['auth', 'me'] as const;

interface MeResponse {
  user: SessionUser;
}

// Any failure reads as signed out: the protected branch then sends the visitor
// to log in rather than rendering with an unknown session.
async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    const body = await apiFetch<MeResponse>('/auth/me');
    return body.user;
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

export function useSessionUser() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: fetchSessionUser,
    retry: false,
    staleTime: Infinity,
  });
}

// Renders children only for a signed-in user. Nothing is painted while /me is
// pending, and an anonymous visitor is replaced to /auth/login before any
// protected content could show.
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSessionUser();
  const signedOut = session.isError || (session.isSuccess && session.data === null);

  useEffect(() => {
    if (signedOut) navigate('/auth/login', 'replace');
  }, [signedOut]);

  if (session.isSuccess && session.data) return <>{children}</>;
  return null;
}

export function LogoutButton() {
  const queryClient = useQueryClient();
  const onLogout = async () => {
    await apiFetch<void>('/auth/logout', { method: 'POST' });
    queryClient.setQueryData(sessionKey, null);
    navigate('/auth/login');
  };
  return (
    <button type="button" className="auth-logout" onClick={() => void onLogout()}>
      Log out
    </button>
  );
}
