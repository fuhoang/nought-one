'use client';
import type { Card, ProfileDraft } from '@/lib/cards';
import type { Appearance } from '@/lib/card-appearance';
import { safeWebsite } from '@/lib/card-appearance';
import { ProfileContent } from '../public-card/profile-content';
import { CardImage } from '../public-card/card-image';
import { PrivateCardImage } from './private-card-image';

export function CardPreview({ card, draft, appearance, dirty, origin, assetVersion, onUnauthorized }: { card: Card; draft: ProfileDraft; appearance: Appearance; dirty: boolean; origin: string; assetVersion: number; onUnauthorized: () => void }) {
  const profile = { ...card, ...draft, ...appearance, website: safeWebsite(draft.website), assets: [], links: card.links.filter(link => link.is_visible) };
  return <section className="editor-preview" aria-labelledby="preview-heading">
    <h2 id="preview-heading" tabIndex={-1}>Live preview</h2>
    <p className="field-hint">{dirty ? 'Preview — unsaved changes' : 'Preview — saved card'}. Links and images reflect saved changes. Preview actions are unavailable.</p>
    <button type="button" className="button button-secondary preview-jump" onClick={() => document.getElementById('appearance-heading')?.focus()}>Back to appearance</button>
    <div className="public-card-shell card-preview" data-template={appearance.template_key} data-mode={appearance.theme_settings.mode} data-accent={appearance.theme_settings.accent}>
      <div className="card-brand"><span className="brand-mark" aria-hidden="true">0<span>1</span></span><span>nought.one</span></div>
      <article className="profile-sheet" aria-label="Card preview">
        <ProfileContent card={profile} preview images={<>{(['avatar', 'logo'] as const).map(type => {
          const asset = card.assets.find(item => item.type === type);
          const name = (type === 'logo' ? draft.company : draft.display_name) || draft.display_name || 'Your name';
          return asset ? <PrivateCardImage key={`${asset.id}-${assetVersion}`} origin={origin} cardId={card.id} asset={asset} version={assetVersion} onUnauthorized={onUnauthorized} name={name} /> : <CardImage key={type} name={name} kind={type} />;
        })}</>} actions={<div className="card-actions" aria-hidden="true"><span className="button button-primary save-contact"><span>＋</span>Save contact</span><div className="share-row"><span className="button button-secondary">Copy link ↗</span><span className="button button-secondary">Show QR code ▦</span></div><p className="action-feedback" /></div>} />
      </article>
      <div className="card-colophon">Made with <span>nought.one</span></div>
    </div>
  </section>;
}
