import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

export const PROJECT='brote-62d26';
export function adminCandidate(result,email){
  const users=result?.users;
  if(!Array.isArray(users)||users.length!==1)throw Error('Ese correo no tiene una cuenta única en Ochavo. Regístrate primero.');
  const user=users[0];
  if(typeof user.email!=='string'||user.email.toLowerCase()!==email.toLowerCase()||!user.emailVerified||user.disabled
    ||typeof user.localId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(user.localId))throw Error('La cuenta debe estar activa y tener el correo confirmado.');
  return user.localId;
}
export function parseArgs(args){
  const apply=args.includes('--apply'),clean=args.filter(x=>x!=='--apply');
  if(clean.length!==2||clean[0]!=='--email'||!/^\S+@\S+\.\S+$/.test(clean[1])||args.filter(x=>x==='--apply').length>1)
    throw Error('Uso: node scripts/provision-promo-admin.mjs --email CORREO [--apply]. Sin --apply solo comprueba.');
  return {email:clean[1].trim(),apply};
}
async function main(){
  const {email,apply}=parseArgs(process.argv.slice(2));
  const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
  const account=auth.getProjectDefaultAccount(root)||auth.getGlobalDefaultAccount();
  if(!account?.tokens?.refresh_token)throw Error('Falta iniciar sesión en Firebase CLI con acceso a este proyecto.');
  const access=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const headers={Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'};
  async function request(url,options={}){
    const response=await fetch(url,{...options,headers,signal:AbortSignal.timeout(30000)});
    if(response.status===404)return null;
    // Do not print responses or credentials: account lookups contain personal data.
    if(!response.ok)throw Error('La comprobación administrativa falló (HTTP '+response.status+'). No se ha confirmado ningún cambio.');
    return response.json();
  }
  const result=await request(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,{method:'POST',body:JSON.stringify({email:[email]})});
  const uid=adminCandidate(result,email),prefix=`projects/${PROJECT}/databases/(default)/documents`,base='https://firestore.googleapis.com/v1/';
  const deleted=await request(base+prefix+'/accountDeletions/'+uid);
  if(deleted)throw Error('La cuenta tiene una eliminación pendiente. No se conceden permisos.');
  const name=prefix+'/promoAdmins/'+uid,existing=await request(base+name);
  if(existing){
    if(existing.fields?.enabled?.booleanValue!==true||existing.fields?.schemaVersion?.integerValue!=='1')throw Error('El permiso existente requiere revisión; no se sobrescribe.');
    console.log(JSON.stringify({project:PROJECT,adminAlreadyEnabled:true,changed:false}));return;
  }
  if(!apply){console.log(JSON.stringify({project:PROJECT,verifiedAccountFound:true,readyToEnable:true,changed:false}));return;}
  await request(base+prefix+':commit',{method:'POST',body:JSON.stringify({writes:[{update:{name,fields:{schemaVersion:{integerValue:'1'},enabled:{booleanValue:true}}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}}]})});
  const confirmed=await request(base+name);
  if(confirmed?.fields?.enabled?.booleanValue!==true)throw Error('No se pudo confirmar el permiso. Repite la comprobación.');
  console.log(JSON.stringify({project:PROJECT,adminEnabled:true,changed:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
