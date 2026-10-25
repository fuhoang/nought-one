'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from './browser-api';

export type User = { id: string; name: string; email: string };
type Session = { status: 'loading' | 'guest' | 'error'; user?: never; message?: string } | { status: 'authenticated'; user: User; message?: never };

export function useSession(origin: string) {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let controller: AbortController | undefined;
    async function check() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      // Keep a guest's in-progress form intact when returning from a password manager.
      setSession(previous => previous.status === 'guest' ? previous : { status: 'loading' });
      try {
        const { user } = await apiRequest<{ user: User }>(origin, '/api/v1/me', { signal: request.signal });
        if (!request.signal.aborted) setSession({ status: 'authenticated', user });
      } catch (error) {
        if (!request.signal.aborted) setSession(error instanceof ApiError && error.status === 401
          ? { status: 'guest' } : { status: 'error', message: 'We couldn’t check your session. Please try again.' });
      }
    }
    function visibility() { if (document.visibilityState === 'visible') void check(); }
    function hide() { controller?.abort(); setSession({ status: 'loading' }); }
    void check();
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nought-session') : null;
    if (channel) channel.onmessage = () => { void check(); };
    return () => {
      controller?.abort();
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
      channel?.close();
    };
  }, [origin, attempt]);
  return { ...session, retry };
}

export function notifySessionChange() {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('nought-session');
  channel.postMessage('changed');
  channel.close();
}
