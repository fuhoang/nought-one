import 'server-only';
import { cache } from 'react';
import { apiOrigin } from './site-config';

export type PublicCard = {
  slug: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  template_key: string;
  links: { type: string; label: string; url: string }[];
  assets: { type: 'avatar' | 'logo'; url: string }[];
};

export class CardApiError extends Error {
  constructor() { super('The card service is temporarily unavailable.'); }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function parsePublicCard(value: unknown, slug: string): PublicCard {
  if (!object(value) || value.slug !== slug || typeof value.display_name !== 'string' || !value.display_name.trim()
      || typeof value.template_key !== 'string' || !Array.isArray(value.links) || !Array.isArray(value.assets)) {
    throw new CardApiError();
  }
  const optional: Record<string, string | null> = {};
  for (const field of ['job_title', 'company', 'bio', 'phone', 'email', 'website', 'location']) {
    if (value[field] !== null && typeof value[field] !== 'string') throw new CardApiError();
    optional[field] = value[field] as string | null;
  }
  const links: PublicCard['links'] = [];
  for (const link of value.links) {
    if (!object(link) || typeof link.type !== 'string' || typeof link.label !== 'string' || !httpUrl(link.url)) continue;
    links.push({ type: link.type, label: link.label, url: link.url });
  }
  const assets: PublicCard['assets'] = [];
  for (const asset of value.assets) {
    if (!object(asset) || !['avatar', 'logo'].includes(String(asset.type)) || !httpUrl(asset.url)) continue;
    const url = new URL(asset.url);
    const prefix = `/api/v1/public/cards/${slug}/assets/`;
    if (url.origin !== apiOrigin().origin || !url.pathname.startsWith(prefix) || !/^[a-f0-9-]{36}$/i.test(url.pathname.slice(prefix.length)) || url.search || url.hash) continue;
    assets.push({ type: asset.type as 'avatar' | 'logo', url: url.href });
  }
  return {
    slug, display_name: value.display_name, template_key: value.template_key,
    job_title: optional.job_title, company: optional.company, bio: optional.bio,
    phone: optional.phone, email: optional.email, location: optional.location,
    website: httpUrl(optional.website) ? optional.website : null, links, assets,
  };
}

export async function fetchPublicCard(slug: string): Promise<PublicCard | null> {
  if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const response = await fetch(new URL(`/api/v1/public/cards/${encodeURIComponent(slug)}`, apiOrigin()), {
      cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new CardApiError();
    const body: unknown = await response.json();
    if (!object(body)) throw new CardApiError();
    return parsePublicCard(body.data, slug);
  } catch { throw new CardApiError(); }
}

// Deduplicate metadata and page requests only within the current server render.
export const getPublicCard = cache(fetchPublicCard);
