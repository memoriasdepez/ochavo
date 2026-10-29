import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,SECRET_NAMES,createGoogleClients} from './store-server-secrets.mjs';

const STATUSES=new Set(['OK','CANCELLED','UNKNOWN','INVALID_ARGUMENT','DEADLINE_EXCEEDED','NOT_FOUND','ALREADY_EXISTS','PERMISSION_DENIED','RESOURCE_EXHAUSTED','FAILED_PRECONDITION','ABORTED','OUT_OF_RANGE','UNIMPLEMENTED','INTERNAL','UNAVAILABLE','DATA_LOSS','UNAUTHENTICATED']);
const REASONS=new Set(['SERVICE_DISABLED','IAM_PERMISSION_DENIED','ACCESS_TOKEN_SCOPE_INSUFFICIENT','BILLING_DISABLED','CONSUMER_INVALID','USER_PROJECT_DENIED','SECURITY_POLICY_VIOLATED','SERVICE_NOT_ACTIVATED','PROJECT_DELETED','ORG_RESTRICTION_VIOLATION','CREDENTIALS_MISSING','ACCESS_TOKEN_EXPIRED','ACCESS_TOKEN_TYPE_UNSUPPORTED','ACCOUNT_STATE_INVALID','RESOURCE_PROJECT_INVALID','RESOURCE_QUOTA_EXCEEDED','RATE_LIMIT_EXCEEDED']);
const SERVICE='secretmanager.googleapis.com';
const EMPTY=Object.freeze({httpStatus:0,error:{code:null,status:'UNKNOWN'},reason:null,service:null});
const options=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});

// Closed enums prevent arbitrary provider messages, resource names or tokens reaching stdout.
export function safeDiagnostic(response){
  const httpStatus=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:0;
  const error=response?.body?.error;
  const code=Number.isInteger(error?.code)&&error.code>=100&&error.code<=599?error.code:null;
  const status=STATUSES.has(error?.status)?error.status:httpStatus>=200&&httpStatus<300?'OK':'UNKNOWN';
  const info=Array.isArray(error?.details)?error.details.find(item=>item?.['@type']==='type.googleapis.com/google.rpc.ErrorInfo'&&item.domain==='googleapis.com'&&REASONS.has(item.reason)):null;
  return {httpStatus,error:{code,status},reason:info?.reason??null,service:info?.metadata?.service===SERVICE?SERVICE:null};
}

/** Only two metadata GETs. Never reads local secret files or any secret version/payload. */
export async function diagnoseSecretManager({projectId=PROJECT_ID,clients}={}){
  if(projectId!==PROJECT_ID)return structuredClone(EMPTY);
  try{
    const project=await clients.projects.get('/projects/'+PROJECT_ID,options());
    if(project.status!==200)return safeDiagnostic(project);
    if(project.body?.projectId!==PROJECT_ID||!/^[1-9][0-9]{0,19}$/.test(String(project.body.projectNumber)))return structuredClone(EMPTY);
    return safeDiagnostic(await clients.secrets.get(`/projects/${PROJECT_ID}/secrets/${SECRET_NAMES[0]}`,options()));
  }catch{return structuredClone(EMPTY);}
}

async function main(){
  const stdout=process.stdout.write.bind(process.stdout);
  for(const method of ['log','info','warn','error','debug','trace','dir'])console[method]=()=>{};
  process.emitWarning=()=>{};
  let result=structuredClone(EMPTY);
  try{
    const args=process.argv.slice(2);
    if(args.length&&!(args.length===2&&args[0]==='--project'&&args[1]===PROJECT_ID))throw Error();
    result=await diagnoseSecretManager({clients:await createGoogleClients()});
  }catch{process.exitCode=1;}
  stdout(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
