import assert from 'node:assert/strict';
import { expect as playwrightExpect } from '@playwright/test';
import { inspectConversationUx } from './ux-mobile-journey.mjs';

const expect = playwrightExpect.configure({ timeout: 30000 });

// Public-key reads only. Never promote a collector or borrow an admin credential.
export async function verifyCollectorPermissions(sessions) {
  assert.equal(sessions.length, 3);
  assert.equal(new Set(sessions.map(s => s.id)).size, 3);
  for (const session of sessions) {
    const admin = await session.client.rpc('is_exchange_admin');
    assert.ifError(admin.error);
    assert.equal(admin.data, false, 'Disposable collectors must not have admin privileges');
    const profile = await session.client.from('profiles').select('id,adult_confirmed_at,country,city').eq('id', session.id).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.id, session.id);
    assert.ok(profile.data.adult_confirmed_at && profile.data.country && profile.data.city,
      'Bootstrap registration must prepare adult/local matching eligibility');
  }
}

export function assertCancelledFixture(row, items, expectedIds) {
  assert.equal(row.state, 'CANCELLED');
  assert.equal(expectedIds.length, 2);
  assert.equal(new Set(expectedIds).size, 2);
  assert.deepEqual(new Set([row.item_a, row.item_b]), new Set(expectedIds));
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(expectedIds));
  assert.equal(items.length, 2);
  assert.ok(items.every(item => item.available_for_exchange === true));
}

export async function browserCollection(page, ownedItems) {
  assert.equal(ownedItems.length, 2);
  await page.evaluate(() => { window.bcClose(); window.bcNav('sets'); });
  for (const item of ownedItems) {
    const availability = page.locator(`[data-exchangeable="${item.id}"]`);
    await expect(availability).toBeVisible();
    await expect(availability).toBeChecked();
    await expect(page.locator(`[data-edit-set="${item.id}"]`)).toBeVisible();
  }
  await inspectConversationUx(page, { phase: 'owned-collection' });
}

export async function browserCancellation({ pa, pb, case2, a, items }, substage = () => {}) {
  const open = async page => {
    await page.evaluate(id => { window.bcClose(); window.bcNav('messages', `case:${id}`); }, case2);
    await expect(page.locator('#bc-case-destination')).toHaveValue(case2);
    await expect(page.locator('#bc-msg-form')).toBeVisible();
    const refresh = page.locator('[data-refresh-thread]');
    await refresh.click();
    await expect(refresh).toBeEnabled();
  };
  substage('accept disposable second case');
  await open(pb);
  await pb.locator('[data-thread-case-action="accept"]').click();
  await expect(pb.locator('[data-thread-case-action="accept"]')).toHaveCount(0);
  substage('cancel before handoff');
  await open(pa);
  substage('open cancellation options');
  await pa.getByText('Other options', { exact: true }).click();
  const respond = dialog => dialog.accept(dialog.type() === 'prompt' ? 'Disposable UX fixture cancellation' : undefined);
  // Restore the parent harness's custody-dialog handlers exactly.
  const listeners = pa.listeners('dialog');
  for (const listener of listeners) pa.off('dialog', listener);
  pa.on('dialog', respond);
  try {
    substage('submit cancellation reason');
    await pa.locator('[data-thread-case-action="cancel_before_handoff"]').click();
    await expect(pa.locator('#bc-msg-form')).toBeHidden();
  } finally {
    pa.off('dialog', respond);
    for (const listener of listeners) pa.on('dialog', listener);
  }
  substage('canonical cancellation releases exact fixture items');
  const state = await a.client.from('exchange_cases').select('state,item_a,item_b').eq('id', case2).single();
  assert.ifError(state.error);
  const ids = items.slice(2).map(item => item.id);
  const released = await a.client.from('collection_items').select('id,available_for_exchange').in('id', ids);
  assert.ifError(released.error);
  assertCancelledFixture(state.data, released.data, ids);
  await inspectConversationUx(pa, { phase: 'exchange-cancelled', mode: 'closed' });
  substage('peer sees closed archive');
  await pb.locator('[data-refresh-thread]').click();
  await expect(pb.locator('#bc-msg-form')).toBeHidden();
  await inspectConversationUx(pb, { phase: 'peer-cancelled', mode: 'closed' });
}
