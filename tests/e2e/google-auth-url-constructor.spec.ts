import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const auth = fs.readFileSync('app-v3.js','utf8');

test('Google auth uses the supported Supabase OAuth handoff', async () => {
  expect(auth).toContain('signInWithOAuth({provider,options:');
  expect(auth).toContain("provider==='google'");
  expect(auth).toContain('skipBrowserRedirect:true');
  expect(auth).toContain('location.assign(data.url)');
  expect(auth).not.toContain("searchParams.get('client_id')");
  expect(auth).not.toContain('Google sign-in configuration could not be found.');
  expect(auth).not.toMatch(/const\s+URL\s*=\s*['\"]https?:\/\//);
  expect(auth).toContain("const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co'");
});
