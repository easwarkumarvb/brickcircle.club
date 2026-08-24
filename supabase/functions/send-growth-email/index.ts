import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const workerSecret = Deno.env.get('GROWTH_EMAIL_WORKER_SECRET');
  const suppliedSecret = req.headers.get('x-brickcircle-worker-secret');
  if (!workerSecret || !suppliedSecret || suppliedSecret !== workerSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !emailFrom) {
    return json({ error: 'Email worker is not configured' }, 503);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: loadError } = await db
    .from('email_outbox')
    .select('id,recipient_email,subject,payload,attempt_count')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(10);

  if (loadError) return json({ error: loadError.message }, 500);

  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const { data: claimed, error: claimError } = await db
      .from('email_outbox')
      .update({ status: 'processing', attempt_count: Number(row.attempt_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) continue;

    const title = String(row.payload?.title || row.subject || 'BrickCircle update');
    const body = String(row.payload?.body || 'You have a new BrickCircle update.');
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:auto;padding:24px"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><p><a href="https://brickcircle.club/v2.html" style="display:inline-block;padding:12px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:8px">Open BrickCircle</a></p><p style="font-size:12px;color:#667085">BrickCircle.club · Adult LEGO fan exchange community</p></div></body></html>`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ from: emailFrom, to: [row.recipient_email], subject: row.subject, html }),
      });
      const provider = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(provider?.message || `Resend HTTP ${response.status}`);

      await db.from('email_outbox').update({
        status: 'sent',
        provider_message_id: provider?.id || null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', row.id);
      sent++;
    } catch (error) {
      const attempts = Number(row.attempt_count || 0) + 1;
      const finalFailure = attempts >= 5;
      const delayMinutes = Math.min(60 * 24, Math.pow(2, attempts) * 5);
      await db.from('email_outbox').update({
        status: finalFailure ? 'failed' : 'pending',
        last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      failed++;
    }
  }

  return json({ ok: true, processed: (rows ?? []).length, sent, failed });
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}
