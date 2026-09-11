import {test,expect} from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('adult confirmation is mandatory, server-stamped and immutable',()=>{
  const app=read('app-v3.js');
  const migration=read('supabase/migrations/20260911070000_require_adult_confirmation.sql');

  expect(app).toContain('name="adult_confirmation" type="checkbox" required');
  expect(app).toContain("db.rpc('confirm_adult_status'");
  expect(migration).toContain('adult_confirmed_at timestamptz');
  expect(migration).toContain('security definer');
  expect(migration).toContain('protect_adult_confirmation');
  expect(migration).toContain('revoke all on function public.confirm_adult_status(text, text) from public, anon');
  expect(migration).toContain('grant execute on function public.confirm_adult_status(text, text) to authenticated');
});

test('admin data remains behind the dual owner and admin-role server gate',()=>{
  const client=read('admin-dashboard.js');
  const edge=read('supabase/functions/admin-dashboard/index.ts');
  const config=JSON.parse(read('vercel.json'));

  expect(client).toContain("user.id!==OWNER_USER_ID");
  expect(edge).toContain("authData.user.id === OWNER_USER_ID");
  expect(edge).toContain("authData.user.app_metadata?.role === 'admin'");
  expect(edge).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
  expect(edge).toContain("if (!isOwner || !hasAdminRole)");
  expect(edge).toContain("'Cache-Control': 'no-store'");
  expect(read('admin-dashboard.js')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');

  const adminHeaders=config.headers.find((entry:any)=>entry.source==='/admin.html')?.headers||[];
  expect(adminHeaders).toContainEqual({key:'X-Frame-Options',value:'DENY'});
  expect(adminHeaders.some((header:any)=>header.key==='Content-Security-Policy'&&header.value.includes("frame-ancestors 'none'"))).toBe(true);
});

test('owner Admin label is black and logout is visible in the signed-in shell',()=>{
  const app=read('app-v3.js');
  const css=read('app-v3.css');
  expect(app).toContain('data-signout-top>Log out</button>');
  expect(css).toMatch(/\.bc-owner-admin-link\{[^}]*background:#fff;[^}]*color:#111827/);
});
