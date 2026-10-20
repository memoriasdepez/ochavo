import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {PASSWORD_POLICY} from '../src/password-policy.js';

export const PROJECT='brote-62d26';
export const CONFIG_URL=`https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config`;
export const UPDATE_MASK='passwordPolicyConfig';

// REST field names follow the Identity Toolkit v2 Discovery document, not the
// differently named Firebase Admin SDK configuration interface.
// https://identitytoolkit.googleapis.com/$discovery/rest?version=v2
export function desiredPasswordPolicy(){
  return {
    passwordPolicyEnforcementState:'ENFORCE',
    passwordPolicyVersions:[{customStrengthOptions:{
      minPasswordLength:PASSWORD_POLICY.minLength,
      maxPasswordLength:PASSWORD_POLICY.maxLength,
      containsLowercaseCharacter:PASSWORD_POLICY.requireLowercase,
      containsUppercaseCharacter:PASSWORD_POLICY.requireUppercase,
      containsNumericCharacter:PASSWORD_POLICY.requireNumeric,
      containsNonAlphanumericCharacter:PASSWORD_POLICY.requireNonAlphanumeric
    }}],
    // New and changed passwords must comply, without locking existing users out.
    forceUpgradeOnSignin:false
  };
}

export function normalizePasswordPolicy(policy){
  const versions=policy?.passwordPolicyVersions;
  if(versions!==undefined&&(!Array.isArray(versions)||versions.length!==1))throw Error('La versión de la política no se reconoce; no se modifica.');
  const options=versions?.[0]?.customStrengthOptions||policy?.customStrengthOptions||{};
  return {
    enforcementState:policy?.passwordPolicyEnforcementState||policy?.enforcementState||'OFF',
    forceUpgradeOnSignin:policy?.forceUpgradeOnSignin===true,
    minLength:options.minPasswordLength??6,
    maxLength:options.maxPasswordLength??4096,
    requireLowercase:options.containsLowercaseCharacter===true,
    requireUppercase:options.containsUppercaseCharacter===true,
    requireNumeric:options.containsNumericCharacter===true,
    requireNonAlphanumeric:options.containsNonAlphanumericCharacter===true
  };
}

export function parseArgs(args){
  if(args.length===0)return {apply:false};
  if(args.length===1&&args[0]==='--apply')return {apply:true};
  throw Error('Uso: node scripts/configure-password-policy.mjs [--apply]. Sin --apply solo comprueba.');
}

function verifyConfig(config){
  if(!config||!['FIREBASE_AUTH','IDENTITY_PLATFORM'].includes(config.subtype))throw Error('No se pudo comprobar el tipo de proyecto; no se modifica.');
  if(config.signIn?.email?.enabled!==true)throw Error('El inicio de sesión por correo no está habilitado; no se modifica.');
}

export function unrelatedConfigUnchanged(before,after){
  const omitPolicy=({passwordPolicyConfig,...rest})=>rest;
  return isDeepStrictEqual(omitPolicy(before),omitPolicy(after));
}

// Injectable request and backup functions make it possible to verify the exact
// mutation boundary without network access or production credentials.
export async function configurePasswordPolicy({apply=false,request,saveBackup}={}){
  if(typeof request!=='function')throw Error('Falta el cliente administrativo.');
  const before=await request(CONFIG_URL);
  verifyConfig(before);
  const currentPolicy=normalizePasswordPolicy(before.passwordPolicyConfig);
  const targetPolicy=normalizePasswordPolicy(desiredPasswordPolicy());
  const matches=isDeepStrictEqual(currentPolicy,targetPolicy);
  const report={project:PROJECT,projectType:before.subtype,currentPolicy,targetPolicy,changed:false,policyVerified:matches};
  if(!apply)return {...report,readyToApply:!matches};
  if(matches)return {...report,unrelatedConfigurationUnchanged:true};
  if(typeof saveBackup!=='function')throw Error('Falta la copia local de la política anterior; no se modifica.');

  // Only this non-secret policy is persisted, never the config (which can contain
  // SMTP credentials, hash parameters, or API keys). No user data is requested.
  await saveBackup({project:PROJECT,createdAt:new Date().toISOString(),passwordPolicyConfig:before.passwordPolicyConfig?{
    passwordPolicyEnforcementState:currentPolicy.enforcementState,
    passwordPolicyVersions:[{customStrengthOptions:{
      minPasswordLength:currentPolicy.minLength,maxPasswordLength:currentPolicy.maxLength,
      containsLowercaseCharacter:currentPolicy.requireLowercase,containsUppercaseCharacter:currentPolicy.requireUppercase,
      containsNumericCharacter:currentPolicy.requireNumeric,containsNonAlphanumericCharacter:currentPolicy.requireNonAlphanumeric
    }}],forceUpgradeOnSignin:currentPolicy.forceUpgradeOnSignin
  }:null});
  await request(`${CONFIG_URL}?updateMask=${UPDATE_MASK}`,{method:'PATCH',body:JSON.stringify({passwordPolicyConfig:desiredPasswordPolicy()})});
  const after=await request(CONFIG_URL);
  if(!unrelatedConfigUnchanged(before,after))throw Error('La comprobación detectó cambios ajenos a la política. Revisa la configuración; no se realizan más modificaciones.');
  if(!isDeepStrictEqual(normalizePasswordPolicy(after.passwordPolicyConfig),targetPolicy))throw Error('No se pudo confirmar la política solicitada. Revisa la configuración antes de continuar.');
  return {...report,currentPolicy:targetPolicy,changed:true,policyVerified:true,unrelatedConfigurationUnchanged:true};
}

async function main(){
  const {apply}=parseArgs(process.argv.slice(2));
  const root=fileURLToPath(new URL('../',import.meta.url));
  const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
  const account=auth.getProjectDefaultAccount(root)||auth.getGlobalDefaultAccount();
  if(!account?.tokens?.refresh_token)throw Error('Falta iniciar sesión en Firebase CLI con acceso al proyecto.');
  let access;
  try{access=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);}
  catch{throw Error('No se pudo renovar el acceso administrativo de Firebase.');}
  const headers={Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'};
  const request=async(url,options={})=>{
    let response;
    try{response=await fetch(url,{...options,headers,signal:AbortSignal.timeout(30000)});}
    catch{throw Error('No se pudo conectar con la configuración de Firebase. No se ha confirmado ningún cambio.');}
    // Never print an API response or original exception: it can contain secrets.
    if(!response.ok)throw Error(`La operación administrativa falló (HTTP ${response.status}). No se ha confirmado ningún cambio.`);
    try{return await response.json();}catch{throw Error('La respuesta administrativa no se pudo comprobar.');}
  };
  let backupPath;
  const saveBackup=async(policy)=>{
    const directory=path.resolve(root,'../viruta-password-policy');
    backupPath=path.join(directory,'policy-before-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
    await mkdir(directory,{recursive:true});
    await writeFile(backupPath,JSON.stringify(policy,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  };
  const report=await configurePasswordPolicy({apply,request,saveBackup});
  console.log(JSON.stringify({...report,...(backupPath?{backupPath}:{})},null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
