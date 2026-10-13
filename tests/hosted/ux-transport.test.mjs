import test from 'node:test';import assert from 'node:assert/strict';import {isIsolatedTransport} from '../../scripts/ux-transport.mjs';
test('only exact isolated HTTP origin is permitted; production and sockets are blocked',()=>{
 const origin='http://127.0.0.1:4187';
 assert.equal(isIsolatedTransport(origin+'/v2.html',origin),true);
 for(const url of ['https://brickcircle.club','https://nsxtromjdpdscknadxez.supabase.co','http://127.0.0.1:3000','http://localhost:4187','ws://127.0.0.1:4187','data:text/plain,test','http://user:password@127.0.0.1:4187/test','invalid'])assert.equal(isIsolatedTransport(url,origin),false,url);
});
