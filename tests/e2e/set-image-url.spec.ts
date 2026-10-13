import { test, expect } from '@playwright/test';

const setKey=(set:string)=>/-\d+$/.test(set)?set:`${set}-1`;
const bricksetUrl=(set:string)=>`https://images.brickset.com/sets/images/${encodeURIComponent(setKey(set))}.jpg`;

test('set image URL does not double-append the inventory suffix',()=>{
  expect(bricksetUrl('42228-1')).toBe('https://images.brickset.com/sets/images/42228-1.jpg');
  expect(bricksetUrl('71049-4')).toBe('https://images.brickset.com/sets/images/71049-4.jpg');
  expect(bricksetUrl('42172')).toBe('https://images.brickset.com/sets/images/42172-1.jpg');
});
