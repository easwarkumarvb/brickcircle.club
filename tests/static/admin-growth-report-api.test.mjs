import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../../supabase/functions/admin-dashboard/handler.mjs';

const validID = '12345678-1234-1234-1234-123456789012';
const day = 86400000;
const iso = value => new Date(value).toISOString();
const report = (days = 28, overrides = {}) => {
  const end = Date.UTC(2026, 9, 13);
  const start = end - days * day;
  return {
    version: 1, days,
    generated_at: iso(end + day - 1),
    start_at: iso(start),
    end_at: iso(end),
    previous_start_at: iso(start - days * day),
    metrics: {
      new_registrations: {current: days * 10, previous: days},
      active_exchange_collectors: {current: 18, previous: 0},
      proposals: {current: 64, previous: 50},
      accepted: {current: 40, previous: 38},
      handoffs: {current: 25, previous: 22},
      completed_exchanges: {current: 20, previous: 19},
      repeat_collectors: {current: 9, previous: 7},
      cancellations: {current: 4, previous: 3}
    },
    activation: {registered: 42, email_verified: 30, ready: 20},
    exchange_cohort: {proposed: 64, accepted: 40, handed_off: 25, completed: 20, cancelled: 4},
    daily: Array.from({length: days}, (_, i) => ({date: iso(start + i * day).slice(0, 10), registrations: i, completed_exchanges: i % 3})),
    cities: [{country: 'India', city: 'Bengaluru', registered: 12, ready: 8, available_sets: 40, completed_exchanges: 5}],
    health: {active_custody: 12, overdue_returns: 2, unresolved_issues: 1, open_support: 3},
    coverage: ['Daily rows cover the current period only'],
    definitions: {new_registrations: 'Accounts created during the period'},
    ...overrides
  };
};
function fixture(options = {}) {
  const calls = [];
  const client = {
    auth: {getUser: async () => {calls.push('auth'); return {data: {user: options.noUser ? null : {id: validID}}, error: options.authError};}},
    rpc: async (name, args) => {
      calls.push({name, args});
      if (name === 'is_exchange_admin') return {data: options.allowed !== false, error: options.accessError};
      if (name === 'admin_growth_report') return {data: options.payload === undefined ? report(args.p_days) : (typeof options.payload === 'function' ? options.payload() : options.payload), error: options.dbError};
      return {data: {rows: [], total: 0}, error: null};
    }
  };
  const factory = (...args) => {calls.push({client: args}); return client;};
  const handler = createHandler(factory, name => ({SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key'}[name]));
  const request = (body, init = {}) => new Request('https://example.supabase.co/functions/v1/admin-dashboard', {
    method: 'POST', headers: {Authorization: 'Bearer test-user-token', 'Content-Type': 'application/json', Origin: 'https://www.brickcircle.club', ...init.headers},
    body: JSON.stringify(body), ...init});
  return {calls, handler, request};
}
test('growth report requires the same live administrator authorization as reads', async () => {
  for (const options of [{noUser: true}, {authError: {message: 'invalid', status: 401}}, {allowed: false}, {accessError: {message: 'unavailable'}}]) {
    const f = fixture(options);
    const r = await f.handler(f.request({operation: 'report', version: 1, days: 28}));
    assert.ok([401, 403, 503].includes(r.status));
    assert.equal(f.calls.some(c => c.name === 'admin_growth_report'), false);
  }
});
for (const days of [7, 28, 90]) test(`valid ${days}-day report uses the caller client and returns data unchanged`, async () => {
  const f = fixture();
  const r = await f.handler(f.request({operation: 'report', version: 1, days}));
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls.at(-1), {name: 'admin_growth_report', args: {p_days: days}});
  const factory = f.calls.find(c => c.client).client;
  assert.equal(factory[1], 'public-key');
  assert.equal(factory[2].global.headers.Authorization, 'Bearer test-user-token');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await r.json(), report(days));
});
for (const body of [
  {operation: 'report'},
  {operation: 'report', version: 1},
  {operation: 'report', days: 28},
  {operation: 'report', version: 2, days: 28},
  {operation: 'report', version: '1', days: 28},
  {operation: 'report', version: null, days: 28},
  {operation: 'report', version: 1.5, days: 28},
  {operation: 'report', version: 1, days: 6},
  {operation: 'report', version: 1, days: 91},
  {operation: 'report', version: 1, days: 0},
  {operation: 'report', version: 1, days: -28},
  {operation: 'report', version: 1, days: 28.5},
  {operation: 'report', version: 1, days: '28'},
  {operation: 'report', version: 1, days: true},
  {operation: 'report', version: 1, days: null},
  {operation: 'report', version: 1, days: [28]},
  {operation: 'report', version: 1, days: 28, section: 'members'},
  {operation: 'report', version: 1, days: 28, page: 0},
  {operation: 'report', version: 1, days: 28, query: 'city'},
  {operation: 'report', version: 1, days: 28, filters: {}},
  {operation: 'report', version: 1, days: 28, id: validID},
  {operation: 'report', version: 1, days: 28, reason: 'A reason long enough to matter'},
  {operation: 'report', version: 1, days: 28, entity: 'catalogue'}
]) test(`invalid report request ${JSON.stringify(body).slice(0, 72)} is rejected without an RPC`, async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request(body))).status, 400);
  assert.equal(f.calls.some(c => c.name === 'admin_growth_report'), false);
});
test('report contract is separate from the read-rows contract', async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request({operation: 'read', version: 2, section: 'growth'}))).status, 400);
  const g = fixture();
  assert.equal((await g.handler(g.request({operation: 'report', version: 1, days: 7}))).status, 200);
  const names = g.calls.map(c => c.name).filter(Boolean);
  assert.deepEqual(names, ['is_exchange_admin', 'admin_growth_report']);
  assert.equal(names.some(name => /read|mutate|note/.test(name)), false);
});
for (const [code, status, extra] of [['PT403', 403, {code: 'mfa_required'}], ['42501', 403, {}], ['40001', 409, {}], ['22023', 400, {}], ['22P02', 400, {}], ['P0002', 404, {}], ['XX000', 503, {}]])
  test(`growth report database error ${code} is a fixed message`, async () => {
    const f = fixture({dbError: {code, message: 'sensitive DB internals'}});
    const r = await f.handler(f.request({operation: 'report', version: 1, days: 28}));
    assert.equal(r.status, status);
    const body = await r.json();
    assert.doesNotMatch(body.error, /sensitive/);
    if (extra.code) assert.equal(body.code, extra.code);
  });
