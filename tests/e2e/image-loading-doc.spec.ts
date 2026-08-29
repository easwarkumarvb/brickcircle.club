import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('image loading fix documents the double-suffix root cause',()=>{
  const doc=fs.readFileSync('IMAGE_LOADING_FIX.md','utf8');
  expect(doc).toContain('42228-1-1.jpg');
  expect(doc).toContain('No paid image service');
});
