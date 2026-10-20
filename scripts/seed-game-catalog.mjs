import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {COURSE_PARTS} from '../src/content-files.js';
import {GAME_CONFIG,createGameCatalog,dayWindow} from '../src/game-domain.js';

/** Offline preparation only. Upload records separately with project-owner credentials, never client rules. */
export function buildGameSeed({lessons,exams,firstYear=2025,lastYear=2035}){
  const catalog=createGameCatalog({lessons,exams});
  const records=[{path:'gameConfig/economy',data:GAME_CONFIG},...Object.entries(catalog).map(([id,data])=>({path:'gameCatalog/'+id,data}))];
  for(let stamp=Date.UTC(firstYear,0,1);stamp<Date.UTC(lastYear+1,0,1);stamp+=86400000){
    const day=new Date(stamp).toISOString().slice(0,10),window=dayWindow(day,GAME_CONFIG.timeZone);
    records.push({path:'gameDays/'+day,data:{dayKey:day,ordinal:window.ordinal,startAt:{$timestamp:new Date(window.startAt).toISOString()},endAt:{$timestamp:new Date(window.endAt).toISOString()}}});
  }
  return {catalog,records};
}
export function encodeFirestoreValue(value){
  if(value===null)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encodeFirestoreValue)}};
  if(typeof value==='object'&&Object.keys(value).length===1&&typeof value.$timestamp==='string')return {timestampValue:value.$timestamp};
  if(value&&typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,encodeFirestoreValue(entry)]))}};
  throw Error('Valor no compatible con Firestore.');
}
export async function publishGameSeed(records,{projectId,accessToken,fetchImpl=fetch,onBatch=()=>{}}){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||''))throw Error('Identificador de proyecto no válido.');
  if(typeof accessToken!=='string'||!accessToken)throw Error('Falta la autenticación de administración.');
  if(records.some(r=>!/^game(Config|Catalog|Days)\/[A-Za-z0-9_-]+$/.test(r.path)))throw Error('El aprovisionamiento solo admite catálogo, configuración y calendario.');
  const prefix=`projects/${projectId}/databases/(default)/documents`;
  for(let index=0;index<records.length;index+=400){
    const page=records.slice(index,index+400),writes=page.map(record=>({update:{name:prefix+'/'+record.path,fields:encodeFirestoreValue(record.data).mapValue.fields}}));
    const response=await fetchImpl(`https://firestore.googleapis.com/v1/${prefix}:commit`,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({writes})});
    if(!response.ok)throw Error(`Firestore rechazó el lote ${Math.floor(index/400)+1} (HTTP ${response.status}). No se imprimen credenciales ni respuestas privadas. Puedes reintentar el aprovisionamiento: sus rutas son estables.`);
    onBatch({written:Math.min(index+400,records.length),total:records.length});
  }
  return {written:records.length,projectId};
}
async function main(){
  const root=new URL('../',import.meta.url),parts=await Promise.all(COURSE_PARTS.map(async name=>JSON.parse(await readFile(new URL('src/content/'+name+'.json',root),'utf8'))));
  const output=buildGameSeed({lessons:parts.flatMap(p=>p.lessons),exams:parts.flatMap(p=>p.exams)});
  await writeFile(new URL('src/content/game-catalog.json',root),JSON.stringify(output.catalog,null,2)+'\n');
  const flag=process.argv.indexOf('--out');
  const destination=flag>=0?process.argv[flag+1]:new URL('../../../work/game-seed.json',import.meta.url);
  if(!destination)throw Error('Falta la ruta después de --out.');
  await writeFile(destination,JSON.stringify({format:'viruta-game-seed-v1',timestampEncoding:'Objects with only $timestamp are Firestore Timestamp values; do not upload as maps.',records:output.records},null,2)+'\n');
  const summary={catalogEntries:Object.keys(output.catalog).length,calendarDays:output.records.filter(r=>r.path.startsWith('gameDays/')).length,records:output.records.length,published:false};
  if(process.argv.includes('--publish')){
    const projectFlag=process.argv.indexOf('--project'),projectId=process.argv[projectFlag+1];
    if(projectFlag<0||!projectId||projectId.startsWith('--'))throw Error('Publicar requiere --project con el destino explícito.');
    const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
    const account=auth.getProjectDefaultAccount(fileURLToPath(root))||auth.getGlobalDefaultAccount();
    if(!account?.tokens?.refresh_token)throw Error('Primero inicia sesión con firebase login en este equipo. No pegues credenciales en argumentos ni en el chat.');
    const credentials=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
    const records=process.argv.includes('--catalog-only')?output.records.filter(r=>r.path.startsWith('gameCatalog/')):output.records;
    await publishGameSeed(records,{projectId,accessToken:credentials.access_token,onBatch:progress=>console.log(JSON.stringify(progress))});
    summary.published=true;summary.projectId=projectId;
  }
  console.log(JSON.stringify(summary));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await main();}catch(error){console.error(error?.message||'No se pudo preparar el catálogo.');process.exitCode=1;}
}
