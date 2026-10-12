import {test,expect} from './fixtures';

for(const width of [390,1280]){
  test(`collector profile and home action retain readable contrast at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/v2.html?isolated=ready-one#home');
    const action=page.locator('.bc-welcome .bc-btn.ghost');
    await expect(action).toBeVisible();
    await expect.poll(()=>action.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    await page.goto('/v2.html?isolated=ready-one#profile');
    const name=page.locator('.bc-profile-hero h1');
    await expect(name).toBeVisible();
    await expect.poll(()=>name.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
