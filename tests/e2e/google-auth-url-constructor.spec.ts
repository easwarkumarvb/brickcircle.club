import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const auth = fs.readFileSync('v3-auth-onboarding-hotfix.js','utf8');

test('Google auth helper does not shadow the browser URL constructor', async () => {
  expect(auth).not.toMatch(/const\s+URL\s*=\s*['\"]https?:\/\//);
  expect(auth).toContain('new window.URL(data.url)');
  expect(auth).toContain("const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co'");
});
