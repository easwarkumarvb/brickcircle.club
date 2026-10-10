import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

// Test-only camera: no real hardware, permissions or external storage traffic.
async function mockCamera(page:Page){
  await page.addInitScript(()=>{
    const state:any={calls:[],stopped:0,revoked:[],pending:false,error:'',zero:false,encode:'',streams:0};
    (window as any).__camera=state;
    const makeStream=()=>{state.streams++;let stopped=false;return {getTracks:()=>[{stop(){if(!stopped){stopped=true;state.stopped++}}},{stop(){state.audioStopped=(state.audioStopped||0)+1}}]}};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:(options:any)=>{state.calls.push(options);if(state.error)return Promise.reject(new DOMException('Mock camera error',state.error));if(state.pending)return new Promise(resolve=>{state.resolve=()=>resolve(makeStream())});return Promise.resolve(makeStream())}}});
    Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return (this as any).__mockStream||null},set(value){(this as any).__mockStream=value}});
    HTMLMediaElement.prototype.play=async()=>{};HTMLMediaElement.prototype.pause=()=>{};
    Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>state.zero?0:3200});
    Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>state.zero?0:2400});
    CanvasRenderingContext2D.prototype.drawImage=function(){this.fillStyle='#256b64';this.fillRect(0,0,this.canvas.width,this.canvas.height);this.fillStyle='#f8cb45';this.fillRect(100,100,500,260)};
    const encode=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){state.encoded={width:this.width,height:this.height,type,quality};if(state.encode==='null'){callback(null);return}if(state.encode==='throw')throw Error('Mock encode failure');if(state.encode==='pending'){state.finishEncode=()=>encode.call(this,callback,type,quality);return}encode.call(this,callback,type,quality)};
    const revoke=URL.revokeObjectURL;URL.revokeObjectURL=url=>{state.revoked.push(url);revoke(url)};
  });
}
async function open(page:Page,mode='photo-replace',route='sets'){
  await page.goto(`/v2.html?isolated=${mode}#${route}`);
  if(mode==='photo-replace')await page.locator('[data-change-photo="photo-item-1"]').click();
  else if(mode==='partial')await page.locator('[data-exchangeable="c1"]').click();
  else await page.locator('[data-own]').first().click();
  await expect(page.locator('#bc-owner-photo-form')).toBeVisible();
}
const photo={name:'test-only.png',mimeType:'image/png',buffer:Buffer.from('test-only-gallery-photo')};
const form=(page:Page)=>page.locator('#bc-owner-photo-form');
const status=(page:Page)=>form(page).locator('[data-photo-status]');
async function selected(page:Page){await form(page).locator('#bc-owner-photo-input').setInputFiles(photo)}
async function start(page:Page){await form(page).getByRole('button',{name:'Take photo',exact:true}).click();await expect(status(page)).toContainText('Camera ready')}
async function storageSpy(page:Page,pending=false){
  await page.evaluate(pending=>{
    const db=(window as any).BC_SUPABASE,original=db.storage.from.bind(db.storage),s=window.__bcIsolated;
    s.cameraUploads=[];
    db.storage.from=(bucket:string)=>{const api=original(bucket),upload=api.upload.bind(api);api.upload=async(path:string,file:File,options:any)=>{s.cameraUploads.push({path,type:file.type,size:file.size,options,bucket});if(pending)await new Promise(resolve=>{s.finishUpload=resolve});return upload(path,file,options)};return api};
  },pending);
}

test.beforeEach(async({page})=>mockCamera(page));

