#!/usr/bin/env node
// Converts machine reports into a deterministic, redacted engineering triage summary.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const read=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}};
const pw=await read('ux-report/results.json');
const lh=await read('ux-lighthouse/home.json');
const synthetic=await read('ux-report/synthetic/checkpoints.json');
const issues=[];
if(process.env.BC_UX_REQUIRE_BROWSER_REPORT==='1'&&!pw){
 issues.push({priority:'P1',category:'missing-evidence',title:'Browser suite did not produce a JSON report',browser:'all configured projects',evidence:'UX browser job log',reproduction:'npm run test:ux',details:'A missing report is not a passing gate.',recommendation:'Check dependency install, browser binaries and isolated server startup; rerun the suite.'});
}
const syntheticFailure=await read('ux-report/synthetic/failure.json');
if(syntheticFailure?.failed===true&&syntheticFailure.phase==='three-collector-synthetic'){
  issues.push({priority:'P1',category:'synthetic-ux',title:'Three-collector offline UX replay failed',browser:'Chromium mobile',evidence:'ux-quality-evidence GitHub Actions artifact',reproduction:'BC_HOSTED_CANDIDATE_PATH=. BC_UX_SYNTHETIC_ONLY=1 node scripts/hosted-pr125-browser.mjs --offline',details:'Use redacted fixed-stage diagnostic from the CI log; avoid publishing browser traces or secret material.',recommendation:'Reproduce on disposable offline fixtures, correct the failing screen, and rerun full simulation.'});
}
const redact=s=>String(s||'').replace(/(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+)/g,'[credential]')
.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
.replace(/https?:\/\/[^\s)]+/gi,'[url]');
function visit(suite,parents=[]){
 const title=[...parents,suite.title||''].filter(Boolean);
 for(const spec of suite.specs||[])for(const test of spec.tests||[]){
   if(['failed','timedOut','interrupted'].includes(test.status)||test.results?.some(r=>['failed','timedOut','interrupted'].includes(r.status))){
     const err=test.results?.flatMap(r=>r.errors||[]).map(e=>redact(e.message||e.value||'')).join(' | ').slice(0,500);
      const recovered=test.status==='flaky';
      const category=/visual baseline/i.test(spec.title)?'visual':/accessibility/i.test(spec.title)?'accessibility':'functional';
      issues.push({priority:recovered?'P2':'P1',category,title:redact([...title,spec.title].join(' > ')),browser:test.projectName||'unknown',evidence:'ux-report/artifacts and ux-report/html',reproduction:'npx playwright test --config playwright.ux.config.ts '+String(spec.file||'tests/ux/ux-public.spec.ts')+':'+String(spec.line||1)+' --project='+String(test.projectName||'desktop-chromium')+' --retries=0',details:err,recommendation:recovered?'Retry recovered a failure; reproduce without retries and fix the instability.':category==='visual'?'Inspect expected/actual/diff images; update the baseline only after intentional UX review.':'Investigate failed journey, fix root cause, and add a regression assertion.'});
   }
 }
 for(const child of suite.suites||[])visit(child,title);
}
for(const suite of pw?.suites||[])visit(suite);
if(lh?.audits){
 const categories=[['performance',0.7],['accessibility',0.9],['best-practices',0.85]];
 for(const [key,min] of categories){
   const score=lh.categories?.[key]?.score;
   if(typeof score==='number'&&score<min)issues.push({priority:'P2',category:'lighthouse',title:key+' below advisory threshold',browser:'headless Chrome',evidence:'ux-lighthouse/home.json',reproduction:'Run Lighthouse against an isolated localhost server',details:'Score '+Math.round(score*100)+' versus advisory '+Math.round(min*100),recommendation:'Inspect the largest relevant Lighthouse opportunities. Advisory only, not a merge gate.'});
 }
}
const counts=issues.reduce((a,x)=>(a[x.priority]=(a[x.priority]||0)+1,a),{});
const esc=s=>String(s||'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const md=['# BrickCircle automated UX triage','','This report reflects available automated evidence, **not** a human usability study. No claims are made for untested authenticated journeys.','', '## Evidence status', '',
 '- Playwright JSON: '+(pw?'available':'missing'),
 '- Lighthouse JSON: '+(lh?'available':'missing'),
 '- Three-user synthetic metrics: '+(synthetic?.kind==='synthetic-only'?synthetic.count+' checkpoints':'missing'),
 '- Failed/advisory findings: '+issues.length,
 '- Priority counts: '+JSON.stringify(counts), '',
 '## Prioritized findings','',
 '| Priority | Browser | Problem | Recommendation |','|---|---|---|---|',
  ...issues.map(x=>'| '+[x.priority,x.browser,esc(x.title),esc(x.recommendation+' Reproduce: `'+x.reproduction+'`')].join(' | ')+' |'),
 '', '## Follow-up','','Retain traces privately in CI; do not paste token-bearing browser artifacts into public issues. Verify any finding, then create a human-reviewed PR.'];
await mkdir('ux-report',{recursive:true});
await writeFile('ux-report/triage.json',JSON.stringify({version:1,generatedAt:new Date().toISOString(),available:{playwright:!!pw,lighthouse:!!lh,synthetic:synthetic?.kind==='synthetic-only'},issues},null,2));
await writeFile('ux-report/triage.md',md.join('\n')+'\n');
console.log('UX triage:',issues.length,'findings');
