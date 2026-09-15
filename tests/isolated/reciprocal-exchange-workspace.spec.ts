import fs from 'node:fs';
import {test,expect} from './fixtures';

test('reciprocal exchanges use one scoped shared workspace without replacing server-owned transitions',async()=>{
  const source=fs.readFileSync('app-v3.js','utf8');
  for(const contract of [
    'function sharedChecklist',
    'Shared live checklist',
    'You: ${mine',
    'Other collector: ${theirs',
    'function startExchangeRealtime(exchangeId)',
    "table:'exchanges',filter:`id=eq.${id}`",
    "table:'exchange_meetups',filter:`exchange_id=eq.${id}`",
    "table:'exchange_returns',filter:`exchange_id=eq.${id}`",
    "table:'messages',filter:`exchange_id=eq.${id}`",
    "db.rpc('create_exchange_request'",
    'data-request-card="${attr(r.id)}"',
    "if(e.state==='released')",
    'stopExchangeRealtime();stopNotificationRealtime()'
  ])expect(source).toContain(contract);
  expect(source).not.toContain("db.from('exchange_requests').insert");
  expect(source).not.toContain('startNotificationRealtime();startExchangeRealtime()');
});

test('the open exchange owns one realtime channel and releases it when the user leaves',async({page})=>{
  await page.goto('/v2.html?isolated=workspace#exchange/ex1');
  await expect(page.getByRole('heading',{name:/McLaren P1/})).toBeVisible();
  await expect(page.getByRole('region',{name:'Shared exchange checklist'})).toContainText('You: confirmed');
  await expect(page.getByRole('region',{name:'Shared exchange checklist'})).toContainText('Other collector: waiting');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(2);
  await page.locator('[data-nav="home"]').first().click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelRemovals)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(2);
});
