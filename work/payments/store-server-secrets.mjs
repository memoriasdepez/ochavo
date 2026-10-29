import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const PROJECT_ID='brote-62d26';
export const SECRET_NAMES=Object.freeze(['REVENUECAT_SECRET_API_KEY_V2','REVENUECAT_SECRET_API_KEY_CLEANUP_V2','REVENUECAT_WEBHOOK_SIGNING_SECRET']);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
class StorageError extends Error{constructor(code,httpStatus=0){super(code);this.code=code;this.httpStatus=Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:0;}}
const safeError=(code,httpStatus=0)=>new StorageError(code,httpStatus);
export const publicFailure=error=>({name:null,httpStatus:error instanceof StorageError?error.httpStatus:0,version:null,state:error instanceof StorageError?error.code:'FAILED'});
const hash=value=>createHash('sha256').update(value).digest('hex');
const requestOptions=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});

export function parseArguments(args){
  let includeWebhook=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--include-webhook'&&!includeWebhook){includeWebhook=true;continue;}
    if(args[i]==='--project'&&args[++i]===PROJECT_ID)continue;
    throw safeError('INVALID_ARGUMENTS');
  }
  return {projectId:PROJECT_ID,names:SECRET_NAMES.slice(0,includeWebhook?3:2)};
}
function selectedNames(names){
  if(!Array.isArray(names)||![2,3].includes(names.length)||names.some((name,index)=>name!==SECRET_NAMES[index]))throw safeError('INVALID_SECRET_SELECTION');
  return names;
}
export function parseSelectedSecrets(source,names){
  selectedNames(names);
  if(typeof source!=='string'||Buffer.byteLength(source)>65536)throw safeError('INVALID_SECRET_FILE');
  let values;try{values=parseEnv(source);}catch{throw safeError('INVALID_SECRET_FILE');}
  const selected={};
  for(const name of names){
    const pattern=name===SECRET_NAMES[2]?/^[A-Za-z0-9_./+=:-]{24,4096}$/:/^sk_[A-Za-z0-9_.-]{12,4093}$/;
    if(typeof values[name]!=='string'||!pattern.test(values[name]))throw safeError('MISSING_OR_INVALID_SECRET');
    // Reject ambiguous duplicate dotenv assignments rather than silently taking the last.
    const assignments=source.split(/\r?\n/).filter(line=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(line));
    if(assignments.length!==1)throw safeError('INVALID_SECRET_FILE');
    selected[name]=values[name];
  }
  if(selected[SECRET_NAMES[0]]===selected[SECRET_NAMES[1]])throw safeError('SEPARATE_KEYS_REQUIRED');
  return selected;
}

