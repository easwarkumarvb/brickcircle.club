import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationPath='supabase/migrations/20261019130316_admin_business_conflicts_pt409.sql';
const notePath='supabase/migrations/20261006090654_admin_support_desk.sql';
const mutatePath='supabase/migrations/20261005143140_marketplace_admin_console.sql';

test('PT409 migration is signature-scoped, count-guarded, metadata-preserving and message-preserving',async()=>{
  const migration=await readFile(migrationPath,'utf8');
  assert.match(migration,/pg_get_functiondef\('public\.admin_support_note\(uuid,text,uuid\)'::pg_catalog\.regprocedure\)/);
  assert.match(migration,/pg_get_functiondef\('public\.admin_marketplace_mutate\(text,text,text,integer,text,uuid\)'::pg_catalog\.regprocedure\)/);
  for(const guard of [
    /v_count <> 1 or pg_catalog\.strpos\(v_note, v_new\) <> 0/,
    /v_count <> 1 or pg_catalog\.strpos\(v_mutate, v_new\) <> 0/,
    /Unexpected admin_support_note definition/,
    /Unexpected admin_marketplace_mutate replay definition/,
    /Unexpected admin_marketplace_mutate revision definition/,
  ]) assert.match(migration,guard);
  assert.equal((migration.match(/execute v_(?:note|mutate);/g)||[]).length,2);
  assert.match(migration,/raise sqlstate 'PT409' using message = 'Request ID already used for another payload'/);
  assert.match(migration,/raise sqlstate 'PT409' using message = 'Request ID already used for another change'/);
  assert.match(migration,/raise sqlstate 'PT409' using message = 'This record changed\. Refresh and retry\.'/);
  assert.doesNotMatch(migration,/\b(?:grant|revoke)\b|\bcreate\s+(?:or\s+replace\s+)?function\b/i);
});

test('migration targets only the three reviewed conflicts and leaves historical migrations untouched',async()=>{
  const note=await readFile(notePath,'utf8');
  const mutate=await readFile(mutatePath,'utf8');
  assert.equal((note.match(/using errcode='40001'/g)||[]).length,1);
  assert.equal((mutate.match(/using errcode='40001'/g)||[]).length,2);
  assert.match(note,/pg_advisory_xact_lock/);
  assert.match(note,/select \* into v_replay from private\.marketplace_admin_audit where actor_id=auth\.uid\(\) and request_id=p_request/);
  assert.match(mutate,/v_revision<>p_revision/);
  assert.match(mutate,/pg_advisory_xact_lock/);
});
