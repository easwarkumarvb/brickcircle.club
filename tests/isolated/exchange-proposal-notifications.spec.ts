import {test,expect} from './fixtures';

test('stored unread proposal appears on login and opens the exact request',async({page})=>{
  await page.goto('/v2.html?isolated=proposal#home');

  const notice=page.locator('#bc-overlay');
  await expect(notice).toContainText('You have a new exchange proposal');
  await expect(notice).toContainText('Ramya proposed an exchange with you.');
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');

  await notice.getByRole('button',{name:'View proposal'}).click();
  await expect(page).toHaveURL(/#exchanges\/proposal-request-1$/);
  await expect(page.locator('[data-request-card="proposal-request-1"]')).toContainText('Incoming proposal');
  await expect(page.locator('[data-request-card="proposal-request-1"]')).toContainText('Ramya');
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.notifications[0].read_at)).not.toBeNull();
});

test('proposal created while signed out remains durable and appears after later sign-in',async({page})=>{
  await page.goto('/v2.html?isolated=proposal-offline#home');
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.locator('[data-open="notifications"]')).toHaveCount(0);
  await expect(page.locator('#bc-overlay')).toHaveCount(0);
  await expect(page.locator('#bc-exchange-lifecycle-notice')).toHaveCount(0);
  await expect(page.locator('.bc-match-login-notice')).toHaveCount(0);

  await page.locator('[data-auth]').first().click();
  await page.locator('#bc-email-signin [name="email"]').fill('easwar@example.invalid');
  await page.locator('#bc-email-signin [name="password"]').fill('password123');
  await page.locator('#bc-email-signin').getByRole('button',{name:'Sign in'}).click();

  await expect(page.locator('#bc-overlay')).toContainText('Ramya proposed an exchange with you.');
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
});

test('refresh preserves one durable unread row without repeating the login interruption',async({page})=>{
  await page.goto('/v2.html?isolated=proposal#home');
  await expect(page.locator('#bc-overlay')).toContainText('new exchange proposal');
  await page.locator('#bc-overlay').getByRole('button',{name:'Not now'}).click();

  await page.reload();
  await expect(page.locator('#bc-overlay')).toHaveCount(0);
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
  expect(await page.evaluate(()=>window.__bcIsolated.notifications.filter((item:any)=>item.entity_id==='proposal-request-1').length)).toBe(1);
});

test('cancelled request is presented once as lifecycle—not as a new proposal',async({page})=>{
  await page.goto('/v2.html#home');
  await page.evaluate(()=>{
    const state=window.__bcIsolated;
    const userId='00000000-0000-4000-8000-000000000007';
    const request={id:'cancelled-request-1',requester_id:'00000000-0000-4000-8000-000000000099',responder_id:userId,offered_item_id:'other-item-1',requested_item_id:'c1',duration_days:60,status:'cancelled',created_at:'2026-09-03T12:00:00.000Z'};
    state.requests.unshift(request);
    state.notifications.unshift(
      {id:'cancel-note-1',user_id:userId,kind:'exchange_cancelled',title:'Proposal closed — set unavailable',body:'This proposal was closed because one of the physical LEGO sets is already in an active exchange.',entity_type:'exchange_request',entity_id:request.id,metadata:{exchange_request_id:request.id,route:'#exchanges'},read_at:null,created_at:'2026-09-03T12:01:00.000Z'},
      {id:'stale-proposal-note-1',user_id:userId,kind:'request_received',title:'New exchange proposal',body:'Ramya proposed an exchange with you.',entity_type:'exchange_request',entity_id:request.id,metadata:{exchange_request_id:request.id,route:'#exchanges/cancelled-request-1'},read_at:null,created_at:request.created_at}
    );
    window.dispatchEvent(new Event('online'));
  });

  const lifecycle=page.locator('#bc-exchange-lifecycle-notice');
  await expect(lifecycle).toContainText('Proposal cancelled');
  await expect(lifecycle).toContainText('Proposal closed — set unavailable');
  await expect(page.locator('#bc-overlay')).toHaveCount(0);
  await expect(page.getByText('You have a new exchange proposal')).toHaveCount(0);
});

test('session loss immediately removes member notification surfaces',async({page})=>{
  await page.goto('/v2.html?isolated=proposal#home');
  await expect(page.locator('#bc-overlay')).toContainText('You have a new exchange proposal');

  await page.evaluate(()=>{
    window.__bcIsolated.setSignedOut(true);
    window.__bcIsolated.emitAuth('SIGNED_OUT',null);
  });

  await expect(page.locator('#bc-overlay')).toHaveCount(0);
  await expect(page.locator('#bc-exchange-lifecycle-notice')).toHaveCount(0);
  await expect(page.locator('.bc-match-login-notice')).toHaveCount(0);
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
});

test('online recipient receives a live badge and clean proposal notification',async({page})=>{
  await page.goto('/v2.html#home');
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveCount(0);

  await page.evaluate(()=>{
    const state=window.__bcIsolated;
    const request={id:'live-request-1',requester_id:'00000000-0000-4000-8000-000000000099',responder_id:'00000000-0000-4000-8000-000000000007',offered_item_id:'other-item-1',requested_item_id:'c1',duration_days:60,status:'pending',created_at:'2026-09-03T12:00:00.000Z'};
    state.requests.unshift(request);
    state.emitNotification({id:'live-note-1',user_id:request.responder_id,kind:'request_received',title:'New exchange proposal',body:'Ramya proposed an exchange with you.',actor_user_id:request.requester_id,entity_type:'exchange_request',entity_id:request.id,metadata:{exchange_request_id:request.id,route:'#exchanges/live-request-1'},read_at:null,created_at:request.created_at});
  });

  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
  await expect(page.locator('.bc-toast')).toContainText('Ramya proposed an exchange with you.');
  await page.locator('[data-open="notifications"]').click();
  const notification=page.locator('[data-note="live-note-1"]');
  await expect(notification).toContainText('New exchange proposal');
  await expect(notification).toContainText('View proposal');
  await notification.click();
  await expect(page).toHaveURL(/#exchanges\/live-request-1$/);
  await expect(page.locator('[data-request-card="live-request-1"]')).toBeVisible();
});

test('existing reciprocal-match login notice still appears when no proposal is unread',async({page})=>{
  await page.goto('/v2.html?isolated=matched#home');
  await expect(page.locator('.bc-match-login-notice')).toContainText('New local match found');
  await expect(page.locator('.bc-match-login-notice')).toContainText('Match Collector');
});

declare global {interface Window {__bcIsolated:any}}
