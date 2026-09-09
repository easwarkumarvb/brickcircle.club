import fs from 'node:fs';
import {test,expect} from './fixtures';

test('member notifications surface exchange lifecycle events and reciprocal matches',async()=>{
  const source=fs.readFileSync('exchange-lifecycle-notifications.js','utf8');
  for(const kind of ['exchange_accepted','exchange_declined','exchange_cancelled','exchange_created','reciprocal_match'])expect(source).toContain(kind);
  expect(source).toContain("route:'#matches'");
  expect(source).toContain("event:'INSERT'");
  expect(source).toContain(".is('read_at',null)");
  expect(source).toContain('showUnread().catch');
  expect(source).toContain("window.addEventListener('online'");
  expect(source).toContain("document.addEventListener('visibilitychange'");
  expect(source).toContain('if(!user?.id||activeId');
  expect(source).toContain("next.id===user?.id&&(channel||pollTimer)");
});

test('lifecycle notification client is shipped in the release shell',async()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).toContain('/exchange-lifecycle-notifications.js');
  expect(release.shell).toContain('/exchange-lifecycle-notifications.js');
  expect(worker).toContain('/exchange-lifecycle-notifications.js');
});
