import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {dispatchPush,type PushPayload,type PushSubscription} from './core.ts';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function equalSecret(left:string,right:string){
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(left)),crypto.subtle.digest('SHA-256',encoder.encode(right))]);
  const av=new Uint8Array(a),bv=new Uint8Array(b);let result=av.length^bv.length;
  for(let index=0;index<Math.min(av.length,bv.length);index++)result|=av[index]^bv[index];
  return result===0;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const expected=Deno.env.get('PUSH_DISPATCH_SECRET')||'',supplied=req.headers.get('x-brickcircle-push-secret')||'';
  if(!expected||!supplied||!await equalSecret(expected,supplied))return json({error:'Unauthorized'},401);

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic=Deno.env.get('VAPID_PUBLIC_KEY'),vapidPrivate=Deno.env.get('VAPID_PRIVATE_KEY'),vapidSubject=Deno.env.get('VAPID_SUBJECT');
  if(!supabaseUrl||!serviceRoleKey||!vapidPublic||!vapidPrivate||!vapidSubject)return json({error:'Push worker is not configured'},503);

  const input=await req.json().catch(()=>({}));
  const notificationId=String(input?.record?.id||input?.notification_id||'');
  if(!uuid.test(notificationId))return json({error:'Invalid notification id'},400);

  const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:notification,error:notificationError}=await db.from('notifications').select('id,user_id,kind,title,body,entity_type,entity_id,metadata').eq('id',notificationId).maybeSingle();
  if(notificationError)return json({error:'Could not load notification'},500);
  if(!notification)return json({error:'Notification not found'},404);

  const {data:subscriptions,error:subscriptionError}=await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',notification.user_id).is('disabled_at',null).limit(20);
  if(subscriptionError)return json({error:'Could not load subscriptions'},500);

  webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);
  const result=await dispatchPush(notification,subscriptions||[],{
    claim:async(notificationId,subscriptionId)=>{
      const {data,error}=await db.from('push_delivery_log').insert({notification_id:notificationId,subscription_id:subscriptionId,status:'processing'}).select('id').maybeSingle();
      if(error?.code==='23505')return false;
      if(error)throw error;
      return Boolean(data);
    },
    send:async(subscription:PushSubscription,payload:PushPayload)=>{
      const response=await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{TTL:3600,urgency:'high'});
      return Number(response.statusCode||201);
    },
    success:async(subscriptionId,notificationId,status)=>{
      const now=new Date().toISOString();
      await Promise.all([
        db.from('push_delivery_log').update({status:'sent',http_status:status,last_error:null,updated_at:now}).eq('notification_id',notificationId).eq('subscription_id',subscriptionId),
        db.from('push_subscriptions').update({last_success_at:now,updated_at:now}).eq('id',subscriptionId)
      ]);
    },
    gone:async(subscriptionId,notificationId,status)=>{
      const now=new Date().toISOString();
      await Promise.all([
        db.from('push_delivery_log').update({status:'disabled',http_status:status,last_error:'Push endpoint expired',updated_at:now}).eq('notification_id',notificationId).eq('subscription_id',subscriptionId),
        db.from('push_subscriptions').update({disabled_at:now,updated_at:now}).eq('id',subscriptionId)
      ]);
    },
    failure:async(subscriptionId,notificationId,status,message)=>{
      await db.from('push_delivery_log').update({status:'failed',http_status:status,last_error:message,updated_at:new Date().toISOString()}).eq('notification_id',notificationId).eq('subscription_id',subscriptionId);
    }
  });
  return json({ok:true,...result});
});
