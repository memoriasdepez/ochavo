import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createGoogleClients} from '../work/payments/store-server-secrets.mjs';

// Explicitly approved on 2026-10-10: daily Firestore backups, seven-day retention.
// Fixed project/body; never removes or alters another schedule.
if(process.argv.slice(2).join(' ')!=='--activate-approved')throw Error('Use --activate-approved para el plan autorizado.');
const out=new URL('../../../outputs/ochavo-beta-controlada/',import.meta.url);
const planUrl=new URL('plan-copia-firestore.json',out),plan=JSON.parse(await readFile(planUrl,'utf8'));
const endpoint='/projects/brote-62d26/databases/(default)/backupSchedules';
if(plan.project!=='brote-62d26'||plan.database!=='(default)'||plan.body?.retention!=='604800s'||!plan.body?.dailyRecurrence)throw Error('El plan no coincide con la autorización.');
await createGoogleClients();
const require=createRequire(import.meta.url),{Client}=require('firebase-tools/lib/apiv2');
const client=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
const options={skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,resolveOnHTTPError:true,responseType:'json',timeout:20000};
const list=async()=>{const r=await client.get(endpoint,{...options});if(r.status!==200)throw Error('No se pudo comprobar la lista de copias: '+r.status);return r.body?.backupSchedules||[];};
const matches=s=>s.retention==='604800s'&&!!s.dailyRecurrence;
const existing=await list();
let schedule=existing.find(matches),creationStatus=null;
if(!schedule){
  if(existing.length)throw Error('Hay otra programación; no se modifica automáticamente.');
  try{const r=await client.post(endpoint,{retention:'604800s',dailyRecurrence:{}},{...options});creationStatus=r.status;}
  catch{creationStatus='unknown';}
  // Re-read even if creation timed out. Never retry an uncertain POST.
  schedule=(await list()).find(matches);
}
if(!schedule?.name)throw Error('No se ha confirmado la activación; no se repite la creación.');
await mkdir(out,{recursive:true});
const proof={verifiedAt:new Date().toISOString(),project:'brote-62d26',database:'(default)',schedule:schedule.name,retention:schedule.retention,daily:!!schedule.dailyRecurrence,creationStatus,firstBackupVerified:false};
await writeFile(new URL('copia-firestore-activada.json',out),JSON.stringify(proof,null,2)+'\n');
await writeFile(planUrl,JSON.stringify({...plan,executed:true,verifiedAt:proof.verifiedAt,schedule:schedule.name},null,2)+'\n');
console.log(JSON.stringify(proof));
