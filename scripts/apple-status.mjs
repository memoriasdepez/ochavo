import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import verifiedIdentifiers from './apple-api-key-identifiers.json' with {type:'json'};

const names=['APP_STORE_CONNECT_KEY_ID','APP_STORE_CONNECT_ISSUER_ID','APP_STORE_CONNECT_PRIVATE_KEY'];
const origin='https://api.appstoreconnect.apple.com';
const bundleId='app.brote.inversion';

export function appleCredentialStatus(env=process.env){
  const missing=names.filter(name=>!env[name]?.trim());
  return {configured:missing.length===0,missing};
}

export function appleKeyIdentifier(key,configuredIdentifier,known=verifiedIdentifiers){
  const fingerprint=createHash('sha256').update(createPublicKey(key).export({format:'der',type:'spki'})).digest('hex');
  const matches=known.filter(item=>item.publicKeySha256===fingerprint);
  if(matches.length>1)throw Error('Hay identificadores verificados duplicados para la clave de Apple.');
  // Select a previously authenticated identifier only for that exact public key.
  // A rotated or unknown key continues to use the environment's identifier.
  return matches[0]?.keyId||configuredIdentifier;
}

export function appleToken(env=process.env,now=Date.now()){
  const status=appleCredentialStatus(env);
  if(!status.configured)throw Error('Faltan variables seguras: '+status.missing.join(', '));
  const issuer=env.APP_STORE_CONNECT_ISSUER_ID.trim();
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(issuer))throw Error('Revisa el identificador del emisor de Apple.');
  let key;
  try{
    const raw=env.APP_STORE_CONNECT_PRIVATE_KEY.trim().replace(/\\n/g,'\n');
    if(raw.startsWith('-----BEGIN '))key=createPrivateKey(raw);
    else{
      // The secure form may contain only the base64 PKCS#8 body of the P8.
      // Parse the original bytes directly; never persist or print key material.
      if(!/^[A-Za-z0-9+/=\s]+$/.test(raw))throw Error();
      key=createPrivateKey({key:Buffer.from(raw.replace(/\s/g,''),'base64'),format:'der',type:'pkcs8'});
    }
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error();
  }catch{
    throw Error('La variable privada debe contener la clave P8 de Apple en formato PEM o su cuerpo base64 PKCS#8. Un marcador de secreto del proxy no permite firmar localmente.');
  }
  const keyId=appleKeyIdentifier(key,env.APP_STORE_CONNECT_KEY_ID.trim());
  if(!/^[A-Z0-9]{10}$/.test(keyId))throw Error('Revisa el identificador de clave de Apple.');
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat=Math.floor(now/1000);
  const unsigned=encode({alg:'ES256',kid:keyId,typ:'JWT'})+'.'+encode({iss:issuer,iat,exp:iat+600,aud:'appstoreconnect-v1'});
  return unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
}

export async function readAppleStatus({env=process.env,fetchImpl=fetch,now=Date.now()}={}){
  const token=appleToken(env,now),limitations=[];
  async function get(path,params={}){
    const url=new URL('/v1/'+path,origin);
    for(const [name,value] of Object.entries(params))url.searchParams.set(name,String(value));
    let response;
    try{
      response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
    }catch{
      throw Error('No se pudo conectar con la API de Apple. Revisa los dominios permitidos y el proxy del entorno.');
    }
    if(!response.ok)throw Error('Apple respondió HTTP '+response.status+(response.status===401?': revisa la clave, su emisor y su vigencia.':response.status===403?': faltan permisos de Apple o acceso de red.':'.'));
    try{return await response.json();}catch{throw Error('Apple no devolvió una respuesta JSON válida.');}
  }
  async function optional(label,path,params){
    try{return await get(path,params);}catch(error){limitations.push(label+': '+error.message);return {data:[]};}
  }
  const apps=await get('apps',{'filter[bundleId]':bundleId,limit:2});
  const matches=apps.data?.filter(app=>app.attributes?.bundleId===bundleId)||[];
  if(matches.length!==1||!/^\d+$/.test(matches[0].id))throw Error('La clave no permite identificar de forma única Ochavo ('+bundleId+').');
  const app=matches[0];
  const versions=await get('apps/'+app.id+'/appStoreVersions',{limit:20});
  const builds=await optional('Compilaciones','builds',{'filter[app]':app.id,sort:'-uploadedDate',limit:10,include:'preReleaseVersion'});
  const groups=await optional('Grupos de TestFlight','apps/'+app.id+'/betaGroups',{limit:20});
  const prereleases=new Map((builds.included||[]).map(item=>[item.id,item.attributes]));
  return {
    checkedAt:new Date(now).toISOString(),
    app:{id:app.id,name:app.attributes.name,bundleId},
    appStoreVersions:(versions.data||[]).map(({id,attributes:a})=>({id,version:a.versionString,platform:a.platform,state:a.appStoreState??a.appVersionState,releaseType:a.releaseType})),
    latestBuilds:(builds.data||[]).map(({id,attributes:a,relationships:r})=>({id,version:prereleases.get(r?.preReleaseVersion?.data?.id)?.version,build:a.version,uploadedAt:a.uploadedDate,processingState:a.processingState,expired:a.expired,expiresAt:a.expirationDate})),
    testFlightGroups:(groups.data||[]).map(({id,attributes:a})=>({id,name:a.name,internal:a.isInternalGroup,publicLinkEnabled:a.publicLinkEnabled})),
    limits:{versions:20,builds:10,groups:20},
    limitations:[...limitations,'Contratos, declaración de comerciante y otros avisos de la cuenta requieren revisar App Store Connect en el navegador.','Una compilación procesada y un grupo existente no acreditan por sí solos que esa compilación esté asignada a los probadores.'],
  };
}

async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')){
    console.log('Consulta de Apple de solo lectura.\nUso: node --use-env-proxy scripts/apple-status.mjs [--check]\nConfigura KEY_ID, ISSUER_ID y PRIVATE_KEY con prefijo APP_STORE_CONNECT_ en los ajustes seguros del entorno. No pegues claves en el chat ni en archivos del repositorio.\nGuía: APPLE-ACCESO.md');
    return;
  }
  if(args.some(arg=>arg!=='--check'))throw Error('Argumento no reconocido. Usa --help.');
  if(args.includes('--check')){
    const status=appleCredentialStatus();
    if(status.configured)appleToken();
    console.log(JSON.stringify(status,null,2));
    if(!status.configured)process.exitCode=2;
    return;
  }
  console.log(JSON.stringify(await readAppleStatus(),null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
