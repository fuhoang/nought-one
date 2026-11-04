import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';

function emailUrl(email: string, kind: 'reset' | 'verify'): string {
  const key = createHash('sha256').update(email).digest('hex');
  return JSON.parse(readFileSync(`tests/.runtime/${key}-${kind}.json`, 'utf8')).url;
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('forgot password preserves input on failure and provides accessible confirmation and cooldown', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get you back.' })).toBeVisible();
  await page.route('**/forgot-password', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('unknown@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('reach the service');
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('unknown@example.com');
  await expect(page.getByRole('main').getByRole('alert')).toBeFocused();
  await page.unroute('**/forgot-password');
  await page.getByRole('button', { name: 'Send reset link' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('If an account matches');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('forgot-password.png'), fullPage: true });
});

test('emailed reset link changes password, revokes existing sessions and cannot be reused', async ({ page, browser, session }, testInfo) => {
  await login(page, session.email, session.password);
  const recovery = await browser.newContext();
  const resetPage = await recovery.newPage();
  let changed = false;
  try {
    expect((await session.mutate('POST', '/forgot-password', { email: session.email })).status()).toBe(200);
    const url = emailUrl(session.email, 'reset');
    expect(url).toMatch(/^http:\/\/localhost:3011\/reset-password\?/);
    const response = await resetPage.goto(url);
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['cache-control']).toContain('no-store');
    await expect(resetPage.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(session.email);
    await resetPage.getByLabel('New password', { exact: true }).fill('short');
    await resetPage.getByLabel('Confirm password', { exact: true }).fill('short');
    await resetPage.getByRole('button', { name: 'Reset password' }).click();
    await expect(resetPage.getByLabel('New password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(resetPage.getByLabel('New password', { exact: true })).toHaveValue('short');
    await resetPage.getByLabel('New password', { exact: true }).fill('NewBrowserPassword123!');
    await resetPage.getByLabel('Confirm password', { exact: true }).fill('NewBrowserPassword123!');
    await resetPage.route('**/reset-password', route => route.request().method() === 'POST' ? route.abort() : route.continue());
    await resetPage.getByRole('button', { name: 'Reset password' }).click();
    await expect(resetPage.getByRole('main').getByRole('alert')).toContainText('reach the service');
    await expect(resetPage.getByLabel('New password', { exact: true })).toHaveValue('NewBrowserPassword123!');
    await resetPage.unroute('**/reset-password');
    expect((await new AxeBuilder({ page: resetPage }).analyze()).violations).toEqual([]);
    await resetPage.screenshot({ path: testInfo.outputPath('reset-password.png'), fullPage: true });
    await resetPage.getByRole('button', { name: 'Reset password' }).click();
    await expect(resetPage.getByRole('status')).toContainText('Password reset');
    changed = true;
    await expect(resetPage).toHaveURL('http://localhost:3011/reset-password');
    expect((await session.api.get('/api/v1/me')).status()).toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await resetPage.goto(url);
    await resetPage.getByLabel('New password', { exact: true }).fill('DifferentPassword123!');
    await resetPage.getByLabel('Confirm password', { exact: true }).fill('DifferentPassword123!');
    await resetPage.getByRole('button', { name: 'Reset password' }).click();
    await expect(resetPage.getByText('This reset link is invalid or has expired.', { exact: false })).toBeVisible();
    await login(resetPage, session.email, 'NewBrowserPassword123!');
    await expect(resetPage.getByRole('heading', { name: session.card.display_name })).toBeVisible();
  } finally {
    if (changed) await session.mutate('POST', '/login', { email: session.email, password: 'NewBrowserPassword123!' });
    await recovery.close();
  }
});

test('verification email survives sign-in in another tab and updates dashboard status', async ({ page, context, session }, testInfo) => {
  const url = emailUrl(session.email, 'verify');
  expect(url).toMatch(/^http:\/\/localhost:3011\/verify-email\?/);
  await page.goto(url);
  await expect(page.getByRole('link', { name: 'Sign in in a new tab' })).toBeVisible();
  const signedIn = await context.newPage();
  await login(signedIn, session.email, session.password);
  await page.bringToFront();
  await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('verify-email.png'), fullPage: true });
  await page.getByRole('button', { name: 'Verify email', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Your email is verified');
  await page.getByRole('link', { name: 'Go to your cards' }).click();
  await expect(page.getByText('Email verified.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
  await signedIn.close();
});

test('tampered verification link and resend failures remain actionable', async ({ page, session }) => {
  await login(page, session.email, session.password);
  const url = new URL(emailUrl(session.email, 'verify'));
  url.searchParams.set('signature', '0'.repeat(64));
  await page.goto(url.href);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('expired, was changed, or belongs to a different account');
  await page.route('**/email/verification-notification', route => route.abort());
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByRole('region', { name: 'Email verification' }).getByRole('alert')).toContainText('reach the service');
  await page.unroute('**/email/verification-notification');
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByRole('status')).toContainText('Verification email sent');
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeDisabled();
});

test('recovery rate limits and incomplete links give clear feedback', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByText('This reset link is missing or incomplete.')).toBeVisible();
  await page.getByRole('link', { name: 'Request a new reset link' }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('unknown@example.com');
  await page.route('http://localhost:8011/forgot-password', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': 'http://localhost:3011', 'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'Retry-After', 'Retry-After': '90' } }));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Too many attempts');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
  await expect(page.getByText(/Try again in \d+ seconds/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('unknown@example.com');
});
