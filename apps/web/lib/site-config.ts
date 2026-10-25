function baseUrl(value: string | undefined, fallback: string): URL {
  const url = new URL(value || fallback);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Configure an HTTP(S) origin without credentials, query parameters, or a path.');
  }
  return url;
}

export function apiOrigin(): URL {
  return baseUrl(process.env.API_BASE_URL, 'http://localhost:8000');
}

export function siteOrigin(): URL {
  return baseUrl(process.env.PUBLIC_SITE_URL, 'http://localhost:3000');
}

export function cardUrl(slug: string): string {
  return new URL(`/c/${encodeURIComponent(slug)}`, siteOrigin()).href;
}

export const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};
