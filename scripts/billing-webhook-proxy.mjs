/** Closed local relay for a future sandbox-only tunnel. Never reads keys or starts on import. */
import http from 'node:http';
import {pathToFileURL} from 'node:url';

export const PROXY_HOST='127.0.0.1';
export const PROXY_PORT=8787;
export const WEBHOOK_PATH='/revenuecatWebhook';
export const WEBHOOK_TARGET='http://127.0.0.1:5001/demo-brote/europe-west1/revenuecatWebhook';
export const MAX_BODY_BYTES=262144;
const SIGNATURE='x-revenuecat-webhook-signature';
const fault=(status)=>Object.assign(new Error('Local webhook relay rejected the request.'),{status});

export function assertWebhookTarget(value){
  if(value!==WEBHOOK_TARGET)throw Error('Only the fixed demo-brote Functions emulator endpoint is allowed.');
  const url=new URL(value);
  if(url.origin!=='http://127.0.0.1:5001'||url.username||url.password||url.hash||url.search)throw Error('Invalid local webhook target.');
  return url;
}

function headerCount(req,name){
  let count=0;
  for(let index=0;index<(req.rawHeaders?.length||0);index+=2)if(String(req.rawHeaders[index]).toLowerCase()===name)count++;
  return count;
}
function approvedRequest(req){
  const headers=req.headers||{},type=headers['content-type'],signature=headers[SIGNATURE];
  if(req.method!=='POST'||req.url!==WEBHOOK_PATH||headers.host!==PROXY_HOST+':'+PROXY_PORT)return false;
  if(headerCount(req,'host')>1||headerCount(req,SIGNATURE)>1||headerCount(req,'content-type')>1||headerCount(req,'content-length')>1)return false;
  if(typeof type!=='string'||type.length>80||!/^[\x20-\x7E]+$/.test(type)||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(type.trim()))return false;
  if(typeof signature!=='string'||!signature||signature.length>512||!/^[\x20-\x7E]+$/.test(signature))return false;
  if(headers['content-encoding']!==undefined&&headers['content-encoding']!=='identity')return false;
  if(headers['transfer-encoding']!==undefined&&headers['transfer-encoding']!=='chunked')return false;
  if(headers['transfer-encoding']!==undefined&&headers['content-length']!==undefined)return false;
  return true;
}
function reply(res,status){
  if(res.destroyed||res.writableEnded)return;
  const body=JSON.stringify({ok:status>=200&&status<300});
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Connection:'close',...(status===429?{'Retry-After':'1'}:{})});
  res.end(body);
}
async function rawBody(req,timeoutMs){
  const claimed=req.headers?.['content-length'];
  if(claimed!==undefined&&(typeof claimed!=='string'||!/^(0|[1-9]\d{0,9})$/.test(claimed)))throw fault(404);
  if(claimed!==undefined&&Number(claimed)>MAX_BODY_BYTES)throw fault(413);
  if(req.readableEncoding)throw fault(404); // Raw byte preservation requires an untouched stream.
  return new Promise((resolve,reject)=>{
    let bytes=0,ended=false;const chunks=[];
    const timer=setTimeout(()=>finish(fault(408)),timeoutMs);
    function cleanup(){clearTimeout(timer);req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('aborted',onAbort);}
    function finish(error){if(ended)return;ended=true;cleanup();if(error)reject(error);else resolve(Buffer.concat(chunks,bytes));}
    function onData(chunk){
      if(!Buffer.isBuffer(chunk)){finish(fault(404));return;}
      bytes+=chunk.length;
      if(bytes>MAX_BODY_BYTES){finish(fault(413));return;}
      chunks.push(chunk);
    }
    function onEnd(){finish(claimed!==undefined&&Number(claimed)!==bytes?fault(400):null);}
    function onError(){finish(fault(400));}
    function onAbort(){finish(fault(400));}
    req.on('data',onData);req.once('end',onEnd);req.once('error',onError);req.once('aborted',onAbort);
    if(req.aborted)onAbort();
  });
}

export function createWebhookProxy(options={}){
  if(!options||typeof options!=='object'||Object.keys(options).some(key=>!['fetchImpl','bodyTimeoutMs','upstreamTimeoutMs','maxConcurrent'].includes(key)))throw Error('The local relay does not accept destination, host or port overrides.');
  const {fetchImpl=fetch,bodyTimeoutMs=5000,upstreamTimeoutMs=45000,maxConcurrent=4}=options;
  if(typeof fetchImpl!=='function'||!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>5000||!Number.isSafeInteger(upstreamTimeoutMs)||upstreamTimeoutMs<1||upstreamTimeoutMs>45000||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4)throw Error('Invalid local relay resource limits.');
  assertWebhookTarget(WEBHOOK_TARGET);let active=0;
  async function handler(req,res){
    if(!approvedRequest(req)){reply(res,404);return;}
    if(active>=maxConcurrent){reply(res,429);return;}
    active++;
    try{
      const body=await rawBody(req,bodyTimeoutMs),controller=new AbortController();
      if(req.aborted||res.destroyed)throw fault(400);
      let timer,rejectInterrupted;
      const interrupted=new Promise((resolve,reject)=>{rejectInterrupted=reject;timer=setTimeout(()=>{reject(fault(504));controller.abort();},upstreamTimeoutMs);});
      const disconnect=()=>{if(!res.writableEnded){rejectInterrupted(fault(400));controller.abort();}};
      res.once('close',disconnect);
      let response;
      try{
        response=await Promise.race([Promise.resolve().then(()=>fetchImpl(WEBHOOK_TARGET,{method:'POST',headers:{'Content-Type':'application/json',[SIGNATURE]:req.headers[SIGNATURE]},body,redirect:'error',signal:controller.signal})),interrupted]);
      }finally{clearTimeout(timer);res.off('close',disconnect);}
      // No upstream headers, payload or errors are reflected to the public side.
      try{response?.body?.cancel?.()?.catch?.(()=>{});}catch{}
      if(!Number.isInteger(response?.status)||response.status<200||response.status>599||response.status>=300&&response.status<400)throw fault(502);
      reply(res,response.status);
    }catch(error){reply(res,[400,404,408,413,504].includes(error?.status)?error.status:502);}
    finally{active--;}
  }
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:5000,keepAliveTimeout:1000},(req,res)=>{void handler(req,res).catch(()=>res.destroy());});
  server.maxHeadersCount=32;server.maxRequestsPerSocket=1;
  server.on('clientError',(error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');else socket.destroy();});
  return {server,handler,inFlight:()=>active,host:PROXY_HOST,port:PROXY_PORT};
}

async function main(){
  if(process.argv.length!==2)throw Error('Usage: node scripts/billing-webhook-proxy.mjs (local sandbox only).');
  const {server}=createWebhookProxy();
  server.on('error',()=>{console.error('No se pudo abrir el proxy local. No se registran cabeceras ni cuerpos.');process.exitCode=1;});
  server.listen({host:PROXY_HOST,port:PROXY_PORT},()=>console.log('Proxy sandbox local: 127.0.0.1:8787; solo POST /revenuecatWebhook. No se ha abierto ningún túnel.'));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(()=>{console.error('No se pudo preparar el proxy sandbox local.');process.exitCode=1;});
}
