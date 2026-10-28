// Public auth branch (spec §3.1): /auth/login and /auth/signup.
import { LoginForm, SignupForm } from './AuthForms';

export default function AuthRoute() {
  return window.location.pathname.endsWith('/signup') ? <SignupForm /> : <LoginForm />;
}
