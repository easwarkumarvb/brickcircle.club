import test from 'node:test';import assert from 'node:assert/strict';import {syntheticImages} from '../../scripts/ux-gallery.mjs';
const root='/tmp/ux-report';
const report=image=>({suites:[{specs:[{title:'Test',tests:[{projectName:'mobile',results:[{status:'passed',attachments:[image]}]}]}]}]});
test('gallery accepts only explicitly synthetic PNG evidence inside artifact root',()=>{
 assert.equal(syntheticImages(report({name:'synthetic-landing',contentType:'image/png',path:root+'/artifacts/shot.png'}),root).length,1);
 for(const name of ['screenshot','trace','synthetic-../../secret'])assert.equal(syntheticImages(report({name,contentType:'image/png',path:root+'/artifacts/shot.png'}),root).length,0);
 assert.throws(()=>syntheticImages(report({name:'synthetic-landing',contentType:'image/png',path:'/tmp/secret.png'}),root),/inside isolated/);
});

test('inline PNG attachments are bounded and validate the image signature',()=>{
 const body=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
 assert.equal(syntheticImages(report({name:'synthetic-join',contentType:'image/png',body}),root).length,1);
 assert.throws(()=>syntheticImages(report({name:'synthetic-join',contentType:'image/png',body:'ZmFrZQ=='}),root),/signature/);
 assert.throws(()=>syntheticImages(report({name:'synthetic-join',contentType:'image/png',body:'!'}),root),/body/);
});
