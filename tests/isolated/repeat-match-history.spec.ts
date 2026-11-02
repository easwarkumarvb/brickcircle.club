import fs from 'node:fs';
import {test,expect} from './fixtures';
import type {BrowserContext,Page} from '@playwright/test';

const mockSource=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const actors={
  easwar:{id:'00000000-0000-4000-8000-000000000101',name:'Easwar'},
  ramya:{id:'00000000-0000-4000-8000-000000000102',name:'Ramya'},
  dhyan:{id:'00000000-0000-4000-8000-000000000103',name:'Dhyan'}
};
const stamp=(day:number)=>new Date(Date.UTC(2024,0,day)).toISOString();
const caseId=(n:number)=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type HistoryCase={
  id:string;user_a:string;user_b:string;item_a:string;item_b:string;state:string;
  completed_at?:string|null;handoff_at?:string|null;created_at:string;updated_at?:string
};
type MockNotification={
  id:string;user_id:string;kind:string;title:string|null;body:string|null;
  entity_type:string|null;entity_id:string|null;metadata:Record<string,unknown>;
  read_at:string|null;created_at:string
};

function seed(){
  const [a,b,c]=Object.values(actors);
  return {
    profiles:[a,b,c].map(actor=>({id:actor.id,display_name:actor.name,country:'India',city:'Bengaluru',adult_confirmed_at:stamp(1),rating:0,review_count:0})),
    collection:[
      {id:'item-a',user_id:a.id,set_number:'42172-1',condition:'Good',completeness:100,owner_photo_path:'a/front.jpg',available_for_exchange:true,created_at:stamp(1)},
      {id:'item-b',user_id:b.id,set_number:'42143-1',condition:'Good',completeness:100,owner_photo_path:'b/front.jpg',available_for_exchange:true,created_at:stamp(1)},
      {id:'item-c',user_id:c.id,set_number:'42115-1',condition:'Good',completeness:100,owner_photo_path:'c/front.jpg',available_for_exchange:true,created_at:stamp(1)}
    ],
    wishlist:[
      {id:'wish-a-b',user_id:a.id,set_number:'42143-1'},
      {id:'wish-a-c',user_id:a.id,set_number:'42115-1'},
      {id:'wish-b-a',user_id:b.id,set_number:'42172-1'},
      {id:'wish-c-a',user_id:c.id,set_number:'42172-1'}
    ],
    exchanges:[
      ...Array.from({length:85},(_,index):HistoryCase=>({
      id:caseId(index+1),user_a:a.id,user_b:b.id,item_a:'item-a',item_b:'item-b',
      state:'COMPLETED',completed_at:stamp(index+1),handoff_at:stamp(index+1),
      created_at:stamp(index+1),updated_at:stamp(index+1)
      })),
      {id:caseId(900),user_a:a.id,user_b:b.id,item_a:'item-a',item_b:'item-b',state:'CANCELLED',created_at:stamp(90)},
      {id:caseId(901),user_a:a.id,user_b:b.id,item_a:'other-item-a',item_b:'other-item-b',state:'PROPOSED',created_at:stamp(91)}
    ],
    events:[],notifications:[] as MockNotification[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]
  };
}

function seedManyPeers(){
  const database=seed();
  for(let index=0;index<51;index++){
    const id=`00000000-0000-4000-8000-${String(200+index).padStart(12,'0')}`;
    database.profiles.push({id,display_name:`Repeat Peer ${index}`,country:'India',city:'Bengaluru',adult_confirmed_at:stamp(1),rating:0,review_count:0});
    database.collection.push({id:`extra-item-${index}`,user_id:id,set_number:'42143-1',condition:'Good',completeness:100,owner_photo_path:`extra/${index}.jpg`,available_for_exchange:true,created_at:stamp(1)});
    database.wishlist.push({id:`extra-wish-${index}`,user_id:id,set_number:'42172-1'});
  }
  return database;
}

async function openActor(context:BrowserContext,actor:keyof typeof actors,database:any,extra?:{delay?:boolean;fail?:boolean}):Promise<Page>{
  await context.addInitScript(({actor,database,extra})=>{
    if(!sessionStorage.getItem('bc_repeat_fixture_seeded')){
      localStorage.setItem('bc_three_user_actor',actor);
      localStorage.setItem('bc_three_user_db',JSON.stringify(database));
      sessionStorage.setItem('bc_three_user_initialized','1');
      sessionStorage.setItem('bc_repeat_fixture_seeded','1');
      if(extra?.delay||extra?.fail)sessionStorage.setItem('bc_repeat_history_test',JSON.stringify(extra));
    }
  },{actor,database,extra});
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',route=>route.fulfill({contentType:'application/javascript',body:mockSource}));
  const page=await context.newPage();
  await page.goto('/v2.html?isolated=three-user#matches');
  return page;
}

