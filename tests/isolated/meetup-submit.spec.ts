import fs from 'node:fs';
import {test,expect} from './fixtures';

test('canonical meetup form has an explicit submit button',async()=>{
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(source).toContain('<button class="bc-btn primary">Share proposal</button>');
});

test('superseded meetup submit hotfix is not shipped in the release shell',async()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).not.toContain('/meetup-submit-hotfix.js');
  expect(release.shell).not.toContain('/meetup-submit-hotfix.js');
  expect(worker).not.toContain('/meetup-submit-hotfix.js');
});
