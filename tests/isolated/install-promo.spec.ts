import fs from 'node:fs';
import {test,expect} from './fixtures';

test('install promotion remains isolated while beta PWA is disabled',async()=>{
  const source=fs.readFileSync('install-promo.js','utf8');
  const html=fs.readFileSync('v2.html','utf8');
  const config=fs.readFileSync('web-push-config.js','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(source).toContain('Add BrickCircle to your Home Screen');
  expect(source).toContain("Install BrickCircle");
  expect(config).toContain('window.BETA_PWA_ENABLED=false');
  expect(html).not.toContain('/install-promo.js');
  expect(html).not.toContain('rel="manifest"');
  expect(release.shell).not.toContain('/install-promo.js');
  expect(release.shell).not.toContain('/manifest.webmanifest');
  expect(worker).not.toContain('/install-promo.js');
});

test('beta startup unregisters and clears only BrickCircle PWA state',async({page})=>{
  await page.addInitScript(()=>{
    const calls={register:0,brickUnregister:0,foreignUnregister:0,deleted:[] as string[]};
    (window as any).__pwaCalls=calls;
    const registration=(scriptURL:string,key:'brickUnregister'|'foreignUnregister')=>({active:{scriptURL},installing:null,waiting:null,unregister:async()=>{calls[key]++;return true}});
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
      register:async()=>{calls.register++;return {}},
      getRegistrations:async()=>[
        registration(location.origin+'/catalogue-cache-sw.js','brickUnregister'),
        registration(location.origin+'/another-app-sw.js','foreignUnregister')
      ]
    }});
    Object.defineProperty(window,'caches',{configurable:true,value:{
      keys:async()=>['brickcircle-shell-old','brickcircle-images-old','another-app-cache'],
      delete:async(key:string)=>{calls.deleted.push(key);return true}
    }});
  });
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect.poll(()=>page.evaluate(()=>(window as any).__pwaCalls.brickUnregister)).toBe(1);
  const calls=await page.evaluate(()=>(window as any).__pwaCalls);
  expect(calls.register).toBe(0);
  expect(calls.foreignUnregister).toBe(0);
  expect(calls.deleted.sort()).toEqual(['brickcircle-images-old','brickcircle-shell-old']);
});
