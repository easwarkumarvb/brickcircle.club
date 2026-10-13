const fs = require('fs');
const assert = require('assert');

const sql = fs.readFileSync('supabase/migrations/20260913125000_release_sets_on_cancel.sql', 'utf8');

assert.match(sql, /create or replace function public\.cancel_in_person_exchange/i);
assert.match(sql, /if e\.state = 'swap_active'/i);
assert.match(sql, /update public\.exchange_requests[\s\S]*status = 'cancelled'[\s\S]*status = 'accepted'/i);
assert.match(sql, /update public\.collection_items[\s\S]*available_for_exchange = true/i);
assert.match(sql, /not exists \([\s\S]*x\.state not in \('completed','cancelled','disputed'\)/i);
assert.match(sql, /'sets_released'/i);
assert.match(sql, /if e\.state = 'cancelled'[\s\S]*'idempotent', true/i);

console.log('release-sets-on-cancel contract passed');
