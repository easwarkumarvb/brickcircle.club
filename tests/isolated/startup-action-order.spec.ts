import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/supabase-browser-mock.js','utf8');
const gatedProvider=mock+"(()=>{\n  const gate=window.__startupGate={started:false,completed:false};\n  const factory=window.supabase.createClient;\n  window.supabase.createClient=(...args)=>{\n    const db=factory(...args),rpc=db.rpc.bind(db);\n    db.rpc=async(name,args)=>{\n      if(name==='bc_record_auth_provider'){\n        gate.started=true;\n        await new Promise(resolve=>{gate.release=resolve});\n        const result=await rpc(name,args);\n        gate.completed=true;\n        return result;\n      }\n      return rpc(name,args);\n    };\n    return db;\n  };\n})();";

async function providerGate(page:any){
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4', (route:any)=>route.fulfill({contentType:'application/javascript',body:gatedProvider}));
}
test('startup finishes delayed provider bookkeeping before exposing usable controls',async({page})=>{
  await providerGate(page);
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>(window as any).__startupGate.started)).toBe(true);
  await page.locator('[data-nav="sets"]').first().click();
  await expect(page.locator('[data-change-photo]')).toHaveCount(0);
  await expect(page.locator('#bc-main')).toContainText('Opening BrickCircle');
  await page.evaluate(()=>(window as any).__startupGate.release());
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeVisible();
  await page.evaluate(()=>(window as any).__usableMain=document.getElementById('bc-main'));
  await page.locator('[data-change-photo="photo-item-1"]').click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  expect(await page.evaluate(()=>document.getElementById('bc-main')===(window as any).__usableMain)).toBe(true);
  expect(await page.evaluate(()=>(window as any).__startupGate.completed)).toBe(true);
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
});
test('a hidden transition during startup cannot replace a newly opened photo picker',async({page})=>{
  await providerGate(page);
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>(window as any).__startupGate.started)).toBe(true);
  await page.evaluate(()=>{
    const auth=(window as any).BC_SUPABASE.auth,original=auth.getSession.bind(auth);
    (window as any).__startupResumeChecks=0;
    auth.getSession=(...args:any[])=>{(window as any).__startupResumeChecks++;return original(...args)};
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.evaluate(()=>(window as any).__startupGate.release());
  const action=page.locator('[data-change-photo="photo-item-1"]');
  await expect(action).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  expect(await page.evaluate(()=>(window as any).__startupResumeChecks)).toBe(0);
  await action.click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
});
test('optional startup deadline permits entry without a late shell replacement',async({page})=>{
  await page.clock.install();
  await providerGate(page);
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>(window as any).__startupGate.started)).toBe(true);
  await expect(page.locator('[data-change-photo]')).toHaveCount(0);
  await page.clock.fastForward(8001);
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.locator('[data-change-photo="photo-item-1"]').click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
  await page.evaluate(()=>{
    (window as any).__deadlineMain=document.getElementById('bc-main');
    (window as any).__deadlinePicker=document.getElementById('bc-owner-photo-form');
  });
  await page.evaluate(()=>(window as any).__startupGate.release());
  await expect.poll(()=>page.evaluate(()=>(window as any).__startupGate.completed)).toBe(true);
  expect(await page.evaluate(()=>document.getElementById('bc-main')===(window as any).__deadlineMain)).toBe(true);
  expect(await page.evaluate(()=>document.getElementById('bc-owner-photo-form')===(window as any).__deadlinePicker)).toBe(true);
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
});
for(const destination of ['profile','signout'] as const){
  test('delayed wishlist completion preserves newer '+destination+' view',async({page})=>{
    await page.goto('/v2.html?isolated=empty#browse');
    await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
    const wish=page.locator('[data-set="42143-1"] [data-want]');
    await expect(wish).toBeVisible();
    await page.evaluate(()=>{
      const gate:any={started:false};
      (window as any).__wishlistGate=gate;
      const db=(window as any).BC_SUPABASE,from=db.from.bind(db);
      db.from=(table:string)=>{
        const query=from(table);
        if(table==='wishlists'){
          const insert=query.insert.bind(query);
          query.insert=(...args:any[])=>{
            const response=insert(...args);
            gate.started=true;
            return Promise.resolve(response).then(async result=>{
              await new Promise(resolve=>{gate.release=resolve});
              return result;
            });
          };
        }
        return query;
      };
      const button=document.querySelector<HTMLButtonElement>('[data-set="42143-1"] [data-want]')!;
      const handler=button.onclick!;
      button.onclick=function(event){
        gate.action=handler.call(this,event);
        if(!gate.action||typeof gate.action.then!=='function')throw new Error('Wishlist handler did not return its operation promise');
        return gate.action;
      };
    });
    await wish.click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__wishlistGate.started)).toBe(true);
    await expect.poll(()=>page.evaluate(()=>typeof (window as any).__wishlistGate.action?.then)).toBe('function');
    await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.wishlist.some((row:any)=>row.set_number==='42143-1'))).toBe(true);
    if(destination==='profile'){
      await page.locator('[data-nav="profile"]').first().click();
      await expect(page.locator('.bc-profile-hero h1')).toHaveText('Isolated Collector');
    }else{
      await page.evaluate(()=>(window as any).bcSignOut());
      await expect(page.locator('.bc-signin')).toBeVisible();
    }
    await page.evaluate(()=>(window as any).__newView=document.querySelector('#bc-main .bc-page'));
    await page.evaluate(async()=>{const gate=(window as any).__wishlistGate;gate.release();await gate.action;});
    expect(await page.evaluate(()=>document.querySelector('#bc-main .bc-page')===(window as any).__newView)).toBe(true);
    if(destination==='profile')await expect(page.locator('.bc-profile-hero h1')).toHaveText('Isolated Collector');
    else await expect(page.locator('.bc-signin')).toBeVisible();
    await expect(page.locator('.bc-toast').filter({hasText:'Added to your wishlist.'})).toHaveCount(0);
  });
}

