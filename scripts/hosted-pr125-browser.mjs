import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { validateTarget, STAGING_REF, PRODUCTION_REF, PR125_SHA } from './validate-hosted-pr125.mjs';
import { insertOwnedItem, serializeRedactedReport, validateStagingEmails } from './hosted-exchange-smoke.mjs';

const ORIGIN = 'http://127.0.0.1:4179';
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4';
const expect = playwrightExpect.configure({timeout:30000});
const TYPES = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'};
export async function browserLogin(page, user, substage=()=>{}, expectedId) {
  substage('load candidate');await page.goto(ORIGIN+'/v2.html');
  substage('SDK readiness');await expect.poll(()=>page.evaluate(()=>!!window.BC_SUPABASE)).toBe(true);
  substage('open sign-in');await page.locator('[data-auth]').first().click();
  substage('select sign-in tab');await page.locator('[data-auth-tab="signin"]').click();
  substage('fill email');await page.locator('#bc-email-signin [name="email"]').fill(user.email);
  substage('fill password');await page.locator('#bc-email-signin [name="password"]').fill(user.password);
  substage('submit password');await page.locator('#bc-email-signin button[type="submit"]').click();
  substage('verify browser identity');
  await expect.poll(()=>page.evaluate(async ({email,id})=>{
    const result=await window.BC_SUPABASE.auth.getUser();
    return !result.error && result.data.user?.email===email && (!id || result.data.user.id===id);
  },{email:user.email,id:expectedId})).toBe(true);
  // Top-bar icon buttons are intentionally hidden at the mobile evidence width.
  substage('visible authenticated shell');await expect(page.locator('[data-nav="profile"].bc-avatar-btn')).toBeVisible();
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
}
export async function withDesktopNotifications(page, work) {
  const viewport=page.viewportSize();
  try { await page.setViewportSize({width:1280,height:844});await work(); }
  finally { await page.setViewportSize(viewport); }
}
export async function browserFixtureSets(client, setA, setB) {
  assert.ok(setA && setB && setA.toLowerCase()!==setB.toLowerCase());
  const configured=await client.from('lego_sets').select('set_number').in('set_number',[setA,setB]);
  assert.ifError(configured.error);
  const found=new Set((configured.data||[]).map(row=>row.set_number));
  assert.ok(found.has(setA) && found.has(setB),'Both configured sets must exist');
  const third=await client.from('lego_sets').select('set_number').not('set_number','in',`(${setA},${setB})`).order('set_number').limit(1);
  assert.ifError(third.error);
  assert.equal(third.data?.length,1,'One additional catalogue set is required');
  const set=third.data[0].set_number;
  assert.ok(set && ![setA.toLowerCase(),setB.toLowerCase()].includes(set.toLowerCase()));
  // Per-owner uniqueness: browser A owns B/third, browser B owns A/third.
  // Server smoke later inserts A-own-A and B-own-B on the same fresh accounts.
  return [setB,setA,set,set];
}
export function transportAllowed(raw, websocket = false) {
  const url = new URL(raw);
  if (url.username || url.password) return false;
  if (websocket) return url.protocol === 'wss:' && url.host === `${STAGING_REF}.supabase.co` && url.pathname === '/realtime/v1/websocket';
  return url.origin === `https://${STAGING_REF}.supabase.co` && /^\/(auth|rest|storage)\/v1(?:\/|$)/.test(url.pathname);
}
export function stagingApplication(source, url, key) {
  const urlPattern = /const SUPABASE_URL='https:\/\/nsxtromjdpdscknadxez\.supabase\.co';/g;
  const keyPattern = /const SUPABASE_KEY='[^'\n]+';/g;
  assert.equal((source.match(urlPattern)||[]).length,1);
  assert.equal((source.match(keyPattern)||[]).length,1);
  // The sole application change is an in-memory test configuration override.
  return source.replace(urlPattern,()=>`const SUPABASE_URL=${JSON.stringify(url)};`)
    .replace(keyPattern,()=>`const SUPABASE_KEY=${JSON.stringify(key)};`);
}
export async function installTransport(context, config, candidate, diagnostics, sdkBody) {
  const root = await realpath(candidate);
  const sdk = sdkBody ?? await readFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js','utf8');
  await context.routeWebSocket('**/*', ws => {
    if (transportAllowed(ws.url(),true)) ws.connectToServer();
    else { diagnostics.deniedSocket++; ws.close(); }
  });
  await context.route('**/*',async route=>{
    const raw=route.request().url(),url=new URL(raw);
    if(raw===SDK)return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.origin===ORIGIN){
      try {
        const file=await realpath(resolve(root,'.'+decodeURIComponent(url.pathname)));
        assert.ok(file.startsWith(root+sep));
        assert.ok(TYPES[extname(file)]);
        let body=await readFile(file);
        if(url.pathname==='/app-v3.js')body=stagingApplication(body.toString(),config.url,config.key);
        // Analytics and remote image providers are not part of messaging evidence.
        if(['/analytics.js','/product-analytics.js'].includes(url.pathname))body='';
        return route.fulfill({contentType:TYPES[extname(file)],body});
      }catch{return route.fulfill({status:404,body:'Unavailable'});}
    }
    if(transportAllowed(raw))return route.continue();
    if(url.hostname===`${PRODUCTION_REF}.supabase.co`)diagnostics.deniedProduction++;
    diagnostics.deniedExternal++;
    return route.abort('blockedbyclient');
  });
}

