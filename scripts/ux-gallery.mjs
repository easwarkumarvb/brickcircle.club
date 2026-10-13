import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function syntheticImages(report,root){
 const rows=[];
 function visit(suite){
  for(const spec of suite.specs||[])for(const test of spec.tests||[])for(const result of test.results||[])for(const image of result.attachments||[]){
   if(!/^synthetic-[a-z-]+$/.test(image.name||'')||image.contentType!=='image/png')continue;
   if(image.body){
    if(typeof image.body!=='string'||image.body.length>14000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.body))throw Error('Invalid synthetic PNG body');
    const body=Buffer.from(image.body,'base64');
    if(!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid synthetic PNG signature');
    rows.push({title:spec.title,browser:test.projectName,status:result.status,body});continue;
   }
   if(!image.path)continue;
   const source=resolve(image.path),inside=relative(resolve(root,'artifacts'),source);
   if(inside.startsWith('..')||inside===''||inside.startsWith('/'))throw Error('Synthetic image must be inside isolated report artifacts');
   rows.push({title:spec.title,browser:test.projectName,status:result.status,source});
  }
  for(const child of suite.suites||[])visit(child);
 }
 for(const suite of report.suites||[])visit(suite);return rows;
}
export async function gallery(root='ux-report'){
 const report=JSON.parse(await readFile(join(root,'results.json'),'utf8')),images=syntheticImages(report,root);
 await mkdir(join(root,'synthetic'),{recursive:true});
 const cards=[];
 for(const [i,row] of images.entries()){
  const name=`checkpoint-${i+1}.png`;if(row.body)await writeFile(join(root,'synthetic',name),row.body);else await copyFile(row.source,join(root,'synthetic',name));
  cards.push(`<figure><img src="synthetic/${name}" alt="${escape(row.title)}"><figcaption>${escape(row.browser)} · ${escape(row.title)} · ${escape(row.status)}</figcaption></figure>`);
 }
 await writeFile(join(root,'gallery.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic UX evidence</title><style>body{font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}figure{margin:0;border:1px solid #ddd;padding:12px}img{max-width:100%;height:auto}figcaption{padding-top:12px}</style><h1>Synthetic UX evidence</h1><p>Fake isolated accounts only. Screenshots are review evidence, not approved pixel baselines or physical-device certification.</p><main>${cards.join('')}</main></html>`);
 await writeFile(join(root,'synthetic','checkpoints.json'),JSON.stringify({kind:'synthetic-only',count:images.length},null,2));
 console.log(`Synthetic gallery: ${images.length} checkpoints`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await gallery();
