import {test,expect} from '@playwright/test';
import {buildBrevoMessage,dispatchNotificationEmail,isTransientEmailFailure,retryDelaySeconds,SUPPORTED_EMAIL_KINDS,type EmailDelivery,type EmailNotification} from '../../supabase/functions/send-notification-email/core';

const notification:EmailNotification={id:'10000000-0000-4000-8000-000000000001',user_id:'20000000-0000-4000-8000-000000000002',kind:'request_received',title:'New exchange proposal',body:'A collector proposed an exchange.',entity_type:'exchange_request',entity_id:'30000000-0000-4000-8000-000000000003'};
const delivery:EmailDelivery={id:'40000000-0000-4000-8000-000000000004',notification_id:notification.id,recipient_user_id:notification.user_id,notification_kind:notification.kind,attempt_count:1};

test('Brevo payload uses the verified BrickCircle sender, reply-to and deterministic idempotency key',()=>{
  const message=buildBrevoMessage(notification,'recipient@example.com');
  expect(message.sender).toEqual({name:'BrickCircle',email:'notifications@brickcircle.club'});
  expect(message.replyTo).toEqual({name:'BrickCircle Support',email:'support@brickcircle.club'});
  expect(message.to).toEqual([{email:'recipient@example.com'}]);
  expect(message.headers['Idempotency-Key']).toBe(`brickcircle-notification-${notification.id}`);
  expect(message.htmlContent).toContain(`/v2.html#exchanges/${notification.entity_id}`);
});

test('only explicit high-value durable notification kinds are email-enabled',()=>{
  expect([...SUPPORTED_EMAIL_KINDS]).toEqual(expect.arrayContaining(['reciprocal_match','request_received','exchange_accepted','exchange_declined','exchange_cancelled','meetup_proposed','swap_started','return_meetup_proposed','return_overdue','return_dispute','return_completed']));
  expect(SUPPORTED_EMAIL_KINDS.has('review_received')).toBe(false);
  expect(SUPPORTED_EMAIL_KINDS.has('exchange_status')).toBe(false);
  expect(SUPPORTED_EMAIL_KINDS.has('marketing')).toBe(false);
});

test('recipient is resolved from the queued Auth user and request input cannot select an address',async()=>{
  let resolvedUser='',sentTo='';
  await dispatchNotificationEmail(delivery,{
    loadNotification:async()=>notification,
    resolveRecipientEmail:async(userId)=>{resolvedUser=userId;return 'auth-owner@example.com'},
    send:async(message)=>{sentTo=message.to[0].email;return {ok:true,status:201,messageId:'brevo-1'}},
    sent:async()=>{},retry:async()=>{},permanentFailure:async()=>{}
  });
  expect(resolvedUser).toBe(notification.user_id);
  expect(sentTo).toBe('auth-owner@example.com');
  expect(JSON.stringify(delivery)).not.toContain('@');
});

test('transient Brevo failure is queued for bounded retry without removing the in-app source',async()=>{
  let retry:{error:string;delay:number}|null=null;let sourceLoads=0;
  const result=await dispatchNotificationEmail(delivery,{
    loadNotification:async()=>{sourceLoads++;return notification},
    resolveRecipientEmail:async()=> 'member@example.com',
    send:async()=>({ok:false,status:503,error:'provider unavailable'}),
    sent:async()=>{},
    retry:async(_row,_email,error,delay)=>{retry={error,delay}},
    permanentFailure:async()=>{throw new Error('must not permanently fail on first transient error')}
  });
  expect(result).toEqual({sent:false,permanent:false});
  expect(retry).toEqual({error:'provider unavailable',delay:60});
  expect(sourceLoads).toBe(1);
  expect(notification.id).toBe(delivery.notification_id);
});

test('third attempt and permanent provider errors stop retrying',async()=>{
  let permanent=0,retries=0;
  const deps={loadNotification:async()=>notification,resolveRecipientEmail:async()=> 'member@example.com',send:async()=>({ok:false,status:503,error:'still down'}),sent:async()=>{},retry:async()=>{retries++},permanentFailure:async()=>{permanent++}};
  await dispatchNotificationEmail({...delivery,attempt_count:3},deps);
  await dispatchNotificationEmail(delivery,{...deps,send:async()=>({ok:false,status:400,error:'bad request'})});
  expect(permanent).toBe(2);expect(retries).toBe(0);
  expect(isTransientEmailFailure(429)).toBe(true);expect(isTransientEmailFailure(400)).toBe(false);
  expect([retryDelaySeconds(1),retryDelaySeconds(2),retryDelaySeconds(3)]).toEqual([60,300,1800]);
});

test('mismatched or unsupported source rows cannot be emailed',async()=>{
  let sends=0,permanent=0;
  const base={resolveRecipientEmail:async()=> 'member@example.com',send:async()=>{sends++;return {ok:true,status:201}},sent:async()=>{},retry:async()=>{},permanentFailure:async()=>{permanent++}};
  await dispatchNotificationEmail(delivery,{...base,loadNotification:async()=>({...notification,user_id:'another-user'})});
  await dispatchNotificationEmail({...delivery,notification_kind:'review_received'},{...base,loadNotification:async()=>({...notification,kind:'review_received'})});
  expect(sends).toBe(0);expect(permanent).toBe(2);
});