async function offline() {
  const browser=await chromium.launch();
  try {
    const context=await browser.newContext({serviceWorkers:'block'}), diagnostics={deniedSocket:0,deniedProduction:0,deniedExternal:0};
    await installTransport(context,{url:`https://${STAGING_REF}.supabase.co`,key:'offline'},'.',diagnostics,'window.__pinnedSDK=true;');
    const page=await context.newPage();
    await page.goto(ORIGIN+'/privacy.html');
    await page.evaluate(async ({production,origin,sdk})=>{
      for(const target of [production,'https://unauthorized.example.test/collect',origin+'/.git/config',origin+'/../package.json']){
        try{await fetch(target)}catch{}
      }
      await new Promise(resolve=>{const script=document.createElement('script');script.src=sdk;script.onload=resolve;document.head.append(script)});
    },{production:`https://${PRODUCTION_REF}.supabase.co/rest/v1/profiles`,origin:ORIGIN,sdk:SDK});
    assert.equal(diagnostics.deniedProduction,1);
    assert.ok(diagnostics.deniedExternal>=2);
    assert.equal(await page.evaluate(()=>window.__pinnedSDK),true);
    await context.close();
    if(process.env.BC_HOSTED_CANDIDATE_PATH){
      const candidate=process.env.BC_HOSTED_CANDIDATE_PATH;
      const { offlineLogin }=await import('./offline-pr125-login.mjs');
      await offlineLogin(browser,candidate,browserLogin,withDesktopNotifications);
      const mock=await readFile('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
      const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',C='00000000-0000-4000-8000-000000000103',stamp='2026-10-05T12:00:00Z';
      const database={profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'},{id:C,display_name:'Dhyan'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),
        collection:[{id:'item-a',user_id:A,set_number:'42143-1'},{id:'item-b',user_id:B,set_number:'42172-1'},{id:'item-a-third',user_id:A,set_number:'42115-1'},{id:'item-b-third',user_id:B,set_number:'42115-1'}].map(item=>({...item,available_for_exchange:false})),wishlist:[],
        exchanges:['first-case','second-case'].map((id,index)=>({id,user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:index?'item-a-third':'item-a',item_b:index?'item-b-third':'item-b',duration_days:60,state:'PROPOSED',state_version:5,created_at:stamp,updated_at:stamp})),
        events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
      for(const actor of ['easwar','ramya','dhyan']){
        const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
        await installTransport(ctx,{url:`https://${STAGING_REF}.supabase.co`,key:'offline'},candidate,diagnostics,mock);
        // A catch-all staging override ensures mock execution cannot reach hosted Auth/settings.
        await ctx.route(`https://${STAGING_REF}.supabase.co/**`,r=>r.fulfill({contentType:'application/json',body:'{}'}));
        await ctx.routeWebSocket('**/*',ws=>ws.close());
        await ctx.addInitScript(({actor,database})=>{localStorage.setItem('bc_three_user_actor',actor);localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1');},{actor,database});
        const p=await ctx.newPage();await p.goto(ORIGIN+'/v2.html?isolated=three-user#messages/case:first-case');
        if(actor==='dhyan'){
          await expect(p.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();await expect(p.locator('#bc-msg-form')).toHaveCount(0);
        }else{
          await expect(p.getByRole('region',{name:'Exchange next step'})).toBeVisible();
          await expect(p.locator('#bc-case-destination option')).toHaveCount(3);
          const firstLabel=await p.locator('#bc-case-destination option[value="first-case"]').innerText();
          const secondLabel=await p.locator('#bc-case-destination option[value="second-case"]').innerText();
          assert.notEqual(firstLabel,secondLabel,'Three-set cases remain distinguishable destinations');
          const input=p.locator('#bc-msg-form textarea');await input.fill('First destination draft');
          await p.locator('#bc-case-destination').selectOption('second-case');await input.fill('Second destination draft');
          await p.locator('#bc-case-destination').selectOption('');await input.fill('General draft');
          await p.locator('#bc-case-destination').selectOption('first-case');await expect(input).toHaveValue('First destination draft');
          await p.locator('#bc-msg-form').evaluate(f=>f.requestSubmit());await expect(input).toHaveValue('');
          assert.equal(await p.evaluate(()=>window.__bcThreeUser.data.messages.find(m=>m.body==='First destination draft').case_id),'first-case');
          await p.evaluate(()=>window.bcNav('messages'));await expect(p.locator('.bc-msg-row')).toHaveCount(1);
        }
        await ctx.close();
      }
      assert.equal(diagnostics.deniedProduction,1,'Only the deliberately blocked production probe is permitted');
      console.log('Offline PR125 three-actor selector/destination/draft/isolation mock passed; not hosted evidence.');
    }
    console.log('Offline browser transport guard passed; no hosted requests.');
  }finally{await browser.close();}
}

async function run(env=process.env) {
  // Do not emit errors, request bodies, raw Playwright assertions, console, traces or screenshots.
  const report={ok:false,testedPullRequestNumber:125,testedHeadSha:PR125_SHA,target:'approved-staging',checks:[]};
  let stage='configuration',browser;
  const clients=[];
  const passed=detail=>report.checks.push({status:'passed',detail});
  try {
    validateTarget(env);
    assert.ok(!env.BC_STAGING_SUPABASE_SECRET_KEY,'Server secret forbidden in browser process');
    const users=validateStagingEmails(['A','B','C'].map(label=>({label,email:env[`BC_STAGING_USER_${label}_EMAIL`],password:env[`BC_STAGING_USER_${label}_PASSWORD`]})),'example.test');
    assert.ok(users.every(u=>u.password));
    assert.ok(env.BC_STAGING_SET_A && env.BC_STAGING_SET_B && env.BC_STAGING_SET_A.toLowerCase()!==env.BC_STAGING_SET_B.toLowerCase());
    const config={url:env.BC_STAGING_SUPABASE_URL,key:env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY};
    stage='three public-key Auth sessions and synthetic fixtures';
    const sessions=[];
    for(const user of users){
      const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
      const result=await client.auth.signInWithPassword(user);assert.ifError(result.error);
      const verified=await client.auth.getUser();assert.ifError(verified.error);assert.equal(verified.data.user.id,result.data.user.id);
      sessions.push({client,id:result.data.user.id,label:user.label});
    }
    const [a,b,c]=sessions;
    assert.equal(new Set(sessions.map(s=>s.id)).size,3);
    const runId=`browser-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
    // Exactly three catalogue sets suffice; validate all prerequisites before inserts.
    const sets=await browserFixtureSets(a.client,env.BC_STAGING_SET_A,env.BC_STAGING_SET_B),items=[];
    for(const [index,session] of [a,b,a,b].entries()){
      const set=sets[index];
      const item=await insertOwnedItem(session,set,runId);items.push(item);
      const available=await session.client.rpc('set_exchange_item_availability',{p_item_id:item.id,p_available:true});assert.ifError(available.error);
    }
    assert.equal(new Set(items.map(item=>item.id)).size,4,'Each browser case needs distinct physical items');
    for(const [session,set] of [[a,sets[1]],[b,sets[0]],[a,sets[3]],[b,sets[2]]]){
      const result=await session.client.from('wishlists').upsert({user_id:session.id,set_number:set,priority:3},{onConflict:'user_id,set_number'});assert.ifError(result.error);
    }
    stage='browser collector authentication';
    browser=await chromium.launch();
    const pages=[],diagnostics={deniedSocket:0,deniedProduction:0,deniedExternal:0};
    for(const [index,user] of users.entries()){
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
      await installTransport(context,config,env.BC_HOSTED_CANDIDATE_PATH,diagnostics);
      const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());
      // Real login form, browser SDK and Auth; no injected session or mocked backend.
      await browserLogin(page,user,detail=>{stage=`browser collector ${['A','B','C'][index]} authentication: ${detail}`;},sessions[index].id);
      pages.push(page);
    }
    const [pa,pb,pc]=pages;
    const nav=async(page,thread)=>{await page.evaluate(thread=>{window.bcClose();window.bcNav('messages',thread);},thread);await expect(page.locator('#bc-msg-form')).toBeVisible();};
    const refresh=async page=>{const button=page.locator('[data-refresh-thread]');await button.click();await expect(button).toBeEnabled();};
    const send=async(page,body)=>{await page.locator('#bc-msg-form textarea').fill(body);await page.locator('#bc-msg-form').evaluate(f=>f.requestSubmit());await expect(page.locator('#bc-msg-form textarea')).toHaveValue('');};
    const rows=async(client,table,body)=>{const r=await client.from(table).select('*').eq('body',body);assert.ifError(r.error);return r.data;};
    const openCase=async(page,id)=>{await nav(page,`case:${id}`);await expect(page.locator('#bc-case-destination')).toHaveValue(id);};
    const action=async(page,id,name)=>{
      await openCase(page,id);await refresh(page);
      const button=page.locator(`[data-thread-case-action="${name}"]`);
      await expect(button).toBeVisible();await button.click();
      await expect(button).toHaveCount(0,{timeout:20000});
      assert.equal(await page.evaluate(()=>decodeURIComponent(location.hash)),`#messages/case:${id}`);
    };
    passed('three independent real browser staging sessions');
    stage='inline proposal and no reservation on open';
    await pa.evaluate(()=>window.bcNav('matches'));
    // Exact physical pair, not first reciprocal match (there are four combinations).
    // Select by both unique rendered set numbers, never an old modal or "first match" selector.
    let proposalArgs;
    pa.on('request',request=>{if(request.url()===config.url+'/rest/v1/rpc/create_exchange_case')proposalArgs=request.postDataJSON();});
    const card=pa.locator('.bc-match').filter({hasText:`Set ${sets[0]}`}).filter({hasText:`Set ${sets[1]}`});
    await expect(card).toHaveCount(1);await card.locator('[data-propose]').click();
    await expect(pa.locator('#bc-inline-proposal')).toBeVisible();
    const before=await a.client.from('exchange_cases').select('id');assert.ifError(before.error);assert.equal(before.data.length,0);
    const unlocked=await a.client.from('collection_items').select('available_for_exchange').in('id',[items[0].id,items[2].id]);assert.ifError(unlocked.error);assert.ok(unlocked.data.every(i=>i.available_for_exchange));
    await pa.locator('#bc-inline-proposal').evaluate(f=>f.requestSubmit());
    await expect.poll(()=>pa.evaluate(()=>decodeURIComponent(location.hash))).toMatch(/^#messages\/case:/);
    const case1=(await pa.evaluate(()=>decodeURIComponent(location.hash))).split('case:')[1];
    assert.equal(proposalArgs.p_offered_item_id,items[0].id);assert.equal(proposalArgs.p_requested_item_id,items[1].id);
    // A second same-peer case supplies a meaningful destination ambiguity without locks or hidden state edits.
    const second=await a.client.rpc('create_exchange_case',{p_offered_item_id:items[2].id,p_requested_item_id:items[3].id,p_duration_days:30,p_message:runId,p_idempotency_key:runId+':second'});assert.ifError(second.error);
    const case2=second.data.case.id;
    assert.notEqual(case2,case1);
    assert.equal(second.data.case.user_a,a.id);assert.equal(second.data.case.user_b,b.id);
    assert.equal(second.data.case.item_a,items[2].id);assert.equal(second.data.case.item_b,items[3].id);
    passed('inline physical-item proposal; opening does not reserve; two authorized same-peer cases');

    stage='direct and exact-case messages chronological inbox drafts and retry';
    await nav(pa,`direct:${b.id}`);await refresh(pa);
    await send(pa,'Browser direct first');
    await pa.locator('#bc-case-destination').selectOption(case1);await send(pa,'Browser case one second');
    await pa.locator('#bc-msg-form textarea').fill('First case draft');
    await pa.locator('#bc-case-destination').selectOption(case2);await send(pa,'Browser case two third');
    await pa.locator('#bc-msg-form textarea').fill('Second case draft');
    await pa.locator('#bc-case-destination').selectOption('');await pa.locator('#bc-msg-form textarea').fill('General draft');
    await pa.locator('#bc-case-destination').selectOption(case1);await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('First case draft');
    await pa.locator('#bc-case-destination').selectOption(case2);await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('Second case draft');
    await pa.locator('#bc-case-destination').selectOption('');await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('General draft');
    const timeline=await pa.locator('#bc-msg-chat').innerText();
    assert.ok(timeline.indexOf('Browser direct first')>=0);
    assert.ok(timeline.indexOf('Browser direct first')<timeline.indexOf('Browser case one second'));
    assert.ok(timeline.indexOf('Browser case one second')<timeline.indexOf('Browser case two third'));
    const direct=await rows(a.client,'messages','Browser direct first');assert.equal(direct.length,1);
    assert.equal(direct[0].sender_id,a.id);assert.equal(direct[0].recipient_id,b.id);assert.equal(direct[0].exchange_id,null);
    await expect(pa.locator(`.bc-collector-event[data-timeline-case="${case1}"]`).filter({hasText:'Proposal created'})).toHaveCount(1);
    await expect(pa.locator(`.bc-collector-event[data-timeline-case="${case2}"]`).filter({hasText:'Proposal created'})).toHaveCount(1);
    for(const [body,id] of [['Browser case one second',case1],['Browser case two third',case2]]){
      const r=await rows(a.client,'exchange_case_messages',body);assert.equal(r.length,1);assert.equal(r[0].case_id,id);assert.equal(r[0].sender_id,a.id);assert.equal(r[0].recipient_id,b.id);
    }
    for(const [id,rpc,body,table] of [[case1,'send_exchange_case_message','Browser case retry','exchange_case_messages'],['','send_collector_message','Browser direct retry','messages']]){
      await pa.locator('#bc-case-destination').selectOption(id);
      let lost=false;
      const rpcUrl=config.url+`/rest/v1/rpc/${rpc}`;
      await pa.route(rpcUrl,async route=>{
        if(lost)return route.continue();
        const response=await route.fetch();assert.ok(response.ok());lost=true;
        // Commit really reaches staging, then only the response to this browser is dropped.
        await route.abort('connectionfailed');
      });
      await pa.locator('#bc-msg-form textarea').fill(body);await pa.locator('#bc-msg-form').evaluate(f=>f.requestSubmit());
      await expect(pa.locator('#bc-msg-error')).toContainText('Retry the same message safely');
      await refresh(pa);await expect(pa.locator('#bc-msg-form textarea')).toHaveValue(body);
      await pa.locator('#bc-msg-form').evaluate(f=>f.requestSubmit());await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('');
      await pa.unroute(rpcUrl);
      const r=await rows(a.client,table,body);assert.equal(r.length,1);
      if(id){
        assert.equal(r[0].case_id,id);
        const note=await b.client.from('notifications').select('id').eq('exchange_case_message_id',r[0].id);assert.ifError(note.error);assert.equal(note.data.length,1);
      }else{assert.equal(r[0].sender_id,a.id);assert.equal(r[0].recipient_id,b.id);assert.equal(r[0].exchange_id,null);}
    }
    await pa.evaluate(()=>window.bcNav('messages'));
    await expect(pa.locator(`[data-message-open="direct:${b.id}"]`)).toHaveCount(1);
    await expect(pa.locator('.bc-msg-row')).toHaveCount(1);
    await pa.locator('.bc-msg-row').click();
    await expect(pa.locator('#bc-case-destination option')).toHaveCount(3);
    assert.equal(await pa.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    passed('one collector inbox; chronological direct and two exact-case messages; separate drafts; actual committed-response-lost retries exactly once; mobile width');

    stage='notification deep links and displayed read watermarks';
    await nav(pc,`direct:${b.id}`);await send(pc,'Other collector remains unread');
    await nav(pb,`direct:${a.id}`);await refresh(pb);
    const watermark=async suffix=>pb.evaluate(({id,suffix})=>localStorage.getItem(`brickcircle:messages:seen:${id}:${suffix}`),{id:b.id,suffix});
    await expect.poll(async()=>[!!await watermark(`direct:${a.id}`),!!await watermark(`case:${case1}`),!!await watermark(`case:${case2}`),await watermark(`direct:${c.id}`)]).toEqual([true,true,true,null]);
    await expect(pb.locator(`[data-message-open="direct:${c.id}"] .bc-msg-unread`)).toHaveText('1');
    const proposalNote=await b.client.from('notifications').select('id').eq('exchange_case_id',case1).eq('kind','exchange_proposed').single();assert.ifError(proposalNote.error);
    await withDesktopNotifications(pb,async()=>{
      await pb.locator('[data-open="notifications"]').click();await pb.locator(`[data-note="${proposalNote.data.id}"]`).click();
    });
    await expect(pb.locator('#bc-case-destination')).toHaveValue(case1);
    await expect.poll(()=>pb.evaluate(()=>decodeURIComponent(location.hash))).toBe(`#messages/case:${case1}`);
    const notification=await b.client.from('notifications').select('*').eq('exchange_case_id',case2).eq('kind','exchange_message').order('created_at',{ascending:false}).limit(1);assert.ifError(notification.error);assert.equal(notification.data.length,1);
    await withDesktopNotifications(pb,async()=>{
      await pb.locator('[data-open="notifications"]').click();
      await pb.locator(`[data-note="${notification.data[0].id}"]`).click();
    });
    await expect(pb.locator('#bc-case-destination')).toHaveValue(case2);
    await expect.poll(()=>pb.evaluate(()=>decodeURIComponent(location.hash))).toBe(`#messages/case:${case2}:message:${notification.data[0].exchange_case_message_id}`);
    await expect(pb.locator(`[data-timeline-message="${notification.data[0].exchange_case_message_id}"]`)).toBeVisible();
    passed('actual notification deep link selects exact case and message; rendered-source watermarks leave another collector unread');

    stage='outsider browser and participant RLS';
    await pc.evaluate(id=>window.bcNav('messages',`case:${id}`),case1);
    await expect(pc.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();
    await expect(pc.locator('#bc-msg-form')).toHaveCount(0);await expect(pc.locator('[data-thread-case-action]')).toHaveCount(0);
    for(const table of ['exchange_cases','exchange_case_messages','exchange_case_events']){
      const r=await c.client.from(table).select('id').eq(table==='exchange_cases'?'id':'case_id',case1);assert.ifError(r.error);assert.deepEqual(r.data,[]);
    }
    const denied=await c.client.rpc('send_exchange_case_message',{p_case_id:case1,p_body:'Unauthorized fixture',p_idempotency_key:runId+':outsider'});assert.ok(denied.error);
    assert.deepEqual(await rows(c.client,'messages','Browser direct first'),[]);
    const outsiderNotes=await c.client.from('notifications').select('id').in('exchange_case_id',[case1,case2]);assert.ifError(outsiderNotes.error);assert.deepEqual(outsiderNotes.data,[]);
    passed('outsider real browser unavailable; no composer/actions; server denies case/event/message reads and message RPC');

    stage='guided inline exchange lifecycle';
    await openCase(pb,case1);await pb.locator('#bc-msg-form textarea').fill('Lifecycle draft stays in this case');
    await action(pb,case1,'accept');
    await expect(pb.locator('#bc-msg-form textarea')).toHaveValue('Lifecycle draft stays in this case');
    const plan=async(page,name)=>{
      await openCase(page,case1);await refresh(page);await page.locator(`[data-thread-case-action="${name}"]`).click();
      await page.locator('#bc-case-meetup [name="venue"]').fill('Synthetic public library');
      await page.locator('#bc-case-meetup [name="when"]').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
      await page.locator('#bc-case-meetup').evaluate(f=>f.requestSubmit());await expect(page.locator('#bc-case-meetup')).toHaveCount(0);
    };
    await plan(pa,'propose_meetup');await action(pb,case1,'accept_meetup');
    for(const name of ['safety_ack','arrive','inspect','handoff'])for(const page of [pa,pb])await action(page,case1,name);
    let state=await a.client.from('exchange_cases').select('state').eq('id',case1).single();assert.ifError(state.error);assert.equal(state.data.state,'ACTIVE');
    await plan(pa,'propose_return');await action(pb,case1,'accept_return');
    for(const name of ['return_arrive','return_inspect','return_confirm'])for(const page of [pa,pb])await action(page,case1,name);
    state=await a.client.from('exchange_cases').select('state').eq('id',case1).single();assert.ifError(state.error);assert.equal(state.data.state,'COMPLETED');
    await expect(pb.locator('#bc-msg-form')).toBeHidden();
    await expect(pb.getByRole('region',{name:'Exchange next step'})).toContainText('Closed');
    await expect(pb.locator('#bc-msg-chat')).toContainText('Browser case one second');
    await expect(pb.locator(`.bc-collector-event[data-timeline-case="${case1}"]`).filter({hasText:'Completed'})).toHaveCount(1);
    passed('real inline accept, meetup, safety, arrival, inspection, handoff, build, return and completion; closed archive retains chronological messages');
    assert.equal(diagnostics.deniedProduction,0);assert.equal(diagnostics.deniedSocket,0);
    report.transport={productionRequests:0,unexpectedSockets:0};
    report.ok=true;
  }catch{
    // Fixed stage only: raw SDK/Playwright errors can include passwords, identities and requests.
    report.failedStage=stage;process.exitCode=1;
  }finally{
    await browser?.close();
    for(const client of clients)await client.auth.signOut({scope:'local'}).catch(()=>{});
    await mkdir('artifacts',{recursive:true});
    await writeFile('artifacts/hosted-pr125-browser.json',serializeRedactedReport(report));
    console.log(report.ok?'Hosted PR125 browser checks passed.':`Hosted PR125 browser checks failed at: ${stage}. Redacted report retained.`);
  }
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  (process.argv.includes('--offline')?offline():run()).catch(()=>{console.error('Browser harness failed; diagnostics withheld.');process.exitCode=1;});
}
