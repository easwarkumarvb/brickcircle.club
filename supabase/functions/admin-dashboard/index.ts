import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const OWNER_USER_ID = '388ee0a7-2b93-4505-a70c-f4766d7ad50a'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') || ''
    if (!url || !anon || !service) return json({ error: 'Server configuration is incomplete.' }, 500)
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in required.' }, 401)

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Session is invalid or expired.' }, 401)

    const isOwner = authData.user.id === OWNER_USER_ID
    const hasAdminRole = authData.user.app_metadata?.role === 'admin'
    if (!isOwner || !hasAdminRole) return json({ error: 'Owner administrator access required.' }, 403)

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const [profilesR, collectionR, wishlistR, requestsR, exchangesR, setsR] = await Promise.all([
      admin.from('profiles').select('id,display_name,email,country,city,trust_score,created_at,member_since,adult_confirmed_at,adult_confirmation_version'),
      admin.from('collection_items').select('user_id,set_number,condition,completeness,available_for_exchange,created_at'),
      admin.from('wishlists').select('user_id,set_number,priority,created_at'),
      admin.from('exchange_requests').select('requester_id,responder_id,status,created_at'),
      admin.from('exchanges').select('user_a,user_b,state,created_at,completed_at'),
      admin.from('lego_sets').select('set_number,name,theme,year').eq('catalog_active', true),
    ])

    const firstError = [profilesR, collectionR, wishlistR, requestsR, exchangesR, setsR].find(x => x.error)?.error
    if (firstError) throw firstError

    const profiles = profilesR.data || []
    const collection = collectionR.data || []
    const wishlist = wishlistR.data || []
    const requests = requestsR.data || []
    const exchanges = exchangesR.data || []
    const sets = Object.fromEntries((setsR.data || []).map(s => [String(s.set_number), s]))
    const byUser = new Map<string, any>()

    for (const p of profiles) byUser.set(p.id, { ...p, collection: [], wishlist: [], request_count: 0, exchange_count: 0 })
    for (const item of collection) byUser.get(item.user_id)?.collection.push(item)
    for (const item of wishlist) byUser.get(item.user_id)?.wishlist.push(item)
    for (const r of requests) {
      byUser.get(r.requester_id) && (byUser.get(r.requester_id).request_count += 1)
      if (r.responder_id !== r.requester_id) byUser.get(r.responder_id) && (byUser.get(r.responder_id).request_count += 1)
    }
    for (const e of exchanges) {
      byUser.get(e.user_a) && (byUser.get(e.user_a).exchange_count += 1)
      if (e.user_b !== e.user_a) byUser.get(e.user_b) && (byUser.get(e.user_b).exchange_count += 1)
    }

    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const requestClosed = new Set(['cancelled','declined','rejected','expired','completed'])
    const exchangeClosed = new Set(['completed','cancelled','cancelled_by_user','closed'])
    const completedStates = new Set(['completed','returned','closed'])
    const users = [...byUser.values()].sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

    return json({
      summary: {
        users: users.length,
        new_7d: users.filter(u => new Date(u.created_at || 0).getTime() >= weekAgo).length,
        collection_items: collection.length,
        wishlist_items: wishlist.length,
        exchangeable_items: collection.filter(x => x.available_for_exchange).length,
        users_with_collection: users.filter(u => u.collection.length > 0).length,
        users_with_wishlist: users.filter(u => u.wishlist.length > 0).length,
        open_requests: requests.filter(r => !requestClosed.has(String(r.status || '').toLowerCase())).length,
        active_exchanges: exchanges.filter(e => !exchangeClosed.has(String(e.state || '').toLowerCase())).length,
        completed_exchanges: exchanges.filter(e => completedStates.has(String(e.state || '').toLowerCase()) || !!e.completed_at).length,
      },
      users,
      sets,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('admin-dashboard error', error)
    return json({ error: 'Could not load dashboard data.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
