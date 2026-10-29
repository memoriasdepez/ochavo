import {open,lstat,realpath,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,SECRET_NAMES,createGoogleClients} from './store-server-secrets.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const REGION='europe-west1',RC_PROJECT='projae1cdb17';
const TARGETS={billing:{account:'ochavo-billing-read',secrets:[SECRET_NAMES[0]]},revenuecatWebhook:{account:'ochavo-billing-webhook',secrets:[SECRET_NAMES[0],SECRET_NAMES[2]]},billingAccountDeleted:{account:'ochavo-billing-cleanup',secrets:[SECRET_NAMES[1]]}};
const APIS=['cloudfunctions.googleapis.com','run.googleapis.com','eventarc.googleapis.com','pubsub.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','secretmanager.googleapis.com','storage.googleapis.com'];
const SNAPSHOT_ID=/^(pre|post)-\d{13}-[a-f0-9-]{36}$/;
const PREDEPLOY_BASELINE='runtime-before-cloud-deploy';
const OPTIONS=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const fingerprint=value=>createHash('sha256').update(canonical(value)).digest('hex');
class AuditError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new AuditError(code);};
export const safeAuditFailure=error=>({state:error instanceof AuditError?error.code:'AUDIT_FAILED'});
export function parseAuditArguments(args){
  if(args.length===1&&args[0]==='pre')return {phase:'pre'};
  if(args.length===3&&args[0]==='post'&&args[1]==='--baseline'&&(args[2]===PREDEPLOY_BASELINE||SNAPSHOT_ID.test(args[2])&&args[2].startsWith('pre-')))return {phase:'post',baselineId:args[2]};
  fail('INVALID_ARGUMENTS');
}
function validatePolicy(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.etag!=='string'||!value.etag||![undefined,0,1,3].includes(value.version)||Object.keys(value).some(key=>!['version','etag','bindings','auditConfigs'].includes(key))||value.bindings!==undefined&&!Array.isArray(value.bindings)||value.auditConfigs!==undefined&&!Array.isArray(value.auditConfigs))fail('INVALID_IAM_POLICY');
  for(const binding of value.bindings||[]){
    if(typeof binding?.role!=='string'||!Array.isArray(binding.members)||binding.members.some(value=>typeof value!=='string')||binding.condition&&(value.version!==3||typeof binding.condition.expression!=='string'))fail('INVALID_IAM_POLICY');
  }
  return structuredClone(value);
}
const policyTuples=value=>(value.bindings||[]).flatMap(binding=>binding.members.map(member=>({role:binding.role,member,...(binding.condition?{condition:binding.condition}:{})})));
export function policyDiff(before,after){
  validatePolicy(before);validatePolicy(after);
  const previous=new Map(policyTuples(before).map(value=>[canonical(value),value])),next=new Map(policyTuples(after).map(value=>[canonical(value),value]));
  return {added:[...next].filter(([key])=>!previous.has(key)).map(([,value])=>value),removed:[...previous].filter(([key])=>!next.has(key)).map(([,value])=>value),auditConfigsChanged:canonical(before.auditConfigs||[])!==canonical(after.auditConfigs||[])};
}
const envSummary=vars=>({billingEnabled:vars?.BILLING_ENABLED==='false'?false:vars?.BILLING_ENABLED==='true'?true:'MISSING_OR_INVALID',environment:['production','sandbox'].includes(vars?.BILLING_ENVIRONMENT)?vars.BILLING_ENVIRONMENT:'MISSING_OR_INVALID',revenueCatProjectMatches:vars?.REVENUECAT_PROJECT_ID===RC_PROJECT});
const numberOrNull=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const textOrNull=value=>typeof value==='string'&&value.length<2048?value:null;
const secretRefs=values=>Array.isArray(values)?values.map(value=>({key:textOrNull(value.key),projectId:textOrNull(value.projectId),secret:textOrNull(value.secret),version:textOrNull(value.version)})):[];
const exactKeys=(refs,expected)=>refs.length===expected.length&&new Set(refs.map(value=>value.key)).size===expected.length&&expected.every(key=>refs.some(value=>value.key===key));
const firestoreFilters=filters=>Array.isArray(filters)&&filters.some(value=>value.attribute==='database'&&value.value==='(default)')&&filters.some(value=>value.attribute==='document'&&value.value==='accountDeletions/{uid}'&&value.operator==='match-path-pattern');
function functionMetadata(value,v2=true){
  const config=v2?value.serviceConfig||{}:value;
  const buildServiceAccount=textOrNull(v2?value.buildConfig?.serviceAccount:value.buildServiceAccount);
  return {name:textOrNull(value.name),state:textOrNull(value.state||value.status),runtime:textOrNull(v2?value.buildConfig?.runtime:value.runtime),buildServiceAccount,serviceAccount:textOrNull(v2?config.serviceAccountEmail:value.serviceAccountEmail),service:textOrNull(config.service),limits:{minInstances:numberOrNull(v2?config.minInstanceCount:value.minInstances)??0,maxInstances:numberOrNull(v2?config.maxInstanceCount:value.maxInstances),timeoutSeconds:numberOrNull(config.timeoutSeconds),memory:textOrNull(config.availableMemory)},parameters:envSummary(config.environmentVariables),secrets:secretRefs(config.secretEnvironmentVariables),secretVolumeCount:Array.isArray(config.secretVolumes)?config.secretVolumes.length:0,eventTrigger:value.eventTrigger?{trigger:textOrNull(value.eventTrigger.trigger),eventType:textOrNull(value.eventTrigger.eventType),serviceAccount:textOrNull(value.eventTrigger.serviceAccountEmail),retryPolicy:textOrNull(value.eventTrigger.retryPolicy),eventFilters:(value.eventTrigger.eventFilters||[]).map(filter=>({attribute:textOrNull(filter.attribute),value:textOrNull(filter.value),operator:textOrNull(filter.operator)}))}:null};
}
function runMetadata(value){
  const container=value.template?.containers?.[0],env=Object.fromEntries((container?.env||[]).filter(item=>['BILLING_ENABLED','BILLING_ENVIRONMENT','REVENUECAT_PROJECT_ID'].includes(item.name)).map(item=>[item.name,item.value]));
  return {name:textOrNull(value.name),serviceAccount:textOrNull(value.template?.serviceAccount),reconciling:value.reconciling===true,terminalReady:value.terminalCondition?.state==='CONDITION_SUCCEEDED',invokerIamDisabled:value.invokerIamDisabled===true,containerCount:value.template?.containers?.length||0,secretVolumeCount:(value.template?.volumes||[]).filter(volume=>volume.secret).length,limits:{minInstances:numberOrNull(value.template?.scaling?.minInstanceCount)??0,maxInstances:numberOrNull(value.template?.scaling?.maxInstanceCount),serviceMinInstances:numberOrNull(value.scaling?.minInstanceCount)??0,serviceMaxInstances:numberOrNull(value.scaling?.maxInstanceCount),timeout:textOrNull(value.template?.timeout),memory:textOrNull(container?.resources?.limits?.memory)},parameters:envSummary(env),secretRefs:(container?.env||[]).filter(item=>item.valueSource?.secretKeyRef).map(item=>({key:textOrNull(item.name),secret:textOrNull(item.valueSource.secretKeyRef.secret),version:textOrNull(item.valueSource.secretKeyRef.version)}))};
}
function triggerMetadata(value){
  const destination=value.destination||{},keys=Object.keys(destination),kind=keys.length===1&&['cloudRun','cloudFunction'].includes(keys[0])?keys[0]:'UNSUPPORTED';
  return {name:textOrNull(value.name),serviceAccount:textOrNull(value.serviceAccount),eventFilters:(value.eventFilters||[]).map(filter=>({attribute:textOrNull(filter.attribute),value:textOrNull(filter.value),operator:textOrNull(filter.operator)})),destination:{kind,service:textOrNull(destination.cloudRun?.service),region:textOrNull(destination.cloudRun?.region),path:textOrNull(destination.cloudRun?.path),cloudFunction:textOrNull(destination.cloudFunction)},reconciling:value.conditions&&Object.keys(value.conditions).length>0};
}
const responseState=result=>result.status===404?'NOT_FOUND':result.status===200?'READ':result.status===0?'NETWORK_ERROR':'HTTP_'+result.status;

