import {test,expect} from './fixtures';
import AxeBuilder from '@axe-core/playwright';

for(const width of [320,390,1280])test(`collector sign-in remains accessible at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:700});
  await page.goto('/v2.html?isolated=signed-out#home');
  const opener=page.getByRole('button',{name:'Join BrickCircle',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Join BrickCircle'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();
  await expect(dialog).toContainText('Built for adult LEGO fans.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(676);
  await dialog.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(dialog.locator('[data-auth-tab="signup"]')).toHaveAttribute('aria-pressed','true');
  const consent=dialog.locator('[name="adult_confirmation"]');
  await consent.scrollIntoViewIfNeeded();
  await expect(consent).toBeVisible();
  await expect(consent).toHaveAttribute('required','');
  const results=await new AxeBuilder({page}).include('#bc-overlay').analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
