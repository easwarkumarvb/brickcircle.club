import {test,expect} from './fixtures';

async function noHorizontalOverflow(page:any){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}

test('390px signed-in journey has thumb-friendly navigation and no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.locator('.bc-mobile-nav')).toBeVisible();
  await expect(page.locator('.bc-mobile-nav button')).toHaveCount(5);
  const navHeight=await page.locator('.bc-mobile-nav button').first().evaluate(el=>el.getBoundingClientRect().height);
  expect(navHeight).toBeGreaterThanOrEqual(52);
  await noHorizontalOverflow(page);
});

test('390px curated browse keeps search usable and controls large enough for touch',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=partial#browse');
  await expect(page.locator('.bc-catalogue-tools')).toBeVisible();
  const search=page.locator('#bc-q');
  await expect(search).toBeVisible();
  expect(await search.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await search.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
  const columns=await page.locator('.bc-set-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await noHorizontalOverflow(page);
});

test('mobile auth opens as a bottom-friendly sheet without clipping',async({page})=>{
  await page.setViewportSize({width:390,height:700});
  await page.goto('/v2.html?isolated=signed-out#home');
  await page.getByRole('button',{name:'Start with my collection'}).click();
  const modal=page.locator('.bc-modal');
  await expect(modal).toBeVisible();
  const box=await modal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(370);
  expect(box!.height).toBeLessThanOrEqual(676);
  await noHorizontalOverflow(page);
});

test('small landscape view remains usable without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:667,height:375});
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.locator('.bc-mobile-nav')).toBeVisible();
  await noHorizontalOverflow(page);
});
