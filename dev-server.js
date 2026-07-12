const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = 3000;
const ROOT = __dirname;
const WORKER = 'https://mangku-resto-api.pemerintah-rkrp-dashboard.workers.dev';
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon',
  '.json':'application/json; charset=utf-8'
};

async function proxy(request, response) {
  const chunks=[];
  for await (const chunk of request) chunks.push(chunk);
  const headers={...request.headers};
  delete headers.host; delete headers.connection;
  const upstream=await fetch(WORKER+request.url,{
    method:request.method,headers,
    body:['GET','HEAD'].includes(request.method)?undefined:Buffer.concat(chunks),
    redirect:'manual'
  });
  const responseHeaders=Object.fromEntries(upstream.headers);
  delete responseHeaders['content-encoding'];
  delete responseHeaders['content-length'];
  delete responseHeaders['transfer-encoding'];
  response.writeHead(upstream.status,responseHeaders);
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function serveFile(request, response) {
  const url=new URL(request.url,'http://localhost');
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==='/'||!path.extname(pathname))pathname='/index.html';
  const file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT))return response.writeHead(403).end('Forbidden');
  try{
    const content=await fs.readFile(file);
    response.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    response.end(content);
  }catch{response.writeHead(404).end('Not found')}
}

http.createServer(async(request,response)=>{
  try{
    if(request.url.startsWith('/api/'))await proxy(request,response);
    else await serveFile(request,response);
  }catch(error){console.error(error);response.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}))}
}).listen(PORT,()=>console.log(`Mangku Resto berjalan di http://localhost:${PORT}`));
