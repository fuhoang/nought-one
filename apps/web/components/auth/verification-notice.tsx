'use client';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import type { User } from '@/lib/auth';

export function VerificationNotice({ origin, user, onExpired }: { origin: string; user: User; onExpired: () => void }) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  if (user.email_verified_at) return <p className="verification-status">Email verified.</p>;
  async function resend() {
    if (submitting.current || cooldown) return;
    submitting.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await apiRequest<{ message: string }>(origin, '/email/verification-notification', { method: 'POST' });
      setMessage(result.message); setCooldown(60);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { onExpired(); return; }
      setFailed(true); setMessage(error instanceof ApiError ? error.message : 'We couldn’t send the email. Please try again.');
      if (error instanceof ApiError && error.status === 429) setCooldown(error.retryAfter);
    } finally { setBusy(false); submitting.current = false; }
  }
  return <section className="verification-notice" aria-label="Email verification">
    <div><h2>Verify your email.</h2><p>Check the inbox for {user.email}. You can keep working on your cards.</p></div>
    <button className="button button-secondary" onClick={resend} disabled={busy || cooldown > 0}>{busy ? 'Sending…' : 'Resend verification email'}</button>
    {cooldown > 0 && <p className="field-hint">You can resend in {cooldown} seconds.</p>}
    <p className="form-feedback" role={failed ? 'alert' : 'status'}>{message}</p>
  </section>;
}
