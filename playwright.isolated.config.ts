import { defineConfig } from '@playwright/test';

const loopbackBaseURL='http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/isolated',
  retries: 1,
  timeout: 30000,
  expect: {timeout: 7000},
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: loopbackBaseURL,
    reuseExistingServer: false
  },
  use: {
    baseURL: loopbackBaseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {name: 'chromium', use: {browserName: 'chromium'}},
    {name: 'firefox', use: {browserName: 'firefox'}},
    {name: 'webkit', use: {browserName: 'webkit'}}
  ]
});
