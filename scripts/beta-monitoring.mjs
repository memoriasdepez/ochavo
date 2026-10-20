import {writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createGoogleClients} from '../work/payments/store-server-secrets.mjs';

// Only public HTTPS availability. No user sessions, new IAM or email recipients.
if(process.argv.slice(2).join(' ')!=='--configure')throw Error('Use --configure para el monitor público fijo.');
await createGoogleClients();
const require=createRequire(import.meta.url),{Client}=require('firebase-tools/lib/apiv2');
const client=new Client({urlPrefix:'https://monitoring.googleapis.com',apiVersion:'v3'});
const project='/projects/brote-62d26',out=new URL('../../../outputs/ochavo-beta-controlada/',import.meta.url);
const options=()=>({skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,resolveOnHTTPError:true,responseType:'json',timeout:20000});
async function list(kind,key){const r=await client.get(project+'/'+kind,options());if(r.status!==200)throw Error('No se pudo listar '+kind+': '+r.status);if(r.body?.nextPageToken)throw Error('Lista paginada: revisar antes de crear.');return r.body?.[key]||[];}
async function ensure(kind,key,displayName,body,validate){
  let item=(await list(kind,key)).find(x=>x.displayName===displayName);
  if(!item){
    try{await client.post(project+'/'+kind,{displayName,...body},options());}catch{/* Unknown outcome: list once, never repeat POST. */}
    item=(await list(kind,key)).find(x=>x.displayName===displayName);
  }
  if(!item||!validate(item))throw Error('No se confirmó la configuración de '+displayName);
  return item;
}
const uptime=await ensure('uptimeCheckConfigs','uptimeCheckConfigs','Ochavo · web HTTPS cada 5 minutos',{
  monitoredResource:{type:'uptime_url',labels:{project_id:'brote-62d26',host:'ochavo.app'}},
  httpCheck:{useSsl:true,validateSsl:true,path:'/',port:443,requestMethod:'GET',acceptedResponseStatusCodes:[{statusValue:200}]},
  period:'300s',timeout:'10s',selectedRegions:['EUROPE','USA_OREGON','SOUTH_AMERICA'],checkerType:'STATIC_IP_CHECKERS',
  contentMatchers:[{content:'br-course',matcher:'CONTAINS_STRING'}],logCheckFailures:false
},s=>s.monitoredResource?.labels?.host==='ochavo.app'&&s.period==='300s'&&!s.disabled&&s.httpCheck?.validateSsl===true);
const checkId=uptime.name.split('/').at(-1);
const policy=await ensure('alertPolicies','alertPolicies','Ochavo · caída web sostenida',{
  combiner:'OR',enabled:true,notificationChannels:[],
  documentation:{mimeType:'text/markdown',content:'Dos ubicaciones detectan fallo HTTPS/contenido durante al menos diez minutos. Revisar Firebase Hosting y la página pública; no borrar progreso. Panel: https://console.cloud.google.com/monitoring/uptime?project=brote-62d26 . Esta política todavía no envía correo.'},
  conditions:[{displayName:'Fallos en al menos dos ubicaciones durante 10 min',conditionThreshold:{
    filter:`metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url" AND metric.label.check_id="${checkId}"`,
    comparison:'COMPARISON_GT',thresholdValue:1,duration:'600s',trigger:{count:1},
    aggregations:[{alignmentPeriod:'300s',perSeriesAligner:'ALIGN_NEXT_OLDER',crossSeriesReducer:'REDUCE_COUNT_FALSE',groupByFields:['resource.label.host']}]
  }}],alertStrategy:{autoClose:'1800s'}
},p=>p.enabled===true&&p.conditions?.[0]?.conditionThreshold?.filter?.includes(checkId));
const proof={verifiedAt:new Date().toISOString(),project:'brote-62d26',check:uptime.name,policy:policy.name,period:uptime.period,regions:uptime.selectedRegions,estimatedExecutions31Days:26784,notificationChannels:policy.notificationChannels||[],emailEnabled:false,firstProbeVerified:false,scope:'Public HTTPS, status and course metadata marker; does not verify Auth, Firestore or purchases',pricingSource:'https://cloud.google.com/products/observability/pricing',freeExecutionsPerProjectMonth:1000000};
await mkdir(out,{recursive:true});await writeFile(new URL('monitorizacion-activada.json',out),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