export function silenceFirebaseLogger(logger){
  logger.silent=true;
  const noop=()=>logger;
  for(const name of ['debug','log','info','warn','error','verbose','silly','http'])logger[name]=noop;
  logger.clear?.();
}
export async function createGoogleClients({projectId=PROJECT_ID,root=ROOT,load=require,env=process.env,includeServiceUsage=false,includeRuntimeIAM=false}={}){
  if(projectId!==PROJECT_ID)throw safeError('INVALID_PROJECT');
  if(typeof includeServiceUsage!=='boolean'||typeof includeRuntimeIAM!=='boolean')throw safeError('INVALID_CLIENT_SELECTION');
  // Never let an inherited token, ADC or endpoint override choose another session/destination.
  if(Object.keys(env).some(key=>['FIREBASE_TOKEN','GOOGLE_APPLICATION_CREDENTIALS'].includes(key)||/^FIREBASE_.*_(?:URL|ORIGIN)$/.test(key)||key.endsWith('_EMULATOR_HOST')))throw safeError('UNEXPECTED_AUTH_ENVIRONMENT');
  try{
    const {logger}=load('firebase-tools/lib/logger');silenceFirebaseLogger(logger);
    const auth=load('firebase-tools/lib/auth'),{requireAuth}=load('firebase-tools/lib/requireAuth');
    const account=auth.getProjectDefaultAccount(root)||auth.getGlobalDefaultAccount();
    if(!account?.user||!account.tokens)throw safeError('FIREBASE_LOGIN_REQUIRED');
    const authenticated=await requireAuth({project:PROJECT_ID,projectRoot:root,cwd:root,nonInteractive:true,user:account.user,tokens:account.tokens},true);
    if(!authenticated)throw safeError('FIREBASE_LOGIN_REQUIRED');
    const {Client}=load('firebase-tools/lib/apiv2');
    return {
      projects:new Client({urlPrefix:'https://cloudresourcemanager.googleapis.com',apiVersion:'v1'}),
      secrets:new Client({urlPrefix:'https://secretmanager.googleapis.com',apiVersion:'v1'}),
      ...(includeServiceUsage||includeRuntimeIAM?{serviceUsage:new Client({urlPrefix:'https://serviceusage.googleapis.com',apiVersion:'v1'})}:{}),
      ...(includeRuntimeIAM?{
        iam:new Client({urlPrefix:'https://iam.googleapis.com',apiVersion:'v1'}),
        functionsV1:new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v1'}),
        functionsV2:new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'}),
        run:new Client({urlPrefix:'https://run.googleapis.com',apiVersion:'v2'}),
        eventarc:new Client({urlPrefix:'https://eventarc.googleapis.com',apiVersion:'v1'}),
      }:{}),
    };
  }catch(error){throw safeError(error?.code==='FIREBASE_LOGIN_REQUIRED'?error.code:'FIREBASE_AUTH_FAILED');}
}

function resourceVersion(body,name,projectNumber){
  const match=typeof body?.name==='string'&&new RegExp('^projects/('+PROJECT_ID+'|'+projectNumber+')/secrets/'+name+'/versions/([1-9][0-9]{0,18})$').exec(body.name);
  if(!match||!['ENABLED','DISABLED','DESTROYED'].includes(body.state))throw safeError('INVALID_REMOTE_METADATA');
  return {version:match[2],state:body.state};
}
function validateRecord(record,projectNumber){
  if(!record)return {schemaVersion:1,projectId:PROJECT_ID,projectNumber,entries:{}};
  if(record.schemaVersion!==1||record.projectId!==PROJECT_ID||record.projectNumber!==projectNumber||!record.entries||typeof record.entries!=='object'||Array.isArray(record.entries)||Object.keys(record).some(key=>!['schemaVersion','projectId','projectNumber','entries'].includes(key)))throw safeError('INVALID_LOCAL_RECORD');
  for(const [name,entry] of Object.entries(record.entries)){
    if(!SECRET_NAMES.includes(name)||!entry||!/^[a-f0-9]{64}$/.test(entry.fingerprint)||!['ready','adding','stored','needs_review'].includes(entry.phase)||Object.keys(entry).some(key=>!(entry.phase==='stored'?['fingerprint','phase','version','state']:['fingerprint','phase']).includes(key))||(entry.phase==='stored'&&(typeof entry.version!=='string'||!/^[1-9][0-9]{0,18}$/.test(entry.version)||entry.state!=='ENABLED')))throw safeError('INVALID_LOCAL_RECORD');
  }
  return structuredClone(record);
}

