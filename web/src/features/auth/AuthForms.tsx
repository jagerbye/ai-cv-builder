// Sign-up (C-001) and log-in (C-002) forms. Field errors come from the envelope's
// details array; a 401 or 409 shows the envelope message in one alert.
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../api/client';
import { nextPath, navigate } from './navigate';
import { sessionKey, type SessionUser } from './session';
import './auth.css';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const FIELDS = ['email', 'password'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

interface Credentials {
  email: string;
  password: string;
}

interface AuthFormProps {
  endpoint: '/auth/register' | '/auth/login';
  submitLabel: string;
  passwordAutocomplete: 'new-password' | 'current-password';
  heading: string;
  footer: { href: string; text: string };
}

function AuthForm({ endpoint, submitLabel, passwordAutocomplete, heading, footer }: AuthFormProps) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<Credentials>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const showError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      setFormError(GENERIC_MESSAGE);
      return;
    }
    const next: FieldErrors = {};
    for (const detail of err.details ?? []) {
      const field = FIELDS.find((f) => f === detail.path);
      if (field && next[field] === undefined) next[field] = detail.message;
    }
    setFieldErrors(next);
    setFormError(err.message);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const body = await apiFetch<{ user: SessionUser }>(endpoint, {
        method: 'POST',
        body: credentials,
      });
      // Drop a stale in-flight /me so it cannot overwrite the fresh session.
      await queryClient.cancelQueries({ queryKey: sessionKey });
      queryClient.setQueryData(sessionKey, body.user);
      // Back to the page the visitor asked for before sign-in, else the list.
      navigate(nextPath(window.location.search), 'replace');
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  };

  const update = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setCredentials((prev) => ({ ...prev, [field]: event.target.value }));

  const describedBy = (field: Field) => (fieldErrors[field] ? `${field}-error` : undefined);

  return (
    <section className="page auth-screen">
      <h1>{heading}</h1>
      <form className="auth-form" noValidate onSubmit={(e) => void onSubmit(e)}>
        {formError && (
          <p role="alert" className="auth-alert">
            {formError}
          </p>
        )}
        <div className="auth-field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            value={credentials.email}
            onChange={update('email')}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          {fieldErrors.email && (
            <p id="email-error" className="auth-field-error">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="auth-field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={passwordAutocomplete}
            value={credentials.password}
            onChange={update('password')}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('password')}
          />
          {fieldErrors.password && (
            <p id="password-error" className="auth-field-error">
              {fieldErrors.password}
            </p>
          )}
        </div>
        <button type="submit" className="auth-submit" disabled={pending} aria-busy={pending}>
          {submitLabel}
        </button>
      </form>
      <p className="auth-footer">
        <a href={footer.href}>{footer.text}</a>
      </p>
    </section>
  );
}

export function LoginForm() {
  return (
    <AuthForm
      endpoint="/auth/login"
      submitLabel="Log in"
      passwordAutocomplete="current-password"
      heading="Log in"
      footer={{ href: '/auth/signup', text: 'Create an account' }}
    />
  );
}

export function SignupForm() {
  return (
    <AuthForm
      endpoint="/auth/register"
      submitLabel="Create account"
      passwordAutocomplete="new-password"
      heading="Create an account"
      footer={{ href: '/auth/login', text: 'Log in instead' }}
    />
  );
}
