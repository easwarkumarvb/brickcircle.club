import {test,expect} from '@playwright/test';
import {dispatchPush,payloadFor,type PushNotification} from '../../supabase/functions/send-web-push/core';

const proposal:PushNotification={id:'note-1',user_id:'user-b',kind:'request_received',title:'New exchange proposal',body:'Ramya proposed an exchange with you.',entity_type:'exchange_request',entity_id:'request-1',metadata:{}};
const subscription={id:'sub-1',endpoint:'https://push.example/1',p256dh:'key',auth:'auth'};

test('proposal and reciprocal match payloads use safe canonical deep links',()=>{
  expect(payloadFor(proposal)).toMatchObject({type:'exchange_proposal',url:'/v2.html#exchanges/request-1'});
  expect(payloadFor({...proposal,kind:'reciprocal_match',entity_type:'reciprocal_match',entity_id:'match-1'})).toMatchObject({type:'reciprocal_match',url:'/v2.html#matches'});
  expect(payloadFor({...proposal,kind:'exchange_accepted'})).toBeNull();
});

test('delivery claim deduplicates repeated dispatch for the same device',async()=>{
  const claims=new Set<string>();let sends=0;
  const deps={claim:async(n:string,s:string)=>{const key=`${n}:${s}`;if(claims.has(key))return false;claims.add(key);return true},send:async()=>{sends++;return 201},success:async()=>{},gone:async()=>{},failure:async()=>{}};
  await dispatchPush(proposal,[subscription],deps);
  const repeat=await dispatchPush(proposal,[subscription],deps);
  expect(sends).toBe(1);expect(repeat.skipped).toBe(1);
});

test('expired endpoints are disabled and temporary push failure remains non-fatal',async()=>{
  let gone=0,failed=0;
  const base={claim:async()=>true,success:async()=>{},gone:async()=>{gone++},failure:async()=>{failed++}};
  const expired=await dispatchPush(proposal,[subscription],{...base,send:async()=>{throw Object.assign(new Error('Gone'),{statusCode:410})}});
  const temporary=await dispatchPush({...proposal,id:'note-2'},[subscription],{...base,send:async()=>{throw new Error('network unavailable')}});
  expect(expired.disabled).toBe(1);expect(gone).toBe(1);
  expect(temporary.failed).toBe(1);expect(failed).toBe(1);
});