test('ordinary focus preserves the active picker without starting another authentication hydration',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.locator('[data-change-photo="photo-item-1"]').click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
  const audit=await page.evaluate(()=>{
    const auth=(window as any).BC_SUPABASE.auth,original=auth.getSession.bind(auth);
    let calls=0;auth.getSession=(...args:any[])=>{calls++;return original(...args)};
    const main=document.getElementById('bc-main'),picker=document.getElementById('bc-owner-photo-form');
    for(let n=0;n<3;n++)window.dispatchEvent(new Event('focus'));
    return {calls,mainUnchanged:main===document.getElementById('bc-main'),pickerUnchanged:picker===document.getElementById('bc-owner-photo-form')};
  });
  expect(audit).toEqual({calls:0,mainUnchanged:true,pickerUnchanged:true});
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
});

test('concurrent genuine resume events share one authentication validation and preserve the recovery grace',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    const auth=(window as any).BC_SUPABASE.auth,original=auth.getSession.bind(auth);
    const gate:any={calls:0};(window as any).__resumeGate=gate;
    auth.getSession=()=>{
      gate.calls++;const captured=original();
      return new Promise(resolve=>{gate.release=()=>resolve(captured)});
    };
    (window as any).__resumeMain=document.getElementById('bc-main');
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(await page.evaluate(()=>(window as any).__resumeGate.calls)).toBe(1);
  await page.evaluate(()=>(window as any).__resumeGate.release());
  await expect.poll(()=>page.evaluate(()=>document.getElementById('bc-main')!==(window as any).__resumeMain)).toBe(true);
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeVisible();
  const calls=await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return (window as any).__resumeGate.calls});
  expect(calls).toBe(1);
});

test('a newer hidden transition retires the old resume response even at the same clock timestamp',async({page})=>{
  await page.clock.install();
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    const auth=(window as any).BC_SUPABASE.auth,original=auth.getSession.bind(auth);
    const gate:any={calls:0,releases:[]};(window as any).__resumeGate=gate;
    auth.getSession=()=>{gate.calls++;const captured=original();return new Promise(resolve=>gate.releases.push(()=>resolve(captured)))};
    (window as any).__resumeMain=document.getElementById('bc-main');
    window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('focus'));
  });
  expect(await page.evaluate(()=>(window as any).__resumeGate.calls)).toBe(2);
  await page.evaluate(async()=>{
    (window as any).__resumeGate.releases[0]();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  });
  expect(await page.evaluate(()=>document.getElementById('bc-main')===(window as any).__resumeMain)).toBe(true);
  await page.evaluate(()=>(window as any).__resumeGate.releases[1]());
  await expect.poll(()=>page.evaluate(()=>document.getElementById('bc-main')!==(window as any).__resumeMain)).toBe(true);
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeVisible();
});

test('a hidden transition during authenticated hydration cannot replace the active shell',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    const auth=(window as any).BC_SUPABASE.auth,original=auth.getUser.bind(auth);
    const gate:any={calls:0};(window as any).__hydrationGate=gate;
    auth.getUser=()=>{gate.calls++;if(gate.calls!==1)return original();const captured=original();return new Promise(resolve=>gate.release=()=>resolve(captured))};
    (window as any).__resumeMain=document.getElementById('bc-main');
    window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).__hydrationGate.calls)).toBe(1);
  await page.evaluate(async()=>{
    window.dispatchEvent(new Event('pagehide'));
    (window as any).__hydrationGate.release();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  });
  expect(await page.evaluate(()=>document.getElementById('bc-main')===(window as any).__resumeMain)).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>document.getElementById('bc-main')!==(window as any).__resumeMain)).toBe(true);
});

