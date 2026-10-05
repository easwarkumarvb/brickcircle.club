import {test,expect} from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

const rows=JSON.parse(fs.readFileSync(path.resolve('tests/isolated/fixtures/curated-catalogue.json'),'utf8'));
const mock=fs.readFileSync(path.resolve('tests/isolated/fixtures/supabase-browser-mock.js'),'utf8');
function install(){
  const w=window as any,s=w.__bcIsolated,create=w.supabase.createClient;
  s.catalogueQueries=[];
  w.supabase.createClient=(...args:any[])=>{
    const db=create(...args),from=db.from,rpc=db.rpc;
    db.from=(table:string)=>{
      if(table!=='lego_sets')return from(table);
      const filters:any[]=[];let ids:string[]=[];
      const q:any={
        select(){return q},
        eq(k:string,v:any){filters.push((r:any)=>r[k]===v);return q},
        in(k:string,v:string[]){ids=[...v];filters.push((r:any)=>v.includes(r[k]));return q},
        abortSignal(){return q},
        then(resolve:any,reject:any){
          s.catalogueQueries.push({ids});
          const result=s.failTables.includes(table)?{data:null,error:{message:'Test outage'}}:{data:s.sets.filter((r:any)=>filters.every(f=>f(r))),error:null};
          if(s.holdSet&&ids.includes(s.holdSet)){s.holdSet=null;return new Promise(done=>{s.releaseCatalogue=()=>done(result)}).then(resolve,reject)}
          return Promise.resolve(result).then(resolve,reject);
        }
      };return q;
    };
    db.rpc=async(name:string,args:any)=>{
      const result=await rpc(name,args);
      if(name==='bc_search_lego_sets'&&s.holdSearch){s.holdSearch=false;return new Promise(done=>{s.releaseSearch=()=>done(result)})}
      return result;
    };return db;
  };
}
test.beforeEach(async({page})=>{
  const data=[...rows].reverse().concat([{set_number:'88013-1',name:'Technic Large Motor',theme:'Technic',catalog_active:true},{set_number:'90001-1',name:'Star Wars accessory',theme:'Star Wars',catalog_active:true}]);
  const body=mock+'\nwindow.__bcIsolated.sets.splice(0,window.__bcIsolated.sets.length,...'+JSON.stringify(data)+');\n('+install.toString()+')();';
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body});
    return route.fallback();
  });
  await page.goto('/v2.html?isolated=ready-one#browse');
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(100);
  const dismiss=page.getByRole('button',{name:'Not now',exact:true});
  if(await dismiss.count())await dismiss.click();
});
const cases=[
  ['Technic','42143-1','42115-1',25],['Supercars','42143-1','42115-1',15],
  ['F1','42141-1','42171-1',5],['Space','10283-1','10341-1',7],
  ['Engineering','42146-1','42100-1',15],['Landmarks','10307-1','10276-1',14],
  ['City','60380-1','60337-1',5],['Friends','42639-1','41748-1',5],
  ['Icons','10305-1','10316-1',27],['Star Wars','75192-1','75313-1',7],
  ['Disney','43222-1','71044-1',8]
] as const;
for(const [label,first,second,count] of cases)test(label+' shows ordered curated builds',async({page})=>{
  const chip=page.getByRole('button',{name:label,exact:true});await chip.click();
  await expect(page.locator('#bc-cat-status')).toContainText(label);
  const cards=page.locator('#bc-set-grid .bc-set-card');
  await expect(cards).toHaveCount(count);
  await expect(cards.nth(0)).toHaveAttribute('data-set',first);
  await expect(cards.nth(1)).toHaveAttribute('data-set',second);
  await expect(chip).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#bc-q')).toHaveValue('');
  await expect(page.locator('#bc-set-grid')).not.toContainText(/accessory|Large Motor/);
  expect(await page.evaluate(()=>window.__bcIsolated.rpcCalls.filter((c:any)=>c.name==='bc_search_lego_sets'))).toHaveLength(0);
});
test('default has 100 unique sets with every category featured early',async({page})=>{
  const ids=await page.locator('#bc-set-grid .bc-set-card').evaluateAll(els=>els.map(e=>e.getAttribute('data-set')));
  expect(new Set(ids).size).toBe(100);
  for(const [,id] of cases)expect(ids.slice(0,11)).toContain(id);
  const query=await page.evaluate(()=>window.__bcIsolated.catalogueQueries.at(-1));
  expect(new Set(query.ids).size).toBe(100);
});
test('search finds outside the curated lists and category selection clears it',async({page})=>{
  const q=page.locator('#bc-q');await q.fill('88013');
  await expect(page.locator('#bc-set-grid')).toContainText('Technic Large Motor');
  await expect(page.locator('.bc-pop-chip[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Disney',exact:true}).click();
  await expect(q).toHaveValue('');
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(8);
  await q.fill('88013');await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(1);
  await q.fill('');await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(100);
  await expect(page.getByRole('button',{name:'All favourites',exact:true})).toHaveAttribute('aria-pressed','true');
});
for(const type of ['Search','Catalogue'])test('late '+type+' response cannot overwrite a new category',async({page})=>{
  if(type==='Search'){
    await page.evaluate(()=>{window.__bcIsolated.holdSearch=true});
    await page.locator('#bc-q').fill('88013');
  }else{
    await page.evaluate(()=>{window.__bcIsolated.holdSet='10283-1'});
    await page.getByRole('button',{name:'Space',exact:true}).click();
  }
  await page.waitForFunction(type=>typeof window.__bcIsolated['release'+type]==='function',type);
  await page.getByRole('button',{name:'Disney',exact:true}).click();
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(8);
  await page.evaluate(async type=>{window.__bcIsolated['release'+type]();await new Promise(r=>setTimeout(r,0))},type);
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(8);
  await expect(page.locator('#bc-cat-status')).toContainText('Disney');
});
test('retry preserves category and reports actual count excluding inactive sets',async({page})=>{
  await page.evaluate(()=>{const s=window.__bcIsolated;s.sets.find((r:any)=>r.set_number==='43222-1').catalog_active=false;s.failTables.push('lego_sets')});
  await page.getByRole('button',{name:'Disney',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await page.evaluate(()=>{window.__bcIsolated.failTables=[]});
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('#bc-set-grid .bc-set-card')).toHaveCount(7);
  await expect(page.locator('#bc-set-grid [data-set="43222-1"]')).toHaveCount(0);
  await expect(page.locator('#bc-cat-page-size')).toHaveText('7 curated sets · one page');
});
for(const width of [390,1440])test('all category chips are reachable at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:844});
  for(const [label] of cases){
    const chip=page.getByRole('button',{name:label,exact:true});await chip.scrollIntoViewIfNeeded();await chip.click();
    await expect(page.locator('#bc-cat-status')).toContainText(label);
    const box=(await chip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
