import { createClient } from '@supabase/supabase-js';

const url = (globalThis as typeof globalThis & { BC_SUPABASE_URL?: string }).BC_SUPABASE_URL ?? '';
const key = (globalThis as typeof globalThis & { BC_SUPABASE_PUBLISHABLE_KEY?: string }).BC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const supabase = createClient(url, key);

export async function loadPublicProfiles(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('public_profiles')
    .select('id,display_name,city,country,rating,review_count,identity_verified,avatar_url')
    .in('id', ids);
  if (error) throw error;
  return data ?? [];
}

export async function timedFindMatches(userId: string) {
  const started = performance.now();
  const result = await supabase.rpc('find_matches', { p_user: userId });
  const duration = performance.now() - started;
  if (!result.error && Math.random() < 0.25) {
    void supabase.from('product_metrics').insert({
      user_id: userId,
      metric_name: 'find_matches_ms',
      duration_ms: Math.round(duration * 100) / 100,
      properties: { source: 'typed-client-v1' }
    });
  }
  return result;
}