const mutations = [
  ['missing version', r => {const {version, ...rest} = r; return rest;}],
  ['wrong version', r => ({...r, version: 2})],
  ['days mismatch', r => ({...r, days: 7})],
  ['invalid generated_at', r => ({...r, generated_at: 'October'}),],
  ['missing start_at', r => {const {start_at, ...rest} = r; return rest;}],
  ['missing previous_start_at', r => {const {previous_start_at, ...rest} = r; return rest;}],
  ['metric group null', r => ({...r, metrics: {...r.metrics, proposals: null}})],
  ['metric pair incomplete', r => ({...r, metrics: {...r.metrics, handoffs: {current: 5}}})],
  ['negative count', r => ({...r, metrics: {...r.metrics, proposals: {current: -1, previous: 0}}})],
  ['string count', r => ({...r, activation: {...r.activation, ready: '20'}})],
  ['infinite count', r => ({...r, health: {...r.health, active_custody: Infinity}})],
  ['NaN count', r => ({...r, exchange_cohort: {...r.exchange_cohort, proposed: NaN}})],
  ['cohort missing key', r => {const {exchange_cohort, ...rest} = r; return {...rest, exchange_cohort: {proposed: 1, accepted: 1, handed_off: 1, completed: 1}};}],
  ['null daily row', r => ({...r, daily: [null]})],
  ['daily beyond range', r => ({...r, daily: Array.from({length: 29}, () => ({date: '2026-10-01', registrations: 0, completed_exchanges: 0}))})],
  ['invalid daily date', r => ({...r, daily: [{date: 'Oct 1', registrations: 1, completed_exchanges: 0}]})],
  ['city without city', r => ({...r, cities: [{country: 'India', registered: 1, ready: 1, available_sets: 1, completed_exchanges: 0}]})],
  ['city count not numeric', r => ({...r, cities: [{country: 'India', city: 'Pune', registered: {}, ready: 1, available_sets: 1, completed_exchanges: 0}]})],
  ['too many cities', r => ({...r, cities: Array.from({length: 101}, () => ({country: 'X', city: 'Y', registered: 0, ready: 0, available_sets: 0, completed_exchanges: 0}))})],
  ['coverage not array', r => ({...r, coverage: 'everything'})],
  ['coverage item not string', r => ({...r, coverage: [7]})],
  ['definitions not object', r => ({...r, definitions: null})],
  ['definitions value not string', r => ({...r, definitions: {propose: 3}})],
  ['health missing key', r => {const {health, ...rest} = r; return {...rest, health: {active_custody: 1, overdue_returns: 1, unresolved_issues: 1}};}],
  ['activation missing key', r => {const {activation, ...rest} = r; return {...rest, activation: {registered: 1, email_verified: 1}};}],
  ['null report', () => null],
  ['array report', () => []],
  ['scalar report', () => 'oops']
];
for (const [name, mutate] of mutations) test(`malformed growth report (${name}) fails closed with a fixed message`, async () => {
  const f = fixture({payload: () => mutate(report())});
  const r = await f.handler(f.request({operation: 'report', version: 1, days: 28}));
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error, 'Growth report unavailable. Retry shortly.');
  assert.equal(body.code, 'unavailable');
});
test('unauthenticated and forged reports cannot read growth data', async () => {
  const f = fixture({allowed: false});
  assert.equal((await f.handler(f.request({operation: 'report', version: 1, days: 90}))).status, 403);
  assert.equal(f.calls.some(c => c.name === 'admin_growth_report'), false);
});
