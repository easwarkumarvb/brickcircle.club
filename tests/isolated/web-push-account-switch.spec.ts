import fs from 'node:fs';
import {test,expect} from './fixtures';

test('account-switch push recovery remains isolated for post-beta re-enablement',async()=>{
  const source=fs.readFileSync('web-push-v1.js','utf8');
  const html=fs.readFileSync('v2.html','utf8');
  expect(html).not.toContain('/web-push-v1.js');
  expect(source).toContain('push_subscriptions');
  expect(source).toContain('unsubscribe');
  expect(source).toContain('signOut');
});
