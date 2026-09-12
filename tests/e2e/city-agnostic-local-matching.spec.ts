import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');
const migration='supabase/migrations/20260912022500_city_agnostic_local_matching.sql';

test('@static landing and cities pages describe featured cities as examples, not a whitelist',()=>{
  const index=read('index.html');
  const cities=read('cities.html');
  expect(index).toContain('Some of the Featured Cities');
  expect(index).toContain('every city and country available in our registration selector');
  expect(index).toContain('same city and country');
  expect(cities).toContain('Some of the Featured Cities');
  expect(cities).toContain('These are examples only');
  expect(cities).toContain('does not need a separate BrickCircle launch');
  expect(cities).not.toContain('Featured beta cities');
  expect(cities).not.toContain('same supported city');
});

test('@static dropdown contains representative multi-country cities',()=>{
  const locations=read('locations-v3.js');
  for(const city of ['Mumbai','Pune','Bengaluru','London','New York','Tokyo','Dubai']){
    expect(locations).toContain(`'${city}'`);
  }
});

test('@static neutral city normalization preserves aliases and arbitrary-city fallback',()=>{
  const sql=read(migration);
  expect(sql).toContain('create or replace function public.normalize_city');
  expect(sql).toContain("('bombay','mumbai')");
  expect(sql).toContain("('bangalore','bengaluru')");
  expect(sql).toContain('return c;');
  expect(sql).toContain('create or replace function public.normalize_beta_city');
  expect(sql).toContain('select public.normalize_city(p_country, p_city)');
  expect(sql).not.toMatch(/update\s+public\.profiles/i);
  expect(sql).not.toMatch(/delete\s+from\s+public\.profiles/i);
});

test('@static matching, notifications and exchange acceptance share the same locality rule',()=>{
  const sql=read(migration);
  const normalizeUses=(sql.match(/public\.normalize_city\(/g)||[]).length;
  expect(normalizeUses).toBeGreaterThanOrEqual(7);
  expect(sql).toContain('create or replace function public.find_matches');
  expect(sql).toContain('create or replace function public.queue_new_reciprocal_match_notifications');
  expect(sql).toContain('create or replace function public.respond_exchange_request');
  expect(sql).toContain("BrickCircle supports in-person exchanges only between collectors registered in the same city and country");
  expect(sql).not.toContain('same supported beta city');
  expect(sql).not.toContain('choose a supported beta city');
});
