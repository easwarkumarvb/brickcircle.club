import {test,expect} from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';

async function openAuth(page:Page,path='/v2.html'){
  await page.goto(`${path}?isolated=signed-out#home`);
  const opener=page.getByRole('button',{name:'Join BrickCircle',exact:true});
  await opener.click();
  return opener;
}

async function layout(page:Page){
  return page.locator('.bc-auth-overlay').evaluate(overlay=>{
    const dialog=overlay.querySelector('.bc-auth-modal')!;
    return {
      pageOverflow:document.documentElement.scrollWidth>innerWidth,
      overlayOverflow:overlay.scrollWidth>overlay.clientWidth,
      overlayHeight:overlay.getBoundingClientRect().height,
      needsScroll:overlay.scrollHeight>overlay.clientHeight+1,
      nestedScrollers:[dialog,...Array.from(dialog.querySelectorAll('*'))].filter(el=>/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).length,
      backgroundLocked:getComputedStyle(document.body).overflowY==='hidden'
    };
  });
}

test('failed Google sign-in restores the decorated action and permits retry',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  await page.getByRole('button',{name:'Join BrickCircle',exact:true}).click();
  await page.evaluate(()=>{
    (window as any).supabase.createClient().auth.signInWithOAuth=async()=>({error:{message:'Google temporarily unavailable'}});
  });
  const button=page.getByRole('button',{name:'Continue with Google',exact:true});
  await button.click();
  await expect(button).toBeEnabled();
  await expect(button.locator('svg.bc-google-mark')).toBeVisible();
  await expect(button.locator('.bc-google-mark path')).toHaveCount(4);
  await expect(page.locator('#bc-auth-provider-error')).toHaveText('Google temporarily unavailable');
  await expect(button).toHaveAttribute('aria-describedby','bc-auth-provider-error');
  await expect(page.locator('.bc-toast')).toHaveText('Google temporarily unavailable');
  await expect(page.getByRole('dialog')).toBeVisible();
  await button.click();
  await expect(button).toBeEnabled();
});

for(const path of ['/','/v2.html'])for(const width of [320,360,375,390,430,768,1280])test(`collector auth fits both modes at ${width}px on ${path}`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const opener=await openAuth(page,path);
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Join BrickCircle'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();
  await expect(dialog).toContainText('Built for adult LEGO fans.');
  expect(await layout(page)).toMatchObject({pageOverflow:false,overlayOverflow:false,needsScroll:false,nestedScrollers:0,backgroundLocked:true});
  await dialog.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(dialog.locator('[data-auth-tab="signup"]')).toHaveAttribute('aria-pressed','true');
  const consent=dialog.locator('[name="adult_confirmation"]');
  await consent.scrollIntoViewIfNeeded();
  await expect(consent).toBeVisible();
  await expect(consent).toHaveAttribute('required','');
  expect(await layout(page)).toMatchObject({pageOverflow:false,overlayOverflow:false,needsScroll:false,nestedScrollers:0});
  await expect(dialog.locator('button[type="submit"]')).toBeInViewport();
  await expect(dialog.locator('.bc-auth-legal')).toBeInViewport();
  const results=await new AxeBuilder({page}).include('#bc-overlay').analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.locator('#bc-root').evaluate(el=>(el as HTMLElement).inert)).toBe(false);
});

