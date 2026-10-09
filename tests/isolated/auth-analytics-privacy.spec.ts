import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

async function fixture(page:Page,url:string){
  await page.route('**/analytics-fixture*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>dummy@example.invalid</title><script src="/analytics.js"></script><script src="/product-analytics.js" defer></script><button>Sign in</button>'}));
  await page.goto(url);
}
for(const auth of ['?token_hash=dummy-hash&type=email&email=dummy@example.invalid','?code=dummy-code','#access_token=dummy-access&refresh_token=dummy-refresh&type=recovery'])test(`credential callback does not initialize analytics ${auth.split('=')[0]}`,async({page})=>{
  await fixture(page,'/analytics-fixture'+auth);
  expect(await page.evaluate(()=>({layer:(window as any).dataLayer||[],tags:document.querySelectorAll('script[src*="googletagmanager"]').length}))).toEqual({layer:[],tags:0});
  await page.evaluate(()=>{location.hash='profile';window.dispatchEvent(new HashChangeEvent('hashchange'))});await page.getByRole('button',{name:'Sign in'}).click();expect(await page.evaluate(()=>(window as any).dataLayer||[])).toEqual([]);
});
test('initial and virtual analytics use only known canonical sections, never query/hash/email/title',async({page})=>{
  await fixture(page,'/analytics-fixture?email=dummy@example.invalid#dummy-hash');
  await page.evaluate(()=>{location.hash='profile';window.dispatchEvent(new HashChangeEvent('hashchange'))});await page.getByRole('button',{name:'Sign in'}).click();
  await page.evaluate(()=>{history.replaceState({},'',location.pathname+'?email=dummy@example.invalid#access_token=dummy-access&refresh_token=dummy-refresh');window.dispatchEvent(new HashChangeEvent('hashchange'))});await page.getByRole('button',{name:'Sign in'}).click();
  const layer=await page.evaluate(()=>Array.from((window as any).dataLayer,(args:any)=>Array.from(args)));const serialized=JSON.stringify(layer);
  for(const secret of ['dummy@example.invalid','dummy-hash','dummy-access','dummy-refresh','access_token','refresh_token'])expect(serialized).not.toContain(secret);
  const config=layer.find((args:any)=>args[0]==='config')?.[2] as any;expect(config).toMatchObject({send_page_view:false,page_path:'/#home',page_title:'BrickCircle - home',page_location:`${new URL(page.url()).origin}/#home`});
  expect(layer.some((args:any)=>args[1]==='page_view'&&(args[2] as any).page_path==='/#profile')).toBe(true);
  expect(layer.filter((args:any)=>args[1]==='login_start').map((args:any)=>(args[2] as any).source)).toContain('profile');
});
