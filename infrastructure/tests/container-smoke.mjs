import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Fixed localhost targets deliberately prevent accidentally testing a live service.
const api = 'http://localhost:8011';
const site = 'http://localhost:3011';
const cookies = new Map();
async function request(path, method = 'GET', body) {
  const headers = { Accept: 'application/json', Origin: site, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (cookies.has('XSRF-TOKEN')) headers['X-XSRF-TOKEN'] = decodeURIComponent(cookies.get('XSRF-TOKEN'));
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
  }
  return response;
}
assert.equal((await fetch(site + '/health')).status, 200);
assert.equal((await fetch(api + '/ready')).status, 200);
assert.equal((await request('/sanctum/csrf-cookie')).status, 204);
assert.ok(cookies.has('XSRF-TOKEN'));
const password = 'ContainerTest123!';
const account = { name: 'Container check', email: `${randomUUID()}@example.com`, password, password_confirmation: password };
assert.equal((await request('/register', 'POST', account)).status, 201);
assert.equal((await request('/api/v1/me')).status, 200);
let card;
try {
  const created = await request('/api/v1/cards', 'POST', { slug: `docker-${randomUUID()}`, display_name: account.name });
  assert.equal(created.status, 201);
  card = (await created.json()).data;
  assert.equal((await fetch(api + '/api/v1/public/cards/' + card.slug)).status, 404);
  assert.equal((await request('/api/v1/cards/' + card.id, 'PATCH', { is_published: true })).status, 200);
  const publicCard = await fetch(api + '/api/v1/public/cards/' + card.slug);
  assert.equal(publicCard.status, 200);
  assert.equal((await publicCard.json()).data.display_name, account.name);
  const page = await fetch(site + '/c/' + card.slug);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(account.name));
  assert.equal((await request('/api/v1/cards/' + card.id, 'PATCH', { is_published: false })).status, 200);
  assert.equal((await fetch(api + '/api/v1/public/cards/' + card.slug)).status, 404);
} finally {
  if (card) assert.equal((await request('/api/v1/cards/' + card.id, 'DELETE')).status, 204);
}
assert.equal((await request('/logout', 'POST')).status, 200);
assert.equal((await request('/api/v1/me')).status, 401);
console.log('Container HTTP smoke passed: database sessions, CSRF, CRUD, publication, internal server fetch and logout.');
