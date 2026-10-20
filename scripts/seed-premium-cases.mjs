import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {encodeFirestoreValue} from './seed-game-catalog.mjs';
import {COURSE_PARTS,CASE_PARTS} from '../src/content-files.js';
import {validateCases} from '../src/cases-validation.js';

const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL('src/content/'+name+'.json',root),'utf8'));
const cases=(await Promise.all(CASE_PARTS.map(read))).flatMap(x=>x.cases);
const lessons=(await Promise.all(COURSE_PARTS.map(read))).flatMap(x=>x.lessons);
validateCases(cases,{lessons});
// Cases contain nested table arrays, which Firestore cannot store as native arrays.
// Preserve the authored payload exactly inside the same protected document.
const records=cases.map(item=>({path:'premiumCases/case-'+(item.world+1),data:{schemaVersion:1,caseJson:JSON.stringify(item)}}));
const out=process.argv.indexOf('--out');
if(out>=0){if(!process.argv[out+1])throw Error('Falta destino.');await writeFile(process.argv[out+1],JSON.stringify({records},null,2)+'\n');}
if(process.argv.includes('--publish')){
  const projectFlag=process.argv.indexOf('--project'),project=process.argv[projectFlag+1];
  if(projectFlag<0||project!=='brote-62d26')throw Error('Solo se admite --project brote-62d26.');
  const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
  const account=auth.getProjectDefaultAccount(fileURLToPath(root))||auth.getGlobalDefaultAccount();
  if(!account?.tokens?.refresh_token)throw Error('Falta la sesión local de Firebase CLI.');
  const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const prefix=`projects/${project}/databases/(default)/documents`;
  const response=await fetch(`https://firestore.googleapis.com/v1/${prefix}:commit`,{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({writes:records.map(r=>({update:{name:prefix+'/'+r.path,fields:encodeFirestoreValue(r.data).mapValue.fields}}))})});
  if(!response.ok){const detail=await response.json().catch(()=>null);throw Error('No se publicaron los casos protegidos. HTTP '+response.status+': '+(detail?.error?.message||'Respuesta no disponible.'));}
  console.log(cases.length+' casos publicados en documentos protegidos. No se modifican cuentas ni saldos.');
}else console.log(cases.length+' casos premium validados. Sin publicación.');
