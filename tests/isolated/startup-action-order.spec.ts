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
    await expect(page.locator('.bc-toast')).not.toHaveText('Added to your wishlist.');
  });
}
