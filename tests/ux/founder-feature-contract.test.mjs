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

test('landing route places the photo-led founder feature before the longer story',()=>{
  const landingRoute=app.match(/async function renderHome\\(token\\)\\{\\s*if\\(!S\\.user\\)\\{([\\s\\S]*?)return;\\s*\\}/)?.[1];
  const featureHeadingId=app.match(/function landingFounderFeature\\(\\).*?<h2 id="([^"]+)"/s)?.[1];
  const storyHeadingId=app.match(/function landingFounderStory\\(\\).*?<h2 id="([^"]+)"/s)?.[1];
  assert.ok(landingRoute);
  assert.ok(landingRoute.indexOf('landingFounderFeature()')<landingRoute.indexOf('landingFounderStory()'));
  assert.equal(featureHeadingId,'bc-founder-feature-title');
  assert.equal(storyHeadingId,'bc-founder-title');
  assert.notEqual(featureHeadingId,storyHeadingId);
});

test('founder feature has a mobile media-query style',()=>{
  assert.match(css,/@media\s*\([^)]*\)\s*\{[^}]*\.bc-founder-feature/s);
});