test('opening requests no permission; bounded JPEG capture, retake, explicit save and owner-scoped replacement',async({page})=>{
  test.setTimeout(60000);
  await open(page);await storageSpy(page);
  expect(await page.evaluate(()=>(window as any).__camera.calls)).toEqual([]);
  await start(page);
  expect(await page.evaluate(()=>(window as any).__camera.calls)).toEqual([{audio:false,video:{facingMode:{ideal:'environment'}}}]);
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();
  await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__camera.encoded)).toEqual({width:1600,height:1200,type:'image/jpeg',quality:0.85});
  expect(await page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);
  expect(await page.evaluate(()=>document.querySelector('video')?.srcObject)).toBeNull();
  expect(await page.evaluate(()=>window.__bcIsolated.storage.uploads)).toEqual([]);
  const url=await form(page).locator('img').getAttribute('src');
  await form(page).getByRole('button',{name:'Retake photo'}).click();
  await expect(status(page)).toContainText('Camera ready');
  await form(page).getByRole('button',{name:'Cancel camera'}).click();
  await expect(form(page).locator('img')).toHaveAttribute('src',url!);
  await form(page).getByRole('button',{name:'Save new photo'}).click();
  await expect(page.locator('.bc-toast')).toHaveText('Set photo updated.');
  const result=await page.evaluate(()=>({uploads:window.__bcIsolated.cameraUploads,revoked:(window as any).__camera.revoked,stopped:(window as any).__camera.stopped,updates:window.__bcIsolated.updateCalls}));
  expect(result.uploads).toHaveLength(1);expect(result.uploads[0]).toMatchObject({bucket:'collection-photos',type:'image/jpeg',options:{contentType:'image/jpeg',upsert:false}});
  expect(result.uploads[0].path).toMatch(/^00000000-0000-4000-8000-000000000007\/[\da-f-]+\.jpg$/);
  expect(result.uploads[0].size).toBeLessThanOrEqual(8*1024*1024);expect(result.revoked).toContain(url);expect(result.stopped).toBe(2);
  expect(result.updates[0].filters).toContainEqual(['user_id','00000000-0000-4000-8000-000000000007']);
});

for(const [error,message] of [['NotAllowedError','permission denied'],['NotFoundError','No camera found'],['NotReadableError','busy or unavailable'],['OverconstrainedError','No suitable camera']]){
  test(`${error}: inline fallback and denial preserve the selected file`,async({page})=>{
    await open(page);await selected(page);const url=await form(page).locator('img').getAttribute('src');
    await page.evaluate(error=>{(window as any).__camera.error=error},error);
    await form(page).getByRole('button',{name:'Take photo',exact:true}).click();
    await expect(status(page)).toContainText(message);await expect(form(page).getByRole('button',{name:'Choose file'})).toBeEnabled();
    await expect(form(page).getByRole('button',{name:'Try device camera'})).toBeVisible();
    await expect(form(page).locator('img')).toHaveAttribute('src',url!);await expect(form(page).getByRole('button',{name:'Save new photo'})).toBeEnabled();
    expect(await page.evaluate(()=>window.__bcIsolated.storage.uploads)).toEqual([]);
  });
}

test('unsupported live camera offers explicit native environment fallback and normal gallery stays available',async({page})=>{
  await open(page);await page.evaluate(()=>Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true}));
  await form(page).getByRole('button',{name:'Take photo',exact:true}).click();await expect(status(page)).toContainText('unsupported');
  const chooserPromise=page.waitForEvent('filechooser');await form(page).getByRole('button',{name:'Try device camera'}).click();const chooser=await chooserPromise;
  expect(await chooser.element().getAttribute('capture')).toBe('environment');await chooser.setFiles(photo);
  await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();
  const galleryPromise=page.waitForEvent('filechooser');await form(page).getByRole('button',{name:'Choose file'}).click();const gallery=await galleryPromise;
  expect(await gallery.element().getAttribute('capture')).toBeNull();await gallery.setFiles(photo);
});

