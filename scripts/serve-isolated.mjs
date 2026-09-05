import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const port=Number(process.argv[2]||4173);
const types={'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};

const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url||'/',`http://${request.headers.host||'127.0.0.1'}`).pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,relative);
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end('Forbidden');return}
  fs.readFile(file,(error,data)=>{if(error){response.writeHead(error.code==='ENOENT'?404:500).end('Not found');return}response.writeHead(200,{'content-type':types[path.extname(file).toLowerCase()]||'application/octet-stream'}).end(data)});
});
server.listen(port,'127.0.0.1');
const close=()=>{server.closeAllConnections?.();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),500).unref()};
process.on('SIGINT',close);process.on('SIGTERM',close);
