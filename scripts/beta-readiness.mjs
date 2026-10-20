import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {TRACKS} from '../src/tracks.js';
import {createGoogleClients} from '../work/payments/store-server-secrets.mjs';

// Read-only audit. No users, documents, credentials or payment data are exported.
const root=new URL('../',import.meta.url),out=new URL('../../../outputs/ochavo-beta-controlada/',import.meta.url);
if(process.argv.slice(2).some(arg=>arg!=='--cloud'))throw Error('Solo se admite --cloud (lectura de metadatos).');
const measure=buffer=>({bytes:buffer.length,gzipBytes:gzipSync(buffer).length});
const html=await readFile(new URL('dist/index.html',root));
const blocks=Object.fromEntries([...html.toString().matchAll(/<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)].filter(([,id])=>id.startsWith('br-')).map(([,id,data])=>[id,data]));
const course=JSON.parse(blocks['br-course']);
const firstWorlds=TRACKS.map(track=>({track:track.id,worlds:track.groupIds.slice(0,2).map(id=>course.worldFiles.find(f=>f.id===id))}));
const report={checkedAt:new Date().toISOString(),version:JSON.parse(await readFile(new URL('package.json',root),'utf8')).version,productionChanged:false,
  static:{entry:measure(html),embedded:Object.fromEntries(Object.entries(blocks).map(([id,body])=>[id,measure(Buffer.from(body))])),initialWorlds:[]},cloud:{checked:false}};
for(const track of firstWorlds){
  const sizes=await Promise.all(track.worlds.map(async f=>({world:f.id,url:f.url,...measure(await readFile(new URL('dist'+f.url,root)))})));
  report.static.initialWorlds.push({track:track.track,files:sizes,totalBytes:sizes.reduce((n,f)=>n+f.bytes,0),totalGzipBytes:sizes.reduce((n,f)=>n+f.gzipBytes,0)});
}
const assetUrls=[...new Set([...html.toString().matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match=>match[1]))];
report.static.entryAssets=await Promise.all(assetUrls.map(async url=>({url,...measure(await readFile(new URL('dist'+url,root)))})));
report.static.note='Compressed sizes are measured locally; browser transfer depends on CDN encoding/cache. Historical files remain available for existing clients.';
if(process.argv.includes('--cloud')){
  await createGoogleClients();
  const require=createRequire(import.meta.url),{Client}=require('firebase-tools/lib/apiv2');
  const fs=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'}),monitor=new Client({urlPrefix:'https://monitoring.googleapis.com',apiVersion:'v3'});
  const request=async(client,path)=>{
    try{const r=await client.get(path,{skipLog:{body:true,resBody:true,queryParams:true},redirect:'error',retries:0,resolveOnHTTPError:true,responseType:'json',timeout:20000});return {status:r.status,body:r.status===200?r.body:null};}
    catch{return {status:0,body:null};}
  };
  const project='projects/brote-62d26',database=project+'/databases/(default)';
  const db=await request(fs,database),location=db.body?.locationId;
  report.cloud={checked:true,database:{status:db.status,location:location||null,type:db.body?.type||null,pitr:db.body?.pointInTimeRecoveryEnablement||null,deleteProtection:db.body?.deleteProtectionState||null}};
  const schedules=await request(fs,database+'/backupSchedules');
  report.cloud.backups={scheduleStatus:schedules.status,scheduleCount:schedules.body?.backupSchedules?.length??(schedules.status===200?0:null),schedules:(schedules.body?.backupSchedules||[]).map(s=>({retention:s.retention,daily:!!s.dailyRecurrence,weekly:!!s.weeklyRecurrence}))};
  if(location){const backups=await request(fs,project+'/locations/'+location+'/backups');report.cloud.backups.listStatus=backups.status;report.cloud.backups.available=(backups.body?.backups||[]).length;report.cloud.backups.latestSnapshot=(backups.body?.backups||[]).map(b=>b.snapshotTime).filter(Boolean).sort().at(-1)||null;}
  const [alerts,uptime]=await Promise.all([request(monitor,project+'/alertPolicies?pageSize=100'),request(monitor,project+'/uptimeCheckConfigs?pageSize=100')]);
  report.cloud.monitoring={alertStatus:alerts.status,alertCount:alerts.body?.alertPolicies?.length??(alerts.status===200?0:null),uptimeStatus:uptime.status,uptimeCount:uptime.body?.uptimeCheckConfigs?.length??(uptime.status===200?0:null)};
  const ownCheck=(uptime.body?.uptimeCheckConfigs||[]).find(c=>c.displayName==='Ochavo · web HTTPS cada 5 minutos');
  if(ownCheck){
    const params=new URLSearchParams({filter:`metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="${ownCheck.name.split('/').at(-1)}"`,'interval.startTime':new Date(Date.now()-1800000).toISOString(),'interval.endTime':new Date().toISOString(),pageSize:'100'});
    const checks=await request(monitor,project+'/timeSeries?'+params),points=(checks.body?.timeSeries||[]).flatMap(s=>s.points||[]);
    report.cloud.monitoring.probesLast30Minutes={status:checks.status,passed:points.filter(p=>p.value?.boolValue===true).length,failed:points.filter(p=>p.value?.boolValue===false).length,latest:points.map(p=>p.interval?.endTime).filter(Boolean).sort().at(-1)||null};
  }
  const rules=new Client({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1'}),release=await request(rules,project+'/releases/cloud.firestore');
  if(release.body?.rulesetName){
    const set=await request(rules,release.body.rulesetName),source=set.body?.source?.files?.find(f=>f.name==='firestore.rules')?.content;
    const local=await readFile(new URL('firestore.rules',root),'utf8'),hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
    report.cloud.rules={status:set.status,sourceMatches:typeof source==='string'?hash(source)===hash(local):null};
  }else report.cloud.rules={status:release.status,sourceMatches:null};
  const end=new Date().toISOString(),start=new Date(Date.now()-86400000).toISOString();
  report.cloud.operationsLast24Hours={start,end,metrics:[]};
  for(const kind of ['read','write','delete']){
    const params=new URLSearchParams({filter:`metric.type="firestore.googleapis.com/document/${kind}_count"`,'interval.startTime':start,'interval.endTime':end,'aggregation.alignmentPeriod':'86400s','aggregation.perSeriesAligner':'ALIGN_SUM','aggregation.crossSeriesReducer':'REDUCE_SUM',pageSize:'100'});
    const metric=await request(monitor,project+'/timeSeries?'+params),series=metric.body?.timeSeries||[];
    report.cloud.operationsLast24Hours.metrics.push({kind,status:metric.status,sum:metric.status===200?series.flatMap(s=>s.points||[]).reduce((n,p)=>n+Number(p.value?.int64Value||p.value?.doubleValue||0),0):null});
  }
}
await mkdir(out,{recursive:true});await writeFile(new URL('preparacion-trafico.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
