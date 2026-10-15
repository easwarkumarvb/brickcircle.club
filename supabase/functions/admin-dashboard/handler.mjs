import {readBoundedJSON, RequestBodyError} from '../_shared/bounded-json.mjs';
// Dependency injection keeps the same authentication boundary testable in Node and Deno.
export function createHandler(createClient, env) {
  const isUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const isCount=value=>Number.isSafeInteger(value)&&value>=0;
  const isDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)&&Number.isFinite(Date.parse(value));
  // Growth report validation is deliberately separate from the read-rows contract:
  // aggregate-only numeric results, bounded arrays, checked dates and version.
  const validReport=(value,days)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    if(value.version!==1||value.days!==days)return false;
    if(!isDate(value.generated_at)||!isDate(value.start_at)||!isDate(value.end_at)||!isDate(value.previous_start_at))return false;
    const metrics=value.metrics;
    const pairs=['new_registrations','active_exchange_collectors','proposals','accepted','handoffs','completed_exchanges','repeat_collectors','cancellations'];
    if(!metrics||typeof metrics!=='object'||Array.isArray(metrics)||
      !pairs.every(key=>metrics[key]&&typeof metrics[key]==='object'&&!Array.isArray(metrics[key])&&isCount(metrics[key].current)&&isCount(metrics[key].previous)))return false;
    const counts=(group,keys)=>Boolean(group)&&typeof group==='object'&&!Array.isArray(group)&&keys.every(key=>isCount(group[key]));
    if(!counts(value.activation,['registered','email_verified','ready']))return false;
    if(!counts(value.exchange_cohort,['proposed','accepted','handed_off','completed','cancelled']))return false;
    if(!counts(value.health,['active_custody','overdue_returns','unresolved_issues','open_support']))return false;
    if(!Array.isArray(value.daily)||value.daily.length>days||
      value.daily.some(row=>!row||typeof row!=='object'||Array.isArray(row)||!isDate(row.date)||!isCount(row.registrations)||!isCount(row.completed_exchanges)))return false;
    if(!Array.isArray(value.cities)||value.cities.length>20||
      value.cities.some(row=>!row||typeof row!=='object'||Array.isArray(row)||
        typeof row.country!=='string'||row.country.length>120||typeof row.city!=='string'||row.city.length>120||
        !isCount(row.registered)||!isCount(row.ready)||!isCount(row.available_sets)||!isCount(row.completed_exchanges)))return false;
    if(!Array.isArray(value.coverage)||value.coverage.length>40||
      value.coverage.some(item=>typeof item!=='string'||item.length>300))return false;
    const definitions=value.definitions;
    if(!definitions||typeof definitions!=='object'||Array.isArray(definitions))return false;
    const definitionKeys=Object.keys(definitions);
    return definitionKeys.length<=60&&definitionKeys.every(key=>key.length<=80&&typeof definitions[key]==='string'&&definitions[key].length<=500);
  };
  const allowed = new Set(['https://brickcircle.club', 'https://www.brickcircle.club',
    ...(env('ADMIN_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)]);
  return async function handle(req) {
    const origin = req.headers.get('Origin');
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
    if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const response = (status, body) => new Response(JSON.stringify(body?.error && !body.code ? {...body, code:({400:'validation',401:'unauthenticated',403:'forbidden',404:'not_found',409:'conflict'}[status] || 'unavailable')} : body), {status, headers});
    if (origin && !allowed.has(origin)) return response(403, {error: 'Origin not allowed.'});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (!['GET', 'POST'].includes(req.method)) return response(405, {error: 'Method not allowed.'});
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192)
      return response(401, {error: 'Sign in to your administrator account.'});
    const url = env('SUPABASE_URL');
    const anon = env('SUPABASE_ANON_KEY');
    if (!url || !anon) return response(503, {error: 'Admin service unavailable.'});
    try {
      const userClient = createClient(url, anon, {global: {headers: {Authorization: authorization}},
        auth: {persistSession: false, autoRefreshToken: false}});
      const {data: authData, error: authError} = await userClient.auth.getUser();
      if (authError) {
        const invalid = [401,403].includes(authError.status) || ['bad_jwt','session_not_found','user_not_found'].includes(authError.code);
        return invalid ? response(401, {error: 'Your session expired. Sign in again.'}) : response(503, {error: 'Authentication temporarily unavailable. Retry shortly.'});
      }
      if (!authData?.user) return response(401, {error: 'Your session expired. Sign in again.'});
      const {data: isExchangeAdmin, error: adminAccessError} = await userClient.rpc('is_exchange_admin');
      if (adminAccessError) return response(503, {error: 'Unable to verify administrator access.'});
      if (isExchangeAdmin !== true) return response(403, {error: 'Administrator access required.'});
      let body = {operation: 'read', section: 'overview'};
      if (req.method === 'POST') {
        try { body = await readBoundedJSON(req, 8192); }
        catch (error) {
          if (error instanceof RequestBodyError) return response(error.status, {error: error.message});
          throw error;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, {error: 'Invalid request.'});
      }
      let result;
      let reportDays;
      if (body.operation === 'read') {
        const sections = ['overview', 'members', 'catalogue', 'exchanges', 'support', 'audit', 'member_detail', 'exchange_detail', ...(body.version===2?['collection','wishlist','support_detail']:[])];
        const section = body.section ?? 'overview';
        const page = body.page ?? 0;
        const query = body.query ?? '';
        if (!sections.includes(section) || !Number.isInteger(page) || page < 0 || page > 100000 ||
          typeof query !== 'string' || query.length > 100 ||
          (section.endsWith('_detail') && !isUUID(body.id)))
          return response(400, {error: 'Invalid search or record ID.'});
        if (body.version!==undefined && body.version!==2) return response(400,{error:'Unsupported contract version.'});
        if(body.version===2) {
          const filters=body.filters===undefined?{}:body.filters;
          const fields={support:{status:['open','in_progress','resolved','actionable'],age:['older_7_days','older_30_days']},exchanges:{stage:['PROPOSED','DECLINED','WITHDRAWN','EXPIRED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING','HANDOFF_ISSUE','ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED','CANCELLED','COMPLETED'],overdue:'boolean'},members:{new:'boolean'},catalogue:{visible:'boolean'},collection:{available:'boolean'}}[section] || {};
          if(!filters || typeof filters!=='object' || Array.isArray(filters) || Object.entries(filters).some(([key,value])=>!Object.hasOwn(fields,key) || (fields[key]==='boolean'?typeof value!=='boolean':!fields[key].includes(value))) ||
            (section==='member_detail'?!['collection','wishlist'].includes(body.part):section==='support_detail'?!['history','events'].includes(body.part):body.part!==undefined))
            return response(400,{error:'Invalid structured filters or detail part.'});
          result=section==='support_detail'?await userClient.rpc('admin_support_detail_v2',{p_id:body.id,p_page:page,p_part:body.part}):await userClient.rpc('admin_marketplace_read_v2',{p_section:section,p_query:query,p_page:page,p_id:body.id??null,p_filters:filters,p_part:body.part??null});
        } else {
          if(body.filters!==undefined || body.part!==undefined) return response(400,{error:'Structured fields require contract version 2.'});
          result = await userClient.rpc('admin_marketplace_read', {p_section: section, p_query: query, p_page: page, p_id: body.id ?? null});
        }
      } else if (body.operation === 'report') {
        // Growth reporting is read-only and separate from the rows contract:
        // strict version, strictly integer day window, no unknown request keys.
        if (Object.keys(body).some(key => !['operation', 'version', 'days'].includes(key)) ||
          body.version !== 1 || !Number.isInteger(body.days) || ![7, 28, 90].includes(body.days))
          return response(400, {error: 'Invalid growth report range.'});
        reportDays = body.days;
        result = await userClient.rpc('admin_growth_report', {p_days: body.days});
      } else if(body.operation==='note') {
        if(!isUUID(body.id) || !isUUID(body.request_id) || typeof body.reason!=='string' || body.reason.trim().length<10 || body.reason.trim().length>1000)
          return response(400,{error:'Invalid note. Include 10–1000 characters.'});
        result=await userClient.rpc('admin_support_note',{p_id:body.id,p_note:body.reason,p_request:body.request_id});
      } else if (body.operation === 'mutate') {
        if (!['catalogue', 'support'].includes(body.entity) || typeof body.id !== 'string' || body.id.length > 100 ||
          !Number.isInteger(body.revision) || body.revision < 0 || typeof body.reason !== 'string' ||
          body.reason.trim().length < 10 || body.reason.trim().length > 1000 ||
          !isUUID(body.request_id) ||
          !(body.entity === 'catalogue' ? ['visible', 'hidden'] : ['open', 'in_progress', 'resolved']).includes(body.value))
          return response(400, {error: 'Invalid change. Include a reason of 10–1000 characters.'});
        result = await userClient.rpc('admin_marketplace_mutate', {p_entity: body.entity, p_id: body.id,
          p_value: body.value, p_revision: body.revision, p_reason: body.reason, p_request: body.request_id});
      } else return response(400, {error: 'Unknown operation.'});
      if (result.error) {
        const code = result.error.code;
        if (code === 'PT403') return response(403, {error: 'Authenticator verification required.', code: 'mfa_required'});
        if (code === '42501') return response(403, {error: 'Administrator access or active session required.'});
        if (code === '40001') return response(409, {error: 'Record changed or request ID reused. Refresh and review the latest record.'});
        if (['22023', '22P02'].includes(code)) return response(400, {error: 'Invalid request values.'});
        if (code === 'P0002') return response(404, {error: 'Record not found.'});
        return response(503, {error: 'Admin service unavailable. Retry shortly.'});
      }
      if (reportDays !== undefined && !validReport(result.data, reportDays))
        return response(503, {error: 'Growth report unavailable. Retry shortly.'});
      return response(200, result.data);
    } catch { return response(503, {error: 'Admin service unavailable. Retry shortly.'}); }
  };
}
