import {localClient,makeIdentity,createVerifiedLocalAccount,readLocalCatalog,gameSeedRecords,writeRunFile} from './billing-e2e-tools.mjs';

// No CLI destination or project override is accepted. No provider credentials are read.
async function main(){
  if(process.argv.length!==2)throw Error('Uso: node scripts/billing-e2e-seed.mjs (solo demo-brote local).');
  const client=localClient(),identity=makeIdentity(),records=gameSeedRecords(await readLocalCatalog());
  await client.seed(records);
  const account=await createVerifiedLocalAccount(client,{identity});
  const accountFile=await writeRunFile(account.runId,'account.json',account);
  console.log(JSON.stringify({projectId:account.projectId,runId:account.runId,uid:account.uid,email:account.email,password:account.password,emailVerified:true,accountFile,seeded:records.length,seededPaidBenefits:false,realEmailsSent:false,providerEndToEndPurchaseTested:false,note:'Cuenta ficticia LOCAL. Inicia sesión en http://127.0.0.1:5173; nunca en la web pública. No se han realizado compras.'},null,2));
}
try{await main();}catch(error){console.error(error.code==='EEXIST'?'La evidencia ya existe; no se sobrescribe.':error.message);process.exitCode=1;}
