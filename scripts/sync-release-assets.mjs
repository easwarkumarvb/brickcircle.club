import fs from 'node:fs';

const check=process.argv.includes('--check');
const manifest=JSON.parse(fs.readFileSync('release-assets.json','utf8'));
const versioned=manifest.shell.filter(asset=>/\.(?:css|js)$/.test(asset));
const expected=new Map(versioned.map(asset=>[asset,`${asset}?v=${manifest.release}`]));

function updateHtml(source){
  for(const [asset,versionedAsset] of expected){
    const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern=new RegExp(`${escaped}(?:\\?v=[^"']+)?`,'g');
    source=source.replace(pattern,versionedAsset);
  }
  return source;
}

function updateServiceWorker(source){
  const shell=manifest.shell.map(asset=>expected.get(asset)||asset);
  source=source.replace(
    /const RELEASE='[^']+';/,
    `const RELEASE='${manifest.release}';`
  );
  source=source.replace(
    /const SHELL=\[[\s\S]*?\];/,
    `const SHELL=${JSON.stringify(shell)};`
  );
  return source;
}

const files=[
  ['v2.html',updateHtml],
  ['catalogue-cache-sw.js',updateServiceWorker]
];
let stale=false;
for(const [file,transform] of files){
  const before=fs.readFileSync(file,'utf8');
  const after=transform(before);
  if(before===after)continue;
  stale=true;
  if(!check)fs.writeFileSync(file,after);
  console.error(`${file} is not synchronized with release-assets.json`);
}
if(check&&stale)process.exitCode=1;
