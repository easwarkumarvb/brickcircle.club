import {test,expect} from '../isolated/fixtures';
test('extra actor contexts block external HTTP and sockets before connecting',async({browser})=>{
 const context=await browser.newContext();
 try{
  const page=await context.newPage();await page.goto('/v2.html?isolated=signed-out');
  const failures:string[]=[];page.on('requestfailed',request=>{if(request.url().includes('transport-proof.invalid'))failures.push(request.failure()?.errorText||'')});
  const outcome=await page.evaluate(async()=>{
   let http='';try{await fetch('https://transport-proof.invalid/check');http='unexpected'}catch{http='blocked'}
   const socket=await new Promise<string>(resolve=>{const socket=new WebSocket('wss://transport-proof.invalid/check');socket.onopen=()=>resolve('unexpected');socket.onclose=()=>resolve('blocked');socket.onerror=()=>resolve('blocked')});
   return {http,socket};
  });
  expect(outcome).toEqual({http:'blocked',socket:'blocked'});
  expect(failures).toHaveLength(1);
  expect(failures[0]).toMatch(/^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/);
 }finally{await context.close()}
});