test('unanswered permission is cancellable, repeated start is blocked and late stream tracks are stopped',async({page})=>{
  await open(page);await selected(page);const url=await form(page).locator('img').getAttribute('src');
  await page.evaluate(()=>{(window as any).__camera.pending=true});
  await form(page).getByRole('button',{name:'Take photo',exact:true}).click();await expect(status(page)).toContainText('Waiting');
  await expect(form(page).getByRole('button',{name:'Take photo',exact:true})).toBeDisabled();
  await expect(form(page).getByRole('button',{name:'Choose file'})).toBeEnabled();
  await form(page).getByRole('button',{name:'Cancel camera'}).click();await page.evaluate(()=>(window as any).__camera.resolve());
  await expect.poll(()=>page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);
  await expect(form(page).locator('img')).toHaveAttribute('src',url!);expect(await page.evaluate(()=>(window as any).__camera.audioStopped)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__camera.calls.length)).toBe(1);
});

for(const action of ['Escape','backdrop','close','direct removal','content replacement','modal replacement','navigation','pagehide','logout','account switch']){
  test(`camera and object URL dispose on ${action}`,async({page})=>{
    await open(page);await selected(page);const url=await form(page).locator('img').getAttribute('src');await start(page);
    await page.evaluate(()=>{(window as any).__camera.video=document.querySelector('video')});
    if(action==='Escape')await page.keyboard.press('Escape');
    if(action==='backdrop')await page.locator('#bc-overlay').click({position:{x:2,y:2}});
    if(action==='close')await page.getByRole('button',{name:'Close photo picker'}).click();
    if(action==='direct removal')await page.evaluate(()=>document.getElementById('bc-overlay')?.remove());
    if(action==='content replacement')await page.evaluate(()=>document.getElementById('bc-overlay')?.replaceChildren());
    if(action==='modal replacement')await page.evaluate(()=>(window as any).bcAuth());
    if(action==='navigation')await page.evaluate(()=>{location.hash='#browse'});
    if(action==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    if(action==='logout')await page.evaluate(()=>(window as any).bcSignOut());
    if(action==='account switch')await page.evaluate(()=>window.__bcIsolated.emitAuth('SIGNED_IN',{user:{id:'test-account-b',email:'b@example.invalid'}}));
    await expect.poll(()=>page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);
    expect(await page.evaluate(()=>(window as any).__camera.video.srcObject)).toBeNull();
    expect(await page.evaluate(()=>(window as any).__camera.revoked)).toContain(url);
  });
}

test('closing during permission request stops its late stream without resurrecting the modal',async({page})=>{
  await open(page);await page.evaluate(()=>{(window as any).__camera.pending=true});await form(page).getByRole('button',{name:'Take photo',exact:true}).click();await page.keyboard.press('Escape');
  await page.evaluate(()=>(window as any).__camera.resolve());await expect.poll(()=>page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);await expect(form(page)).toHaveCount(0);
});

test('pagehide/pageshow leaves no dead dialog and a restored page can reopen and capture',async({page})=>{
  await open(page);await selected(page);await start(page);
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});
  await expect(form(page)).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);
  await page.locator('[data-change-photo="photo-item-1"]').click();await start(page);await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();await expect(form(page).getByRole('button',{name:'Save new photo'})).toBeEnabled();
});

for(const after of ['denial','capture'])test(`Escape still closes after ${after} hides the camera panel`,async({page})=>{
  await open(page);
  if(after==='denial'){
    await page.evaluate(()=>{(window as any).__camera.error='NotAllowedError'});await form(page).getByRole('button',{name:'Take photo',exact:true}).click();await expect(status(page)).toContainText('permission denied');
  }else{await start(page);await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible()}
  expect(await page.evaluate(()=>!!document.activeElement?.closest('#bc-overlay'))).toBe(true);await page.keyboard.press('Escape');await expect(form(page)).toHaveCount(0);
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeFocused();
});

for(const encode of ['null','throw'])test(`capture handles ${encode} encoding failure without losing selected file`,async({page})=>{
  await open(page);await selected(page);const url=await form(page).locator('img').getAttribute('src');await start(page);await page.evaluate(encode=>{(window as any).__camera.encode=encode},encode);
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(status(page)).toContainText('Could not capture');
  await expect(form(page).locator('img')).toHaveAttribute('src',url!);expect(await page.evaluate(()=>(window as any).__camera.stopped)).toBe(1);
});