/** No cloud payload reads, IAM changes, API enabling, deploys or RevenueCat calls. */
export async function storeServerSecrets({projectId=PROJECT_ID,names,values,clients,record=null,saveRecord,onMetadata=()=>{}}){
  if(projectId!==PROJECT_ID)throw safeError('INVALID_PROJECT');
  selectedNames(names);
  if(Object.keys(values).length!==names.length||names.some(name=>typeof values[name]!=='string'))throw safeError('INVALID_SECRET_SELECTION');
  // The same validation applies even when this module is used through its exported API.
  parseSelectedSecrets(names.map(name=>`${name}=${JSON.stringify(values[name])}`).join('\n'),names);
  const request=async(client,method,resource,body)=>{
    try{return method==='GET'?await client.get(resource,requestOptions()):await client.post(resource,body,requestOptions());}
    catch{throw safeError('NETWORK_OUTCOME_UNKNOWN');}
  };
  const project=await request(clients.projects,'GET','/projects/'+PROJECT_ID);
  if(project.status!==200)throw safeError('PROJECT_LOOKUP_FAILED',project.status);
  if(project.body?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(String(project.body.projectNumber)))throw safeError('INVALID_REMOTE_PROJECT');
  const projectNumber=String(project.body.projectNumber),state=validateRecord(record,projectNumber);
  const persist=async()=>{try{await saveRecord(structuredClone(state));}catch{throw safeError('LOCAL_RECORD_FAILED');}};
  for(const name of names){
    const resource=`/projects/${PROJECT_ID}/secrets/${name}`,fingerprint=hash(values[name]),prior=state.entries[name];
    if(prior&&prior.fingerprint!==fingerprint)throw safeError('LOCAL_VALUE_CHANGED_REVIEW_REQUIRED');
    if(prior&&['adding','needs_review'].includes(prior.phase))throw safeError('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    if(prior?.phase==='stored'){
      const verified=await request(clients.secrets,'GET',resource+'/versions/'+prior.version);
      if(verified.status!==200)throw safeError('STORED_VERSION_REQUIRES_REVIEW',verified.status);
      const metadata=resourceVersion(verified.body,name,projectNumber);
      if(metadata.version!==prior.version||metadata.state!=='ENABLED')throw safeError('STORED_VERSION_REQUIRES_REVIEW',verified.status);
      onMetadata({name,httpStatus:verified.status,...metadata});continue;
    }
    let remote=await request(clients.secrets,'GET',resource);
    if(remote.status===404){
      // Creation contains no secret data. There are still no automatic retries.
      try{remote=await clients.secrets.post('/projects/'+PROJECT_ID+'/secrets',{replication:{automatic:{}}},{...requestOptions(),queryParams:{secretId:name}});}
      catch{throw safeError('SECRET_CREATE_OUTCOME_UNKNOWN');}
      if(remote.status===409)remote=await request(clients.secrets,'GET',resource);
    }
    if(![200,201].includes(remote.status))throw safeError('SECRET_METADATA_FAILED',remote.status);
    if(![`projects/${PROJECT_ID}/secrets/${name}`,`projects/${projectNumber}/secrets/${name}`].includes(remote.body?.name))throw safeError('INVALID_REMOTE_METADATA');
    const latest=await request(clients.secrets,'GET',resource+'/versions/latest');
    if(latest.status===200)throw safeError('UNTRACKED_VERSION_REQUIRES_REVIEW',200);
    if(latest.status!==404)throw safeError('VERSION_METADATA_FAILED',latest.status);
    state.entries[name]={fingerprint,phase:'ready'};await persist();
    state.entries[name]={fingerprint,phase:'adding'};await persist();
    // Store the durable "adding" state BEFORE the only non-idempotent operation.
    let added;
    try{added=await request(clients.secrets,'POST',resource+':addVersion',{payload:{data:Buffer.from(values[name],'utf8').toString('base64')}});}
    catch{throw safeError('ADD_VERSION_OUTCOME_UNKNOWN');}
    if(![200,201].includes(added.status))throw safeError('ADD_VERSION_REQUIRES_REVIEW',added.status);
    const metadata=resourceVersion(added.body,name,projectNumber);
    if(metadata.state!=='ENABLED')throw safeError('ADD_VERSION_REQUIRES_REVIEW',added.status);
    state.entries[name]={fingerprint,phase:'stored',...metadata};await persist();
    onMetadata({name,httpStatus:added.status,...metadata});
  }
  return state;
}

