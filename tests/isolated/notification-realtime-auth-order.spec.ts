import {test,expect} from './fixtures';

test('Realtime identity setup completes before exact recipient channel subscription',async({page})=>{
  await page.goto('/v2.html#home');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  const metrics=await page.evaluate(()=>window.__bcIsolated.metrics);
  expect(metrics.realtimeSetAuth).toBe(1);
  expect(metrics.realtimeOrder).toEqual([
    'setAuth:start',
    'setAuth:complete',
    'channel:create',
    'binding:user_id=eq.00000000-0000-4000-8000-000000000007',
    'channel:subscribe'
  ]);
});

test('delayed Realtime identity setup cannot race subscription and session loss aborts it',async({page})=>{
  await page.goto('/v2.html?isolated=realtime-delayed#home');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.realtimeOrder)).toEqual(['setAuth:start']);

  await page.evaluate(()=>{
    window.__bcIsolated.setSignedOut(true);
    window.__bcIsolated.emitAuth('SIGNED_OUT',null);
    window.__bcIsolated.releaseRealtimeAuth();
  });

  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.realtimeOrder.includes('channel:create'))).toBe(false);
});

test('sign-out removes the authenticated notification channel',async({page})=>{
  await page.goto('/v2.html#home');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    window.__bcIsolated.setSignedOut(true);
    window.__bcIsolated.emitAuth('SIGNED_OUT',null);
  });
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.removedChannels)).toBeGreaterThan(0);
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
});

test('30-second polling fallback reconciles a durable notification without a Realtime event',async({page})=>{
  await page.clock.install();
  await page.goto('/v2.html#home');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>window.__bcIsolated.notifications.unshift({
    id:'poll-note-1',
    user_id:'00000000-0000-4000-8000-000000000007',
    kind:'exchange_proposed',
    title:'Durable proposal',
    body:'A durable proposal arrived while Realtime was unavailable.',
    exchange_case_id:'proposal-request-1',
    metadata:{exchange_case_id:'proposal-request-1'},
    read_at:null,
    created_at:'2026-09-03T12:00:00.000Z'
  }));
  await page.clock.fastForward(30_000);
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
});

declare global {interface Window {__bcIsolated:any}}
