import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CONFIRMATION, HEAD_BRANCH, HEAD_SHA, RELEASE_SHA, PULL_REQUEST_NUMBER, REPOSITORY, WORKFLOW_REF, validateSelection} from '../../scripts/validate-hosted-beta-release.mjs';
import {validateTarget} from '../../scripts/validate-hosted-photo.mjs';
const selection = () => ({
 repository:REPOSITORY,ref:'refs/heads/main',eventName:'workflow_dispatch',workflowRef:WORKFLOW_REF,
 number:String(PULL_REQUEST_NUMBER),sha:RELEASE_SHA,confirmation:CONFIRMATION,
 pr:{number:PULL_REQUEST_NUMBER,state:'closed',merged:true,merge_commit_sha:RELEASE_SHA,
 head:{repo:{full_name:REPOSITORY},ref:HEAD_BRANCH,sha:HEAD_SHA},base:{repo:{full_name:REPOSITORY},ref:'main'}}
});
test('accepts only the exact merged release provenance',()=>{
 assert.equal(validateSelection(selection()),RELEASE_SHA);
});
for(const [field,value] of [
 ['repository','fork/repo'],['ref','refs/heads/feature'],['eventName','pull_request'],
 ['workflowRef',WORKFLOW_REF.replace('@refs/heads/main','@refs/heads/feature')],
 ['number','160'],['sha',HEAD_SHA],['sha','invalid'],['confirmation','yes']
])test('rejects wrong dispatcher '+field+' '+value,()=>assert.throws(()=>validateSelection({...selection(),[field]:value})));
for(const [label,mutate] of [
 ['open',p=>{p.state='open';}],['unmerged',p=>{p.merged=false;}],['wrong PR',p=>{p.number=160;}],
 ['wrong merge',p=>{p.merge_commit_sha='f'.repeat(40);}],['fork head',p=>{p.head.repo.full_name='fork/repo';}],
 ['wrong head branch',p=>{p.head.ref='other';}],['wrong head SHA',p=>{p.head.sha='f'.repeat(40);}],
 ['fork base',p=>{p.base.repo.full_name='fork/repo';}],['wrong base',p=>{p.base.ref='beta';}]
])test('rejects '+label,()=>{const s=selection();mutate(s.pr);assert.throws(()=>validateSelection(s));});
test('target rejects production, provider delivery and public-harness credentials',()=>{
 const env={BC_HOSTED_SMOKE_CONFIRMATION:CONFIRMATION,BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA:RELEASE_SHA,
 BC_STAGING_SUPABASE_PROJECT_REF:'tteyypklldgwwicrgjzt',BC_PRODUCTION_SUPABASE_PROJECT_REF:'nsxtromjdpdscknadxez',
 BC_STAGING_SUPABASE_URL:'https://tteyypklldgwwicrgjzt.supabase.co',BC_STAGING_ALLOWED_EMAIL_DOMAIN:'example.test',
 BC_STAGING_NOTIFICATION_MODE:'outbox-only',BC_STAGING_SUPABASE_PUBLISHABLE_KEY:'public-fixture'};
 validateTarget(env,{publicOnly:true,expectedSha:RELEASE_SHA});
 for(const [key,value] of [
 ['BC_STAGING_SUPABASE_URL','https://nsxtromjdpdscknadxez.supabase.co'],
 ['BC_STAGING_SUPABASE_PROJECT_REF','nsxtromjdpdscknadxez'],['BC_STAGING_ALLOWED_EMAIL_DOMAIN','example.com'],
 ['BC_STAGING_NOTIFICATION_MODE','provider'],['BC_STAGING_SUPABASE_SECRET_KEY','server-key'],
 ['SUPABASE_SERVICE_ROLE_KEY','server-key'],['BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA',HEAD_SHA]
 ])assert.throws(()=>validateTarget({...env,[key]:value},{publicOnly:true,expectedSha:RELEASE_SHA}));
});
test('workflow revalidates before secrets and uses only protected staging',async()=>{
 const s=await readFile('.github/workflows/hosted-supabase-beta-release.yml','utf8');
 assert.match(s,/workflow_dispatch:/);
 assert.doesNotMatch(s,/^  (push|pull_request):/m);
 assert.match(s,/environment: hosted-supabase-staging/);
 assert.match(s,/group: hosted-supabase-exchange-smoke/);
 assert.equal((s.match(/validateSelection\(\{/g)||[]).length,2);
 assert.equal((s.match(/pull_number: 168/g)||[]).length,2);
 assert.match(s,/ref: \$\{\{ needs.validate.outputs.head_sha \}\}/);
 assert.doesNotMatch(s,/secrets\.BC_PRODUCTION|apply_migration|supabase db push/);
 const candidateTest=s.indexOf('tests/isolated/owner-photo-gallery.spec.ts');
 const firstSecret=s.indexOf('secrets.BC_STAGING_SUPABASE_URL');
 const bootstrap=s.indexOf('hosted-photo-privileged.mjs bootstrap');
 const revalidation=s.indexOf('Revalidate exact');
 assert.ok(revalidation>0&&candidateTest>revalidation&&firstSecret>candidateTest&&bootstrap>firstSecret);
 assert.match(s,/hosted-photo-privileged.mjs audit/);
 assert.match(s,/npm run smoke:hosted:exchange/);
 assert.doesNotMatch(s,/path: artifacts\/$/m);
});
