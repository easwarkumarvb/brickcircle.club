import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { validateTarget, PR125_SHA } from './validate-hosted-pr125.mjs';
import { validateStagingEmails, serializeRedactedReport } from './hosted-exchange-smoke.mjs';

export function assertOutboxOnly(rows) {
  assert.ok(rows.length>0, 'Expected retained outbox evidence');
  assert.ok(rows.every(row=>row.status==='pending' && row.attempt_count===0), 'Outbox-only gate failed');
}
async function main() {
  const report={ok:false,testedPullRequestNumber:125,testedHeadSha:PR125_SHA,target:'approved-staging'};
  const clients=[];
  try {
    validateTarget(process.env);
    assert.ok(process.env.BC_STAGING_SUPABASE_SECRET_KEY);
    assert.notEqual(process.env.BC_STAGING_SUPABASE_SECRET_KEY,process.env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY);
    const options={auth:{persistSession:false,autoRefreshToken:false}};
    const users=validateStagingEmails(['A','B','C'].map(label=>({label,email:process.env[`BC_STAGING_USER_${label}_EMAIL`],password:process.env[`BC_STAGING_USER_${label}_PASSWORD`]})),'example.test');
    const ids=[];
    for(const user of users){
      const client=createClient(process.env.BC_STAGING_SUPABASE_URL,process.env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY,options);clients.push(client);
      const result=await client.auth.signInWithPassword(user);assert.ifError(result.error);ids.push(result.data.user.id);
    }
    // Server credential reads only protected delivery state; never calls a worker or provider.
    const admin=createClient(process.env.BC_STAGING_SUPABASE_URL,process.env.BC_STAGING_SUPABASE_SECRET_KEY,options);
    const result=await admin.from('notification_email_deliveries').select('status,attempt_count').in('recipient_user_id',ids);
    assert.ifError(result.error);assertOutboxOnly(result.data);
    report.ok=true;report.outboxCount=result.data.length;report.providerAttempts=0;
  }catch{process.exitCode=1;report.failedStage='outbox-only verification';}
  finally{
    await Promise.allSettled(clients.map(client=>client.auth.signOut({scope:'local'})));
    await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-pr125-outbox.json',serializeRedactedReport(report));
    console.log(report.ok?'Fixture outboxes remain pending with zero provider attempts.':'Outbox-only verification failed; values withheld.');
  }
}
if(process.argv[1]?.endsWith('/audit-hosted-pr125-outbox.mjs'))main().catch(()=>{console.error('Outbox audit failed; values withheld.');process.exitCode=1;});
