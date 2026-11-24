import { test, expect, png, type Session } from './support/fixtures';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appearanceOf, safeWebsite } from '../lib/card-appearance';

async function edit(page: Page, session: Session) {
  await page.context().addCookies((await session.api.storageState()).cookies);
  await page.goto(`/dashboard/cards/${session.card.id}/edit`);
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
}
async function stored(session: Session) { return (await (await session.api.get(`/api/v1/cards/${session.card.id}`)).json()).data; }
const preview = (page: Page) => page.getByRole('region', { name: 'Live preview', exact: true });
const appearance = (page: Page) => page.getByRole('region', { name: 'Appearance', exact: true });

test('legacy and unsafe appearance or URL values normalize safely', () => {
  expect(appearanceOf()).toEqual({ template_key: 'minimal', theme_settings: { mode: 'light', accent: 'neutral' } });
  expect(appearanceOf({ template_key: '<script>', theme_settings: { mode: [], accent: 'url(https://evil.example)', private: true } })).toEqual(appearanceOf());
  expect(appearanceOf({ template_key: 'compact', theme_settings: { mode: 'dark', accent: 'forest', private: true } })).toEqual({ template_key: 'compact', theme_settings: { mode: 'dark', accent: 'forest' } });
  for (const value of ['https://', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/\n']) expect(safeWebsite(value)).toBeNull();
  expect(safeWebsite('https://example.com')).toBe('https://example.com/');
});

test('preview is local, saves are independent, and appearance survives reload', async ({ page, session }, testInfo) => {
  await edit(page, session);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'PATCH') writes.push(request.url()); });
  await appearance(page).getByRole('radio', { name: /Minimal/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(appearance(page).getByRole('radio', { name: /Centered/ })).toBeChecked();
  await appearance(page).getByRole('radio', { name: 'Dark', exact: true }).check();
  await appearance(page).getByRole('radio', { name: 'Forest', exact: true }).check();
  await page.getByLabel('Display name').fill('Draft name');
  await page.getByLabel('Website', { exact: true }).fill('https://');
  await expect(preview(page).getByRole('heading', { name: 'Draft name' })).toBeVisible();
  await expect(preview(page).locator('.public-card-shell')).toHaveAttribute('data-template', 'centered');
  await expect(preview(page).locator('.public-card-shell')).toHaveAttribute('data-mode', 'dark');
  await expect(preview(page).getByRole('link')).toHaveCount(0);
  await expect(preview(page).getByRole('article').getByRole('button')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect((await stored(session)).theme_settings).toBeNull();
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Appearance saved.' })).toBeVisible();
  expect((await stored(session)).display_name).toBe(session.card.display_name);
  await expect(page.getByLabel('Display name')).toHaveValue('Draft name');
  await page.getByLabel('Website', { exact: true }).fill('https://example.com');
  await appearance(page).getByRole('radio', { name: /Compact/ }).check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
  expect((await stored(session)).template_key).toBe('centered');
  await expect(appearance(page).getByRole('radio', { name: /Compact/ })).toBeChecked();
  await appearance(page).getByRole('button', { name: 'Discard appearance changes' }).click();
  await expect(appearance(page).getByRole('radio', { name: /Centered/ })).toBeChecked();
  await page.reload();
  await expect(preview(page).locator('.public-card-shell')).toHaveAttribute('data-accent', 'forest');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Show live preview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Live preview', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Back to appearance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeFocused();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('appearance-editor.png'), fullPage: true });
  await page.goto(`/c/${session.card.slug}`);
  await expect(page.locator('.public-card-shell')).toHaveAttribute('data-template', 'centered');
  await expect(page.locator('.public-card-shell')).toHaveAttribute('data-mode', 'dark');
  await expect(page.getByRole('heading', { name: 'Draft name' })).toBeVisible();
});

test('appearance navigation, publication and failed saves retain the draft until an explicit save', async ({ page, session }) => {
  await edit(page, session);
  await appearance(page).getByRole('radio', { name: 'Dark', exact: true }).check();
  const warning = page.waitForEvent('dialog');
  const leaving = page.getByRole('link', { name: 'Back to cards', exact: true }).click();
  await (await warning).dismiss(); await leaving;
  await expect(appearance(page).getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Unpublish card', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unpublished', exact: true })).toBeVisible();
  expect((await stored(session)).theme_settings).toBeNull();
  expect((await session.api.get(`/api/v1/public/cards/${session.card.slug}`)).status()).toBe(404);
  const path = `**/api/v1/cards/${session.card.id}`;
  await page.route(path, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 422, json: { errors: { 'theme_settings.mode': ['Choose a supported appearance mode.'] } } }) : route.continue());
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(appearance(page)).toContainText('Choose a supported appearance mode.');
  await expect(appearance(page).getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.unroute(path);
  let attempts = 0;
  await page.route(path, route => { if (route.request().method() !== 'PATCH') return route.continue(); attempts++; return route.abort(); });
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'reach the service' })).toBeVisible();
  expect(attempts).toBe(1);
  await expect(appearance(page).getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.unroute(path);
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Appearance saved.' })).toBeVisible();
  await appearance(page).getByRole('button', { name: 'Reset appearance' }).click();
  await expect(preview(page).locator('.public-card-shell')).toHaveAttribute('data-mode', 'light');
  expect((await stored(session)).theme_settings.mode).toBe('dark');
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Appearance saved.' })).toBeVisible();
  expect((await stored(session)).theme_settings).toEqual({ mode: 'light', accent: 'neutral' });
});

