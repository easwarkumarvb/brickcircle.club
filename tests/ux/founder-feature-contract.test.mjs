import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app=readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../app-v3.css',import.meta.url),'utf8');

test('landing founder feature preserves its source contract',()=>{
  assert.match(app,/landingFounderFeature/);
  assert.match(app,/Built for the love of building\./);
  assert.match(app,/founder-easwar-kumar\.jpg\.jpeg/);
});

test('founder feature has a mobile media-query style',()=>{
  assert.match(css,/@media\s*\([^)]*\)\s*\{[^}]*\.bc-founder-feature/s);
});
