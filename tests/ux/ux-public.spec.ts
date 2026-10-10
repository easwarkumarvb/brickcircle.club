import {test,expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Intentionally no sign-ups, OAuth callbacks, messages, uploaded data or exchanges.
// Those require the existing hosted staging fixture harness and explicit safety guards.
async function stable(page:Page) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{await (document as any).fonts?.ready;});
}
test.describe('@ux public journeys',()=>{
  test('landing: clear action, no clipped horizontal content, no serious accessibility regressions',async({page},testInfo)=>{
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await stable(page);
    const hero=page.locator('.bc-landing-hero');
    await expect(hero).toBeVisible();
    await expect(hero.getByRole('heading',{level:1})).toContainText(/Buy Less.*Build More/i);
    const cta=hero.getByRole('button',{name:'Explore iconic sets'});
    await expect(cta).toBeVisible();
    const box=await cta.boundingBox();
    expect(box?.height||0).toBeGreaterThanOrEqual(44);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow,'Horizontal scrolling obscures content').toBeLessThanOrEqual(2);
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    const severe=audit.violations.filter(v=>['critical','serious'].includes(v.impact||''));
    await testInfo.attach('accessibility.json',{body:JSON.stringify({violations:audit.violations},null,2),contentType:'application/json'});
    expect(severe.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  });

  test('join dialog can be opened and closed without trapping the visitor',async({page})=>{
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await page.locator('.bc-landing-hero').getByRole('button',{name:'Join BrickCircle',exact:true}).click();
    const dialog=page.locator('#bc-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal','true');
    const bounds=await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-2);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width+2);
    await page.keyboard.press('Escape');
    // Dialog closing behavior is an explicit UX requirement.
    await expect(dialog).toBeHidden();
  });

  test('catalogue search reveals meaningful set results',async({page})=>{
    await page.goto('/v2.html#browse',{waitUntil:'domcontentloaded'});
    const search=page.locator('#bc-q');
    await expect(search).toBeVisible({timeout:10000});
    await search.fill('McLaren');
    await expect(page.locator('#bc-set-grid')).toContainText(/McLaren/i,{timeout:10000});
    await expect(page.locator('#bc-set-grid article').first()).toBeVisible();
  });
});