const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
export async function openLocalStore(root=ROOT,scope='secrets'){
  if(!['secrets','secret-manager-enablement','runtime-iam','cleanup-run-invoker','billing-service-cap'].includes(scope))throw safeError('INVALID_LOCAL_SCOPE');
  const stem=scope==='secrets'?'secret-storage':scope;
  const base=path.resolve(root);
  if(!samePath(await realpath(base),base))throw safeError('UNSAFE_LOCAL_PATH');
  const target=async(relative,missing=false)=>{
    const parts=relative.split('/');let current=base;
    for(let i=0;i<parts.length;i++){
      current=path.join(current,parts[i]);let stat;
      try{stat=await lstat(current);}catch(error){if(missing&&i===parts.length-1&&error.code==='ENOENT')return current;throw safeError('LOCAL_FILE_UNAVAILABLE');}
      if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))throw safeError('UNSAFE_LOCAL_PATH');
    }
    return current;
  };
  const safeRead=async(relative,missing=false)=>{
    const filename=await target(relative,missing);let handle;
    try{
      handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
      const actual=await handle.stat(),before=await lstat(filename);
      if(!actual.isFile()||actual.nlink!==1||actual.ino!==before.ino||actual.dev!==before.dev||actual.size>(scope==='runtime-iam'?4194304:65536))throw safeError('UNSAFE_LOCAL_PATH');
      return await handle.readFile('utf8');
    }catch(error){if(missing&&error.code==='ENOENT')return null;throw safeError('LOCAL_READ_FAILED');}finally{await handle?.close();}
  };
  const lockPath=await target(`work/payments/${stem}.lock`,true);let lock;
  try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}catch{await lock?.close();throw safeError('LOCAL_LOCK_REQUIRES_REVIEW');}
  const lockStat=await lock.stat();
  return {
    ...(scope==='secrets'?{readSource:()=>safeRead('functions/.secret.local')}:{}),
    async readRecord(){const raw=await safeRead(`work/payments/${stem}-state.json`,true);if(raw===null)return null;try{return JSON.parse(raw);}catch{throw safeError('INVALID_LOCAL_RECORD');}},
    async saveRecord(record){
      const contents=JSON.stringify(record)+'\n';
      if(Buffer.byteLength(contents)>(scope==='runtime-iam'?4194304:65536))throw safeError('LOCAL_RECORD_FAILED');
      const destination=await target(`work/payments/${stem}-state.json`,true);
      const temporary=await target(`work/payments/${stem}-state.json.`+randomUUID()+'.tmp',true);
      let handle;try{
        handle=await open(temporary,'wx',0o600);await handle.writeFile(contents);await handle.sync();await handle.close();handle=null;
        await target(`work/payments/${stem}-state.json`,true);await rename(temporary,destination);
      }catch{throw safeError('LOCAL_RECORD_FAILED');}finally{await handle?.close();try{await unlink(temporary);}catch{}}
    },
    async close(){await lock.close();const current=await lstat(lockPath);if(current.ino!==lockStat.ino||current.dev!==lockStat.dev||current.isSymbolicLink())throw safeError('UNSAFE_LOCAL_PATH');await unlink(lockPath);},
  };
}

async function main(){
  const stdout=process.stdout.write.bind(process.stdout);
  const emit=metadata=>stdout(JSON.stringify(metadata)+'\n');
  // Dedicated process: third-party diagnostic output must not reach either console.
  for(const method of ['log','info','warn','error','debug','trace','dir'])console[method]=()=>{};
  process.emitWarning=()=>{};
  let local;
  try{
    const plan=parseArguments(process.argv.slice(2));local=await openLocalStore();
    const values=parseSelectedSecrets(await local.readSource(),plan.names),record=await local.readRecord();
    const clients=await createGoogleClients();
    await storeServerSecrets({...plan,values,record,clients,saveRecord:record=>local.saveRecord(record),onMetadata:emit});
  }catch(error){emit(publicFailure(error));process.exitCode=1;}
  finally{try{await local?.close();}catch{emit({name:null,httpStatus:0,version:null,state:'LOCAL_LOCK_REQUIRES_REVIEW'});process.exitCode=1;}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
