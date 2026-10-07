import {test,expect,Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const id='12345678-1234-1234-1234-123456789012';
const set={set_number:'42115-1',name:'Lamborghini Sián',theme:'Technic',year:2020,piece_count:3696,catalog_active:true,revision:0};
async function setup(page:Page,{denied=false,mfa=false,enrolled=false,uncertain=false,history=0}={}){
  const requests:any[]=[];let writes=0,verified=!mfa;let current={...set};const audit:any[]=Array.from({length:history},(_,i)=>({id:`history-${i}`,entity_id:id,action:'support_note',reason:`Internal history note ${i}`,actor_id:id,created_at:'2026-10-06T12:00:00Z',revision:0,before_value:{},after_value:{}}));
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}}),getUser:async()=>({data:{user:{id:'${id}'}}}),onAuthStateChange(fn){window.__signout=()=>fn('SIGNED_OUT');window.__authEvent=(event,session)=>fn(event,session);return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({}),mfa:{listFactors:async()=>({data:{totp:${enrolled?'[{id:"factor",status:"verified"}]':'[]'}}}),enroll:async()=>({data:{id:'factor',totp:{qr_code:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',secret:'test-setup-secret'}}}),challengeAndVerify:async()=>{window.__verified=true;return {};},unenroll:async()=>{window.__unenrolled=true;return {};}}}}}};`}));
  await page.route('**/functions/v1/admin-dashboard',async route=>{
    const body=route.request().postDataJSON();requests.push(body);
    if(denied){await route.fulfill({status:403,json:{error:'Administrator access required.'}});return;}
    if(!verified){verified=await page.evaluate(()=>Boolean((window as any).__verified));if(!verified){await route.fulfill({status:403,json:{error:'Authenticator required',code:'mfa_required'}});return;}}
    if(body.operation==='note') {
      const existing=audit.find(a=>a.request_id===body.request_id);
      if(existing&&existing.reason!==body.reason){await route.fulfill({status:409,json:{error:'Conflicting replay',code:'conflict'}});return;}
      if(!existing){writes++;audit.push({...body,id,entity_id:body.id,action:'support_note',actor_id:id,created_at:'2026-10-06T12:00:00Z',revision:0,before_value:{},after_value:{}});}
      await route.fulfill({json:{revision:0,audit_id:id}});return;
    }
    if(body.operation==='mutate'){
      if(!audit.some(a=>a.request_id===body.request_id)){writes++;current={...current,catalog_active:body.value==='visible',revision:current.revision+1};audit.push({...body,id,entity_id:body.id,action:'catalogue_visibility',actor_id:id,created_at:'2026-10-05T12:00:00Z',before_value:{value:'visible'},after_value:{value:body.value}});if(uncertain&&writes===1){await route.abort('failed');return;}}
      await route.fulfill({json:{revision:current.revision,audit_id:id}});return;
    }
    let data:any={rows:[],total:0,page:body.page||0,page_size:25,generated_at:'2026-10-05T12:00:00Z'};
    if(body.section==='overview')data={...data,summary:{members:1250,new_members:25,owned_sets:4200,wanted_sets:2100,available_sets:1800,exchanges:365,completed:270,overdue:3,support_open:2,catalogue_active:100},states:[{state:'COMPLETED',count:270}],cities:[{city:'Bengaluru',members:120}]};
    if(body.section==='members')data={...data,total:26,rows:[{id,display_name:'Collector <script>bad</script>',email:'collector@example.test',city:'Bengaluru',country:'India',created_at:'2026-10-05T12:00:00Z',adult_confirmed_at:'2026-10-05T12:00:00Z'}]};
    if(body.section==='catalogue')data={...data,total:1,rows:[current]};
    if(body.section==='support')data={...data,total:1,rows:[{id,case_id:id,category:'other',note:'Please help <img src=x onerror=bad()>',status:'open',revision:0,created_at:'2026-10-05T12:00:00Z'}]};
    if(body.section==='exchanges')data={...data,total:1,rows:[{id,state:'ACTIVE',member_a:'A',member_b:'B',created_at:'2026-10-05T12:00:00Z'}]};
    if(body.section==='audit')data={...data,total:audit.length,rows:audit.slice(body.page*25,(body.page+1)*25)};
    if(body.section==='member_detail')data={...data,member:{id,display_name:'Collector',email:'collector@example.test'},collection_total:126,wishlist_total:126,total:126,rows:Array.from({length:Math.min(25,126-body.page*25)},(_,i)=>({id:`item-${body.page*25+i}`,set_number:`set-${body.page*25+i}`,name:`Item ${body.page*25+i}`,condition:'Excellent',completeness:100,priority:3}))};
    if(body.section==='exchange_detail')data={...data,exchange:{id,state:'ACTIVE',state_version:2},total:126,rows:Array.from({length:Math.min(25,126-body.page*25)},(_,i)=>({id:`event-${body.page*25+i}`,event_type:'mutual_handoff',previous_state:'ACCEPTED',resulting_state:'ACTIVE',state_version:126-body.page*25-i,created_at:'2026-10-05T12:00:00Z'}))};
    if(body.section==='support_detail')data={...data,request:{id,case_id:id,category:'other',note:'Please help <img src=x onerror=bad()>',status:'open',revision:0,created_at:'2026-10-05T12:00:00Z'},exchange:{id,state:'ACTIVE'},total:body.part==='events'?1:audit.length,rows:body.part==='events'?[{id,event_type:'mutual_handoff',resulting_state:'ACTIVE',state_version:2,created_at:'2026-10-05T12:00:00Z'}]:audit.slice(body.page*25,(body.page+1)*25)};
    await route.fulfill({json:data});
  });
  return {requests,writes:()=>writes};
}
test('overview and mobile sections remain accessible with no overflow',async({page},testInfo)=>{
  await setup(page);await page.goto('/admin.html');await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.getByText('1,250',{exact:true})).toBeVisible();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const section of ['overview','members','catalogue','exchanges','support','audit']){
      await page.locator(`[data-section="${section}"]`).click();await expect(page.locator('#dashboard')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect((await page.locator(`[data-section="${section}"]`).boundingBox())?.height).toBeGreaterThanOrEqual(44);
      if(width===390&&['overview','catalogue'].includes(section)) await page.screenshot({path:testInfo.outputPath(`admin-${section}-390.png`),fullPage:true});
    }
  }
  await page.locator('[data-section="overview"]').click();await expect(page.locator('#dashboard')).toBeVisible();
  const a11y=await new AxeBuilder({page}).analyze();expect(a11y.violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('admin-overview-desktop.png'),fullPage:true});
});
test('unauthorized access renders no admin payload and permits retry',async({page})=>{
  const f=await setup(page,{denied:true});await page.goto('/admin.html');await expect(page.locator('#status')).toContainText('Administrator access required');await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#navigation')).toBeHidden();await expect(page.locator('#refresh')).toBeEnabled();expect(f.requests.length).toBe(1);
});
test('search, pagination, escaped content and keyboard detail dialog',async({page})=>{
  const f=await setup(page);await page.goto('/admin.html');await page.locator('[data-section="members"]').click();await expect(page.getByRole('button',{name:'View collector'})).toBeVisible();
  await expect(page.locator('#results script')).toHaveCount(0);await page.locator('#search').fill('Bengaluru');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.locator('#dashboard')).toBeVisible();expect(f.requests.at(-1).query).toBe('Bengaluru');
  await page.locator('#next').click();await expect(page.locator('#page-count')).toContainText('26–26');expect(f.requests.at(-1).page).toBe(1);
  await page.getByRole('button',{name:'View collector'}).click();await expect(page.getByRole('dialog',{name:'Collector details'})).toBeVisible();await expect(page.locator('#detail-body')).toContainText('collector@example.test');await page.keyboard.press('Escape');await expect(page.locator('#detail-dialog')).not.toBeVisible();
});
test('catalogue change is confirmed, audited and safe to retry after uncertain delivery',async({page})=>{
  const f=await setup(page,{uncertain:true});await page.setViewportSize({width:390,height:844});await page.goto('/admin.html');await page.locator('[data-section="catalogue"]').click();await page.getByRole('button',{name:'Manage visibility'}).click();
  await page.locator('#change-value').selectOption('hidden');await page.locator('#change-reason').fill('Remove duplicated discovery entry');await page.locator('#confirm-change').click();await expect(page.locator('#change-status')).toContainText('Retry submits');
  await page.locator('#confirm-change').click();await expect(page.locator('#change-dialog')).not.toBeVisible();await expect(page.locator('#results')).toContainText('hidden');expect(f.writes()).toBe(1);
  const changes=f.requests.filter(r=>r.operation==='mutate');expect(changes).toHaveLength(2);expect(changes[0]).toEqual(changes[1]);
  await page.locator('[data-section="audit"]').click();await expect(page.locator('#results')).toContainText('Remove duplicated discovery entry');
});
test('support text is escaped and exchange timeline has no force controls',async({page})=>{
  await setup(page);await page.goto('/admin.html');await page.locator('[data-section="support"]').click();await expect(page.locator('#results')).toContainText('<img src=x onerror=bad()>');await expect(page.locator('#results img')).toHaveCount(0);
  await page.getByRole('button',{name:'Manage request'}).click();await expect(page.locator('#change-description')).toContainText('does not change the exchange');await page.locator('#cancel-change').click();
   await page.getByRole('button',{name:'View exchange'}).click();await expect(page.locator('#detail-body')).toContainText('mutual_handoff');await expect(page.locator('#detail-body')).toContainText('controlled by the collectors');await expect(page.getByRole('button',{name:/force|cancel exchange|complete exchange/i})).toHaveCount(0);
});
test('signout immediately erases private record and dialog content',async({page})=>{
  await setup(page);await page.goto('/admin.html');await page.locator('[data-section="members"]').click();await page.getByRole('button',{name:'View collector'}).click();await expect(page.locator('#detail-body')).toContainText('collector@example.test');
  await page.evaluate(()=>(window as any).__signout());await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#detail-dialog')).not.toBeVisible();await expect(page.locator('#detail-body')).toBeEmpty();await expect(page.locator('#results')).toBeEmpty();
});
test('switching accounts immediately clears private data before another authorization check',async({page})=>{
  await setup(page);await page.goto('/admin.html');await expect(page.locator('#dashboard')).toBeVisible();await page.evaluate(()=>(window as any).__authEvent('SIGNED_IN',{user:{id:'another-member'}}));await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#status')).toContainText('Account changed');
});
for(const enrolled of [false,true])test(`required authenticator flow ${enrolled?'verifies existing factor':'enrolls first factor'} before displaying private data`,async({page})=>{
  await setup(page,{mfa:true,enrolled});await page.goto('/admin.html');await expect(page.locator('#mfa-dialog')).toBeVisible();await expect(page.locator('#dashboard')).toBeHidden();
  if(!enrolled){await expect(page.locator('#mfa-setup')).toBeVisible();await expect(page.locator('#mfa-secret')).toContainText('test-setup-secret');}
  else await expect(page.locator('#mfa-setup')).toBeHidden();
  await page.locator('#mfa-code').fill('123456');await page.locator('#verify-mfa').click();await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#mfa-dialog')).not.toBeVisible();await expect(page.locator('#mfa-secret')).toBeEmpty();await expect(page.locator('#mfa-qr')).not.toHaveAttribute('src');
});
test('cancelled authenticator enrollment clears the setup key and removes only its new factor',async({page})=>{
  await setup(page,{mfa:true});await page.goto('/admin.html');await expect(page.locator('#mfa-secret')).toContainText('test-setup-secret');await page.locator('#cancel-mfa').click();await expect(page.locator('#mfa-dialog')).not.toBeVisible();await expect(page.locator('#mfa-secret')).toBeEmpty();await expect(page.locator('#mfa-qr')).not.toHaveAttribute('src');await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__unenrolled))).toBe(true);await expect(page.locator('#dashboard')).toBeHidden();
});

