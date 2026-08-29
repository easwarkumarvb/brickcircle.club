import { test, expect } from '@playwright/test';
import path from 'node:path';

const appPath=path.resolve('app-v3.js');
const authHotfixPath=path.resolve('v3-auth-onboarding-hotfix.js');
const catalogSearchPath=path.resolve('catalog-search-v32.js');

function collectErrors(page:any){
  const errors:string[]=[];
  page.on('pageerror',(e:any)=>errors.push(`pageerror:${e.message}`));
  page.on('console',(m:any)=>{if(m.type()==='error')errors.push(`console:${m.text()}`)});
  return errors;
}

function materialErrors(errors:string[]){
  return errors.filter(e=>!/favicon|Failed to load resource.*404/i.test(e));
}

test('production mobile homepage is stable and has no horizontal overflow', async ({page})=>{
  const errors=collectErrors(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toContainText(/BrickCircle/i);
  await expect(page.locator('a[href="/v2.html?join=1"]').first()).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(materialErrors(errors)).toEqual([]);
});

test('Join free opens the auth UX promptly on mobile', async ({page})=>{
  const errors=collectErrors(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const start=Date.now();
  await page.locator('a[href="/v2.html?join=1"]').first().click();
  await expect(page.locator('#bc-overlay')).toBeVisible({timeout:5000});
  await expect(page.locator('#bc-overlay')).toContainText(/Join BrickCircle/i);
  expect(Date.now()-start).toBeLessThan(5000);
  const box=await page.locator('.bc-modal').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.width||9999)).toBeLessThanOrEqual(390);
  expect(materialErrors(errors)).toEqual([]);
});

test('100 synthetic mobile visitors can enter Join free without a blank screen', async ({browser})=>{
  test.setTimeout(180000);
  const failures:string[]=[];
  for(let batch=0;batch<10;batch++){
    await Promise.all(Array.from({length:10},async(_,j)=>{
      const n=batch*10+j+1;
      const ctx=await browser.newContext({viewport:{width:390,height:844}});
      const page=await ctx.newPage();
      const errors=collectErrors(page);
      try{
        await page.goto('/',{waitUntil:'domcontentloaded',timeout:20000});
        await page.locator('a[href="/v2.html?join=1"]').first().click({timeout:7000});
        await page.locator('#bc-overlay').waitFor({state:'visible',timeout:7000});
        const text=await page.locator('#bc-overlay').innerText();
        if(!/Join BrickCircle/i.test(text))failures.push(`#${n}: wrong join content`);
        const significant=materialErrors(errors);
        if(significant.length)failures.push(`#${n}: ${significant.join(' | ')}`);
      }catch(e:any){failures.push(`#${n}: ${e.message}`)}
      try{await ctx.close()}catch(_){ }
    }));
  }
  expect(failures).toEqual([]);
});

test('production catalogue accepts product-name search', async ({page})=>{
  const errors=collectErrors(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html#browse',{waitUntil:'domcontentloaded'});
  const input=page.locator('#bc-q');
  await expect(input).toBeVisible({timeout:10000});
  await input.fill('McLaren');
  await expect(page.locator('#bc-cat-status')).toContainText(/McLaren/i,{timeout:10000});
  await expect(page.locator('#bc-set-grid')).toContainText(/McLaren/i,{timeout:10000});
  await expect(page.locator('#bc-set-grid article').first()).toBeVisible();
  expect(materialErrors(errors)).toEqual([]);
});

test('PWA manifest and service worker are release-ready', async ({request})=>{
  const manifestRes=await request.get('/manifest.webmanifest');
  expect(manifestRes.ok()).toBeTruthy();
  const manifest=await manifestRes.json();
  expect(manifest.name).toMatch(/BrickCircle/i);
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toMatch(/v2\.html/);
  expect(manifest.icons?.length).toBeGreaterThan(0);
  const swRes=await request.get('/catalogue-cache-sw.js');
  expect(swRes.ok()).toBeTruthy();
  const sw=await swRes.text();
  expect(sw).toContain('brickcircle-shell-');
  expect(sw).toContain('/v2.html');
});

test('Google sign-in hands off to the Supabase OAuth authorize URL', async ({page})=>{
  const errors=collectErrors(page);
  // A same-document hash handoff lets this test verify the call contract before
  // an actual OAuth navigation replaces the JavaScript execution context.
  const oauthUrl='https://qa.brickcircle.test/auth#oauth-start';
  await page.route('https://qa.brickcircle.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<button class="bc-auth-provider google" data-oauth="google">Continue with Google</button>'}));
  await page.goto('https://qa.brickcircle.test/auth');
  await page.evaluate((url)=>{
    (window as any).__oauthCalled=false;
    (window as any).supabase={createClient:()=>({
      auth:{
        getUser:async()=>({data:{user:null},error:null}),
        signInWithOAuth:async(options:any)=>{
          (window as any).__oauthCalled=options?.provider==='google'&&options?.options?.skipBrowserRedirect===true;
          return {data:{url},error:null};
        }
      },
      from:()=>({upsert:async()=>({error:null})})
    })};
  },oauthUrl);
  await page.addScriptTag({path:authHotfixPath});
  await page.locator('button').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__oauthCalled),{timeout:3000}).toBeTruthy();
  await expect(page).toHaveURL(oauthUrl,{timeout:3000});
  expect(materialErrors(errors)).toEqual([]);
});

