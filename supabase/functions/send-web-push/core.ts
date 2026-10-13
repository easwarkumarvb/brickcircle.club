export type PushNotification={id:string;user_id:string;kind:string;title:string|null;body:string|null;entity_type:string|null;entity_id:string|null;metadata:Record<string,unknown>|null};
export type PushSubscription={id:string;endpoint:string;p256dh:string;auth:string};
export type PushPayload={type:'reciprocal_match'|'exchange_proposal';title:string;body:string;url:string;entity_id:string};

export function payloadFor(notification:PushNotification):PushPayload|null{
  if(notification.kind==='request_received'&&notification.entity_type==='exchange_request')return {
    type:'exchange_proposal',
    title:'New exchange proposal',
    body:String(notification.body||'A collector proposed an exchange with you.').slice(0,240),
    url:`/v2.html#exchanges/${notification.entity_id}`,
    entity_id:String(notification.entity_id||'')
  };
  if(notification.kind==='reciprocal_match'&&notification.entity_type==='reciprocal_match')return {
    type:'reciprocal_match',
    title:'You have a new local BrickCircle match',
    body:String(notification.body||'A collector nearby wants one of your sets and has one you want.').slice(0,240),
    url:'/v2.html#matches',
    entity_id:String(notification.entity_id||'')
  };
  return null;
}

type DispatchDeps={
  claim:(notificationId:string,subscriptionId:string)=>Promise<boolean>;
  send:(subscription:PushSubscription,payload:PushPayload)=>Promise<number>;
  success:(subscriptionId:string,notificationId:string,status:number)=>Promise<void>;
  gone:(subscriptionId:string,notificationId:string,status:number)=>Promise<void>;
  failure:(subscriptionId:string,notificationId:string,status:number|null,message:string)=>Promise<void>;
};

export async function dispatchPush(notification:PushNotification,subscriptions:PushSubscription[],deps:DispatchDeps){
  const payload=payloadFor(notification);if(!payload)return {eligible:false,sent:0,failed:0,disabled:0,skipped:0};
  let sent=0,failed=0,disabled=0,skipped=0;
  for(const subscription of subscriptions.slice(0,20)){
    if(!await deps.claim(notification.id,subscription.id)){skipped++;continue}
    try{
      const status=await deps.send(subscription,payload);
      if(status===404||status===410){await deps.gone(subscription.id,notification.id,status);disabled++;continue}
      if(status<200||status>=300)throw Object.assign(new Error(`Web Push HTTP ${status}`),{statusCode:status});
      await deps.success(subscription.id,notification.id,status);sent++;
    }catch(error){
      const status=Number((error as {statusCode?:number})?.statusCode||0)||null;
      if(status===404||status===410){await deps.gone(subscription.id,notification.id,status);disabled++;continue}
      await deps.failure(subscription.id,notification.id,status,String(error instanceof Error?error.message:error).slice(0,1000));failed++;
    }
  }
  return {eligible:true,sent,failed,disabled,skipped};
}
