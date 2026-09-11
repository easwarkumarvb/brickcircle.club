export const MAX_EMAIL_ATTEMPTS=3;

export const SUPPORTED_EMAIL_KINDS=new Set([
  'reciprocal_match','request_received','exchange_accepted','exchange_declined',
  'exchange_cancelled','meetup_proposed','swap_started','return_meetup_proposed',
  'return_overdue','return_dispute','return_completed'
]);

export type EmailDelivery={id:string;notification_id:string;recipient_user_id:string;notification_kind:string;attempt_count:number};
export type EmailNotification={id:string;user_id:string;kind:string;title:string|null;body:string|null;entity_type:string|null;entity_id:string|null};
export type BrevoMessage={sender:{name:string;email:string};replyTo:{name:string;email:string};to:{email:string}[];subject:string;htmlContent:string;textContent:string;headers:Record<string,string>};
export type SendResult={ok:boolean;status:number|null;messageId?:string;error?:string};

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character] as string));

export function notificationUrl(notification:EmailNotification,origin='https://brickcircle.club'){
  if(notification.kind==='reciprocal_match')return `${origin}/v2.html#matches`;
  if(notification.entity_type==='exchange_request'&&notification.entity_id)return `${origin}/v2.html#exchanges/${notification.entity_id}`;
  return `${origin}/v2.html#exchanges`;
}

export function buildBrevoMessage(notification:EmailNotification,email:string,origin?:string):BrevoMessage{
  const title=String(notification.title||'BrickCircle update').slice(0,180);
  const body=String(notification.body||'You have an important BrickCircle update.').slice(0,1000);
  const url=notificationUrl(notification,origin);
  return {
    sender:{name:'BrickCircle',email:'notifications@brickcircle.club'},
    replyTo:{name:'BrickCircle Support',email:'support@brickcircle.club'},
    to:[{email}],
    subject:title,
    textContent:`${title}\n\n${body}\n\nOpen BrickCircle: ${url}\n\nBrickCircle.club · Local, in-person LEGO exchanges`,
    htmlContent:`<!doctype html><html><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e8e1d6;border-radius:16px;padding:28px"><p style="margin:0 0 12px;color:#b45309;font-weight:700">BrickCircle</p><h1 style="font-size:24px;margin:0 0 16px">${escapeHtml(title)}</h1><p style="line-height:1.6;margin:0 0 24px">${escapeHtml(body)}</p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:9px;font-weight:700">Open BrickCircle</a><p style="font-size:12px;color:#667085;margin:24px 0 0">Local, in-person LEGO exchanges. Inspect before handoff.</p></div></div></body></html>`,
    headers:{'Idempotency-Key':`brickcircle-notification-${notification.id}`}
  };
}

export function isTransientEmailFailure(status:number|null){return status===null||status===408||status===429||Boolean(status&&status>=500)}
export function retryDelaySeconds(attempt:number){return attempt<=1?60:attempt===2?300:1800}

type DispatchDeps={
  loadNotification:(id:string)=>Promise<EmailNotification|null>;
  resolveRecipientEmail:(userId:string)=>Promise<string|null>;
  send:(message:BrevoMessage)=>Promise<SendResult>;
  sent:(delivery:EmailDelivery,email:string,messageId:string|null)=>Promise<void>;
  retry:(delivery:EmailDelivery,email:string|null,error:string,delaySeconds:number)=>Promise<void>;
  permanentFailure:(delivery:EmailDelivery,email:string|null,error:string)=>Promise<void>;
};

export async function dispatchNotificationEmail(delivery:EmailDelivery,deps:DispatchDeps){
  let email:string|null=null;
  try{
    const notification=await deps.loadNotification(delivery.notification_id);
    if(!notification||notification.id!==delivery.notification_id||notification.user_id!==delivery.recipient_user_id||notification.kind!==delivery.notification_kind){
      await deps.permanentFailure(delivery,null,'Source notification does not match the queued recipient and kind');
      return {sent:false,permanent:true};
    }
    if(!SUPPORTED_EMAIL_KINDS.has(notification.kind)){
      await deps.permanentFailure(delivery,null,'Notification kind is not email-enabled');
      return {sent:false,permanent:true};
    }
    email=await deps.resolveRecipientEmail(notification.user_id);
    if(!email){
      await deps.permanentFailure(delivery,null,'Recipient has no deliverable Auth email');
      return {sent:false,permanent:true};
    }
    const result=await deps.send(buildBrevoMessage(notification,email));
    if(result.ok){
      await deps.sent(delivery,email,result.messageId||null);
      return {sent:true,permanent:false};
    }
    const error=String(result.error||`Brevo HTTP ${result.status??'network error'}`).slice(0,1000);
    if(isTransientEmailFailure(result.status)&&delivery.attempt_count<MAX_EMAIL_ATTEMPTS){
      await deps.retry(delivery,email,error,retryDelaySeconds(delivery.attempt_count));
      return {sent:false,permanent:false};
    }
    await deps.permanentFailure(delivery,email,error);
    return {sent:false,permanent:true};
  }catch(error){
    const message=String(error instanceof Error?error.message:error).slice(0,1000);
    if(delivery.attempt_count<MAX_EMAIL_ATTEMPTS){
      await deps.retry(delivery,email,message,retryDelaySeconds(delivery.attempt_count));
      return {sent:false,permanent:false};
    }
    await deps.permanentFailure(delivery,email,message);
    return {sent:false,permanent:true};
  }
}