async function reliabilitySetup(page:Page) {
  const f=await setup(page);
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:`
    window.__auth={
      getSession:async()=>{if(window.__mode==='hung-session')return new Promise(resolve=>window.__late=resolve);return {data:{session:{access_token:'test-token',user:{id:'${id}'}}}};},
      getUser:async()=>{if(window.__mode==='hung-user')return new Promise(resolve=>window.__late=resolve);if(window.__mode==='outage')return {error:{status:503}};if(window.__mode==='revoked')return {error:{status:401,code:'session_not_found'}};return {data:{user:{id:'${id}'}}};},
      onAuthStateChange(fn){window.__authEvent=fn;return {data:{subscription:{unsubscribe(){}}}};}
    };window.supabase={createClient:()=>({auth:window.__auth})};` }));
  await page.goto('/admin.html');await expect(page.locator('#dashboard')).toBeVisible();
  await page.locator('[data-section="catalogue"]').click();await expect(page.getByRole('button',{name:'Manage visibility'})).toBeVisible();
  return f;
}
for(const mode of ['hung-session','hung-user'])test(`${mode} deadline ignores late SDK completion and disables new writes`,async({page})=>{
  const f=await reliabilitySetup(page);const before=f.requests.length;await page.clock.install();
  await page.evaluate(mode=>(window as any).__mode=mode,mode);await page.locator('#refresh').click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__late)).toBe('function');
  await page.clock.fastForward(15001);await expect(page.locator('#status')).toContainText('Stale view');await expect(page.locator('#refresh')).toBeEnabled();
  await expect(page.getByRole('button',{name:'Manage visibility'})).toBeDisabled();await expect(page.locator('#results')).toContainText(set.name);
  await page.evaluate(()=>{(window as any).__mode='';(window as any).__late({data:{session:{access_token:'late'},user:{id:'12345678-1234-1234-1234-123456789012'}}});});
  expect(f.requests.length).toBe(before);await page.locator('#refresh').click();await expect(page.getByRole('button',{name:'Manage visibility'})).toBeEnabled();
});
test('temporary auth outage retains same-account context but definitive revocation erases it',async({page})=>{
  await reliabilitySetup(page);await page.evaluate(()=>(window as any).__mode='outage');await page.locator('#refresh').click();
  await expect(page.locator('#status')).toContainText('Stale view');await expect(page.locator('#results')).toContainText(set.name);await expect(page.getByRole('button',{name:'Manage visibility'})).toBeDisabled();
  await page.evaluate(()=>(window as any).__mode='revoked');await page.locator('#refresh').click();await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();
});
for(const mode of ['hung-body','malformed'])test(`${mode} response fails safely without replacing authorized context`,async({page})=>{
  await reliabilitySetup(page);await page.clock.install();
  await page.evaluate(mode=>{const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);response.json=()=>mode==='hung-body'?new Promise(resolve=>(window as any).__lateBody=resolve):Promise.reject(new SyntaxError('invalid'));return response;};},mode);
  await page.locator('#refresh').click();
  if(mode==='hung-body'){await expect.poll(()=>page.evaluate(()=>typeof (window as any).__lateBody)).toBe('function');await page.clock.fastForward(15001);}
  await expect(page.locator('#status')).toContainText('Stale view');await expect(page.getByRole('button',{name:'Manage visibility'})).toBeDisabled();
  if(mode==='hung-body')await page.evaluate(()=>(window as any).__lateBody({rows:[],total:0,generated_at:'2026-10-06T12:00:00Z'}));
  await expect(page.locator('#results')).toContainText(set.name);
});
for(const event of ['SIGNED_OUT','TOKEN_REFRESHED'])test(`${event} while SDK request pending cannot restore private data`,async({page})=>{
  const f=await reliabilitySetup(page);const before=f.requests.length;await page.evaluate(()=>(window as any).__mode='hung-user');await page.locator('#refresh').click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__late)).toBe('function');
  await page.evaluate(event=>{(window as any).__authEvent(event,{user:{id:'another-account'}});(window as any).__late({data:{user:{id:'12345678-1234-1234-1234-123456789012'}}});},event);
  await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();expect(f.requests.length).toBe(before);
});
test('write committed before body timeout retains envelope across cancel and explicit retry',async({page})=>{
  const f=await setup(page);await page.goto('/admin.html');await page.locator('[data-section="catalogue"]').click();await page.getByRole('button',{name:'Manage visibility'}).click();
  await page.clock.install();await page.evaluate(()=>{const original=window.fetch;let lost=false;window.fetch=async(...args)=>{const response=await original(...args);if(String((args[1] as RequestInit)?.body).includes('"mutate"')&&!lost){lost=true;response.json=()=>new Promise(resolve=>(window as any).__lateWrite=resolve);}return response;};});
  await page.locator('#change-value').selectOption('hidden');await page.locator('#change-reason').fill('Remove duplicated discovery entry');await page.locator('#confirm-change').click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__lateWrite)).toBe('function');await page.clock.fastForward(15001);await expect(page.locator('#change-status')).toContainText('Retry submits');
  await page.locator('#cancel-change').click();await expect(page.locator('#status')).toContainText('did not roll back');await page.locator('#refresh').click();await expect(page.getByRole('button',{name:'Manage visibility'})).toBeEnabled();
  await page.getByRole('button',{name:'Manage visibility'}).click();await expect(page.locator('#change-reason')).toBeDisabled();await page.locator('#confirm-change').click();await expect(page.locator('#change-dialog')).not.toBeVisible();
  expect(f.writes()).toBe(1);const changes=f.requests.filter(r=>r.operation==='mutate');expect(changes).toHaveLength(2);expect(changes[0]).toEqual(changes[1]);
  await page.evaluate(()=>(window as any).__lateWrite({revision:1,audit_id:'late'}));await expect(page.locator('#results')).toContainText('hidden');
});
test('hung delivery has a whole-operation deadline and late response is ignored',async({page})=>{
  await reliabilitySetup(page);await page.clock.install();await page.evaluate(()=>{window.fetch=()=>new Promise(resolve=>(window as any).__lateFetch=resolve);});
  await page.locator('#refresh').click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__lateFetch)).toBe('function');await page.clock.fastForward(15001);
  await expect(page.locator('#status')).toContainText('timed out');await expect(page.locator('#refresh')).toBeEnabled();
  await page.evaluate(()=>(window as any).__lateFetch(new Response(JSON.stringify({rows:[],total:0,generated_at:'2026-10-06T12:00:00Z'}),{status:200})));
  await expect(page.locator('#results')).toContainText(set.name);await expect(page.getByRole('button',{name:'Manage visibility'})).toBeDisabled();
});
test('navigation ignores a previous pending SDK result without revealing its view',async({page})=>{
  const f=await reliabilitySetup(page);await page.evaluate(()=>(window as any).__mode='hung-user');await page.locator('#refresh').click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__late)).toBe('function');
  await page.evaluate(()=>(window as any).__mode='');await page.locator('[data-section="members"]').click();await expect(page.locator('#results')).toContainText('collector@example.test');
  const before=f.requests.length;await page.evaluate(()=>(window as any).__late({data:{user:{id:'12345678-1234-1234-1234-123456789012'}}}));
  await expect(page.locator('#results')).not.toContainText(set.name);expect(f.requests.length).toBe(before);
});
test('explicit denial erases content even when its body is malformed',async({page})=>{
  await reliabilitySetup(page);await page.route('**/functions/v1/admin-dashboard',route=>route.fulfill({status:403,body:'{',contentType:'application/json'}));await page.locator('#refresh').click();
  await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#refresh')).toBeEnabled();
});
test('MFA downgrade immediately clears private data on token refresh',async({page})=>{
  await reliabilitySetup(page);await page.evaluate(()=>(window as any).__authEvent('TOKEN_REFRESHED',{user:{id:'12345678-1234-1234-1234-123456789012'},access_token:`test.${btoa(JSON.stringify({aal:'aal1'}))}.signature`}));
  await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#status')).toContainText('Authenticator verification');
});
test('section navigation cancels a pending detail read and its late result',async({page})=>{
  const f=await reliabilitySetup(page);await page.locator('[data-section="members"]').click();await expect(page.getByRole('button',{name:'View collector'})).toBeVisible();
  await page.evaluate(()=>(window as any).__mode='hung-user');await page.getByRole('button',{name:'View collector'}).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__late)).toBe('function');
  await page.evaluate(()=>{(window as any).__mode='';(document.querySelector('[data-section="support"]') as HTMLButtonElement).click();});await expect(page.locator('#results')).toContainText('Please help');
  const before=f.requests.length;await page.evaluate(()=>(window as any).__late({data:{user:{id:'12345678-1234-1234-1234-123456789012'}}}));await expect(page.locator('#detail-dialog')).not.toBeVisible();await expect(page.locator('#detail-body')).toBeEmpty();expect(f.requests.length).toBe(before);
});
test('overview counts navigate equivalent structured views and age filters use explicit fields',async({page})=>{
  const f=await setup(page);await page.goto('/admin.html');await page.getByRole('button',{name:'Support to action'}).click();await expect(page.locator('#page-title')).toHaveText('Support desk');expect(f.requests.at(-1).filters).toEqual({status:'actionable'});
  await page.locator('#record-age').selectOption('older_7_days');await expect(page.locator('#refresh')).toBeEnabled();expect(f.requests.at(-1).filters).toEqual({status:'actionable',age:'older_7_days'});
  await page.locator('#record-status').selectOption('in_progress');await expect(page.locator('#refresh')).toBeEnabled();expect(f.requests.at(-1).filters.status).toBe('in_progress');
  await page.locator('[data-section="overview"]').click();await page.getByRole('button',{name:'Returns past due'}).click();await expect(page.locator('#page-title')).toHaveText('Exchange activity');expect(f.requests.at(-1).filters).toEqual({overdue:true});
  await page.locator('#clear-filters').click();await expect(page.locator('#refresh')).toBeEnabled();expect(f.requests.at(-1).filters).toEqual({});
  await page.locator('[data-section="overview"]').click();await page.getByRole('button',{name:'Wishlist items'}).click();await expect(page.locator('#page-title')).toHaveText('Wishlist items');expect(f.requests.at(-1).section).toBe('wishlist');
  expect(new URL(page.url()).search).toBe('');
});
test('missing overview metrics are unavailable rather than fabricated zero',async({page})=>{
  await setup(page);await page.route('**/functions/v1/admin-dashboard',route=>route.fulfill({json:{summary:{members:0},generated_at:'2026-10-06T12:00:00Z'}}));await page.goto('/admin.html');
  await expect(page.locator('[data-metric="members"] strong')).toHaveText('0');await expect(page.locator('[data-metric="overdue"] strong')).toHaveText('Unavailable');await expect(page.locator('[data-metric="overdue"]')).toBeDisabled();await expect(page.locator('.panel').first()).toContainText('Unavailable');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
test('member and event details reach past 100 and closing restores list search/page/focus',async({page})=>{
  const f=await setup(page);await page.goto('/admin.html');await page.locator('[data-section="members"]').click();await page.locator('#search').fill('Bengaluru');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.locator('#refresh')).toBeEnabled();await page.locator('#next').click();await expect(page.locator('#page-count')).toContainText('26–26');
  await page.getByRole('button',{name:'View collector'}).click();await expect(page.locator('#detail-body')).toContainText('Item 0');
  for(let i=0;i<5;i++){await page.getByRole('button',{name:'Next records'}).click();await expect(page.locator('#detail-body')).toContainText(`Item ${(i+1)*25}`);}
  await expect(page.getByRole('button',{name:'Next records'})).toBeDisabled();await expect(page.locator('#detail-body')).toContainText('126–126 of 126');
  await page.getByRole('button',{name:'Wishlist (126)'}).click();await expect(page.locator('#detail-body')).toContainText('Item 0');expect(f.requests.at(-1).part).toBe('wishlist');
  await page.keyboard.press('Escape');await expect(page.locator('#search')).toHaveValue('Bengaluru');await expect(page.locator('#page-count')).toContainText('26–26');await expect(page.getByRole('button',{name:'View collector'})).toBeFocused();
  await page.locator('[data-section="exchanges"]').click();await page.getByRole('button',{name:'View timeline'}).click();await expect(page.locator('#detail-body')).toContainText('version 126');
  for(let i=0;i<5;i++){await page.getByRole('button',{name:'Next records'}).click();await expect(page.locator('#detail-body')).toContainText(`version ${126-(i+1)*25}`);}
  await expect(page.getByRole('button',{name:'Next records'})).toBeDisabled();expect(f.requests.at(-1).page).toBe(5);
});
test('support detail separates status/history and append-only note retries after lost response and cancel',async({page})=>{
  const f=await setup(page);await page.goto('/admin.html');await page.locator('[data-section="support"]').click();await page.getByRole('button',{name:'View request',exact:true}).click();await expect(page.locator('#detail-body')).toContainText('does not resolve a peer issue');await expect(page.locator('#detail-body img')).toHaveCount(0);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const violations=(await new AxeBuilder({page}).analyze()).violations;expect(violations).toEqual([]);}
  await page.getByRole('button',{name:'Collector action timeline',exact:true}).click();await expect(page.locator('#detail-body')).toContainText('mutual_handoff');await page.getByRole('button',{name:'Admin note / status history'}).click();await expect(page.locator('#detail-body')).toContainText('No history yet');
  await page.getByRole('button',{name:'Add internal note'}).click();await page.locator('#change-reason').fill('Internal note <img src=x onerror=bad()>');await page.clock.install();
  await page.evaluate(()=>{const original=window.fetch;let lost=false;window.fetch=async(...args)=>{const response=await original(...args);if(String((args[1] as RequestInit)?.body).includes('"note"')&&!lost){lost=true;response.json=()=>new Promise(resolve=>(window as any).__lateNote=resolve);}return response;};});
  await page.locator('#confirm-change').click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__lateNote)).toBe('function');await page.clock.fastForward(15001);await expect(page.locator('#change-status')).toContainText('Retry submits');
  await expect(page.getByRole('button',{name:'Add internal note'})).toBeDisabled();await expect(page.getByRole('button',{name:'Change triage status'})).toBeDisabled();await expect(page.locator('#confirm-change')).toBeEnabled();
  await page.locator('#cancel-change').click();await page.locator('#close-detail').click();await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();await page.getByRole('button',{name:'View request',exact:true}).click();await expect(page.locator('#detail-body')).toContainText('Internal note <img src=x onerror=bad()>');await expect(page.locator('#detail-body img')).toHaveCount(0);
  await page.getByRole('button',{name:'Add internal note'}).click();await expect(page.locator('#change-reason')).toBeDisabled();await page.locator('#confirm-change').click();await expect(page.locator('#change-dialog')).not.toBeVisible();expect(f.writes()).toBe(1);const notes=f.requests.filter(r=>r.operation==='note');expect(notes).toHaveLength(2);expect(notes[0]).toEqual(notes[1]);
  await page.evaluate(()=>(window as any).__lateNote({revision:0,audit_id:'late'}));await expect(page.locator('#detail-dialog')).not.toBeVisible();
});
test('malformed record rows retain the last authorized snapshot and lock new changes',async({page})=>{
  await setup(page);await page.goto('/admin.html');await page.locator('[data-section="catalogue"]').click();await expect(page.locator('#results')).toContainText(set.name);
  await page.route('**/functions/v1/admin-dashboard',route=>route.fulfill({json:{generated_at:'2026-10-06T12:00:00Z',total:1,rows:[null]}}));await page.locator('#refresh').click();
  await expect(page.locator('#status')).toContainText('Stale view');await expect(page.locator('#results')).toContainText(set.name);await expect(page.getByRole('button',{name:'Manage visibility'})).toBeDisabled();
});
test('dark overview metric retains readable contrast on hover and keyboard focus',async({page})=>{
  await setup(page);await page.goto('/admin.html');const metric=page.locator('[data-metric="members"]');await expect(metric).toBeVisible();
  await metric.hover();await expect(metric).toHaveCSS('background-color','rgb(41, 45, 51)');await expect(metric.locator('strong')).toHaveCSS('color','rgb(255, 255, 255)');await expect(metric.locator('.metric-label')).toHaveCSS('color','rgb(224, 229, 233)');
  expect((await new AxeBuilder({page}).include('[data-metric="members"]').analyze()).violations).toEqual([]);
  await page.mouse.move(0,0);await metric.focus();await expect(metric).toBeFocused();await expect(metric).toHaveCSS('background-color','rgb(41, 45, 51)');
  expect((await new AxeBuilder({page}).include('[data-metric="members"]').analyze()).violations).toEqual([]);
});
test('support history crosses page boundaries and returns to the filtered list and opener',async({page})=>{
  const f=await setup(page,{history:26});await page.setViewportSize({width:390,height:844});await page.goto('/admin.html');await page.locator('[data-section="support"]').click();
  await page.locator('#record-status').selectOption('actionable');await expect(page.locator('#refresh')).toBeEnabled();await page.locator('#record-age').selectOption('older_7_days');await expect(page.locator('#refresh')).toBeEnabled();
  await page.locator('#search').fill(id);await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.locator('#refresh')).toBeEnabled();
  const opener=page.getByRole('button',{name:'View request',exact:true});await opener.scrollIntoViewIfNeeded();const position=await page.evaluate(()=>scrollY);await opener.click();await expect(page.locator('#detail-body')).toContainText('Internal history note 24');await expect(page.locator('#detail-body')).toContainText('1–25 of 26');
  await page.getByRole('button',{name:'Next records'}).click();await expect(page.locator('#detail-body')).toContainText('26–26 of 26');await expect(page.locator('#detail-body')).toContainText('Internal history note 25');await expect(page.locator('#detail-body')).not.toContainText('Internal history note 24');await expect(page.getByRole('button',{name:'Next records'})).toBeDisabled();expect(f.requests.at(-1).page).toBe(1);
  await page.getByRole('button',{name:'Previous records'}).click();await expect(page.locator('#detail-body')).toContainText('1–25 of 26');await expect(page.getByRole('button',{name:'Previous records'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(opener).toBeFocused();await expect(page.locator('#search')).toHaveValue(id);await expect(page.locator('#record-status')).toHaveValue('actionable');await expect(page.locator('#record-age')).toHaveValue('older_7_days');expect(await page.evaluate(()=>scrollY)).toBe(position);expect(new URL(page.url()).search).toBe('');
});
