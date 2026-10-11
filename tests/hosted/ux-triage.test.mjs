import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const script=resolve('scripts/ux-triage.mjs');
async function report(input,required='0'){
  const cwd=await mkdtemp('/tmp/opencode/ux-triage-');
  try {
    await mkdir(cwd+'/ux-report');
    if(input)await writeFile(cwd+'/ux-report/results.json',JSON.stringify(input));
    execFileSync(process.execPath,[script],{cwd,env:{...process.env,BC_UX_REQUIRE_BROWSER_REPORT:required}});
    return JSON.parse(await readFile(cwd+'/ux-report/triage.json','utf8'));
  } finally { await rm(cwd,{recursive:true,force:true}); }
}
test('missing required browser evidence is a blocker, not a silent pass',async()=>{
  const result=await report(null,'1');
  assert.equal(result.issues[0].category,'missing-evidence');
  assert.equal(result.issues[0].priority,'P1');
});
test('visual failures and retry recovery have exact actionable redacted reproductions',async()=>{
  const result=await report({suites:[{title:'UX',specs:[{title:'landing visual baseline',file:'tests/ux/ux-public.spec.ts',line:93,tests:[
    {projectName:'android-chromium',status:'unexpected',results:[{status:'failed',errors:[{message:'Contact collector@example.test at https://example.test/private'}]}]},
    {projectName:'iphone-webkit',status:'flaky',results:[{status:'failed',errors:[]},{status:'passed'}]}
  ]}]}]});
  assert.deepEqual(result.issues.map(issue=>issue.priority),['P1','P2']);
  assert.equal(result.issues[0].category,'visual');
  assert.match(result.issues[0].reproduction,/ux-public.spec.ts:93.*--retries=0/);
  assert.ok(!JSON.stringify(result).includes('collector@example.test'));
  assert.ok(!JSON.stringify(result).includes('https://example.test/private'));
});
