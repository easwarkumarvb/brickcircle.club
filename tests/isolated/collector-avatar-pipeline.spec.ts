import {test,expect} from './fixtures';

const pixel=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');

test('reciprocal match renders the collector provider avatar from public_profiles',async({page})=>{
  await page.route('https://lh3.googleusercontent.com/**',route=>route.fulfill({status:200,contentType:'image/gif',body:pixel}));
  await page.goto('/v2.html?isolated=match-avatar-provider#matches');
  const avatar=page.locator('.bc-match .bc-mini-avatar [data-avatar-media]');
  await expect(avatar).toHaveClass(/bc-avatar-ready/);
  await expect(avatar.locator('[data-avatar-image]')).toHaveAttribute('src','https://lh3.googleusercontent.com/brickcircle-test-avatar');
  await expect(page.locator('.bc-match')).toContainText('Match Collector');
});

test('reciprocal match falls back to collector initials when no avatar exists',async({page})=>{
  await page.goto('/v2.html?isolated=match-avatar-none#matches');
  const avatar=page.locator('.bc-match .bc-mini-avatar [data-avatar-media]');
  await expect(avatar).toContainText('M');
  await expect(avatar.locator('[data-avatar-image]')).toHaveCount(0);
});

test('broken provider avatar falls back cleanly to initials',async({page})=>{
  await page.route('https://lh3.googleusercontent.com/**',route=>route.abort());
  await page.goto('/v2.html?isolated=match-avatar-broken#matches');
  const avatar=page.locator('.bc-match .bc-mini-avatar [data-avatar-media]');
  await expect(avatar).toContainText('M');
  await expect(avatar.locator('[data-avatar-image]')).toHaveCount(0);
  await expect(avatar).not.toHaveClass(/bc-avatar-ready/);
});

test('failed profile persistence cleans up the newly uploaded avatar object',async({page})=>{
  await page.goto('/v2.html?isolated=avatar-upload-existing#profile');
  await page.evaluate(()=>window.__bcIsolated.failTables.push('profiles'));
  await page.locator('#bc-avatar-input').setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:Buffer.from('avatar-replacement')});
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.storage.uploads.length)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>{
    const state=window.__bcIsolated,uploaded=state.storage.uploads[0];
    return state.storage.removals.includes(uploaded);
  })).toBe(true);
  expect(await page.evaluate(()=>window.__bcIsolated.profile.avatar_url)).toBe('00000000-0000-4000-8000-000000000007/old-profile.jpg');
});

test('successful avatar replacement removes the previous owned object only after profile update',async({page})=>{
  await page.goto('/v2.html?isolated=avatar-upload-existing#profile');
  await page.locator('#bc-avatar-input').setInputFiles({name:'replacement.webp',mimeType:'image/webp',buffer:Buffer.from('avatar-replacement')});
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.profile.avatar_url)).not.toBe('00000000-0000-4000-8000-000000000007/old-profile.jpg');
  const state=await page.evaluate(()=>({profile:window.__bcIsolated.profile,removals:window.__bcIsolated.storage.removals,uploads:window.__bcIsolated.storage.uploads}));
  expect(state.profile.avatar_url).toBe(state.uploads[0]);
  expect(state.profile.avatar_source).toBe('upload');
  expect(state.removals).toContain('00000000-0000-4000-8000-000000000007/old-profile.jpg');
  expect(state.removals).not.toContain(state.uploads[0]);
});

test('replacing a provider avatar never tries to delete the external provider URL',async({page})=>{
  await page.route('https://lh3.googleusercontent.com/**',route=>route.fulfill({status:200,contentType:'image/gif',body:pixel}));
  await page.goto('/v2.html?isolated=avatar-provider-existing#profile');
  await page.locator('#bc-avatar-input').setInputFiles({name:'mine.png',mimeType:'image/png',buffer:Buffer.from('avatar-upload')});
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.storage.uploads.length)).toBe(1);
  const removals=await page.evaluate(()=>window.__bcIsolated.storage.removals);
  expect(removals).not.toContain('https://lh3.googleusercontent.com/original-provider-avatar');
});

test('session restore invokes the self-scoped provider avatar sync RPC',async({page})=>{
  await page.goto('/v2.html?isolated=match-avatar-none#home');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.rpcCalls.filter((call:{name:string})=>call.name==='sync_my_provider_avatar').length)).toBeGreaterThan(0);
});

test('match identity is hydrated from the sanitized public projection only',async({page})=>{
  await page.goto('/v2.html?isolated=match-avatar-none#matches');
  await expect(page.locator('.bc-match')).toBeVisible();
  const queries=await page.evaluate(()=>window.__bcIsolated.queries) as Array<{table:string;filters:Array<[string,unknown]>}>;
  expect(queries.some(q=>q.table==='public_profiles')).toBe(true);
  expect(queries.some(q=>q.table==='auth.users')).toBe(false);
  expect(queries.some(q=>q.table==='profiles'&&q.filters.some(([,value])=>value==='00000000-0000-4000-8000-000000000099'))).toBe(false);
});

declare global {interface Window {__bcIsolated:any}}
