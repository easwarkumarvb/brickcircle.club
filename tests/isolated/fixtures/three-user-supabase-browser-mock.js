/* Shared deterministic Easwar/Ramya/Dhyan Supabase substitute. Loopbacklk? */
(()=>{
'use strict';
const NOW='2026-09-09T12:00:00.000Z';
const STORE='bc_three_user_db';
const ACTOR='bc_three_user_actor';
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
function fresh(){
  return {
    profiles:Object.values(actors).map(actor=>({id:actor.id,display_name:actor.name,email:actor.email,country:'India',city:'Bengaluru',bio:'Isolated reliability fixture',avatar_url:null,rating:0,review_count:0,member_since:NOW,created_at:NOW,adult_confirmed_at:NOW,adult_confirmation_version:'2026-09-11'})),
    collection:[],wishlist:[],exchanges:[],events:[],notifications:[],messages:[]
  };
}
let data;
try{data=JSON.parse(localStorage.getItem(STORE)||'null')||fresh()}catch(_){data=fresh()}
let actorKey=localStorage.getItem(ACTOR)||'easwar';
let signedOut=false;
const active=()=>actors[actorKey];
const user=()=>({id:active().id,email:active().email,created_at:NOW,app_metadata:{provider:'email'},identities:[{provider:'email'}]});
const persist=()=>localStorage.setItem(STORE,JSON.stringify(data));
const state={
  actors,sets,rpcCalls:[],get actor(){return actorKey},get data(){return data},
  reset(){data=fresh();actorKey='easwar';state.rpcCalls.length=0;localStorage.setItem(ACTOR,actorKey);persist()},
  persist,
  switchActor(next){if(!actors[next])throw new Error(`Unknown actor ${next}`);actorKey=next;signedOut=false;localStorage.setItem(ACTOR,next)}
};
window.__bcThreeUser=state;
window.__bcIsolated=state;
window.BC_LOCATIONS={India:['Bengaluru','Mumbai','Delhi']};

const authListeners=[];
const emitAuth=(event,session)=>authListeners.forEach(listener=>listener(event,session));
const realtimeHandlers=[];
function visibleRows(table,query){
  let rows=[];
  if(table==='profiles')rows=data.profiles;
  if(table==='public_profiles')rows=data.profiles;
  if(table==='collection_items')rows=data.collection;
  if(table==='wishlists')rows=data.wishlist;
  if(table==='exchange_cases')rows=data.exchanges.filter(row=>row.user_a===active().id||row.user_b===active().id);
  if(table==='exchange_case_messages')rows=data.messages.filter(row=>data.exchanges.some(exchange=>exchange.id===row.case_id&&(exchange.user_a===active().id||exchange.user_b===active().id)));
  if(table==='exchange_case_events')rows=data.events.filter(row=>data.exchanges.some(exchange=>exchange.id===row.case_id&&(exchange.user_a===active().id||exchange.user_b===active().id)));
  if(table==='notifications')rows=data.notifications.filter(row=>row.user_id===active().id);
  if(table==='messages')rows=data.messages.filter(row=>row.sender_id===active().id||row.recipient_id===active().id);
  if(table==='lego_sets')rows=sets;
  if(table==='collection_items'&&!query.ins.some(([key])=>key==='id'))rows=rows.filter(row=>row.user_id===active().id);
  for(const [key,value] of query.filters)rows=rows.filter(row=>row[key]===value);
  for(const [key,values] of query.ins)rows=rows.filter(row=>values.includes(row[key]));
  return rows.map(row=>table==='collection_items'||table==='wishlists'?{...row,lego_sets:sets.find(set=>set.set_number===row.set_number)}:{...row});
}
function chain(table){
  const query={filters:[],ins:[],mode:'select',patch:null,selected:false,
    select(){query.selected=true;return query},eq(key,value){query.filters.push([key,value]);return query},in(key,values){query.ins.push([key,values]);return query},or(){return query},order(){return query},limit(){return query},range(){return query},is(key,value){query.filters.push([key,value]);return query},
    update(patch){query.mode='update';query.patch=patch;return query},delete(){query.mode='delete';return query},
    upsert(patch){const profile=data.profiles.find(row=>row.id===patch.id);if(profile)Object.assign(profile,patch);else data.profiles.push({...patch,created_at:NOW});persist();return Promise.resolve({data:[patch],error:null})},
    insert(value){
      const rows=Array.isArray(value)?value:[value];
      for(const row of rows){
        if(table==='collection_items'&&!data.collection.some(item=>item.user_id===row.user_id&&item.set_number===row.set_number))data.collection.push({id:`collection-${data.collection.length+1}`,...row,available_for_exchange:row.available_for_exchange||false,created_at:NOW});
        if(table==='wishlists'&&!data.wishlist.some(item=>item.user_id===row.user_id&&item.set_number===row.set_number))data.wishlist.push({id:`wishlist-${data.wishlist.length+1}`,...row,priority:row.priority||3,created_at:NOW});
        if(table==='exchange_case_messages')data.messages.push({id:`message-${data.messages.length+1}`,...row,created_at:NOW});
      }
      persist();return Promise.resolve({data:null,error:null});
    },
    maybeSingle(){return Promise.resolve({data:visibleRows(table,query)[0]||null,error:null})},
    then(resolve){
      const matches=row=>query.filters.every(([key,value])=>row[key]===value)&&query.ins.every(([key,values])=>values.includes(row[key]));
      let result=visibleRows(table,query);
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
const db={
  auth:{
    getSession:async()=>({data:{session:signedOut?null:{user:user()}}}),getUser:async()=>signedOut?{data:{user:null},error:{name:'AuthSessionMissingError',message:'Auth session missing!'}}:{data:{user:user()},error:null},
    onAuthStateChange:listener=>{authListeners.push(listener);return {data:{subscription:{unsubscribe(){const index=authListeners.indexOf(listener);if(index>=0)authListeners.splice(index,1)}}}}},
    signOut:async()=>{signedOut=true;emitAuth('SIGNED_OUT',null);return {error:null}},signInWithPassword:async()=>{signedOut=false;emitAuth('SIGNED_IN',{user:user()});return {error:null}},signUp:async()=>({data:{session:null},error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({data:{user:user()},error:null}),signInWithOAuth:async()=>({data:{url:location.href},error:null})
  },
  from:chain,
  rpc:async(name,args)=>{
    state.rpcCalls.push(name);
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
      const offered=data.collection.find(row=>row.id===args.p_offered_item_id&&row.user_id===active().id&&row.available_for_exchange);
      const requested=data.collection.find(row=>row.id===args.p_requested_item_id&&row.user_id!==active().id&&row.available_for_exchange);
      if(!offered||!requested)return {data:null,error:{message:'This reciprocal match is no longer available'}};
      const match=findMatches().find(row=>row.offered_item===offered.id&&row.requested_item===requested.id);
      if(!match)return {data:null,error:{message:'This reciprocal match is no longer available'}};
      const existing=data.exchanges.find(row=>row.proposer_id===active().id&&row.recipient_id===requested.user_id&&row.item_a===offered.id&&row.item_b===requested.id&&row.state==='PROPOSED');
      if(existing)return {data:{ok:true,case:existing,idempotent:true},error:null};
      const exchange={id:`case-${data.exchanges.length+1}`,user_a:active().id,user_b:requested.user_id,proposer_id:active().id,recipient_id:requested.user_id,item_a:offered.id,item_b:requested.id,duration_days:args.p_duration_days,opening_message:args.p_message,state:'PROPOSED',state_version:1,created_at:NOW,updated_at:NOW};data.exchanges.push(exchange);
      const event={id:`event-${data.events.length+1}`,case_id:exchange.id,event_type:'exchange_proposed',resulting_state:'PROPOSED',actor_id:active().id,created_at:NOW};data.events.push(event);
      const note={id:`notification-${data.notifications.length+1}`,user_id:exchange.recipient_id,kind:'exchange_proposed',title:'New exchange proposal',body:`${active().name} proposed an exchange with you.`,actor_user_id:exchange.proposer_id,entity_type:'exchange_case_event',entity_id:event.id,exchange_case_id:exchange.id,metadata:{exchange_case_id:exchange.id,route:`#exchange/${exchange.id}`},read_at:null,created_at:NOW};data.notifications.push(note);persist();
      if(note.user_id===active().id)realtimeHandlers.forEach(handler=>handler({eventType:'INSERT',new:note,old:{}}));
      return {data:{ok:true,case:exchange,idempotent:false},error:null};
    }
    if(name==='exchange_case_transition'){
      const exchange=data.exchanges.find(row=>row.id===args.p_case_id&&(row.user_a===active().id||row.user_b===active().id));
      if(!exchange)return {data:null,error:{message:'Exchange case not found'}};
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
      else return {data:null,error:{message:`Unsupported isolated transition: ${action}`}};
      exchange.state_version+=1;exchange.updated_at=NOW;
      data.events.push({id:`event-${data.events.length+1}`,case_id:exchange.id,event_type:`exchange_${action}`,resulting_state:exchange.state,actor_id:active().id,created_at:NOW});
      persist();return {data:{ok:true,case:exchange},error:null};
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
