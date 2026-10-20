import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {TRACKS} from '../src/tracks.js';

// Bounded read-only check: public web only, no users, Firestore writes or credentials.
if(process.argv.length>2)throw Error('No admite destinos alternativos.');
const root=new URL('../',import.meta.url),out=new URL('../../../outputs/ochavo-beta-controlada/',import.meta.url);
const version=JSON.parse(await readFile(new URL('package.json',root),'utf8')).version;
const local=await readFile(new URL('dist/index.html',root));
const course=JSON.parse(local.toString().match(/<script[^>]*id="br-course"[^>]*>([\s\S]*?)<\/script>/)[1]);
const initial=TRACKS.flatMap(t=>t.groupIds.slice(0,2).map(id=>course.worldFiles.find(f=>f.id===id).url));
const assets=[...new Set([...local.toString().matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m=>m[1]))];
const paths=['/','/beta/','/privacidad/','/eliminar-cuenta/','/ayuda/',...initial,...assets];
const checks=[],hash=b=>createHash('sha256').update(b).digest('hex');
for(const path of paths){
  const started=performance.now();
  const r=await fetch('https://ochavo.app'+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
  const body=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200,path+' HTTP');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff',path+' nosniff');
  assert.ok(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),path+' CSP');
  const file=path.endsWith('/')?path+'index.html':path;
  assert.equal(hash(body),hash(await readFile(new URL('dist'+file,root))),path+' published bytes');
  if(path.startsWith('/course/')||path.startsWith('/assets/'))assert.ok(r.headers.get('cache-control')?.includes('immutable'),path+' immutable cache');
  checks.push({path,status:r.status,bytes:body.length,elapsedMs:Math.round(performance.now()-started),matchesBuild:true});
}
const report={checkedAt:new Date().toISOString(),version,requests:checks.length,scope:'Bounded public GETs from this PC, no production load test or account access',ok:true,checks};
await mkdir(out,{recursive:true});await writeFile(new URL('comprobacion-web-publicada.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
