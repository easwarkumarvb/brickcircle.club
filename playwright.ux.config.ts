import {defineConfig,devices} from '@playwright/test';
const port=Number(process.env.BC_UX_PORT||4187);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid BC_UX_PORT');
if(process.env.BC_BASE_URL||process.env.BC_EXTERNAL_TEST_SERVER)throw Error('UX gates refuse external server overrides');
process.env.BC_UX_PORT=String(port);
const publicTests=/ux-public\.spec\.ts$/;
const journeys=/(registration-verification|confirmation-callback|collector-auth-design|owner-photo-camera|owner-photo-replacement|admin-console|canonical-exchange-review-fixes|person-conversation-read-model|ux-transport)\.spec\.ts$/;
export default defineConfig({
 testDir:'./tests',timeout:30000,expect:{timeout:7000},retries:0,workers:process.env.CI?2:undefined,
 reporter:[['list'],['html',{outputFolder:'ux-report/html',open:'never'}],['json',{outputFile:'ux-report/results.json'}]],
 outputDir:'ux-report/artifacts',
 use:{baseURL:`http://127.0.0.1:${port}`,serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure',video:'off'},
 webServer:{command:`node scripts/serve-isolated.mjs ${port}`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false},
 projects:[
  {name:'desktop-chromium',testMatch:publicTests,use:{...devices['Desktop Chrome']}},
  {name:'android-chromium',testMatch:publicTests,use:{...devices['Pixel 7']}},
  {name:'iphone-webkit',testMatch:publicTests,use:{...devices['iPhone 13']}},
  {name:'desktop-firefox',testMatch:publicTests,use:{...devices['Desktop Firefox']}},
  {name:'isolated-journeys',testMatch:journeys,use:{browserName:'chromium'}}
 ]
});
