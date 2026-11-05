import 'server-only';
import { apiOrigin } from './site-config';

export function serverApiOrigin(): URL {
  const value = process.env.API_INTERNAL_URL;
  if (!value) return apiOrigin();
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_INTERNAL_URL must be an HTTP(S) origin.');
  }
  return url;
}
