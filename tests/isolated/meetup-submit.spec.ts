import fs from 'node:fs';
import {test,expect} from './fixtures';

test('dynamic Share meetup button is normalized to an explicit submit button',async({page})=>{
  const source=fs.readFileSync('meetup-submit-hotfix.js','utf8');
  await page.setContent('<div id="mount"></div>');
  await page.addScriptTag({content:source});
  await page.locator('#mount').evaluate(node=>{
    node.innerHTML='<form id="bc-meet-form"><div class="bc-form-actions"><button type="button" class="bc-btn">Cancel</button><button class="bc-btn primary">Share meetup</button></div></form>';
  });
  await expect(page.locator('#bc-meet-form .bc-btn.primary')).toHaveAttribute('type','submit');
});

test('meetup submit hotfix is shipped in the release shell',async()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).toContain('/meetup-submit-hotfix.js');
  expect(release.shell).toContain('/meetup-submit-hotfix.js');
  expect(worker).toContain('/meetup-submit-hotfix.js');
});
