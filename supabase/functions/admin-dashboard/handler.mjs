// Dependency injection keeps the same authentication boundary testable in Node and Deno.
export function createHandler(createClient, env) {
  const allowed = new Set(['https://brickcircle.club', 'https://www.brickcircle.club',
    ...(env('ADMIN_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)]);
  return async function handle(req) {
    const origin = req.headers.get('Origin');
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
    if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const response = (status, body) => new Response(JSON.stringify(body), {status, headers});
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
      if (authError || !authData?.user) return response(401, {error: 'Your session expired. Sign in again.'});
      const {data: isExchangeAdmin, error: adminAccessError} = await userClient.rpc('is_exchange_admin');
      if (adminAccessError) return response(503, {error: 'Unable to verify administrator access.'});
      if (isExchangeAdmin !== true) return response(403, {error: 'Administrator access required.'});
      let body = {operation: 'read', section: 'overview'};
      if (req.method === 'POST') {
        if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
          return response(415, {error: 'JSON required.'});
        if (Number(req.headers.get('Content-Length')) > 8192) return response(413, {error: 'Request too large.'});
        const raw = await req.text();
        if (new TextEncoder().encode(raw).length > 8192) return response(413, {error: 'Request too large.'});
        try { body = JSON.parse(raw); } catch { return response(400, {error: 'Invalid JSON.'}); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, {error: 'Invalid request.'});
      }
      let result;
      if (body.operation === 'read') {
        const sections = ['overview', 'members', 'catalogue', 'exchanges', 'support', 'audit', 'member_detail', 'exchange_detail'];
        const section = body.section ?? 'overview';
        const page = body.page ?? 0;
        const query = body.query ?? '';
        if (!sections.includes(section) || !Number.isInteger(page) || page < 0 || page > 100000 ||
          typeof query !== 'string' || query.length > 100 ||
          (section.endsWith('_detail') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id ?? '')))
          return response(400, {error: 'Invalid search or record ID.'});
        result = await userClient.rpc('admin_marketplace_read', {p_section: section, p_query: query, p_page: page, p_id: body.id ?? null});
      } else if (body.operation === 'mutate') {
        if (!['catalogue', 'support'].includes(body.entity) || typeof body.id !== 'string' || body.id.length > 100 ||
          !Number.isInteger(body.revision) || body.revision < 0 || typeof body.reason !== 'string' ||
          body.reason.trim().length < 10 || body.reason.trim().length > 1000 ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id ?? '') ||
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
      return response(200, result.data);
    } catch { return response(503, {error: 'Admin service unavailable. Retry shortly.'}); }
  };
}
