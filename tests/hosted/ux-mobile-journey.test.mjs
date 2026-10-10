import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyUxMetrics } from '../../scripts/ux-mobile-journey.mjs';

const base={
  width:390, overflow:0, composerVisible:true, composerEnabled:true,
  guideVisible:true, guideClosed:false, caseActionCount:1,
  unavailableVisible:false, buttonHeight:44
};
test('staged collector messaging is usable on a 390px mobile viewport',()=>{
  const result=verifyUxMetrics(base,{phase:'case-messaging',mode:'composer'});
  assert.equal(result.composerVisible,true);
  assert.equal(result.horizontalOverflow,0);
  assert.equal(result.minimumComposerButtonHeight,44);
});
test('mobile horizontal overflow, hidden composer, disabled textarea or guide are blockers',()=>{
  for(const m of [{overflow:12},{composerVisible:false},{composerEnabled:false},{guideVisible:false}]){
    assert.throws(()=>verifyUxMetrics({...base,...m},{phase:'case-messaging',mode:'composer'}));
  }
});
test('outsider must not see send controls or lifecycle actions',()=>{
  const outsider={...base,composerVisible:false,composerEnabled:false,guideVisible:false,caseActionCount:0,unavailableVisible:true};
  verifyUxMetrics(outsider,{phase:'outsider',mode:'outsider'});
  for(const m of [{composerVisible:true},{caseActionCount:1},{unavailableVisible:false}]){
    assert.throws(()=>verifyUxMetrics({...outsider,...m},{phase:'outsider',mode:'outsider'}));
  }
});
test('completed case hides composer and exposes a Closed guide',()=>{
  const complete={...base,composerVisible:false,composerEnabled:false,guideClosed:true,caseActionCount:0};
  verifyUxMetrics(complete,{phase:'exchange-completed',mode:'closed'});
  for(const m of [{composerVisible:true},{guideClosed:false},{guideVisible:false}]){
    assert.throws(()=>verifyUxMetrics({...complete,...m},{phase:'exchange-completed',mode:'closed'}));
  }
});
test('labels are fixed, safe tokens and do not permit arbitrary path or user identity',()=>{
  for(const phase of ['', '../secrets', 'Collector@email.test', 'a/b', 'a b']){
    assert.throws(()=>verifyUxMetrics(base,{phase,mode:'page'}));
  }
  assert.throws(()=>verifyUxMetrics({...base,overflow:Infinity},{phase:'phase',mode:'page'}));
});
