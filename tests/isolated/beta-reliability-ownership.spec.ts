import {test,expect} from './fixtures';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const Original=window.MutationObserver;
    const observations:any[]=[];
    const Instrumented=function(this:any,callback:MutationCallback){
      const observer=new Original(callback);
      const observe=observer.observe.bind(observer);
      observer.observe=(target:Node,options?:MutationObserverInit)=>{
        observations.push({target:target===document?'document':target===document.documentElement?'documentElement':target===document.body?'body':(target as Element).id||target.nodeName,options});
        return observe(target,options);
      };
      return observer;
    } as any;
    Instrumented.prototype=Original.prototype;
    Object.defineProperty(window,'MutationObserver',{configurable:true,value:Instrumented});
    (window as any).__observerInventory=observations;
  });
});

test('one runtime owns auth, notification subscription and root rendering',async({page})=>{
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.locator('.bc-guided-progress')).toBeVisible();
  const ownership=await page.evaluate(()=>({
    auth:window.__bcIsolated.metrics.authSubscriptions,
    channels:window.__bcIsolated.metrics.channelSubscriptions,
    broad:(window as any).__observerInventory.filter((entry:any)=>['document','documentElement','body','HTML'].includes(entry.target))
  }));
  expect.soft(ownership.auth,'auth subscriptions').toBe(1);
  expect.soft(ownership.channels,'realtime notification channels').toBe(1);
  expect.soft(ownership.broad,'document-wide MutationObservers').toHaveLength(0);
});

test('signed-in profile exposes the canonical support contact',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#profile');
  const support=page.locator('.bc-profile-card a[href="mailto:support@brickcircle.club"]');
  await expect(support).toHaveText('support@brickcircle.club');
});

test('latest rapid exchangeability intent wins delayed writes',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await page.evaluate(()=>{
    const db:any=window.BC_SUPABASE;
    const originalFrom=db.from.bind(db);
    db.from=(table:string)=>{
      const query:any=originalFrom(table);
      if(table!=='collection_items')return query;
      const originalUpdate=query.update.bind(query);
      query.update=(patch:any)=>{
        const result:any=originalUpdate(patch);
        if(Object.hasOwn(patch,'available_for_exchange')){
          const originalThen=result.then.bind(result);
          result.then=(resolve:any,reject:any)=>new Promise(done=>setTimeout(done,patch.available_for_exchange?180:10)).then(()=>originalThen(resolve,reject));
        }
        return result;
      };
      return query;
    };
  });
  const toggle=page.locator('[data-exchangeable]').first();
  await toggle.evaluate((element:HTMLInputElement)=>{
    element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));
    element.checked=false;element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForTimeout(450);
  expect(await page.evaluate(()=>window.__bcIsolated.collection[0].available_for_exchange)).toBe(false);
  await expect(page.locator('[data-exchangeable]').first()).not.toBeChecked();
});

test('a slower older refresh cannot replace newer profile state',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#profile');
  await expect(page.locator('.bc-profile-hero h1')).toHaveText('Isolated Collector');
  await page.evaluate(async()=>{
    const state=window.__bcIsolated,db:any=window.BC_SUPABASE,originalFrom=db.from.bind(db);
    let profileReads=0;
    db.from=(table:string)=>{
      const query:any=originalFrom(table);
      if(table!=='profiles')return query;
      const originalMaybeSingle=query.maybeSingle.bind(query);
      query.maybeSingle=()=>{
        const snapshot={...state.profile};
        const delay=++profileReads===1?180:10;
        return new Promise(resolve=>setTimeout(()=>resolve({data:snapshot,error:null}),delay));
      };
      return query;
    };
    state.profile={...state.profile,display_name:'Older response'};
    const older=window.bcV3Refresh();
    await new Promise(resolve=>setTimeout(resolve,20));
    state.profile={...state.profile,display_name:'Newest response'};
    const newer=window.bcV3Refresh();
    await Promise.all([older,newer]);
  });
  await expect(page.locator('.bc-profile-hero h1')).toHaveText('Newest response');
});

test('repeated route churn keeps runtime ownership stable',async({page})=>{
  const browserErrors:string[]=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>{
    const text=message.text();
    if(message.type()==='error'&&!text.startsWith('Failed to load resource:')&&!text.includes('Cross-Origin Request Blocked:'))browserErrors.push(text);
  });
  await page.goto('/v2.html?isolated=ready-one#home');
  await expect(page.locator('.bc-guided-progress')).toBeVisible();
  for(let cycle=0;cycle<12;cycle+=1){
    for(const route of ['browse','sets','matches','exchanges','home']){
      await page.evaluate(next=>{location.hash=`#${next}`},route);
      await page.waitForTimeout(35);
    }
  }
  const ownership=await page.evaluate(()=>(
    {auth:window.__bcIsolated.metrics.authSubscriptions,channels:window.__bcIsolated.metrics.channelSubscriptions}
  ));
  expect(ownership.auth).toBe(1);
  expect(ownership.channels).toBe(1);
  await expect(page.locator('#bc-main')).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});

declare global {
  interface Window {__bcIsolated:any;BC_SUPABASE:any;bcV3Refresh:()=>Promise<void>}
}
