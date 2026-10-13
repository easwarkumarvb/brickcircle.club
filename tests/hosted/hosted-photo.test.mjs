import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {validateSelection,validateTarget,guardedFetch,CANDIDATE_SHA,CONFIRMATION,PROVENANCE,STAGING_REF,PRODUCTION_REF} from '../../scripts/validate-hosted-photo.mjs';
import {runPhotoVerification,IMAGE,signedUrl,assertDenied,assertExpiredResponse} from '../../scripts/hosted-photo-http.mjs';
const repository='easwarkumarvb/brickcircle.club';
const prs=()=>PROVENANCE.map(p=>({number:p.number,merged:true,state:'closed',merge_commit_sha:p.merge,head:{sha:p.head,ref:p.branch,repo:{full_name:repository}},base:{ref:'main',repo:{full_name:repository}}}));
const selection=()=>({repository,ref:'refs/heads/main',eventName:'workflow_dispatch',sha:CANDIDATE_SHA,confirmation:CONFIRMATION,prs:prs()});
const env=()=>({BC_HOSTED_SMOKE_CONFIRMATION:CONFIRMATION,BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA:CANDIDATE_SHA,BC_STAGING_SUPABASE_PROJECT_REF:STAGING_REF,BC_PRODUCTION_SUPABASE_PROJECT_REF:PRODUCTION_REF,BC_STAGING_SUPABASE_URL:`https://${STAGING_REF}.supabase.co`,BC_STAGING_ALLOWED_EMAIL_DOMAIN:'example.test',BC_STAGING_NOTIFICATION_MODE:'outbox-only',BC_STAGING_SUPABASE_PUBLISHABLE_KEY:'public-fixture',BC_STAGING_SET_A:'42143',BC_STAGING_SET_B:'21309',...Object.fromEntries(['A','B','C'].flatMap(label=>[[`BC_STAGING_USER_${label}_EMAIL`,`${label.toLowerCase()}@example.test`],[`BC_STAGING_USER_${label}_PASSWORD`,'fixture-only']]))});
test('immutable merged selection rejects every altered trust boundary',()=>{
  assert.equal(validateSelection(selection()),CANDIDATE_SHA);
  for(const [field,value] of [['ref','refs/heads/qa/test'],['eventName','push'],['sha','f'.repeat(40)],['repository','other/repo'],['confirmation','yes']])assert.throws(()=>validateSelection({...selection(),[field]:value}));
  for(const index of [0,1])for(const mutation of [p=>p.merged=false,p=>p.state='open',p=>p.head.sha='f'.repeat(40),p=>p.merge_commit_sha='f'.repeat(40),p=>p.head.repo.full_name='foreign/repo',p=>p.base.ref='dev']){
    const value=selection();mutation(value.prs[index]);assert.throws(()=>validateSelection(value));
  }
});
test('public target rejects production notifications real identities and server credentials',()=>{
  validateTarget(env(),{publicOnly:true});
  for(const [field,value] of [['BC_STAGING_SUPABASE_URL',`https://${PRODUCTION_REF}.supabase.co`],['BC_STAGING_ALLOWED_EMAIL_DOMAIN','gmail.com'],['BC_STAGING_NOTIFICATION_MODE','provider'],['BC_STAGING_SUPABASE_SECRET_KEY','private'],['SUPABASE_SERVICE_ROLE_KEY','private'],['BC_STAGING_SUPABASE_PROJECT_REF',PRODUCTION_REF]])assert.throws(()=>validateTarget({...env(),[field]:value},{publicOnly:true}));
});
test('transport never sends forbidden origins paths credentials or redirect-follow options',async()=>{
  const calls=[];const send=guardedFetch(async(input,init)=>{calls.push({input,init});return new Response('{}');});
  for(const value of [`https://${PRODUCTION_REF}.supabase.co/rest/v1/x`,'https://example.test/rest/v1/x',`https://bad:secret@${STAGING_REF}.supabase.co/rest/v1/x`,`https://${STAGING_REF}.supabase.co/functions/v1/deliver`,`https://${STAGING_REF}.supabase.co:444/rest/v1/x`,`https://${STAGING_REF}.supabase.co/rest/v1/x#secret`])await assert.rejects(()=>send(value));
  assert.equal(calls.length,0);
  await send(new Request(`https://${STAGING_REF}.supabase.co/storage/v1/object/sign/collection-photos/a`,{redirect:'follow'}),{redirect:'follow'});
  assert.equal(calls[0].init.redirect,'error');assert.ok(calls[0].init.signal instanceof AbortSignal);
});
test('signed capability normalization rejects external and unrelated endpoint values',()=>{
  assert.ok(signedUrl('/object/sign/collection-photos/a?token=fixture').includes('/storage/v1/object/sign/'));
  for(const value of ['https://example.test/object/sign/collection-photos/a?token=fixture','/object/public/collection-photos/a?token=fixture','/object/sign/collection-photos/a'])assert.throws(()=>signedUrl(value));
  assert.throws(()=>signedUrl('/object/sign/collection-photos/other?token=fixture','expected'));
  for(const status of [200,302,429,500,503])assert.throws(()=>assertDenied({status}));
});
function fixtureTransport({missingPolicy=false,forgeGap=false}={}){
  const ids=['A','B','C'].map((_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`);
  const objects=new Map();const rows=new Map();const capabilities=new Map();const calls=[];
  let current={id:'case-fixture',state:'PROPOSED',state_version:1};let serial=0;let expired=false;let forged=false;let caseCreated=false;
  const result=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const send=async(raw,init)=>{
    const url=new URL(raw);const path=url.pathname;const method=init.method||'GET';const headers=init.headers||{};const who=headers.Authorization?.replace('Bearer session-','');
    const body=typeof init.body==='string'?JSON.parse(init.body):init.body;
    calls.push({path,method,body,who});assert.equal(init.redirect,'error');
    if(path==='/auth/v1/token')return result({user:{id:ids['abc'.indexOf(body.email[0])]},access_token:`session-${body.email[0].toUpperCase()}`});
    if(path==='/auth/v1/user')return result({id:ids['ABC'.indexOf(who)]});
    if(path==='/rest/v1/collection_items'){
      if(method==='DELETE'){forged=false;return result([]);}
      if(who==='C'){assert.ok(!Object.hasOwn(body,'available_for_exchange'),'Fixture must respect actual column grants');forged=true;return result([{id:'forged-fixture',owner_photo_path:body.owner_photo_path}]);}
      rows.set(who,body);return result([{id:`item-${who}`}]);
    }
    if(path==='/rest/v1/wishlists')return result([]);
    if(path==='/rest/v1/rpc/set_exchange_item_availability')return result({status:'AVAILABLE'});
    if(path==='/rest/v1/rpc/find_matches')return result([]);
    if(path==='/rest/v1/rpc/create_exchange_case'){caseCreated=true;return result({case:{...current}});}
    if(path==='/rest/v1/rpc/exchange_case_transition'){
      assert.equal(body.p_expected_version,current.state_version,'Canonical expected version must use state_version');
      current={...current,state:body.p_action==='accept'?'ACCEPTED':'CANCELLED',state_version:current.state_version+1};return result({case:{...current}});
    }
    if(path==='/storage/v1/object/move')return result({error:'denied'},403);
    if(path==='/storage/v1/object/collection-photos'&&method==='DELETE'){
      const name=body.prefixes[0];if(!name.startsWith(`${ids['ABC'.indexOf(who)]}/`))return result([]);
      objects.delete(name);return result([{name}]);
    }
    if(path.startsWith('/storage/v1/object/authenticated/'))return result({error:'denied'},403);
    if(path.startsWith('/storage/v1/object/sign/')){
      if(method==='GET'){
        const cap=capabilities.get(url.searchParams.get('token'));if(!cap||cap.short&&expired)return result({code:'ExpiredToken',message:'The provided token has expired.'},400);
        return new Response(objects.get(cap.name),{status:200});
      }
      const name=path.split('/collection-photos/')[1];
      const owner=name.startsWith(`${ids['ABC'.indexOf(who)]}/`);
      if(!objects.has(name)||!who||who==='C'&&!(forgeGap&&forged)||!owner&&missingPolicy&&caseCreated)return result({error:'denied'},403);
      const token=`fixture-${++serial}`;capabilities.set(token,{name,short:body.expiresIn===1});
      return result({signedURL:`/object/sign/collection-photos/${name}?token=${token}`});
    }
    if(path.startsWith('/storage/v1/object/collection-photos/')){
      const name=path.split('/collection-photos/')[1];if(!name.startsWith(`${ids['ABC'.indexOf(who)]}/`))return result({error:'denied'},403);
      objects.set(name,Buffer.from(body));return result({Key:name});
    }
    throw new Error('Unexpected fixture endpoint');
  };
  return {send,calls,sleep:async()=>{expired=true;}};
}
test('complete photo journey checks actual bytes canonical versions denial and expiry',async()=>{
  const fixture=fixtureTransport();const report=await runPhotoVerification(env(),fixture.send,fixture.sleep);
  assert.equal(report.ok,true);assert.equal(report.checks.length,9);assert.equal(report.productionRequests,0);
  assert.ok(fixture.calls.some(call=>call.body?.p_action==='cancel'));
  assert.ok(fixture.calls.some(call=>call.who==='C'&&call.body?.owner_photo_path));
});
test('missing participant policy stops before accept or later positive claims',async()=>{
  const fixture=fixtureTransport({missingPolicy:true});await assert.rejects(()=>runPhotoVerification(env(),fixture.send,fixture.sleep));
  assert.ok(fixture.calls.some(call=>call.path==='/rest/v1/rpc/create_exchange_case'));
  assert.ok(!fixture.calls.some(call=>call.body?.p_action==='accept'));
});
test('forged collection reference access fails verification before archive success',async()=>{
  const fixture=fixtureTransport({forgeGap:true});await assert.rejects(()=>runPhotoVerification(env(),fixture.send,fixture.sleep));
  assert.ok(fixture.calls.some(call=>call.who==='C'&&call.body?.owner_photo_path));
  assert.ok(!fixture.calls.some(call=>call.body?.p_action==='cancel'));
});
test('expiration accepts explicit Storage expired token but rejects arbitrary bad requests',async()=>{
  await assertExpiredResponse(new Response(JSON.stringify({code:'ExpiredToken',message:'The provided token has expired.'}),{status:400}));
  await assertExpiredResponse(new Response(JSON.stringify({message:'jwt expired'}),{status:403}));
  for(const detail of [{code:'InvalidRequest'},{message:'invalid signature'},{code:'23514'},{statusCode:403,message:'permission denied'}])await assert.rejects(()=>assertExpiredResponse(new Response(JSON.stringify(detail),{status:400})));
});
test('changed signed download bytes fail verification',async()=>{
  const fixture=fixtureTransport();
  const send=async(url,init)=>{const response=await fixture.send(url,init);return new URL(url).pathname.startsWith('/storage/v1/object/sign/')&&(!init.method||init.method==='GET')&&response.ok?new Response('corrupt-fixture'):response;};
  await assert.rejects(()=>runPhotoVerification(env(),send,fixture.sleep));
});
test('infrastructure errors cannot certify a foreign mutation denial',async()=>{
  const fixture=fixtureTransport();
  const send=async(url,init)=>{const response=await fixture.send(url,init);return init.method==='PUT'&&response.status===403?new Response('{}',{status:503}):response;};
  await assert.rejects(()=>runPhotoVerification(env(),send,fixture.sleep));
});
test('workflow is manual protected pinned and never passes server secret to HTTP harness',async()=>{
  const source=await readFile('.github/workflows/hosted-photo-verification.yml','utf8');
  assert.ok(source.includes('workflow_dispatch:'));assert.ok(!/^  (push|pull_request):/m.test(source));
  assert.ok(source.includes('environment: hosted-supabase-staging'));assert.ok(source.includes('group: hosted-supabase-exchange-smoke'));
  assert.equal((source.match(/validateSelection\(/g)||[]).length,2);
  assert.ok(source.includes(`ref: ${CANDIDATE_SHA}`));
  assert.ok(source.includes('working-directory: candidate\n        run: node --test tests/static/owner-photo-signed-url-runtime.test.mjs'));
  const step=source.split('name: Public-key Storage HTTP')[1].split('      - name:')[0];
  assert.ok(!step.includes('SECRET_KEY'));assert.ok(!source.includes('apply_migration'));
  const deployment=JSON.parse(await readFile('vercel.json','utf8'));assert.equal(deployment.git.deploymentEnabled['qa/hosted-photo-verification'],false);
});

test('uploaded dummy PNG has valid chunk checksums and decodes to one RGBA pixel',()=>{
  assert.deepEqual([...IMAGE.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  let offset=8;const types=[];const compressed=[];
  while(offset<IMAGE.length){
    const length=IMAGE.readUInt32BE(offset);assert.ok(offset+12+length<=IMAGE.length);
    const type=IMAGE.toString('ascii',offset+4,offset+8),bytes=IMAGE.subarray(offset+4,offset+8+length);
    let sum=0xffffffff;
    for(const byte of bytes){sum^=byte;for(let bit=0;bit<8;bit++)sum=(sum>>>1)^((sum&1)?0xedb88320:0);}
    assert.equal(IMAGE.readUInt32BE(offset+8+length),(sum^0xffffffff)>>>0,`PNG ${type} checksum`);
    const data=IMAGE.subarray(offset+8,offset+8+length);types.push(type);
    if(type==='IHDR'){assert.equal(data.readUInt32BE(0),1);assert.equal(data.readUInt32BE(4),1);assert.equal(data[8],8);assert.equal(data[9],6);}
    if(type==='IDAT')compressed.push(data);
    offset+=length+12;
  }
  assert.deepEqual(types,['IHDR','IDAT','IEND']);
  assert.deepEqual([...inflateSync(Buffer.concat(compressed))],[0,255,255,255,255]);
});
