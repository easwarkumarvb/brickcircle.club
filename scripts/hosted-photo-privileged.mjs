import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {bootstrapHostedSmokeUsers} from './bootstrap-hosted-smoke-users.mjs';
import {assertOutboxOnly} from './audit-hosted-pr138-outbox.mjs';
import {validateStagingEmails,serializeRedactedReport} from './hosted-exchange-smoke.mjs';
import {validateTarget,guardedFetch,CANDIDATE_SHA} from './validate-hosted-photo.mjs';
const mode=process.argv[2];
const report={ok:false,testedHeadSha:CANDIDATE_SHA,target:'approved-staging'};
try{
  assert.ok(mode==='bootstrap'||mode==='audit');validateTarget(process.env);
  assert.ok(process.env.BC_STAGING_SUPABASE_SECRET_KEY);
  assert.notEqual(process.env.BC_STAGING_SUPABASE_SECRET_KEY,process.env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY);
  // The existing trusted helper creates only fresh example.test fixtures.
  // Install the exact-origin guard before any SDK client is constructed.
  globalThis.fetch=guardedFetch(globalThis.fetch);
  if(mode==='bootstrap')await bootstrapHostedSmokeUsers(process.env);
  else{
    const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:globalThis.fetch}};
    const users=validateStagingEmails(['A','B','C'].map(label=>({label,email:process.env[`BC_STAGING_USER_${label}_EMAIL`],password:process.env[`BC_STAGING_USER_${label}_PASSWORD`]})),'example.test');
    const ids=[];
    for(const user of users){
      const client=createClient(process.env.BC_STAGING_SUPABASE_URL,process.env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY,options);
      const result=await client.auth.signInWithPassword(user);assert.ifError(result.error);ids.push(result.data.user.id);
    }
    const admin=createClient(process.env.BC_STAGING_SUPABASE_URL,process.env.BC_STAGING_SUPABASE_SECRET_KEY,options);
    const result=await admin.from('notification_email_deliveries').select('status,attempt_count').in('recipient_user_id',ids);
    assert.ifError(result.error);assertOutboxOnly(result.data);
    report.ok=true;report.outboxCount=result.data.length;report.providerAttempts=0;
  }
  console.log(mode==='bootstrap'?'Fresh staging fixtures provisioned.':'Fixture outboxes pending; zero provider attempts.');
}catch{process.exitCode=1;console.error('Protected photo fixture step failed; values withheld.');}
finally{if(mode==='audit'){await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-photo-outbox.json',serializeRedactedReport(report));}}
