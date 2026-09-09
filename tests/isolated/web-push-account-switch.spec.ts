import {test,expect} from './fixtures';

async function mockExistingPush(page:any,permission='default'){
  await page.addInitScript((initialPermission:string)=>{
    const oldSubscription={endpoint:'https://push.example/shared-old',toJSON:()=>({endpoint:'https://push.example/shared-old',keys:{p256dh:'old-public-key-material-aaaaaaaa',auth:'old-auth-secret-aaaa'}}),unsubscribe:async()=>{(window as any).__push.unsubscribeCalls++;(window as any).__push.subscription=null;return true}};
    const freshSubscription={endpoint:'https://push.example/shared-fresh',toJSON:()=>({endpoint:'https://push.example/shared-fresh',keys:{p256dh:'new-public-key-material-aaaaaaaa',auth:'new-auth-secret-aaaa'}}),unsubscribe:async()=>true};
    (window as any).__push={subscribeCalls:0,unsubscribeCalls:0,subscription:oldSubscription};
    const notification={permission:initialPermission,requestPermission:async()=>{notification.permission='granted';return 'granted'}};
    Object.defineProperty(window,'Notification',{configurable:true,value:notification});
    Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
    const registration={pushManager:{getSubscription:async()=>(window as any).__push.subscription,subscribe:async()=>{(window as any).__push.subscribeCalls++;(window as any).__push.subscription=freshSubscription;return freshSubscription}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration,ready:Promise.resolve(registration),register:async()=>registration}});
  },permission);
}

test('rotates a browser push endpoint when another account already owns it',async({page})=>{
  await mockExistingPush(page);
  await page.goto('/v2.html?isolated=ready-one#home');

  await page.evaluate(()=>{
    const db:any=(window as any).BC_SUPABASE;
    const original=db.from.bind(db);
    let firstPushUpsert=true;
    db.from=(table:string)=>{
      const query:any=original(table);
      if(table==='push_subscriptions'){
        const originalUpsert=query.upsert?.bind(query);
        if(originalUpsert){
          query.upsert=async(...args:any[])=>{
            if(firstPushUpsert){firstPushUpsert=false;return {data:null,error:{code:'42501',message:'new row violates row-level security policy'}}}
            return originalUpsert(...args);
          };
        }
      }
      return query;
    };
  });

  await page.locator('[data-open="notifications"]').click();
  await page.locator('[data-enable-push]').click();
  await page.locator('[data-push-enable]').click();

  await expect.poll(()=>page.evaluate(()=>(window as any).__push.unsubscribeCalls)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).__push.subscribeCalls)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions[0].endpoint)).toBe('https://push.example/shared-fresh');
});

test('automatically reconciles an existing browser subscription after sign-in when permission is already granted',async({page})=>{
  await mockExistingPush(page,'granted');
  await page.goto('/v2.html?isolated=ready-one#home');

  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions[0].endpoint)).toBe('https://push.example/shared-old');
  expect(await page.evaluate(()=>(window as any).__push.subscribeCalls)).toBe(0);
});

test('sign-out detaches the account without destroying the browser push subscription',async({page})=>{
  await mockExistingPush(page,'granted');
  await page.goto('/v2.html?isolated=ready-one#profile');
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(1);

  await page.locator('[data-signout]').click();

  await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.pushSubscriptions.length)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__push.unsubscribeCalls)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__push.subscription?.endpoint)).toBe('https://push.example/shared-old');
});
