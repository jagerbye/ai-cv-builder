import { useEffect } from 'react';
import { useSessionUser } from '../features/auth/session';
import { navigate } from '../features/auth/navigate';

// The front door at "/" (QA-02). It owns no screen: a signed-in visitor goes to
// the CV list, anyone else to sign-in. Replacing the entry keeps "/" out of
// history, so Back does not return to a redirect.
export default function FrontDoor() {
  const session = useSessionUser();
  const settled = !session.isPending;
  const signedIn = session.data != null;

  useEffect(() => {
    if (settled) navigate(signedIn ? '/cvs' : '/auth/login', 'replace');
  }, [settled, signedIn]);

  return null;
}
