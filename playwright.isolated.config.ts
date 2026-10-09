import { defineConfig } from '@playwright/test';

const port=Number(process.env.BC_ISOLATED_PORT||4173);
const loopbackBaseURL=`http://127.0.0.1:${port}`;
const externalServer=process.env.BC_EXTERNAL_TEST_SERVER==='1';

export default defineConfig({
  testDir: './tests/isolated',
  retries: 1,
  timeout: 30000,
  expect: {timeout: 7000},
  webServer: externalServer?undefined:{
    command: `node scripts/serve-isolated.mjs ${port}`,
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
