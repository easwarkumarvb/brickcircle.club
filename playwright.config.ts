import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  retries: 1,
  timeout: 30000,
  expect: { timeout: 7000 },
  use: {
    baseURL: process.env.BC_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});
