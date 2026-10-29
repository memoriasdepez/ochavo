import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,SECRET_NAMES,createGoogleClients,openLocalStore} from './store-server-secrets.mjs';

// This helper can only ADD the reviewed runtime identities and their own grants.
// It cannot change Compute/PubSub, operator permissions, Cloud Run IAM or APIs.
export const RUNTIME_ACCOUNTS=Object.freeze([
  {id:'ochavo-billing-read',displayName:'Ochavo billing verification',roles:['roles/firebaseauth.viewer','roles/datastore.user'],secrets:[SECRET_NAMES[0]]},
  {id:'ochavo-billing-webhook',displayName:'Ochavo RevenueCat webhook',roles:['roles/firebaseauth.viewer','roles/datastore.user'],secrets:[SECRET_NAMES[0],SECRET_NAMES[2]]},
  {id:'ochavo-billing-cleanup',displayName:'Ochavo billing account cleanup',roles:['roles/datastore.user','roles/eventarc.eventReceiver'],secrets:[SECRET_NAMES[1]]},
].map(value=>Object.freeze({...value,roles:Object.freeze(value.roles),secrets:Object.freeze(value.secrets)})));
const REGION='europe-west1',SECRET_ROLE='roles/secretmanager.secretAccessor';
const OPTIONS=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});
const email=id=>`${id}@${PROJECT_ID}.iam.gserviceaccount.com`,member=id=>'serviceAccount:'+email(id);
const accountPath=id=>`/projects/${PROJECT_ID}/serviceAccounts/${email(id)}`;
const account=id=>RUNTIME_ACCOUNTS.find(value=>value.id===id);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
class IAMError extends Error{constructor(code,httpStatus=0){super(code);this.code=code;this.httpStatus=Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:0;}}
const fail=(code,status)=>{throw new IAMError(code,status);};
export const safeIAMFailure=error=>({state:error instanceof IAMError?error.code:'FAILED',httpStatus:error instanceof IAMError?error.httpStatus:0});
export function parseIAMArguments(args){
  if(args.length===1&&args[0]==='plan')return {mode:'plan'};
  if(args.length===3&&args[0]==='apply'&&args[1]==='--approve-plan'&&/^[a-f0-9]{64}$/.test(args[2]))return {mode:'apply',approvedDigest:args[2]};
  fail('INVALID_ARGUMENTS');
}
function policy(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.etag!=='string'||!value.etag||value.etag.length>1024||![undefined,0,1,3].includes(value.version)||Object.keys(value).some(key=>!['version','etag','bindings','auditConfigs'].includes(key)))fail('INVALID_IAM_POLICY');
  if(value.bindings!==undefined&&(!Array.isArray(value.bindings)||value.bindings.length>5000))fail('INVALID_IAM_POLICY');
  for(const binding of value.bindings||[]){
    if(!binding||typeof binding.role!=='string'||!binding.role||!Array.isArray(binding.members)||binding.members.some(item=>typeof item!=='string'||!item||item.length>2048)||Object.keys(binding).some(key=>!['role','members','condition'].includes(key)))fail('INVALID_IAM_POLICY');
    if(binding.condition!==undefined&&(!binding.condition||typeof binding.condition!=='object'||Array.isArray(binding.condition)||typeof binding.condition.expression!=='string'||Object.values(binding.condition).some(item=>typeof item!=='string')))fail('INVALID_IAM_POLICY');
    if(binding.condition&&value.version!==3)fail('CONDITIONAL_POLICY_NOT_V3');
  }
  if(value.auditConfigs!==undefined&&!Array.isArray(value.auditConfigs))fail('INVALID_IAM_POLICY');
  return structuredClone(value);
}
const includesGrant=(value,grant)=>(value.bindings||[]).some(binding=>binding.role===grant.role&&!binding.condition&&binding.members.includes(grant.member));
// IAM bindings/members/audit lists are sets; Google may reorder them or return
// version 1 for an unconditional policy even when version 3 was requested.
const sortedSets=value=>Array.isArray(value)?value.map(sortedSets).sort((a,b)=>canonical(a).localeCompare(canonical(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sortedSets(item)])):value;
const samePolicy=(a,b)=>canonical(sortedSets({bindings:a.bindings||[],auditConfigs:a.auditConfigs||[]}))===canonical(sortedSets({bindings:b.bindings||[],auditConfigs:b.auditConfigs||[]}));
function expectedGrants(scope){
  if(scope==='project')return RUNTIME_ACCOUNTS.flatMap(value=>value.roles.map(role=>({role,member:member(value.id)})));
  if(!SECRET_NAMES.includes(scope))fail('INVALID_POLICY_SCOPE');
  return RUNTIME_ACCOUNTS.filter(value=>value.secrets.includes(scope)).map(value=>({role:SECRET_ROLE,member:member(value.id)}));
}
function assertRuntimeGrants(value,scope){
  const permitted=expectedGrants(scope);
  for(const binding of value.bindings||[])for(const target of binding.members){
    if(!RUNTIME_ACCOUNTS.some(value=>member(value.id)===target))continue;
    if(!permitted.some(grant=>grant.role===binding.role&&grant.member===target))fail('UNEXPECTED_RUNTIME_GRANT_REQUIRES_REVIEW');
    if(binding.condition)fail('CONDITIONAL_RUNTIME_GRANT_REQUIRES_REVIEW');
  }
}
export function addRuntimeGrants(value,scope){
  const next=policy(value);assertRuntimeGrants(next,scope);
  next.version=3;next.bindings||=[];
  for(const grant of expectedGrants(scope)){
    if(includesGrant(next,grant))continue;
    const binding=next.bindings.find(item=>item.role===grant.role&&!item.condition);
    if(binding)binding.members.push(grant.member);else next.bindings.push({role:grant.role,members:[grant.member]});
  }
  return next;
}
function validateAccount(body,id){
  const namePrefix=`projects/${PROJECT_ID}/serviceAccounts/`;
  if(!account(id)||body?.projectId!==PROJECT_ID||body.email!==email(id)||typeof body.uniqueId!=='string'||!/^\d{1,30}$/.test(body.uniqueId)||![namePrefix+body.email,namePrefix+body.uniqueId].includes(body.name)||body.disabled===true)fail('INVALID_RUNTIME_ACCOUNT');
  return {email:body.email,uniqueId:body.uniqueId};
}
function routes(projectNumber){
  const allowed=new Set(['projects GET /projects/'+PROJECT_ID,'projects POST /projects/'+PROJECT_ID+':getIamPolicy','projects POST /projects/'+PROJECT_ID+':setIamPolicy','iam POST /projects/'+PROJECT_ID+'/serviceAccounts']);
  for(const {id} of RUNTIME_ACCOUNTS){allowed.add('iam GET '+accountPath(id));allowed.add('iam POST '+accountPath(id)+':testIamPermissions');}
  for(const name of SECRET_NAMES){const resource=`/projects/${PROJECT_ID}/secrets/${name}`;allowed.add('secrets GET '+resource+':getIamPolicy');allowed.add('secrets POST '+resource+':setIamPolicy');}
  for(const kind of ['functionsV1','functionsV2'])allowed.add(`${kind} GET /projects/${PROJECT_ID}/locations/-/functions`);
  allowed.add(`run GET /projects/${PROJECT_ID}/locations/${REGION}/services`);
  allowed.add(`eventarc GET /projects/${PROJECT_ID}/locations/-/triggers`);
  for(const service of ['cloudfunctions.googleapis.com','run.googleapis.com','eventarc.googleapis.com'])allowed.add(`serviceUsage GET /projects/${projectNumber}/services/${service}`);
  return allowed;
}
async function apiFor(clients){
  let response;
  try{response=await clients.projects.get('/projects/'+PROJECT_ID,OPTIONS());}catch{fail('PROJECT_LOOKUP_FAILED');}
  if(response.status!==200)fail('PROJECT_LOOKUP_FAILED',response.status);
  if(response.body?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(String(response.body.projectNumber))||(response.body.lifecycleState!==undefined&&response.body.lifecycleState!=='ACTIVE'))fail('INVALID_REMOTE_PROJECT');
  const projectNumber=String(response.body.projectNumber),allowed=routes(projectNumber);
  const request=async(kind,method,resource,body,queryParams)=>{
    if(!allowed.has(`${kind} ${method} ${resource}`))fail('INVALID_API_ROUTE');
    const options={...OPTIONS(),...(queryParams?{queryParams}:{})};
    try{return method==='GET'?await clients[kind].get(resource,options):await clients[kind].post(resource,body,options);}catch{fail('REQUEST_OUTCOME_UNKNOWN');}
  };
  return {
    projectNumber,request,
    async getAccount(id){
      if(!account(id))fail('INVALID_ACCOUNT_SELECTION');
      const result=await request('iam','GET',accountPath(id));
      if(result.status===404)return null;
      if(result.status!==200)fail('ACCOUNT_LOOKUP_FAILED',result.status);
      return validateAccount(result.body,id);
    },
    async readPolicy(scope){
      expectedGrants(scope);
      const result=scope==='project'?await request('projects','POST',`/projects/${PROJECT_ID}:getIamPolicy`,{options:{requestedPolicyVersion:3}}):await request('secrets','GET',`/projects/${PROJECT_ID}/secrets/${scope}:getIamPolicy`,undefined,{'options.requestedPolicyVersion':3});
      if(result.status!==200)fail('POLICY_LOOKUP_FAILED',result.status);
      const value=policy(result.body);assertRuntimeGrants(value,scope);return value;
    },
    async actAs(id){
      const result=await request('iam','POST',accountPath(id)+':testIamPermissions',{permissions:['iam.serviceAccounts.actAs']});
      if(result.status!==200)fail('ACT_AS_CHECK_FAILED',result.status);
      if(result.body?.permissions!==undefined&&(!Array.isArray(result.body.permissions)||result.body.permissions.some(value=>value!=='iam.serviceAccounts.actAs')))fail('INVALID_PERMISSION_METADATA');
      return result.body?.permissions?.includes('iam.serviceAccounts.actAs')===true;
    },
  };
}
async function inventory(api,projectPolicy){
  const compute=`serviceAccount:${api.projectNumber}-compute@developer.gserviceaccount.com`,pubsub=`serviceAccount:service-${api.projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
  const existingGrants=(target,roles)=>(projectPolicy.bindings||[]).filter(binding=>roles.includes(binding.role)&&binding.members.includes(target)).map(binding=>({role:binding.role,...(binding.condition?{condition:structuredClone(binding.condition)}:{})}));
  const result={compute:{projectGrants:existingGrants(compute,['roles/run.invoker','roles/eventarc.eventReceiver'])},pubsub:{projectGrants:existingGrants(pubsub,['roles/iam.serviceAccountTokenCreator'])},coverage:'functions-all-locations,eventarc-all-locations,cloud-run-services-europe-west1',computeRemovalEligible:false,lists:[]};
  const enabled=new Map();
  for(const service of ['cloudfunctions.googleapis.com','run.googleapis.com','eventarc.googleapis.com']){
    const resource=`/projects/${api.projectNumber}/services/${service}`;
    let response;try{response=await api.request('serviceUsage','GET',resource);}catch{enabled.set(service,'UNKNOWN');continue;}
    if(response.status!==200||response.body?.name!==resource.slice(1)||!['ENABLED','DISABLED'].includes(response.body.state)){enabled.set(service,'UNKNOWN');continue;}
    enabled.set(service,response.body.state);
  }
  const specs=[
    {kind:'functionsV1',service:'cloudfunctions.googleapis.com',resource:`/projects/${PROJECT_ID}/locations/-/functions`,field:'functions',identity:value=>[value.serviceAccountEmail]},
    {kind:'functionsV2',service:'cloudfunctions.googleapis.com',resource:`/projects/${PROJECT_ID}/locations/-/functions`,field:'functions',identity:value=>[value.serviceConfig?.serviceAccountEmail,value.eventTrigger?.serviceAccountEmail]},
    {kind:'run',service:'run.googleapis.com',resource:`/projects/${PROJECT_ID}/locations/${REGION}/services`,field:'services',identity:value=>[value.template?.serviceAccount]},
    {kind:'eventarc',service:'eventarc.googleapis.com',resource:`/projects/${PROJECT_ID}/locations/-/triggers`,field:'triggers',identity:value=>[value.serviceAccount]},
  ];
  for(const spec of specs){
    const entry={kind:spec.kind,state:enabled.get(spec.service),count:0,computeUses:[],unspecifiedIdentity:0};result.lists.push(entry);
    if(entry.state!=='ENABLED')continue;
    let token,seen=new Set();entry.state='COMPLETE';
    for(let page=0;page<20;page++){
      let response;try{response=await api.request(spec.kind,'GET',spec.resource,undefined,{pageSize:100,...(token?{pageToken:token}:{})});}catch{entry.state='INCOMPLETE';break;}
      const values=response.body?.[spec.field]||[];
      if(response.status!==200||!Array.isArray(values)||response.body?.unreachable?.length){entry.state='INCOMPLETE';break;}
      for(const value of values){
        if(typeof value.name!=='string'||!new RegExp(`^projects/(${PROJECT_ID}|${api.projectNumber})/locations/[a-z0-9-]+/${spec.field}/[a-zA-Z0-9_-]+$`).test(value.name)){entry.state='INCOMPLETE';break;}
        entry.count++;const identities=spec.identity(value).filter(Boolean);
        if(!identities.length)entry.unspecifiedIdentity++;
        if(identities.includes(compute.slice('serviceAccount:'.length)))entry.computeUses.push(value.name);
      }
      if(entry.state!=='COMPLETE')break;
      token=response.body?.nextPageToken;
      if(!token)break;
      if(typeof token!=='string'||token.length>4096||seen.has(token)||page===19){entry.state='INCOMPLETE';break;}seen.add(token);
    }
  }
  return result;
}
function validState(record){
  if(record===null)return null;
  if(!record||record.schemaVersion!==1||record.projectId!==PROJECT_ID||!record.plan||digest(record.plan)!==record.planDigest||!Array.isArray(record.journal)||record.journal.length>100||!Array.isArray(record.history)||record.history.length>20)fail('INVALID_LOCAL_RECORD');
  if(record.plan.projectId!==PROJECT_ID||record.plan.schemaVersion!==1||record.plan.region!==REGION||!/^\d{1,20}$/.test(record.plan.projectNumber)||canonical(record.plan.intent)!==canonical(RUNTIME_ACCOUNTS)||!Number.isSafeInteger(record.plan.createdAtMs))fail('INVALID_LOCAL_RECORD');
  const ids=[...RUNTIME_ACCOUNTS.map(value=>'account:'+value.id),'policy:project',...SECRET_NAMES.map(value=>'policy:'+value)];
  const seen=new Set();
  for(const entry of record.journal){
    if(!entry||!ids.includes(entry.id)||seen.has(entry.id)||!['started','confirmed','conflict','rejected'].includes(entry.phase)||!Number.isSafeInteger(entry.startedAtMs))fail('INVALID_LOCAL_RECORD');
    if(entry.id.startsWith('policy:')){policy(entry.before);assertRuntimeGrants(entry.before,entry.id.slice('policy:'.length));}
    seen.add(entry.id);
  }
  for(const {id} of RUNTIME_ACCOUNTS){const prior=record.plan.accounts?.[id];if(prior!==null&&(!prior||prior.email!==email(id)||typeof prior.uniqueId!=='string'||!/^\d{1,30}$/.test(prior.uniqueId)))fail('INVALID_LOCAL_RECORD');}
  for(const scope of ['project',...SECRET_NAMES]){policy(record.plan.policies?.[scope]);assertRuntimeGrants(record.plan.policies[scope],scope);}
  return structuredClone(record);
}
async function persist(saveRecord,value){try{await saveRecord(structuredClone(value));}catch{fail('LOCAL_RECORD_FAILED');}}
/** Read-only Google calls. Private local record includes full IAM v3 snapshots. */
export async function planRuntimeIAM({projectId=PROJECT_ID,clients,record=null,saveRecord,now=Date.now}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const prior=validState(record);
  if(prior?.journal.some(entry=>entry.phase==='started'))fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
  const api=await apiFor(clients),policies={},accounts={},actAs={};
  if(prior&&prior.plan.projectNumber!==api.projectNumber)fail('INVALID_REMOTE_PROJECT');
  for(const scope of ['project',...SECRET_NAMES])policies[scope]=await api.readPolicy(scope);
  for(const {id} of RUNTIME_ACCOUNTS){accounts[id]=await api.getAccount(id);actAs[id]=accounts[id]?await api.actAs(id):null;}
  const plan={schemaVersion:1,projectId:PROJECT_ID,projectNumber:api.projectNumber,region:REGION,createdAtMs:now(),intent:RUNTIME_ACCOUNTS,accounts,policies,actAs,inventory:await inventory(api,policies.project)};
  const next={schemaVersion:1,projectId:PROJECT_ID,plan,planDigest:digest(plan),journal:[],history:prior?[...prior.history,{planDigest:prior.planDigest,journal:prior.journal}].slice(-20):[]};
  await persist(saveRecord,next);
  return {state:'PLAN_READY_NOT_APPLIED',planDigest:next.planDigest,accountsToCreate:RUNTIME_ACCOUNTS.filter(value=>!accounts[value.id]).map(value=>value.id),grantsToAdd:Object.fromEntries(['project',...SECRET_NAMES].map(scope=>[scope,expectedGrants(scope).filter(grant=>!includesGrant(policies[scope],grant))])),actAs,inventory:plan.inventory};
}
/** Explicit reviewed digest, with one POST per operation and durable uncertainty. */
export async function applyRuntimeIAM({projectId=PROJECT_ID,approvedDigest,clients,record,saveRecord,now=Date.now}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const state=validState(record);
  if(!state||approvedDigest!==state.planDigest||!/^[a-f0-9]{64}$/.test(approvedDigest))fail('PLAN_APPROVAL_REQUIRED');
  if(now()<state.plan.createdAtMs||now()-state.plan.createdAtMs>86400000)fail('PLAN_EXPIRED_REVIEW_REQUIRED');
  const api=await apiFor(clients);if(api.projectNumber!==state.plan.projectNumber)fail('INVALID_REMOTE_PROJECT');
  const save=()=>persist(saveRecord,state);
  const previous=id=>state.journal.find(entry=>entry.id===id);
  const begin=async(id,before)=>{if(previous(id))fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');const entry={id,phase:'started',startedAtMs:now(),before};state.journal.push(entry);await save();return entry;};
  const confirm=async(entry,after)=>{entry.phase='confirmed';entry.after=after;await save();};
  const rejected=async(entry,response)=>{
    if([409,412].includes(response.status))entry.phase='conflict';else if([400,401,403,404].includes(response.status))entry.phase='rejected';
    entry.httpStatus=Number.isInteger(response.status)?response.status:0;await save();
    fail(entry.phase==='conflict'?'IAM_CONFLICT_REPLAN_REQUIRED':'MUTATION_OUTCOME_REQUIRES_REVIEW',response.status);
  };
  // Validate every policy before creating identities or changing any grant.
  for(const scope of ['project',...SECRET_NAMES])await api.readPolicy(scope);
  for(const definition of RUNTIME_ACCOUNTS){
    const {id}=definition,key='account:'+id,prior=previous(key),baseline=state.plan.accounts[id];
    let current=await api.getAccount(id);
    if((baseline&&(!current||current.uniqueId!==baseline.uniqueId))||(prior?.after?.uniqueId&&prior.after.uniqueId!==current?.uniqueId))fail('ACCOUNT_IDENTITY_CHANGED_REVIEW_REQUIRED');
    if(prior?.phase==='conflict'||prior?.phase==='rejected')fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    if(current){if(prior?.phase==='started')await confirm(prior,current);continue;}
    if(prior)fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    const entry=await begin(key,null);
    const response=await api.request('iam','POST',`/projects/${PROJECT_ID}/serviceAccounts`,{accountId:id,serviceAccount:{displayName:definition.displayName}});
    if(![200,201].includes(response.status))await rejected(entry,response);
    const created=validateAccount(response.body,id);current=await api.getAccount(id);
    if(!current||current.uniqueId!==created.uniqueId)fail('ACCOUNT_CREATE_NOT_CONFIRMED');
    await confirm(entry,current);
  }
  for(const scope of ['project',...SECRET_NAMES]){
    const key='policy:'+scope,prior=previous(key),current=await api.readPolicy(scope),grants=expectedGrants(scope);
    if(prior?.phase==='conflict'||prior?.phase==='rejected')fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    if(grants.every(grant=>includesGrant(current,grant))){
      if(prior?.phase==='started'){
        if(!samePolicy(current,addRuntimeGrants(prior.before,scope)))fail('POST_WRITE_POLICY_CHANGED_REVIEW_REQUIRED');
        await confirm(prior,current);
      }
      continue;
    }
    if(prior)fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    const next=addRuntimeGrants(current,scope),entry=await begin(key,current);
    const response=scope==='project'?await api.request('projects','POST',`/projects/${PROJECT_ID}:setIamPolicy`,{policy:next}):await api.request('secrets','POST',`/projects/${PROJECT_ID}/secrets/${scope}:setIamPolicy`,{policy:next});
    if(response.status!==200)await rejected(entry,response);
    const after=await api.readPolicy(scope);
    if(!grants.every(grant=>includesGrant(after,grant)))fail('POLICY_WRITE_NOT_CONFIRMED');
    // Check exact intended additions immediately; concurrent unrelated edits are
    // preserved by etag but need review if they race with post-write verification.
    if(!samePolicy(after,next))fail('POST_WRITE_POLICY_CHANGED_REVIEW_REQUIRED');
    await confirm(entry,after);
  }
  const actAs={};for(const {id} of RUNTIME_ACCOUNTS)actAs[id]=await api.actAs(id);
  return {state:'RUNTIME_GRANTS_VERIFIED_NOT_DEPLOYED',planDigest:state.planDigest,actAs,operatorGrantChanged:false,computeGrantChanged:false,pubsubGrantChanged:false,cleanupRunInvoker:'PENDING_RESOLVED_SERVICE',purchasesEnabled:false};
}
async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');
  for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};process.emitWarning=()=>{};
  let local;
  try{
    const options=parseIAMArguments(process.argv.slice(2));local=await openLocalStore(undefined,'runtime-iam');
    const record=await local.readRecord(),clients=await createGoogleClients({includeRuntimeIAM:true});
    const common={clients,record,saveRecord:value=>local.saveRecord(value)};
    const result=options.mode==='plan'?await planRuntimeIAM(common):await applyRuntimeIAM({...common,approvedDigest:options.approvedDigest});emit(result);
  }catch(error){emit(safeIAMFailure(error));process.exitCode=1;}
  finally{try{await local?.close();}catch{emit({state:'LOCAL_LOCK_REQUIRES_REVIEW',httpStatus:0});process.exitCode=1;}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
