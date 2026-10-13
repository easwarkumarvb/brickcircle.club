import {test,expect} from './fixtures';
import AxeBuilder from '@axe-core/playwright';

test('mobile Find Sets is search-first, category-led and opens collector set detail',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=ready-one#browse');

  await expect(page.getByText('FIND YOUR NEXT BUILD')).toBeVisible();
  await expect(page.locator('#bc-q')).toHaveAttribute('placeholder',/Search any LEGO set/i);
  await expect(page.locator('.bc-discovery-chips .bc-pop-chip')).toHaveCount(12);
  await expect(page.getByRole('button',{name:'Technic'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Space'})).toBeVisible();

  await page.locator('[data-view-set]').first().click();
  const detail=page.locator('.bc-set-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('COLLECTOR SET');
  await expect(detail).toContainText('Meet locally');
  await expect(detail.locator('.bc-set-detail-actions .bc-btn')).toHaveCount(2);

  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('My LEGO separates owned, wanted and available inventory on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=ready-one#sets');

  await expect(page.getByRole('heading',{name:'My LEGO'})).toBeVisible();
  await expect(page.locator('.bc-tabs .bc-tab')).toHaveCount(3);
  await expect(page.getByRole('button',{name:/Owned ·/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Wanted ·/})).toBeVisible();
  const available=page.getByRole('button',{name:/Available ·/});
  await expect(available).toBeVisible();
  await expect(available).toHaveAttribute('aria-pressed','false');

  await available.click();
  await expect(available).toHaveClass(/active/);
  await expect(available).toHaveAttribute('aria-pressed','true');
  await expect(available).toBeFocused();
  await expect(page.locator('#bc-sets-body')).toContainText('Available to Exchange');
  await expect(page.getByRole('button',{name:/View exchange history/})).toBeVisible();

  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});


test('My LEGO inventory controls have no serious accessibility violations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=ready-one#sets');
  await expect(page.getByRole('group',{name:'My LEGO inventory'})).toBeVisible();
  const {violations}=await new AxeBuilder({page}).include('#bc-main').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
});
