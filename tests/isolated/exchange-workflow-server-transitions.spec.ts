import fs from 'node:fs';
import {test,expect} from './fixtures';

test('proposal creation is a server-owned, idempotent reciprocal transition',()=>{
  const source=fs.readFileSync('app-v3.js','utf8');
  const migration=fs.readFileSync('supabase/migrations/20260916052934_canonical_exchange_state_machine.sql','utf8');
  expect(source).toContain("db.rpc('create_exchange_case'");
  expect(source).not.toContain("db.from('exchange_requests').insert");
  expect(migration).toContain('create or replace function public.create_exchange_case');
  expect(migration).toContain('exchange_case_item_locks');
  expect(migration).toContain('p_idempotency_key text');
  expect(migration).toContain('state_version bigint');
  expect(migration).toContain("public.canonical_lego_product_identity");
});

test('case messages derive the recipient and produce a durable deduplicated notification',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260916052934_canonical_exchange_state_machine.sql','utf8');
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(migration).toContain('create or replace function public.send_exchange_case_message');
  expect(migration).toContain('other_user:=private.bc_case_other_user(c,me)');
  expect(migration).toContain("'exchange_message'");
  expect(migration).toContain("'case-message:'");
  expect(source).toContain("db.rpc('send_exchange_case_message'");
  expect(source).toContain("notification?.exchange_case_id");
});

test('owner release is server-owned, preserves history and protects post-handoff sets',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260916052934_canonical_exchange_state_machine.sql','utf8');
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(migration).toContain("clean_action='cancel'");
  expect(migration).toContain("after_state:='HANDOFF_ISSUE'");
  expect(migration).toContain('private.bc_restore_case_preferences(c)');
  expect(migration).toContain("lock_kind='MANUAL_REVIEW'");
  expect(migration).toContain('revoke insert,update,delete on public.exchange_requests,public.exchanges');
  expect(source).toContain("db.rpc('exchange_case_transition'");
  expect(source).toContain('Open safe release options');
  expect(source).not.toMatch(/from\('messages'\)\.insert\(\{exchange_id:e\.id,sender_id:S\.user\.id,recipient_id:/);
});

test('availability and lifecycle controls use explicit least-privilege RPCs',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260916052934_canonical_exchange_state_machine.sql','utf8');
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(migration).toContain('create or replace function public.set_exchange_item_availability');
  expect(migration).toContain('create or replace function public.exchange_case_transition');
  expect(migration).toContain("security definer set search_path=''");
  expect(migration).toContain('grant execute on function public.collection_item_exchange_status');
  expect(migration).toContain("notify pgrst,'reload schema'");
  expect(source).toContain("db.rpc('set_exchange_item_availability'");
  expect(source).not.toContain("db.rpc('bc_exchange_capabilities'");
});
