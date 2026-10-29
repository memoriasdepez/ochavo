import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,createGoogleClients} from './store-server-secrets.mjs';

const NUMBER='226760894540',METHOD='google.cloud.run.v2.Services.UpdateService';
const START='2026-10-07T15:35:00Z',END='2026-10-07T15:39:00Z';
const RESOURCES=[`projects/${PROJECT_ID}/locations/europe-west1/services/billing`,`projects/${NUMBER}/locations/europe-west1/services/billing`,`namespaces/${PROJECT_ID}/services/billing`];
const FILTER=[`logName="projects/${PROJECT_ID}/logs/cloudaudit.googleapis.com%2Factivity"`,`protoPayload.serviceName="run.googleapis.com"`,`protoPayload.methodName="${METHOD}"`,'protoPayload.status.code!=0',`timestamp>="${START}"`,`timestamp<="${END}"`,`(${RESOURCES.map(value=>`protoPayload.resourceName="${value}"`).join(' OR ')})`].join(' AND ');
// protoPayload is protobuf Any: request it as one field, then project selected
// status/identity fields in memory. Never emit or persist its request/response.
const FIELDS='entries(timestamp,protoPayload),nextPageToken';
const options=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,retryCodes:[],resolveOnHTTPError:true,responseType:'json',timeout:20000});
class DiagnosticError extends Error{constructor(code,status=0,readMessage){super(code);this.code=code;this.httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:0;this.readMessage=typeof readMessage==='string'?sanitizeConflictMessage(readMessage):'';}}
const fail=(code,status,readMessage)=>{throw new DiagnosticError(code,status,readMessage);};
export const safeConflictFailure=error=>({state:error instanceof DiagnosticError?error.code:'DIAGNOSTIC_FAILED',httpStatus:error instanceof DiagnosticError?error.httpStatus:0,...(error instanceof DiagnosticError&&error.readMessage?{message:error.readMessage}:{})});
export function sanitizeConflictMessage(value){
  if(typeof value!=='string')return '';
  return value.slice(0,2048).replace(/[\x00-\x1f\x7f]/g,' ').replace(/https?:\/\/[^\s"'<>]+/gi,'[url]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/(?:projects|namespaces)\/[^\s"'<>]+/g,'[resource]').replace(/(?:Bearer\s+\S+|(?:sk_|whsec_|AIza)[A-Za-z0-9_./+=:-]+)/gi,'[credential]').replace(/[A-Za-z0-9_+/=-]{24,}/g,'[identifier]').replace(/"[^"\r\n]*"|'[^'\r\n]*'/g,'[quoted]').slice(0,500);
}
export async function diagnoseBillingCapConflict({projectId=PROJECT_ID,clients,logging}={}){
  if(projectId!==PROJECT_ID)fail('INVALID_TARGET');
  const project=await clients.projects.get(`/projects/${PROJECT_ID}`,options());
  if(project.status!==200)fail('PROJECT_READ_FAILED',project.status,project.body?.error?.message);
  if(project.body?.projectId!==PROJECT_ID||String(project.body.projectNumber)!==NUMBER||project.body.lifecycleState!=='ACTIVE')fail('INVALID_REMOTE_PROJECT');
  const matches=[];let token,discarded=0;
  for(let page=0;page<2;page++){
    const response=await logging.post('/entries:list',{resourceNames:[`projects/${PROJECT_ID}`],filter:FILTER,orderBy:'timestamp desc',pageSize:20,...(token?{pageToken:token}:{})},{...options(),queryParams:{fields:FIELDS}});
    if(response.status!==200)fail('AUDIT_READ_FAILED',response.status,response.body?.error?.message);
    if(response.body?.entries!==undefined&&!Array.isArray(response.body.entries))fail('INVALID_AUDIT_RESPONSE');
    for(const entry of response.body.entries||[]){
      const data=entry?.protoPayload,timestamp=Date.parse(entry?.timestamp),code=data?.status?.code;
      if(data?.serviceName!=='run.googleapis.com'||data.methodName!==METHOD||!RESOURCES.includes(data.resourceName)||!Number.isFinite(timestamp)||timestamp<Date.parse(START)||timestamp>Date.parse(END)||!Number.isInteger(code)||code<1||code>16){discarded++;continue;}
      matches.push({timestamp:new Date(timestamp).toISOString(),statusCode:code,message:sanitizeConflictMessage(data.status.message)});
    }
    token=response.body?.nextPageToken;
    if(!token)break;
    if(typeof token!=='string'||token.length>8192)fail('INVALID_AUDIT_RESPONSE');
  }
  return {state:matches.length?'FAILED_UPDATE_FOUND':'NO_MATCH_IN_FIXED_WINDOW',function:'billing',window:{start:START,end:END},complete:!token,discarded,entries:matches};
}
async function main(){
  const stdout=process.stdout.write.bind(process.stdout),emit=value=>stdout(JSON.stringify(value)+'\n');
  for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};process.emitWarning=()=>{};
  try{
    if(process.argv.length!==2)fail('INVALID_ARGUMENTS');
    const clients=await createGoogleClients(),require=createRequire(import.meta.url),{Client}=require('firebase-tools/lib/apiv2');
    const logging=new Client({urlPrefix:'https://logging.googleapis.com',apiVersion:'v2'});
    emit(await diagnoseBillingCapConflict({clients,logging}));
  }catch(error){emit(safeConflictFailure(error));process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