test('signed-in collector can add, wishlist, mark exchangeable, match and propose through UX', async ({page})=>{
  test.setTimeout(30000);
  const errors=collectErrors(page);
  await page.setViewportSize({width:390,height:844});
  await page.setContent('<div id="bc-root"></div>');
  await page.evaluate(()=>{
    const user={id:'00000000-0000-4000-8000-000000000007',email:'qa@example.invalid',created_at:new Date().toISOString(),app_metadata:{provider:'google'},identities:[{provider:'google'}]};
    const profile={id:user.id,display_name:'QA Collector',email:user.email,country:'India',city:'Bengaluru',bio:'',avatar_url:null,rating:0,review_count:0,identity_verified:false,member_since:new Date().toISOString(),created_at:new Date().toISOString()};
    const sets=[
      {set_number:'42172',name:'McLaren P1',theme:'Technic',year:2024,piece_count:3893,estimated_value:450,catalog_active:true},
      {set_number:'42143',name:'Ferrari Daytona SP3',theme:'Technic',year:2022,piece_count:3778,estimated_value:450,catalog_active:true}
    ];
    const state:any={collection:[],wishlist:[],requests:[],sets};
    (window as any).__qaState=state;
    (window as any).BC_LOCATIONS={India:['Bengaluru','Mumbai','Delhi']};
    const chain=(table:string)=>{
      const q:any={table,filters:[],patch:null,mode:'select',
        select(){return q},eq(k:string,v:any){q.filters.push([k,v]);return q},or(){return q},order(){return q},limit(){return q},range(){return q},in(k:string,v:any[]){q.filters.push([k,v]);return q},is(){return q},
        update(p:any){q.mode='update';q.patch=p;return q},delete(){q.mode='delete';return q},
        insert(p:any){const rows=Array.isArray(p)?p:[p];if(table==='collection_items')for(const r of rows){if(!state.collection.some((x:any)=>x.set_number===r.set_number))state.collection.push({id:`c${state.collection.length+1}`,user_id:user.id,set_number:r.set_number,available_for_exchange:false,created_at:new Date().toISOString()})}if(table==='wishlists')for(const r of rows){if(!state.wishlist.some((x:any)=>x.set_number===r.set_number))state.wishlist.push({id:`w${state.wishlist.length+1}`,user_id:user.id,set_number:r.set_number,priority:r.priority||3,created_at:new Date().toISOString()})}if(table==='exchange_requests')for(const r of rows)state.requests.push({id:`r${state.requests.length+1}`,...r,status:'pending',created_at:new Date().toISOString()});return Promise.resolve({data:null,error:null})},
        maybeSingle:async()=>({data:table==='profiles'?profile:null,error:null}),
        then(resolve:any){let data:any=[];if(table==='profiles')data=[profile];else if(table==='collection_items')data=state.collection.map((x:any)=>({...x,lego_sets:sets.find((s:any)=>s.set_number===x.set_number)}));else if(table==='wishlists')data=state.wishlist.map((x:any)=>({...x,lego_sets:sets.find((s:any)=>s.set_number===x.set_number)}));else if(table==='exchange_requests')data=state.requests;else if(table==='lego_sets')data=sets;else if(table==='public_profiles')data=[{id:'00000000-0000-4000-8000-000000000099',display_name:'Match Collector',country:'India',city:'Bengaluru',rating:5,review_count:3,identity_verified:false,member_since:new Date().toISOString(),founding_member_number:9}];
          if(q.mode==='update'&&table==='collection_items'){for(const x of state.collection){if(q.filters.every(([k,v]:any[])=>x[k]===v))Object.assign(x,q.patch)}data=null}
          return Promise.resolve({data,error:null}).then(resolve)}
      };return q;
    };
    const db={
      auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),signInWithPassword:async()=>({error:null}),signUp:async()=>({data:{session:null},error:null}),resetPasswordForEmail:async()=>({error:null})},
      from:(t:string)=>chain(t),
      rpc:async(name:string,args:any)=>{
        if(name==='bc_founder_status')return {data:{my_is_founder:true,my_number:7},error:null};
        if(name==='bc_liquidity_status')return {data:{collection_count:state.collection.length,exchangeable_count:state.collection.filter((x:any)=>x.available_for_exchange).length,wishlist_count:state.wishlist.length,referral_claims:1,liquidity_readiness:80,city_members:20,city_exchangeable_sets:50,city_wishlist_items:70},error:null};
        if(name==='bc_membership_status')return {data:{founding_remaining:94,early_remaining:900,my_tier:'founding',my_number:7,my_access:'free_lifetime',beta_free:true,my_city:'Bengaluru',my_country:'India',city_members:20,city_exchangeable_sets:50,city_wishlist_items:70,city_min_members:100,city_min_exchangeable_sets:200,city_min_wishlist_items:300,city_pricing_eligible:false,city_pricing_enabled:false},error:null};
        if(name==='bc_record_auth_provider'||name==='bc_claim_referral')return {data:true,error:null};
        if(name==='bc_my_referral_code')return {data:'QA123',error:null};
        if(name==='bc_search_lego_sets'){const text=String(args?.p_query||'').toLowerCase();return {data:sets.filter((s:any)=>`${s.name} ${s.set_number} ${s.theme}`.toLowerCase().includes(text)),error:null}}
        if(name==='find_matches'){if(!state.collection.some((x:any)=>x.available_for_exchange)||!state.wishlist.length)return {data:[],error:null};const own=state.collection.find((x:any)=>x.available_for_exchange);const wish=state.wishlist[0];const os=sets.find((s:any)=>s.set_number===own.set_number)!;const ws=sets.find((s:any)=>s.set_number===wish.set_number)!;return {data:[{match_user:'00000000-0000-4000-8000-000000000099',match_score:95,offered_name:os.name,offered_set:os.set_number,offered_value:450,offered_item:own.id,requested_name:ws.name,requested_set:ws.set_number,requested_value:450,requested_item:'other-item-1'}],error:null}}
        return {data:null,error:null};
      },
      storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),upload:async()=>({data:{path:'x'},error:null})})}
    };
    (window as any).supabase={createClient:()=>db};
    (window as any).fetch=async()=>({ok:true,json:async()=>({external:{google:true,apple:false}})} as any);
  });
  await page.addScriptTag({path:appPath});
  await page.addScriptTag({path:catalogSearchPath});
  await expect(page.locator('.bc-welcome')).toContainText(/Welcome back, QA/i,{timeout:5000});

  await page.locator('[data-nav="browse"]').first().click();
  await expect(page.locator('#bc-q')).toBeVisible();
  await page.locator('#bc-q').fill('McLaren');
  await expect(page.locator('#bc-set-grid')).toContainText('McLaren P1',{timeout:3000});
  await page.locator('[data-cs-set="42172"] [data-cs-own]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__qaState.collection.length)).toBe(1);

  await page.locator('#bc-q').fill('Ferrari');
  await expect(page.locator('#bc-set-grid')).toContainText('Ferrari Daytona SP3',{timeout:3000});
  await page.locator('[data-cs-set="42143"] [data-cs-want]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__qaState.wishlist[0]?.set_number)).toBe('42143');

  await page.locator('[data-nav="sets"]').first().click();
  await expect(page.locator('#bc-sets-body')).toContainText('McLaren P1');
  await page.locator('[data-exchangeable]').check();
  await expect.poll(()=>page.evaluate(()=>(window as any).__qaState.collection[0].available_for_exchange)).toBeTruthy();

  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toContainText(/McLaren P1/);
  await expect(page.locator('.bc-match')).toContainText(/Ferrari Daytona SP3/);
  await page.locator('[data-propose]').click();
  await expect(page.locator('#bc-proposal')).toBeVisible();
  await page.locator('#bc-proposal button[type="submit"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__qaState.requests.length)).toBe(1);
  await expect(page.locator('#bc-exchange-body')).toContainText(/Proposal sent/i,{timeout:3000});
  expect(materialErrors(errors)).toEqual([]);
});
