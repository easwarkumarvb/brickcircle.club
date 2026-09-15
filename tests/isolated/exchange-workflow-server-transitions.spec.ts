import fs from 'node:fs';
import {test,expect} from './fixtures';

test('proposal creation is a server-owned, idempotent reciprocal transition',()=>{
  const source=fs.readFileSync('app-v3.js','utf8');
  const migration=fs.readFileSync('supabase/migrations/20260913090000_exchange_workflow_server_transitions.sql','utf8');
  expect(source).toContain("db.rpc('create_exchange_request'");
  expect(source).not.toContain("db.from('exchange_requests').insert");
  expect(migration).toContain('create or replace function public.create_exchange_request');
  expect(migration).toContain("p_duration_days not in (30, 60, 90)");
  expect(migration).toContain("r.status = 'pending'");
  expect(migration).toContain("revoke insert, update, delete on table public.exchange_requests from authenticated");
  expect(migration).toContain("public.canonical_lego_product_identity");
});

test('exchange messages derive the recipient and create durable in-app notification only',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260913090000_exchange_workflow_server_transitions.sql','utf8');
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(migration).toContain('create or replace function public.bc_prepare_exchange_message');
  expect(migration).toContain("new.recipient_id := case when me = exchange_row.user_a");
  expect(migration).toContain("'message_received'");
  expect(migration).not.toContain("'message_received'\n  ]::text[]");
  expect(source).toContain("notification?.kind==='message_received'");
  expect(source).toContain("notification?.metadata?.exchange_id");
});

test('owner release is server-owned, preserves history and protects post-handoff sets',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260914131342_canonical_exchange_workflow.sql','utf8');
  const source=fs.readFileSync('app-v3.js','utf8');
  expect(migration).toContain('create or replace function public.release_exchange_item');
  expect(migration).toContain('owned.user_id <> me');
  expect(migration).toContain("exchange_row.state in ('swap_active','disputed')");
  expect(migration).toContain("'requires_early_return', true");
  expect(migration).toContain("set state = 'released'");
  expect(migration).toContain("set status = 'released'");
  expect(migration).toContain('on conflict (dedupe_key)');
  expect(migration).toContain('on conflict (user_id,kind,entity_type,entity_id)');
  expect(migration).toContain('revoke insert,update,delete on table public.exchange_requests from authenticated');
  expect(migration).toContain('revoke insert,update,delete on table public.exchanges from authenticated');
  expect(source).toContain("db.rpc('release_exchange_item'");
  expect(source).toContain('Release this set from this exchange');
  expect(source).not.toMatch(/from\('messages'\)\.insert\(\{exchange_id:e\.id,sender_id:S\.user\.id,recipient_id:/);
});