test('both match participants see their shared history, peer history stays private, and old pages are reachable',async({browser})=>{
  const database=seed(),aContext=await browser.newContext(),a=await openActor(aContext,'easwar',database);
  const bCard=a.locator('article[data-requested-item="item-b"]'),cCard=a.locator('article[data-requested-item="item-c"]');
  await expect(bCard).toContainText('You’ve exchanged before · 85 shared exchanges');
  await expect(cCard).toContainText('New reciprocal match');
  await expect(cCard).not.toContainText('You’ve exchanged before');
  const details=bCard.locator('[data-shared-history-peer] details');
  await details.locator('summary').click();
  await expect(details.locator('ol li')).toHaveCount(3);
  for(let page=0;page<5;page++){
    if(!(await details.evaluate((element:HTMLDetailsElement)=>element.open)))await details.locator('summary').click();
    const more=bCard.locator('[data-shared-history-more]');
    if(!(await more.count()))break;
    await more.click();
  }
  await expect(details.locator('ol li')).toHaveCount(85);
  await expect(bCard).toContainText('You’ve exchanged before');
  await aContext.close();

  const bContext=await browser.newContext(),b=await openActor(bContext,'ramya',database);
  const reverseCard=b.locator('article[data-requested-item="item-a"]');
  await expect(reverseCard).toContainText('You’ve exchanged before · 85 shared exchanges');
  const reverseHistory=reverseCard.locator('[data-shared-history-peer] details');
  await reverseHistory.locator('summary').click();
  await expect(reverseHistory.locator('ol')).toContainText('Ferrari Daytona SP3 ⇄ McLaren P1');
  await reverseCard.locator('[data-propose]').click();
  const proposal=b.getByRole('dialog',{name:'Propose an exchange'});
  await expect(proposal).toContainText('You’ve exchanged before · 85 shared exchanges');
  await bContext.close();
});

test('history loading and errors are not presented as new; retry and account switching remain isolated',async({browser})=>{
  const database=seed(),context=await browser.newContext(),page=await openActor(context,'easwar',database,{delay:true,fail:true});
  const card=page.locator('article[data-requested-item="item-b"]');
  await expect(card).toContainText('Checking shared exchange history');
  await expect(card).toContainText('Shared exchange history unavailable');
  await expect(card).not.toContainText('New reciprocal match');
  await page.evaluate(()=> (window as any).__bcThreeUser.failedRpcs.delete('shared_exchange_history'));
  await card.getByRole('button',{name:'Retry history check'}).click();
  await expect(card).toContainText('You’ve exchanged before · 85 shared exchanges');
  await page.evaluate(()=>{sessionStorage.removeItem('bc_repeat_history_test');(window as any).__bcThreeUser.switchActor('dhyan')});
  await page.reload();
  const aCard=page.locator('article[data-requested-item="item-a"]');
  await expect(aCard).toContainText('New reciprocal match');
  await expect(aCard).not.toContainText('You’ve exchanged before');
  await context.close();
});

test('proposal context reloads history when navigation supersedes the match-card request',async({browser})=>{
  const database=seed(),context=await browser.newContext(),page=await openActor(context,'easwar',database,{delay:true});
  const card=page.locator('article[data-requested-item="item-b"]');
  await card.getByRole('button',{name:'View & propose'}).click();
  const proposal=page.getByRole('dialog',{name:'Propose an exchange'});
  await expect(proposal).toContainText('You’ve exchanged before · 85 shared exchanges');
  const historyCalls=await page.evaluate(()=>(
    (window as any).__bcThreeUser.rpcArgs.filter((call:any)=>call.name==='shared_exchange_history').length
  ));
  expect(historyCalls).toBeGreaterThanOrEqual(2);
  await context.close();
});

test('legacy reciprocal notifications without history metadata use neutral lifecycle copy',async({browser})=>{
  const database=seed(),a=actors.easwar;
  database.notifications.push({
    id:'legacy-match-notification',user_id:a.id,kind:'reciprocal_match',
    title:'You have a new local BrickCircle match',body:'A nearby collector has a new match.',
    entity_type:'reciprocal_match',entity_id:'legacy-match-event',metadata:{},
    read_at:null,created_at:stamp(92)
  });
  const context=await browser.newContext(),page=await openActor(context,'easwar',database);
  const notice=page.locator('#bc-exchange-lifecycle-notice');
  await expect(notice).toContainText('Local match');
  await expect(notice).toContainText('A nearby collector has a reciprocal LEGO match with you.');
  await expect(notice).not.toContainText('new local BrickCircle match');
  await context.close();
});

test('match history requests stay within the server peer-batch limit',async({browser})=>{
  const database=seedManyPeers(),context=await browser.newContext(),page=await openActor(context,'easwar',database);
  await expect(page.locator('.bc-match-premium')).toHaveCount(53);
  const peerBatches=await page.evaluate(()=>(
    (window as any).__bcThreeUser.rpcArgs
      .filter((call:any)=>call.name==='shared_exchange_history')
      .map((call:any)=>call.args.p_peer_ids.length)
  ));
  expect(peerBatches).toEqual([50,3]);
  await context.close();
});
