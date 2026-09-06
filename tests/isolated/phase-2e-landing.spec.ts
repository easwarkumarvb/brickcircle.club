import {test,expect} from './fixtures';

test('desktop landing tells the complete exchange story with minimal copy',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.getByRole('heading',{name:'Experience more LEGO without buying every set.'})).toBeVisible();
  await expect(page.locator('.bc-story-flow article')).toHaveCount(4);
  await expect(page.locator('.bc-story-flow')).toContainText('YOU OWN');
  await expect(page.locator('.bc-story-flow')).toContainText('YOU WANT');
  await expect(page.locator('.bc-story-flow')).toContainText('Finds the overlap');
  await expect(page.locator('.bc-story-flow')).toContainText('Reciprocal Match');
  await expect(page.locator('.bc-landing-workflow article')).toHaveCount(4);
  await expect(page.locator('.bc-example-match')).toContainText('Illustrative example');
  await expect(page.locator('.bc-trust-grid span')).toHaveCount(6);
  await expect(page.locator('.bc-landing-hero img[loading="eager"]')).toHaveCount(2);
  await expect(page.locator('img[data-set-image][loading="lazy"]')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Add your first set'})).toBeVisible();
});

test('hero and final conversion actions reuse the existing auth flow',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  await page.getByRole('button',{name:'Start with my collection'}).click();
  await expect(page.locator('#bc-overlay')).toBeVisible();
  await page.locator('#bc-overlay [data-close]').click();
  await page.getByRole('button',{name:'Add your first set'}).click();
  await expect(page.locator('#bc-email-signin')).toBeVisible();
});

test('See how it works moves the visual story into view',async({page})=>{
  await page.setViewportSize({width:1280,height:600});
  await page.goto('/v2.html?isolated=signed-out#home');
  await page.getByRole('button',{name:'See how it works'}).click();
  await expect.poll(()=>page.locator('#how-it-works').evaluate(element=>Math.round(element.getBoundingClientRect().top))).toBeLessThan(200);
});

test('blocked set images reveal the existing graceful placeholder',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  const image=page.locator('.bc-landing-hero img[data-set-image]').first();
  const placeholder=image.locator('xpath=following-sibling::*[1]');
  await image.evaluate(element=>{element.dispatchEvent(new Event('error'));element.dispatchEvent(new Event('error'))});
  await expect(image).toBeHidden();
  await expect(placeholder).toBeVisible();
});

test('390px landing stacks cleanly with no overflow and unchanged bottom navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.getByRole('button',{name:'Start with my collection'})).toBeVisible();
  await expect(page.locator('.bc-story-flow article')).toHaveCount(4);
  await expect(page.locator('.bc-landing-workflow article')).toHaveCount(4);
  await expect(page.locator('.bc-mobile-nav')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('signed-in guided homepage remains isolated from landing-only sections',async({page})=>{
  await page.goto('/v2.html#home');
  await expect(page.locator('.bc-guided-progress')).toBeVisible();
  await expect(page.locator('.bc-landing-hero')).toHaveCount(0);
  await expect(page.locator('.bc-landing-final')).toHaveCount(0);
});
