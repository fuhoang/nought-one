import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, png, type Session } from './support/fixtures';

async function signIn(page: Page, session: Session) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(session.email);
  await page.getByLabel('Password', { exact: true }).fill(session.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cards.', exact: true })).toBeVisible();
}
async function edit(page: Page, session: Session) {
  await signIn(page, session);
  await page.getByRole('link', { name: `Edit card for ${session.card.display_name}` }).click();
  await expect(page.getByLabel('Display name')).toHaveValue(session.card.display_name);
}
async function approve(page: Page, action: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: action, exact: true }).click();
}
async function getCard(session: Session, id = session.card.id) { return (await (await session.api.get(`/api/v1/cards/${id}`)).json()).data; }

test('creates private drafts, validates uniqueness, and confirms deletion', async ({ page, session }, testInfo) => {
  await signIn(page, session);
  await page.getByRole('link', { name: 'Create card', exact: true }).click();
  await page.getByLabel('Display name').fill('My new card');
  await page.getByLabel('Public URL slug').fill(session.card.slug);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.locator('#slug-error')).toContainText('already been taken');
  await expect(page.getByLabel('Display name')).toHaveValue('My new card');
  const slug = `draft-${randomUUID()}`;
  await page.getByLabel('Public URL slug').fill(slug);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/cards\/[a-f0-9-]+\/edit$/);
  const id = page.url().split('/').at(-2)!;
  try {
    await expect(page.getByRole('heading', { name: 'Unpublished', exact: true })).toBeVisible();
    await expect(page.getByText('No links yet.', { exact: false })).toBeVisible();
    expect((await getCard(session, id)).is_published).toBe(false);
    expect((await session.api.get(`/api/v1/public/cards/${slug}`)).status()).toBe(404);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
    await page.getByRole('button', { name: 'Delete card', exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.route(`**/api/v1/cards/${id}`, route => route.request().method() === 'DELETE' ? route.abort() : route.continue());
    await page.getByRole('button', { name: 'Delete card', exact: true }).click(); await approve(page, 'Delete card');
    await expect(page.getByRole('alert').filter({ hasText: 'reach the service' })).toBeVisible();
    expect((await session.api.get(`/api/v1/cards/${id}`)).status()).toBe(200);
    await page.unroute(`**/api/v1/cards/${id}`);
    await page.getByRole('button', { name: 'Delete card', exact: true }).click(); await approve(page, 'Delete card');
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await session.api.get(`/api/v1/cards/${id}`)).status()).toBe(404);
  } finally { await session.mutate('DELETE', `/api/v1/cards/${id}`); }
});

