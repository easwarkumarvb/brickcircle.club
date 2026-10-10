import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Trusted HTTP fixtures, served to the pinned real SDK and unchanged candidate.
export function proposalFixture() {
  const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',D='00000000-0000-4000-8000-000000000104';
  const sets=[{set_number:'75192-1',name:'Millennium Falcon',theme:'Star Wars',piece_count:7541,estimated_value:850},
    {set_number:'10307-1',name:'Eiffel Tower',theme:'Icons',piece_count:10001,estimated_value:680},
    {set_number:'10294-1',name:'Titanic',theme:'Icons',piece_count:9090,estimated_value:680}];
  const stamp='2026-10-05T12:00:00Z';
  const profiles=[{id:A,email:'offline@example.test',display_name:'Offline collector'},{id:B,email:'peer@example.test',display_name:'Offline peer'},{id:D,email:'retained@example.test',display_name:'Retained collector'}].map(row=>({...row,country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp}));
  const items=[['item-a',A,sets[1]],['item-b',B,sets[0]],['item-a-third',A,sets[2]],['item-b-third',B,sets[2]]].map(([id,user_id,set])=>({id,user_id,set_number:set.set_number,lego_sets:set,available_for_exchange:true,created_at:stamp}));
  const wishes=[[A,sets[0]],[A,sets[1]],[A,sets[2]],[B,sets[0]],[B,sets[1]],[B,sets[2]],[D,sets[1]]].map(([user_id,set],index)=>({id:'wish-'+index,user_id,set_number:set.set_number,lego_sets:set,priority:3}));
  // Non-first target and four same-peer combinations, including same-set copies.
  const matches=[items[2],items[0]].flatMap(offer=>[items[3],items[1]].map(request=>({match_user:B,match_score:95,offered_item:offer.id,requested_item:request.id,offered_set:offer.set_number,requested_set:request.set_number,offered_name:offer.lego_sets.name,requested_name:request.lego_sets.name,offered_value:offer.lego_sets.estimated_value,requested_value:request.lego_sets.estimated_value})));
  const retained={...items[1],id:'retained-copy',user_id:D};
  const reversed={...items[1],id:'reversed-offer',user_id:A};
  const reversedRequest={...items[0],id:'reversed-request',user_id:B};
  // The text-only selector matches all three; peer alone still matches the reverse pair.
  matches.unshift({...matches[3],match_user:D,requested_item:retained.id},
    {...matches[3],offered_item:reversed.id,requested_item:reversedRequest.id,offered_set:sets[0].set_number,requested_set:sets[1].set_number,offered_name:sets[0].name,requested_name:sets[1].name});
  const copies=[...items,retained,reversed,reversedRequest];
  const cases=[],events=[],calls=[];
  const transport=(request,target)=>{
    const table=target.pathname.replace('/rest/v1/','');
    if(!target.pathname.startsWith('/rest/v1/'))return undefined;
    if(table==='rpc/find_matches')return matches;
    if(table==='rpc/bc_exchange_capabilities')return {contract_version:2,canonical_cases:true};
    if(table==='rpc/create_exchange_case'){
      const args=request.postDataJSON();calls.push(args);
      assert.ok(matches.some(m=>m.offered_item===args.p_offered_item_id&&m.requested_item===args.p_requested_item_id),'Offline proposal must be a reciprocal physical pair');
      const peer=copies.find(item=>item.id===args.p_requested_item_id).user_id;
      const row={id:'offline-case-'+(cases.length+1),user_a:A,user_b:peer,proposer_id:A,recipient_id:peer,item_a:args.p_offered_item_id,item_b:args.p_requested_item_id,duration_days:args.p_duration_days,state:'PROPOSED',state_version:1,created_at:stamp,updated_at:stamp};
      cases.push(row);events.push({id:'event-'+cases.length,case_id:row.id,event_type:'proposal_created',actor_user_id:A,resulting_state:'PROPOSED',state_version:1,created_at:stamp});
      return {ok:true,case:row};
    }
    if(table.startsWith('rpc/'))return {};
    let rows=({profiles,public_profiles:profiles,collection_items:copies,wishlists:wishes,lego_sets:sets,exchange_cases:cases,exchange_case_events:events})[table]||[];
    for(const [key,value] of target.searchParams){
      if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
      if(value.startsWith('in.('))rows=rows.filter(row=>value.slice(4,-1).split(',').includes(String(row[key])));
    }
    if((request.headers().accept||'').includes('application/vnd.pgrst.object'))return rows[0]||null;
    return rows;
  };
  return {transport,items,sets,matches,cases,events,calls,A,B,D};
}

export function browserSDKClient(page) {
  return {from:table=>({select:column=>{
    const steps=[];
    const execute=()=>page.evaluate(async({table,column,steps})=>{
      let query=window.BC_SUPABASE.from(table).select(column);
      for(const [name,args] of steps)query=query[name](...args);
      return await query;
    },{table,column,steps});
    const query={then:(resolve,reject)=>execute().then(resolve,reject)};
    for(const name of ['in','eq','order','single'])query[name]=(...args)=>{steps.push([name,args]);return query};
    return query;
  }}),rpc:(name,args)=>page.evaluate(({name,args})=>window.BC_SUPABASE.rpc(name,args),{name,args})};
}
export async function reproduceProposal(page,fixture,proposal,pairCard,url) {
  await page.evaluate(()=>{window.bcClose();window.bcNav('matches')});
  await expect(page.locator('.bc-match')).toHaveCount(6);
  const card=page.locator('.bc-match').filter({hasText:'Set 10307-1'}).filter({hasText:'Set 75192-1'});
  await expect(card).toHaveCount(3);
  await expect(card.filter({has:page.locator(`[data-message-person="${fixture.B}"]`)})).toHaveCount(2);
  await expect(pairCard(page,fixture.B,'75192-1','10307-1')).toHaveCount(1);
  console.log('Offline original text selector is ambiguous with retained and reversed pairs.');
  // Use the browser's real SDK for the independent read assertions and second RPC.
  const client=browserSDKClient(page);
  let stage='start';
  const result=await proposal(page,{url,a:{id:fixture.A,client},b:{id:fixture.B},
    sets:['10307-1','75192-1','10294-1','10294-1'],items:fixture.items,runId:'offline-proposal'},detail=>{
    stage=detail;
    if(detail==='submit inline proposal'){
      assert.equal(fixture.calls.length,0);assert.equal(fixture.cases.length,0);
      assert.ok(fixture.items.every(item=>item.available_for_exchange));
    }
  });
  assert.equal(stage,'second same-peer physical pair');
  assert.equal(fixture.calls.length,2);
  assert.equal(fixture.calls[0].p_offered_item_id,fixture.items[0].id);
  assert.equal(fixture.calls[0].p_requested_item_id,fixture.items[1].id);
  assert.equal(fixture.calls[1].p_offered_item_id,fixture.items[2].id);
  assert.equal(fixture.calls[1].p_requested_item_id,fixture.items[3].id);
  assert.equal(fixture.cases.length,2);assert.ok(fixture.cases.every(row=>row.user_b===fixture.B));
  assert.notEqual(result.case1,result.case2);
  console.log('Offline shared proposal selected intended peer/ordered pair, left distractors untouched, opened without reservation and created two exact same-peer cases; not hosted evidence.');
  return {...result,client};
}
