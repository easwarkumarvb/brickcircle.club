import {test,expect} from './fixtures';

test('Google auth uses the supported OAuth contract and stays on loopback',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out');
  await page.locator('[data-auth]').first().click();
  await page.locator('[data-oauth="google"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/v2\.html\?isolated=oauth-complete/);
  const options=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bc_isolated_oauth')||'null'));
  expect(options).toMatchObject({provider:'google',options:{skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
  expect(options.options.redirectTo).toBe('http://127.0.0.1:4173/v2.html');
});

test('new collector completes onboarding through the canonical reliability layer',async({page})=>{
  await page.goto('/v2.html?isolated=onboarding');
  const form=page.locator('#bc-onboard');
  await expect(form).toBeVisible();
  await form.locator('[name="name"]').fill('New Collector');
  await form.locator('[name="country"]').selectOption('India');
  await form.locator('[name="city"]').selectOption('Bengaluru');
  await form.locator('[name="adult_confirmation"]').check();
  await form.locator('button').click();
  await expect(page).toHaveURL(/#browse/);
  await expect(page.locator('#bc-q')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bc_isolated_profile')||'null'))).toMatchObject({display_name:'New Collector',country:'India',city:'Bengaluru'});
});

test('model and both set-number forms resolve to the same catalogue set',async({page})=>{
  await page.goto('/v2.html#browse');
  const search=page.locator('#bc-q');
  for(const query of ['McLaren','42172','42172-1']){
    await search.fill(query);
    await expect(page.locator('#bc-set-grid')).toContainText('McLaren P1');
    await expect(page.locator('[data-set="42172-1"]')).toHaveCount(1);
  }
});

test('collection, wishlist, reciprocal match and proposal lifecycle is isolated and reversible',async({page})=>{
  await page.goto('/v2.html#browse');
  const search=page.locator('#bc-q');
  await search.fill('McLaren');
  await page.locator('[data-set="42172-1"] [data-own]').click();
  const photoForm=page.locator('#bc-owner-photo-form');
  await expect(photoForm).toBeVisible();
  await expect(photoForm.getByRole('button',{name:'Add to My Sets'})).toBeDisabled();
  await photoForm.locator('#bc-owner-photo-input').setInputFiles({name:'mclaren-owner.jpg',mimeType:'image/jpeg',buffer:Buffer.from('isolated-owner-photo')});
  await expect(photoForm.getByRole('button',{name:'Add to My Sets'})).toBeEnabled();
  await photoForm.getByRole('button',{name:'Add to My Sets'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection.length)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.collection[0].owner_photo_path)).toBeTruthy();
  await search.fill('Ferrari');
  await page.locator('[data-set="42143-1"] [data-want]').click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.wishlist.length)).toBe(1);
  await page.locator('[data-nav="sets"]').first().click();
  await page.locator('[data-exchangeable]').check();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection[0].available_for_exchange)).toBe(true);
  await page.locator('[data-nav="matches"]').first().click();
  await expect(page.locator('.bc-match')).toContainText(/McLaren P1/);
  await expect(page.locator('.bc-match')).toContainText(/Ferrari Daytona SP3/);
  await page.locator('[data-propose]').click();
  await expect(page.locator('#bc-overlay')).toContainText('McLaren P1');
  await page.locator('#bc-proposal').getByRole('button',{name:'Send proposal'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.exchanges.length)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.exchanges[0].state)).toBe('PROPOSED');
  await expect(page.locator('#bc-flow')).toContainText('Proposal pending');
  await page.locator('[data-nav="sets"]').first().click();
  await page.locator('[data-settab="wishlist"]').click();
  await page.locator('[data-remove-wish="42143-1"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.wishlist.length)).toBe(0);
  await page.locator('[data-settab="collection"]').click();
  const collectionImage=await page.locator('.bc-myset img').getAttribute('src');
  expect(collectionImage).toContain('42172-1');
  expect(collectionImage).not.toContain('42172-1-1');
  await page.locator('[data-edit-set]').click();
  await page.locator('#bc-edit-item [name="condition"]').selectOption('Good');
  await page.locator('#bc-edit-item').getByRole('button',{name:'Save details'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection[0].condition)).toBe('Good');
  await page.locator('[data-edit-set]').click();
  await expect(page.locator('[data-remove-collection-item]')).toBeDisabled();
  await page.getByRole('button',{name:'Close dialog'}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'End proposal'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.exchanges[0].state)).toBe('WITHDRAWN');
  await page.locator('[data-edit-set]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-remove-collection-item]').click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection.length)).toBe(0);
});

test('mobile navigation keeps every beta-critical destination reachable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html#home');
  const mobile=page.locator('.bc-mobile-nav');
  await expect(mobile).toBeVisible();
  for(const route of ['browse','sets','matches','exchanges']){
    await mobile.locator(`[data-nav="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(page.locator(`.bc-mobile-nav [data-nav="${route}"]`)).toHaveAttribute('aria-current','page');
  }
});

declare global {interface Window {__bcIsolated:any}}
