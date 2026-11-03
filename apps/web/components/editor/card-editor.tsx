'use client';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Document navigation ensures beforeunload covers editor exits, including browser Back. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, ApiError } from '@/lib/browser-api';
import { profileDraft, profileFields, type Card, type ProfileDraft } from '@/lib/cards';
import { useConfirmation } from './confirm-dialog';
import { LinksEditor } from './links-editor';
import { AssetsEditor } from './assets-editor';

export type PanelProps = { origin: string; cardId: string; onUnauthorized: () => void };
export function errorMessage(error: unknown, onUnauthorized: () => void) {
  if (error instanceof ApiError && error.status === 401) onUnauthorized();
  if (error instanceof ApiError && error.status === 404) return 'This card or item is unavailable. It may have been deleted or belong to another account.';
  if (error instanceof ApiError && Object.keys(error.fields).length) return Object.values(error.fields).flat().join(' ');
  return error instanceof Error ? error.message : 'The change could not be saved. Please try again.';
}
export function CardEditor({ origin, site, id, locked, onUnauthorized }: { origin: string; site: string; id?: string; locked: boolean; onUnauthorized: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(profileDraft());
  const [saved, setSaved] = useState<ProfileDraft>(profileDraft());
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [dirtyParts, setDirtyParts] = useState<Record<string, boolean>>({});
  const markDirty = useCallback((key: string, value: boolean) => setDirtyParts(previous => previous[key] === value ? previous : { ...previous, [key]: value }), []);
  const profileDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dirty = profileDirty || Object.values(dirtyParts).some(Boolean);
  const allowLeave = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const { confirm, modal } = useConfirmation(locked);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if ((dirty || running.current) && !allowLeave.current) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const request = /^[a-f0-9-]{36}$/i.test(id)
      ? apiRequest<{ data: Card }>(origin, `/api/v1/cards/${id}`, { signal: controller.signal })
      : Promise.reject(new ApiError(404, 'This card is unavailable.'));
    request.then(({ data }) => {
      if (controller.signal.aborted) return;
      setCard(data); setDraft(profileDraft(data)); setSaved(profileDraft(data)); setLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(error, onUnauthorized)); setLoading(false);
    });
    return () => controller.abort();
  }, [origin, id, attempt, onUnauthorized]);
  function begin() { if (running.current || locked) return false; running.current = true; setBusy(true); setError(''); setMessage(''); return true; }
  function finish() { running.current = false; setBusy(false); }
  function fail(error: unknown) { setError(errorMessage(error, onUnauthorized)); if (error instanceof ApiError) setFields(error.fields); requestAnimationFrame(() => feedback.current?.focus()); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!begin()) return;
    setFields({});
    try {
      if (card?.is_published && draft.slug !== saved.slug && !await confirm('Change public URL?', 'The old link and previously shared QR codes will stop working. Save this new public URL?', 'Save new URL')) return;
      const payload = Object.fromEntries(profileFields.map(key => [key, ['slug', 'display_name'].includes(key) ? draft[key] : draft[key] || null]));
      const { data } = await apiRequest<{ data: Card }>(origin, card ? `/api/v1/cards/${card.id}` : '/api/v1/cards', { method: card ? 'PATCH' : 'POST', data: { ...payload, ...(card ? {} : { is_published: false, template_key: 'minimal' }) } });
      setCard(data); setDraft(profileDraft(data)); setSaved(profileDraft(data)); setMessage('Profile saved.');
      if (!card) { allowLeave.current = true; window.location.replace(`/dashboard/cards/${data.id}/edit`); }
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function publication() {
    if (!card || !begin()) return;
    try {
      const action = card.is_published ? 'Unpublish' : 'Publish';
      if (!await confirm(`${action} this card?`, card.is_published ? 'Your public card, contact download and public images will become unavailable.' : 'Your saved profile, visible links and images will become public. Unsaved profile edits will not be included.', action)) return;
      const { data } = await apiRequest<{ data: Card }>(origin, `/api/v1/cards/${card.id}`, { method: 'PATCH', data: { is_published: !card.is_published } });
      setCard(previous => previous && { ...previous, is_published: data.is_published });
      setMessage(data.is_published ? 'Card published. Unsaved profile edits remain unsaved.' : 'Card unpublished.');
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function remove() {
    if (!card || !begin()) return;
    try {
      if (!await confirm('Delete this card?', 'This permanently deletes the card, its links and images. Unsaved edits will also be lost. This cannot be undone.', 'Delete card')) return;
      await apiRequest(origin, `/api/v1/cards/${card.id}`, { method: 'DELETE' });
      allowLeave.current = true; window.location.assign('/dashboard');
    } catch (error) { fail(error); } finally { finish(); }
  }
  const labels: Record<keyof ProfileDraft, string> = { display_name: 'Display name', slug: 'Public URL slug', job_title: 'Job title', company: 'Company', bio: 'Bio', phone: 'Phone', email: 'Contact email', website: 'Website', location: 'Location' };
  const limits: Partial<Record<keyof ProfileDraft, number>> = { display_name: 150, slug: 100, job_title: 150, company: 150, phone: 30, email: 255, website: 2048, location: 255 };
  return <div className="account-shell editor-shell">
    <header className="editor-header"><a className="account-brand" href="/dashboard">nought.one</a><a className="button button-secondary" href="/dashboard">Back to cards</a></header>
    <main className="editor-main">
      <p className="eyebrow">YOUR INTRODUCTION</p><h1>{id ? 'Edit your card.' : 'Make it yours.'}</h1>
      {loading ? <p role="status">Loading your card…</p> : loadError ? <section className="editor-section"><h2>Card unavailable</h2><p role="alert">{loadError}</p><button className="button button-secondary" onClick={() => { setLoading(true); setLoadError(''); setAttempt(value => value + 1); }}>Try again</button></section> : <>
        <p className="editor-intro">{card ? 'Edit your profile, links and images.' : 'Create an unpublished draft. Add links and images after saving.'}</p>
        <div className="editor-layout"><section className="editor-section" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2><p className="section-help">Profile edits are saved only when you select Save profile.</p>
          <form onSubmit={save} aria-busy={busy}><fieldset disabled={busy || locked}>
            <div className="profile-form-grid">{profileFields.map(key => <div className={`form-field ${key === 'bio' || key === 'slug' ? 'form-wide' : ''}`} key={key}>
              <label htmlFor={`profile-${key}`}>{labels[key]}{['display_name', 'slug'].includes(key) ? ' *' : ''}</label>
              {key === 'bio' ? <textarea id={`profile-${key}`} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} rows={4} aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `${key}-error` : undefined} />
                : <input id={`profile-${key}`} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} required={['display_name', 'slug'].includes(key)} maxLength={limits[key]} type={key === 'email' ? 'email' : key === 'website' ? 'url' : key === 'phone' ? 'tel' : 'text'} pattern={key === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : key === 'website' ? 'https?://.+' : undefined} aria-invalid={!!fields[key]} aria-describedby={[key === 'slug' ? 'slug-help' : '', fields[key] ? `${key}-error` : ''].filter(Boolean).join(' ') || undefined} />}
              {key === 'slug' && <p id="slug-help" className="field-hint">Lowercase letters, numbers and single hyphens. Availability is checked when saving.<br /><span className="editor-url">{site}/c/{draft.slug || 'your-name'}</span></p>}
              {fields[key] && <p className="field-error" id={`${key}-error`}>{fields[key].join(' ')}</p>}
            </div>)}</div>
            {card?.is_published && draft.slug !== saved.slug && <p className="editor-notice">Changing this slug replaces your published URL. Existing links and QR codes will stop working.</p>}
            <div className="editor-actions"><button className="button button-primary" type="submit">{busy ? 'Please wait…' : card ? 'Save profile' : 'Create draft'}</button><span className="field-hint">{profileDirty ? 'Unsaved profile changes' : card ? 'Profile up to date' : 'Not created yet'}</span></div>
          </fieldset></form>
        </section>
        <aside className="editor-section editor-publication" aria-label="Publication"><h2>{card?.is_published ? 'Published' : 'Unpublished'}</h2><p className="section-help">{card?.is_published ? 'Your saved card is publicly visible.' : 'Your card is private until you publish it.'}</p>
          {card ? <><button className="button button-secondary" disabled={busy || locked} onClick={publication}>{card.is_published ? 'Unpublish card' : 'Publish card'}</button><p className="field-hint">Publication changes take effect immediately after confirmation.</p>
            {profileDirty && <p className="field-hint">Save your profile first to include its latest changes.</p>}
            {card.is_published && <a className="button button-secondary" href={`/c/${encodeURIComponent(card.slug)}`} target="_blank" rel="noopener noreferrer">View public card (new tab)</a>}
            <hr /><button className="button button-secondary" disabled={busy || locked} onClick={remove}>Delete card</button></> : <p className="field-hint">Save your draft to enable links, images and publication.</p>}
        </aside></div>
        <p ref={feedback} tabIndex={-1} role="alert" className="editor-feedback">{error}</p><p role="status" className="editor-feedback">{message}</p>
        {card && <><LinksEditor origin={origin} cardId={card.id} initial={card.links} confirm={confirm} onUnauthorized={onUnauthorized} markDirty={markDirty} disabled={busy || locked} />
          <AssetsEditor origin={origin} cardId={card.id} initial={card.assets} markDirty={markDirty} confirm={confirm} onUnauthorized={onUnauthorized} disabled={busy || locked} /></>}
      </>}
    </main><footer className="account-footer">A simple way to stay connected.</footer>{modal}
  </div>;
}
