import type { ReactNode } from 'react';
import type { CardProfile } from '@/lib/card-profile';
import { safeWebsite } from '@/lib/card-appearance';
import { CardImage } from './card-image';

function ContactLink({ preview, href, external, className, children }: { preview: boolean; href: string; external?: boolean; className: string; children: ReactNode }) {
  return preview ? <span className={className}>{children}</span> : <a className={className} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}{external && <span className="sr-only"> (opens in a new tab)</span>}</a>;
}

export function ProfileContent({ card, actions, preview = false, images }: { card: CardProfile; actions: ReactNode; preview?: boolean; images?: ReactNode }) {
  const avatar = card.assets.find(asset => asset.type === 'avatar');
  const logo = card.assets.find(asset => asset.type === 'logo');
  const phone = card.phone?.replace(/[^+\d*#(),;\- .]/g, '');
  const email = card.email && !/[\r\n]/.test(card.email) ? card.email : null;
  const website = safeWebsite(card.website);
  const Heading = preview ? 'h3' : 'h1';
  const SectionHeading = preview ? 'h4' : 'h2';
  const prefix = preview ? 'preview-' : '';
  return <>
    <div className="profile-topline"><span className="eyebrow">DIGITAL BUSINESS CARD</span><span className="profile-index" aria-hidden="true">01 /</span></div>
    <div className="profile-identity">
      <div className="portrait-row">{images ?? <><CardImage key={avatar?.url || 'initials'} src={avatar?.url} name={card.display_name} kind="avatar" /><CardImage key={logo?.url || 'no-logo'} src={logo?.url} name={card.company || card.display_name} kind="logo" /></>}</div>
      <Heading className="profile-name">{card.display_name || 'Your name'}</Heading>
      {(card.job_title || card.company) && <p className="profile-role">{card.job_title}{card.job_title && card.company && <span className="role-separator"> / </span>}{card.company && <span className="profile-company">{card.company}</span>}</p>}
      {card.location && <p className="profile-location"><span aria-hidden="true">↳</span> {card.location}</p>}
      {card.bio && <p className="profile-bio">{card.bio}</p>}
    </div>
    {actions}
    {(email || phone || website) && <section className="contact-section" aria-labelledby={`${prefix}contact-heading`}>
      <SectionHeading id={`${prefix}contact-heading`} className="eyebrow">LET’S CONNECT</SectionHeading>
      <div className="contact-list">
        {email && <ContactLink preview={preview} className="contact-row" href={`mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`}><span className="contact-label">Email</span><span className="contact-value">{email}</span><span aria-hidden="true">↗</span></ContactLink>}
        {phone && <ContactLink preview={preview} className="contact-row" href={`tel:${encodeURIComponent(phone)}`}><span className="contact-label">Phone</span><span className="contact-value">{card.phone}</span><span aria-hidden="true">↗</span></ContactLink>}
        {website && <ContactLink preview={preview} className="contact-row" href={website} external><span className="contact-label">Website</span><span className="contact-value">{new URL(website).host}</span><span aria-hidden="true">↗</span></ContactLink>}
      </div>
    </section>}
    {card.links.length > 0 && <section className="links-section" aria-labelledby={`${prefix}links-heading`}>
      <SectionHeading id={`${prefix}links-heading`} className="eyebrow">ELSEWHERE</SectionHeading>
      <div className="profile-links">{card.links.filter(link => safeWebsite(link.url)).map((link, index) => <ContactLink preview={preview} className="profile-link" key={`${index}-${link.url}`} href={link.url} external><span className="link-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{link.label}</span><span className="link-arrow" aria-hidden="true">↗</span></ContactLink>)}</div>
    </section>}
    <footer className="profile-footer"><span>A simple way to stay connected.</span><span className="footer-mark" aria-hidden="true">0 · 1</span></footer>
  </>;
}
