import fs from 'node:fs';
import {test,expect} from './fixtures';

test('first-set install promotion is shipped and discoverable',async()=>{
  const source=fs.readFileSync('install-promo.js','utf8');
  const html=fs.readFileSync('v2.html','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(source).toContain('Add BrickCircle to your Home Screen');
  expect(source).toContain("Install BrickCircle");
  expect(source).toContain("beforeinstallprompt");
  expect(source).toContain("appinstalled");
  expect(html).toContain('/install-promo.js');
  expect(release.shell).toContain('/install-promo.js');
  expect(worker).toContain('/install-promo.js');
});
