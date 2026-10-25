'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import { notifySessionChange, useSession } from '@/lib/auth';

export function AuthForm({ origin, mode }: { origin: string; mode: 'login' | 'register' }) {
  const router = useRouter();
  const session = useSession(origin);
  const register = mode === 'register';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  useEffect(() => { if (session.status === 'authenticated') router.replace('/dashboard'); }, [session.status, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setMessage(''); setFields({});
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      await apiRequest(origin, register ? '/register' : '/login', { method: 'POST', data: values });
      form.reset();
      notifySessionChange();
      router.replace('/dashboard');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
      setFields(error instanceof ApiError ? error.fields : {});
      requestAnimationFrame(() => errorSummary.current?.focus());
    } finally { setBusy(false); submitting.current = false; }
  }
  function input(name: string, label: string, type: string, autocomplete: string, hint?: string, maxLength?: number) {
    const error = fields[name]?.join(' ');
    return <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} autoComplete={autocomplete} required maxLength={maxLength}
        aria-invalid={!!error} aria-describedby={[hint ? `${name}-hint` : '', error ? `${name}-error` : ''].filter(Boolean).join(' ') || undefined} />
      {hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${name}-error`} className="field-error">{error}</p>}
    </div>;
  }
  return <main className="account-shell">
    <Link className="account-brand" href="/" aria-label="nought.one home">nought.one</Link>
    <section className="auth-sheet" aria-labelledby="auth-title">
      <p className="eyebrow">YOUR NEXT CONNECTION</p>
      <h1 id="auth-title">{register ? 'Start with you.' : 'Welcome back.'}</h1>
      <p className="account-intro">{register ? 'One place for the details that connect you.' : 'Sign in to your nought.one account.'}</p>
      {session.status === 'error' ? <div role="alert"><p>{session.message}</p><button className="button button-secondary" onClick={session.retry}>Try again</button></div>
        : session.status !== 'guest' ? <p role="status">Checking your session…</p>
        : <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            {register && input('name', 'Name', 'text', 'name', undefined, 150)}
            {input('email', 'Email', 'email', 'username', undefined, 255)}
            {input('password', 'Password', 'password', register ? 'new-password' : 'current-password', register ? 'Use at least 12 characters, including uppercase and lowercase letters and a number.' : undefined)}
            {register && input('password_confirmation', 'Confirm password', 'password', 'new-password')}
            <p ref={errorSummary} className="form-feedback" role="alert" tabIndex={-1}>{message}</p>
            <button className="button button-primary" type="submit">{busy ? (register ? 'Creating account…' : 'Signing in…') : (register ? 'Create account' : 'Sign in')}</button>
          </fieldset>
          <p className="auth-switch">{register ? 'Already have an account?' : 'New to nought.one?'} <Link href={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
        </form>}
    </section>
    <footer className="account-footer">A simple way to stay connected.</footer>
  </main>;
}