test('all public layouts and palettes remain accessible with long content and keyboard sharing', async ({ page, session }, testInfo) => {
  test.setTimeout(120000);
  for (const template of ['minimal', 'centered', 'compact']) {
    for (const mode of ['light', 'dark']) {
      for (const accent of ['neutral', 'slate', 'forest', 'navy']) {
        expect((await session.mutate('PATCH', `/api/v1/cards/${session.card.id}`, { template_key: template, theme_settings: { mode, accent }, display_name: 'Alexandria Morgan — Independent creative professional', company: 'Studio for thoughtful identities and lasting connections' })).status()).toBe(200);
        await page.goto(`/c/${session.card.slug}`);
        await expect(page.locator('.public-card-shell')).toHaveAttribute('data-template', template);
        await expect(page.getByRole('heading', { level: 1, name: 'Alexandria Morgan — Independent creative professional' })).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${template}-${mode}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: /Show QR code/ }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Show QR code/ })).toBeFocused();
});

test('preview follows saved visibility and private image changes without publishing', async ({ page, session }) => {
  expect((await session.mutate('PATCH', `/api/v1/cards/${session.card.id}`, { is_published: false })).status()).toBe(200);
  await edit(page, session);
  await page.getByLabel('Label', { exact: true }).fill('Portfolio');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(preview(page).getByText('Portfolio', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide link', exact: true }).click();
  await expect(preview(page).getByText('Portfolio', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show link', exact: true }).click();
  await expect(preview(page).getByText('Portfolio', { exact: true })).toBeVisible();
  const addForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add link', exact: true }) });
  await addForm.getByLabel('Label', { exact: true }).fill('Second link');
  await addForm.getByLabel('URL', { exact: true }).fill('https://example.org');
  await addForm.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(preview(page).locator('.profile-link')).toHaveCount(2);
  await page.getByRole('listitem', { name: 'Portfolio', exact: true }).getByRole('button', { name: 'Move down' }).click();
  await expect(preview(page).locator('.profile-link').first()).toContainText('Second link');
  await page.getByRole('listitem', { name: 'Portfolio', exact: true }).getByRole('button', { name: 'Delete link' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete link', exact: true }).click();
  await expect(preview(page).getByText('Portfolio', { exact: true })).toHaveCount(0);
  await page.locator('#upload-avatar').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png('light') });
  const portrait = preview(page).getByRole('img', { name: 'Portrait of Alex Morgan' });
  await expect(portrait).toBeVisible();
  const before = await portrait.getAttribute('src');
  const assetsPath = `**/api/v1/cards/${session.card.id}/assets`;
  await page.route(assetsPath, route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.locator('#upload-avatar').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png('dark') });
  await expect(page.getByRole('alert').filter({ hasText: 'existing image has not been removed' })).toBeVisible();
  await expect(portrait).toHaveAttribute('src', before!);
  await page.unroute(assetsPath);
  await page.getByRole('button', { name: 'Retry avatar upload' }).click();
  await expect(portrait).not.toHaveAttribute('src', before!);
  const card = await stored(session);
  expect((await session.api.get(`/api/v1/public/cards/${session.card.slug}/assets/${card.assets[0].id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Remove avatar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(portrait).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('an expired save locks editing and preserves appearance for the same returning account', async ({ page, session }) => {
  await edit(page, session);
  await appearance(page).getByRole('radio', { name: /Compact/ }).check();
  await appearance(page).getByRole('radio', { name: 'Dark', exact: true }).check();
  const path = `**/api/v1/cards/${session.card.id}`;
  await page.route(path, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 401, json: { message: 'Unauthenticated.' } }) : route.continue());
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resume editing.' })).toBeVisible();
  await expect(appearance(page)).toBeHidden();
  expect((await stored(session)).template_key).toBe('minimal');
  await page.unroute(path);
  await page.getByRole('button', { name: 'Check session again' }).click();
  await expect(appearance(page).getByRole('radio', { name: /Compact/ })).toBeChecked();
  await expect(appearance(page).getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await appearance(page).getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Appearance saved.' })).toBeVisible();
  expect((await stored(session)).template_key).toBe('compact');
});
