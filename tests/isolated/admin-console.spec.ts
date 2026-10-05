import {test,expect,Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const id='12345678-1234-1234-1234-123456789012';
const set={set_number:'42115-1',name:'Lamborghini Sián',theme:'Technic',year:2020,piece_count:3696,catalog_active:true,revision:0};
async function setup(page:Page,{denied=false,mfa=false,enrolled=false,uncertain=false}={}){
  const requests:any[]=[];let writes=0,verified=!mfa;let current={...set};const audit:any[]=[];
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}}),getUser:async()=>({data:{user:{id:'${id}'}}}),onAuthStateChange(fn){window.__signout=()=>fn('SIGNED_OUT');return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({}),mfa:{listFactors:async()=>({data:{totp:${enrolled?'[{id:"factor",status:"verified"}]':'[]'}}}),enroll:async()=>({data:{id:'factor',totp:{qr_code:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',secret:'test-setup-secret'}}}),challengeAndVerify:async()=>{window.__verified=true;return {};},unenroll:async()=>{window.__unenrolled=true;return {};}}}}}};`}));
  await page.route('**/functions/v1/admin-dashboard',async route=>{
    const body=route.request().postDataJSON();requests.push(body);
    if(denied){await route.fulfill({status:403,json:{error:'Administrator access required.'}});return;}
    if(!verified){verified=await page.evaluate(()=>Boolean((window as any).__verified));if(!verified){await route.fulfill({status:403,json:{error:'Authenticator required',code:'mfa_required'}});return;}}
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
    if(body.section==='audit')data={...data,total:audit.length,rows:audit};
    if(body.section==='member_detail')data={member:{id,display_name:'Collector',email:'collector@example.test'},collection_total:0,wishlist_total:0,collection:[],wishlist:[]};
    if(body.section==='exchange_detail')data={exchange:{id,state:'ACTIVE',state_version:2},events:[{event_type:'mutual_handoff',previous_state:'ACCEPTED',resulting_state:'ACTIVE',state_version:2,created_at:'2026-10-05T12:00:00Z'}]};
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
  await page.getByRole('button',{name:'View exchange'}).click();await expect(page.locator('#detail-body')).toContainText('mutual_handoff');await expect(page.locator('#detail-body button')).toHaveCount(0);
});
test('signout immediately erases private record and dialog content',async({page})=>{
  await setup(page);await page.goto('/admin.html');await page.locator('[data-section="members"]').click();await page.getByRole('button',{name:'View collector'}).click();await expect(page.locator('#detail-body')).toContainText('collector@example.test');
  await page.evaluate(()=>(window as any).__signout());await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#detail-dialog')).not.toBeVisible();await expect(page.locator('#detail-body')).toBeEmpty();await expect(page.locator('#results')).toBeEmpty();
});
for(const enrolled of [false,true])test(`required authenticator flow ${enrolled?'verifies existing factor':'enrolls first factor'} before displaying private data`,async({page})=>{
  await setup(page,{mfa:true,enrolled});await page.goto('/admin.html');await expect(page.locator('#mfa-dialog')).toBeVisible();await expect(page.locator('#dashboard')).toBeHidden();
  if(!enrolled){await expect(page.locator('#mfa-setup')).toBeVisible();await expect(page.locator('#mfa-secret')).toContainText('test-setup-secret');}
  else await expect(page.locator('#mfa-setup')).toBeHidden();
  await page.locator('#mfa-code').fill('123456');await page.locator('#verify-mfa').click();await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#mfa-dialog')).not.toBeVisible();await expect(page.locator('#mfa-secret')).toBeEmpty();await expect(page.locator('#mfa-qr')).not.toHaveAttribute('src');
});
