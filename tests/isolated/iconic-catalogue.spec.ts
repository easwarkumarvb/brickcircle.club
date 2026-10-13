import {test,expect} from './fixtures';

test('Find sets opens on the iconic one-page collection and searches the full catalogue',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#browse');

  await expect(page.getByRole('heading',{name:'100 iconic LEGO sets'})).toBeVisible();
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(3);
  await expect(page.locator('.bc-pager')).toHaveCount(0);
  await expect(page.locator('#bc-theme')).toHaveCount(0);
  await expect(page.locator('#bc-year')).toHaveCount(0);
  await expect(page.locator('#bc-cat-page-size')).toHaveText('3 curated sets · one page');

  const search=page.locator('#bc-q');
  await expect(search).toHaveAttribute('placeholder',/product code or keywords/i);

  await search.fill('McLaren');
  await expect(page.locator('#bc-cat-status')).toContainText('matching “McLaren”');
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(1);
  await expect(page.locator('#bc-set-grid')).toContainText('McLaren P1');

  const keywordCall=await page.evaluate(()=>{
    const calls=window.__bcIsolated.rpcCalls.filter((call:any)=>call.name==='bc_search_lego_sets');
    return calls.at(-1);
  });
  expect(keywordCall.args).toEqual({
    p_query:'McLaren',
    p_theme:null,
    p_year:null,
    p_limit:100
  });

  await search.fill('42143');
  await expect(page.locator('#bc-cat-status')).toContainText('matching “42143”');
  await expect(page.locator('#bc-set-grid')).toContainText('Ferrari Daytona SP3');

  const exactCall=await page.evaluate(()=>{
    const calls=window.__bcIsolated.rpcCalls.filter((call:any)=>call.name==='bc_search_lego_sets');
    return calls.at(-1);
  });
  expect(exactCall.args.p_query).toBe('42143');
  expect(exactCall.args.p_limit).toBe(100);
});

declare global {
  interface Window {__bcIsolated:any}
}
