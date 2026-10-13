import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {dispatchNotificationEmail,type BrevoMessage,type EmailDelivery,type EmailNotification} from './core.ts';

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
  const expected=Deno.env.get('EMAIL_DELIVERY_WEBHOOK_SECRET')||'';
  const supplied=req.headers.get('x-brickcircle-email-secret')||'';
  if(!expected||!supplied||!await equalSecret(expected,supplied))return json({error:'Unauthorized'},401);

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const brevoKey=Deno.env.get('BREVO_API_KEY');
  if(!supabaseUrl||!serviceRoleKey||!brevoKey)return json({error:'Email worker is not configured'},503);

  const input=await req.json().catch(()=>({}));
  const requestedId=String(input?.record?.id||input?.delivery_id||'');
  if(requestedId&&!uuid.test(requestedId))return json({error:'Invalid delivery id'},400);

  const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:deliveries,error:claimError}=await db.rpc('claim_notification_email_deliveries',{p_limit:requestedId?1:20,p_delivery_id:requestedId||null});
  if(claimError)return json({error:'Could not claim email deliveries'},500);

  const updateDelivery=async(id:string,values:Record<string,unknown>)=>{
    const {error}=await db.from('notification_email_deliveries').update(values).eq('id',id);
    if(error)throw error;
  };

  let sent=0,retrying=0,permanentFailures=0;
  for(const delivery of (deliveries||[]) as EmailDelivery[]){
    const outcome=await dispatchNotificationEmail(delivery,{
      loadNotification:async(id)=>{
        const {data,error}=await db.from('notifications').select('id,user_id,kind,title,body,entity_type,entity_id').eq('id',id).maybeSingle();
        if(error)throw error;
        return data as EmailNotification|null;
      },
      resolveRecipientEmail:async(userId)=>{
        const {data,error}=await db.auth.admin.getUserById(userId);
        if(error)throw error;
        return data.user?.email||null;
      },
      send:async(message:BrevoMessage)=>{
        try{
          const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':brevoKey},body:JSON.stringify(message)});
          const provider=await response.json().catch(()=>({}));
          return {ok:response.ok,status:response.status,messageId:String(provider?.messageId||'')||undefined,error:String(provider?.message||provider?.code||'')||undefined};
        }catch(error){return {ok:false,status:null,error:String(error instanceof Error?error.message:error)}}
      },
      sent:async(row,email,messageId)=>updateDelivery(row.id,{status:'sent',recipient_email:email,provider_message_id:messageId,last_error:null,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}),
      retry:async(row,email,error,delaySeconds)=>updateDelivery(row.id,{status:'retry',recipient_email:email,last_error:error,next_attempt_at:new Date(Date.now()+delaySeconds*1000).toISOString(),updated_at:new Date().toISOString()}),
      permanentFailure:async(row,email,error)=>updateDelivery(row.id,{status:'permanent_failure',recipient_email:email,last_error:error,updated_at:new Date().toISOString()})
    });
    if(outcome.sent)sent++;else if(outcome.permanent)permanentFailures++;else retrying++;
  }

  return json({ok:true,claimed:(deliveries||[]).length,sent,retrying,permanent_failures:permanentFailures});
});
