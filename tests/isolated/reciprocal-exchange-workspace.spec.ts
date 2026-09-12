import fs from 'node:fs';
import {test,expect} from './fixtures';
test('reciprocal exchanges use one shared realtime workspace',async()=>{const s=fs.readFileSync('app-v3.js','utf8');for(const x of ['function exchangePhase','function sharedChecklist','Shared live progress','Other collector:','function startExchangeRealtime',"table:'exchange_meetups'","table:'exchange_returns'",'Accept & reserve sets'])expect(s).toContain(x)});
