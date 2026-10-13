import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const STAGING_CONFIRMATION = 'RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE';

export const PR138_SHA = 'c6444d635889f6956c3fdc6b1e0657060d182cef';
export const STAGING_REF = 'tteyypklldgwwicrgjzt';
export const PRODUCTION_REF = 'nsxtromjdpdscknadxez';

// A merge event may start only the owner-approved runner PR, never an arbitrary
// marked main commit. Recheck this provenance after environment review too.
export function resolveInvocation({repository,ref,eventName,commitSha,headMessage,runnerPr,inputs={}}) {
  if(eventName==='workflow_dispatch')return {number:inputs.pull_request_number,sha:inputs.expected_head_sha,confirmation:inputs.confirmation};
  assert.equal(eventName,'push');
  assert.equal(repository,'easwarkumarvb/brickcircle.club');
  assert.equal(ref,'refs/heads/main');
  assert.ok(String(headMessage).includes('[run-pr138-staging]'));
  assert.match(commitSha,/^[0-9a-f]{40}$/);
  assert.equal(runnerPr?.number,139);
  assert.equal(runnerPr.merged,true);
  assert.equal(runnerPr.merge_commit_sha,commitSha);
  assert.equal(runnerPr.base.ref,'main');
  assert.equal(runnerPr.base.repo?.full_name,repository);
  assert.equal(runnerPr.head.ref,'qa/pr138-hosted-runner');
  assert.equal(runnerPr.head.repo?.full_name,repository);
  return {number:'138',sha:PR138_SHA,confirmation:STAGING_CONFIRMATION};
}

// Deliberately not a general-purpose PR runner. Any new head needs trusted-main review.
export function validateSelection({ pr, repository, ref, number, sha, confirmation }) {
  assert.equal(ref, 'refs/heads/main', 'Dispatch must use trusted main');
  assert.equal(repository, 'easwarkumarvb/brickcircle.club');
  assert.equal(String(number), '138');
  assert.equal(sha, PR138_SHA);
  assert.equal(confirmation, STAGING_CONFIRMATION);
  assert.equal(pr.number, 138);
  assert.equal(pr.state, 'open');
  assert.equal(pr.base.ref, 'main');
  assert.equal(pr.base.repo?.full_name, repository);
  assert.equal(pr.head.repo?.full_name, repository);
  assert.equal(pr.head.ref, 'dev/person-first-conversations');
  assert.equal(pr.head.sha, sha);
  return sha;
}

export function validateTarget(env) {
  assert.equal(env.BC_HOSTED_SMOKE_CONFIRMATION, STAGING_CONFIRMATION);
  assert.equal(String(env.BC_HOSTED_SMOKE_PULL_REQUEST_NUMBER), '138');
  assert.equal(env.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA, PR138_SHA);
  assert.equal(env.BC_STAGING_SUPABASE_PROJECT_REF, STAGING_REF);
  assert.equal(env.BC_PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_REF);
  assert.equal(env.BC_STAGING_SUPABASE_URL, `https://${STAGING_REF}.supabase.co`);
  assert.equal(env.BC_STAGING_ALLOWED_EMAIL_DOMAIN, 'example.test');
  assert.equal(env.BC_STAGING_NOTIFICATION_MODE, 'outbox-only');
  assert.ok(env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY);
}

// Existence/anonymous-execute gate only. Authenticated read-model correctness is
// checked separately by the browser harness; never silently fall back for evidence.
export async function verifyReadModelPreflight(env, fetchImpl=fetch) {
  validateTarget(env);
  const requests = [
    ['list_collector_conversations',{p_before_at:null,p_before_peer:null,p_limit:1}],
    ['collector_conversation_feed',{p_peer_id:'00000000-0000-4000-8000-000000000000',p_before_at:null,p_before_type:null,p_before_id:null,p_limit:1}],
    ['mark_collector_conversation_read',{p_peer_id:'00000000-0000-4000-8000-000000000000',p_through_at:'2000-01-01T00:00:00Z',p_through_type:'direct_message',p_through_id:'00000000-0000-4000-8000-000000000000'}]
  ];
  for (const [name,body] of requests) {
    const response=await fetchImpl(`${env.BC_STAGING_SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{apikey:env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)
    });
    const result=await response.json();
    // An anonymous caller must see an existing function's permission denial,
    // rather than a missing signature, successful row response or auth proxy error.
    assert.ok(response.status===401 || response.status===403,'Read-model anonymous gate rejected');
    assert.equal(result.code,'42501','Read-model schema unavailable or unsafe');
    assert.equal(result.message,`permission denied for function ${name}`,'Read-model function gate rejected');
  }
  return {checked:requests.length,anonymousExecute:'denied'};
}
const invokedPath=process.argv[1]?pathToFileURL(resolve(process.argv[1])).href:'';
if(invokedPath===import.meta.url){
  if(process.argv.length!==3 || process.argv[2]!=='--preflight'){
    console.error('Only --preflight is supported');process.exitCode=1;
  }else{
    verifyReadModelPreflight(process.env).then(()=>console.log('PR138 read-model signatures exist; anonymous execute denied.'))
      .catch(()=>{console.error('PR138 staging schema preflight rejected; values withheld. No schema changes attempted.');process.exitCode=1;});
  }
}
