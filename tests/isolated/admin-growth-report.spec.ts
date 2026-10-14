import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const uid='12345678-1234-1234-1234-123456789012';
function report(days:number){
 const end=new Date('2026-10-14T12:00:00Z'),start=new Date('2026-10-14T00:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
 return {version:1,days,generated_at:end.toISOString(),start_at:start.toISOString(),end_at:end.toISOString(),previous_start_at:new Date(start.getTime()-(end.getTime()-start.getTime())).toISOString(),
 metrics:Object.fromEntries(['new_registrations','active_exchange_collectors','proposals','accepted','handoffs','completed_exchanges','repeat_collectors','cancellations'].map((k,i)=>[k,{current:days+i,previous:i}])),
 activation:{registered:days,email_verified:12,ready:4},exchange_cohort:{proposed:10,accepted:7,handed_off:5,completed:3,cancelled:1},health:{active_custody:2,overdue_returns:1,unresolved_issues:1,open_support:0},
 daily:Array.from({length:days},(_,i)=>({date:new Date(start.getTime()+i*86400000).toISOString().slice(0,10),registrations:i===0?days:0,completed_exchanges:i===0?days+5:0})),
 cities:[{country:'India',city:'  =HYPERLINK("https://example.invalid")',registered:8,ready:4,available_sets:9,completed_exchanges:3},{country:'India',city:'<img src=x onerror=alert(1)>',registered:2,ready:1,available_sets:3,completed_exchanges:0}],
 coverage:['Current snapshots; imported history may be incomplete.'],definitions:{ready:'Verified email, adult confirmation, locality, owner photo and wishlist.'}};
}
async function setup(page:Page){
 const requests:any[]=[];let failure=0,malformed=false;
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'${uid}'}}}}),getUser:async()=>({data:{user:{id:'${uid}'}}}),onAuthStateChange(fn){window.__authEvent=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})}})};`}));
 await page.route('**/functions/v1/admin-dashboard',async r=>{
  const body=r.request().postDataJSON();requests.push(body);
  if(failure){await r.fulfill({status:failure,json:{error:'Report temporarily unavailable.'}});return;}
  if(body.operation==='report'){
   const data:any=report(body.days);if(malformed)data.metrics.new_registrations.current=null;
   await r.fulfill({json:data});return;
  }
  await r.fulfill({json:{rows:[],total:0,summary:{},states:[],cities:[],generated_at:'2026-10-14T12:00:00Z'}});
 });
 await page.goto('/admin.html');await expect(page.locator('#dashboard')).toBeVisible();
 await page.locator('[data-section="growth"]').click();await expect(page.locator('#growth-content')).toContainText('Period comparison');
 return {requests,fail:(status:number)=>{failure=status},malformed:()=>{malformed=true}};
}
test('7, 28 and 90 day ranges preserve precise definitions and aggregate-only request contract',async({page})=>{
 const f=await setup(page);
 for(const days of [7,28,90]){
  await page.locator(`[data-range="${days}"]`).click();await expect(page.locator('#growth-meta')).toContainText('generated');
  await expect(page.locator(`[data-range="${days}"]`)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#export-report')).toBeEnabled();expect(f.requests.at(-1)).toEqual({operation:'report',version:1,days});
 }
 await expect(page.locator('#growth-content')).toContainText('adult confirmation');
 await expect(page.locator('#growth-content')).toContainText('Exchanges with unresolved issues');
 await expect(page.locator('#growth-content')).toContainText('No previous baseline');
 await expect(page.locator('#growth-content img')).toHaveCount(0);
});
test('mobile report controls and wide tables remain accessible at all supported widths',async({page},info)=>{
 await setup(page);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const days of [7,28,90])expect((await page.locator(`[data-range="${days}"]`).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  if(width===390)await page.screenshot({path:info.outputPath('growth-mobile.png'),fullPage:true});
 }
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
test('CSV export neutralizes whitespace-prefixed formula text and quotes values',async({page})=>{
 await setup(page);const pending=page.waitForEvent('download');await page.locator('#export-report').click();const download=await pending;
 expect(download.suggestedFilename()).toBe('brickcircle-growth-28-days.csv');const path=await download.path();expect(path).not.toBeNull();
 const csv=await fs.readFile(path!,'utf8');expect(csv).toContain("'  =HYPERLINK");expect(csv).toContain('""https://example.invalid""');expect(csv).toContain('Exchanges with unresolved issues');
});
test('refresh failure retains clearly stale context and disables export until recovery',async({page})=>{
 const f=await setup(page);f.fail(503);await page.locator('#refresh').click();await expect(page.locator('#status')).toContainText('Stale view');await expect(page.locator('#export-report')).toBeDisabled();
 f.fail(0);await page.locator('#refresh').click();await expect(page.locator('#export-report')).toBeEnabled();
});
for(const event of ['SIGNED_OUT','SIGNED_IN'])test(`report is erased immediately on ${event}`,async({page})=>{
 await setup(page);await page.evaluate(event=>(window as any).__authEvent(event,{user:{id:'another-user'}}),event);
 await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#growth-content')).toBeEmpty();await expect(page.locator('#growth-meta')).toBeEmpty();await expect(page.locator('#export-report')).toBeDisabled();
});
test('malformed metric counts are not fabricated as zero',async({page})=>{
 const f=await setup(page);f.malformed();await page.locator('[data-range="7"]').click();await expect(page.locator('#status')).toContainText('could not be verified');await expect(page.locator('#growth-content')).toBeEmpty();await expect(page.locator('#export-report')).toBeDisabled();
});
test('late old-range body cannot replace a freshly authorized range',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{const original=window.fetch;let hold=true;window.fetch=async(...args)=>{const response=await original(...args);if(hold&&String((args[1] as RequestInit)?.body).includes('"days":28')){hold=false;response.json=()=>new Promise(resolve=>(window as any).__lateReport=resolve);}return response;};});
 await page.locator('#refresh').click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__lateReport)).toBe('function');
 await page.locator('[data-range="7"]').click();await expect(page.locator('#export-report')).toBeEnabled();
 await page.evaluate(data=>(window as any).__lateReport(data),report(28));
 await expect(page.locator('[data-range="7"]')).toHaveAttribute('aria-pressed','true');
 const download=page.waitForEvent('download');await page.locator('#export-report').click();expect((await download).suggestedFilename()).toBe('brickcircle-growth-7-days.csv');
});
