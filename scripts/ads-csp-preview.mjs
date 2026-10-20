// Read-only production inputs. This is a LOCAL CSP experiment, not ad activation.
// Google's general static-SPA CSP guidance: https://web.dev/articles/strict-csp
// AdSense specifically documents nonce CSP: https://support.google.com/adsense/answer/16283098
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function buildAdsCspPreview(html,csp){
  if(typeof html!=='string'||typeof csp!=='string')throw new Error('HTML and CSP are required.');
  if(/<base\b/i.test(html)||/<meta\b[^>]*http-equiv\s*=\s*["']content-security-policy/i.test(html))throw new Error('Unexpected base or meta CSP.');
  const directives=new Map();
  for(const part of csp.split(';').map(value=>value.trim()).filter(Boolean)){
    const [key,...values]=part.split(/\s+/);
    if(directives.has(key))throw new Error('Duplicate CSP directive: '+key);
    directives.set(key,values);
  }
  if(!directives.has('default-src')||directives.has('script-src-elem')||directives.has('script-src-attr'))throw new Error('Unexpected CSP structure.');
  let entry,original,executable=0;
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/^\s*type="application\/(?:ld\+)?json"(?:\s+id="[\w-]+")?\s*$/i.test(match[1]))continue;
    executable++;
    // Deliberately only accept the known Vite entry shape, never caller-chosen
    // URLs, extra executable scripts or inline bodies that we did not author.
    const attributes=match[1].match(/^\s*type="module"\s+crossorigin(?:="anonymous")?\s+src="(\/assets\/[A-Za-z0-9_-]+\.js)"\s*$/);
    if(!attributes||match[2].trim())throw new Error('Unexpected executable script.');
    entry=attributes[1];original=match[0];
  }
  if(executable!==1)throw new Error('Expected exactly one Vite module entry.');
  const bootstrap=`(()=>{const load=()=>{const s=document.createElement('script');s.type='module';s.crossOrigin='anonymous';s.src=${JSON.stringify(entry)};document.head.appendChild(s)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load()})()`;
  const hash='sha256-'+createHash('sha256').update(bootstrap).digest('base64');
  directives.set('script-src',[`'${hash}'`,"'strict-dynamic'"]);
  directives.set('object-src',["'none'"]);
  directives.set('base-uri',["'none'"]);
  return {
    html:html.replace(original,`<script>${bootstrap}</script>`),entry,bootstrap,hash,
    csp:[...directives].map(([key,values])=>[key,...values].join(' ')).join('; '),
    limitations:[
      'LOCAL PREVIEW ONLY: no changes to Firebase, dist, consent configuration or ad modes.',
      'AdSense only documents nonce-based strict CSP; this static hash alternative needs browser validation.',
      'connect-src, img-src and frame-src are unchanged and can still block CMP/advertising resources.',
      'No unsafe-eval, broad scheme fallback or fixed nonce was added. Older browsers may fail closed.',
      'Localhost is not an approved ad host: no live AdSense request is enabled by this preview.',
    ],
  };
}

export function localAssetPath(root,requestUrl){
  let pathname;
  try{pathname=decodeURIComponent(new URL(requestUrl,'http://127.0.0.1').pathname);}catch{return null;}
  if(pathname.includes('\\')||pathname.includes('\0'))return null;
  const base=resolve(root),target=resolve(base,'.'+pathname);
  return target===base||target.startsWith(base+sep)?target:null;
}

export function createPreviewServer({root,preview}){
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
    '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
  return createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',preview.csp);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=localAssetPath(root,req.url);
    if(!path){res.writeHead(400);res.end();return;}
    try{
      const file=await stat(path).catch(()=>null);
      const isHtml=path===resolve(root,'index.html')||!file;
      if(isHtml||file?.isDirectory()){
        res.setHeader('Content-Type',types['.html']);res.end(req.method==='HEAD'?undefined:preview.html);return;
      }
      // Refuse dot files, symlinks outside root or arbitrary source files. Only
      // dist is served; this helper never exposes the workspace or credentials.
      const {realpath}=await import('node:fs/promises');
      const actual=await realpath(path),actualRoot=await realpath(root);
      if(!actual.startsWith(actualRoot+sep)||!types[extname(path)]){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',types[extname(path)]);res.end(req.method==='HEAD'?undefined:await readFile(actual));
    }catch{res.writeHead(404);res.end();}
  });
}

async function main(){
  const args=process.argv.slice(2);
  if(args.some(arg=>!['--check','--serve'].includes(arg))||args.length>1)throw new Error('Use --check (default) or --serve.');
  const app=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(app,'dist');
  const config=JSON.parse(await readFile(resolve(app,'firebase.json'),'utf8'));
  const csp=config.hosting.headers.find(item=>item.source==='**')?.headers.find(item=>item.key==='Content-Security-Policy')?.value;
  const preview=buildAdsCspPreview(await readFile(resolve(root,'index.html'),'utf8'),csp);
  console.log(JSON.stringify({entry:preview.entry,hash:preview.hash,csp:preview.csp,limitations:preview.limitations},null,2));
  if(args.includes('--serve')){
    const server=createPreviewServer({root,preview});
    server.on('error',error=>{console.error(error.message);process.exitCode=1;});
    server.listen(5198,'127.0.0.1',()=>console.log('Local CSP preview: http://127.0.0.1:5198/ (Ctrl+C to stop)'));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
