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
