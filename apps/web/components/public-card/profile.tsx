import type { CardProfile } from '@/lib/card-profile';
import { appearanceOf } from '@/lib/card-appearance';
import { ProfileContent } from './profile-content';
import { ShareActions } from './share-actions';

export function Profile({ card, publicUrl }: { card: CardProfile; publicUrl: string }) {
  const appearance = appearanceOf(card);
  return <div className="public-card-shell" data-template={appearance.template_key} data-mode={appearance.theme_settings.mode} data-accent={appearance.theme_settings.accent}>
    <a className="skip-link" href="#profile">Skip to contact details</a>
    <header className="card-brand"><span className="brand-mark" aria-hidden="true">0<span>1</span></span><span>nought.one</span></header>
    <main id="profile" className="profile-sheet">
      <ProfileContent card={card} actions={<ShareActions slug={card.slug} publicUrl={publicUrl} name={card.display_name} />} />
    </main>
    <footer className="card-colophon">Made with <span>nought.one</span></footer>
  </div>;
}
