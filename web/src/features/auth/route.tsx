// Public auth branch (spec §3.1): /auth/login and /auth/signup. A signed-in
// visitor is sent on to the destination they asked for, or to the CV list (QA-09).
import { useEffect } from 'react';
import { LoginForm, SignupForm } from './AuthForms';
import { useSessionUser } from './session';
import { navigate, nextPath } from './navigate';

export default function AuthRoute() {
  const session = useSessionUser();
  const signedIn = session.data != null;

  useEffect(() => {
    if (signedIn) navigate(nextPath(window.location.search), 'replace');
  }, [signedIn]);

  // The form is shown while /me is in flight; a signed-in visitor is moved on as
  // soon as /me answers, and the form is not shown once a session exists.
  if (signedIn) return null;
  return window.location.pathname.endsWith('/signup') ? <SignupForm /> : <LoginForm />;
}