test('zero dimensions, pending encode cancel, stale encode and file replacement are safe',async({page})=>{
  await open(page);await selected(page);await start(page);await page.evaluate(()=>{(window as any).__camera.zero=true});
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(status(page)).toContainText('not ready');
  await page.evaluate(()=>{(window as any).__camera.zero=false;(window as any).__camera.encode='pending'});
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(status(page)).toContainText('Preparing');
  await expect(form(page).getByRole('button',{name:'Capture photo',exact:true})).toBeDisabled();
  const old=await form(page).locator('img').getAttribute('src');await form(page).getByRole('button',{name:'Cancel camera'}).click();
  await selected(page);const replacement=await form(page).locator('img').getAttribute('src');await page.evaluate(()=>(window as any).__camera.finishEncode());
  await expect(form(page).locator('img')).toHaveAttribute('src',replacement!);expect(await page.evaluate(()=>(window as any).__camera.revoked)).toContain(old);
});

test('JPEG PNG WebP and 8MB limit validation remain inline; invalid file preserves selection',async({page})=>{
  await open(page);await selected(page);const url=await form(page).locator('img').getAttribute('src');
  await form(page).locator('#bc-owner-photo-input').setInputFiles({name:'bad.gif',mimeType:'image/gif',buffer:Buffer.from('bad')});await expect(status(page)).toContainText('JPEG, PNG or WebP');await expect(form(page).locator('img')).toHaveAttribute('src',url!);
  await form(page).locator('#bc-owner-photo-input').setInputFiles({name:'big.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(8*1024*1024+1)});await expect(status(page)).toContainText('8 MB');
  for(const [name,mimeType] of [['exact.jpg','image/jpeg'],['valid.webp','image/webp']]){
    await form(page).locator('#bc-owner-photo-input').setInputFiles({name,mimeType,buffer:Buffer.alloc(name==='exact.jpg'?8*1024*1024:20)});await expect(status(page)).toContainText('Photo selected');
  }
  expect(await page.evaluate(()=>window.__bcIsolated.storage.uploads)).toEqual([]);
});

for(const mode of ['empty','partial'])test(`camera save uses shared ${mode==='empty'?'Add to My Sets':'legacy missing-photo'} flow`,async({page})=>{
  await open(page,mode,mode==='empty'?'browse':'sets');await start(page);await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();
  await form(page).getByRole('button',{name:mode==='empty'?'Add to My Sets':'Upload photo',exact:true}).click();
  await expect(page.locator('.bc-toast')).toContainText(mode==='empty'?'Added to My Sets':'Photo added');
  expect(await page.evaluate(()=>window.__bcIsolated.collection[0].owner_photo_path)).toMatch(/\.jpg$/);
});

for(const mode of ['empty','partial','photo-replace'])test(`pending ${mode} save cannot attach old user's upload to account B`,async({page})=>{
  await open(page,mode,mode==='empty'?'browse':'sets');await selected(page);await storageSpy(page,true);
  await form(page).getByRole('button',{name:mode==='empty'?'Add to My Sets':mode==='partial'?'Upload photo':'Save new photo',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.cameraUploads.length)).toBe(1);
  await expect(form(page).getByRole('button',{name:'Uploading…'})).toBeDisabled();
  await page.evaluate(()=>window.__bcIsolated.emitAuth('SIGNED_IN',{user:{id:'account-b',email:'b@example.invalid'}}));
  await page.evaluate(()=>window.__bcIsolated.finishUpload());
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.storage.removals.length)).toBe(1);
  const result=await page.evaluate(()=>({collection:window.__bcIsolated.collection,updates:window.__bcIsolated.updateCalls,uploads:window.__bcIsolated.cameraUploads}));
  expect(result.updates.filter((x:any)=>x.patch.owner_photo_path)).toEqual([]);expect(result.collection.some((x:any)=>x.user_id==='account-b')).toBe(false);
  expect(result.uploads[0].path).toContain('00000000-0000-4000-8000-000000000007/');
  if(mode==='photo-replace')expect(result.collection[0].owner_photo_path).toContain('old-owner-photo.jpg');
});

