import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { offlineLogin } from './offline-pr125-login.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Mirror the canonical transition rows, not notification kinds. No hosted transport.
export function lifecycleFixture(fixture) {
  const messages=[],actions=[];
  const transition=(actor,args)=>{
    const c=fixture.cases.find(row=>row.id===args.p_case_id);
    assert.ok(c && [c.user_a,c.user_b].includes(actor));assert.equal(c.state_version,args.p_expected_version);
    const name=args.p_action,previous=c.state,side=actor===c.user_a?'a':'b';
    const stamp=new Date(Date.parse('2026-10-05T13:00:00Z')+actions.length*1000).toISOString();
    const both=prefix=>c[prefix+'_a_at']&&c[prefix+'_b_at'];
    const confirm=prefix=>{assert.ok(!c[prefix+'_'+side+'_at']);c[prefix+'_'+side+'_at']=stamp};
    const requireState=state=>assert.equal(c.state,state);
    if(name==='accept'){requireState('PROPOSED');assert.equal(actor,c.recipient_id);c.state='ACCEPTED';fixture.items.filter(item=>[c.item_a,c.item_b].includes(item.id)).forEach(item=>{item.available_for_exchange=false})}
    else if(name==='propose_meetup'||name==='propose_return'){
      requireState(name==='propose_meetup'?'ACCEPTED':'ACTIVE');
      const p=args.p_payload;assert.ok(p.venue_name && Date.parse(p.meetup_at)>Date.now());
      const prefix=name==='propose_meetup'?'meetup':'return';
      c[prefix+'_proposed_by']=actor;c[prefix+'_venue_name']=p.venue_name;c[prefix+'_venue_area']=p.venue_area;
      c[name==='propose_meetup'?'meetup_at':'return_meetup_at']=p.meetup_at;c.state=name==='propose_meetup'?'MEETUP_PLANNING':'RETURN_PLANNING';
    }else if(name==='accept_meetup'||name==='accept_return'){
      requireState(name==='accept_meetup'?'MEETUP_PLANNING':'RETURN_PLANNING');assert.notEqual(actor,c[name==='accept_meetup'?'meetup_proposed_by':'return_proposed_by']);
      c[name==='accept_meetup'?'meetup_accepted_by':'return_accepted_by']=actor;c.state=name==='accept_meetup'?'MEETUP_CONFIRMED':'RETURN_INSPECTION';
    }else if(name==='safety_ack'){requireState('MEETUP_CONFIRMED');confirm('safety_ack');if(both('safety_ack'))c.state='INSPECTION'}
    else if(name==='arrive'){requireState('INSPECTION');assert.ok(both('safety_ack'));confirm('arrived')}
    else if(name==='inspect'){requireState('INSPECTION');assert.ok(both('arrived'));confirm('inspected');if(both('inspected'))c.state='HANDOFF_PENDING'}
    else if(name==='handoff'){requireState('HANDOFF_PENDING');assert.ok(both('inspected'));confirm('handoff');if(both('handoff')){c.state='ACTIVE';c.handoff_at=stamp;c.return_due_at=new Date(Date.parse(stamp)+c.duration_days*86400000).toISOString()}}
    else if(name==='return_arrive'){requireState('RETURN_INSPECTION');confirm('return_arrived')}
    else if(name==='return_inspect'){requireState('RETURN_INSPECTION');assert.ok(both('return_arrived'));confirm('return_inspected')}
    else if(name==='return_confirm'){requireState('RETURN_INSPECTION');assert.ok(both('return_inspected'));confirm('return_confirmed');if(both('return_confirmed')){c.state='COMPLETED';c.completed_at=stamp}}
    else assert.fail('Unsupported offline lifecycle action');
    c.state_version++;c.updated_at=stamp;actions.push({actor,name});
    fixture.events.push({id:'canonical-event-'+actions.length,case_id:c.id,event_type:name,previous_state:previous,resulting_state:c.state,actor_user_id:actor,state_version:c.state_version,idempotency_key:args.p_idempotency_key,metadata:args.p_payload||{},created_at:stamp});
    return {ok:true,case:{...c}};
  };
  const transportFor=actor=>(request,target)=>{
    if(target.pathname==='/rest/v1/rpc/exchange_case_transition')return transition(actor,request.postDataJSON());
    if(target.pathname==='/rest/v1/rpc/send_exchange_case_message'){
      const args=request.postDataJSON(),c=fixture.cases.find(row=>row.id===args.p_case_id);
      assert.ok(c && c.state!=='COMPLETED');
      const message={id:'canonical-message-'+(messages.length+1),case_id:c.id,sender_id:actor,recipient_id:actor===c.user_a?c.user_b:c.user_a,body:args.p_body,created_at:'2026-10-05T12:30:00Z'};
      messages.push(message);return {ok:true,message};
    }
    if(target.pathname==='/rest/v1/exchange_case_messages'){
      let rows=messages;
      for(const [key,value] of target.searchParams)if(value.startsWith('eq.'))rows=rows.filter(row=>row[key]===value.slice(3));
      return rows;
    }
    return fixture.transport(request,target);
  };
  return {transportFor,actions,messages,transition};
}

