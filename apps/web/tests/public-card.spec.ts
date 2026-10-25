import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile, rm } from 'node:fs/promises';
import QRCode from 'qrcode';
import { test, expect, png } from './support/fixtures';

const site = 'http://localhost:3011';

test('renders public data, metadata, accessible controls, and downloadable contact and QR', async ({ page, context, session }, testInfo) => {
  const { card, mutate } = session;
  expect((await mutate('POST', `/api/v1/cards/${card.id}/links`, { type: 'website', label: 'Selected work', url: 'https://example.com/work' })).status()).toBe(201);
  await page.goto(`/c/${card.slug}`);
  await expect(page.getByRole('heading', { name: 'Alex Morgan', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Selected work/ })).toBeVisible();
  await expect(page).toHaveTitle('Alex Morgan | nought.one');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${site}/c/${card.slug}`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${site}/c/${card.slug}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${site}/c/${card.slug}/opengraph-image`);
  expect((await page.request.get(`/c/${card.slug}/opengraph-image`)).headers()['content-type']).toContain('image/png');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('public-card.png'), fullPage: true });

  await page.getByRole('button', { name: 'Save contact', exact: true }).focus();
  const contactDownload = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const contact = await contactDownload;
  expect(contact.suggestedFilename()).toBe(`${card.slug}.vcf`);
  const content = await readFile((await contact.path())!, 'utf8');
  expect(content).toContain('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Alex Morgan\r\n');
  expect(content).toContain('EMAIL:alex@example.com');
  expect(content).toContain(`URL:${site}/c/${card.slug}`);
  expect(content).not.toContain('/api/');
  await expect(page.getByRole('status').first()).toContainText('Contact downloaded');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Copy link/ }).click();
  await expect(page.getByRole('status').first()).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${site}/c/${card.slug}`);

  await page.getByRole('button', { name: /Show QR code/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  const qrDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download QR code' }).click();
  const qr = await qrDownload;
  const bytes = await readFile((await qr.path())!);
  const expectedQr = await QRCode.toBuffer(`${site}/c/${card.slug}`, { type: 'png', width: 768, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  expect(bytes.equals(expectedQr)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Show QR code/ })).toBeFocused();
});

test('publication and slug changes revoke old page and download URLs', async ({ page, session }) => {
  const { card, mutate } = session;
  const path = `/c/${card.slug}`;
  await page.goto(path);
  await expect(page.getByRole('heading', { name: card.display_name, exact: true })).toBeVisible();
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}`, { is_published: false })).status()).toBe(200);
  // An already-open page must not allow a stale contact download.
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('no longer available');
  await page.reload();
  await expect(page.getByRole('heading', { name: /This connection/ })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  for (const suffix of ['/contact.vcf', '/qr.png', '/opengraph-image']) expect((await page.request.get(path + suffix)).status()).toBe(404);
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}`, { is_published: true })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: card.display_name, exact: true })).toBeVisible();
  const newSlug = `${card.slug}-new`;
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}`, { slug: newSlug })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: /This connection/ })).toBeVisible();
  for (const suffix of ['/contact.vcf', '/qr.png', '/opengraph-image']) expect((await page.request.get(path + suffix)).status()).toBe(404);
  await page.goto(`/c/${newSlug}`);
  await expect(page.getByRole('heading', { name: card.display_name, exact: true })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${site}/c/${newSlug}`);
});

test('hidden links stay absent from the page and contact file after updates', async ({ page, session }) => {
  const { card, mutate } = session;
  const response = await mutate('POST', `/api/v1/cards/${card.id}/links`, { type: 'website', label: 'Private work', url: 'https://example.com/private', is_visible: false });
  const link = (await response.json()).data;
  await page.goto(`/c/${card.slug}`);
  await expect(page.getByRole('link', { name: /Private work/ })).toHaveCount(0);
  expect(await (await page.request.get(`/c/${card.slug}/contact.vcf`)).text()).not.toContain('https://example.com/private');
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}/links/${link.id}`, { is_visible: true })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('link', { name: /Private work/ })).toBeVisible();
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}/links/${link.id}`, { is_visible: false })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('link', { name: /Private work/ })).toHaveCount(0);
});

test('avatar and logo replacements refresh at stable URLs and revoke when unpublished', async ({ page, session }) => {
  const { card, mutate } = session;
  const urls: string[] = [];
  for (const type of ['avatar', 'logo']) {
    const result = await mutate('POST', `/api/v1/cards/${card.id}/assets`, undefined, { type, file: { name: `${type}.png`, mimeType: 'image/png', buffer: png('light') } });
    expect(result.status()).toBe(201);
    urls.push(`http://localhost:8011/api/v1/public/cards/${card.slug}/assets/${(await result.json()).data.id}`);
  }
  await page.goto(`/c/${card.slug}`);
  await expect(page.getByRole('img', { name: `Portrait of ${card.display_name}` })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Studio Morgan logo' })).toBeVisible();
  const before = await Promise.all(urls.map(async url => (await page.request.get(url)).body()));
  for (const type of ['avatar', 'logo']) expect((await mutate('POST', `/api/v1/cards/${card.id}/assets`, undefined, { type, file: { name: `${type}.png`, mimeType: 'image/png', buffer: png('dark') } })).status()).toBe(200);
  const received = urls.map(url => page.waitForResponse(response => response.url() === url));
  await page.reload();
  for (const [index, promise] of received.entries()) {
    const response = await promise;
    expect(response.headers()['cache-control']).toContain('no-store');
    expect((await response.body()).equals(before[index])).toBe(false);
  }
  expect((await mutate('PATCH', `/api/v1/cards/${card.id}`, { is_published: false })).status()).toBe(200);
  for (const url of urls) expect((await page.request.get(url)).status()).toBe(404);
});

test('clipboard denial has a keyboard-accessible manual fallback', async ({ page, session }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }));
  await page.goto(`/c/${session.card.slug}`);
  await page.getByRole('button', { name: /Copy link/ }).click();
  await expect(page.getByLabel('Card link', { exact: true })).toHaveValue(`${site}/c/${session.card.slug}`);
  await expect(page.getByRole('status').first()).toContainText('Select and copy');
});

test('unavailable cards render a readable error state', async ({ page }) => {
  await page.goto('/c/nonexistent-public-card');
  await expect(page.getByRole('heading', { name: /This connection/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save contact' })).toHaveCount(0);
});


test('temporary API outages show recovery feedback and downloads return 503', async ({ page, session }) => {
  const marker = `${process.cwd()}/tests/.runtime/public-api-unavailable`;
  await writeFile(marker, 'unavailable');
  try {
    await page.goto(`/c/${session.card.slug}`);
    await expect(page.getByRole('heading', { name: /We couldn’t/ })).toBeVisible();
    for (const suffix of ['/contact.vcf', '/qr.png', '/opengraph-image']) {
      const response = await page.request.get(`/c/${session.card.slug}${suffix}`);
      expect(response.status()).toBe(503);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
  } finally { await rm(marker, { force: true }); }
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
});
