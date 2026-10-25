import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:3011', trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node tests/support/start-api.mjs', url: 'http://localhost:8011/up', reuseExistingServer: false, timeout: 60000 },
    { command: 'npm run start -- --port 3011 --hostname localhost', url: 'http://localhost:3011', reuseExistingServer: false, timeout: 60000,
      env: { API_BASE_URL: 'http://localhost:8011', PUBLIC_SITE_URL: 'http://localhost:3011' } },
  ],
});
