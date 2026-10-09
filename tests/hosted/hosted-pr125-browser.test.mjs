import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transportAllowed, stagingApplication } from '../../scripts/hosted-pr125-browser.mjs';
import { STAGING_REF, PRODUCTION_REF } from '../../scripts/validate-hosted-pr125.mjs';
import { assertOutboxOnly } from '../../scripts/audit-hosted-pr125-outbox.mjs';
const url=`https://${STAGING_REF}.supabase.co`;
test('only staging public data/Auth/storage routes can leave browser',()=>{
  for(const path of ['/auth/v1/token','/rest/v1/rpc/send_collector_message','/storage/v1/object/public/avatars/a.jpg'])assert.equal(transportAllowed(url+path),true);
  for(const target of [`https://${PRODUCTION_REF}.supabase.co/rest/v1/profiles`,url+'/functions/v1/send-notifications',url+'/auth/v10/token',url+'/unknown',url.replace('https','http')+'/auth/v1/token',url.replace('.co','.co.evil.test')+'/auth/v1/token',url.replace('https://','https://user:password@')+'/auth/v1/token',url+':444/rest/v1/profiles'])assert.equal(transportAllowed(target),false);
});
test('WebSocket allowlist is exact staging Realtime only',()=>{
  assert.equal(transportAllowed(`wss://${STAGING_REF}.supabase.co/realtime/v1/websocket?apikey=offline`,true),true);
  for(const target of [`wss://${PRODUCTION_REF}.supabase.co/realtime/v1/websocket`,`ws://${STAGING_REF}.supabase.co/realtime/v1/websocket`,`wss://${STAGING_REF}.supabase.co/other`,`wss://${STAGING_REF}.supabase.co.evil.test/realtime/v1/websocket`])assert.equal(transportAllowed(target,true),false);
});
test('configuration override changes exactly two constants, safely encodes key',()=>{
  const source=`const SUPABASE_URL='https://${PRODUCTION_REF}.supabase.co';\nconst SUPABASE_KEY='public';\nconst behavior='unchanged';`;
  const patched=stagingApplication(source,url,"safe'key$&");
  assert.equal(patched,`const SUPABASE_URL=${JSON.stringify(url)};\nconst SUPABASE_KEY=${JSON.stringify("safe'key$&")};\nconst behavior='unchanged';`);
  assert.throws(()=>stagingApplication(source+source,url,'offline'));
  assert.throws(()=>stagingApplication('missing constants',url,'offline'));
});
test('browser evidence is secret-free and never invokes candidate Node scripts',()=>{
  const source=readFileSync('scripts/hosted-pr125-browser.mjs','utf8');
  assert.doesNotMatch(source,/\.screenshot\(|\.tracing\.|storageState\(|console\.(log|error)\(error|spawn\(|exec\(/);
  assert.match(source,/Server secret forbidden in browser process/);
  assert.match(source,/serializeRedactedReport\(report\)/);
  assert.match(source,/assert\.equal\(diagnostics.deniedProduction,0\)/);
  assert.match(source,/response=await route.fetch\(\)/);
  assert.match(source,/available_for_exchange/);
});
test('outbox-only means zero attempts, not merely a queued record',()=>{
  assertOutboxOnly([{status:'pending',attempt_count:0}]);
  for(const rows of [[],[{status:'pending',attempt_count:1}],[{status:'sent',attempt_count:1}],[{status:'processing',attempt_count:1}],[{status:'skipped',attempt_count:0}]])assert.throws(()=>assertOutboxOnly(rows));
});
