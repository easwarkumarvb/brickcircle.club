import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSelection, validateTarget, PR125_SHA, STAGING_REF, PRODUCTION_REF, STAGING_CONFIRMATION } from '../../scripts/validate-hosted-pr125.mjs';

const repository = 'easwarkumarvb/brickcircle.club';
const selection = () => ({ repository, ref: 'refs/heads/main', number: '125', sha: PR125_SHA, confirmation: STAGING_CONFIRMATION,
  pr: { number: 125, state: 'open', base: {ref:'main',repo:{full_name:repository}},
    head: {ref:'opencode/conversation-first-exchanges',sha:PR125_SHA,repo:{full_name:repository}} } });
const target = () => ({ BC_HOSTED_SMOKE_CONFIRMATION:STAGING_CONFIRMATION, BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER:'125',
  BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA:PR125_SHA, BC_STAGING_SUPABASE_PROJECT_REF:STAGING_REF,
  BC_PRODUCTION_SUPABASE_PROJECT_REF:PRODUCTION_REF, BC_STAGING_SUPABASE_URL:`https://${STAGING_REF}.supabase.co`,
  BC_STAGING_ALLOWED_EMAIL_DOMAIN:'example.test', BC_STAGING_NOTIFICATION_MODE:'outbox-only', BC_STAGING_SUPABASE_PUBLISHABLE_KEY:'offline-placeholder' });
test('exact trusted-main selection', () => assert.equal(validateSelection(selection()), PR125_SHA));
test('one reviewed product head replaces the original pin, never a broader allowlist',()=>{
  assert.equal(PR125_SHA,'e12eac9244360c5b6e616484b73c3492b8ee3922');
  const old='1eb64e59f000f3a93f55906ff55e9a194a70eee0',s=selection();s.sha=old;s.pr.head.sha=old;
  assert.throws(()=>validateSelection(s));
  assert.throws(()=>validateTarget({...target(),BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA:old}));
});
for (const [name, mutate] of [
  ['dispatch branch',s=>s.ref='refs/heads/opencode/hosted-pr125-bootstrap'],
  ['other repository',s=>s.repository='outsider/fork'], ['number',s=>s.number='0125'],
  ['other PR',s=>s.pr.number=126], ['closed',s=>s.pr.state='closed'], ['other base',s=>s.pr.base.ref='release'],
  ['base fork',s=>s.pr.base.repo.full_name='outsider/fork'], ['head fork',s=>s.pr.head.repo.full_name='outsider/fork'],
  ['missing head repo',s=>s.pr.head.repo=null], ['canonical spoof',s=>s.pr.head.ref='codex/canonical-exchange-state-machine'],
  ['moved head',s=>s.pr.head.sha='a'.repeat(40)], ['other expected SHA',s=>s.sha='a'.repeat(40)],
  ['confirmation',s=>s.confirmation='yes']
]) test(`reject ${name}`,()=>{const s=selection();mutate(s);assert.throws(()=>validateSelection(s));});
test('exact staging configuration',()=>validateTarget(target()));
for (const key of Object.keys(target())) test(`reject missing ${key}`,()=>{const t=target();delete t[key];assert.throws(()=>validateTarget(t));});
for (const url of [`https://${PRODUCTION_REF}.supabase.co`, `https://${STAGING_REF}.supabase.co.evil.test`,
  `https://user:password@${STAGING_REF}.supabase.co`, `http://${STAGING_REF}.supabase.co`, `https://${STAGING_REF}.supabase.co/rest/v1`,
  `https://${STAGING_REF}.supabase.co?target=production`]) test('reject unsafe URL '+url.replace(/user:password@/,''),()=>assert.throws(()=>validateTarget({...target(),BC_STAGING_SUPABASE_URL:url})));
for (const [key,value] of [['BC_STAGING_NOTIFICATION_MODE','email'],['BC_STAGING_ALLOWED_EMAIL_DOMAIN','gmail.com'],
  ['BC_STAGING_SUPABASE_PROJECT_REF',PRODUCTION_REF],['BC_PRODUCTION_SUPABASE_PROJECT_REF',STAGING_REF]])
  test(`reject unsafe ${key}`,()=>assert.throws(()=>validateTarget({...target(),[key]:value})));
test('workflow trust and evidence boundaries',()=>{
  const workflow=readFileSync('.github/workflows/hosted-supabase-pr125.yml','utf8');
  assert.match(workflow,/environment: hosted-supabase-staging/);
  assert.match(workflow,/group: hosted-supabase-exchange-smoke/);
  assert.match(workflow,/npm ci --ignore-scripts/);
  assert.doesNotMatch(workflow,/pull_request_target:|schedule:|secrets: inherit|permissions: write|npm.*--prefix candidate/);
  assert.equal((workflow.match(/persist-credentials: false/g)||[]).length,3);
  const browserStep=workflow.split('- name: PR125 real browser')[1].split('- name: Existing server')[0];
  assert.doesNotMatch(browserStep,/SECRET_KEY/);
  assert.match(workflow,/steps.users.outcome == 'success'/);
  assert.match(workflow,/Revalidate selection after human review/);
  assert.doesNotMatch(workflow,/artifacts\/\*|test-results\/|trace\.zip/);
});
