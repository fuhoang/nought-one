'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { notifySessionChange, useSession, type User } from '@/lib/auth';
import { apiRequest, ApiError } from '@/lib/browser-api';
import { getCards, type CardPage } from '@/lib/cards';

export function Dashboard({ origin }: { origin: string }) {
  const session = useSession(origin);
  const router = useRouter();
  useEffect(() => { if (session.status === 'guest') router.replace('/login'); }, [session.status, router]);
  if (session.status !== 'authenticated') return <main className="card-state"><span className="state-brand">nought.one</span>
    {session.status === 'error' ? <><p role="alert">{session.message}</p><button className="button button-secondary" onClick={session.retry}>Try again</button></> : <p role="status">Checking your session…</p>}
  </main>;
  // Unmounting on session changes discards all private card state and cancels requests.
  return <CardDashboard key={session.user.id} origin={origin} user={session.user} recheck={session.retry} />;
}

function CardDashboard({ origin, user, recheck }: { origin: string; user: User; recheck: () => void }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CardPage | null>(null);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getCards(origin, page, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { recheck(); return; }
      setError('We couldn’t load your cards. Please try again.');
    });
    return () => controller.abort();
  }, [origin, page, attempt, recheck]);
  function load(nextPage = page) { setResult(null); setError(''); setPage(nextPage); setAttempt(value => value + 1); }
  async function logout() {
    if (signingOut) return;
    setSigningOut(true); setLogoutError(''); setResult(null);
    try { await apiRequest(origin, '/logout', { method: 'POST' }); }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setLogoutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
        setSigningOut(false); load(); return;
      }
    }
    notifySessionChange();
    router.replace('/login');
    recheck();
  }
  return <div className="account-shell dashboard-shell">
    <a className="skip-link" href="#dashboard-main">Skip to your cards</a>
    <header className="dashboard-header"><Link className="account-brand" href="/">nought.one</Link><div className="account-menu"><span>{user.name}</span><button className="button button-secondary" disabled={signingOut} onClick={logout}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></header>
    <main id="dashboard-main" className="dashboard-main">
      <div className="dashboard-heading"><div><p className="eyebrow">YOUR NOUGHT.ONE</p><h1>Your cards.</h1><p>Your introductions, all in one place.</p></div><span className="dashboard-count">{result ? `${result.meta.total} ${result.meta.total === 1 ? 'card' : 'cards'}` : ''}</span></div>
      <p role="alert" className="form-feedback">{logoutError}</p>
      {signingOut ? <p role="status">Signing out securely…</p>
        : error ? <div className="dashboard-empty" role="alert"><h2>Let’s try that again.</h2><p>{error}</p><button className="button button-secondary" onClick={() => load()}>Try again</button></div>
        : !result ? <p role="status">Loading your cards…</p>
        : result.data.length === 0 ? <section className="dashboard-empty"><span className="empty-mark" aria-hidden="true">01</span><h2>A fresh start.</h2><p>You don’t have any cards yet.</p></section>
        : <><ul className="dashboard-grid" aria-label="Your cards">{result.data.map(card => <li key={card.id} className="dashboard-card">
          <div className="dashboard-card-top"><span className="card-initials" aria-hidden="true">{card.display_name.trim().slice(0, 1).toUpperCase()}</span><span className="publication-status">{card.is_published ? 'Published' : 'Unpublished'}</span></div>
          <h2>{card.display_name}</h2><p className="dashboard-role">{[card.job_title, card.company].filter(Boolean).join(' · ') || 'Digital business card'}</p>
          <p className="dashboard-slug">/c/{card.slug}</p>
          {card.is_published ? <Link className="card-public-link" href={`/c/${encodeURIComponent(card.slug)}`} prefetch={false}>View public card <span aria-hidden="true">↗</span><span className="sr-only"> for {card.display_name}</span></Link> : <p className="card-private-note">Only visible to you</p>}
        </li>)}</ul>
        <nav className="dashboard-pagination" aria-label="Card pages"><button className="button button-secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><p role="status">Page {result.meta.current_page} of {result.meta.last_page}</p><button className="button button-secondary" disabled={page >= result.meta.last_page} onClick={() => load(page + 1)}>Next</button></nav></>}
    </main>
    <footer className="account-footer">A simple way to stay connected.</footer>
  </div>;
}
