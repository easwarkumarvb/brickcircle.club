import {test,expect} from './fixtures';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const headers=Object.fromEntries(config.headers.find((row:any)=>row.source==='/(.*)').headers.map((row:any)=>[row.key.toLowerCase(),row.value]));
async function applyHeaders(page:any){
 await page.addInitScript(()=>{(window as any).__cspViolations=[];document.addEventListener('securitypolicyviolation',event=>(window as any).__cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));});
 await page.route('**/v2.html*',async(route:any)=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),...headers}});});
}
test('configured response policy permits mobile marketplace and proposal controls',async({page})=>{
 await applyHeaders(page);await page.setViewportSize({width:390,height:844});
 const response=await page.goto('/v2.html?isolated=matched#home');expect(response?.headers()['x-content-type-options']).toBe('nosniff');
 await page.getByRole('button',{name:'View my match'}).first().click();await expect(page.getByRole('heading',{name:'Great matches'})).toBeVisible();
 await page.locator('.bc-match-premium').first().getByRole('button',{name:'View & propose'}).click();await expect(page.locator('#bc-inline-proposal')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__cspViolations)).toEqual([]);
});
test('configured policy blocks an unapproved script destination before execution',async({page})=>{
 await applyHeaders(page);await page.goto('/v2.html?isolated=matched#home');await expect(page.getByRole('button',{name:'View my match'}).first()).toBeVisible();
 await page.evaluate(()=>{const script=document.createElement('script');script.src='https://unapproved.example.invalid/probe.js';document.head.append(script);});
 await expect.poll(()=>page.evaluate(()=>(window as any).__cspViolations.some((row:any)=>row.directive.startsWith('script-src')&&row.blocked.includes('unapproved.example.invalid')))).toBe(true);
});
