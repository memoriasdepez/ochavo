import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {PROJECT_ID,createGoogleClients,openLocalStore} from './store-server-secrets.mjs';

export const SERVICE='secretmanager.googleapis.com';
const OPERATION=/^operations\/[A-Za-z0-9_-][A-Za-z0-9._~-]{0,199}$/;
const options=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});
class EnableError extends Error{constructor(code,httpStatus=0){super(code);this.code=code;this.httpStatus=Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:0;}}
const fail=(code,status)=>{throw new EnableError(code,status);};
export const safeEnableFailure=error=>({service:SERVICE,httpStatus:error instanceof EnableError?error.httpStatus:0,state:error instanceof EnableError?error.code:'FAILED'});

function validateRecord(record,projectNumber){
  if(record===null)return null;
  if(!record||record.schemaVersion!==1||record.projectId!==PROJECT_ID||record.projectNumber!==projectNumber||record.service!==SERVICE||!['enabling','polling','enabled'].includes(record.phase)||Object.keys(record).some(key=>!['schemaVersion','projectId','projectNumber','service','phase','operation'].includes(key))||(record.phase==='polling'&&!OPERATION.test(record.operation))||(record.operation!==undefined&&!OPERATION.test(record.operation)))fail('INVALID_LOCAL_RECORD');
  return structuredClone(record);
}
function validateOperation(body,expected){
  if(!body||typeof body.name!=='string'||!OPERATION.test(body.name)||(expected&&body.name!==expected)||(body.done!==undefined&&typeof body.done!=='boolean'))fail('INVALID_OPERATION_METADATA');
  if(body.error!==undefined)fail('OPERATION_FAILED');
  return {name:body.name,done:body.done===true};
}

/** One fixed-service enable at most. Resumption only reads its durable operation. */
export async function enableSecretManager({projectId=PROJECT_ID,service=SERVICE,clients,record=null,saveRecord,sleep=wait}={}){
  if(projectId!==PROJECT_ID||service!==SERVICE)fail('INVALID_TARGET');
  const request=async(method,resource,body)=>{
    try{return method==='GET'?await clients.serviceUsage.get(resource,options()):await clients.serviceUsage.post(resource,body,options());}
    catch{fail('REQUEST_OUTCOME_UNKNOWN');}
  };
  let project;try{project=await clients.projects.get('/projects/'+PROJECT_ID,options());}catch{fail('PROJECT_LOOKUP_FAILED');}
  if(project.status!==200)fail('PROJECT_LOOKUP_FAILED',project.status);
  if(project.body?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(String(project.body.projectNumber)))fail('INVALID_REMOTE_PROJECT');
  const projectNumber=String(project.body.projectNumber),resource=`/projects/${projectNumber}/services/${SERVICE}`;
  let state=validateRecord(record,projectNumber);
  const persist=async phase=>{
    const next={schemaVersion:1,projectId:PROJECT_ID,projectNumber,service:SERVICE,...state,...phase};
    try{await saveRecord(structuredClone(next));}catch{fail('LOCAL_RECORD_FAILED');}
    state=next;
  };
  const getState=async()=>{
    const response=await request('GET',resource);
    if(response.status!==200)fail('SERVICE_STATE_FAILED',response.status);
    if(response.body?.name!==resource.slice(1)||!['ENABLED','DISABLED'].includes(response.body.state)||(response.body.config?.name!==undefined&&response.body.config.name!==SERVICE))fail('INVALID_SERVICE_METADATA');
    return response.body.state;
  };
  if(await getState()==='ENABLED'){await persist({phase:'enabled'});return {service:SERVICE,httpStatus:200,state:'ENABLED'};}
  if(state&&state.phase!=='polling')fail('PREVIOUS_OUTCOME_REQUIRES_REVIEW');
  let operation;
  if(!state){
    await persist({phase:'enabling'});
    const response=await request('POST',resource+':enable',{});
    if(response.status!==200)fail('ENABLE_OUTCOME_REQUIRES_REVIEW',response.status);
    operation=validateOperation(response.body);
    await persist({phase:'polling',operation:operation.name});
  }else operation={name:state.operation,done:false};
  // At most five operation GETs per invocation; a later run resumes GETs only.
  for(let attempt=0;!operation.done&&attempt<5;attempt++){
    if(attempt)await sleep(2000);
    const response=await request('GET','/'+operation.name);
    if(response.status!==200)fail('OPERATION_LOOKUP_FAILED',response.status);
    operation=validateOperation(response.body,operation.name);
  }
  if(await getState()==='ENABLED'){await persist({phase:'enabled'});return {service:SERVICE,httpStatus:200,state:'ENABLED'};}
  if(operation.done)fail('ENABLE_NOT_CONFIRMED');
  return {service:SERVICE,httpStatus:200,state:'PENDING'};
}

async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');
  for(const method of ['log','info','warn','error','debug','trace','dir'])console[method]=()=>{};
  process.emitWarning=()=>{};
  let local;
  try{
    const args=process.argv.slice(2);
    if(args.length&&!(args.length===2&&args[0]==='--project'&&args[1]===PROJECT_ID))fail('INVALID_ARGUMENTS');
    local=await openLocalStore(undefined,'secret-manager-enablement');
    const record=await local.readRecord(),clients=await createGoogleClients({includeServiceUsage:true});
    const result=await enableSecretManager({clients,record,saveRecord:value=>local.saveRecord(value)});
    emit(result);if(result.state!=='ENABLED')process.exitCode=2;
  }catch(error){emit(safeEnableFailure(error));process.exitCode=1;}
  finally{try{await local?.close();}catch{emit({service:SERVICE,httpStatus:0,state:'LOCAL_LOCK_REQUIRES_REVIEW'});process.exitCode=1;}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
