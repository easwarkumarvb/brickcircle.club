import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const analytics=fs.readFileSync(new URL('../../analytics.js',import.meta.url),'utf8');
const product=fs.readFileSync(new URL('../../product-analytics.js',import.meta.url),'utf8');
function fixture(path){
 const scripts=[],events=[],listeners={};
 const location=new URL('https://brickcircle.example'+path);
 const window={gtag:(...args)=>events.push(args)};
 const document={head:{appendChild:s=>scripts.push(s)},createElement:()=>({}),readyState:'complete',addEventListener:(name,fn)=>{listeners[name]=fn},body:{nodeType:1,textContent:''}};
 const ctx=vm.createContext({location,window,document,URL,URLSearchParams,addEventListener:(name,fn)=>{listeners[name]=fn}});
 vm.runInContext(analytics,ctx);vm.runInContext(product,ctx);
 return {scripts,events,window,location,listeners};
}
for(const path of ['/admin.html','/auth-confirm.html','/?%63ode=secret','/?TOKEN_HASH=secret','/#access%5Ftoken=secret','/#profile?refresh%5Ftoken=secret','/?provider_token=secret','/?error_description=secret'])test('sensitive document never loads analytics: '+path,()=>{
 const f=fixture(path);assert.equal(f.scripts.length,0);assert.equal(f.events.length,0);
});
test('aggregate dimensions survive while names, credentials, IDs and free text are dropped',()=>{
 const f=fixture('/?ref=private#exchange/private-case-id');
 f.window.bcTrack('onboarding_location_completed',{display_name:'Private Name',id:'private-user-id',email:'private@example.test',query:'private text',case_id:'private-case-id',token:'private-token',source:'profile',duration_days:60,result_count:4,owner_photo:true,page_location:'https://evil.test/private'});
 const event=f.events.at(-1);assert.equal(event[1],'onboarding_location_completed');
 assert.deepEqual(JSON.parse(JSON.stringify(event[2])),{source:'profile',result_count:4,duration_days:60,owner_photo:true,page_location:'https://brickcircle.example/#exchange',page_path:'/#exchange',page_title:'BrickCircle - exchange'});
 assert.equal(JSON.stringify(f.events).includes('private'),false);
});
test('later callback navigation suppresses both direct and delegated events',()=>{
 const f=fixture('/#home');const before=f.events.length;
 f.location.href='https://brickcircle.example/?%63ode=secret#profile';
 f.window.bcTrack('login',{source:'profile'});f.listeners.hashchange();
 assert.equal(f.events.length,before);
});
test('unbounded values and invalid event names do not leave through the tracker',()=>{
 const f=fixture('/#home');f.window.bcTrack('safe_event',{source:'private',result_count:Infinity,duration_days:-1,collection_type:'private',owner_photo:'yes'});
 assert.deepEqual(Object.keys(f.events.at(-1)[2]).sort(),['page_location','page_path','page_title']);
 const before=f.events.length;f.window.bcTrack('private@example.test',{});assert.equal(f.events.length,before);
});
