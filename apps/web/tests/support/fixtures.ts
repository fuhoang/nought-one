import { test as base, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export type CardFixture = { id: string; slug: string; display_name: string };
export type Session = { api: APIRequestContext; card: CardFixture; mutate: (method: string, path: string, data?: Record<string, unknown>, multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) => Promise<import('@playwright/test').APIResponse> };

export function png(color: 'light' | 'dark'): Buffer {
  return execFileSync('php', ['-r', `$im=imagecreatetruecolor(128,128); $c=imagecolorallocate($im,${color === 'light' ? '225,225,220' : '45,45,45'}); imagefill($im,0,0,$c); imagepng($im);`]);
}

export const test = base.extend<{ session: Session }>({
  session: async ({}, provide) => {
    const api = await request.newContext({ baseURL: 'http://localhost:8011', extraHTTPHeaders: { Accept: 'application/json', Origin: 'http://localhost:3011' } });
    async function mutate(method: string, path: string, data?: Record<string, unknown>, multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) {
      expect((await api.get('/sanctum/csrf-cookie')).status()).toBe(204);
      const token = (await api.storageState()).cookies.find(cookie => cookie.name === 'XSRF-TOKEN')?.value;
      if (!token) throw new Error('Missing E2E CSRF cookie');
      return api.fetch(path, { method, headers: { 'X-XSRF-TOKEN': decodeURIComponent(token) }, ...(multipart ? { multipart } : { data }) });
    }
    const id = randomUUID();
    expect((await mutate('POST', '/register', { name: 'E2E User', email: `${id}@example.com`, password: 'IsolatedTesting123!', password_confirmation: 'IsolatedTesting123!' })).status()).toBe(201);
    const response = await mutate('POST', '/api/v1/cards', { slug: `test-${id}`, display_name: 'Alex Morgan', job_title: 'Independent designer', company: 'Studio Morgan', bio: 'Thoughtful identities. Lasting connections.\nDesigning the details that bring people together.', email: 'alex@example.com', phone: '+44 20 7946 0958', website: 'https://example.com', location: 'London, United Kingdom', is_published: true });
    expect(response.status()).toBe(201);
    const card = (await response.json()).data as CardFixture;
    try { await provide({ api, card, mutate }); }
    finally { await mutate('DELETE', `/api/v1/cards/${card.id}`); await api.dispose(); }
  },
});
export { expect };
