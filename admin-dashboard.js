(() => {
  'use strict';
  const SUPABASE_URL = 'https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const number = value => Number(value || 0).toLocaleString();
  const date = value => value ? new Date(value).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : '—';
  const sections = {
    overview: ['Marketplace overview', 'A clear view of your collector community.'],
    members: ['Collector community', 'Search members and inspect collection and wishlist activity.'],
    catalogue: ['Set catalogue', 'Manage discovery visibility. Existing collections and exchanges remain available.'],
    exchanges: ['Exchange activity', 'Inspect current stages and the collector action timeline.'],
    support: ['Support desk', 'Triage collector requests and record internal support notes.'],
    audit: ['Admin audit log', 'A permanent record of who changed what, when, and why.']
  };
  let section = 'overview', page = 0, query = '', rows = [], total = 0;
  let epoch = 0, loadId = 0, detailId = 0, change = null, pending = null, submitting = false;
  let mfaFactor = null, mfaNew = false, mfaBusy = false;
  let mfaGeneration = 0;
  let lastUserId = null;
  const requests = new Set();
  function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
  function purge(message) {
    epoch++; loadId++; detailId++;
    mfaGeneration++;
    const abandonedFactor=mfaNew&&!mfaBusy?mfaFactor:null; mfaFactor=null; mfaNew=false;
    if(abandonedFactor) db?.auth.mfa.unenroll({factorId:abandonedFactor}).catch(()=>{});
    requests.forEach(controller => controller.abort()); requests.clear();
    rows = []; total = 0; change = null; pending = null; query=''; page=0; lastUserId=null;
    $('results').replaceChildren(); $('detail-body').replaceChildren();
    $('detail-dialog').close(); $('change-dialog').close();
    $('mfa-dialog').close(); $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent=''; $('mfa-code').value='';
    $('change-reason').value = ''; $('change-status').textContent = ''; $('search').value = '';
    $('dashboard').hidden = true; $('navigation').hidden = true; $('access-actions').hidden = false;
    $('refresh').disabled = false;
    status(message, true);
  }
  async function api(body) {
    const currentEpoch = epoch;
    const controller = new AbortController(); requests.add(controller);
    try {
      if (!db) throw new Error('Authentication could not load. Refresh the page.');
      const {data: sessionData, error: sessionError} = await db.auth.getSession();
      const {data: userData, error: userError} = await db.auth.getUser();
      if (currentEpoch !== epoch) throw new DOMException('Stale request', 'AbortError');
      if (sessionError || userError || !sessionData?.session?.access_token || !userData?.user) {
        purge('Sign in to your approved administrator account.'); throw new Error('Administrator sign-in required.');
      }
      if(lastUserId&&lastUserId!==userData.user.id) {
        purge('Account changed. Refresh to verify administrator access.'); throw new Error('Account changed. Refresh to continue.');
      }
      lastUserId=userData.user.id;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-dashboard`, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: {Authorization: `Bearer ${sessionData.session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (currentEpoch !== epoch) throw new DOMException('Stale request', 'AbortError');
      if (!response.ok) {
        if (data.code === 'mfa_required') {
          purge('Authenticator verification is required to access the admin console.');
          await beginMFA();
          throw new Error('Enter your authenticator code to unlock the console.');
        }
        if ([401,403].includes(response.status)) purge(data.error || 'Administrator access required.');
        throw new Error(data.error || 'Unable to load admin data. Try refreshing.');
      }
      return data;
    } finally { requests.delete(controller); }
  }
  function badge(value) { const label = String(value ?? 'Unknown').replaceAll('_',' '); return `<span class="badge ${['visible','resolved','COMPLETED'].includes(value)?'good':['open','hidden'].includes(value)?'warn':''}">${esc(label)}</span>`; }
  async function beginMFA() {
    const generation=++mfaGeneration;
    mfaFactor=null; mfaNew=false; $('mfa-setup').hidden=true; $('mfa-status').textContent='Preparing secure verification…'; $('verify-mfa').disabled=true;
    $('mfa-dialog').showModal();
    const mfaEpoch=epoch;
    try {
      const {data: factors, error} = await db.auth.mfa.listFactors();
      if(error) throw error;
      if(mfaEpoch!==epoch||generation!==mfaGeneration) return;
      const verified=(factors.totp||[]).find(factor=>factor.status==='verified');
      if(verified) mfaFactor=verified.id;
      else {
        const {data: enrollment, error: enrollError}=await db.auth.mfa.enroll({factorType:'totp',friendlyName:`BrickCircle admin ${new Date().toISOString()}`});
        if(enrollError) throw enrollError;
        if(mfaEpoch!==epoch||generation!==mfaGeneration) {await db.auth.mfa.unenroll({factorId:enrollment.id});return;}
        mfaFactor=enrollment.id; mfaNew=true;
        $('mfa-qr').src=enrollment.totp.qr_code;
        $('mfa-secret').textContent=enrollment.totp.secret; $('mfa-setup').hidden=false;
      }
      $('mfa-status').textContent=''; $('verify-mfa').disabled=false; $('mfa-code').focus();
    } catch { if(mfaEpoch===epoch&&generation===mfaGeneration) $('mfa-status').textContent='Unable to prepare verification. Cancel, then refresh to retry. Existing authenticator factors are preserved.'; }
  }
  async function cancelMFA() {
    if(mfaBusy) return;
    mfaGeneration++;
    const factor=mfaFactor, remove=mfaNew; mfaFactor=null; mfaNew=false;
    $('mfa-dialog').close(); $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent=''; $('mfa-code').value='';
    if(remove&&factor) await db.auth.mfa.unenroll({factorId:factor});
  }
  $('cancel-mfa').addEventListener('click',cancelMFA);
  $('mfa-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelMFA();});
  $('mfa-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(!mfaFactor||mfaBusy) return;
    const mfaEpoch=epoch; mfaBusy=true; $('verify-mfa').disabled=true; $('cancel-mfa').disabled=true; $('mfa-status').textContent='Verifying…';
    try {
      const {error}=await db.auth.mfa.challengeAndVerify({factorId:mfaFactor,code:$('mfa-code').value});
      if(error) throw error;
      if(mfaEpoch!==epoch) return;
      mfaNew=false; mfaFactor=null; $('mfa-dialog').close(); $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent=''; $('mfa-code').value=''; await load();
    } catch { if(mfaEpoch===epoch) $('mfa-status').textContent='Code could not be verified. Check the latest code in your app and try again.'; }
    finally {mfaBusy=false; $('verify-mfa').disabled=false; $('cancel-mfa').disabled=false;}
  });
  function table(labels, cells) {
    if (!cells.length) return '<div class="empty">No records found. Try another search.</div>';
    return `<div class="table-card"><table><thead><tr>${labels.map(label=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${cells.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${esc(labels[i])}"><div>${cell}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function renderOverview(data) {
    const labels = {members:'Registered collectors', new_members:'New in 7 days', owned_sets:'Collection items', wanted_sets:'Wishlist items', available_sets:'Available to exchange', exchanges:'Total exchanges', completed:'Completed exchanges', overdue:'Returns past due', support_open:'Support to action', catalogue_active:'Visible catalogue sets'};
    $('results').innerHTML = `<div class="metrics">${Object.entries(labels).map(([key,label])=>`<div class="metric"><span class="metric-label">${label}</span><strong>${number(data.summary?.[key])}</strong></div>`).join('')}</div><div class="panels"><section class="panel"><h2>Exchange stages</h2>${(data.states || []).map(row=>`<div class="bar-row"><span>${esc(row.state.replaceAll('_',' '))}</span><strong>${number(row.count)}</strong></div>`).join('') || '<p>No exchanges yet.</p>'}</section><section class="panel"><h2>Top collector cities</h2>${(data.cities || []).map(row=>`<div class="bar-row"><span>${esc(row.city)}</span><strong>${number(row.members)}</strong></div>`).join('') || '<p>No members yet.</p>'}</section></div>`;
  }
  function renderRows() {
    const action = (name, index, text) => `<button type="button" data-action="${name}" data-index="${index}">${text}</button>`;
    let labels, cells;
    if (section === 'members') {
      labels = ['Collector','Location','Joined','Adult status','Actions'];
      cells = rows.map((r,i)=>[`<strong>${esc(r.display_name || 'Collector')}</strong><small>${esc(r.email)}</small>`,esc([r.city,r.country].filter(Boolean).join(', ') || 'Not provided'),esc(date(r.created_at)),badge(r.adult_confirmed_at?'Confirmed':'Not confirmed'),action('member',i,'View collector')]);
    } else if (section === 'catalogue') {
      labels = ['Set','Theme','Year / pieces','Visibility','Actions'];
      cells = rows.map((r,i)=>[`<strong>${esc(r.name)}</strong><small>${esc(r.set_number)}</small>`,esc(r.theme),`${esc(r.year || '—')}<small>${number(r.piece_count)} pieces</small>`,badge(r.catalog_active?'visible':'hidden'),action('catalogue',i,'Manage visibility')]);
    } else if (section === 'exchanges') {
      labels = ['Exchange','Collectors','Stage','Return due','Actions'];
      cells = rows.map((r,i)=>[`<strong>${esc(r.id)}</strong><small>${esc(date(r.created_at))}</small>`,`${esc(r.member_a || 'Collector')}<small>↔ ${esc(r.member_b || 'Collector')}</small>`,badge(r.state),esc(date(r.return_due_at)),action('exchange',i,'View timeline')]);
    } else if (section === 'support') {
      labels = ['Request','Collector note','Status','Received','Actions'];
      cells = rows.map((r,i)=>[`<strong>${esc(r.category.replaceAll('_',' '))}</strong><small>Case ${esc(r.case_id)}</small>`,esc(r.note || 'No note provided'),badge(r.status),esc(date(r.created_at)),`${action('support',i,'Manage request')} ${action('support_exchange',i,'View exchange')}`]);
    } else {
      labels = ['Change','Reason / note','Before → after','Actor / time'];
      cells = rows.map(r=>[`<strong>${esc(r.action.replaceAll('_',' '))}</strong><small>${esc(r.entity_id)} · revision ${number(r.revision)}</small>`,esc(r.reason),`${esc(r.before_value?.value)} → ${esc(r.after_value?.value)}`,`${esc(r.actor_id)}<small>${esc(date(r.created_at))}</small>`]);
    }
    $('results').innerHTML = table(labels,cells);
  }
  async function load() {
    const id = ++loadId;
    $('refresh').disabled = true; $('dashboard').hidden = true;
    $('results').replaceChildren(); rows = [];
    $('page-title').textContent = sections[section][0]; $('page-description').textContent = sections[section][1];
    document.querySelectorAll('[data-section]').forEach(button=>{if(button.dataset.section===section) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
    status('Loading current marketplace data…');
    try {
      const data = await api({operation:'read', section, query, page});
      if (id !== loadId) return;
      $('navigation').hidden = false; $('dashboard').hidden = false; $('access-actions').hidden = true;
      $('search-form').hidden = section === 'overview'; $('pagination').hidden = section === 'overview';
      $('search-hint').textContent = {members:'Name, email, city or country',catalogue:'Set number, name or theme',exchanges:'Exchange ID, collector ID or stage',support:'Request ID, exchange ID, category or status (open, in_progress, resolved)',audit:'Record ID, action or administrator ID'}[section] || '';
      if (section === 'overview') renderOverview(data);
      else {
        rows = data.rows || []; total = data.total || 0; renderRows();
        $('previous').disabled = page === 0; $('next').disabled = (page+1)*25 >= total;
        $('page-count').textContent = `${total ? page*25+1 : 0}–${Math.min((page+1)*25,total)} of ${number(total)} records`;
      }
      status(`Updated ${date(data.generated_at)}. Private administrator view.`);
    } catch (error) {
      if (id === loadId && error.name !== 'AbortError') status(error.message, true);
    } finally { if (id === loadId) $('refresh').disabled = false; }
  }
  function fields(object) { return `<div class="detail-list">${Object.entries(object).map(([key,value])=>`<div><small>${esc(key.replaceAll('_',' '))}</small><strong>${esc(value ?? '—')}</strong></div>`).join('')}</div>`; }
  async function detail(kind, row) {
    const id = ++detailId;
    $('detail-title').textContent = kind === 'member' ? 'Collector details' : 'Exchange timeline';
    $('detail-body').textContent = 'Loading record…'; $('detail-dialog').showModal();
    try {
      const data = await api({operation:'read', section:kind==='member'?'member_detail':'exchange_detail', id:kind==='member'?row.id:(row.case_id || row.id)});
      if (id !== detailId) return;
      if (kind === 'member') {
        if (!data.member) { $('detail-body').textContent='Collector no longer exists.'; return; }
        $('detail-body').innerHTML = `${fields(data.member)}<h3>Collection (${number(data.collection_total)})</h3><p class="muted">Showing up to 100 most recent items.</p>${(data.collection||[]).map(r=>`<div class="detail-item"><strong>${esc(r.name || r.set_number)}</strong> · ${esc(r.set_number)}<br>${esc(r.condition)} · ${esc(r.completeness)} · ${r.available_for_exchange?'Available':'Not available'}</div>`).join('') || '<p>No collection items.</p>'}<h3>Wishlist (${number(data.wishlist_total)})</h3><p class="muted">Showing up to 100 most recent items.</p>${(data.wishlist||[]).map(r=>`<div class="detail-item">${esc(r.name || r.set_number)} · ${esc(r.set_number)} · priority ${esc(r.priority)}</div>`).join('') || '<p>No wishlist items.</p>'}`;
      } else {
        if (!data.exchange) { $('detail-body').textContent='Exchange no longer exists.'; return; }
        $('detail-body').innerHTML = `${fields(data.exchange)}<h3>Collector action timeline</h3><p class="muted">Latest 100 events. Agreements, handoffs and returns are controlled by the collectors.</p>${(data.events||[]).map(r=>`<div class="detail-item"><strong>${esc(r.event_type)}</strong> · version ${number(r.state_version)}<br>${esc(r.previous_state || 'Start')} → ${esc(r.resulting_state)}<br>${esc(date(r.created_at))} · ${esc(r.actor_user_id || 'System')}</div>`).join('') || '<p>No events yet.</p>'}`;
      }
    } catch (error) { if (id === detailId && error.name !== 'AbortError') $('detail-body').textContent = error.message; }
  }
  function edit(entity, row) {
    change = {entity, id:entity==='catalogue'?row.set_number:row.id, revision:row.revision}; pending = null;
    const choices = entity==='catalogue' ? [['visible','Visible in Find Sets'],['hidden','Hidden from Find Sets']] : [['open','Open'],['in_progress','In progress'],['resolved','Resolved']];
    $('change-value').innerHTML = choices.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    $('change-value').value = entity==='catalogue'?(row.catalog_active?'visible':'hidden'):row.status;
    $('change-description').textContent = entity==='catalogue'?`${row.name} (${row.set_number}). Change whether this set appears in discovery.`:`Support request ${row.id}. Triage status is internal and does not change the exchange or resolve a collector-reported issue.`;
    $('change-title').textContent = entity==='catalogue'?'Manage catalogue visibility':'Triage support request';
    $('change-reason').value=''; $('change-status').textContent='';
    $('change-reason').disabled=false; $('change-value').disabled=false; $('confirm-change').disabled=false;
    $('change-dialog').showModal();
  }
  $('change-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!change || submitting) return;
    if (!pending) pending = {operation:'mutate', ...change, value:$('change-value').value, reason:$('change-reason').value.trim(), request_id:crypto.randomUUID()};
    if (pending.reason.length < 10) { $('change-status').textContent='Provide a reason of at least 10 characters.'; pending=null; return; }
    const attempted = pending;
    submitting=true; $('confirm-change').disabled=true; $('change-value').disabled=true; $('change-reason').disabled=true; $('cancel-change').disabled=true;
    $('change-status').textContent='Recording change…'; $('change-status').classList.remove('error');
    try {
      await api(attempted); $('change-dialog').close(); pending=null; change=null; await load();
    } catch (error) {
      if (error.name !== 'AbortError') { $('change-status').textContent=`${error.message} Retry submits the same recorded request safely. For a conflict, cancel and refresh first.`; $('change-status').classList.add('error'); }
    } finally { submitting=false; $('confirm-change').disabled=false; $('cancel-change').disabled=false; }
  });
  $('change-dialog').addEventListener('cancel', event=>{if(submitting) event.preventDefault();});
  $('cancel-change').addEventListener('click',()=>{if(!submitting){$('change-dialog').close();change=null;pending=null;}});
  $('close-detail').addEventListener('click',()=>{$('detail-dialog').close();detailId++;$('detail-body').replaceChildren();});
  $('detail-dialog').addEventListener('close',()=>{detailId++;$('detail-body').replaceChildren();});
  $('results').addEventListener('click',event=>{
    const button=event.target.closest('[data-action]'); if(!button) return;
    const row=rows[Number(button.dataset.index)]; if(!row) return;
    const action=button.dataset.action;
    if(action==='member'||action==='exchange'||action==='support_exchange') detail(action==='member'?'member':'exchange',row);
    else edit(action,row);
  });
  document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>{
    section=button.dataset.section;page=0;query='';$('search').value='';load();
  }));
  $('search-form').addEventListener('submit',event=>{event.preventDefault();query=$('search').value.trim();page=0;load();});
  $('previous').addEventListener('click',()=>{if(page>0){page--;load();}});
  $('next').addEventListener('click',()=>{if((page+1)*25<total){page++;load();}});
  $('refresh').addEventListener('click',load);
  $('signout').addEventListener('click',async()=>{purge('Signed out.');await db?.auth.signOut({scope:'local'});location.assign('/#home');});
  db?.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT') purge('Signed out. Sign in to your administrator account.');
    else if(event==='SIGNED_IN'&&lastUserId&&session?.user?.id!==lastUserId) purge('Account changed. Refresh to verify administrator access.');
  });
  window.addEventListener('pagehide',()=>purge('Session locked. Refresh to continue.'));
  window.addEventListener('pageshow',event=>{if(event.persisted) load();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('detail-dialog').open&&!$('change-dialog').open) load();});
  load();
})();
