'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/browser-api';
import type { CardLink } from '@/lib/cards';
import { errorMessage, type PanelProps } from './card-editor';
import type { Confirm } from './confirm-dialog';
const types = ['website', 'linkedin', 'instagram', 'facebook', 'x', 'youtube', 'tiktok', 'other'];
type Draft = { type: string; label: string; url: string };
type MarkDirty = (key: string, value: boolean) => void;
function LinkForm({ link, onSave, disabled, markDirty }: { link?: CardLink; onSave: (draft: Draft) => Promise<boolean>; disabled: boolean; markDirty: MarkDirty }) {
  const [draft, setDraft] = useState<Draft>({ type: link?.type ?? 'website', label: link?.label ?? '', url: link?.url ?? '' });
  const key = link?.id ?? 'new';
  const changed = draft.type !== (link?.type ?? 'website') || draft.label !== (link?.label ?? '') || draft.url !== (link?.url ?? '');
  useEffect(() => { markDirty(key, changed); return () => markDirty(key, false); }, [key, changed, markDirty]);
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave(draft) && !link) setDraft({ type: 'website', label: '', url: '' }); }
  return <form onSubmit={submit}><fieldset disabled={disabled}><div className="link-form-grid">
    <div className="form-field"><label htmlFor={`type-${key}`}>Type</label><select id={`type-${key}`} value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{types.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
    <div className="form-field"><label htmlFor={`label-${key}`}>Label</label><input id={`label-${key}`} required maxLength={100} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></div>
    <div className="form-field"><label htmlFor={`url-${key}`}>URL</label><input id={`url-${key}`} type="url" required pattern="https?://.+" maxLength={2048} value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} /></div>
    <button className="button button-secondary" type="submit">{link ? 'Save link' : 'Add link'}</button>
  </div></fieldset></form>;
}
export function LinksEditor({ origin, cardId, initial, confirm, onUnauthorized, markDirty, disabled }: PanelProps & { initial: CardLink[]; confirm: Confirm; markDirty: MarkDirty; disabled: boolean }) {
  const [links, setLinks] = useState(initial); const [busy, setBusy] = useState(false); const running = useRef(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const base = `/api/v1/cards/${cardId}/links`;
  useEffect(() => { markDirty('link-operation', busy); return () => markDirty('link-operation', false); }, [busy, markDirty]);
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (disabled || running.current) return false;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); return true; } catch (error) { setError(errorMessage(error, onUnauthorized)); return false; }
    finally { running.current = false; setBusy(false); }
  }
  function save(draft: Draft, id?: string) { return run(async () => {
    const { data } = await apiRequest<{ data: CardLink }>(origin, id ? `${base}/${id}` : base, { method: id ? 'PATCH' : 'POST', data: draft });
    setLinks(previous => id ? previous.map(item => item.id === id ? data : item) : [...previous, data]); setMessage(id ? 'Link saved.' : 'Link added.');
  }); }
  function toggle(link: CardLink) { return run(async () => {
    const { data } = await apiRequest<{ data: CardLink }>(origin, `${base}/${link.id}`, { method: 'PATCH', data: { is_visible: !link.is_visible } });
    setLinks(previous => previous.map(item => item.id === link.id ? data : item)); setMessage(data.is_visible ? 'Link is visible on published cards.' : 'Link hidden from the public card.');
  }); }
  function move(index: number, direction: number) { return run(async () => {
    const ids = links.map(link => link.id); [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const { data } = await apiRequest<{ data: CardLink[] }>(origin, `${base}/order`, { method: 'PUT', data: { link_ids: ids } }); setLinks(data); setMessage('Link order saved.');
  }); }
  function remove(link: CardLink) { return run(async () => {
    if (!await confirm('Delete this link?', `Remove “${link.label}” from this card?`, 'Delete link')) return;
    await apiRequest(origin, `${base}/${link.id}`, { method: 'DELETE' }); setLinks(previous => previous.filter(item => item.id !== link.id)); setMessage('Link deleted.');
  }); }
  return <section className="editor-section" aria-labelledby="links-heading"><h2 id="links-heading">Links</h2><p className="section-help">Add link, Save link, visibility and order changes persist immediately, separately from Save profile. Visible links appear publicly only while the card is published.</p>
    {!links.length && <p className="editor-empty">No links yet. Add your website or a social profile below.</p>}
    <ol className="editor-links">{links.map((link, index) => <li key={link.id} aria-label={link.label}>
      <div className="editor-link-heading"><h3>{index + 1}. {link.label}</h3><span>{link.is_visible ? 'Visible' : 'Hidden'}</span></div>
      <LinkForm link={link} onSave={draft => save(draft, link.id)} disabled={busy || disabled} markDirty={markDirty} />
      <div className="editor-actions"><button className="button button-secondary" disabled={busy || disabled} onClick={() => toggle(link)}>{link.is_visible ? 'Hide link' : 'Show link'}</button><button className="button button-secondary" disabled={busy || disabled || index === 0} onClick={() => move(index, -1)}>Move up</button><button className="button button-secondary" disabled={busy || disabled || index === links.length - 1} onClick={() => move(index, 1)}>Move down</button><button className="button button-secondary" disabled={busy || disabled} onClick={() => remove(link)}>Delete link</button></div>
    </li>)}</ol>
    <h3>Add a link</h3><LinkForm onSave={draft => save(draft)} disabled={busy || disabled} markDirty={markDirty} />
    <p role="alert" className="editor-feedback">{error}</p><p role="status" className="editor-feedback">{busy ? 'Saving link change…' : message}</p>
  </section>;
}
