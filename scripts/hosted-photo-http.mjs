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
export async function assertExpiredResponse(response,onEvidence=()=>{},{verifiedBeforeExpiry=false}={}){
  const evidence={httpStatus:response.status,storageErrorCode:'Other'};
  assert.ok([400,401,403].includes(response.status),'Expected expired capability response');
  const detail=await response.json();
  const storageCode=detail.code||detail.error;
  if(['ExpiredToken','InvalidJWT','InvalidSignature','SignatureDoesNotMatch','AccessDenied','NoSuchKey','InternalError','InvalidRequest'].includes(storageCode))evidence.storageErrorCode=storageCode;
  else if(/^jwt expired$/i.test(detail.message||''))evidence.storageErrorCode='JwtExpired';
  onEvidence(evidence);
  if(detail.statusCode!==undefined)assert.equal(Number(detail.statusCode),response.status,'Storage error statusCode did not match HTTP status');
  const explicitExpiry=detail.code==='ExpiredToken'||detail.error==='ExpiredToken'||/^jwt expired$/i.test(detail.message||'');
  // Supabase Storage may report an expired signed JWT as InvalidJWT rather than
  // ExpiredToken. Accept that generic code ONLY for a short-lived capability
  // whose exact URL fetched the expected owner bytes before waiting for expiry.
  const provenExpiry=response.status===400&&storageCode==='InvalidJWT'&&verifiedBeforeExpiry===true;
  assert.ok(explicitExpiry||provenExpiry,'Expected explicit expired token evidence or a previously valid signed capability now denied as InvalidJWT');
  return evidence;
}
const failures=new WeakMap();
export function photoFailureReport(error){
  return failures.get(error)||{ok:false,testedHeadSha:CANDIDATE_SHA,target:'approved-staging',failedStage:'photo HTTP verification',checks:[]};
}
export async function runPhotoVerification(env,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),{expectedSha=CANDIDATE_SHA}={}){
  const progress={stage:'target validation',checks:[]};
  try{return await verifyPhotoJourney(env,fetchImpl,sleep,progress,expectedSha);}
  catch{
    // Keep response evidence limited to the expiration probe's allowlisted fields.
    const error=new Error('Hosted photo verification failed; values withheld');
    failures.set(error,{ok:false,testedHeadSha:expectedSha,target:'approved-staging',failedStage:progress.stage,checks:[...progress.checks],...(progress.expirationProbe?{expirationProbe:{...progress.expirationProbe}}:{})});
    throw error;
  }
}
async function verifyPhotoJourney(env,fetchImpl,sleep,progress,expectedSha){
  validateTarget(env,{publicOnly:true,expectedSha});
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
  const downloadCapability=(url,{cacheBust=false}={})=>{
    const target=new URL(url);
    if(cacheBust)target.searchParams.set('cacheBust',randomUUID());
    const headers=cacheBust?{'Cache-Control':'no-cache, no-store, max-age=0',Pragma:'no-cache'}:{'Cache-Control':'no-cache'};
    return send(target.href,{cache:'no-store',headers});
  };
  const verify=async(user,path)=>{
    const value=await json(await sign(user,path));
    const response=await downloadCapability(signedUrl(value.signedURL,path));assert.ok(response.ok,'Signed download failed');
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
  // Use a fresh object path so a cached response from earlier reads cannot
  // satisfy this request without the expired capability being checked.
  progress.stage='signed capability expiration';
  a.expirationPhoto=`${a.id}/hosted-photo-expiration-${run}.png`;
  progress.expirationProbe={httpStatus:null,storageErrorCode:null,cacheStatus:null,cacheAgeSeconds:null,validBeforeExpiry:false};
  const expirationReference=await json(await request(`/rest/v1/collection_items?id=eq.${a.item}&select=id,owner_photo_path`,a,'PATCH',{owner_photo_path:a.expirationPhoto},{Prefer:'return=representation'}));
  assert.equal(expirationReference.length,1);assert.equal(expirationReference[0].owner_photo_path,a.expirationPhoto);
  await json(await upload(a,a.expirationPhoto));
  // Establish that this *same* capability was valid before it expired. This
  // distinguishes Storage's generic InvalidJWT result from a malformed token,
  // bad fixture, missing owner authorization, or unavailable Storage service.
  const expired=await json(await sign(a,a.expirationPhoto,15));
  const capability=signedUrl(expired.signedURL,a.expirationPhoto);
  const beforeExpiry=await downloadCapability(capability,{cacheBust:true});
  assert.equal(beforeExpiry.status,200,'Short-lived capability must be valid before the expiry wait');
  assert.deepEqual(Buffer.from(await beforeExpiry.arrayBuffer()),IMAGE,'Short-lived capability returned unexpected bytes before expiration');
  progress.expirationProbe.validBeforeExpiry=true;
  await sleep(19000);
  const expiredResponse=await downloadCapability(capability,{cacheBust:true});
  progress.expirationProbe.httpStatus=Number.isInteger(expiredResponse.status)?expiredResponse.status:null;
  const cacheStatus=(expiredResponse.headers.get('cf-cache-status')||expiredResponse.headers.get('x-cache')||'').trim().toUpperCase();
  if(['HIT','MISS','BYPASS','EXPIRED','REVALIDATED','STALE','DYNAMIC','UPDATING'].includes(cacheStatus))progress.expirationProbe.cacheStatus=cacheStatus;
  const cacheAge=expiredResponse.headers.get('age');
  if(cacheAge&&/^\d{1,10}$/.test(cacheAge))progress.expirationProbe.cacheAgeSeconds=Number(cacheAge);
  await assertExpiredResponse(expiredResponse,evidence=>{progress.expirationProbe.storageErrorCode=evidence.storageErrorCode;},{verifiedBeforeExpiry:progress.expirationProbe.validBeforeExpiry});
  const restoredReference=await json(await request(`/rest/v1/collection_items?id=eq.${a.item}&select=id,owner_photo_path`,a,'PATCH',{owner_photo_path:a.photo},{Prefer:'return=representation'}));
  assert.equal(restoredReference.length,1);assert.equal(restoredReference[0].owner_photo_path,a.photo);
  await verify(a,a.photo);checks.push('expired capability denied freshly signed capability downloads');
  progress.stage='owner deletes exact dummy objects';
  // Owner deletion is limited to this run's known dummy objects; retain case rows.
  for(const user of [a,b]){
    const deleted=await json(await request(`/storage/v1/object/${BUCKET}`,user,'DELETE',{prefixes:[user.photo]}));
    assert.equal(deleted.length,1);await denied(await sign(user,user.photo));
  }
  // Storage removal also needs SELECT visibility. Temporarily bind this exact
  // fixture object to its owner's row so row-backed RLS can expose it.
  try{
    const cleanupReference=await json(await request(`/rest/v1/collection_items?id=eq.${a.item}&select=id,owner_photo_path`,a,'PATCH',{owner_photo_path:a.expirationPhoto},{Prefer:'return=representation'}));
    assert.equal(cleanupReference.length,1);assert.equal(cleanupReference[0].owner_photo_path,a.expirationPhoto);
    const expiredFixture=await json(await request(`/storage/v1/object/${BUCKET}`,a,'DELETE',{prefixes:[a.expirationPhoto]}));
    assert.equal(expiredFixture.length,1);
  }finally{
    const restoredCleanupReference=await json(await request(`/rest/v1/collection_items?id=eq.${a.item}&select=id,owner_photo_path`,a,'PATCH',{owner_photo_path:a.photo},{Prefer:'return=representation'}));
    assert.equal(restoredCleanupReference.length,1);assert.equal(restoredCleanupReference[0].owner_photo_path,a.photo);
  }
  await denied(await sign(a,a.expirationPhoto));
  checks.push('owner deletes exact dummy objects');
  return {ok:true,testedHeadSha:expectedSha,target:'approved-staging',checks,productionRequests:0,unexpectedRequests:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  let report;
  try{report=await runPhotoVerification(process.env,fetch,undefined,{expectedSha:process.env.BC_HOSTED_SMOKE_EXPECTED_HEAD_SHA||CANDIDATE_SHA});console.log('Hosted photo HTTP permission and signed download checks passed.');}
  catch(error){report=photoFailureReport(error);process.exitCode=1;console.error(`Hosted photo verification failed at ${report.failedStage}; values withheld. No schema changes attempted.`);}
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-photo-http.json',serializeRedactedReport(report));
}
