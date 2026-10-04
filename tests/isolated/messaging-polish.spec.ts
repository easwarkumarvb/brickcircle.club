import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
const UID='00000000-0000-4000-8000-000000000007';
const PEER='00000000-0000-4000-8000-000000000099';
const OTHER='00000000-0000-4000-8000-000000000098';
const CASE='20000000-0000-4000-8000-000000000001';
async function seed(page:Page,count=3,stateName='PROPOSED'){
  await page.goto('/v2.html?isolated=matched#home');
  await expect(page.getByRole('button',{name:'View my match'}).first()).toBeVisible();
  await page.evaluate(({uid,peer,other,caseId,count,stateName})=>{
    const s=(window as any).__bcIsolated;
    s.publicProfiles=[{id:peer,display_name:'Match Collector',city:'Bengaluru',country:'India'},{id:other,display_name:'Older Collector',city:'Mumbai',country:'India'}];
    s.messages=Array.from({length:count},(_,i)=>({id:'d'+String(count-i).padStart(5,'0'),sender_id:peer,recipient_id:uid,exchange_id:null,body:'Direct '+String(i).padStart(4,'0'),created_at:new Date(Date.UTC(2026,8,3,12,0,i)).toISOString()}));
    s.messages.push({id:'case-msg',case_id:caseId,sender_id:peer,recipient_id:uid,body:'Exchange meetup plan',created_at:'2026-09-03T13:00:00.000Z'});
    s.exchanges=[{id:caseId,user_a:uid,user_b:peer,proposer_id:uid,recipient_id:peer,item_a:'c1',item_b:'other-item-1',duration_days:60,state:stateName,state_version:1,created_at:'2026-09-03T12:00:00.000Z',updated_at:'2026-09-03T12:00:00.000Z'}];
    location.hash='messages';
  },{uid:UID,peer:PEER,other:OTHER,caseId:CASE,count,stateName});
  await expect(page.locator('.bc-msg-row')).toHaveCount(count?2:1);
  await expect(page.locator('#bc-first-match-coach')).toHaveCount(0);
  await expect(page.locator('.bc-match-login-notice')).toHaveCount(0);
}
async function openDirect(page:Page){
  await page.evaluate(peer=>{location.hash='messages/direct:'+peer},PEER);
  await expect(page.locator('#bc-msg-form')).toBeVisible();
}
async function noOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}
test('mobile conversations separate direct and exchange chats with incoming unread badges',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page);
  await expect(page.locator('.bc-mobile-nav [data-nav="messages"] .bc-badge')).toHaveText('4');
  await page.getByRole('button',{name:'Collectors',exact:true}).click();
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await expect(page.locator('.bc-msg-row')).toContainText('Direct 0002');
  await page.locator('[data-msg-filter="exchanges"]').click();
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await expect(page.locator('.bc-msg-row')).toContainText('Exchange meetup plan');
  await page.locator('[data-msg-filter="all"]').click();
  await openDirect(page);
  await expect(page.locator('#bc-msg-chat')).not.toContainText('Exchange meetup plan');
  await expect(page.locator('.bc-mobile-nav [data-nav="messages"] .bc-badge')).toHaveText('1');
  await page.getByRole('button',{name:'Back to Messages'}).click();
  await page.locator('[data-msg-filter="unread"]').click();
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({path:'test-results/messages-mobile-list.png',fullPage:true});
});
test('direct sends restore composer and failures preserve the unsent draft',async({page})=>{
  await seed(page);await openDirect(page);
  const input=page.locator('#bc-msg-form textarea'),send=page.locator('#bc-msg-form button');
  for(const text of ['First reply','Second reply']){
    await input.fill(text);await send.click();
    await expect(page.locator('#bc-msg-chat')).toContainText(text);
    await expect(input).toBeEnabled();await expect(input).toHaveValue('');
  }
  await page.evaluate(()=>{(window as any).__bcIsolated.failTables=['messages']});
  await input.fill('Keep this draft');await send.click();
  await expect(page.locator('#bc-msg-error')).toBeVisible();
  await expect(input).toHaveValue('Keep this draft');await expect(send).toBeEnabled();
  await page.evaluate(()=>{(window as any).__bcIsolated.failTables=[]});
  await send.click();await expect(page.locator('#bc-msg-chat')).toContainText('Keep this draft');
  expect(await page.evaluate(()=>(window as any).__bcIsolated.messages.filter((m:any)=>m.body==='Keep this draft').length)).toBe(1);
});
test('history uses timestamp ordering, cursor ties and keeps loaded messages after sending',async({page})=>{
  await seed(page,60);await openDirect(page);
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(50);
  await expect(page.locator('#bc-msg-chat .bc-msg').first()).toContainText('Direct 0010');
  await page.getByRole('button',{name:'Load earlier messages'}).click();
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(60);
  await page.locator('#bc-msg-form textarea').fill('History stays');await page.locator('#bc-msg-form button').click();
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(61);
  await expect(page.locator('#bc-msg-chat .bc-msg').first()).toContainText('Direct 0000');
});
test('older collectors remain discoverable behind more than 1000 recent messages',async({page})=>{
  await seed(page,1005);
  await page.evaluate(({uid,other})=>{
    (window as any).__bcIsolated.messages.push({id:'oldest-peer',sender_id:other,recipient_id:uid,exchange_id:null,body:'Older conversation',created_at:'2026-09-01T00:00:00.000Z'});
  },{uid:UID,other:OTHER});
  await page.locator('[data-refresh-messages-list]').click();
  await expect(page.locator('.bc-msg-row')).toHaveCount(3);
  await expect(page.locator('[data-message-open="direct:'+OTHER+'"]')).toContainText('Older conversation');
});
test('closed exchanges keep history read-only and expose recoverable load failures',async({page})=>{
  await seed(page,3,'COMPLETED');
  await page.evaluate(id=>{location.hash='messages/case:'+id},CASE);
  await expect(page.locator('#bc-msg-chat')).toContainText('Exchange meetup plan');
  await expect(page.locator('#bc-msg-form')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).__bcIsolated.failTables=['exchange_case_messages']});
  await page.locator('[data-refresh-thread]').click();
  await expect(page.locator('#bc-msg-error')).toBeVisible();
  await expect(page.locator('#bc-msg-error').getByRole('button',{name:'Retry'})).toBeVisible();
  await page.evaluate(()=>{(window as any).__bcIsolated.failTables=[]});
  await page.locator('#bc-msg-error').getByRole('button',{name:'Retry'}).click();
  await expect(page.locator('#bc-msg-error')).toBeHidden();
  await expect(page.locator('#bc-msg-chat')).toContainText('Exchange meetup plan');
});
test('refresh preserves draft, focus, caret and loaded history',async({page})=>{
  await seed(page,60);await openDirect(page);await page.getByRole('button',{name:'Load earlier messages'}).click();
  const input=page.locator('#bc-msg-form textarea');
  await input.fill('Unsent multiline\nreply');await input.focus();
  await input.evaluate((e:HTMLTextAreaElement)=>e.setSelectionRange(4,9));
  await page.evaluate(()=>{const s=(window as any).__bcIsolated;s.messages.push({id:'remote-new',sender_id:'00000000-0000-4000-8000-000000000099',recipient_id:'00000000-0000-4000-8000-000000000007',exchange_id:null,body:'New remote reply',created_at:'2026-09-03T14:00:00.000Z'});(document.querySelector('[data-refresh-thread]') as HTMLButtonElement).click()});
  await expect(page.locator('#bc-msg-chat')).toContainText('New remote reply');
  await expect(input).toHaveValue('Unsent multiline\nreply');await expect(input).toBeFocused();
  expect(await input.evaluate((e:HTMLTextAreaElement)=>[e.selectionStart,e.selectionEnd])).toEqual([4,9]);
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(61);
});
test('delayed send survives back navigation without duplicate insertion or a stuck composer',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page);await openDirect(page);
  await page.evaluate(()=>{(window as any).__bcIsolated.messageSendDelayMs=4000});
  await page.locator('#bc-msg-form textarea').fill('Delayed once');await page.locator('#bc-msg-form button').click();
  await page.getByRole('button',{name:'Back to Messages'}).click();await openDirect(page);
  await expect(page.locator('#bc-msg-form button')).toBeDisabled();
  await expect(page.locator('#bc-msg-form button')).toBeEnabled({timeout:5000});
  await page.locator('[data-refresh-thread]').click();
  await expect(page.locator('#bc-msg-chat')).toContainText('Delayed once');
  expect(await page.evaluate(()=>(window as any).__bcIsolated.messages.filter((m:any)=>m.body==='Delayed once').length)).toBe(1);
});
test('a slow conversation load cannot revive a route after navigating away',async({page})=>{
  await seed(page);
  await page.evaluate(peer=>{(window as any).__bcIsolated.messageReadDelayMs=700;location.hash='messages/direct:'+peer},PEER);
  await expect(page.getByText('Opening conversation…', {exact:true})).toBeVisible();
  await page.evaluate(()=>{location.hash='catalogue'});
  await expect(page.locator('.bc-catalogue-tools')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/#catalogue$/);await expect(page.locator('#bc-msg-chat')).toHaveCount(0);
});
test('direct message notifications open the sender conversation',async({page})=>{
  await seed(page);
  await page.evaluate(({uid,peer})=>{const s=(window as any).__bcIsolated;s.emitNotification({id:'dm-note',user_id:uid,kind:'message_received',actor_user_id:peer,title:'New message',body:'A collector replied',created_at:'2026-09-03T15:00:00.000Z',read_at:null})},{uid:UID,peer:PEER});
  await page.locator('[data-open="notifications"]').click();
  await page.locator('[data-note="dm-note"]').click();
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/direct:'+PEER);
  await expect(page.locator('#bc-msg-form')).toBeVisible();
});
test('mobile and desktop messaging layouts fit the viewport with labelled controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seed(page);await openDirect(page);await noOverflow(page);
  const input=page.getByRole('textbox',{name:'Message Match'});
  await expect(input).toBeVisible();
  expect(await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  for(const selector of ['#bc-msg-form button','[data-refresh-thread]','.bc-thread-back']){
    const box=await page.locator(selector).boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({path:'test-results/messages-mobile-thread.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await noOverflow(page);
  await expect(page.locator('.bc-messages-list-pane')).toBeVisible();
  await expect(page.locator('.bc-messages-thread-pane')).toBeVisible();
  await page.locator('[data-msg-filter="all"]').focus();
  expect(await page.locator('[data-msg-filter="all"]').evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
  await page.screenshot({path:'test-results/messages-desktop-thread.png',fullPage:true});
});

test('equal-timestamp history uses the id cursor without losing or duplicating messages',async({page})=>{
  await seed(page,55);
  await page.evaluate(({uid,peer})=>{
    const s=(window as any).__bcIsolated;
    s.messages=s.messages.filter((m:any)=>m.case_id);
    for(let i=0;i<55;i++)s.messages.push({id:'tie-'+String(i).padStart(3,'0'),sender_id:peer,recipient_id:uid,exchange_id:null,body:'Tie '+String(i).padStart(3,'0'),created_at:'2026-09-03T12:00:00.000Z'});
  },{uid:UID,peer:PEER});
  await openDirect(page);
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(50);
  await expect(page.locator('#bc-msg-chat .bc-msg').first()).toContainText('Tie 005');
  await page.getByRole('button',{name:'Load earlier messages'}).click();
  await expect(page.locator('#bc-msg-chat .bc-msg')).toHaveCount(55);
  await expect(page.locator('#bc-msg-chat .bc-msg').first()).toContainText('Tie 000');
  await expect(page.locator('#bc-msg-chat .bc-msg').last()).toContainText('Tie 054');
});
