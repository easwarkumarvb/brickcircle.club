import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateTarget,guardedFetch,CANDIDATE_SHA} from './validate-hosted-photo.mjs';
import {validateStagingEmails,serializeRedactedReport} from './hosted-exchange-smoke.mjs';
// A valid one-pixel PNG. It is generated fixture data, never an owner photograph.
export const IMAGE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==','base64');
const BASE='https://tteyypklldgwwicrgjzt.supabase.co';
const BUCKET='collection-photos';
export function signedUrl(value,expectedPath){
  assert.equal(typeof value,'string');
  const url=new URL(value.startsWith('/object/')?`/storage/v1${value}`:value,BASE);
  assert.equal(url.origin,BASE);
  assert.ok(!url.username&&!url.password&&!url.hash);
  assert.ok(url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`));
  assert.ok(url.searchParams.get('token'));
  if(expectedPath!==undefined)assert.equal(url.pathname,`/storage/v1/object/sign/${BUCKET}/${expectedPath}`,'Signed capability names a different object');
  return url.href;
}
export function assertDenied(response){
  // Infrastructure failures must not masquerade as access-control evidence.
  assert.ok([400,401,403,404].includes(response.status),'Expected permission denial');
}
const expiryFailures=new WeakMap();
export async function assertExpiredResponse(response){
  // Storage also wraps JOSE's specific exp-claim failure in InvalidJWT. Neither
  // InvalidJWT alone nor an arbitrary bad request proves capability expiration.
  let responseClass='non-json';
  try{
    const detail=await response.json();
    const object=detail&&typeof detail==='object'&&!Array.isArray(detail)?detail:{};
    if(object.code==='ExpiredToken'||object.error==='ExpiredToken')responseClass='expired-token';
    else if(typeof object.message==='string'&&/^jwt expired$/i.test(object.message))responseClass='legacy-jwt-expired';
    else if(object.code==='InvalidJWT'||object.error==='InvalidJWT')responseClass=object.message==='"exp" claim timestamp check failed'?'jose-expired-invalid-jwt':'invalid-jwt-other';
    else responseClass='unrecognized-json';
  }catch{ /* Parsing failures remain a fixed category, never a raw body. */ }
  const httpStatus=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
  if(![400,401,403].includes(httpStatus)||!['expired-token','legacy-jwt-expired','jose-expired-invalid-jwt'].includes(responseClass)||(responseClass==='jose-expired-invalid-jwt'&&httpStatus!==400)){
    const error=new Error('Expected explicit expired capability evidence');
    expiryFailures.set(error,{httpStatus,responseClass});
    throw error;
  }
}
const failures=new WeakMap();
export function photoFailureReport(error){
  return failures.get(error)||{ok:false,testedHeadSha:CANDIDATE_SHA,target:'approved-staging',failedStage:'photo HTTP verification',checks:[]};
}
export async function runPhotoVerification(env,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  const progress={stage:'target validation',checks:[]};
  try{return await verifyPhotoJourney(env,fetchImpl,sleep,progress);}
  catch{
    // Never carry server bodies, assertion operands, identities or credentials
    // into an error or evidence file. Only fixed labels and bounded expiry
    // status/classification fields survive.
    const error=new Error('Hosted photo verification failed; values withheld');
    failures.set(error,{ok:false,testedHeadSha:CANDIDATE_SHA,target:'approved-staging',failedStage:progress.stage,checks:[...progress.checks],...(progress.expiryDiagnostic?{expiryDiagnostic:progress.expiryDiagnostic}:{})});
    throw error;
  }
}
async function verifyPhotoJourney(env,fetchImpl,sleep,progress){
  validateTarget(env,{publicOnly:true});
  const send=guardedFetch(fetchImpl);
  const key=env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY;
  const run=randomUUID();const checks=progress.checks;
  progress.stage='fixture validation';
  const denied=async(response)=>{
    assertDenied(response);
    if(response.status===400){
      const detail=await response.json();
      assert.ok([401,403,404].includes(Number(detail.statusCode))||detail.code==='42501','Bad request is not permission evidence');
    }
  };
  const users=validateStagingEmails(['A','B','C'].map(label=>({label,email:env[`BC_STAGING_USER_${label}_EMAIL`],password:env[`BC_STAGING_USER_${label}_PASSWORD`]})),'example.test');
  const sets=[env.BC_STAGING_SET_A,env.BC_STAGING_SET_B];
  assert.ok(sets.every(value=>/^\d{3,8}(?:-\d+)?$/.test(value||''))&&sets[0]!==sets[1]);
  const request=(path,user,method='GET',body,extra={})=>send(`${BASE}${path}`,{method,headers:{apikey:key,...(user?{Authorization:`Bearer ${user.session}`}:{}) ,...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const json=async(response)=>{assert.ok(response.ok,'Staging API request failed');return response.json();};
  const rpc=async(user,name,body)=>json(await request(`/rest/v1/rpc/${name}`,user,'POST',body));
  const upload=(user,path,bytes=IMAGE,method='POST',extra={})=>send(`${BASE}/storage/v1/object/${BUCKET}/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${user.session}`,'Content-Type':'image/png','Cache-Control':'max-age=0',...extra},body:bytes});
  const sign=(user,path,expiresIn=60)=>request(`/storage/v1/object/sign/${BUCKET}/${path}`,user,'POST',{expiresIn});
  const verify=async(user,path)=>{
    const value=await json(await sign(user,path));
    const response=await send(signedUrl(value.signedURL,path));assert.ok(response.ok,'Signed download failed');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),IMAGE,'Signed download bytes changed');
  };
  progress.stage='synthetic account authentication';
  for(const user of users){
    const result=await json(await request('/auth/v1/token?grant_type=password',null,'POST',{email:user.email,password:user.password}));
    assert.match(result.user?.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);assert.ok(result.access_token);user.id=result.user.id;user.session=result.access_token;
    const verified=await json(await request('/auth/v1/user',user));assert.equal(verified.id,user.id);
  }
  const [a,b,c]=users;assert.equal(new Set(users.map(user=>user.id)).size,3);
  progress.stage='owner upload update and signed bytes';
  const items=[];
  for(const [index,user] of [a,b].entries()){
    user.photo=`${user.id}/hosted-photo-${run}.png`;
    await json(await upload(user,user.photo));
    const rows=await json(await request('/rest/v1/collection_items?select=id',user,'POST',{user_id:user.id,set_number:sets[index],condition:'Excellent',completeness:100,original_box:false,notes:'Synthetic hosted photo QA fixture',owner_photo_path:user.photo},{Prefer:'return=representation'}));
    assert.equal(rows.length,1);user.item=rows[0].id;items.push(user.item);
    await verify(user,user.photo);
    await json(await upload(user,user.photo,IMAGE,'PUT'));await verify(user,user.photo);
    await rpc(user,'set_exchange_item_availability',{p_item_id:user.item,p_available:true});
    await json(await request('/rest/v1/wishlists',user,'POST',{user_id:user.id,set_number:sets[1-index],priority:3},{Prefer:'return=representation'}));
  }
  checks.push('owner upload update and signed bytes');
  progress.stage='reciprocal match signed bytes';
  await verify(a,b.photo);await verify(b,a.photo);checks.push('reciprocal match signed bytes');
  progress.stage='canonical proposal';
  let current=(await rpc(a,'create_exchange_case',{p_offered_item_id:a.item,p_requested_item_id:b.item,p_duration_days:30,p_message:'Synthetic hosted photo QA proposal',p_idempotency_key:`${run}:proposal`})).case;
  assert.equal(current?.state,'PROPOSED');
  const transition=async(user,action)=>{
    current=(await rpc(user,'exchange_case_transition',{p_case_id:current.id,p_expected_version:current.state_version,p_action:action,p_idempotency_key:`${run}:${action}`,p_payload:{}})).case;
  };
  const checkPermissions=async(label)=>{
    // This is the functional migration preflight at PROPOSED: canonical locking
    // has removed reciprocal matching, so a missing policy fails closed here.
    await verify(a,b.photo);await verify(b,a.photo);
    for(const path of [a.photo,b.photo]){
      await denied(await sign(c,path));await denied(await sign(null,path));
      await denied(await request(`/storage/v1/object/authenticated/${BUCKET}/${path}`,c));
      await denied(await request(`/storage/v1/object/authenticated/${BUCKET}/${path}`,null));
    }
    checks.push(`${label} participants read outsider and anonymous denied`);
  };
  progress.stage='PROPOSED participant permissions';
  await checkPermissions('PROPOSED');
  progress.stage='ACCEPTED participant permissions';
  await transition(b,'accept');assert.equal(current.state,'ACCEPTED');await checkPermissions('ACCEPTED');
  // Participants can read, but cannot overwrite or create objects in the peer folder.
  progress.stage='foreign mutation denial';
  for(const intruder of [a,c]){
    await denied(await upload(intruder,b.photo,IMAGE,'PUT'));
    await denied(await upload(intruder,`${b.id}/foreign-${run}.png`));
    await denied(await upload(intruder,b.photo,IMAGE,'POST',{'x-upsert':'true'}));
    await denied(await request('/storage/v1/object/move',intruder,'POST',{bucketId:BUCKET,sourceKey:b.photo,destinationKey:`${b.id}/moved-${run}.png`}));
    const removed=await request(`/storage/v1/object/${BUCKET}`,intruder,'DELETE',{prefixes:[b.photo]});
    if(removed.ok){const rows=await removed.json();assert.ok(Array.isArray(rows)&&rows.length===0,'Foreign delete removed an object');}
    else await denied(removed);
    await verify(b,b.photo);
  }
  checks.push('foreign update insert upsert move delete denied and owner bytes intact');
  // An outsider must not acquire read access by pointing their own collection
  // row at another member's object. Use only these run-owned synthetic paths.
  progress.stage='forged reference denial';
  const forged=await json(await request('/rest/v1/collection_items?select=id,owner_photo_path',c,'POST',{user_id:c.id,set_number:sets[1],condition:'Excellent',completeness:100,original_box:false,notes:'Synthetic forged photo reference QA fixture',owner_photo_path:b.photo},{Prefer:'return=representation'}));
  assert.equal(forged.length,1);assert.equal(forged[0].owner_photo_path,b.photo);
  await denied(await sign(c,b.photo));await verify(b,b.photo);
  const changed=await json(await request(`/rest/v1/collection_items?id=eq.${forged[0].id}&select=id,owner_photo_path`,c,'PATCH',{owner_photo_path:a.photo},{Prefer:'return=representation'}));
  assert.equal(changed.length,1);assert.equal(changed[0].owner_photo_path,a.photo);
  await denied(await sign(c,a.photo));await verify(a,a.photo);
  await json(await request(`/rest/v1/collection_items?id=eq.${forged[0].id}`,c,'DELETE',undefined,{Prefer:'return=representation'}));
  checks.push('outsider forged collection photo reference denied');
  progress.stage='CANCELLED archive participant permissions';
  await transition(a,'cancel');assert.equal(current.state,'CANCELLED');
  for(const user of [a,b])await json(await request(`/rest/v1/wishlists?user_id=eq.${user.id}`,user,'DELETE',undefined,{Prefer:'return=representation'}));
  for(const user of [a,b]){
    const matches=await rpc(user,'find_matches',{p_user:user.id});
    assert.ok(Array.isArray(matches));assert.ok(!matches.some(match=>[match.offered_item,match.requested_item].some(id=>items.includes(id))),'Reciprocal authorization persists');
  }
  await checkPermissions('CANCELLED archive without wishlists');
  // Do not download before expiration: this proves origin rejection rather than
  // accidentally accepting a CDN-cached response fetched while still valid.
  progress.stage='signed capability expiration';
  const expired=await json(await sign(a,a.photo,1));await sleep(2500);
  const expiryResponse=await send(signedUrl(expired.signedURL,a.photo));
  try{await assertExpiredResponse(expiryResponse);}
  catch(error){progress.expiryDiagnostic=expiryFailures.get(error);throw error;}
  await verify(a,a.photo);checks.push('expired capability denied freshly signed capability downloads');
  progress.stage='owner deletes exact dummy objects';
  // Owner deletion is limited to this run's known dummy objects; retain case rows.
  for(const user of [a,b]){
    const deleted=await json(await request(`/storage/v1/object/${BUCKET}`,user,'DELETE',{prefixes:[user.photo]}));
    assert.equal(deleted.length,1);await denied(await sign(user,user.photo));
  }
  checks.push('owner deletes exact dummy objects');
  return {ok:true,testedHeadSha:CANDIDATE_SHA,target:'approved-staging',checks,productionRequests:0,unexpectedRequests:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  let report;
  try{report=await runPhotoVerification(process.env);console.log('Hosted photo HTTP permission and signed download checks passed.');}
  catch(error){report=photoFailureReport(error);process.exitCode=1;console.error(`Hosted photo verification failed at ${report.failedStage}; values withheld. No schema changes attempted.`);}
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-photo-http.json',serializeRedactedReport(report));
}