test('confirmed missing authentication on genuine resume clears the protected shell',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.locator('[data-change-photo="photo-item-1"]').click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
  await page.evaluate(()=>(window as any).__privateOverlay=document.getElementById('bc-overlay'));
  await page.evaluate(()=>{
    (window as any).BC_SUPABASE.auth.getUser=async()=>({data:{user:null},error:{name:'AuthSessionMissingError',message:'Auth session missing'}});
    window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.bc-signin')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__privateOverlay.isConnected)).toBe(false);
  await expect(page.locator('#bc-owner-photo-form')).toHaveCount(0);
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toHaveCount(0);
});

const gatedSigning=mock+"(()=>{\n const factory=window.supabase.createClient;\n window.supabase.createClient=(...args)=>{\n  const db=factory(...args),gate=window.__signingGate={calls:0,releases:[],released:false,outcome:'success'};\n  if(new URLSearchParams(location.search).get('isolated')==='matched'){\n   window.__bcIsolated.collection.push({id:'other-item-1',user_id:'00000000-0000-4000-8000-000000000099',set_number:'42143-1',available_for_exchange:true,owner_photo_path:'00000000-0000-4000-8000-000000000099/match-owner.jpg'});\n  }\n  const storage=db.storage.from.bind(db.storage);\n  db.storage.from=bucket=>{\n   const api=storage(bucket);\n   if(bucket==='collection-photos')api.createSignedUrl=async()=>{\n    gate.calls++;\n    if(!gate.released)await new Promise(resolve=>gate.releases.push(resolve));\n    return gate.outcome==='denied'?{data:null,error:{message:'Photo unavailable'}}:{data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='},error:null};\n   };\n   return api;\n  };\n  return db;\n };\n})();";
async function signingGate(page:any,view:'collection'|'match',outcome='success'){
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(route:any)=>route.fulfill({contentType:'application/javascript',body:gatedSigning}));
  await page.goto(view==='collection'?'/v2.html?isolated=photo-replace#sets':'/v2.html?isolated=matched#matches');
  await expect.poll(()=>page.evaluate(()=>(window as any).__signingGate.calls)).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  if(view==='match')expect(await page.evaluate(()=>(window as any).__bcIsolated.queries.some((query:any)=>query.table==='collection_items'&&query.filters.some((filter:any[])=>filter[0]==='id'&&filter[1]==='other-item-1')&&query.filters.some((filter:any[])=>filter[0]==='user_id'&&filter[1]==='00000000-0000-4000-8000-000000000099')&&query.filters.some((filter:any[])=>filter[0]==='available_for_exchange'&&filter[1]===true)))).toBe(true);
  if(view==='match'&&await page.locator('[data-dismiss-match]').count())await page.locator('[data-dismiss-match]').click();
  await page.evaluate((value:string)=>(window as any).__signingGate.outcome=value,outcome);
}
async function releaseSigning(page:any){
  await page.evaluate(()=>{const gate=(window as any).__signingGate;gate.released=true;for(const release of gate.releases)release();});
}
for(const width of [320,390,1280])for(const view of ['collection','match'] as const)
test(`signed gallery hydration preserves ${view} controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await signingGate(page,view);
  const action=page.locator(view==='collection'?'[data-change-photo="photo-item-1"]':'[data-propose]').first();
  await expect(action).toBeVisible();
  await action.scrollIntoViewIfNeeded();
  const before=await action.boundingBox();expect(before).not.toBeNull();
  await releaseSigning(page);
  const image=page.locator(view==='collection'?'[data-owner-gallery="photo-item-1"] [data-photo-angle="front"] img':'[data-owner-proof-preview] img').first();
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  const after=await action.boundingBox();expect(after).not.toBeNull();
  expect(after!.x).toBeCloseTo(before!.x,1);
  expect(after!.y).toBeCloseTo(before!.y,1);
  await action.click();
  await expect(page.locator(view==='collection'?'#bc-owner-photo-form':'#bc-inline-proposal')).toBeVisible();
});
for(const view of ['collection','match'] as const)test(`photo signing denial preserves ${view} action geometry`,async({page})=>{
  await page.setViewportSize({width:390,height:1000});
  await signingGate(page,view,'denied');
  const action=page.locator(view==='collection'?'[data-change-photo="photo-item-1"]':'[data-propose]').first();
  await action.scrollIntoViewIfNeeded();
  const before=await action.boundingBox();expect(before).not.toBeNull();
  await releaseSigning(page);
  await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  const after=await action.boundingBox();expect(after).not.toBeNull();
  expect(after!.y).toBeCloseTo(before!.y,1);
  if(view==='match')await expect(page.locator('[data-owner-proof-preview]')).toHaveText('Owner photo unavailable');
  await action.click();
  await expect(page.locator(view==='collection'?'#bc-owner-photo-form':'#bc-inline-proposal')).toBeVisible();
});
for(const view of ['collection','match'] as const)test(`one ${view} action works while photo signing remains pending`,async({page})=>{
  await page.setViewportSize({width:390,height:1000});
  await signingGate(page,view);
  await page.locator(view==='collection'?'[data-change-photo="photo-item-1"]':'[data-propose]').first().click();
  const form=page.locator(view==='collection'?'#bc-owner-photo-form':'#bc-inline-proposal');
  await expect(form).toBeVisible();
  await page.evaluate(()=>(window as any).__pendingPhotoForm=document.querySelector('#bc-owner-photo-form,#bc-inline-proposal'));
  await releaseSigning(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__signingGate.released)).toBe(true);
  await expect(form).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('#bc-owner-photo-form,#bc-inline-proposal')===(window as any).__pendingPhotoForm)).toBe(true);
});