export async function reproduceLifecycle(browser,candidate,pa,fixture,lifecycle,proposalResult,login,notifications,run,expectedOldFailure=false) {
  const {case1,case2,client}=proposalResult;
  await pa.evaluate(id=>window.bcNav('messages',`case:${id}`),case1);
  await expect(pa.locator('#bc-msg-form')).toBeVisible();
  await pa.locator('#bc-msg-form textarea').fill('Browser case one second');await pa.locator('#bc-msg-form').evaluate(form=>form.requestSubmit());
  await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('');
  await offlineLogin(browser,candidate,login,notifications,{actor:{id:fixture.B,email:'peer@example.test'},transport:lifecycle.transportFor(fixture.B),
    afterLogin:async pb=>{
      let stage='start';
      try { await run({pa,pb,case1,a:{id:fixture.A,client},b:{id:fixture.B}},detail=>{stage=detail}); }
      catch (failure) {
        if(failure?.code==='BC_UX_SAFE_METRICS')console.log(failure.message);
        console.log('Offline lifecycle reproduction stopped at fixed substage: '+stage);
        console.log(JSON.stringify({completed:fixture.cases.find(row=>row.id===case1).state==='COMPLETED',
          canonicalCompletedEvents:fixture.events.filter(event=>event.case_id===case1&&event.event_type==='return_confirm'&&event.resulting_state==='COMPLETED').length,
          lifecycleActions:lifecycle.actions.length,
          secondCaseStillProposed:fixture.cases.find(row=>row.id===case2).state==='PROPOSED',
          closedGuide:(await pb.getByRole('region',{name:'Exchange next step'}).innerText()).includes('Closed'),
          composerVisible:await pb.locator('#bc-msg-form').isVisible(),
          composerContextCompleted:await pb.evaluate(()=>document.querySelector('#bc-msg-chat')?.bcThread?.caseRow?.state==='COMPLETED'),
          selectedCaseMatches:await pb.locator('#bc-case-destination').inputValue()===case1,
          completedLabelCount:await pb.locator(`.bc-collector-event[data-timeline-case="${case1}"]`).filter({hasText:'Completed'}).count(),
          returnConfirmLabelCount:await pb.locator(`.bc-collector-event[data-timeline-case="${case1}"]`).filter({hasText:'Return confirm'}).count()}));
        if(expectedOldFailure){
          assert.equal(stage,'closed composer');assert.equal(lifecycle.actions.length,19);
          assert.equal(fixture.cases.find(row=>row.id===case1).state,'COMPLETED');
          assert.equal(await pb.locator('#bc-msg-form').isVisible(),true);
          assert.ok((await pb.getByRole('region',{name:'Exchange next step'}).innerText()).includes('Closed'));
          console.log('Expected old-candidate composer failure reproduced; not a pass or hosted evidence.');return;
        }
        throw new Error('Offline lifecycle reproduction failed; details withheld');
      }
      assert.equal(expectedOldFailure,false,'Old-candidate negative regression must fail at closed composer');
      assert.equal(fixture.cases.find(row=>row.id===case2).state,'PROPOSED');
      assert.equal(lifecycle.actions.length,19);
      console.log('Offline full canonical lifecycle and closed archive passed; not hosted evidence.');
    }});
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [{chromium},{browserLogin,withDesktopNotifications,browserProposal,physicalPairCard,browserLifecycle},{proposalFixture,reproduceProposal}]=await Promise.all([
    import('@playwright/test'),import('./hosted-pr125-browser.mjs'),import('./offline-pr125-proposal.mjs')]);
  let browser;
  try {
    assert.ok(process.argv[2],'An exact candidate asset archive is required');
    browser=await chromium.launch();const candidate=process.argv[2],fixture=proposalFixture(),lifecycle=lifecycleFixture(fixture);
    await offlineLogin(browser,candidate,browserLogin,withDesktopNotifications,{transport:lifecycle.transportFor(fixture.A),afterLogin:async(page,url)=>{
      const result=await reproduceProposal(page,fixture,browserProposal,physicalPairCard,url);
      await reproduceLifecycle(browser,candidate,page,fixture,lifecycle,result,browserLogin,withDesktopNotifications,browserLifecycle,process.argv.includes('--expect-old-composer-failure'));
    }});
  }catch{console.log('Offline lifecycle reproduction failed; raw diagnostics withheld.');process.exitCode=1;}
  finally{await browser?.close();}
}
