import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('@static account switch uses a shared local-only logout boundary and synchronized assets',()=>{
  const app=fs.readFileSync('app-v3.js','utf8'),admin=fs.readFileSync('admin-dashboard.js','utf8'),helper=fs.readFileSync('local-account-logout.js','utf8');
  expect(helper).toContain("auth.signOut({scope:'local'})");
  expect(helper).toContain('result.error!==null');
  for(const code of [app,admin])expect(code).toContain('window.bcCreateLocalLogout(db.auth)');
  for(const code of [app,admin,helper,fs.readFileSync('signout-switch-account.js','utf8')])expect(code).not.toMatch(/auth\.signOut\(\)/);
  expect(app).toContain("event==='SIGNED_OUT'&&!explicitLogout&&isResumeWindow()");
  expect(admin).toContain("location.assign(switchAccount?'/#signin':'/#home')");
  const manifest=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  expect(manifest.shell).toContain('/local-account-logout.js');
  for(const file of ['index.html','v2.html'])expect(fs.readFileSync(file,'utf8')).toContain(`/local-account-logout.js?v=${manifest.release}`);
  expect(fs.readFileSync('index.html','utf8')).toBe(fs.readFileSync('v2.html','utf8'));
});
