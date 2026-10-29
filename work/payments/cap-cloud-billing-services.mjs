import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,createGoogleClients,openLocalStore} from './store-server-secrets.mjs';

const NUMBER='226760894540',REGION='europe-west1',PREFIX=`projects/${PROJECT_ID}/locations/${REGION}`;
const TARGETS=Object.freeze({billing:'read',revenuecatWebhook:'webhook',billingAccountDeleted:'cleanup'});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const fingerprint=value=>createHash('sha256').update(canonical(value)).digest('hex');
const normalize=value=>typeof value==='string'?value.replace(`projects/${NUMBER}/`,`projects/${PROJECT_ID}/`):'';
const servicePath=value=>new RegExp(`^${PREFIX}/services/[a-z][a-z0-9-]{0,62}$`).test(value);
const operationPath=value=>new RegExp(`^${PREFIX}/operations/[A-Za-z0-9_-]{1,200}$`).test(value);
const options=(timeout=20000)=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout});
class CapError extends Error{constructor(code,status=0){super(code);this.code=code;this.httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:0;}}
const fail=(code,status)=>{throw new CapError(code,status);};
export const safeCapFailure=error=>({state:error instanceof CapError?error.code:'FAILED',httpStatus:error instanceof CapError?error.httpStatus:0});
export function parseCapArguments(args){if(args.length!==1||args[0]!=='apply')fail('INVALID_ARGUMENTS');return {mode:'apply'};}
function validateRecord(value){
  if(value===null)return {schemaVersion:1,projectId:PROJECT_ID,entries:{}};
  if(!value||value.schemaVersion!==1||value.projectId!==PROJECT_ID||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries)||Object.keys(value).some(k=>!['schemaVersion','projectId','entries'].includes(k)))fail('INVALID_LOCAL_RECORD');
  for(const [name,entry] of Object.entries(value.entries)){
    if(!Object.hasOwn(TARGETS,name)||!entry||!['started','pending','confirmed','rejected'].includes(entry.phase)||!servicePath(entry.service)||typeof entry.uid!=='string'||!entry.uid||entry.uid.length>256||!/^[a-f0-9]{64}$/.test(entry.protectedHash)||!Number.isSafeInteger(entry.startedAtMs)||typeof entry.mutationAttempted!=='boolean'||entry.operation!==undefined&&!operationPath(entry.operation)||Object.keys(entry).some(k=>!['phase','service','uid','protectedHash','startedAtMs','mutationAttempted','operation'].includes(k))||entry.phase==='pending'&&!entry.operation)fail('INVALID_LOCAL_RECORD');
  }
  return structuredClone(value);
}
function metadata(body,name,service){
  const account=`ochavo-billing-${TARGETS[name]}@${PROJECT_ID}.iam.gserviceaccount.com`,template=body?.template,scaling=body?.scaling||{};
  if(normalize(body?.name)!==service||typeof body.uid!=='string'||!body.uid||body.uid.length>256||typeof body.etag!=='string'||!body.etag||template?.serviceAccount!==account||template.scaling?.maxInstanceCount!==2||(template.scaling?.minInstanceCount??0)!==0||template.timeout!=='60s'||!Array.isArray(template.containers)||template.containers.length!==1||!['256Mi','256MiB','256M'].includes(template.containers[0]?.resources?.limits?.memory)||(scaling.minInstanceCount??0)!==0||![undefined,'AUTOMATIC','AUTOMATIC_SCALING'].includes(scaling.scalingMode)||(scaling.manualInstanceCount??0)!==0||scaling.maxInstanceCount!==undefined&&(!Number.isInteger(scaling.maxInstanceCount)||scaling.maxInstanceCount<0))fail('UNEXPECTED_RUN_CONFIGURATION');
  // Only digests of protected fields are journalled, never environment variables.
  const protectedHash=fingerprint({template,traffic:body.traffic??[],ingress:body.ingress??null,invokerIamDisabled:body.invokerIamDisabled??false,defaultUriDisabled:body.defaultUriDisabled??false,binaryAuthorization:body.binaryAuthorization??null,serviceScaling:Object.fromEntries(Object.entries(scaling).filter(([key])=>key!=='maxInstanceCount'))});
  return {service,uid:body.uid,etag:body.etag,protectedHash,max:scaling.maxInstanceCount??null,ready:body.reconciling!==true&&body.terminalCondition?.state==='CONDITION_SUCCEEDED'};
}
export async function capCloudBillingServices({projectId=PROJECT_ID,clients,record=null,saveRecord,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const state=validateRecord(record),routes=new Set([`projects GET /projects/${PROJECT_ID}`,...Object.keys(TARGETS).map(name=>`functionsV2 GET /${PREFIX}/functions/${name}`)]);
  const request=async(kind,method,resource,body,queryParams,timeout)=>{
    if(!routes.has(`${kind} ${method} ${resource}`))fail('INVALID_API_ROUTE');
    const opts={...options(timeout),...(queryParams?{queryParams}:{})};
    try{return method==='GET'?await clients[kind].get(resource,opts):await clients[kind].patch(resource,body,opts);}catch{fail('REQUEST_OUTCOME_UNKNOWN');}
  };
  const read=async(kind,resource)=>{const r=await request(kind,'GET',resource);if(r.status!==200)fail('METADATA_READ_FAILED',r.status);return r.body;};
  const save=async()=>{try{await saveRecord(structuredClone(state));}catch{fail('LOCAL_RECORD_FAILED');}};
  const project=await read('projects',`/projects/${PROJECT_ID}`);
  if(project?.projectId!==PROJECT_ID||String(project.projectNumber)!==NUMBER||project.lifecycleState!=='ACTIVE')fail('INVALID_REMOTE_PROJECT');
  const targets=[];
  // Validate all three identities and revision limits before any mutation.
  for(const [name,identity] of Object.entries(TARGETS)){
    const fn=await read('functionsV2',`/${PREFIX}/functions/${name}`),service=normalize(fn?.serviceConfig?.service);
    if(normalize(fn?.name)!==`${PREFIX}/functions/${name}`||fn.state!=='ACTIVE'||fn.buildConfig?.runtime!=='nodejs22'||fn.serviceConfig?.serviceAccountEmail!==`ochavo-billing-${identity}@${PROJECT_ID}.iam.gserviceaccount.com`||!servicePath(service)||targets.some(target=>target.service===service))fail('FUNCTION_NOT_READY');
    routes.add(`run GET /${service}`);routes.add(`run PATCH /${service}`);
    const current=metadata(await read('run',`/${service}`),name,service),prior=state.entries[name];
    if(prior&&(prior.service!==service||prior.uid!==current.uid||prior.protectedHash!==current.protectedHash))fail('RESOURCE_CHANGED_REVIEW_REQUIRED');
    if(!prior&&!current.ready)fail('RUN_NOT_READY');
    targets.push({name,service,uid:current.uid,protectedHash:current.protectedHash});
  }
  const poll=async entry=>{
    const resource=`/${entry.operation}`;if(!operationPath(entry.operation))fail('INVALID_OPERATION');routes.add(`run GET ${resource}`);
    const deadline=now()+60000;
    for(let attempt=0;attempt<12&&now()<deadline;attempt++){
      const response=await request('run','GET',resource,undefined,undefined,Math.max(1,Math.min(10000,deadline-now())));
      if(response.status!==200)fail('OPERATION_READ_FAILED',response.status);
      if(normalize(response.body?.name)!==entry.operation)fail('OPERATION_IDENTITY_MISMATCH');
      if(response.body.done===true){if(response.body.error){entry.phase='rejected';await save();fail('OPERATION_FAILED');}return;}
      const remaining=deadline-now();if(remaining>0)await sleep(Math.min(5000,remaining));
    }
    fail('OPERATION_PENDING_RETRY_READ_ONLY');
  };
  for(const {name,service,uid,protectedHash} of targets){
    let current=metadata(await read('run',`/${service}`),name,service),entry=state.entries[name];
    if(current.uid!==uid||current.protectedHash!==protectedHash)fail('RESOURCE_CHANGED_REVIEW_REQUIRED');
    if(entry){
      if(entry.uid!==current.uid||entry.protectedHash!==current.protectedHash)fail('RESOURCE_CHANGED_REVIEW_REQUIRED');
      if(entry.phase==='rejected')fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
      if(entry.operation&&entry.phase!=='confirmed'){await poll(entry);current=metadata(await read('run',`/${service}`),name,service);}
      // Includes a lost PATCH response: reconcile the exact observed result only.
      if(!current.ready||current.max!==2||entry.uid!==current.uid||entry.protectedHash!==current.protectedHash)fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
      if(entry.phase!=='confirmed'){entry.phase='confirmed';await save();}continue;
    }
    if(!current.ready)fail('RUN_NOT_READY');
    entry=state.entries[name]={phase:current.max===2?'confirmed':'started',service,uid:current.uid,protectedHash:current.protectedHash,startedAtMs:now(),mutationAttempted:current.max!==2};
    await save(); // Atomic local journal BEFORE the only permitted PATCH.
    if(current.max===2)continue;
    const response=await request('run','PATCH',`/${service}`,{name:service,etag:current.etag,scaling:{maxInstanceCount:2}},{updateMask:'scaling.maxInstanceCount',allowMissing:false});
    if(response.status!==200){if([400,401,403,404,409,412].includes(response.status)){entry.phase='rejected';await save();}fail('PATCH_OUTCOME_REQUIRES_REVIEW',response.status);}
    const operation=normalize(response.body?.name);if(!operationPath(operation))fail('INVALID_OPERATION');
    entry.operation=operation;entry.phase='pending';await save();
    await poll(entry);
    current=metadata(await read('run',`/${service}`),name,service);
    if(!current.ready||current.max!==2||entry.uid!==current.uid||entry.protectedHash!==current.protectedHash)fail('POST_PATCH_CONFIGURATION_CHANGED');
    entry.phase='confirmed';await save();
  }
  return {state:'SERVICE_CAPS_VERIFIED',projectId:PROJECT_ID,services:targets.map(({name})=>({function:name,maxInstances:2,mutationAttempted:state.entries[name].mutationAttempted}))};
}
async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');
  for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};process.emitWarning=()=>{};
  let local;
  try{parseCapArguments(process.argv.slice(2));local=await openLocalStore(undefined,'billing-service-cap');const clients=await createGoogleClients({includeRuntimeIAM:true});emit(await capCloudBillingServices({clients,record:await local.readRecord(),saveRecord:value=>local.saveRecord(value)}));}
  catch(error){emit(safeCapFailure(error));process.exitCode=1;}
  finally{try{await local?.close();}catch{emit({state:'LOCAL_LOCK_REQUIRES_REVIEW'});process.exitCode=1;}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