for(const width of [320,390,768,1280])test(`short and keyboard-sized viewport scrolls only the overlay at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:700});
  const opener=await openAuth(page);
  await page.locator('[data-auth-tab="signup"]').click();
  const password=page.getByLabel('Password',{exact:true});
  await password.focus();
  await page.setViewportSize({width,height:320});
  await expect.poll(async()=>Math.round((await layout(page)).overlayHeight)).toBe(320);
  expect(await layout(page)).toMatchObject({pageOverflow:false,overlayOverflow:false,needsScroll:true,nestedScrollers:0,backgroundLocked:true});
  await expect(password).toBeInViewport();
  await page.locator('[name="adult_confirmation"]').check();
  const cta=page.locator('button[type="submit"]');
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeInViewport();
  await page.locator('.bc-auth-legal').scrollIntoViewIfNeeded();
  await expect(page.locator('.bc-auth-legal')).toBeInViewport();
  await page.setViewportSize({width,height:844});
  await expect.poll(async()=>Math.round((await layout(page)).overlayHeight)).toBe(844);
  expect(await layout(page)).toMatchObject({needsScroll:false,nestedScrollers:0});
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('keyboard focus stays inside auth and returns on Escape and close',async({page})=>{
  const opener=await openAuth(page);
  const close=page.getByRole('button',{name:'Close sign-in'}),last=page.getByRole('dialog').getByRole('link',{name:'Privacy Policy',exact:true});
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  expect(await page.locator('#bc-root').evaluate(el=>(el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await close.click();
  await expect(opener).toBeFocused();
});

test('password visibility and required validation never change signup payload',async({page})=>{
  await openAuth(page);
  await page.locator('[data-auth-tab="signup"]').click();
  const form=page.locator('#bc-email-signup'),password=form.getByLabel('Password',{exact:true});
  await expect(password).toHaveAttribute('autocomplete','new-password');
  await expect(password).toHaveAttribute('placeholder','At least 6 characters');
  await form.getByLabel('Collector name',{exact:true}).fill('AFOL Collector');
  await form.getByLabel('Email',{exact:true}).fill('afol@example.invalid');
  await password.fill('secret123');
  const toggle=form.locator('[data-password-visibility]');
  await expect(toggle).toHaveAttribute('aria-label','Show password');
  await toggle.click();
  await expect(password).toHaveAttribute('type','text');
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await expect(toggle).toHaveAttribute('aria-label','Hide password');
  await expect(password).toHaveValue('secret123');
  await form.evaluate((el:HTMLFormElement)=>el.requestSubmit());
  expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((call:any)=>call.method==='signUp'))).toEqual([]);
  await form.locator('[name="adult_confirmation"]').check();
  await password.fill('short');
  await form.getByRole('button',{name:'Create account',exact:true}).click();
  expect(await password.evaluate((el:HTMLInputElement)=>el.validity.tooShort)).toBe(true);
  expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((call:any)=>call.method==='signUp'))).toEqual([]);
  await password.fill('secret123');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect(password).toHaveAttribute('type','password');
  await form.getByRole('button',{name:'Create account',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.authCalls.find((call:any)=>call.method==='signUp')?.credentials)).toEqual({email:'afol@example.invalid',password:'secret123',options:{data:{full_name:'AFOL Collector',adult_confirmation_version:'2026-09-11',adult_attestation:'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.'},emailRedirectTo:`${new URL(page.url()).origin}/v2.html`}});
});

for(const mode of ['signin','signup'])test(`${mode} announces errors, keeps CTA geometry and retries the exact contract`,async({page})=>{
  await page.setViewportSize({width:320,height:844});
  await openAuth(page);
  if(mode==='signup')await page.locator('[data-auth-tab="signup"]').click();
  const form=page.locator(`#bc-email-${mode}`);
  if(mode==='signup'){await form.getByLabel('Collector name',{exact:true}).fill('Retry Collector');await form.locator('[name="adult_confirmation"]').check()}
  await form.getByLabel('Email',{exact:true}).fill('retry@example.invalid');
  await form.getByLabel('Password',{exact:true}).fill('password123');
  await page.evaluate(mode=>{
    const db=(window as any).supabase.createClient(),method=mode==='signin'?'signInWithPassword':'signUp',original=db.auth[method];
    (window as any).__releaseEmail=undefined;
    db.auth[method]=()=>new Promise(resolve=>{(window as any).__releaseEmail=()=>{db.auth[method]=original;resolve({error:{message:'Please try again'}})}});
  },mode);
  const cta=form.locator('button[type="submit"]'),before=await cta.boundingBox();
  await cta.click();
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAttribute('aria-busy','true');
  await expect(cta.locator('.bc-auth-cta-arrow')).toBeVisible();
  const during=await cta.boundingBox();
  expect(during!.height).toBe(before!.height);expect(during!.width).toBe(before!.width);
  await page.evaluate(()=>(window as any).__releaseEmail());
  await expect(cta).toBeEnabled();
  await expect(form.getByRole('alert')).toHaveText('Please try again');
  await expect(form.getByLabel('Email',{exact:true})).toHaveAttribute('aria-describedby','bc-auth-email-error');
  await expect(form.getByLabel('Password',{exact:true})).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('.bc-toast')).toHaveText('Please try again');
  await form.getByLabel('Password',{exact:true}).fill('password123');
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(form.getByLabel('Password',{exact:true})).not.toHaveAttribute('aria-invalid','true');
  await cta.click();
  const credentials={email:'retry@example.invalid',password:'password123'};
  await expect.poll(()=>page.evaluate(method=>window.__bcIsolated.authCalls.find((call:any)=>call.method===method)?.credentials,mode==='signin'?'signInWithPassword':'signUp')).toEqual(mode==='signin'?credentials:{...credentials,options:{data:{full_name:'Retry Collector',adult_confirmation_version:'2026-09-11',adult_attestation:'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.'},emailRedirectTo:`${new URL(page.url()).origin}/v2.html`}});
});

test('thrown email failures re-enable submission and preserve input',async({page})=>{
  await openAuth(page);
  await page.getByLabel('Email',{exact:true}).fill('afol@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('password123');
  await page.evaluate(()=>{(window as any).supabase.createClient().auth.signInWithPassword=async()=>{throw new Error('Connection interrupted')}});
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('#bc-auth-email-error')).toHaveText('Connection interrupted');
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('password123');
});
