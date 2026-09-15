import fs from 'node:fs';
import {test,expect} from './fixtures';

const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    if(!sessionStorage.getItem('bc_three_user_initialized')){
      localStorage.removeItem('bc_three_user_db');
      localStorage.removeItem('bc_three_user_actor');
      sessionStorage.setItem('bc_three_user_initialized','1');
    }
  });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',route=>route.fulfill({contentType:'application/javascript',body:mock}));
});

async function search(page:any,query:string){
  await page.locator('[data-nav="browse"]').first().click();
  await page.locator('#bc-q').fill(query);
}

async function addOwned(page:any,setNumber:string,query:string){
  await search(page,query);
  await page.locator(`[data-set="${setNumber}"] [data-own]`).click();
  const form=page.locator('#bc-owner-photo-form');
  await form.locator('#bc-owner-photo-input').setInputFiles({name:`${setNumber}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(`isolated-${setNumber}`)});
  await form.getByRole('button',{name:'Add to My Sets'}).click();
  await expect.poll(()=>page.evaluate((set:string)=>window.__bcThreeUser.data.collection.some((row:any)=>row.user_id===window.__bcThreeUser.actors[window.__bcThreeUser.actor].id&&row.set_number===set),setNumber)).toBe(true);
  await page.evaluate(()=>window.bcV3Refresh());
}

async function addWanted(page:any,setNumber:string,query:string){
  await search(page,query);
  await page.locator(`[data-set="${setNumber}"] [data-want]`).click();
  await expect.poll(()=>page.evaluate((set:string)=>window.__bcThreeUser.data.wishlist.some((row:any)=>row.user_id===window.__bcThreeUser.actors[window.__bcThreeUser.actor].id&&row.set_number===set),setNumber)).toBe(true);
}

async function makeAvailable(page:any){
  await page.locator('[data-nav="sets"]').first().click();
  await page.locator('[data-exchangeable]').check();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.collection.find((row:any)=>row.user_id===window.__bcThreeUser.actors[window.__bcThreeUser.actor].id)?.available_for_exchange)).toBe(true);
}

async function switchActor(page:any,actor:'easwar'|'ramya'|'dhyan'){
  await page.evaluate((next:string)=>window.__bcThreeUser.switchActor(next),actor);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.actor)).toBe(actor);
  if(await page.locator('#bc-overlay').count())return;
  await page.locator('[data-nav="profile"]').first().click();
  await expect(page.locator('.bc-profile-hero h1')).toHaveText(actor[0].toUpperCase()+actor.slice(1));
}

test('Easwar, Ramya and Dhyan share deterministic reciprocal and proposal truth',async({page})=>{
  test.setTimeout(120000);
  test.setTimeout(90000);
  await page.goto('/v2.html?isolated=three-user#home');
  await addOwned(page,'42172-1','McLaren');
  await addWanted(page,'42143-1','Ferrari');
  await makeAvailable(page);

  await switchActor(page,'ramya');
  await addOwned(page,'42143-1','Ferrari');
  await addWanted(page,'42172-1','McLaren');
  await makeAvailable(page);
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toHaveCount(1);
  await expect(page.locator('.bc-match')).toContainText('Easwar');

  await switchActor(page,'dhyan');
  await addOwned(page,'42115-1','Lamborghini');
  await makeAvailable(page);
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toHaveCount(0);

  await switchActor(page,'easwar');
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toHaveCount(1);
  await expect(page.locator('.bc-match')).toContainText('Ramya');
  await page.locator('[data-propose]').click();
  await page.locator('#bc-proposal').getByRole('button',{name:'Send proposal'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.requests.length)).toBe(1);

  await switchActor(page,'ramya');
  await expect(page.locator('#bc-overlay')).toContainText('Easwar proposed an exchange with you.');
  await page.locator('#bc-overlay').getByRole('button',{name:'View proposal'}).click();
  const request=page.locator('[data-request-card="request-1"]');
  await expect(request).toContainText('Incoming proposal');
  await request.getByRole('button',{name:'Accept'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.exchanges.length)).toBe(1);
  const result=await page.evaluate(()=>({requests:window.__bcThreeUser.data.requests,exchanges:window.__bcThreeUser.data.exchanges,collection:window.__bcThreeUser.data.collection,wishlist:window.__bcThreeUser.data.wishlist}));
  expect(result.requests).toHaveLength(1);
  expect(result.requests[0].status).toBe('accepted');
  expect(result.exchanges).toHaveLength(1);
  expect(result.collection).toHaveLength(3);
  expect(result.wishlist).toHaveLength(2);
});


test('active third-party reservation is hidden from matches and failed acceptance recovers its button',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/v2.html?isolated=three-user#home');
  await addOwned(page,'42172-1','McLaren');
  await addWanted(page,'42143-1','Ferrari');
  await makeAvailable(page);

  await switchActor(page,'ramya');
  await addOwned(page,'42143-1','Ferrari');
  await addWanted(page,'42172-1','McLaren');
  await makeAvailable(page);

  await switchActor(page,'easwar');
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toHaveCount(1);
  await page.locator('[data-propose]').click();
  await page.locator('#bc-proposal').getByRole('button',{name:'Send proposal'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.requests.length)).toBe(1);

  await page.evaluate(()=>{
    const state=window.__bcThreeUser;
    const request=state.data.requests[0];
    state.data.exchanges.push({
      id:'exchange-third-party-lock',
      request_id:'older-request',
      user_a:request.requester_id,
      user_b:state.actors.dhyan.id,
      item_a:request.offered_item_id,
      item_b:'third-party-item',
      duration_days:60,
      state:'swap_active',
      created_at:'2026-09-01T12:00:00.000Z',
      updated_at:'2026-09-01T12:00:00.000Z'
    });
    state.persist();
  });

  await switchActor(page,'ramya');
  await page.locator('#bc-overlay').getByRole('button',{name:'View proposal'}).click();
  const request=page.locator('[data-request-card="request-1"]');
  const accept=request.getByRole('button',{name:'Accept'});
  await accept.click();
  await expect(accept).toBeEnabled();
  await expect(accept).toHaveText('Accept');
  await expect(page.getByText('One of these LEGO sets is already reserved in another active exchange')).toBeVisible();
  const result=await page.evaluate(()=>({
    requestStatus:window.__bcThreeUser.data.requests[0].status,
    exchanges:window.__bcThreeUser.data.exchanges.length
  }));
  expect(result).toEqual({requestStatus:'pending',exchanges:1});

  await switchActor(page,'easwar');
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toHaveCount(0);
});

test('an owner releases an accepted pre-handoff exchange and both sets become available',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/v2.html?isolated=three-user#home');
  await addOwned(page,'42172-1','McLaren');
  await addWanted(page,'42143-1','Ferrari');
  await makeAvailable(page);
  await switchActor(page,'ramya');
  await addOwned(page,'42143-1','Ferrari');
  await addWanted(page,'42172-1','McLaren');
  await makeAvailable(page);
  await switchActor(page,'easwar');
  await page.locator('[data-nav="matches"]').first().click();
  await page.locator('[data-propose]').click();
  await page.locator('#bc-proposal').getByRole('button',{name:'Send proposal'}).click();
  await switchActor(page,'ramya');
  await page.locator('#bc-overlay').getByRole('button',{name:'View proposal'}).click();
  await page.locator('[data-request-card="request-1"]').getByRole('button',{name:'Accept'}).click();
  await switchActor(page,'easwar');
  await page.locator('[data-nav="sets"]').first().click();
  const release=page.getByRole('button',{name:'Release this set from this exchange'});
  await expect(release).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await release.click();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.exchanges[0].state)).toBe('released');
  const result=await page.evaluate(()=>({
    request:window.__bcThreeUser.data.requests[0].status,
    available:window.__bcThreeUser.data.collection.slice(0,2).map((row:any)=>row.available_for_exchange),
    releaseNotes:window.__bcThreeUser.data.notifications.filter((row:any)=>row.kind==='exchange_released').length
  }));
  expect(result).toEqual({request:'released',available:[true,true],releaseNotes:1});
});

test('release after handoff routes to early-return guidance without unreserving either set',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/v2.html?isolated=three-user#home');
  await page.evaluate(()=>{
    const state=window.__bcThreeUser;
    state.data.collection.push(
      {id:'active-a',user_id:state.actors.easwar.id,set_number:'42172-1',available_for_exchange:false,created_at:'2026-09-01T12:00:00.000Z'},
      {id:'active-b',user_id:state.actors.ramya.id,set_number:'42143-1',available_for_exchange:false,created_at:'2026-09-01T12:00:00.000Z'}
    );
    state.data.exchanges.push({id:'active-exchange',request_id:'active-request',user_a:state.actors.easwar.id,user_b:state.actors.ramya.id,item_a:'active-a',item_b:'active-b',duration_days:60,state:'swap_active',created_at:'2026-09-01T12:00:00.000Z',updated_at:'2026-09-01T12:00:00.000Z'});
    state.persist();
  });
  await page.reload();
  await page.locator('[data-nav="sets"]').first().click();
  const release=page.getByRole('button',{name:'Release this set from this exchange'});
  page.once('dialog',dialog=>dialog.accept());
  await release.click();
  await expect(page).toHaveURL(/#exchange\/active-exchange/);
  await expect(page.getByText(/physical handoff is complete/i)).toBeVisible();
  const result=await page.evaluate(()=>({state:window.__bcThreeUser.data.exchanges[0].state,available:window.__bcThreeUser.data.collection.map((row:any)=>row.available_for_exchange)}));
  expect(result).toEqual({state:'swap_active',available:[false,false]});
});

declare global {interface Window {__bcThreeUser:any}}
