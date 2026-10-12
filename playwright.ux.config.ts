import { defineConfig, devices } from '@playwright/test';

// UX gates always use a local isolated server. Never point mutating tests at the live site.
const port=Number(process.env.BC_UX_PORT||4187);
if (!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid BC_UX_PORT');
if (process.env.BC_BASE_URL||process.env.BC_EXTERNAL_TEST_SERVER)
  throw new Error('UX tests refuse external server overrides; use the dedicated isolated server');
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({
  testDir:'./tests/ux',
  timeout:30000,
  retries:process.env.CI?1:0,
  workers:process.env.CI?2:undefined,
  reporter:[['list'],['html',{outputFolder:'ux-report/html',open:'never'}],['json',{outputFile:'ux-report/results.json'}]],
  outputDir:'ux-report/artifacts',
  use:{baseURL,serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure',video:'off'},
  webServer:{command:`node scripts/serve-isolated.mjs ${port}`,url:baseURL,reuseExistingServer:false,timeout:30000},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'android-chromium',use:{...devices['Pixel 7']}},
    {name:'iphone-webkit',use:{...devices['iPhone 13']}},
    {name:'desktop-firefox',use:{...devices['Desktop Firefox']}}
  ]
});
