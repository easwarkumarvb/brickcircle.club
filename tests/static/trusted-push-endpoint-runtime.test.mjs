import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedPushEndpoint} from '../../supabase/functions/_shared/trusted-push-endpoint.mjs';
test('browser provider endpoints retain explicit hostname boundaries',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/example','https://updates.push.services.mozilla.com/wpush/v2/example','https://push.services.mozilla.com/wpush/example','https://web.push.apple.com/example','https://region.web.push.apple.com/example','https://wns.notify.windows.com/example'])assert.equal(trustedPushEndpoint(endpoint),true,endpoint);
});
test('arbitrary, local, ambiguous and non-canonical destinations are refused',()=>{
 for(const endpoint of ['https://127.0.0.1/internal','https://[::1]/internal','https://localhost/internal','https://example.test/send','http://fcm.googleapis.com/send','https://fcm.googleapis.com:8443/send','https://fcm.googleapis.com:443/send','https://user:secret@fcm.googleapis.com/send','https://fcm.googleapis.com/send#secret','https://fcm.googleapis.com.evil.test/send','https://web.push.apple.com.evil.test/send','https://fakepush.apple.com/send','https://foo..push.apple.com/send','https://%66cm.googleapis.com/send','https://fcm.googleapis.com\\@evil.test/send','https://fcm.googleapis.com/','https://fcm.googleapis.com/send\n','https://fcm.googleapis.com/'+ 'a'.repeat(4096),null])assert.equal(trustedPushEndpoint(endpoint),false,String(endpoint).slice(0,100));
});
