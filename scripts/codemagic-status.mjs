import {pathToFileURL} from 'node:url';

export async function readCodemagicStatus({token=process.env.CODEMAGIC_API_TOKEN,appId,fetchImpl=fetch}={}){
  if(!token?.trim())throw Error('Falta CODEMAGIC_API_TOKEN. Introducirlo en los secretos de red del entorno, no en el chat.');
  if(appId!==undefined&&!/^[a-f0-9]{24}$/i.test(appId))throw Error('Identificador de proyecto Codemagic no válido.');
  let response;
  try{
    response=await fetchImpl('https://api.codemagic.io/apps'+(appId?'/'+appId:''),{
      method:'GET',redirect:'error',headers:{'x-auth-token':token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
    });
  }catch{throw Error('No se pudo conectar con Codemagic. Revisar el dominio permitido y el proxy del entorno.');}
  if(!response.ok)throw Error('Codemagic respondió HTTP '+response.status+'. Revisar la conexión y los permisos de la cuenta.');
  let body;
  try{body=await response.json();}catch{throw Error('Codemagic no devolvió JSON válido.');}
  const apps=appId?[body.application]:body.applications;
  if(!Array.isArray(apps)||apps.some(app=>!app||typeof app!=='object'))throw Error('Formato de respuesta Codemagic no reconocido; revisar el esquema oficial antes de continuar.');
  return {
    checkedAt:new Date().toISOString(),
    applications:apps.map(app=>({
      id:app._id,name:app.appName,
      branches:Array.isArray(app.branches)?app.branches.filter(value=>typeof value==='string'):[],
      workflowIds:Array.isArray(app.workflowIds)?app.workflowIds.filter(value=>typeof value==='string'):[],
      availableFields:Object.keys(app),
    })),
    limitations:['Los workflows YAML pueden no aparecer hasta que Codemagic clone el repositorio.','Esta consulta no inicia compilaciones ni acredita el repositorio o el commit de una compilación.'],
  };
}

async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')){console.log('Consulta Codemagic de solo lectura.\nUso: node --use-env-proxy scripts/codemagic-status.mjs [APP_ID]\nVerificar configuración: añadir --check.\nGuía: CODEMAGIC-ACCESO.md');return;}
  if(args.includes('--check')){
    const configured=Boolean(process.env.CODEMAGIC_API_TOKEN?.trim());
    console.log(JSON.stringify({configured,missing:configured?[]:['CODEMAGIC_API_TOKEN']},null,2));
    if(!configured)process.exitCode=2;
    return;
  }
  if(args.length>1)throw Error('Usa --help para consultar los argumentos.');
  console.log(JSON.stringify(await readCodemagicStatus({appId:args[0]}),null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{console.error(error.message);process.exitCode=1;});}
