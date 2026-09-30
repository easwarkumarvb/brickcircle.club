import fs from 'node:fs';
import {test,expect} from './fixtures';

test('member notifications surface exchange lifecycle events and reciprocal matches',async()=>{
  const source=fs.readFileSync('app-v3.js','utf8');
  for(const kind of ['exchange_proposed','exchange_countered','exchange_accepted','exchange_cancelled','exchange_completed','reciprocal_match'])expect(source).toContain(kind);
  expect(source).toContain("route:'matches'");
  expect(source).toContain("event:'*'");
  expect(source).toContain('reconcileNotifications().catch');
  expect(source).toContain("window.addEventListener('online'");
  expect(source).toContain("document.addEventListener('visibilitychange'");
  expect(source).toContain('return showUnreadProposalNotice()||showUnreadLifecycleNotice();');
});

test('lifecycle notifications are app-owned and the supplemental runtime is not shipped',async()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
  const worker=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).not.toContain('/exchange-lifecycle-notifications.js');
  expect(release.shell).not.toContain('/exchange-lifecycle-notifications.js');
  expect(worker).not.toContain('/exchange-lifecycle-notifications.js');
});
