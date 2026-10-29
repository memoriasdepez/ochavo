import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,createGoogleClients,openLocalStore} from './store-server-secrets.mjs';

const REGION='europe-west1',FUNCTION=`projects/${PROJECT_ID}/locations/${REGION}/functions/billingAccountDeleted`;
const ACCOUNT=`ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`,MEMBER=`serviceAccount:${ACCOUNT}`,ROLE='roles/run.invoker';
const OPTIONS=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const sorted=value=>Array.isArray(value)?value.map(sorted).sort((a,b)=>canonical(a).localeCompare(canonical(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sorted(item)])):value;
const samePolicy=(a,b)=>canonical(sorted({bindings:a.bindings||[],auditConfigs:a.auditConfigs||[]}))===canonical(sorted({bindings:b.bindings||[],auditConfigs:b.auditConfigs||[]}));
class InvokerError extends Error{constructor(code,status=0){super(code);this.code=code;this.httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:0;}}
const fail=(code,status)=>{throw new InvokerError(code,status);};
export const safeInvokerFailure=error=>({state:error instanceof InvokerError?error.code:'FAILED',httpStatus:error instanceof InvokerError?error.httpStatus:0});
export function parseInvokerArguments(args){
  if(args.length===1&&args[0]==='plan')return {mode:'plan'};
  if(args.length===3&&args[0]==='apply'&&args[1]==='--approve-plan'&&/^[a-f0-9]{64}$/.test(args[2]))return {mode:'apply',approvedDigest:args[2]};
  fail('INVALID_ARGUMENTS');
}
function policy(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.etag!=='string'||!value.etag||![undefined,0,1,3].includes(value.version)||Object.keys(value).some(key=>!['version','etag','bindings','auditConfigs'].includes(key))||value.bindings!==undefined&&!Array.isArray(value.bindings)||value.auditConfigs!==undefined&&!Array.isArray(value.auditConfigs))fail('INVALID_IAM_POLICY');
  for(const binding of value.bindings||[]){
    if(!binding||typeof binding.role!=='string'||!Array.isArray(binding.members)||binding.members.some(member=>typeof member!=='string')||Object.keys(binding).some(key=>!['role','members','condition'].includes(key)))fail('INVALID_IAM_POLICY');
    if(binding.condition!==undefined&&(!binding.condition||typeof binding.condition!=='object'||Array.isArray(binding.condition)||value.version!==3||typeof binding.condition.expression!=='string'||Object.values(binding.condition).some(value=>typeof value!=='string')))fail('INVALID_IAM_CONDITION');
  }
  return structuredClone(value);
}
const hasGrant=value=>(value.bindings||[]).some(binding=>binding.role===ROLE&&!binding.condition&&binding.members.includes(MEMBER));
function safePolicy(value,project=false){
  const result=policy(value);
  if((result.bindings||[]).some(binding=>binding.members.some(member=>['allUsers','allAuthenticatedUsers'].includes(member))))fail('PUBLIC_INVOKER_REQUIRES_REVIEW');
  if(!project&&(result.bindings||[]).some(binding=>binding.role===ROLE&&binding.condition&&binding.members.includes(MEMBER)))fail('CONDITIONAL_CLEANUP_GRANT_REQUIRES_REVIEW');
  return result;
}
function withGrant(value){
  const next=safePolicy(value);next.version=3;next.bindings||=[];
  if(!hasGrant(next)){const binding=next.bindings.find(binding=>binding.role===ROLE&&!binding.condition);if(binding)binding.members.push(MEMBER);else next.bindings.push({role:ROLE,members:[MEMBER]});}
  return next;
}
const filtersValid=(filters,type)=>Array.isArray(filters)&&filters.some(f=>f.attribute==='database'&&f.value==='(default)')&&filters.some(f=>f.attribute==='document'&&f.value==='accountDeletions/{uid}'&&f.operator==='match-path-pattern')&&(!type||filters.some(f=>f.attribute==='type'&&f.value==='google.cloud.firestore.document.v1.written'));

