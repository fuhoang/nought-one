'use client';
/* Full document navigation preserves native unsaved-change warnings. */
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import type { User } from '@/lib/auth';
import { CardEditor } from './card-editor';

export function EditorSession({ origin, site, id }: { origin: string; site: string; id?: string }) {
  const [owner, setOwner] = useState<User | null>(null);
  const [locked, setLocked] = useState(true);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('Checking your session…');
  const [attempt, setAttempt] = useState(0);
  const lock = useCallback(() => { setLocked(true); setChecking(false); setMessage('Your session has ended. Sign in again to continue.'); }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    async function check() {
      controller?.abort();
      setChecking(true);
      const current = new AbortController(); controller = current;
      try {
        const { user } = await apiRequest<{ user: User }>(origin, '/api/v1/me', { signal: current.signal });
        if (current.signal.aborted) return;
        setOwner(user); setLocked(false); setMessage('');
      } catch (error) {
        if (current.signal.aborted) return;
        setLocked(true);
        setMessage(error instanceof ApiError && error.status === 401 ? 'Sign in to edit your card.' : 'We couldn’t check your session. Please try again.');
      } finally {
        if (!current.signal.aborted) setChecking(false);
      }
    }
    function visible() { if (document.visibilityState === 'visible') void check(); }
    function hide() { controller?.abort(); setLocked(true); setChecking(true); }
    void check();
    window.addEventListener('focus', check); window.addEventListener('pageshow', check);
    window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', visible);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nought-session') : null;
    if (channel) channel.onmessage = () => { setLocked(true); void check(); };
    return () => {
      controller?.abort(); channel?.close(); window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check); window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [origin, attempt]);
  return <>
    {locked && checking && <main className="card-state" aria-busy="true"><span className="state-brand">nought.one</span><p role="status">Loading editor…</p></main>}
    {locked && !checking && <main className="card-state"><span className="state-brand">nought.one</span><h1>Resume editing.</h1><p role="status">{message}</p>
      {owner && <p>Your unsaved input stays in this tab. Sign in with the same account to resume.<br />A different account starts a separate editing session.</p>}
      <a className="button button-primary" href="/login" target="_blank" rel="noopener noreferrer">Sign in (new tab)</a>
      <button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Check session again</button><a href="/dashboard">Back to dashboard</a></main>}
    {owner && <div hidden={locked}><CardEditor key={`${owner.id}:${id ?? 'new'}`} origin={origin} site={site} id={id} locked={locked} onUnauthorized={lock} /></div>}
  </>;
}
