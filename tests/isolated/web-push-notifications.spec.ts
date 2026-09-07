import fs from 'node:fs';
import {test,expect} from './fixtures';

async function mockPush(page:any,{existing=false,permission='default'}={}){
  await page.addInitScript(({existing,permission}:{existing:boolean;permission:string})=>{
    const subscription={endpoint:'https://push.example/device-1',toJSON:()=>({endpoint:'https://push.example/device-1',keys:{p256dh:'public-key-material-aaaaaaaa',auth:'auth-secret-aaaa'}}),unsubscribe:async()=>{(window as any).__push.unsubscribeCalls++;return true}};
    (window as any).__push={subscribeCalls:0,requestCalls:0,unsubscribeCalls:0,subscription:existing?subscription:null};
    const notification={permission,requestPermission:async()=>{(window as any).__push.requestCalls++;notification.permission='granted';return 'granted'}};
    Object.defineProperty(window,'Notification',{configurable:true,value:notification});
    Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
    const registration={pushManager:{getSubscription:async()=>(window as any).__push.subscription,subscribe:async(options:any)=>{(window as any).__push.subscribeCalls++;(window as any).__push.options=options;(window as any).__push.subscription=subscription;return subscription}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration,ready:Promise.resolve(registration),register:async()=>registration}});
  },{existing,permission});
}

test('meaningful signed-in engagement prompts, permission grant saves a subscription',async({page})=>{
  await mockPush(page);
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.locator('.bc-push-prompt')).toContainText('Get notified when a local match or exchange proposal arrives');
  await page.locator('[data-push-enable]').click();
  await expect(page.locator('.bc-push-prompt')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__push.subscribeCalls)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__push.options.userVisibleOnly)).toBe(true);
});

test('existing browser subscription is reused from notification settings',async({page})=>{
  await mockPush(page,{existing:true,permission:'granted'});
  await page.goto('/v2.html?isolated=ready-one#home');
  await page.locator('[data-open="notifications"]').click();
  await page.locator('[data-enable-push]').click();
  await page.locator('[data-push-enable]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__push.subscribeCalls)).toBe(0);
});

test('signed-out users are not prompted and sign-out removes device ownership',async({page})=>{
  await mockPush(page,{existing:true,permission:'granted'});
  await page.goto('/v2.html?isolated=ready-one#home');
  await page.locator('[data-open="notifications"]').click();
  await page.locator('[data-enable-push]').click();
  await page.locator('[data-push-enable]').click();
  await page.locator('[data-nav="profile"]').first().click();
  await page.locator('[data-signout]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__push.unsubscribeCalls)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(0);
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.locator('.bc-push-prompt')).toHaveCount(0);
});

test('durable reciprocal notification badge opens Matches and marks the row read',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#home');
  await page.evaluate(()=>(window as any).__bcIsolated.emitNotification({id:'match-note-1',user_id:'00000000-0000-4000-8000-000000000007',kind:'reciprocal_match',title:'You have a new local BrickCircle match',body:'A nearby collector has a reciprocal LEGO match with you.',actor_user_id:'00000000-0000-4000-8000-000000000099',entity_type:'reciprocal_match',entity_id:'match-event-1',metadata:{route:'#matches'},read_at:null,created_at:'2026-09-07T09:00:00.000Z'}));
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
  await page.locator('[data-open="notifications"]').click();
  await expect(page.locator('[data-note="match-note-1"]')).toContainText('View match');
  await page.locator('[data-note="match-note-1"]').click();
  await expect(page).toHaveURL(/#matches$/);
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveCount(0);
});

test('service worker displays and deep-links proposal and reciprocal-match pushes',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  const source=fs.readFileSync('catalogue-cache-sw.js','utf8');
  const result=await page.evaluate(async(source)=>{
    const listeners:Record<string,Function>={},shown:any[]=[],opened:string[]=[],navigated:string[]=[];
    const client={url:location.origin+'/v2.html#home',navigate:async(url:string)=>{navigated.push(url)},focus:async()=>true};
    const scope:any={location:{origin:location.origin},addEventListener:(type:string,handler:Function)=>{listeners[type]=handler},skipWaiting:()=>{},registration:{showNotification:async(title:string,options:any)=>shown.push({title,options})},clients:{claim:async()=>{},matchAll:async()=>[client],openWindow:async(url:string)=>opened.push(url)}};
    const cache={addAll:async()=>{},match:async()=>null,put:async()=>{}};
    const cachesMock={open:async()=>cache,keys:async()=>[] as string[],delete:async()=>true};
    new Function('self','caches',source)(scope,cachesMock);
    let pending:Promise<any>=Promise.resolve();
    const proposalEvent={data:{json:()=>({type:'exchange_proposal',title:'New exchange proposal',body:'Ramya proposed an exchange with you.',url:'/v2.html#exchanges/request-1',entity_id:'request-1'})},waitUntil:(promise:Promise<any>)=>{pending=promise}};
    listeners.push(proposalEvent);await pending;
    listeners.notificationclick({notification:{data:shown[0].options.data,close:()=>{}},waitUntil:(promise:Promise<any>)=>{pending=promise}});await pending;
    scope.clients.matchAll=async()=>[];
    listeners.push({data:{json:()=>({type:'reciprocal_match',title:'You have a match',body:'A collector nearby has a reciprocal match.',url:'/v2.html#matches',entity_id:'match-1'})},waitUntil:(promise:Promise<any>)=>{pending=promise}});await pending;
    listeners.notificationclick({notification:{data:shown[1].options.data,close:()=>{}},waitUntil:(promise:Promise<any>)=>{pending=promise}});await pending;
    return {shown,navigated,opened};
  },source);
  expect(result.shown).toHaveLength(2);
  expect(result.shown[0].options.tag).toBe('brickcircle:exchange_proposal:request-1');
  expect(result.navigated[0]).toContain('/v2.html#exchanges/request-1');
  expect(result.opened[0]).toContain('/v2.html#matches');
});

test('browser assets never contain the VAPID private secret',async()=>{
  for(const file of ['v2.html','app-v3.js','web-push-v1.js','web-push-config.js','catalogue-cache-sw.js']){
    const source=fs.readFileSync(file,'utf8');
    expect(source).not.toContain('VAPID_PRIVATE_KEY');
    expect(source).not.toMatch(/vapidPrivateKey/i);
  }
});
