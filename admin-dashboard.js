(() => {
  'use strict';
  const SUPABASE_URL = 'https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
  const localLogout = db && window.bcCreateLocalLogout(db.auth);
  let logoutLocked = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const number = value => Number(value || 0).toLocaleString();
  const date = value => value ? new Date(value).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : '—';
  const sections = {
    overview: ['Marketplace overview', 'A clear view of your collector community.'],
    growth: ['Growth reporting', 'Signup activation, exchange momentum and city liquidity.'],
    members: ['Collector community', 'Search members and inspect collection and wishlist activity.'],
    catalogue: ['Set catalogue', 'Manage discovery visibility. Existing collections and exchanges remain available.'],
    exchanges: ['Exchange activity', 'Inspect current stages and the collector action timeline.'],
    support: ['Support desk', 'Triage collector requests and record internal support notes.'],
    audit: ['Admin audit log', 'A permanent record of who changed what, when, and why.'],
    collection: ['Collection items', 'Read-only collector-owned items.'],
    wishlist: ['Wishlist items', 'Read-only collector wishlist entries.']
  };
  let section = 'overview', page = 0, query = '', rows = [], total = 0;
  let epoch = 0, loadId = 0, detailId = 0, change = null, pending = null, submitting = false;
  let mfaFactor = null, mfaNew = false, mfaBusy = false;
  let mfaGeneration = 0;
  let lastUserId = null;
  let filters = {}, detailState = null;
  let growthDays = 28, growthReport = null;
  const exportUrls = new Set();
  const stages=['PROPOSED','DECLINED','WITHDRAWN','EXPIRED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING','HANDOFF_ISSUE','ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED','CANCELLED','COMPLETED'];
  const metrics={members:['members',{}],new_members:['members',{new:true}],owned_sets:['collection',{}],wanted_sets:['wishlist',{}],available_sets:['collection',{available:true}],exchanges:['exchanges',{}],completed:['exchanges',{stage:'COMPLETED'}],overdue:['exchanges',{overdue:true}],support_open:['support',{status:'actionable'}],catalogue_active:['catalogue',{visible:true}]};
  let accessCertain = false, lastUpdated = null, renderedView = null;
  const API_DEADLINE_MS = 15000;
  const requests = new Set();
  class AdminError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  function lockWrites() {
    accessCertain = false;
    $('export-report').disabled = true;
    if(!pending) $('confirm-change').disabled=true;
    document.querySelectorAll('[data-action="catalogue"], [data-action="support"], [data-action="support_note"]').forEach(button => { button.disabled = true; });
  }
  function cancelStaleReads() { requests.forEach(request=>{if(!request.current()) request.cancel();}); }
  function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
  function purge(message) {
    epoch++; loadId++; detailId++;
    mfaGeneration++;
    const abandonedFactor=mfaNew&&!mfaBusy?mfaFactor:null; mfaFactor=null; mfaNew=false;
    if(abandonedFactor) db?.auth.mfa.unenroll({factorId:abandonedFactor}).catch(()=>{});
    requests.forEach(request => request.cancel()); requests.clear();
    accessCertain=false; lastUpdated=null; renderedView=null;
    rows = []; total = 0; change = null; pending = null; query=''; page=0; lastUserId=null; filters={}; detailState=null;
    clearGrowth();
    $('results').replaceChildren(); $('detail-body').replaceChildren();
    $('detail-dialog').close(); $('change-dialog').close();
    $('mfa-dialog').close(); $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent=''; $('mfa-code').value='';
    $('change-reason').value = ''; $('change-status').textContent = ''; $('search').value = '';
    $('dashboard').hidden = true; $('navigation').hidden = true; $('access-actions').hidden = false;
    $('refresh').disabled = false;
    status(message, true);
  }
  async function api(body, isCurrent = () => true) {
    if(logoutLocked) throw new AdminError('unauthenticated','Sign out is not confirmed. Retry or reload to verify your session.');
    const currentEpoch = epoch, account = lastUserId;
    const controller = new AbortController();
    let active = true, timer, rejectCancellation;
    const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
    const request = {current:isCurrent, cancel() { active=false; controller.abort(); rejectCancellation(new DOMException('Stale request', 'AbortError')); }};
    requests.add(request);
    const check = () => {
      if (!active || currentEpoch !== epoch || !isCurrent() || (account && account !== lastUserId))
        throw new DOMException('Stale request', 'AbortError');
    };
    // One clock covers SDK calls, delivery and body parsing. Aborting fetch alone
    // cannot bound an SDK promise, and abandoned promises must never change state.
    timer = setTimeout(() => {
      active=false; controller.abort();
      rejectCancellation(new AdminError('timeout', 'Operation timed out. Delivery may be unknown.'));
    }, API_DEADLINE_MS);
    const wait = async promise => { const value = await Promise.race([promise, cancellation]); check(); return value; };
    const authFailure = error => {
      if (['session_not_found','refresh_token_not_found','refresh_token_already_used','bad_jwt','user_not_found'].includes(error?.code) || [401,403].includes(error?.status)) {
        purge('Your session is no longer valid. Sign in again.');
        throw new AdminError('unauthenticated', 'Administrator sign-in required.');
      }
      throw new AdminError('unavailable', 'Authentication is temporarily unavailable. Refresh to verify access.');
    };
    try {
      if (!db) throw new AdminError('unavailable', 'Authentication could not load. Refresh the page.');
      const {data: sessionData, error: sessionError} = await wait(db.auth.getSession());
      if (sessionError) authFailure(sessionError);
      if (!sessionData?.session?.access_token) {
        purge('Sign in to your approved administrator account.'); throw new AdminError('unauthenticated', 'Administrator sign-in required.');
      }
      if (lastUserId && sessionData.session.user?.id && lastUserId !== sessionData.session.user.id) {
        purge('Account changed. Refresh to verify administrator access.'); throw new AdminError('unauthenticated', 'Account changed.');
      }
      if(sessionData.session.user?.id) lastUserId=sessionData.session.user.id;
      const {data: userData, error: userError} = await wait(db.auth.getUser(sessionData.session.access_token));
      if (userError) authFailure(userError);
      if (!userData?.user) { purge('Sign in to your approved administrator account.'); throw new AdminError('unauthenticated', 'Administrator sign-in required.'); }
      if(lastUserId&&lastUserId!==userData.user.id) {
        purge('Account changed. Refresh to verify administrator access.'); throw new AdminError('unauthenticated', 'Account changed. Refresh to continue.');
      }
      lastUserId=userData.user.id;
      const response = await wait(fetch(`${SUPABASE_URL}/functions/v1/admin-dashboard`, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: {Authorization: `Bearer ${sessionData.session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type':'application/json'},
        body: JSON.stringify(body)
      }));
      // An explicit denial is authoritative even if its response body is broken.
      if ([401,403].includes(response.status)) {
        // Release this operation before purge cancels the other requests. Read a
        // denial body only for its message/MFA hint, never as authorized content.
        requests.delete(request);
        purge('Administrator access required. Sign in or verify your authenticator.');
        const deniedEpoch=epoch, deniedLoadId=loadId;
        let denial;
        try { denial=await Promise.race([response.json(),cancellation]); } catch { /* denial still wins */ }
        if(deniedEpoch!==epoch || deniedLoadId!==loadId) throw new DOMException('Stale request','AbortError');
        if(denial?.code==='mfa_required') {
          status('Authenticator verification is required to access the admin console.',true);
          beginMFA();
        } else status(denial?.error || 'Administrator access required.',true);
        throw new AdminError(denial?.code || (response.status===401?'unauthenticated':'forbidden'), denial?.error || 'Administrator access required.');
      }
      let data;
      try { data = await wait(response.json()); }
      catch (error) {
        if (error.code === 'timeout' || error.name === 'AbortError') throw error;
        throw new AdminError('unavailable', 'Invalid response from the admin service. Refresh to retry.');
      }
      if (!response.ok) {
        if (data.code === 'mfa_required') {
          purge('Authenticator verification is required to access the admin console.');
          beginMFA();
          throw new AdminError('mfa_required', 'Enter your authenticator code to unlock the console.');
        }
        throw new AdminError(data.code || ({401:'unauthenticated',403:'forbidden',409:'conflict',400:'validation',404:'not_found'}[response.status] || 'unavailable'), data.error || 'Unable to load admin data. Try refreshing.');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || (body.operation==='read' && !body.section.endsWith('_detail') && (!data.generated_at || (body.section==='overview' ? !data.summary : !Array.isArray(data.rows) || !Number.isInteger(data.total)))))
        throw new AdminError('unavailable', 'Invalid response from the admin service. Refresh to retry.');
      if(body.operation==='read'&&body.version===2&&body.section.endsWith('_detail')&&(!Array.isArray(data.rows)||!Number.isInteger(data.total)||data.total<0||!data.generated_at))
        throw new AdminError('unavailable','Invalid detail response. Refresh to retry.');
      if(body.operation==='read') {
        const keys={members:['id'],catalogue:['set_number','name'],exchanges:['id','state'],support:['id','case_id','category','status'],audit:['action'],collection:['id','user_id','set_number'],wishlist:['id','user_id','set_number'],support_detail:body.part==='events'?['id','event_type']:['id','action','created_at'],member_detail:['id','set_number'],exchange_detail:['id','event_type']}[body.section] || [];
        if(typeof data.generated_at!=='string'||!Number.isFinite(Date.parse(data.generated_at))||
          (body.section==='overview'?(!data.summary||typeof data.summary!=='object'||Array.isArray(data.summary)):
            (!Number.isInteger(data.total)||data.total<0||!Array.isArray(data.rows)||data.rows.length>25||data.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||keys.some(key=>typeof row[key]!=='string')))))
          throw new AdminError('unavailable','Invalid record response. Refresh to retry.');
        const header={member_detail:'member',exchange_detail:'exchange',support_detail:'request'}[body.section];
        if(header&&(!data[header]||typeof data[header]!=='object'||Array.isArray(data[header])||typeof data[header].id!=='string'))
          throw new AdminError('unavailable','Invalid record details. Refresh to retry.');
      }
      if(['mutate','note'].includes(body.operation) && (!Number.isInteger(data.revision) || typeof data.audit_id!=='string'))
        throw new AdminError('unavailable', 'Change response could not be verified. Delivery may be unknown.');
      return data;
    } catch (error) {
      if (currentEpoch===epoch && isCurrent() && error.name!=='AbortError') lockWrites();
      if (error instanceof AdminError || error.name==='AbortError') throw error;
      throw new AdminError('unavailable', 'Admin service unavailable. Refresh to verify access.');
    } finally { active=false; clearTimeout(timer); requests.delete(request); }
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
    const count=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?number(value):'Unavailable';
    $('results').innerHTML = `<div class="metrics">${Object.entries(labels).map(([key,label])=>`<button type="button" class="metric" data-metric="${key}" ${count(data.summary?.[key])==='Unavailable'?'disabled':''}><span class="metric-label">${label}</span><strong>${count(data.summary?.[key])}</strong></button>`).join('')}</div><div class="panels"><section class="panel"><h2>Exchange stages</h2>${Array.isArray(data.states)?data.states.map(row=>`<button type="button" class="bar-row" data-stage="${esc(row.state)}"><span>${esc(row.state.replaceAll('_',' '))}</span><strong>${count(row.count)}</strong></button>`).join('') || '<p>No exchanges yet.</p>':'<p>Unavailable</p>'}</section><section class="panel"><h2>Top collector cities</h2>${Array.isArray(data.cities)?data.cities.map(row=>`<div class="bar-row"><span>${esc(row.city)}</span><strong>${count(row.members)}</strong></div>`).join('') || '<p>No members yet.</p>':'<p>Unavailable</p>'}</section></div>`;
  }
  const isCount = value => Number.isSafeInteger(value) && value >= 0;
  const GROWTH_KPIS = [['new_registrations','New registrations'],['active_exchange_collectors','Active exchange collectors'],['proposals','Proposals'],['accepted','Accepted'],['handoffs','Handoffs'],['completed_exchanges','Completed exchanges'],['repeat_collectors','Repeat collectors'],['cancellations','Cancellations']];
  // Client-side mirror of the Edge growth-report contract. A report that fails any
  // check is never rendered, so unavailable data can never appear as a fabricated zero.
  function parseReport(value, days) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.days !== days) return null;
    const validDate = entry => typeof entry === 'string' && Number.isFinite(Date.parse(entry));
    if (!['generated_at','start_at','end_at','previous_start_at'].every(key => validDate(value[key]))) return null;
    const counts = (group, keys) => Boolean(group) && typeof group === 'object' && !Array.isArray(group) && keys.every(key => isCount(group[key]));
    const metrics = value.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics) ||
      !GROWTH_KPIS.every(([key]) => counts(metrics[key], ['current','previous']))) return null;
    if (!counts(value.activation, ['registered','email_verified','ready'])) return null;
    if (!counts(value.exchange_cohort, ['proposed','accepted','handed_off','completed','cancelled'])) return null;
    if (!counts(value.health, ['active_custody','overdue_returns','unresolved_issues','open_support'])) return null;
    const daily = value.daily;
    if (!Array.isArray(daily) || daily.length > days ||
      daily.some(row => !row || typeof row !== 'object' || Array.isArray(row) || !validDate(row.date) || !isCount(row.registrations) || !isCount(row.completed_exchanges))) return null;
    const cities = value.cities;
    if (!Array.isArray(cities) || cities.length > 20 ||
      cities.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.country !== 'string' || typeof row.city !== 'string' ||
        !isCount(row.registered) || !isCount(row.ready) || !isCount(row.available_sets) || !isCount(row.completed_exchanges))) return null;
    const coverage = Array.isArray(value.coverage) && value.coverage.length <= 40 && value.coverage.every(item => typeof item === 'string') ? value.coverage : null;
    const definitions = value.definitions && typeof value.definitions === 'object' && !Array.isArray(value.definitions) &&
      Object.entries(value.definitions).every(([, text]) => typeof text === 'string') ? Object.entries(value.definitions) : null;
    return {version:1, days, generated_at:value.generated_at, start_at:value.start_at, end_at:value.end_at, previous_start_at:value.previous_start_at,
      metrics, activation:value.activation, exchange_cohort:value.exchange_cohort, daily, cities, health:value.health, coverage, definitions};
  }
  function revokeExports() { exportUrls.forEach(url => URL.revokeObjectURL(url)); exportUrls.clear(); }
  function clearGrowth() {
    growthReport = null; revokeExports();
    $('growth-content').replaceChildren(); $('growth-meta').textContent = '';
    $('export-report').disabled = true;
    document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.range) === growthDays)));
  }
  const growthCount = value => isCount(value) ? number(value) : 'Unavailable';
  const growthDelta = (current, previous) => {
    if (!isCount(current) || !isCount(previous)) return 'Unavailable';
    if (previous === 0) return 'No previous baseline';
    const diff = current - previous, pct = diff / previous * 100;
    return `${diff >= 0 ? '+' : ''}${number(diff)} vs previous (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
  };
  const growthStamp = value => { try { return `${new Date(value).toISOString().slice(0,16).replace('T',' ')} UTC`; } catch { return 'Unavailable'; } };
  function renderGrowth(report) {
    const card = (label, value, note, extra) => `<div class="kpi"><span class="kpi-label">${esc(label)}</span><strong class="kpi-value">${esc(growthCount(value))}</strong>${note ? `<span class="kpi-note">${esc(note)}</span>` : ''}${extra ? `<span class="kpi-note kpi-delta">${esc(extra)}</span>` : ''}</div>`;
    $('growth-meta').textContent = `Current period ${growthStamp(report.start_at)} → ${growthStamp(report.end_at)} · previous period ${growthStamp(report.previous_start_at)} → ${growthStamp(report.start_at)} · generated ${growthStamp(report.generated_at)}`;
    const daily = report.daily.length ? table(['Date','Registrations','Completed exchanges'], report.daily.map(row => [esc(row.date), number(row.registrations), number(row.completed_exchanges)])) : '<div class="empty">No daily activity recorded in this period.</div>';
    const cities = report.cities.length ? table(['Country','City','Registered','Ready','Available sets','Completed exchanges'], report.cities.map(row => [esc(row.country), `<strong>${esc(row.city)}</strong>`, number(row.registered), number(row.ready), number(row.available_sets), number(row.completed_exchanges)])) : '<div class="empty">No city liquidity data for this period.</div>';
    const stages = [['proposed','Proposed'],['accepted','Accepted'],['handed_off','Handed off'],['completed','Completed']];
    $('growth-content').innerHTML = `
      <h2 class="report-heading">Period comparison</h2>
      <p class="muted">Each value compares this period with the immediately preceding period of equal length. Unavailable counts are never shown as zero.</p>
      <div class="kpis">${GROWTH_KPIS.map(([key, label]) => card(label, report.metrics[key].current, `Previous period: ${growthCount(report.metrics[key].previous)}`, growthDelta(report.metrics[key].current, report.metrics[key].previous))).join('')}</div>
      <section class="report-section"><h2>Signup activation cohort</h2>
        <div class="kpis">${card('Registered', report.activation.registered)}${card('Email verified', report.activation.email_verified)}${card('Ready', report.activation.ready, 'Current snapshot')}</div>
        <p class="muted">Ready is the current signup-cohort snapshot: verified email, adult confirmation, named country and city, an owned set with a primary photo, and a wishlist. Availability and historical conversion are not inferred.</p></section>
      <section class="report-section"><h2>Exchange-created cohort</h2>
        <ol class="funnel">${stages.map(([key, label]) => `<li><span>${esc(label)}</span><strong>${esc(growthCount(report.exchange_cohort[key]))}</strong></li>`).join('')}</ol>
        <p class="muted">Maturing cohort: stage milestones recorded by report end; counts overlap and imported history may be incomplete, including ${esc(growthCount(report.exchange_cohort.cancelled))} cancelled. Not a completion-window rate.</p></section>
      <section class="report-section"><h2>Daily trend</h2>${daily}</section>
      <section class="report-section"><h2>City liquidity</h2><p class="muted">Available sets is current supply, not matched reciprocal exchanges.</p>${cities}</section>
      <section class="report-section"><h2>Health snapshot</h2>
        <div class="kpis">${card('Active custody', report.health.active_custody)}${card('Overdue returns', report.health.overdue_returns)}${card('Exchanges with unresolved issues', report.health.unresolved_issues)}${card('Open support', report.health.open_support)}</div></section>
      <details class="report-notes"><summary>Metric definitions and data coverage</summary>
        <h3>Definitions</h3>${report.definitions ? `<dl class="definition-list">${report.definitions.map(([key, text]) => `<dt>${esc(key.replaceAll('_',' '))}</dt><dd>${esc(text)}</dd>`).join('')}</dl>` : '<p>Definitions unavailable.</p>'}
        <h3>Data coverage</h3>${report.coverage ? `<ul>${report.coverage.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>Coverage unavailable.</p>'}</details>`;
  }
  const csvCell = value => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  const csvCount = value => isCount(value) ? String(value) : '';
  function reportCsv(report) {
    const lines = [];
    const push = cells => lines.push(cells.map(csvCell).join(','));
    push(['BrickCircle growth report', `Last ${report.days} days`]);
    push(['Generated at', report.generated_at, 'Period start', report.start_at, 'Period end', report.end_at, 'Previous period start', report.previous_start_at]);
    lines.push('');
    push(['Metric', 'Current', 'Previous', 'Change vs previous']);
    GROWTH_KPIS.forEach(([key, label]) => push([label, csvCount(report.metrics[key].current), csvCount(report.metrics[key].previous), growthDelta(report.metrics[key].current, report.metrics[key].previous)]));
    lines.push('');
    push(['Signup activation cohort', 'Count']);
    push(['Registered', csvCount(report.activation.registered)]);
    push(['Email verified', csvCount(report.activation.email_verified)]);
    push(['Ready (current snapshot)', csvCount(report.activation.ready)]);
    lines.push('');
    push(['Exchange-created cohort (maturing)', 'Count']);
    [['proposed','Proposed'],['accepted','Accepted'],['handed_off','Handed off'],['completed','Completed'],['cancelled','Cancelled']].forEach(([key, label]) => push([label, csvCount(report.exchange_cohort[key])]));
    lines.push('');
    push(['Date', 'Registrations', 'Completed exchanges']);
    report.daily.forEach(row => push([row.date, csvCount(row.registrations), csvCount(row.completed_exchanges)]));
    lines.push('');
    push(['Country', 'City', 'Registered', 'Ready', 'Available sets (current supply)', 'Completed exchanges']);
    report.cities.forEach(row => push([row.country, row.city, csvCount(row.registered), csvCount(row.ready), csvCount(row.available_sets), csvCount(row.completed_exchanges)]));
    lines.push('');
    push(['Health snapshot', 'Count']);
    [['active_custody','Active custody'],['overdue_returns','Overdue returns'],['unresolved_issues','Exchanges with unresolved issues'],['open_support','Open support']].forEach(([key, label]) => push([label, csvCount(report.health[key])]));
    return lines.join('\r\n');
  }
  $('export-report').addEventListener('click', () => {
    if (!accessCertain || !growthReport) return;
    let url;
    try {
      url = URL.createObjectURL(new Blob([reportCsv(growthReport)], {type:'text/csv;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url; link.download = `brickcircle-growth-${growthReport.days}-days.csv`;
      document.body.append(link); link.click(); link.remove();
      exportUrls.add(url);
    } catch { status('The report export could not be prepared. Refresh and retry.', true); return; }
    setTimeout(() => { URL.revokeObjectURL(url); exportUrls.delete(url); }, 0);
    status('Growth report downloaded as CSV. Nothing is stored in this browser.');
  });
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    const days = Number(button.dataset.range);
    if (![7, 28, 90].includes(days) || days === growthDays) return;
    growthDays = days; load();
  }));
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
      cells = rows.map((r,i)=>[`<strong>${esc(r.category.replaceAll('_',' '))}</strong><small>Case ${esc(r.case_id)}</small>`,esc(r.note || 'No note provided'),badge(r.status),esc(date(r.created_at)),`${action('support_detail',i,'View request')} ${action('support',i,'Manage request')} ${action('support_exchange',i,'View exchange')}`]);
    } else if(section==='collection'||section==='wishlist') {
      labels=['Set','Collector','Activity','Actions'];
      cells=rows.map((r,i)=>[`${esc(r.name || r.set_number)}<small>${esc(r.set_number)}</small>`,esc(r.display_name || 'Collector'),section==='collection'?`${esc(r.condition)} · ${esc(r.completeness)} · ${r.available_for_exchange?'Available':'Not available'}`:`Priority ${esc(r.priority)}`,action('member',i,'View collector')]);
    } else {
      labels = ['Change','Reason / note','Before → after','Actor / time'];
      cells = rows.map(r=>[`<strong>${esc(r.action.replaceAll('_',' '))}</strong><small>${esc(r.entity_id)} · revision ${number(r.revision)}</small>`,esc(r.reason),`${esc(r.before_value?.value)} → ${esc(r.after_value?.value)}`,`${esc(r.actor_id)}<small>${esc(date(r.created_at))}</small>`]);
    }
    $('results').innerHTML = table(labels,cells);
  }
  async function load() {
    if(logoutLocked)return;
    const id = ++loadId;
    const previousRows=rows, previousTotal=total;
    detailId++;
    if($('detail-dialog').open) $('detail-dialog').close();
    $('detail-body').replaceChildren();
    cancelStaleReads();
    const growth = section === 'growth';
    // The date range is part of the view fingerprint, so a report from a previous
    // range can never replace the newly requested range or remain on screen.
    const view = JSON.stringify(growth ? [section, growthDays] : [section,page,query,filters]);
    lockWrites();
    $('refresh').disabled = true;
    if (view !== renderedView) { $('dashboard').hidden = true; $('results').replaceChildren(); rows = []; lastUpdated=null; clearGrowth(); }
    $('growth-panel').hidden = !growth;
    $('page-title').textContent = sections[section][0]; $('page-description').textContent = sections[section][1];
    document.querySelectorAll('[data-section]').forEach(button=>{if(button.dataset.section===section) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
    if (growth) document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.range) === growthDays)));
    status('Loading current marketplace data…');
    const structured=['support','exchanges'].includes(section);
    $('record-filters').hidden=growth||(!structured&&!Object.keys(filters).length);
    $('structured-filters').hidden=!structured;
    const options=section==='support'?['open','in_progress','resolved','actionable']:stages;
    $('record-status').innerHTML=`<option value="">Any status / stage</option>${options.map(value=>`<option value="${value}">${esc(value.replaceAll('_',' '))}</option>`).join('')}`;
    $('record-status').value=filters[section==='support'?'status':'stage'] || '';
    $('record-age').hidden=section!=='support'; document.querySelector('label[for="record-age"]').hidden=section!=='support'; $('record-age').value=filters.age || '';
    $('filter-summary').textContent=Object.entries(filters).map(([key,value])=>`${key.replaceAll('_',' ')}: ${String(value).replaceAll('_',' ')}`).join(' · ') || 'All records';
    try {
      const data = await api(growth ? {operation:'report', version:1, days:growthDays} : {operation:'read', version:2, section, query, page, filters}, () => id === loadId);
      if (id !== loadId) return;
      $('search-form').hidden = section === 'overview' || growth; $('pagination').hidden = section === 'overview' || growth;
      if (growth) {
        const report = parseReport(data, growthDays);
        if (!report) throw new AdminError('unavailable', 'Growth report could not be verified. Refresh to retry.');
        growthReport = report; renderGrowth(report); $('export-report').disabled = false;
      } else {
        if (section === 'overview') renderOverview(data);
        else {
          rows = data.rows || []; total = data.total || 0; renderRows();
          $('previous').disabled = page === 0; $('next').disabled = (page+1)*25 >= total;
          $('page-count').textContent = `${total ? page*25+1 : 0}–${Math.min((page+1)*25,total)} of ${number(total)} records`;
        }
        $('search-hint').textContent = {members:'Name, email, city or country',catalogue:'Set number, name or theme',exchanges:'Exchange ID, collector ID or stage',support:'Request ID, exchange ID, category or status (open, in_progress, resolved)',audit:'Record ID, action or administrator ID'}[section] || '';
      }
      accessCertain=true; lastUpdated=data.generated_at; renderedView=view;
      if(change&&!submitting) $('confirm-change').disabled=false;
      $('navigation').hidden = false; $('dashboard').hidden = false; $('access-actions').hidden = true;
      status(`Updated ${date(data.generated_at)}. Private administrator view.`);
    } catch (error) {
      if (id === loadId && error.name !== 'AbortError') {
        lockWrites();if(view===renderedView){rows=previousRows;total=previousTotal;}
        status(`${error.message}${lastUpdated ? ` Stale view — last updated ${date(lastUpdated)}. New changes are disabled until a successful refresh.` : ''}`, true);
      }
    } finally { if (id === loadId) $('refresh').disabled = false; }
  }
  function fields(object) { return `<div class="detail-list">${Object.entries(object).map(([key,value])=>`<div><small>${esc(key.replaceAll('_',' '))}</small><strong>${esc(value ?? '—')}</strong></div>`).join('')}</div>`; }
  async function detail(kind, row) {
    const id = ++detailId;
    cancelStaleReads();
    if(!detailState || detailState.kind!==kind || detailState.row!==row) detailState={kind,row,page:0,part:kind==='member'?'collection':kind==='support'?'history':null};
    const state=detailState;
    $('detail-title').textContent = kind === 'member' ? 'Collector details' : kind==='support'?'Support request details':'Exchange timeline';
    $('detail-body').textContent = 'Loading record…'; if(!$('detail-dialog').open) $('detail-dialog').showModal();
    try {
      const data = await api({operation:'read', version:2, section:kind==='member'?'member_detail':kind==='support'?'support_detail':'exchange_detail', id:kind==='member'?(row.user_id || row.id):kind==='support'?row.id:(row.case_id || row.id), page:state.page, ...(state.part?{part:state.part}:{})}, () => id === detailId);
      if (id !== detailId) return;
      if (kind === 'member') {
        if (!data.member) { $('detail-body').textContent='Collector no longer exists.'; return; }
        $('detail-body').innerHTML = `${fields(data.member)}<div class="pagination"><button type="button" data-part="collection" aria-pressed="${state.part==='collection'}">Collection (${number(data.collection_total)})</button><button type="button" data-part="wishlist" aria-pressed="${state.part==='wishlist'}">Wishlist (${number(data.wishlist_total)})</button></div><h3>${state.part==='collection'?'Collection':'Wishlist'}</h3>${(data.rows||[]).map(r=>`<div class="detail-item"><strong>${esc(r.name || r.set_number)}</strong> · ${esc(r.set_number)}<br>${state.part==='collection'?`${esc(r.condition)} · ${esc(r.completeness)} · ${r.available_for_exchange?'Available':'Not available'}`:`Priority ${esc(r.priority)}`}</div>`).join('') || '<p>No items.</p>'}`;
      } else if(kind==='support') {
        if(!data.request) throw new AdminError('not_found','Support request not found.');
        state.row=data.request;
        $('detail-body').innerHTML=`${fields(data.request)}<p class="muted">Resolved means internal support triage only. It does not resolve a peer issue, change an exchange or send a message.</p><div class="pagination"><button type="button" data-action="support" ${accessCertain?'':'disabled'}>Change triage status</button><button type="button" data-action="support_note" ${accessCertain?'':'disabled'}>Add internal note</button></div><h3>Linked exchange</h3>${data.exchange?fields(data.exchange):'<p>Exchange unavailable.</p>'}<div class="pagination"><button type="button" data-part="history" aria-pressed="${state.part==='history'}">Admin note / status history</button><button type="button" data-part="events" aria-pressed="${state.part==='events'}">Collector action timeline</button></div>${(data.rows||[]).map(r=>state.part==='history'?`<div class="detail-item"><strong>${esc(r.action.replaceAll('_',' '))}</strong><p>${esc(r.reason)}</p>${r.action==='support_triage'?`<p>${esc(r.before_value?.value)} → ${esc(r.after_value?.value)}</p>`:''}<small>${esc(date(r.created_at))} · ${esc(r.actor_id)}</small></div>`:`<div class="detail-item"><strong>${esc(r.event_type)}</strong> · version ${number(r.state_version)}<br>${esc(r.previous_state || 'Start')} → ${esc(r.resulting_state)}<br>${esc(date(r.created_at))} · ${esc(r.actor_user_id || 'System')}</div>`).join('') || '<p>No history yet.</p>'}`;
      } else {
        if (!data.exchange) { $('detail-body').textContent='Exchange no longer exists.'; return; }
        $('detail-body').innerHTML = `${fields(data.exchange)}<h3>Collector action timeline</h3><p class="muted">Agreements, handoffs and returns are controlled by the collectors.</p>${(data.rows||[]).map(r=>`<div class="detail-item"><strong>${esc(r.event_type)}</strong> · version ${number(r.state_version)}<br>${esc(r.previous_state || 'Start')} → ${esc(r.resulting_state)}<br>${esc(date(r.created_at))} · ${esc(r.actor_user_id || 'System')}</div>`).join('') || '<p>No events yet.</p>'}`;
      }
      $('detail-body').insertAdjacentHTML('beforeend',`<div class="pagination"><p>${data.total?state.page*25+1:0}–${Math.min((state.page+1)*25,data.total)} of ${number(data.total)} records</p><div><button type="button" data-detail-page="-1" ${state.page===0?'disabled':''}>Previous records</button><button type="button" data-detail-page="1" ${(state.page+1)*25>=data.total?'disabled':''}>Next records</button></div></div>`);
      if(state.focusSelector) { $('detail-body').querySelector(state.focusSelector)?.focus();delete state.focusSelector; }
    } catch (error) { if (id === detailId && error.name !== 'AbortError') $('detail-body').textContent = error.message; }
  }
  function edit(entity, row) {
    const target = entity==='catalogue'?row.set_number:row.id;
    if (!accessCertain || (pending && (pending.entity!==entity || pending.id!==target))) { status('Refresh to verify access and retry or review the outstanding change first.',true); return; }
    change = {entity, id:target, revision:row.revision};
    const choices = entity==='catalogue' ? [['visible','Visible in Find Sets'],['hidden','Hidden from Find Sets']] : [['open','Open'],['in_progress','In progress'],['resolved','Resolved']];
    $('change-value').innerHTML = choices.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    $('change-value').value = entity==='catalogue'?(row.catalog_active?'visible':'hidden'):row.status;
    $('change-description').textContent = entity==='catalogue'?`${row.name} (${row.set_number}). Change whether this set appears in discovery.`:`Support request ${row.id}. Triage status is internal and does not change the exchange or resolve a collector-reported issue.`;
    $('change-title').textContent = entity==='catalogue'?'Manage catalogue visibility':'Triage support request';
    const note=entity==='support_note';
    $('change-value').hidden=note; $('change-value').required=!note; document.querySelector('label[for="change-value"]').hidden=note;
    if(note) {$('change-title').textContent='Append internal support note';$('change-description').textContent=`Support request ${row.id}. This append-only note does not change triage status, modify the exchange or send a message.`;}
    $('change-reason').value=pending?.reason || ''; $('change-status').textContent=pending?'Delivery is unknown. Retry submits the same recorded request safely.':'';
    if(pending&&!note) $('change-value').value=pending.value;
    $('change-reason').disabled=Boolean(pending); $('change-value').disabled=Boolean(pending); $('confirm-change').disabled=false;
    $('change-dialog').showModal();
  }
  $('change-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!change || submitting || (!pending && !accessCertain)) return;
    if (!pending) pending = change.entity==='support_note'?{operation:'note',entity:'support_note',id:change.id,reason:$('change-reason').value.trim(),request_id:crypto.randomUUID()}:{operation:'mutate', ...change, value:$('change-value').value, reason:$('change-reason').value.trim(), request_id:crypto.randomUUID()};
    if (pending.reason.length < 10) { $('change-status').textContent='Provide a reason of at least 10 characters.'; pending=null; return; }
    const attempted = pending;
    submitting=true; $('confirm-change').disabled=true; $('change-value').disabled=true; $('change-reason').disabled=true; $('cancel-change').disabled=true;
    $('change-status').textContent='Recording change…'; $('change-status').classList.remove('error');
    try {
      await api(attempted); if(pending!==attempted) return; $('change-dialog').close(); pending=null; change=null; await load();
    } catch (error) {
      if (pending===attempted && error.name !== 'AbortError') {
        const rejected=['conflict','validation','not_found'].includes(error.code);
        $('change-status').textContent=`${error.message} ${rejected?'Cancel and refresh to review the record before another change.':'Retry submits the same recorded request safely. Cancel does not roll back a delivered change.'}`;
        $('change-status').classList.add('error');
        if(rejected) pending=null;
      }
    } finally { submitting=false; $('confirm-change').disabled=!pending&&!accessCertain; $('cancel-change').disabled=false; }
  });
  $('change-dialog').addEventListener('cancel', event=>{if(submitting) event.preventDefault();});
  $('change-dialog').addEventListener('close',()=>{if(pending&&!submitting){change=null;status('Delivery remains unknown. Refresh, then reopen this record to retry the same request. Closing the dialog did not roll back the change.',true);}});
   $('cancel-change').addEventListener('click',()=>{if(!submitting){$('change-dialog').close();change=null; if(pending) status('Delivery remains unknown. Refresh, then reopen this record to retry the same request. Cancel did not roll back the change.',true);}});
  $('close-detail').addEventListener('click',()=>{$('detail-dialog').close();detailId++;$('detail-body').replaceChildren();});
  $('detail-dialog').addEventListener('close',()=>{detailId++;detailState=null;cancelStaleReads();$('detail-body').replaceChildren();});
  $('detail-body').addEventListener('click',event=>{
    const action=event.target.closest('[data-action]');if(action&&detailState){edit(action.dataset.action,detailState.row);return;}
    const button=event.target.closest('[data-part],[data-detail-page]');if(!button || !detailState) return;
    detailState.focusSelector=button.dataset.part?`[data-part="${button.dataset.part}"]`:`[data-detail-page="${button.dataset.detailPage}"]`;
    if(button.dataset.part) {detailState.part=button.dataset.part;detailState.page=0;} else detailState.page+=Number(button.dataset.detailPage);
    detail(detailState.kind,detailState.row);
  });
  $('results').addEventListener('click',event=>{
    const metric=event.target.closest('[data-metric],[data-stage]');
    if(metric){const target=metric.dataset.metric?metrics[metric.dataset.metric]:['exchanges',{stage:metric.dataset.stage}];if(!target)return;[section,filters]=target;page=0;query='';$('search').value='';load();return;}
    const button=event.target.closest('[data-action]'); if(!button) return;
    const row=rows[Number(button.dataset.index)]; if(!row) return;
    const action=button.dataset.action;
    if(action==='member'||action==='exchange'||action==='support_exchange'||action==='support_detail') detail(action==='member'?'member':action==='support_detail'?'support':'exchange',row);
    else edit(action,row);
  });
  document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>{
    section=button.dataset.section;page=0;query='';filters={};$('search').value='';load();
  }));
  $('record-status').addEventListener('change',()=>{const key=section==='support'?'status':'stage';if($('record-status').value) filters={...filters,[key]:$('record-status').value};else {filters={...filters};delete filters[key];}page=0;load();});
  $('record-age').addEventListener('change',()=>{filters={...filters};if($('record-age').value)filters.age=$('record-age').value;else delete filters.age;page=0;load();});
  $('clear-filters').addEventListener('click',()=>{filters={};page=0;load();});
  $('search-form').addEventListener('submit',event=>{event.preventDefault();query=$('search').value.trim();page=0;load();});
  $('previous').addEventListener('click',()=>{if(page>0){page--;load();}});
  $('next').addEventListener('click',()=>{if((page+1)*25<total){page++;load();}});
  $('refresh').addEventListener('click',load);
  async function logout(switchAccount=false){
    if(localLogout?.pending)return;
    logoutLocked=true;purge('Confirming sign out on this device…');
    $('signout').disabled=true;$('switch-account').disabled=true;$('refresh').disabled=true;
    $('marketplace-signin').hidden=true;
    try{
      if(!localLogout)throw new Error('Authentication is unavailable.');
      await localLogout.run();
      location.assign(switchAccount?'/#signin':'/#home');
    }catch(_){
      status(localLogout?.pending?'Sign out is taking longer than expected and is not confirmed. Wait, then retry or reload to verify.':'Sign out failed and is not confirmed. Retry or reload to verify your session.',true);
      $('signout').disabled=false;$('switch-account').disabled=false;
    }
  }
  $('signout').addEventListener('click',()=>logout());
  $('switch-account').addEventListener('click',()=>logout(true));
  $('marketplace-signin').addEventListener('click',event=>{event.preventDefault();logout(true)});
  const authSubscription = db?.auth.onAuthStateChange((event,session)=>{
    if(logoutLocked)return;
    if(event==='SIGNED_OUT') purge('Signed out. Sign in to your administrator account.');
    else if(lastUserId&&session?.user?.id&&lastUserId!==session.user.id) purge('Account changed. Refresh to verify administrator access.');
    else if(lastUserId&&session?.access_token) {
      try { if(JSON.parse(atob(session.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).aal !== 'aal2') purge('Authenticator verification is required to access the admin console.'); } catch { lockWrites(); }
    }
    else if(session?.user?.id) lastUserId=session.user.id;
  });
  window.addEventListener('unload',()=>authSubscription?.data?.subscription?.unsubscribe());
  window.addEventListener('pagehide',()=>purge('Session locked. Refresh to continue.'));
  window.addEventListener('pageshow',event=>{if(event.persisted) load();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('detail-dialog').open&&!$('change-dialog').open) load();});
  load();
})();
