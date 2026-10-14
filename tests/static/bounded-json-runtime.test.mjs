import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedJSON, RequestBodyError} from '../../supabase/functions/_shared/bounded-json.mjs';
const request = (body, headers = {}) => new Request('https://example.test/', {method:'POST',body,duplex:'half',headers:{'content-type':'application/json',...headers}});
test('valid UTF-8 split across chunks is decoded without losing characters',async()=>{
 const bytes=new TextEncoder().encode('{"name":"🧱"}');
 const stream=new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}});
 assert.deepEqual(await readBoundedJSON(request(stream)),{name:'🧱'});
});
test('unbounded chunked input is cancelled before consuming the remaining stream',async()=>{
 let reads=0,cancelled=false;
 const stream=new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(4096));},cancel(){cancelled=true;}},{highWaterMark:0});
 await assert.rejects(readBoundedJSON(request(stream)),e=>e instanceof RequestBodyError&&e.status===413);
 assert.equal(cancelled,true);assert.equal(reads,3);
});
test('a false content-length cannot bypass the actual byte limit',async()=>{
 await assert.rejects(readBoundedJSON(request(' '.repeat(8193),{'content-length':'2'})),e=>e.status===413);
});
test('media type, malformed UTF-8 and JSON fail with fixed client errors',async()=>{
 for(const [r,status] of [[request('{}',{'content-type':'application/jsonevil'}),415],[request(new Uint8Array([0xff])),400],[request('{'),400]])
  await assert.rejects(readBoundedJSON(r),e=>e instanceof RequestBodyError&&e.status===status);
});
test('byte boundary counts UTF-8 bytes rather than code units',async()=>{
 assert.deepEqual(await readBoundedJSON(request('{}'),2),{});
 await assert.rejects(readBoundedJSON(request('"🧱"'),5),e=>e.status===413);
 assert.equal(await readBoundedJSON(request('"🧱"'),6),'🧱');
});
