import {readFile,copyFile,mkdir,writeFile,lstat,realpath,symlink,readdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateGemPacks} from '../functions/billing-domain.js';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const LOCAL_BILLING_PROJECT='demo-brote';
export const LOCAL_BILLING_URL='http://127.0.0.1:5001/demo-brote/europe-west1/billing';
export const LOCAL_SECRET_NAMES=['REVENUECAT_SECRET_API_KEY_V2','REVENUECAT_SECRET_API_KEY_CLEANUP_V2','REVENUECAT_WEBHOOK_SIGNING_SECRET'];
const approvedGemProducts=validateGemPacks(readFileSync(new URL('../functions/gem-packs.example.json',import.meta.url),'utf8'));

/** Fixed emulator destinations; inherited production Vite configuration cannot leak in. */
export function createLocalBillingPlan(config={},inherited={}){
  if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>!['revenuecatProjectId','webPublicKey','gemProducts'].includes(key))
    || typeof config.revenuecatProjectId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(config.revenuecatProjectId)
    || typeof config.webPublicKey!=='string'||!/^rcb_sb_[A-Za-z0-9_.-]+$/.test(config.webPublicKey)){
    throw new Error('Configura el proyecto RevenueCat y su clave PUBLICA rcb_sb_ en work/billing-local/config.json. No uses claves privadas ni de producción.');
  }
  const gemProducts=validateGemPacks(config.gemProducts??[]);
  if(gemProducts.some(pack=>!approvedGemProducts.some(approved=>approved.productId===pack.productId&&approved.gems===pack.gems))){
    throw new Error('Usa únicamente los identificadores y cantidades de los paquetes de gemas aprobados. Consulta scripts/billing-local.example.json.');
  }
  const env=Object.fromEntries(Object.entries(inherited).filter(([key])=>!key.startsWith('VITE_')&&!key.startsWith('REVENUECAT_')&&!key.startsWith('BILLING_')&&!['FIREBASE_CONFIG','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FUNCTIONS_EMULATOR'].includes(key)));
  Object.assign(env,{VITE_FIREBASE_API_KEY:'demo-brote-key',VITE_FIREBASE_AUTH_DOMAIN:'demo-brote.firebaseapp.com',VITE_FIREBASE_PROJECT_ID:LOCAL_BILLING_PROJECT,VITE_FIREBASE_APP_ID:'1:123:web:demo',
    VITE_USE_EMULATORS:'true',VITE_BILLING_ENVIRONMENT:'sandbox',VITE_BILLING_API_URL:LOCAL_BILLING_URL,VITE_REVENUECAT_WEB_KEY:config.webPublicKey,
    VITE_REVENUECAT_ANDROID_KEY:'',VITE_REVENUECAT_IOS_KEY:'',VITE_WEB_ANALYTICS_ID:''});
  return {env,params:{REVENUECAT_PROJECT_ID:config.revenuecatProjectId,REVENUECAT_WEB_PUBLIC_KEY:config.webPublicKey,BILLING_ENVIRONMENT:'sandbox',BILLING_ENABLED:'true',BILLING_GEM_PACKS:JSON.stringify(gemProducts)},
    emulatorArgs:['node_modules/firebase-tools/lib/bin/firebase.js','emulators:start','--only','auth,firestore,functions','--project',LOCAL_BILLING_PROJECT,'--config','firebase.billing-local.json','--non-interactive'],
    webArgs:['node_modules/vite/bin/vite.js','--host','127.0.0.1','--mode','billing-local']};
}

export function validateLocalSecrets(source){
  const values=parseEnv(source);
  if(LOCAL_SECRET_NAMES.some(key=>typeof values[key]!=='string'||!/^[A-Za-z0-9_./+=:-]{16,4096}$/.test(values[key]))){
    throw new Error('Faltan secretos de servidor en functions/.secret.local. Consulta functions/PRUEBAS-LOCALES.txt; no los pegues en el chat.');
  }
  // Return only declared server secrets, never public or unrelated environment values.
  return LOCAL_SECRET_NAMES.map(key=>`${key}=${JSON.stringify(values[key])}`).join('\n')+'\n';
}

async function readLocalFile(relative,message){
  try{return await readFile(path.join(appRoot,relative),'utf8');}catch(error){if(error.code==='ENOENT')throw new Error(message);throw error;}
}

export async function stageBackend(plan,secrets,{root=appRoot}={}){
  const base=await realpath(root);
  let stage=base;
  // Reject existing links before creating or changing any staged files. A junction
  // in work, the stage itself or a destination file must not redirect a write.
  for(const name of ['work','billing-local','backend']){
    stage=path.join(stage,name);
    try{
      const info=await lstat(stage);
      if(!info.isDirectory()||info.isSymbolicLink())throw new Error('El directorio local contiene un enlace o un archivo inesperado. No se ha modificado.');
    }catch(error){if(error.code!=='ENOENT')throw error;await mkdir(stage);}
  }
  const sources=['index.js','billing-domain.js','billing-service.js','package.json'];
  const writable=new Set([...sources,'.env.local','.secret.local']);
  for(const entry of await readdir(stage,{withFileTypes:true})){
    if(entry.name==='node_modules')continue;
    if(!writable.has(entry.name))throw new Error('El backend local contiene archivos inesperados. Usa un directorio de pruebas limpio.');
    const info=await lstat(path.join(stage,entry.name));
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error('Un destino local es un enlace o un archivo compartido. No se ha modificado.');
  }
  const modules=path.join(stage,'node_modules'),original=await realpath(path.join(base,'functions/node_modules'));
  try{
    const info=await lstat(modules);
    if(!info.isSymbolicLink()||await realpath(modules)!==original)throw new Error('La carpeta local de dependencias tiene un destino inesperado. No se ha modificado.');
  }catch(error){if(error.code!=='ENOENT')throw error;await symlink(original,modules,process.platform==='win32'?'junction':'dir');}
  // No production dotenv file is read, changed or copied into the local backend.
  for(const name of sources)await copyFile(path.join(base,'functions',name),path.join(stage,name));
  await writeFile(path.join(stage,'.env.local'),Object.entries(plan.params).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
  await writeFile(path.join(stage,'.secret.local'),secrets,{mode:0o600});
}

async function main(){
  const command=process.argv[2]||'check';
  if(!['check','emulators','web'].includes(command))throw new Error('Uso: node scripts/billing-local.mjs check|emulators|web');
  let config;try{config=JSON.parse(await readLocalFile('work/billing-local/config.json','Falta work/billing-local/config.json. Copia scripts/billing-local.example.json y añade la clave pública de pruebas.'));}
  catch(error){if(error instanceof SyntaxError)throw new Error('El archivo local de configuración no contiene JSON válido.');throw error;}
  const plan=createLocalBillingPlan(config,process.env);
  const secrets=validateLocalSecrets(await readLocalFile('functions/.secret.local','Falta functions/.secret.local con las claves de servidor. Consulta functions/PRUEBAS-LOCALES.txt.'));
  if(command==='check'){
    console.log('Configuración local válida. Destinos: Firebase demo-brote y RevenueCat sandbox. No se han iniciado servicios ni enviado datos.');
    return;
  }
  if(command==='emulators')await stageBackend(plan,secrets);
  const child=spawn(process.execPath,command==='web'?plan.webArgs:plan.emulatorArgs,{cwd:appRoot,env:plan.env,stdio:'inherit',shell:false,windowsHide:true});
  child.on('error',()=>{console.error('No se pudo iniciar el servicio local. Comprueba las dependencias.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
