import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const wcagTags=['wcag2a','wcag2aa','wcag21a','wcag21aa'];

async function settle(page:Page){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'});
  await page.evaluate(async()=>{try{await (document as any).fonts?.ready}catch(_){}});
}

async function seriousA11y(page:Page,include?:string){
  let builder=new AxeBuilder({page}).withTags(wcagTags);
  if(include)builder=builder.include(include);
  const result=await builder.analyze();
  return result.violations.filter(v=>v.impact==='critical'||v.impact==='serious').map(v=>({
    id:v.id,
    impact:v.impact,
    help:v.help,
    nodes:v.nodes.slice(0,5).map(n=>({target:n.target,summary:n.failureSummary}))
  }));
}

test.describe('cross-browser visual + accessibility gate',()=>{
  test('mobile homepage remains visually stable and accessible',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await settle(page);

    const hero=page.locator('.hero');
    const cta=page.locator('.hero .cta').first();
    await expect(hero).toBeVisible();
    await expect(page.locator('.hero h1')).toContainText(/Experience more LEGO/i);
    await expect(cta).toBeVisible();

    const metrics=await page.evaluate(()=>({
      viewport:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth
    }));
    expect(metrics.scrollWidth-metrics.viewport).toBeLessThanOrEqual(2);
    const ctaBox=await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height||0).toBeGreaterThanOrEqual(44);

    const first=await hero.screenshot({animations:'disabled'});
    await page.waitForTimeout(600);
    const second=await hero.screenshot({animations:'disabled'});
    expect(first.equals(second),'Hero changed between stable screenshots; possible flicker/layout shift').toBeTruthy();

    const violations=await seriousA11y(page);
    expect(violations,JSON.stringify(violations,null,2)).toEqual([]);
  });

  test('Join Free dialog works with keyboard and has no serious WCAG violations',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await page.locator('a[href="/v2.html?join=1"]').first().click();
    const dialog=page.locator('#bc-overlay [role="dialog"]');
    await expect(dialog).toBeVisible({timeout:7000});
    await settle(page);
    await page.evaluate(()=>{(window as any).bcApplyA11y?.()});

    await expect(dialog).toHaveAttribute('aria-modal','true');
    const name=await dialog.getAttribute('aria-labelledby');
    expect(name||await dialog.getAttribute('aria-label')).toBeTruthy();
    const box=await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width||9999).toBeLessThanOrEqual(390);

    await page.keyboard.press('Tab');
    const tag=await page.evaluate(()=>document.activeElement?.tagName||'');
    expect(['BUTTON','INPUT','A','SELECT','TEXTAREA']).toContain(tag);

    const violations=await seriousA11y(page,'#bc-overlay');
    expect(violations,JSON.stringify(violations,null,2)).toEqual([]);
  });

  test('catalogue search works and controls are accessible',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto('/v2.html#browse',{waitUntil:'domcontentloaded'});
    const input=page.locator('#bc-q');
    await expect(input).toBeVisible({timeout:10000});
    await settle(page);
    await page.evaluate(()=>{(window as any).bcApplyA11y?.()});

    await expect(input).toHaveAttribute('aria-label',/Search LEGO sets/i);
    await expect(page.locator('#bc-theme')).toHaveAttribute('aria-label',/theme/i);
    await expect(page.locator('#bc-year')).toHaveAttribute('aria-label',/year/i);

    await input.fill('McLaren');
    await expect(page.locator('#bc-cat-status')).toContainText(/McLaren/i,{timeout:10000});
    await expect(page.locator('#bc-set-grid')).toContainText(/McLaren/i,{timeout:10000});
    await expect(page.locator('#bc-set-grid article').first()).toBeVisible();

    const violations=await seriousA11y(page,'#bc-main');
    expect(violations,JSON.stringify(violations,null,2)).toEqual([]);
  });
});
