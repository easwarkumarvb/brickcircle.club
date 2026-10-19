import {test,expect} from './fixtures';

// Remain sensitive to boot exceptions hidden by the user's friendly fallback.
test('Trust & Care loads an authenticated collection without a boot failure',async({page})=>{
  const errors:string[]=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await expect.poll(async()=>{
    if(errors.some(message=>message.includes('BrickCircle V3 boot failed')))throw new Error(errors.join('\n'));
    return await page.locator('[data-edit-set]').count();
  },{timeout:6000,intervals:[300,500,1000]}).toBeGreaterThan(0);
  expect(errors.filter(message=>message.includes('BrickCircle V3 boot failed'))).toEqual([]);
});
