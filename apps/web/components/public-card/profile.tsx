import type { PublicCard } from '@/lib/public-card';
import { CardImage } from './card-image';
import { ShareActions } from './share-actions';

export function Profile({ card, publicUrl }: { card: PublicCard; publicUrl: string }) {
  const avatar = card.assets.find(asset => asset.type === 'avatar');
  const logo = card.assets.find(asset => asset.type === 'logo');
  const phone = card.phone?.replace(/[^+\d*#(),;\- .]/g, '');
  const email = card.email && !/[\r\n]/.test(card.email) ? card.email : null;
  return <div className="public-card-shell">
    <a className="skip-link" href="#profile">Skip to contact details</a>
    <header className="card-brand"><span className="brand-mark" aria-hidden="true">0<span>1</span></span><span>nought.one</span></header>
    <main id="profile" className="profile-sheet">
      <div className="profile-topline"><span className="eyebrow">DIGITAL BUSINESS CARD</span><span className="profile-index" aria-hidden="true">01 /</span></div>
      <div className="profile-identity">
        <div className="portrait-row"><CardImage key={avatar?.url || 'initials'} src={avatar?.url} name={card.display_name} kind="avatar" /><CardImage key={logo?.url || 'no-logo'} src={logo?.url} name={card.company || card.display_name} kind="logo" /></div>
        <h1>{card.display_name}</h1>
        {(card.job_title || card.company) && <p className="profile-role">{card.job_title}{card.job_title && card.company && <span className="role-separator"> / </span>}{card.company && <span className="profile-company">{card.company}</span>}</p>}
        {card.location && <p className="profile-location"><span aria-hidden="true">↳</span> {card.location}</p>}
        {card.bio && <p className="profile-bio">{card.bio}</p>}
      </div>
      <ShareActions slug={card.slug} publicUrl={publicUrl} name={card.display_name} />
      {(email || phone || card.website) && <section className="contact-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="eyebrow">LET’S CONNECT</h2>
        <div className="contact-list">
          {email && <a className="contact-row" href={`mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`}><span className="contact-label">Email</span><span className="contact-value">{email}</span><span aria-hidden="true">↗</span></a>}
          {phone && <a className="contact-row" href={`tel:${encodeURIComponent(phone)}`}><span className="contact-label">Phone</span><span className="contact-value">{card.phone}</span><span aria-hidden="true">↗</span></a>}
          {card.website && <a className="contact-row" href={card.website} target="_blank" rel="noopener noreferrer"><span className="contact-label">Website</span><span className="contact-value">{new URL(card.website).host}</span><span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      </section>}
      {card.links.length > 0 && <section className="links-section" aria-labelledby="links-heading">
        <h2 id="links-heading" className="eyebrow">ELSEWHERE</h2>
        <div className="profile-links">{card.links.map((link, index) => <a className="profile-link" key={`${index}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer"><span className="link-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{link.label}</span><span className="link-arrow" aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>)}</div>
      </section>}
      <footer className="profile-footer"><span>A simple way to stay connected.</span><span className="footer-mark" aria-hidden="true">0 · 1</span></footer>
    </main>
    <footer className="card-colophon">Made with <span>nought.one</span></footer>
  </div>;
}
