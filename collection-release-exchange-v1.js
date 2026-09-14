/* BrickCircle — release a reserved set directly from My Sets. */
(()=>{
  'use strict';

  const ACTIVE_STATES=new Set(['accepted','swap_active','disputed']);
  const CANCELLABLE_STATES=new Set(['accepted']);
  const checkedItems=new Set();

  function db(){return window.BC_SUPABASE||null}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function notify(message){
    const old=document.querySelector('.bc-release-toast');old?.remove();
    const el=document.createElement('div');el.className='bc-toast bc-release-toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3000);
  }
  function setBusy(button,busy,label){button.disabled=busy;button.textContent=busy?'Releasing…':label}
  function exchangeCopy(state){
    if(state==='swap_active')return 'This set is already in a temporary exchange. Complete the return before it can be released.';
    if(state==='disputed')return 'This set is tied to an exchange with an open issue. Resolve the issue before releasing it.';
    return 'This set is reserved in an accepted exchange.';
  }
  function openExchange(id){location.hash=`#exchange/${encodeURIComponent(id)}`}

  async function activeExchangeForItem(itemId){
    const client=db();if(!client)return null;
    const {data,error}=await client.from('exchanges').select('id,state,created_at').or(`item_a.eq.${itemId},item_b.eq.${itemId}`).order('created_at',{ascending:false});
    if(error)throw error;
    return (data||[]).find(row=>ACTIVE_STATES.has(row.state))||null;
  }

  function renderReservation(card,itemId,exchange){
    if(!card||card.querySelector('[data-release-exchange]'))return;
    const actions=card.querySelector('.bc-myset-actions');if(!actions)return;
    const wrap=document.createElement('div');wrap.className='bc-set-reservation-action';wrap.style.cssText='width:100%;margin-top:8px;padding:10px 12px;border:1px solid #ead7a3;border-radius:12px;background:#fff9e7';
    const canCancel=CANCELLABLE_STATES.has(exchange.state);
    wrap.innerHTML=`<div style="font-size:13px;line-height:1.35;margin-bottom:8px"><b>${canCancel?'Reserved in an exchange':'Exchange in progress'}</b><br>${esc(exchangeCopy(exchange.state))}</div><button type="button" class="bc-btn ${canCancel?'danger':''}" data-release-exchange="${esc(exchange.id)}" data-release-item="${esc(itemId)}">${canCancel?'Release set from exchange':'Open exchange'}</button>`;
    actions.appendChild(wrap);
    const button=wrap.querySelector('[data-release-exchange]');
    if(canCancel)button.onclick=()=>releaseAcceptedExchange(button,exchange.id,itemId);
    else button.onclick=()=>openExchange(exchange.id);
  }

  async function releaseAcceptedExchange(button,exchangeId,itemId){
    const client=db();if(!client)return notify('BrickCircle is still loading. Please try again.');
    if(!confirm('Release this set by cancelling the accepted exchange before handoff? The other collector will be notified and both sets will be released.'))return;
    const reason=prompt('Optional reason for releasing the set:','')||null;
    const label='Release set from exchange';setBusy(button,true,label);
    try{
      const {error}=await client.rpc('cancel_in_person_exchange',{p_exchange_id:exchangeId,p_reason:reason});
      if(error)throw error;
      checkedItems.delete(itemId);
      notify('Exchange cancelled. This set has been released.');
      await new Promise(r=>setTimeout(r,350));
      location.reload();
    }catch(error){
      console.error('Could not release set from exchange',error);
      setBusy(button,false,label);
      notify(error?.message||'Could not release this set. Open the exchange and try again.');
    }
  }

  async function decorateCard(input){
    const itemId=input?.dataset?.exchangeable;if(!itemId||checkedItems.has(itemId))return;
    checkedItems.add(itemId);
    try{
      const exchange=await activeExchangeForItem(itemId);if(!exchange)return;
      const card=input.closest('.bc-myset');if(!card)return;
      renderReservation(card,itemId,exchange);
    }catch(error){
      checkedItems.delete(itemId);
      console.warn('Could not inspect set reservation',error);
    }
  }

  function scan(root=document){root.querySelectorAll?.('input[data-exchangeable]').forEach(decorateCard)}
  const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;scan(node);if(node.matches?.('input[data-exchangeable]'))decorateCard(node)}}});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan());else scan();
})();
