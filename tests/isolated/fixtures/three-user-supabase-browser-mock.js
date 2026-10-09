/* Shared deterministic Easwar/Ramya/Dhyan Supabase substitute. Loopbacklk? */
(()=>{
'use strict';
const NOW='2026-09-09T12:00:00.000Z';
const STORE='bc_three_user_db';
const ACTOR='bc_three_user_actor';
const DAY_MS=86400000;
const releaseCapabilityMissing=new URLSearchParams(location.search).get('release-capability')==='missing';
const actors={
  easwar:{id:'00000000-0000-4000-8000-000000000101',email:'easwar@example.invalid',name:'Easwar'},
  ramya:{id:'00000000-0000-4000-8000-000000000102',email:'ramya@example.invalid',name:'Ramya'},
  dhyan:{id:'00000000-0000-4000-8000-000000000103',email:'dhyan@example.invalid',name:'Dhyan'}
};
const sets=[
  {set_number:'42172-1',name:'McLaren P1',theme:'Technic',year:2024,piece_count:3893,estimated_value:450,catalog_active:true},
  {set_number:'42143-1',name:'Ferrari Daytona SP3',theme:'Technic',year:2022,piece_count:3778,estimated_value:450,catalog_active:true},
  {set_number:'42115-1',name:'Lamborghini Sián FKP 37',theme:'Technic',year:2020,piece_count:3696,estimated_value:420,catalog_active:true}
];
const ISSUE_CATEGORIES=['missing_pieces','major_component_missing','unexpected_damage','materially_different_condition','wrong_set_or_accessory','return_overdue','communication_problem','other'];
const SUPPORT_CATEGORIES=['technical','safety','account','other'];
const REVIEW_DIMENSIONS=['overall_rating','return_reliability','set_accuracy','communication','condition_accuracy'];
const CANCELLABLE_STATES=['PROPOSED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING'];
function fresh(){
  return {
    profiles:Object.values(actors).map(actor=>({id:actor.id,display_name:actor.name,email:actor.email,country:'India',city:'Bengaluru',bio:'Isolated reliability fixture',avatar_url:null,rating:0,review_count:0,member_since:NOW,created_at:NOW,adult_confirmed_at:NOW,adult_confirmation_version:'2026-09-11'})),
    collection:[],wishlist:[],exchanges:[],events:[],notifications:[],messages:[],directMessages:[],reviews:[],
    issues:[],issueResponses:[],supportRequests:[],peerReviews:[]
  };
}
let data;
try{data=JSON.parse(localStorage.getItem(STORE)||'null')||fresh()}catch(_){data=fresh()}
data.directMessages||=[];data.reviews||=[];
data.issues||=[];data.issueResponses||=[];data.supportRequests||=[];data.peerReviews||=[];
let actorKey=localStorage.getItem(ACTOR)||'easwar';
let signedOut=false;
const active=()=>actors[actorKey];
const user=()=>({id:active().id,email:active().email,created_at:NOW,app_metadata:{provider:'email'},identities:[{provider:'email'}]});
const persist=()=>localStorage.setItem(STORE,JSON.stringify(data));
const state={
  actors,sets,rpcCalls:[],rpcArgs:[],lostResponses:new Set(),get actor(){return actorKey},get data(){return data},
  reset(){data=fresh();actorKey='easwar';state.rpcCalls.length=0;state.rpcArgs.length=0;state.lostResponses.clear();localStorage.setItem(ACTOR,actorKey);persist()},
  persist,
  loseNextResponse(name){state.lostResponses.add(name)},
  switchActor(next){if(!actors[next])throw new Error(`Unknown actor ${next}`);actorKey=next;signedOut=false;localStorage.setItem(ACTOR,next)}
};
window.__bcThreeUser=state;
window.__bcIsolated=state;
window.BC_LOCATIONS={India:['Bengaluru','Mumbai','Delhi']};

const authListeners=[];
const emitAuth=(event,session)=>authListeners.forEach(listener=>listener(event,session));
const realtimeHandlers=[];
function isParticipant(exchange){return Boolean(exchange)&&(exchange.user_a===active().id||exchange.user_b===active().id)}
function findCase(id){return data.exchanges.find(row=>row.id===id)}
function findParticipantCase(id){const exchange=findCase(id);return isParticipant(exchange)?exchange:null}
function otherParticipant(exchange){return exchange.user_a===active().id?exchange.user_b:exchange.user_a}
function issueById(id){return data.issues.find(row=>row.id===id)}
function futureIso(days){return new Date(Date.parse(NOW)+days*DAY_MS).toISOString()}
function notify(userId,kind,title,body,exchange){
  const note={id:`notification-${data.notifications.length+1}`,user_id:userId,kind,title,body,actor_user_id:active().id,entity_type:exchange?'exchange_case':null,entity_id:exchange?exchange.id:null,exchange_case_id:exchange?exchange.id:null,metadata:exchange?{exchange_case_id:exchange.id,route:`#exchange/${exchange.id}`}:null,read_at:null,created_at:NOW};
  data.notifications.push(note);
  if(userId===active().id)realtimeHandlers.forEach(handler=>handler({eventType:'INSERT',new:note,old:{}}));
  return note;
}
function pushEvent(exchange,eventType,idempotencyKey){
  const event={id:`event-${data.events.length+1}`,case_id:exchange.id,event_type:eventType,resulting_state:exchange.state,actor_id:active().id,idempotency_key:idempotencyKey===undefined?null:idempotencyKey,created_at:NOW};
  data.events.push(event);
  return event;
}
function lostAfterCommit(name){return state.lostResponses.delete(name)?{data:null,error:{message:'Network response was lost after commit',status:0}}:null}
function visibleRows(table,query){
  let rows=[];
  if(table==='profiles')rows=data.profiles;
  if(table==='public_profiles')rows=data.profiles;
  if(table==='collection_items')rows=data.collection;
  if(table==='wishlists')rows=data.wishlist;
  if(table==='exchange_cases')rows=data.exchanges.filter(row=>row.user_a===active().id||row.user_b===active().id);
  if(table==='exchange_case_messages')rows=data.messages.filter(row=>data.exchanges.some(exchange=>exchange.id===row.case_id&&(exchange.user_a===active().id||exchange.user_b===active().id)));
  if(table==='exchange_case_events')rows=data.events.filter(row=>data.exchanges.some(exchange=>exchange.id===row.case_id&&(exchange.user_a===active().id||exchange.user_b===active().id)));
  if(table==='exchange_case_issues')rows=data.issues.filter(row=>isParticipant(findCase(row.case_id)));
  if(table==='exchange_case_issue_responses')rows=data.issueResponses.filter(row=>{const issue=issueById(row.issue_id);return Boolean(issue)&&isParticipant(findCase(issue.case_id))});
  if(table==='exchange_case_support_requests')rows=data.supportRequests.filter(row=>row.requested_by===active().id);
  if(table==='notifications')rows=data.notifications.filter(row=>row.user_id===active().id);
  if(table==='messages')rows=data.directMessages.filter(row=>row.sender_id===active().id||row.recipient_id===active().id);
  if(table==='reviews')rows=data.reviews;
  if(table==='lego_sets')rows=sets;
  if(table==='collection_items'&&!query.ins.some(([key])=>key==='id'))rows=rows.filter(row=>row.user_id===active().id);
  for(const [key,value] of query.filters)rows=rows.filter(row=>row[key]===value);
  for(const [key,values] of query.ins)rows=rows.filter(row=>values.includes(row[key]));
  return rows.map(row=>table==='collection_items'||table==='wishlists'?{...row,lego_sets:sets.find(set=>set.set_number===row.set_number)}:{...row});
}
function chain(table){
  const query={filters:[],ins:[],mode:'select',patch:null,selected:false,
    select(){query.selected=true;return query},eq(key,value){query.filters.push([key,value]);return query},in(key,values){query.ins.push([key,values]);return query},or(value){query.orFilter=value;return query},order(key,options){if(key==='created_at')query.descending=options?.ascending===false;return query},limit(value){query.limitValue=value;return query},range(){return query},is(key,value){query.filters.push([key,value]);return query},
    update(patch){query.mode='update';query.patch=patch;return query},delete(){query.mode='delete';return query},
    upsert(patch){const profile=data.profiles.find(row=>row.id===patch.id);if(profile)Object.assign(profile,patch);else data.profiles.push({...patch,created_at:NOW});persist();return Promise.resolve({data:[patch],error:null})},
    insert(value){
      const rows=Array.isArray(value)?value:[value];
      for(const row of rows){
        if(table==='collection_items'&&!data.collection.some(item=>item.user_id===row.user_id&&item.set_number===row.set_number))data.collection.push({id:`collection-${data.collection.length+1}`,...row,available_for_exchange:row.available_for_exchange||false,created_at:NOW});
        if(table==='wishlists'&&!data.wishlist.some(item=>item.user_id===row.user_id&&item.set_number===row.set_number))data.wishlist.push({id:`wishlist-${data.wishlist.length+1}`,...row,priority:row.priority||3,created_at:NOW});
        if(table==='exchange_case_messages')data.messages.push({id:`message-${data.messages.length+1}`,...row,created_at:NOW});
        if(table==='messages')data.directMessages.push({id:`direct-${data.directMessages.length+1}`,...row,exchange_id:null,created_at:NOW});
      }
      persist();return Promise.resolve({data:null,error:null});
    },
    maybeSingle(){return Promise.resolve({data:visibleRows(table,query)[0]||null,error:null})},
    then(resolve){
      const matches=row=>query.filters.every(([key,value])=>row[key]===value)&&query.ins.every(([key,values])=>values.includes(row[key]));
      let result=visibleRows(table,query);
      if(query.mode==='select'&&query.limitValue&&['messages','exchange_case_messages','exchange_cases'].includes(table)){
        const earlier=query.orFilter?.match(/created_at\.lt\.([^,)]+)/)?.[1],tie=query.orFilter?.match(/id\.lt\.([^,)]+)/)?.[1];
        if(earlier)result=result.filter(row=>row.created_at<earlier||(row.created_at===earlier&&String(row.id)<tie));
        result=result.sort((a,b)=>(query.descending?String(b.created_at).localeCompare(String(a.created_at)):String(a.created_at).localeCompare(String(b.created_at)))||String(b.id).localeCompare(String(a.id))).slice(0,query.limitValue);
      }
      if(query.mode==='update'){
        const source=table==='collection_items'?data.collection:table==='wishlists'?data.wishlist:table==='notifications'?data.notifications:table==='profiles'?data.profiles:[];
        const changed=source.filter(matches);changed.forEach(row=>Object.assign(row,query.patch));persist();result=query.selected?changed.map(row=>({...row})):null;
      }
      if(query.mode==='delete'){
        const key=table==='collection_items'?'collection':table==='wishlists'?'wishlist':table==='notifications'?'notifications':null;
        if(key){const removed=data[key].filter(matches);data[key]=data[key].filter(row=>!matches(row));persist();result=removed.map(row=>({id:row.id}))}
      }
      return Promise.resolve({data:result,error:null}).then(resolve);
    }
  };
  return query;
}
function itemReserved(itemId,exceptId=''){return data.exchanges.some(exchange=>exchange.id!==exceptId&&!['DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED'].includes(exchange.state)&&(exchange.item_a===itemId||exchange.item_b===itemId))}
function findMatches(){
  const mine=data.collection.filter(row=>row.user_id===active().id&&row.available_for_exchange&&!itemReserved(row.id));
  const myWishes=data.wishlist.filter(row=>row.user_id===active().id);
  const profile=data.profiles.find(row=>row.id===active().id);
  const matches=[];
  for(const own of mine){for(const other of data.collection.filter(row=>row.user_id!==active().id&&row.available_for_exchange&&!itemReserved(row.id))){
    const otherProfile=data.profiles.find(row=>row.id===other.user_id);
    if(!profile||!otherProfile||profile.city!==otherProfile.city||profile.country!==otherProfile.country)continue;
    if(!myWishes.some(wish=>wish.set_number===other.set_number))continue;
    if(!data.wishlist.some(wish=>wish.user_id===other.user_id&&wish.set_number===own.set_number))continue;
    const offered=sets.find(set=>set.set_number===own.set_number),requested=sets.find(set=>set.set_number===other.set_number);
    matches.push({match_user:other.user_id,match_score:95,offered_name:offered.name,offered_set:offered.set_number,offered_value:offered.estimated_value,offered_item:own.id,requested_name:requested.name,requested_set:requested.set_number,requested_value:requested.estimated_value,requested_item:other.id});
  }}
  return matches;
}
function restoreItemAvailability(exchange,side){
  const item=data.collection.find(row=>row.id===exchange[`item_${side}`]);
  if(!item)return;
  const preference=exchange[`owner_preference_${side}`]===undefined||exchange[`owner_preference_${side}`]===null?item[`owner_preference_${side}`]:exchange[`owner_preference_${side}`];
  item.available_for_exchange=preference===undefined||preference===null?true:Boolean(preference);
}
const db={
  auth:{
    getSession:async()=>({data:{session:signedOut?null:{user:user()}}}),getUser:async()=>signedOut?{data:{user:null},error:{name:'AuthSessionMissingError',message:'Auth session missing!'}}:{data:{user:user()},error:null},
    onAuthStateChange:listener=>{authListeners.push(listener);return {data:{subscription:{unsubscribe(){const index=authListeners.indexOf(listener);if(index>=0)authListeners.splice(index,1)}}}} },
    signOut:async()=>{signedOut=true;emitAuth('SIGNED_OUT',null);return {error:null}},signInWithPassword:async()=>{signedOut=false;const session={user:user()};emitAuth('SIGNED_IN',session);return {data:{session,user:session.user},error:null}},signUp:async()=>({data:{session:null},error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({data:{user:user()},error:null}),signInWithOAuth:async()=>({data:{url:location.href},error:null})
  },
  realtime:{setAuth:async()=>{}},
  from:chain,
  rpc:async(name,args)=>{
    state.rpcCalls.push(name);
    state.rpcArgs.push({name,args:{...args}});
    if(name==='bc_exchange_capabilities')return releaseCapabilityMissing?{data:null,error:{code:'PGRST202',message:'Function not found in schema cache'}}:{data:{contract_version:2,canonical_cases:true},error:null};
    if(name==='bc_search_lego_sets'){const query=String(args?.p_query||'').toLowerCase().replace(/-1$/,'');return {data:sets.filter(set=>`${set.name} ${set.set_number.replace(/-1$/,'')} ${set.theme}`.toLowerCase().includes(query)),error:null}}
    if(name==='find_matches')return {data:findMatches(),error:null};
    if(name==='set_exchange_item_availability'){
      const item=data.collection.find(row=>row.id===args.p_item_id&&row.user_id===active().id);
      if(!item)return {data:null,error:{message:'Set not found'}};
      if(itemReserved(item.id))return {data:null,error:{message:'Availability is controlled by the active exchange case'}};
      item.available_for_exchange=Boolean(args.p_available);persist();return {data:{ok:true,item_id:item.id,available:item.available_for_exchange},error:null};
    }
    if(name==='create_exchange_case'){
      const prior=data.events.find(row=>row.idempotency_key===args.p_idempotency_key);
      if(prior){const priorCase=data.exchanges.find(row=>row.id===prior.case_id);return {data:{ok:true,case:priorCase,idempotent:true},error:null}}
      const offered=data.collection.find(row=>row.id===args.p_offered_item_id&&row.user_id===active().id&&row.available_for_exchange);
      const requested=data.collection.find(row=>row.id===args.p_requested_item_id&&row.user_id!==active().id&&row.available_for_exchange);
      if(!offered||!requested)return {data:null,error:{message:'This reciprocal match is no longer available'}};
      const match=findMatches().find(row=>row.offered_item===offered.id&&row.requested_item===requested.id);
      if(!match)return {data:null,error:{message:'This reciprocal match is no longer available'}};
      const existing=data.exchanges.find(row=>row.proposer_id===active().id&&row.recipient_id===requested.user_id&&row.item_a===offered.id&&row.item_b===requested.id&&row.state==='PROPOSED');
      if(existing)return {data:{ok:true,case:existing,idempotent:true},error:null};
      const exchange={id:`case-${data.exchanges.length+1}`,user_a:active().id,user_b:requested.user_id,proposer_id:active().id,recipient_id:requested.user_id,item_a:offered.id,item_b:requested.id,duration_days:args.p_duration_days,opening_message:args.p_message,state:'PROPOSED',state_version:1,created_at:NOW,updated_at:NOW};data.exchanges.push(exchange);
      const event={id:`event-${data.events.length+1}`,case_id:exchange.id,event_type:'exchange_proposed',resulting_state:'PROPOSED',actor_id:active().id,idempotency_key:args.p_idempotency_key,created_at:NOW};data.events.push(event);
      const note={id:`notification-${data.notifications.length+1}`,user_id:exchange.recipient_id,kind:'exchange_proposed',title:'New exchange proposal',body:`${active().name} proposed an exchange with you.`,actor_user_id:exchange.proposer_id,entity_type:'exchange_case_event',entity_id:event.id,exchange_case_id:exchange.id,metadata:{exchange_case_id:exchange.id,route:`#exchange/${exchange.id}`},read_at:null,created_at:NOW};data.notifications.push(note);persist();
      if(note.user_id===active().id)realtimeHandlers.forEach(handler=>handler({eventType:'INSERT',new:note,old:{}}));
      if(state.lostResponses.delete(name))return {data:null,error:{message:'Network response was lost after commit',status:0}};
      return {data:{ok:true,case:exchange,idempotent:false},error:null};
    }
    if(name==='exchange_case_transition'){
      const exchange=data.exchanges.find(row=>row.id===args.p_case_id&&(row.user_a===active().id||row.user_b===active().id));
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      if(data.events.some(row=>row.case_id===exchange.id&&row.idempotency_key===args.p_idempotency_key))return {data:{ok:true,case:exchange,idempotent:true},error:null};
      if(exchange.state_version!==args.p_expected_version)return {data:null,error:{message:'The exchange changed. Refresh and retry.'}};
      const action=args.p_action;
      if(action==='accept'){
        if(active().id!==exchange.recipient_id)return {data:null,error:{message:'Only the recipient can accept'}};
        if(itemReserved(exchange.item_a,exchange.id)||itemReserved(exchange.item_b,exchange.id))return {data:null,error:{message:'One of these LEGO sets is already reserved in another active exchange'}};
        exchange.state='ACCEPTED';
      }else if(action==='decline')exchange.state='DECLINED';
      else if(action==='withdraw')exchange.state='WITHDRAWN';
      else if(action==='cancel')exchange.state='CANCELLED';
      else if(action==='early_return')exchange.state='EARLY_RETURN';
      else if(action==='propose_meetup'){
        exchange.state='MEETUP_PLANNING';exchange.meetup_proposed_by=active().id;
        exchange.meetup_venue_name=args.p_payload?.venue_name;exchange.meetup_venue_area=args.p_payload?.venue_area;exchange.meetup_at=args.p_payload?.meetup_at;
      }
      else if(action==='accept_meetup'){exchange.state='MEETUP_CONFIRMED';exchange.meetup_accepted_by=active().id}
      else if(action==='safety_ack'){const suffix=active().id===exchange.user_a?'a':'b';exchange[`safety_ack_${suffix}_at`]=NOW;if(exchange.safety_ack_a_at&&exchange.safety_ack_b_at)exchange.state='INSPECTION'}
      else if(action==='arrive'){const suffix=active().id===exchange.user_a?'a':'b';exchange[`arrived_${suffix}_at`]=NOW}
      else if(action==='inspect'){const suffix=active().id===exchange.user_a?'a':'b';if(!exchange.arrived_a_at||!exchange.arrived_b_at)return {data:null,error:{message:'Both collectors must arrive before inspection approval'}};exchange[`inspected_${suffix}_at`]=NOW;if(exchange.inspected_a_at&&exchange.inspected_b_at)exchange.state='HANDOFF_PENDING'}
      else if(action==='handoff'){
        if(exchange.state!=='HANDOFF_PENDING')return {data:null,error:{message:'Handoff can only be confirmed while the exchange is pending handoff'}};
        const suffix=active().id===exchange.user_a?'a':'b';
        if(exchange[`handoff_${suffix}_at`])return {data:{ok:true,case:exchange,idempotent:true},error:null};
        exchange[`handoff_${suffix}_at`]=NOW;
        if(exchange.handoff_a_at&&exchange.handoff_b_at){
          exchange.handoff_at=NOW;
          exchange.state='ACTIVE';
          const days=Number(exchange.duration_days)>0?Number(exchange.duration_days):3;
          exchange.return_due_at=new Date(Date.parse(NOW)+days*DAY_MS).toISOString();
        }
      }
      else if(action==='propose_return'){
        exchange.state='RETURN_PLANNING';exchange.return_proposed_by=active().id;
        exchange.return_venue_name=args.p_payload?.venue_name;exchange.return_venue_area=args.p_payload?.venue_area;exchange.return_meetup_at=args.p_payload?.meetup_at;
      }
      else if(action==='accept_return'){exchange.state='RETURN_INSPECTION';exchange.return_accepted_by=active().id}
      else if(action==='return_arrive'){const suffix=active().id===exchange.user_a?'a':'b';exchange[`return_arrived_${suffix}_at`]=NOW}
      else if(action==='return_inspect'){const suffix=active().id===exchange.user_a?'a':'b';if(!exchange.return_arrived_a_at||!exchange.return_arrived_b_at)return {data:null,error:{message:'Both collectors must arrive before return inspection'}};exchange[`return_inspected_${suffix}_at`]=NOW}
      else return {data:null,error:{message:`Unsupported isolated transition: ${action}`}};
      exchange.state_version+=1;exchange.updated_at=NOW;
      data.events.push({id:`event-${data.events.length+1}`,case_id:exchange.id,event_type:`exchange_${action}`,resulting_state:exchange.state,actor_id:active().id,idempotency_key:args.p_idempotency_key,created_at:NOW});
      persist();if(state.lostResponses.delete(name))return {data:null,error:{message:'Network response was lost after commit',status:0}};return {data:{ok:true,case:exchange},error:null};
    }
    if(name==='cancel_exchange_case_before_mutual_handoff'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      if(args.p_idempotency_key){
        const prior=data.events.find(row=>row.case_id===exchange.id&&row.event_type==='exchange_cancelled'&&row.idempotency_key===args.p_idempotency_key);
        if(prior)return {data:{ok:true,case:{...exchange},idempotent:true},error:null};
      }
      if(exchange.handoff_at||(exchange.handoff_a_at&&exchange.handoff_b_at))return {data:null,error:{message:'This exchange can no longer be cancelled after mutual handoff'}};
      if(!CANCELLABLE_STATES.includes(exchange.state))return {data:null,error:{message:'This exchange can no longer be cancelled in its current state'}};
      if(exchange.state_version!==args.p_expected_version)return {data:null,error:{message:'The exchange changed. Refresh and retry.'}};
      exchange.state='CANCELLED';
      exchange.state_version+=1;
      exchange.cancelled_at=NOW;
      exchange.cancelled_reason=args.p_reason===undefined?null:args.p_reason;
      exchange.exchange_review_required=false;
      restoreItemAvailability(exchange,'a');
      restoreItemAvailability(exchange,'b');
      exchange.updated_at=NOW;
      const event=pushEvent(exchange,'exchange_cancelled',args.p_idempotency_key);
      notify(otherParticipant(exchange),'exchange_cancelled','Exchange cancelled','The exchange was cancelled before mutual handoff.',exchange);
      persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,case:{...exchange},event,idempotent:false},error:null};
    }
    if(name==='send_collector_message'){
      const prior=data.directMessages.find(row=>row.sender_id===active().id&&row.client_message_key===args.p_idempotency_key);
      if(prior)return {data:{ok:true,message:prior,idempotent:true},error:null};
      const message={id:`direct-${data.directMessages.length+1}`,sender_id:active().id,recipient_id:args.p_recipient_id,exchange_id:null,body:args.p_body,client_message_key:args.p_idempotency_key,created_at:NOW};
      data.directMessages.push(message);persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,message,idempotent:false},error:null};
    }
    if(name==='send_exchange_case_message'){
      const prior=data.messages.find(row=>row.sender_id===active().id&&row.idempotency_key===args.p_idempotency_key);
      if(prior)return {data:{ok:true,message:prior,idempotent:true},error:null};
      const exchange=data.exchanges.find(row=>row.id===args.p_case_id&&(row.user_a===active().id||row.user_b===active().id));
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      const other=exchange.user_a===active().id?exchange.user_b:exchange.user_a;
      const message={id:`message-${data.messages.length+1}`,case_id:exchange.id,sender_id:active().id,recipient_id:other,body:args.p_body,idempotency_key:args.p_idempotency_key,created_at:NOW};data.messages.push(message);
      data.notifications.push({id:`notification-${data.notifications.length+1}`,user_id:other,kind:'exchange_message',title:'New exchange message',body:'The other collector sent a message.',exchange_case_id:exchange.id,exchange_case_message_id:message.id,created_at:NOW});
      persist();if(state.lostResponses.delete(name))return {data:null,error:{message:'Network response was lost after commit',status:0}};return {data:{ok:true,message,idempotent:false},error:null};
    }
    if(name==='submit_exchange_case_review'){
      const exchange=data.exchanges.find(row=>row.id===args.p_case_id&&(row.user_a===active().id||row.user_b===active().id));
      if(!exchange||exchange.state!=='COMPLETED')return {data:null,error:{message:'Reviews are available only after completion'}};
      if(data.reviews.some(row=>row.case_id===exchange.id&&row.reviewer_id===active().id))return {data:null,error:{message:'You already reviewed this exchange'}};
      const other=exchange.user_a===active().id?exchange.user_b:exchange.user_a,review={id:`review-${data.reviews.length+1}`,case_id:exchange.id,reviewer_id:active().id,reviewee_id:other,rating:args.p_rating,comment:args.p_comment,created_at:NOW};data.reviews.push(review);
      const ratings=data.reviews.filter(row=>row.reviewee_id===other),profile=data.profiles.find(row=>row.id===other);profile.review_count=ratings.length;profile.rating=ratings.reduce((sum,row)=>sum+row.rating,0)/ratings.length;persist();return {data:{ok:true,review},error:null};
    }
    if(name==='report_exchange_case_issue'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      if(args.p_idempotency_key){
        const prior=data.issues.find(row=>row.case_id===exchange.id&&row.idempotency_key===args.p_idempotency_key);
        if(prior)return {data:{ok:true,issue:prior,idempotent:true},error:null};
      }
      if(!exchange.handoff_at)return {data:null,error:{message:'Issues can only be reported after mutual handoff'}};
      const category=String(args.p_category||'');
      if(!ISSUE_CATEGORIES.includes(category))return {data:null,error:{message:`Unsupported issue category: ${category||'empty'}`}};
      const other=otherParticipant(exchange);
      const issue={id:`issue-${data.issues.length+1}`,case_id:exchange.id,reported_by:active().id,subject_user_id:other,category,description:args.p_description===undefined?'':args.p_description,evidence:args.p_evidence===undefined?null:args.p_evidence,status:'open',ack_reporter_at:null,ack_subject_at:null,resolved_at:null,unresolved_at:null,idempotency_key:args.p_idempotency_key===undefined?null:args.p_idempotency_key,created_at:NOW,updated_at:NOW};
      data.issues.push(issue);
      pushEvent(exchange,'exchange_issue_reported',args.p_idempotency_key);
      notify(other,'exchange_issue_reported','Issue reported','The other collector reported an issue with this exchange.',exchange);
      persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,issue,idempotent:false},error:null};
    }
    if(name==='respond_exchange_case_issue'){
      const issue=issueById(args.p_issue_id);
      const exchange=issue?findCase(issue.case_id):null;
      if(!issue||!isParticipant(exchange))return {data:null,error:{message:'Exchange case issue not found'}};
      if(args.p_idempotency_key){
        const prior=data.issueResponses.find(row=>row.issue_id===issue.id&&row.idempotency_key===args.p_idempotency_key);
        if(prior)return {data:{ok:true,response:prior,idempotent:true},error:null};
      }
      if(!String(args.p_body===undefined?'':args.p_body).trim())return {data:null,error:{message:'Response cannot be blank'}};
      const response={id:`issue-response-${data.issueResponses.length+1}`,issue_id:issue.id,responder_id:active().id,body:args.p_body===undefined?'':args.p_body,evidence:args.p_evidence===undefined?null:args.p_evidence,idempotency_key:args.p_idempotency_key===undefined?null:args.p_idempotency_key,created_at:NOW};
      data.issueResponses.push(response);
      const recipient=active().id===issue.reported_by?issue.subject_user_id:issue.reported_by;
      notify(recipient,'exchange_issue_response','Issue response','The other collector responded to an exchange issue.',exchange);
      persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,response,idempotent:false},error:null};
    }
    if(name==='set_exchange_case_issue_status'){
      const issue=issueById(args.p_issue_id);
      const exchange=issue?findCase(issue.case_id):null;
      if(!issue||!isParticipant(exchange))return {data:null,error:{message:'Exchange case issue not found'}};
      const action=String(args.p_action||'');
      if(action==='resolve'){
        if(active().id===issue.reported_by)issue.ack_reporter_at=NOW;
        else if(active().id===issue.subject_user_id)issue.ack_subject_at=NOW;
        else return {data:null,error:{message:'Only participants can update this issue'}};
        if(issue.ack_reporter_at&&issue.ack_subject_at){issue.status='resolved';issue.resolved_at=NOW;issue.unresolved_at=null}
      }else if(action==='unresolved'){
        issue.status='unresolved';issue.unresolved_at=NOW;issue.unresolved_by=active().id;
      }else return {data:null,error:{message:`Unsupported issue status action: ${action}`}};
      issue.updated_at=NOW;persist();
      return {data:{ok:true,issue},error:null};
    }
    if(name==='request_exchange_case_support'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      if(args.p_idempotency_key){
        const prior=data.supportRequests.find(row=>row.case_id===exchange.id&&row.idempotency_key===args.p_idempotency_key);
        if(prior)return {data:{ok:true,support_request:prior,idempotent:true},error:null};
      }
      const category=String(args.p_category||'');
      if(!SUPPORT_CATEGORIES.includes(category))return {data:null,error:{message:`Unsupported support category: ${category||'empty'}`}};
      if(!String(args.p_note===undefined?'':args.p_note).trim())return {data:null,error:{message:'Support note cannot be blank'}};
      const supportRequest={id:`support-${data.supportRequests.length+1}`,case_id:exchange.id,requested_by:active().id,category,note:args.p_note,case_state_at_request:exchange.state,case_state_version_at_request:exchange.state_version,idempotency_key:args.p_idempotency_key===undefined?null:args.p_idempotency_key,created_at:NOW};
      data.supportRequests.push(supportRequest);
      persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,support_request:supportRequest,idempotent:false},error:null};
    }
    if(name==='exchange_case_overdue_days'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      if(!exchange.return_due_at)return {data:0,error:null};
      const due=Date.parse(exchange.return_due_at);
      if(!Number.isFinite(due))return {data:0,error:null};
      let asOf=Date.parse(args.p_as_of===undefined||args.p_as_of===null||args.p_as_of===''?NOW:args.p_as_of);
      if(!Number.isFinite(asOf))asOf=Date.parse(NOW);
      return {data:Math.max(0,Math.ceil((asOf-due)/DAY_MS)),error:null};
    }
    if(name==='submit_peer_exchange_review'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      const key=args.p_idempotency_key===undefined?null:args.p_idempotency_key;
      if(key){
        const prior=data.peerReviews.find(row=>row.idempotency_key===key);
        if(prior)return {data:{ok:true,review:prior,idempotent:true},error:null};
      }
      if(exchange.state!=='COMPLETED'||!exchange.handoff_at)return {data:null,error:{message:'Peer reviews are available only after a completed exchange'}};
      if(data.peerReviews.some(row=>row.case_id===exchange.id&&row.reviewer_id===active().id))return {data:null,error:{message:'You already submitted a peer review for this exchange'}};
      const dimensions={};
      for(const dimension of REVIEW_DIMENSIONS){
        const value=Number(args[`p_${dimension}`]);
        if(!Number.isInteger(value)||value<1||value>5)return {data:null,error:{message:`${dimension} must be an integer from 1 to 5`}};
        dimensions[dimension]=value;
      }
      const wouldExchangeAgain=typeof args.p_would_exchange_again==='boolean'?args.p_would_exchange_again:Boolean(args.p_would_exchange_again);
      const review={id:`peer-review-${data.peerReviews.length+1}`,case_id:exchange.id,reviewer_id:active().id,reviewee_id:otherParticipant(exchange),...dimensions,would_exchange_again:wouldExchangeAgain,comment:args.p_comment===undefined?'':args.p_comment,reveal_after:futureIso(14),idempotency_key:key,created_at:NOW};
      data.peerReviews.push(review);
      persist();const lost=lostAfterCommit(name);if(lost)return lost;
      return {data:{ok:true,review,idempotent:false},error:null};
    }
    if(name==='get_peer_exchange_reviews'){
      const exchange=findParticipantCase(args.p_case_id);
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
      const reviews=data.peerReviews.filter(row=>row.case_id===exchange.id);
      if(reviews.length>=2)return {data:reviews.map(row=>({...row})),error:null};
      if(reviews.length===0)return {data:[],error:null};
      const reveals=reviews.map(row=>Date.parse(row.reveal_after)).filter(value=>Number.isFinite(value)).sort((a,b)=>a-b);
      if(reveals.length===0||reveals[0]>Date.parse(NOW))return {data:reviews.filter(row=>row.reviewer_id===active().id).map(row=>({...row})),error:null};
      return {data:reviews.map(row=>({...row})),error:null};
    }
    if(name==='exchange_peer_reputation_summary'){
      if(signedOut)return {data:null,error:{message:'Authentication required'}};
      const userId=String(args?.p_user_id||args?.p_profile_id||active().id);
      const cases=data.exchanges.filter(row=>row.user_a===userId||row.user_b===userId);
      const completed=cases.filter(row=>row.state==='COMPLETED');
      const tracked=cases.filter(row=>row.return_due_at);
      const onTime=tracked.filter(row=>{
        const due=Date.parse(row.return_due_at);
        const completedAt=Date.parse(row.returned_at||row.return_completed_at||(row.state==='COMPLETED'?row.updated_at:''));
        return Number.isFinite(due)&&Number.isFinite(completedAt)&&completedAt<=due;
      });
      const caseIds=new Set(cases.map(row=>row.id));
      const unresolved=data.issues.filter(issue=>issue.subject_user_id===userId&&issue.status==='unresolved'&&(issue.unresolved_by===userId||data.issueResponses.some(response=>response.issue_id===issue.id&&response.responder_id===userId)));
      const now=Date.parse(NOW);
      const revealed=data.peerReviews.filter(row=>row.reviewee_id===userId&&(Number.isFinite(Date.parse(row.reveal_after))&&Date.parse(row.reveal_after)<=now||data.peerReviews.some(counterpart=>counterpart.case_id===row.case_id&&counterpart.reviewer_id!==row.reviewer_id)));
      const again=revealed.filter(row=>row.would_exchange_again===true);
      const counterparties=new Set();
      for(const row of cases){const other=row.user_a===userId?row.user_b:row.user_a;if(other&&other!==userId)counterparties.add(other)}
      return {data:{
        user_id:userId,
        completed_exchanges:completed.length,
        return_tracked_exchanges:tracked.length,
        tracked_returns:tracked.length,
        on_time_returns:onTime.length,
        on_time_return_percentage:tracked.length?Math.round((onTime.length/tracked.length)*100):null,
        unresolved_issue_count:unresolved.length,
        would_exchange_again_percentage:revealed.length?Math.round((again.length/revealed.length)*100):null,
        unique_counterparties:counterparties.size
      },error:null};
    }
    if(name==='bc_founder_status')return {data:{my_is_founder:true,my_number:7},error:null};
    if(name==='bc_liquidity_status')return {data:{collection_count:visibleRows('collection_items',{filters:[],ins:[]}).length,exchangeable_count:data.collection.filter(row=>row.user_id===active().id&&row.available_for_exchange).length,wishlist_count:data.wishlist.filter(row=>row.user_id===active().id).length,referral_claims:0,liquidity_readiness:80},error:null};
    if(name==='bc_membership_status')return {data:{founding_remaining:94,early_remaining:900,my_tier:'founding',my_number:7,my_access:'free_lifetime',beta_free:true,my_city:'Bengaluru',my_country:'India'},error:null};
    if(name==='bc_record_auth_provider'||name==='bc_claim_referral')return {data:true,error:null};
    if(name==='bc_my_referral_code')return {data:'THREEUSER',error:null};
    return {data:null,error:null};
  },
  channel:()=>{const channel={handler:null,on(_type,_filter,handler){channel.handler=handler;realtimeHandlers.push(handler);return channel},subscribe(callback){queueMicrotask(()=>callback?.('SUBSCRIBED'));return channel},unsubscribe(){const index=realtimeHandlers.indexOf(channel.handler);if(index>=0)realtimeHandlers.splice(index,1)}};return channel},
  removeChannel:async channel=>channel?.unsubscribe?.(),
  storage:{from:bucket=>({getPublicUrl:path=>({data:{publicUrl:`https://example.invalid/${bucket}/${path}`}}),upload:async path=>({data:{path},error:null}),remove:async()=>({data:null,error:null}),createSignedUrl:async path=>({data:{signedUrl:`https://example.invalid/${bucket}/${path}`},error:null})})}
};
window.__bcClientCreateCount=0;
window.supabase={createClient:()=>{window.__bcClientCreateCount++;return db}};
})();