test('preserves unsaved input on focus, navigation cancellation and API errors; PATCH recovers from CSRF', async ({ page, session }) => {
  await edit(page, session);
  await page.getByLabel('Bio', { exact: true }).fill('Unsaved profile text');
  const checked = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await checked;
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Unsaved profile text');
  const warning = page.waitForEvent('dialog');
  const leaving = page.getByRole('link', { name: 'Back to cards', exact: true }).click();
  const dialog = await warning; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); await leaving;
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Unsaved profile text');
  const backWarning = page.waitForEvent('dialog'); await page.evaluate(() => history.back());
  await (await backWarning).dismiss();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Unsaved profile text');
  const path = `**/api/v1/cards/${session.card.id}`;
  await page.route(path, route => route.request().method() === 'PATCH' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'reach the service' })).toBeVisible();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Unsaved profile text');
  expect((await getCard(session)).bio).not.toBe('Unsaved profile text');
  await page.unroute(path);
  let patches = 0;
  await page.route(path, route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches++;
    return route.continue(patches === 1 ? { headers: { ...route.request().headers(), 'x-xsrf-token': 'invalid' } } : undefined);
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
  expect(patches).toBe(2); expect((await getCard(session)).bio).toBe('Unsaved profile text');
  await page.getByRole('link', { name: 'Back to cards', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('published URL changes require confirmation and publication never saves pending profile edits', async ({ page, session }) => {
  await edit(page, session);
  const slug = `renamed-${randomUUID()}`;
  await page.getByLabel('Public URL slug').fill(slug);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('old link');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await getCard(session)).slug).toBe(session.card.slug);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await approve(page, 'Save new URL');
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
  expect((await session.api.get(`/api/v1/public/cards/${session.card.slug}`)).status()).toBe(404);
  expect((await session.api.get(`/api/v1/public/cards/${slug}`)).status()).toBe(200);
  await page.getByLabel('Display name').fill('Still unsaved');
  await page.route(`**/api/v1/cards/${session.card.id}`, route => route.request().method() === 'PATCH' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Unpublish card', exact: true }).click(); await approve(page, 'Unpublish');
  await expect(page.getByRole('alert').filter({ hasText: 'reach the service' })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Still unsaved');
  expect((await getCard(session)).is_published).toBe(true);
  await page.unroute(`**/api/v1/cards/${session.card.id}`);
  await page.getByRole('button', { name: 'Unpublish card', exact: true }).click(); await approve(page, 'Unpublish');
  await expect(page.getByRole('heading', { name: 'Unpublished', exact: true })).toBeVisible();
  expect((await getCard(session)).display_name).toBe(session.card.display_name);
  expect((await session.api.get(`/api/v1/public/cards/${slug}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Publish card', exact: true }).click(); await approve(page, 'Publish');
  await expect(page.getByRole('heading', { name: 'Published', exact: true })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Still unsaved');
  await page.getByLabel('Display name').fill(session.card.display_name);
});

test('links save separately, preserve failed input, reorder by keyboard and respect visibility', async ({ page, session }) => {
  await edit(page, session);
  await page.getByLabel('Bio', { exact: true }).fill('Not saved by links');
  const region = page.getByRole('region', { name: 'Links', exact: true });
  await region.getByLabel('Label', { exact: true }).fill('Portfolio');
  await region.getByLabel('URL', { exact: true }).fill('https://example.com/portfolio');
  await page.route(`**/api/v1/cards/${session.card.id}/links`, route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await region.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('reach the service');
  await expect(region.getByLabel('Label', { exact: true })).toHaveValue('Portfolio');
  await page.unroute(`**/api/v1/cards/${session.card.id}/links`);
  await region.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(region.getByRole('listitem', { name: 'Portfolio', exact: true })).toBeVisible();
  await page.locator('#label-new').fill('Social'); await page.locator('#url-new').fill('https://example.com/social');
  await region.getByRole('button', { name: 'Add link', exact: true }).click();
  const social = region.getByRole('listitem', { name: 'Social', exact: true });
  await social.getByRole('button', { name: 'Move up', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(region.getByRole('listitem').first()).toHaveAttribute('aria-label', 'Social');
  await social.getByRole('button', { name: 'Hide link', exact: true }).click();
  await expect(social.getByText('Hidden', { exact: true })).toBeVisible();
  const publicCard = (await (await session.api.get(`/api/v1/public/cards/${session.card.slug}`)).json()).data;
  expect(publicCard.links.map((link: { label: string }) => link.label)).toEqual(['Portfolio']);
  const portfolio = region.getByRole('listitem', { name: 'Portfolio', exact: true });
  await portfolio.getByLabel('Label', { exact: true }).fill('My work');
  await portfolio.getByRole('button', { name: 'Save link', exact: true }).click();
  await expect(region.getByRole('listitem', { name: 'My work', exact: true })).toBeVisible();
  await social.getByRole('button', { name: 'Delete link', exact: true }).click(); await approve(page, 'Delete link');
  await expect(social).toHaveCount(0);
  expect((await getCard(session)).bio).not.toBe('Not saved by links');
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Not saved by links');
  await page.getByLabel('Bio', { exact: true }).fill((await getCard(session)).bio);
});

test('private images validate, replace safely, refresh previews and revoke on unpublish', async ({ page, session }) => {
  await edit(page, session);
  const region = page.getByRole('region', { name: 'Images', exact: true });
  await page.getByLabel('Bio', { exact: true }).fill('File picker must retain this');
  await page.locator('#upload-avatar').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(region.getByRole('alert')).toContainText('could not be read');
  await page.locator('#upload-avatar').setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(2048 * 1024 + 1) });
  await expect(region.getByRole('alert')).toContainText('2 MB or smaller');
  await page.locator('#upload-avatar').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: png('light', 16) });
  await expect(region.getByRole('alert')).toContainText('between 32 and 2048');
  await page.locator('#upload-avatar').setInputFiles({ name: 'unsupported.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(region.getByRole('alert')).toContainText('JPEG, PNG or WebP');
  const light = { name: 'photo.png', mimeType: 'image/png', buffer: png('light') };
  const dark = { name: 'replacement.png', mimeType: 'image/png', buffer: png('dark') };
  for (const type of ['avatar', 'logo']) {
    await page.locator(`#upload-${type}`).setInputFiles(light);
    await expect(page.getByRole('img', { name: `Current ${type}`, exact: true })).toBeVisible();
  }
  const before = (await getCard(session)).assets;
  const avatarId = before.find((asset: { type: string }) => asset.type === 'avatar').id;
  const oldBytes = await (await session.api.get(`/api/v1/cards/${session.card.id}/assets/${avatarId}/content`)).body();
  const assetPath = `**/api/v1/cards/${session.card.id}/assets`;
  await page.route(assetPath, route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.locator('#upload-avatar').setInputFiles(dark);
  await expect(region.getByRole('alert')).toContainText('reach the service');
  expect((await (await session.api.get(`/api/v1/cards/${session.card.id}/assets/${avatarId}/content`)).body()).equals(oldBytes)).toBe(true);
  await expect(page.getByRole('img', { name: 'Current avatar', exact: true })).toBeVisible();
  await page.unroute(assetPath);
  const image = page.getByRole('img', { name: 'Current avatar', exact: true }); const source = await image.getAttribute('src');
  await region.getByRole('button', { name: 'Retry avatar upload', exact: true }).click();
  await expect(image).not.toHaveAttribute('src', source!);
  await expect(region.getByRole('status').filter({ hasText: 'Avatar saved.' })).toBeVisible();
  expect((await (await session.api.get(`/api/v1/cards/${session.card.id}/assets/${avatarId}/content`)).body()).equals(oldBytes)).toBe(false);
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('File picker must retain this');
  await page.getByRole('button', { name: 'Unpublish card', exact: true }).click(); await approve(page, 'Unpublish');
  await expect(page.getByRole('heading', { name: 'Unpublished', exact: true })).toBeVisible();
  for (const asset of before) expect((await session.api.get(`/api/v1/public/cards/${session.card.slug}/assets/${asset.id}`)).status()).toBe(404);
  await region.getByRole('button', { name: 'Remove logo', exact: true }).click(); await approve(page, 'Remove image');
  await expect(page.getByRole('img', { name: 'Current logo', exact: true })).toHaveCount(0);
  await page.getByLabel('Bio', { exact: true }).fill((await getCard(session)).bio);
});

test('expired sessions preserve the draft for the same user and other owners cannot edit', async ({ page, context, session }) => {
  await edit(page, session);
  await page.getByLabel('Bio', { exact: true }).fill('Retain after sign in');
  await page.request.get('http://localhost:8011/sanctum/csrf-cookie');
  const token = (await context.cookies()).find(cookie => cookie.name === 'XSRF-TOKEN')!.value;
  await page.request.post('http://localhost:8011/logout', { headers: { Accept: 'application/json', Origin: 'http://localhost:3011', 'X-XSRF-TOKEN': decodeURIComponent(token) } });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resume editing.', exact: true })).toBeVisible();
  const signin = await context.newPage(); await signIn(signin, session);
  await page.bringToFront();
  if (await page.getByRole('button', { name: 'Check session again', exact: true }).isVisible()) await page.getByRole('button', { name: 'Check session again', exact: true }).click();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Retain after sign in');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
  expect((await getCard(session)).bio).toBe('Retain after sign in'); await signin.close();
  const stranger = await context.browser()!.newContext(); const guest = await stranger.newPage();
  try {
    await guest.goto(`http://localhost:3011/dashboard/cards/${session.card.id}/edit`);
    await expect(guest.getByRole('heading', { name: 'Resume editing.', exact: true })).toBeVisible();
    await guest.goto('http://localhost:3011/register');
    await guest.getByLabel('Name', { exact: true }).fill('Other owner'); await guest.getByLabel('Email', { exact: true }).fill(`${randomUUID()}@example.com`);
    await guest.getByLabel('Password', { exact: true }).fill('OtherOwner123!'); await guest.getByLabel('Confirm password', { exact: true }).fill('OtherOwner123!');
    await guest.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(guest).toHaveURL(/\/dashboard$/);
    await guest.goto(`http://localhost:3011/dashboard/cards/${session.card.id}/edit`);
    await expect(guest.getByRole('heading', { name: 'Card unavailable', exact: true })).toBeVisible();
    await expect(guest.getByLabel('Display name')).toHaveCount(0);
    expect((await guest.request.get(`http://localhost:8011/api/v1/cards/${session.card.id}`, { headers: { Accept: 'application/json', Origin: 'http://localhost:3011' } })).status()).toBe(404);
    await guest.request.get('http://localhost:8011/sanctum/csrf-cookie');
    const strangerToken = (await stranger.cookies()).find(cookie => cookie.name === 'XSRF-TOKEN')!.value;
    const forbidden = await guest.request.patch(`http://localhost:8011/api/v1/cards/${session.card.id}`, { headers: { Accept: 'application/json', Origin: 'http://localhost:3011', 'X-XSRF-TOKEN': decodeURIComponent(strangerToken) }, data: { display_name: 'Unauthorized edit' } });
    expect(forbidden.status()).toBe(404);
    expect((await getCard(session)).display_name).toBe(session.card.display_name);
  } finally { await stranger.close(); }
});


test('initial session checks show loading without recovery controls', async ({ page, session }) => {
  await signIn(page, session);
  for (const path of ['/dashboard/cards/new', `/dashboard/cards/${session.card.id}/edit`]) {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/me', async route => { await pending; await route.continue(); });
    try {
      await page.goto(path);
      await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Loading editor…' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Resume editing.', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Sign in (new tab)', exact: true })).toHaveCount(0);
    } finally { release(); }
    await expect(page.getByLabel('Display name')).toBeVisible();
    await page.unroute('**/api/v1/me');
  }
});