test('SDK account change before save prevents upload even without an auth callback',async({page})=>{
  await open(page);await selected(page);await page.evaluate(()=>{(window as any).BC_SUPABASE.auth.getUser=async()=>({data:{user:{id:'account-b'}},error:null})});
  await form(page).getByRole('button',{name:'Save new photo'}).click();await expect(status(page)).toContainText('session changed');expect(await page.evaluate(()=>window.__bcIsolated.storage.uploads)).toEqual([]);
});

test('same-user TOKEN_REFRESHED with selected file and live camera still allows capture and save, including refresh inside getUser',async({page})=>{
  await open(page);await selected(page);await start(page);
  await page.evaluate(()=>{
    const db=(window as any).BC_SUPABASE,original=db.auth.getUser.bind(db.auth);
    window.__bcIsolated.emitAuth('TOKEN_REFRESHED');
    db.auth.getUser=async()=>{const result=await original();window.__bcIsolated.emitAuth('TOKEN_REFRESHED',{user:result.data.user});return result};
  });
  await expect(form(page)).toBeVisible();await expect(form(page).locator('video')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__camera.stopped)).toBe(0);
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();
  await form(page).getByRole('button',{name:'Save new photo'}).click();await expect(page.locator('.bc-toast')).toHaveText('Set photo updated.');
  expect(await page.evaluate(()=>window.__bcIsolated.storage.uploads)).toHaveLength(1);
});

test('A to B to A during upload invalidates original session even after returning to the same owner',async({page})=>{
  await open(page);await selected(page);await storageSpy(page,true);await form(page).getByRole('button',{name:'Save new photo'}).click();await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.cameraUploads.length)).toBe(1);
  await page.evaluate(()=>{window.__bcIsolated.emitAuth('SIGNED_IN',{user:{id:'account-b'}});window.__bcIsolated.emitAuth('SIGNED_IN');window.__bcIsolated.finishUpload()});
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.storage.removals.length)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.collection[0].owner_photo_path)).toContain('old-owner-photo.jpg');
  expect(await page.evaluate(()=>window.__bcIsolated.updateCalls.filter((x:any)=>x.patch.owner_photo_path))).toEqual([]);
});

for(const [label,width,height] of [['desktop',1280,900],['mobile',390,640]] as const)test(`test-only mocked ${label} camera visual evidence and accessible actions`,async({page},testInfo)=>{
  await page.setViewportSize({width,height});await open(page);await start(page);
  // Explicit watermark prevents these mock previews being mistaken for hardware QA.
  await page.evaluate(()=>{const marker=document.createElement('div');marker.textContent='TEST ONLY · MOCKED CAMERA · NO HARDWARE';marker.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999999;background:#fff3a0;color:#111;text-align:center;font:12px sans-serif;padding:4px';document.body.appendChild(marker)});
  await page.screenshot({path:testInfo.outputPath(`owner-photo-camera-${label}-live-test-only.png`),fullPage:true});
  for(const name of ['Take photo','Choose file','Capture photo','Cancel camera']){
    const box=await form(page).getByRole('button',{name,exact:true}).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('dialog',{name:/Change photo/})).toBeVisible();await expect(form(page).getByRole('status')).toHaveAttribute('aria-live','polite');
  await form(page).getByRole('button',{name:'Capture photo',exact:true}).click();await expect(form(page).locator('#bc-owner-photo-preview')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`owner-photo-camera-${label}-captured-test-only.png`),fullPage:true});
});

declare global {interface Window {__bcIsolated:any}}
