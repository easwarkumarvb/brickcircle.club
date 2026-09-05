import { defineConfig } from '@playwright/test';

const loopbackBaseURL='http://127.0.0.1:4173';
const externalServer=process.env.BC_EXTERNAL_TEST_SERVER==='1';

export default defineConfig({
  testDir: './tests/isolated',
  retries: 1,
  timeout: 30000,
  expect: {timeout: 7000},
  webServer: externalServer?undefined:{
    command: 'node scripts/serve-isolated.mjs 4173',
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
