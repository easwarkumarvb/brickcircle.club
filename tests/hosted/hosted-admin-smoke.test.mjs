import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT, CONFIRMATION, validateConfig, configFromEnv, guardedFetch, totp, runSmoke, assertDenied, mask, assertCheckout } from '../../scripts/hosted-admin-smoke.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const config = () => ({ url: `https://${PROJECT}.supabase.co`, key: 'public-test-key', pr: '124', sha: 'a'.repeat(40),
  confirmation: CONFIRMATION, run: id, caseId: id, supportId: id, totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  credentials: [{email:'member@example.test',password:'member-test-password'}, {email:'admin@example.test',password:'admin-test-password'}] });
test('configuration rejects wrong project, confirmation, PR, SHA, fixtures, mailbox and missing protected inputs', () => {
  assert.doesNotThrow(() => validateConfig(config()));
  for (const change of [{url:'https://nsxtromjdpdscknadxez.supabase.co'}, {url:`https://${PROJECT}.supabase.co/`},
    {confirmation:''}, {pr:'123'}, {sha:'main'}, {run:'bad'}, {caseId:''}, {supportId:''}, {key:''}, {totpSecret:''},
    {credentials:[{email:'real@gmail.com',password:'x'},config().credentials[1]]}, {credentials:[config().credentials[0],config().credentials[0]]}])
    assert.throws(() => validateConfig({...config(),...change}));
  assert.throws(() => configFromEnv({}));
});
test('exported runner refuses production before constructing clients or making requests', async () => {
  let calls=0;
  await assert.rejects(runSmoke({...config(),url:'https://nsxtromjdpdscknadxez.supabase.co'}, {factory:()=>{calls++;},transport:()=>{calls++;}}));
  assert.equal(calls,0);
});
test('CLI checkout guard rejects claimed SHA mismatch with a fixed safe error', () => {
  assert.doesNotThrow(() => assertCheckout('a'.repeat(40), 'a'.repeat(40)));
  for (const [expected, actual] of [['a'.repeat(40), 'b'.repeat(40)], ['main', 'main']])
    assert.throws(() => assertCheckout(expected, actual), { message: 'Reviewed checkout required' });
  const script=readFileSync('scripts/hosted-admin-smoke.mjs','utf8');
  assert.ok(script.indexOf('assertCheckout(config.sha, actualHead)') < script.indexOf('await runSmoke(config)'));
});
test('transport refuses all foreign origins/path escapes and redirects', async () => {
  let calls=0; const fetcher=guardedFetch(config().url, async(_url,opts)=>{calls++;assert.equal(opts.redirect,'error');assert.ok(opts.signal);});
  for(const url of ['https://brickcircle.club/admin.html','https://nsxtromjdpdscknadxez.supabase.co/auth/v1/token',`${config().url}/storage/v1/object`,`${config().url}/auth/v1/../../other`]) await assert.rejects(fetcher(url));
  assert.equal(calls,0); await fetcher(`${config().url}/auth/v1/token`); assert.equal(calls,1);
});
test('TOTP uses RFC 6238 SHA1 vector, never a forged JWT', () => { assert.equal(totp(config().totpSecret,59000),'287082'); });
test('private payloads including summary are forbidden in denial envelopes', () => {
  assertDenied({error:'Denied',code:'forbidden'});
  for(const field of ['summary','rows','request','metrics','exchange']) assert.throws(()=>assertDenied({error:'Denied',[field]:{}}));
});
test('GitHub masking escapes command separators and is silent outside Actions', () => {
  const oldEnv=process.env.GITHUB_ACTIONS; const oldLog=console.log; const logs=[];
  try {
    console.log=value=>logs.push(value); process.env.GITHUB_ACTIONS='false'; mask('fake-test-secret'); assert.equal(logs.length,0);
    process.env.GITHUB_ACTIONS='true'; mask('fake%test\r\nsecret');
    assert.deepEqual(logs,['::add-mask::fake%25test%0D%0Asecret']);
  } finally { console.log=oldLog; if(oldEnv===undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS=oldEnv; }
});
function mock({failNote=false,wrongOwner=false,wrongMfaUser=false,denialStatus=401,failCleanup=false}={}) {
  let clients=0, aal='aal1', revoked=false, notes=0; const masks=[]; const requests=[]; const signouts=[];
  const factory=()=>{
    const i=clients++; const user={id:i===0?'member-id':'admin-id',email:config().credentials[i].email,app_metadata:{staging_admin_smoke_run:wrongOwner?'wrong':id}};
    return {rpc:async()=>({data:i===1}),auth:{
      signInWithPassword:async()=>({data:{session:{access_token:`token-${i}`,refresh_token:`refresh-${i}`,user}}}),
      getUser:async()=>({data:{user}}),
      getSession:async()=>({data:{session:{access_token:'verified-token',refresh_token:'verified-refresh',user:wrongMfaUser?{id:'other'}:user}}}),
      signOut:async()=>{signouts.push(i);revoked ||= i===1;return failCleanup?{error:{message:'SECRET-PROVIDER-ERROR'}}:{data:{}};},
      mfa:{ getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}}),listFactors:async()=>({data:{totp:[{id:'factor',status:'verified'}]}}),
        challengeAndVerify:async(args)=>{assert.equal(args.factorId,'factor');assert.match(args.code,/^\d{6}$/);aal='aal2';return {data:{access_token:'verified-token',refresh_token:'verified-refresh'}};}}
    }};
  };
  const transport=async(_url,opts)=>{
    const body=JSON.parse(opts.body);requests.push(body); let status=200,data={};
    const token=opts.headers.Authorization;
    if(token==='Bearer token-0'){status=403;data={error:'Denied',code:'forbidden'};}
    else if(token==='Bearer token-1'){status=403;data={error:'MFA',code:'mfa_required'};}
    else if(revoked){status=denialStatus;data={error:'Expired',code:'unauthenticated'};}
    else if(body.operation==='note') {
      if(failNote) throw new Error('SECRET-PROVIDER-ERROR');
      if(body.reason.startsWith('Different')){status=409;data={error:'Conflict'};}
      else {data={audit_id:'audit',replayed:notes>0};notes=1;}
    } else if(body.section==='overview') data={summary:{members:2}};
    else if(body.section==='support') data={rows:[{id}]};
    else if(body.section==='support_detail') data={request:{id,case_id:id,requested_by:'member-id',note:`Owned staging admin smoke ${id}`,revision:0,status:'open'},exchange:{state:'ACTIVE'},total:body.part==='events'?1:notes,rows:body.part==='events'?[{id:'event'}]:[]};
    return new Response(JSON.stringify(data),{status,headers:{'cache-control':'no-store'}});
  };
  return {factory,transport,conceal:v=>masks.push(v),masks,requests,signouts};
}
test('mocked legitimate MFA API sequence, exact replay/conflict, revocation and bounded evidence',async()=>{
  for(const denialStatus of [401,403]) {
    const deps=mock({denialStatus});const report=await runSmoke(config(),deps);
    assert.equal(report.passed,true);assert.equal(report.realMfa,true);assert.equal(report.retainedDisposableAudit,true);
    assert.deepEqual(deps.requests.filter(x=>x.operation==='note').slice(0,2)[0],deps.requests.filter(x=>x.operation==='note')[1]);
    assert.ok(deps.masks.includes('verified-token'));assert.ok(deps.masks.includes(config().totpSecret));
    assert.ok(deps.signouts.includes(0));assert.ok(deps.signouts.includes(1));
    for(const secret of deps.masks) assert.ok(!JSON.stringify(report).includes(secret));
  }
});
test('failures preserve unknown-delivery cleanup key, suppress provider errors and always sign out',async()=>{
  for(const options of [{failNote:true},{wrongOwner:true},{wrongMfaUser:true},{failCleanup:true}]) {
    const deps=mock(options);const report=await runSmoke(config(),deps);
    assert.equal(report.passed,false);assert.ok(deps.signouts.includes(0));assert.ok(deps.signouts.includes(1));
    assert.ok(!JSON.stringify(report).includes('SECRET-PROVIDER-ERROR'));
    if(options.failNote) assert.ok(report.connectorReview.requestId);
    if(options.wrongOwner||options.wrongMfaUser) assert.equal(deps.requests.filter(x=>x.operation==='note').length,0);
  }
});
test('workflow uses protected reviewed default-branch provenance and no service/bootstrap path',()=>{
  const yaml=readFileSync('.github/workflows/hosted-supabase-admin-smoke.yml','utf8');
  for(const marker of ['environment: hosted-supabase-staging','GITHUB_WORKFLOW_REF','repo.default_branch','pr.head.repo?.full_name','pr.head.sha !==','persist-credentials: false','npm ci --ignore-scripts']) assert.ok(yaml.includes(marker));
  assert.ok(!/SECRET_KEY|bootstrap-hosted|exchange-smoke\.mjs|pull_request_target/.test(yaml));
  const script=readFileSync('scripts/hosted-admin-smoke.mjs','utf8');
  assert.ok(!/createUser|deleteUser|auth\.admin|\.enroll\(|exchange_case_transition|service_role/.test(script));
});
