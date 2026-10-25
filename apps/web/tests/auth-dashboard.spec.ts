import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function register(page: Page, email: string, password = 'BrowserTesting123!', confirmation = password) {
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Jamie Chen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(confirmation);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

test('registration, empty dashboard, authenticated redirects, logout and back protection', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('registration.png'), fullPage: true });
  await register(page, `browser-${randomUUID()}@example.com`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('You don’t have any cards yet.')).toBeVisible();
  await expect(page.getByText('Jamie Chen', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Jamie Chen', { exact: true })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('registration displays password and duplicate email errors', async ({ page, session }) => {
  await register(page, `invalid-${randomUUID()}@example.com`, 'short', 'different');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#password-error')).toContainText('confirmation');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('highlighted fields');
  await expect(page.getByRole('main').getByRole('alert')).toBeFocused();
  await register(page, session.email);
  await expect(page.locator('#email-error')).toContainText('already been taken');
  await expect(page).toHaveURL(/\/register$/);
});

test('invalid login, actual CSRF rejection recovery, login and keyboard access', async ({ page, session }, testInfo) => {
  await login(page, session.email, 'WrongPassword123!');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid email or password');
  let posts = 0;
  let rejected = 0;
  page.on('response', response => { if (response.url() === 'http://localhost:8011/login' && response.status() === 419) rejected++; });
  await page.route('http://localhost:8011/login', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    return route.continue(posts === 1 ? { headers: { ...route.request().headers(), 'x-xsrf-token': 'invalid-csrf-token' } } : undefined);
  });
  await page.getByLabel('Password', { exact: true }).fill(session.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(posts).toBe(2);
  expect(rejected).toBe(1);
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View public card/ })).toHaveAttribute('href', `/c/${session.card.slug}`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});

test('card pagination, unpublished labels and session expiry hide private data', async ({ page, session }) => {
  const ids: string[] = [];
  try {
    for (let index = 0; index < 15; index++) {
      const response = await session.mutate('POST', '/api/v1/cards', { slug: `extra-${randomUUID()}`, display_name: `Private card ${index}`, is_published: false });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).data.id);
    }
    await login(page, session.email, session.password);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await expect(page.getByText('Unpublished', { exact: true })).toHaveCount(15);
    await expect(page.getByRole('link', { name: /View public card/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
    // Invalidate the browser's real server session, then request another page.
    await page.request.get('http://localhost:8011/sanctum/csrf-cookie');
    const token = (await page.context().cookies()).find(cookie => cookie.name === 'XSRF-TOKEN')!.value;
    expect((await page.request.post('http://localhost:8011/logout', { headers: { Accept: 'application/json', Origin: 'http://localhost:3011', 'X-XSRF-TOKEN': decodeURIComponent(token) } })).status()).toBe(200);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toHaveCount(0);
  } finally { for (const id of ids) await session.mutate('DELETE', `/api/v1/cards/${id}`); }
});

test('switching accounts never shows the previous user’s cards', async ({ page, session }) => {
  await login(page, session.email, session.password);
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await register(page, `other-${randomUUID()}@example.com`);
  await expect(page.getByText('You don’t have any cards yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toHaveCount(0);
});

test('session and card loading failures can be retried', async ({ page, session }) => {
  await page.route('**/api/v1/me', route => route.abort());
  await page.goto('/login');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('check your session');
  await page.unroute('**/api/v1/me');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.route('**/api/v1/cards?*', route => route.abort());
  await page.getByLabel('Email', { exact: true }).fill(session.email);
  await page.getByLabel('Password', { exact: true }).fill(session.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'load your cards' })).toBeVisible();
  await page.unroute('**/api/v1/cards?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
});

test('repeated CSRF errors stop after one retry and throttling has helpful feedback', async ({ page, session }) => {
  let posts = 0;
  await page.route('http://localhost:8011/login', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    return route.continue({ headers: { ...route.request().headers(), 'x-xsrf-token': 'invalid-csrf-token' } });
  });
  await login(page, session.email, session.password);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('secure session changed');
  expect(posts).toBe(2);
  await page.unroute('http://localhost:8011/login');
  await page.route('http://localhost:8011/login', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': 'http://localhost:3011', 'access-control-allow-credentials': 'true' } }));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Too many attempts');
});

test('failed logout stays actionable and a successful logout clears another tab', async ({ page, context, session }) => {
  await login(page, session.email, session.password);
  await expect(page.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(other.getByRole('heading', { name: session.card.display_name, exact: true })).toBeVisible();
  await page.route('http://localhost:8011/logout', route => route.abort());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('reach the service');
  await page.unroute('http://localhost:8011/logout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(other).toHaveURL(/\/login$/);
  await expect(other.getByRole('heading', { name: session.card.display_name, exact: true })).toHaveCount(0);
  await other.close();
});

test('CORS accepts the configured frontend and rejects unrelated origins', async ({ request }) => {
  const options = { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-xsrf-token' };
  const allowed = await request.fetch('http://localhost:8011/login', { method: 'OPTIONS', headers: { ...options, Origin: 'http://localhost:3011' } });
  expect(allowed.headers()['access-control-allow-origin']).toBe('http://localhost:3011');
  expect(allowed.headers()['access-control-allow-credentials']).toBe('true');
  const denied = await request.fetch('http://localhost:8011/login', { method: 'OPTIONS', headers: { ...options, Origin: 'https://unrelated.example' } });
  // A single configured origin may be returned even for a disallowed request.
  // The browser denies access unless this value matches the requesting origin.
  expect(denied.headers()['access-control-allow-origin']).not.toBe('https://unrelated.example');
  expect(denied.headers()['access-control-allow-origin']).not.toBe('*');
});