/** Only Google metadata GETs and the read-only project getIamPolicy POST. */
export async function auditCloudBilling({phase,clients,baseline=null,projectId=PROJECT_ID,now=Date.now}={}){
  if(projectId!==PROJECT_ID||!['pre','post'].includes(phase))fail('INVALID_TARGET');
  if(phase==='post'&&(!baseline||baseline.schemaVersion!==1||baseline.phase!=='pre'||baseline.project?.projectId!==PROJECT_ID))fail('INVALID_BASELINE');
  let projectResponse;try{projectResponse=await clients.projects.get('/projects/'+PROJECT_ID,OPTIONS());}catch{fail('PROJECT_LOOKUP_FAILED');}
  const raw=projectResponse.body;
  if(projectResponse.status!==200||raw?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(String(raw.projectNumber))||raw.lifecycleState!=='ACTIVE')fail('INVALID_REMOTE_PROJECT');
  const projectNumber=String(raw.projectNumber);
  const sameResource=(actual,expected)=>typeof actual==='string'&&actual.replace(`projects/${projectNumber}/`,`projects/${PROJECT_ID}/`)===expected.replace(`projects/${projectNumber}/`,`projects/${PROJECT_ID}/`);
  if(baseline&&baseline.project.projectNumber!==projectNumber)fail('BASELINE_PROJECT_MISMATCH');
  const parent=raw.parent;if(parent&&(!['folder','organization'].includes(parent.type)||!/^\d{1,20}$/.test(String(parent.id))))fail('INVALID_PROJECT_PARENT');
  const snapshot={schemaVersion:1,phase,createdAtMs:now(),project:{projectId:PROJECT_ID,projectNumber,parent:parent?{type:parent.type,id:String(parent.id)}:null},region:REGION,policies:{},apis:{},inventories:{},targets:{},inheritance:{parentPolicyAudited:false,parentPresent:!!parent,groupsAudited:false},remainingEvidence:['effective-inherited-and-group-permissions','cleanup-private-event-delivery','disabled-http-response-smoke']};
  const paths=new Set([`projects POST /projects/${PROJECT_ID}:getIamPolicy`]);
  for(const name of SECRET_NAMES)paths.add(`secrets GET /projects/${PROJECT_ID}/secrets/${name}:getIamPolicy`);
  for(const name of APIS)paths.add(`serviceUsage GET /projects/${projectNumber}/services/${name}`);
  for(const key of ['functionsV1','functionsV2'])paths.add(`${key} GET /projects/${PROJECT_ID}/locations/-/functions`);
  paths.add(`run GET /projects/${PROJECT_ID}/locations/${REGION}/services`);paths.add(`eventarc GET /projects/${PROJECT_ID}/locations/${REGION}/triggers`);
  for(const id of Object.keys(TARGETS))paths.add(`functionsV2 GET /projects/${PROJECT_ID}/locations/${REGION}/functions/${id}`);
  const request=async(kind,method,resource,{body,queryParams}={})=>{
    if(!paths.has(`${kind} ${method} ${resource}`))fail('INVALID_READ_ROUTE');
    const options={...OPTIONS(),...(queryParams?{queryParams}:{})};
    try{return method==='GET'?await clients[kind].get(resource,options):await clients[kind].post(resource,body,options);}catch{return {status:0};}
  };
  for(const scope of ['project',...SECRET_NAMES]){
    const response=scope==='project'?await request('projects','POST',`/projects/${PROJECT_ID}:getIamPolicy`,{body:{options:{requestedPolicyVersion:3}}}):await request('secrets','GET',`/projects/${PROJECT_ID}/secrets/${scope}:getIamPolicy`,{queryParams:{'options.requestedPolicyVersion':3}});
    if(response.status!==200)fail('REQUIRED_IAM_SNAPSHOT_INCOMPLETE');snapshot.policies[scope]=validatePolicy(response.body);
  }
  for(const api of APIS){
    const resource=`/projects/${projectNumber}/services/${api}`,response=await request('serviceUsage','GET',resource);
    snapshot.apis[api]=response.status===200&&response.body?.name===resource.slice(1)&&['ENABLED','DISABLED'].includes(response.body.state)?response.body.state:responseState(response)==='READ'?'INVALID_METADATA':responseState(response);
  }
  const specs=[['functionsV1','cloudfunctions.googleapis.com','functions','-',value=>functionMetadata(value,false)],['functionsV2','cloudfunctions.googleapis.com','functions','-',functionMetadata],['run','run.googleapis.com','services',REGION,runMetadata],['eventarc','eventarc.googleapis.com','triggers',REGION,triggerMetadata]];
  for(const [kind,api,field,region,extract] of specs){
    const entry={state:snapshot.apis[api],scope:region==='-'?'all-locations':region,items:[]};snapshot.inventories[kind]=entry;
    if(entry.state!=='ENABLED')continue;
    entry.state='COMPLETE';let token;const seen=new Set();
    for(let page=0;page<20;page++){
      const response=await request(kind,'GET',`/projects/${PROJECT_ID}/locations/${region}/${field}`,{queryParams:{pageSize:100,...(token?{pageToken:token}:{})}});
      if(response.status!==200||!response.body||!Array.isArray(response.body[field]||[])||response.body.unreachable?.length){entry.state='INCOMPLETE';break;}
      for(const value of response.body[field]||[]){
        if(typeof value.name!=='string'||!new RegExp(`^projects/(${PROJECT_ID}|${projectNumber})/locations/${region==='-'?'[a-z0-9-]+':REGION}/${field}/[A-Za-z0-9_-]+$`).test(value.name)){entry.state='INCOMPLETE';break;}
        entry.items.push(extract(value));
      }
      if(entry.state!=='COMPLETE')break;token=response.body.nextPageToken;if(!token)break;
      if(typeof token!=='string'||token.length>4096||seen.has(token)||page===19){entry.state='INCOMPLETE';break;}seen.add(token);
    }
  }
  const resolve=(name,collection)=>{
    // The Firestore/Eventarc location can be a multi-region such as eur3.
    // Only the Cloud Run destination must be in the function's europe-west1.
    if(typeof name!=='string'||!new RegExp(`^projects/(${PROJECT_ID}|${projectNumber})/locations/${collection==='triggers'?'[a-z][a-z0-9-]{0,62}':REGION}/${collection}/[A-Za-z0-9_-]+$`).test(name))fail('INVALID_RESOLVED_RESOURCE');
    return '/'+name;
  };
  if(phase==='post')for(const [id,expected] of Object.entries(TARGETS)){
    const target={state:snapshot.apis['cloudfunctions.googleapis.com'],checks:{}};snapshot.targets[id]=target;
    if(target.state!=='ENABLED')continue;
    const resource=`/projects/${PROJECT_ID}/locations/${REGION}/functions/${id}`,response=await request('functionsV2','GET',resource);target.state=responseState(response);
    if(response.status!==200)continue;if(!sameResource(response.body?.name,resource.slice(1)))fail('FUNCTION_IDENTITY_MISMATCH');
    const metadata=functionMetadata(response.body),expectedAccount=`${expected.account}@${PROJECT_ID}.iam.gserviceaccount.com`;target.function=metadata;
    target.checks={active:metadata.state==='ACTIVE',node22:metadata.runtime==='nodejs22',runtimeAccount:metadata.serviceAccount===expectedAccount,limits:metadata.limits.minInstances===0&&metadata.limits.maxInstances===2&&metadata.limits.timeoutSeconds===60&&['256Mi','256MiB','256M'].includes(metadata.limits.memory),disabled:metadata.parameters.billingEnabled===false,production:metadata.parameters.environment==='production',revenueCatProject:metadata.parameters.revenueCatProjectMatches,secrets:metadata.secretVolumeCount===0&&exactKeys(metadata.secrets,expected.secrets)&&metadata.secrets.every(value=>value.key===value.secret&&[PROJECT_ID,projectNumber].includes(value.projectId)&&/^[1-9][0-9]*$/.test(value.version||''))};
    target.runState=snapshot.apis['run.googleapis.com'];target.runIAMState='NOT_READ';
    if(metadata.service&&snapshot.apis['run.googleapis.com']==='ENABLED'){
      const service=resolve(metadata.service,'services');paths.add('run GET '+service);paths.add('run GET '+service+':getIamPolicy');
      const runResponse=await request('run','GET',service),iamResponse=await request('run','GET',service+':getIamPolicy',{queryParams:{'options.requestedPolicyVersion':3}});
      target.runState=responseState(runResponse);target.runIAMState=responseState(iamResponse);
      if(runResponse.status===200){if(!sameResource(runResponse.body?.name,service.slice(1)))fail('RUN_IDENTITY_MISMATCH');target.run=runMetadata(runResponse.body);target.checks.runAccount=target.run.serviceAccount===expectedAccount;target.checks.runReady=target.run.terminalReady&&!target.run.reconciling;target.checks.runLimits=target.run.limits.minInstances===0&&target.run.limits.maxInstances===2&&target.run.limits.serviceMinInstances===0&&[null,2].includes(target.run.limits.serviceMaxInstances)&&target.run.limits.timeout==='60s'&&['256Mi','256MiB','256M'].includes(target.run.limits.memory);target.checks.runDisabled=target.run.parameters.billingEnabled===false;target.checks.runProduction=target.run.parameters.environment==='production';target.checks.runRevenueCatProject=target.run.parameters.revenueCatProjectMatches;target.checks.runSecrets=target.run.containerCount===1&&target.run.secretVolumeCount===0&&exactKeys(target.run.secretRefs,expected.secrets)&&target.run.secretRefs.every(value=>[value.key,`projects/${PROJECT_ID}/secrets/${value.key}`,`projects/${projectNumber}/secrets/${value.key}`].includes(value.secret)&&value.version===metadata.secrets.find(secret=>secret.key===value.key)?.version);}
      if(iamResponse.status===200)target.runPolicy=validatePolicy(iamResponse.body);
    }
    if(id==='billingAccountDeleted'){
      const event=metadata.eventTrigger;
      target.checks.cleanupEvent=event?.serviceAccount===expectedAccount&&event.eventType==='google.cloud.firestore.document.v1.written'&&event.retryPolicy==='RETRY_POLICY_RETRY'&&firestoreFilters(event.eventFilters);
      const runtimeMember='serviceAccount:'+expectedAccount;
      const bindings=target.runPolicy?.bindings||[];target.checks.cleanupPrivate=!!target.runPolicy&&target.run?.invokerIamDisabled===false&&![...bindings,...snapshot.policies.project.bindings||[]].some(binding=>binding.role==='roles/run.invoker'&&binding.members.some(value=>['allUsers','allAuthenticatedUsers'].includes(value)));
      target.checks.cleanupInvoker=!!target.runPolicy&&bindings.some(binding=>binding.role==='roles/run.invoker'&&!binding.condition&&binding.members.includes(runtimeMember));
      target.checks.cleanupNoProjectInvoker=!snapshot.policies.project.bindings?.some(binding=>binding.role==='roles/run.invoker'&&binding.members.includes(runtimeMember));
      target.triggerState=snapshot.apis['eventarc.googleapis.com'];
      if(event?.trigger&&snapshot.apis['eventarc.googleapis.com']==='ENABLED'){
        const trigger=resolve(event.trigger,'triggers');paths.add('eventarc GET '+trigger);const triggerResponse=await request('eventarc','GET',trigger);target.triggerState=responseState(triggerResponse);
        if(triggerResponse.status===200){if(!sameResource(triggerResponse.body?.name,trigger.slice(1)))fail('TRIGGER_IDENTITY_MISMATCH');target.trigger=triggerMetadata(triggerResponse.body);target.checks.triggerAccount=target.trigger.serviceAccount===expectedAccount;const destination=target.trigger.destination;target.checks.triggerDestination=destination.kind==='cloudFunction'?sameResource(destination.cloudFunction,`projects/${PROJECT_ID}/locations/${REGION}/functions/billingAccountDeleted`):destination.kind==='cloudRun'&&destination.region===REGION&&destination.service===metadata.service?.split('/').at(-1)&&[null,'','/'].includes(destination.path);target.checks.triggerFilters=firestoreFilters(target.trigger.eventFilters)&&target.trigger.eventFilters.some(value=>value.attribute==='type'&&value.value==='google.cloud.firestore.document.v1.written');target.checks.triggerReady=!target.trigger.reconciling;}
      }
    }
  }
  if(baseline)snapshot.diff=Object.fromEntries(['project',...SECRET_NAMES].map(scope=>[scope,policyDiff(baseline.policies?.[scope],snapshot.policies[scope])]));
  return snapshot;
}
export function summarizeAudit(snapshot,id){
  return {state:snapshot.phase==='pre'?'PRE_DEPLOY_SNAPSHOT_SAVED':'POST_DEPLOY_SNAPSHOT_SAVED',snapshotId:id,projectId:PROJECT_ID,region:REGION,parentPresent:snapshot.inheritance.parentPresent,parentType:snapshot.project.parent?.type||null,inheritanceAudited:false,apis:snapshot.apis,inventories:Object.fromEntries(Object.entries(snapshot.inventories).map(([kind,value])=>[kind,{state:value.state,scope:value.scope,count:value.items.length}])),targets:Object.fromEntries(Object.entries(snapshot.targets).map(([name,value])=>[name,{state:value.state,runState:value.runState,runIAMState:value.runIAMState,triggerState:value.triggerState,checks:value.checks}])),...(snapshot.diff?{diff:Object.fromEntries(Object.entries(snapshot.diff).map(([scope,value])=>[scope,{added:value.added.length,removed:value.removed.length,auditConfigsChanged:value.auditConfigsChanged}]))}:{}),remainingEvidence:snapshot.remainingEvidence};
}
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
export async function openAuditStore(root=ROOT){
  const base=path.resolve(root);if(!samePath(await realpath(base),base))fail('UNSAFE_LOCAL_PATH');
  let folder=base;for(const part of ['work','payments','iam-snapshots']){folder=path.join(folder,part);if(part==='iam-snapshots'){try{await mkdir(folder,{mode:0o700});}catch(error){if(error.code!=='EEXIST')fail('SNAPSHOT_FOLDER_UNAVAILABLE');}}const stat=await lstat(folder);if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_LOCAL_PATH');}
  const target=id=>{if(!SNAPSHOT_ID.test(id))fail('INVALID_SNAPSHOT_ID');return path.join(folder,id+'.json');};
  return {
    async save(snapshot){
      if(!['pre','post'].includes(snapshot.phase)||snapshot.project?.projectId!==PROJECT_ID)fail('INVALID_SNAPSHOT');
      const id=snapshot.phase+'-'+Date.now()+'-'+randomUUID(),filename=target(id),contents=JSON.stringify(snapshot)+'\n';if(Buffer.byteLength(contents)>8388608)fail('SNAPSHOT_TOO_LARGE');
      let handle;try{handle=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);await handle.writeFile(contents);await handle.sync();}catch{fail('SNAPSHOT_WRITE_FAILED');}finally{await handle?.close();}return {id,sha256:fingerprint(snapshot)};
    },
    async readBaseline(id){
      if(id!==PREDEPLOY_BASELINE&&!id.startsWith('pre-'))fail('INVALID_BASELINE');const filename=id===PREDEPLOY_BASELINE?path.join(path.dirname(folder),PREDEPLOY_BASELINE+'.json'):target(id),before=await lstat(filename);if(before.isSymbolicLink()||!before.isFile()||before.nlink!==1||before.size>8388608)fail('UNSAFE_LOCAL_PATH');
      let handle;try{handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const stat=await handle.stat();if(stat.ino!==before.ino||stat.dev!==before.dev||stat.nlink!==1)fail('UNSAFE_LOCAL_PATH');const value=JSON.parse(await handle.readFile('utf8'));
        if(id===PREDEPLOY_BASELINE){if(value.schemaVersion!==1||value.projectId!==PROJECT_ID||value.plan?.projectId!==PROJECT_ID||value.planDigest!==fingerprint(value.plan)||!/^\d{1,20}$/.test(value.plan.projectNumber))fail('INVALID_BASELINE');return {schemaVersion:1,phase:'pre',project:{projectId:PROJECT_ID,projectNumber:value.plan.projectNumber},policies:value.plan.policies,source:'reviewed-runtime-plan-snapshot'};}
        if(value.phase!=='pre'||value.schemaVersion!==1||value.project?.projectId!==PROJECT_ID)fail('INVALID_BASELINE');return value;
      }catch(error){if(error instanceof AuditError)throw error;fail('BASELINE_READ_FAILED');}finally{await handle?.close();}
    },
  };
}
async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};process.emitWarning=()=>{};
  try{const args=parseAuditArguments(process.argv.slice(2)),store=await openAuditStore(),baseline=args.phase==='post'?await store.readBaseline(args.baselineId):null,clients=await createGoogleClients({includeRuntimeIAM:true}),snapshot=await auditCloudBilling({phase:args.phase,clients,baseline}),saved=await store.save(snapshot);emit({...summarizeAudit(snapshot,saved.id),sha256:saved.sha256});}catch(error){emit(safeAuditFailure(error));process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
