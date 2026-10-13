import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('profile location trigger can call the private city normalizer during authenticated onboarding',()=>{
  const sql=read('supabase/migrations/20260830_fix_profile_city_normalization_permissions_v35.sql');
  expect(sql).toContain('create or replace function public.normalize_profile_beta_location()');
  expect(sql).toContain('security definer');
  expect(sql).toContain("set search_path = 'public'");
  expect(sql).toContain('new.city := public.normalize_beta_city(new.country, new.city);');
  expect(sql).toContain('alter function public.normalize_profile_beta_location() owner to postgres;');
});

test('location trigger remains internal instead of exposing privileged helpers to client roles',()=>{
  const sql=read('supabase/migrations/20260830_fix_profile_city_normalization_permissions_v35.sql');
  expect(sql).toContain('revoke all on function public.normalize_profile_beta_location() from public, anon, authenticated;');
  expect(sql).toContain('grant execute on function public.normalize_profile_beta_location() to postgres, service_role;');
  expect(sql).not.toContain('grant execute on function public.normalize_beta_city');
});
