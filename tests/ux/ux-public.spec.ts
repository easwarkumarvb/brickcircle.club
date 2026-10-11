import {test,expect} from '../isolated/fixtures';
import {type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Intentionally no sign-ups, OAuth callbacks, messages, uploaded data or exchanges.
// Those require the existing hosted staging fixture harness and explicit safety guards.
async function stable(page:Page) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{await (document as any).fonts?.ready;});
}
test.describe('@ux public journeys',()=>{
  test('landing: clear action, no clipped horizontal content, no serious accessibility regressions',async({page},testInfo)=>{
    await page.goto('/?isolated=signed-out',{waitUntil:'domcontentloaded'});
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
    await page.goto('/?isolated=signed-out',{waitUntil:'domcontentloaded'});
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

  test('synthetic registration validates consent and reaches email verification',async({page},testInfo)=>{
    await page.goto('/?isolated=signed-out');
    await page.locator('.bc-landing-hero').getByRole('button',{name:'Join BrickCircle',exact:true}).click();
    const form=page.locator('#bc-email-signup');
    await page.locator('[data-auth-tab="signup"]').click();
    await expect(form).toBeVisible();
    await form.getByLabel('Collector name',{exact:true}).fill('Synthetic collector');
    await form.getByLabel('Email',{exact:true}).fill('invalid-email');
    await form.getByLabel('Password',{exact:true}).fill('Synthetic-password-123!');
    const adult=form.locator('[name="adult_confirmation"]');
    await expect(adult).toHaveAttribute('required','');
    expect(await form.evaluate((el:HTMLFormElement)=>el.checkValidity())).toBe(false);
    await form.getByLabel('Email',{exact:true}).fill('synthetic@example.test');
    expect(await form.evaluate((el:HTMLFormElement)=>el.checkValidity())).toBe(false);
    await adult.check();
    expect(await form.evaluate((el:HTMLFormElement)=>el.checkValidity())).toBe(true);
    // Everything external is blocked; the SDK fixture cannot deliver email.
    const audit=await new AxeBuilder({page}).include('#bc-overlay').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    await testInfo.attach('registration-accessibility.json',{body:JSON.stringify(audit.violations,null,2),contentType:'application/json'});
    expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact||'')).map(v=>v.id)).toEqual([]);
    await form.getByRole('button',{name:'Create account',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__bcIsolated.authCalls.filter((call:any)=>call.method==='signUp').length)).toBe(1);
    await expect(page.locator('#bc-email-signup')).toHaveCount(0);
    await expect(page.locator('#bc-overlay')).toContainText('synthetic@example.test');
  });

  test('320px and landscape public navigation stay within the viewport',async({page})=>{
    for(const viewport of [{width:320,height:568},{width:667,height:375}]){
      await page.setViewportSize(viewport);
      await page.goto('/?isolated=signed-out');
      await expect(page.locator('.bc-landing-hero')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
      await page.locator('.bc-landing-hero').getByRole('button',{name:'Join BrickCircle',exact:true}).click();
      const dialog=page.locator('#bc-overlay [role="dialog"]');
      await expect(dialog).toBeVisible();
      const box=await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-2);
      expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width+2);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });

  test('landing hero matches the committed visual baseline',async({page})=>{
    await page.goto('/?isolated=signed-out');
    await stable(page);
    await expect(page.locator('.bc-landing-hero')).toHaveScreenshot('landing-hero.png',{
      animations:'disabled', maxDiffPixelRatio:0.01
    });
  });
});
