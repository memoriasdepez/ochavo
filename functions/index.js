import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {defineSecret,defineString,defineBoolean,expr,projectID} from 'firebase-functions/params';
import {createBillingService,createRevenueCat,shouldRunBillingCleanup} from './billing-service.js';
import {billingError,billingOrigins,assertBillingEnvironment,parseSyncRequest} from './billing-domain.js';

const app=initializeApp();
const apiKey=defineSecret('REVENUECAT_SECRET_API_KEY_V2'),cleanupKey=defineSecret('REVENUECAT_SECRET_API_KEY_CLEANUP_V2'),webhookKey=defineSecret('REVENUECAT_WEBHOOK_SIGNING_SECRET');
const project=defineString('REVENUECAT_PROJECT_ID',{default:''});
// Optional while payments are disabled; provider validation rejects a missing key.
// Use a normal public environment variable so deployment does not prompt for it.
const publicKey=()=>process.env.REVENUECAT_WEB_PUBLIC_KEY||'';
const environment=defineString('BILLING_ENVIRONMENT',{default:'production'});
const enabled=defineBoolean('BILLING_ENABLED',{default:false});
const gemPacks=defineString('BILLING_GEM_PACKS',{default:'[]'});
const settings={region:'europe-west1',maxInstances:2,minInstances:0,timeoutSeconds:60,memory:'256MiB'};
// Dedicated identities also isolate Secret Manager API access, not just mounted env vars.
// Firebase resolves PROJECT_ID at discovery/deployment; emulators need no real IAM accounts.
const identities={
  read:expr`ochavo-billing-read@${projectID}.iam.gserviceaccount.com`,
  webhook:expr`ochavo-billing-webhook@${projectID}.iam.gserviceaccount.com`,
  cleanup:expr`ochavo-billing-cleanup@${projectID}.iam.gserviceaccount.com`,
};
const firebaseProjectId=()=>app.options.projectId||process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
const isEmulator=()=>process.env.FUNCTIONS_EMULATOR==='true';
function service(){
  assertBillingEnvironment({firebaseProjectId:firebaseProjectId(),environment:environment.value(),emulator:isEmulator()});
  return createBillingService({db:getFirestore(),auth:getAuth(),provider:createRevenueCat({secret:apiKey.value(),publicKey:publicKey(),projectId:project.value(),environment:environment.value(),gemPacks:gemPacks.value()}),serverTimestamp:()=>FieldValue.serverTimestamp()});
}
function failure(res,error){return res.status(error.status||503).json({error:{code:error.code||'billing/unavailable',message:error.status?error.message:'No se pudieron confirmar las compras. Reinténtalo.'}});}

export const billing=onRequest({...settings,invoker:'public',serviceAccount:identities.read,secrets:[apiKey]},async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('Vary','Origin');
  const origin=req.get('Origin');
  const origins=billingOrigins({firebaseProjectId:firebaseProjectId(),environment:environment.value(),emulator:isEmulator()});
  if(origin&&!origins.has(origin))return res.status(403).json({error:{code:'billing/origin',message:'Origen no permitido.'}});
  if(origin)res.set('Access-Control-Allow-Origin',origin);
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','POST');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');return res.status(204).end();}
  try{
    if(!enabled.value())throw billingError('billing/not-configured','Las compras todavía no están activadas.',503);
    if(req.method!=='POST')throw billingError('billing/invalid-request','Solicitud no válida.');
    const purchase=parseSyncRequest(req.body);
    const backend=service(),uid=await backend.authenticate(req.get('Authorization'));
    return res.json({...await backend.syncBalances(uid,purchase||undefined),billingEnvironment:environment.value(),serverTimeMs:Date.now()});
  }catch(error){return failure(res,error);}
});

export const revenuecatWebhook=onRequest({...settings,invoker:'public',serviceAccount:identities.webhook,secrets:[apiKey,webhookKey]},async(req,res)=>{
  try{
    if(!enabled.value())throw billingError('billing/not-configured','Las compras todavía no están activadas.',503);
    if(req.method!=='POST')throw billingError('billing/invalid-request','Solicitud no válida.');
    return res.json(await service().webhook({raw:req.rawBody,signature:req.get('X-RevenueCat-Webhook-Signature'),secret:webhookKey.value()}));
  }catch(error){return failure(res,error);}
});

// Irreversible marker already denies client reads/writes. This is restartable server cleanup.
export const billingAccountDeleted=onDocumentWritten({...settings,serviceAccount:identities.cleanup,secrets:[cleanupKey],document:'accountDeletions/{uid}',retry:true},async event=>{
  if(!shouldRunBillingCleanup(event.data?.before.data(),event.data?.after.data()))return;
  // Turning off new purchases must not turn off pending account deletion.
  const provider=createRevenueCat({cleanupSecret:cleanupKey.value(),projectId:project.value()});
  const backend=createBillingService({db:getFirestore(),provider,serverTimestamp:()=>FieldValue.serverTimestamp()});
  await backend.cleanup(event.params.uid);
});
