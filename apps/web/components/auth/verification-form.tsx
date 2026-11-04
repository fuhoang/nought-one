'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import { notifySessionChange, useSession } from '@/lib/auth';
import { VerificationNotice } from './verification-notice';

export function VerificationForm({ origin, id, hash, expires, signature }: { origin: string; id: string; hash: string; expires: string; signature: string }) {
  const session = useSession(origin);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const complete = /^[0-9a-f-]{36}$/i.test(id) && /^[0-9a-f]{40}$/i.test(hash) && /^\d+$/.test(expires) && /^[0-9a-f]{64}$/i.test(signature);
  async function verify() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      const query = new URLSearchParams({ expires, signature });
      await apiRequest(origin, `/email/verify/${encodeURIComponent(id)}/${encodeURIComponent(hash)}?${query}`);
      setSuccess(true); setMessage('Your email is verified.'); notifySessionChange();
      window.history.replaceState(null, '', '/verify-email');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) session.retry();
      setMessage(error instanceof ApiError && error.status === 403 ? 'This link has expired, was changed, or belongs to a different account. Sign in to the matching account or request a new email.' : error instanceof ApiError ? error.message : 'Verification failed. Please try again.');
    } finally { setBusy(false); submitting.current = false; requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <main className="account-shell"><Link className="account-brand" href="/">nought.one</Link>
    <section className="auth-sheet" aria-labelledby="verification-title"><p className="eyebrow">YOUR ACCOUNT</p><h1 id="verification-title">Confirm it’s you.</h1>
      <p ref={feedback} tabIndex={-1} role={success ? 'status' : 'alert'} className="form-feedback">{message}</p>
      {success ? <Link className="button button-primary" href="/dashboard">Go to your cards</Link>
        : session.status === 'loading' ? <p role="status">Checking your session…</p>
        : session.status === 'guest' ? <><p>Sign in to the account this email was sent to, then return here to verify.</p><a className="button button-primary" href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</a><button className="button button-secondary" onClick={session.retry}>Check sign-in status</button></>
        : session.status === 'error' ? <><p role="alert">{session.message}</p><button className="button button-secondary" onClick={session.retry}>Try again</button></>
        : session.status === 'authenticated' ? <><p className="account-intro">Signed in as {session.user.email}.</p>
          {complete ? <button className="button button-primary" onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}</button> : <p>This verification link is missing or incomplete. Request a new email below.</p>}
          <VerificationNotice origin={origin} user={session.user} onExpired={session.retry} />
          <p className="auth-switch"><Link href="/dashboard">Back to your cards</Link></p></> : null}
    </section><footer className="account-footer">A simple way to stay connected.</footer>
  </main>;
}
