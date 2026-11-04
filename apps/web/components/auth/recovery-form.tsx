'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import { notifySessionChange } from '@/lib/auth';

export function RecoveryForm({ origin, mode, token, email }: { origin: string; mode: 'forgot' | 'reset'; token: string; email: string }) {
  const reset = mode === 'reset';
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [cooldown, setCooldown] = useState(0);
  const submitting = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    submitting.current = true; setBusy(true); setMessage(''); setFields({});
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
      const result = await apiRequest<{ message: string }>(origin, reset ? '/reset-password' : '/forgot-password', { method: 'POST', data: { ...data, ...(reset ? { token } : {}) } });
      setMessage(result.message); setSuccess(true);
      if (reset) { form.reset(); notifySessionChange(); window.history.replaceState(null, '', '/reset-password'); }
      else setCooldown(60);
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
      setFields(error instanceof ApiError ? error.fields : {});
      if (error instanceof ApiError && error.status === 429) setCooldown(error.retryAfter);
    } finally { setBusy(false); submitting.current = false; requestAnimationFrame(() => feedback.current?.focus()); }
  }
  function input(name: string, label: string, type: string, hint?: string) {
    const error = fields[name]?.join(' ');
    const id = `recovery-${mode}-${name}`;
    return <div className="form-field"><label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} defaultValue={name === 'email' ? email : undefined} autoComplete={name === 'email' ? 'email' : 'new-password'} required maxLength={name === 'email' ? 255 : undefined} aria-invalid={!!error} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} />
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}{error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>;
  }
  return <main className="account-shell"><Link className="account-brand" href="/">nought.one</Link>
    <section className="auth-sheet" aria-labelledby={`recovery-${mode}-title`}><p className="eyebrow">YOUR ACCOUNT</p><h1 id={`recovery-${mode}-title`}>{reset ? 'A fresh start.' : 'Let’s get you back.'}</h1>
      <p className="account-intro">{reset ? 'Choose a new password for your account.' : 'Enter your email and we’ll send you a password reset link.'}</p>
      <p ref={feedback} tabIndex={-1} className="form-feedback" role={success ? 'status' : 'alert'}>{message}</p>
      {reset && success ? <Link className="button button-primary" href="/login">Sign in</Link>
        : reset && !token ? <><p>This reset link is missing or incomplete.</p><Link href="/forgot-password">Request a new reset link</Link></>
        : <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
          {input('email', 'Email', 'email')}
          {reset && input('password', 'New password', 'password', 'Use at least 12 characters, including uppercase and lowercase letters and a number.')}
          {reset && input('password_confirmation', 'Confirm password', 'password')}
          {fields.token && <p role="alert" className="field-error">{fields.token.join(' ')} <Link href="/forgot-password">Request a new reset link</Link></p>}
          <button className="button button-primary" type="submit" disabled={cooldown > 0}>{busy ? 'Please wait…' : reset ? 'Reset password' : 'Send reset link'}</button>
          {cooldown > 0 && <p className="field-hint">Try again in {cooldown} seconds.</p>}
        </fieldset></form>}
      <p className="auth-switch"><Link href="/login">Back to sign in</Link></p>
    </section><footer className="account-footer">A simple way to stay connected.</footer>
  </main>;
}