async function inspect(clients){
  // Routes are added only from validated metadata under this fixed project.
  const routes=new Set([`projects GET /projects/${PROJECT_ID}`,`projects POST /projects/${PROJECT_ID}:getIamPolicy`,`functionsV2 GET /${FUNCTION}`]);
  const request=async(kind,method,resource,body,queryParams)=>{
    if(!routes.has(`${kind} ${method} ${resource}`))fail('INVALID_API_ROUTE');
    const options={...OPTIONS(),...(queryParams?{queryParams}:{})};
    try{return method==='GET'?await clients[kind].get(resource,options):await clients[kind].post(resource,body,options);}catch{fail('REQUEST_OUTCOME_UNKNOWN');}
  };
  const read=async(kind,resource,queryParams)=>{const response=await request(kind,'GET',resource,undefined,queryParams);if(response.status!==200)fail('METADATA_READ_FAILED',response.status);return response.body;};
  const project=await read('projects',`/projects/${PROJECT_ID}`),projectNumber=String(project?.projectNumber);
  if(project?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(projectNumber)||project.lifecycleState!=='ACTIVE')fail('INVALID_REMOTE_PROJECT');
  // An organization/folder needs a separate effective-access review; this helper
  // never assumes service getIamPolicy includes inherited permissions.
  if(project.parent)fail('INHERITED_ACCESS_REVIEW_REQUIRED');
  const canonicalResource=value=>typeof value==='string'?value.replace(`projects/${projectNumber}/`,`projects/${PROJECT_ID}/`):'';
  const projectPolicyResult=await request('projects','POST',`/projects/${PROJECT_ID}:getIamPolicy`,{options:{requestedPolicyVersion:3}});
  if(projectPolicyResult.status!==200)fail('PROJECT_POLICY_READ_FAILED',projectPolicyResult.status);safePolicy(projectPolicyResult.body,true);
  const fn=await read('functionsV2',`/${FUNCTION}`),event=fn?.eventTrigger;
  if(canonicalResource(fn?.name)!==FUNCTION||fn.state!=='ACTIVE'||fn.serviceConfig?.serviceAccountEmail!==ACCOUNT||event?.serviceAccountEmail!==ACCOUNT||event.retryPolicy!=='RETRY_POLICY_RETRY'||event.eventType!=='google.cloud.firestore.document.v1.written'||!filtersValid(event.eventFilters,false))fail('CLEANUP_FUNCTION_NOT_READY');
  const service=canonicalResource(fn.serviceConfig.service),trigger=canonicalResource(event.trigger);
  if(!new RegExp(`^projects/${PROJECT_ID}/locations/${REGION}/services/[a-z][a-z0-9-]{0,62}$`).test(service)||!new RegExp(`^projects/${PROJECT_ID}/locations/[a-z0-9-]+/triggers/[a-zA-Z0-9_-]+$`).test(trigger))fail('INVALID_RESOLVED_RESOURCE');
  for(const suffix of ['',':getIamPolicy'])routes.add(`run GET /${service}${suffix}`);
  routes.add(`run POST /${service}:setIamPolicy`);routes.add(`eventarc GET /${trigger}`);
  const run=await read('run',`/${service}`);
  if(canonicalResource(run?.name)!==service||run.template?.serviceAccount!==ACCOUNT||typeof run.uid!=='string'||!run.uid||run.uid.length>256||run.reconciling===true||run.terminalCondition?.state!=='CONDITION_SUCCEEDED')fail('CLEANUP_RUN_NOT_READY');
  if(run.invokerIamDisabled===true)fail('RUN_IAM_BYPASS_REQUIRES_REVIEW');
  const actualTrigger=await read('eventarc',`/${trigger}`);
  const destination=actualTrigger?.destination||{},destinationKeys=Object.keys(destination);
  const destinationMatches=destinationKeys.length===1&&(destinationKeys[0]==='cloudFunction'&&canonicalResource(destination.cloudFunction)===FUNCTION||destinationKeys[0]==='cloudRun'&&destination.cloudRun?.region===REGION&&destination.cloudRun.service===service.split('/').at(-1)&&[undefined,'','/'].includes(destination.cloudRun.path));
  if(canonicalResource(actualTrigger?.name)!==trigger||actualTrigger.serviceAccount!==ACCOUNT||!destinationMatches||!filtersValid(actualTrigger.eventFilters,true)||actualTrigger.conditions&&Object.keys(actualTrigger.conditions).length)fail('CLEANUP_TRIGGER_NOT_READY');
  const readPolicy=async()=>safePolicy(await read('run',`/${service}:getIamPolicy`,{'options.requestedPolicyVersion':3}));
  return {projectNumber,service,runUid:run.uid,trigger,policy:await readPolicy(),readPolicy,request};
}
function validRecord(value){
  if(value===null)return null;
  const plan=value?.plan;
  if(!value||value.schemaVersion!==1||value.projectId!==PROJECT_ID||!plan||digest(plan)!==value.planDigest||plan.projectId!==PROJECT_ID||plan.function!==FUNCTION||plan.role!==ROLE||plan.member!==MEMBER||!Number.isSafeInteger(plan.createdAtMs)||!/^\d{1,20}$/.test(plan.projectNumber)||typeof plan.runUid!=='string'||typeof plan.service!=='string'||typeof plan.trigger!=='string')fail('INVALID_LOCAL_RECORD');
  safePolicy(plan.policy);
  if(value.journal!==null){const entry=value.journal;if(!entry||!['started','confirmed','conflict','rejected'].includes(entry.phase)||!Number.isSafeInteger(entry.startedAtMs))fail('INVALID_LOCAL_RECORD');safePolicy(entry.before);if(entry.after)policy(entry.after);}
  return structuredClone(value);
}
async function saveRecordSafe(saveRecord,value){try{await saveRecord(structuredClone(value));}catch{fail('LOCAL_RECORD_FAILED');}}
export async function planCleanupInvoker({projectId=PROJECT_ID,clients,record=null,saveRecord,now=Date.now}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const previous=validRecord(record);if(previous?.journal?.phase==='started')fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
  const current=await inspect(clients);
  const plan={projectId:PROJECT_ID,projectNumber:current.projectNumber,function:FUNCTION,service:current.service,runUid:current.runUid,trigger:current.trigger,role:ROLE,member:MEMBER,createdAtMs:now(),policy:current.policy};
  const state={schemaVersion:1,projectId:PROJECT_ID,plan,planDigest:digest(plan),journal:null};await saveRecordSafe(saveRecord,state);
  return {state:'PLAN_READY_NOT_APPLIED',planDigest:state.planDigest,service:current.service,role:ROLE,member:MEMBER,grantsToAdd:hasGrant(current.policy)?0:1,publicAccess:false};
}
export async function applyCleanupInvoker({projectId=PROJECT_ID,clients,record,approvedDigest,saveRecord,now=Date.now}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const state=validRecord(record);
  if(!state||approvedDigest!==state.planDigest||!/^[a-f0-9]{64}$/.test(approvedDigest))fail('PLAN_APPROVAL_REQUIRED');
  if(now()<state.plan.createdAtMs||now()-state.plan.createdAtMs>86400000)fail('PLAN_EXPIRED_REVIEW_REQUIRED');
  const current=await inspect(clients);
  for(const key of ['projectNumber','service','runUid','trigger'])if(current[key]!==state.plan[key])fail('RESOURCE_CHANGED_REPLAN_REQUIRED');
  const finish=async after=>{if(state.journal){state.journal.phase='confirmed';state.journal.after=after;await saveRecordSafe(saveRecord,state);}return {state:'CLEANUP_INVOKER_VERIFIED',planDigest:state.planDigest,service:current.service,mutationApplied:!!state.journal,publicAccess:false};};
  if(state.journal){
    if(!['started','confirmed'].includes(state.journal.phase)||!samePolicy(current.policy,withGrant(state.journal.before)))fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
    return finish(current.policy); // Never POST again after an uncertain outcome.
  }
  if(hasGrant(current.policy))return finish(current.policy);
  const next=withGrant(current.policy);
  state.journal={phase:'started',startedAtMs:now(),before:current.policy};
  await saveRecordSafe(saveRecord,state); // Durable, atomic local journal BEFORE POST.
  const response=await current.request('run','POST',`/${current.service}:setIamPolicy`,{policy:next,updateMask:'bindings,etag'});
  if(response.status!==200){
    if([409,412].includes(response.status))state.journal.phase='conflict';else if([400,401,403,404].includes(response.status))state.journal.phase='rejected';
    state.journal.httpStatus=Number.isInteger(response.status)?response.status:0;await saveRecordSafe(saveRecord,state);
    fail('MUTATION_OUTCOME_REQUIRES_REVIEW',response.status);
  }
  const after=await current.readPolicy();
  if(!hasGrant(after)||!samePolicy(after,next))fail('POST_WRITE_POLICY_CHANGED_REVIEW_REQUIRED');
  return finish(after);
}
async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');
  for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};process.emitWarning=()=>{};
  let local;
  try{const options=parseInvokerArguments(process.argv.slice(2));local=await openLocalStore(undefined,'cleanup-run-invoker');const clients=await createGoogleClients({includeRuntimeIAM:true}),record=await local.readRecord(),common={clients,record,saveRecord:value=>local.saveRecord(value)};emit(options.mode==='plan'?await planCleanupInvoker(common):await applyCleanupInvoker({...common,approvedDigest:options.approvedDigest}));}
  catch(error){emit(safeInvokerFailure(error));process.exitCode=1;}
  finally{try{await local?.close();}catch{emit({state:'LOCAL_LOCK_REQUIRES_REVIEW',httpStatus:0});process.exitCode=1;}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
