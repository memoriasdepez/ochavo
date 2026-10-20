import {localClient,PROJECT,validateAccount,readRunFile,writeRunFile,observeLocal,compareEconomy,validateLabel} from './billing-e2e-tools.mjs';

async function main(){
  const [runId,label,...args]=process.argv.slice(2);validateLabel(label);
  const options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--from','--expect','--amount','--receipt'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw Error('Uso: node scripts/billing-e2e-observe.mjs RUN ETIQUETA [--from ETIQUETA --expect purchase|spend|refund|unchanged|lives-purchase|premium-active --amount CANTIDAD --receipt sandbox:rc_billing:TRANSACCION]');
    options[args[i]]=args[i+1];
  }
  if(!!options['--from']!==!!options['--expect']||!options['--from']&&(options['--amount']||options['--receipt']))throw Error('Una comparación requiere --from y --expect.');
  if(options['--amount']&&!/^\d{1,7}$/.test(options['--amount']))throw Error('Cantidad de comparación no válida.');
  const account=validateAccount(await readRunFile(runId,'account.json'));
  if(account.runId!==runId)throw Error('La cuenta pertenece a otra ejecución local.');
  const economy=await observeLocal(account,localClient());
  let comparison=null;
  if(options['--from']){
    validateLabel(options['--from']);
    const baseline=await readRunFile(runId,options['--from']+'.json');
    if(baseline.projectId!==PROJECT||baseline.uid!==account.uid||baseline.runId!==runId||!baseline.economy)throw Error('La observación anterior pertenece a otra identidad.');
    comparison=compareEconomy(baseline.economy,economy,{expect:options['--expect'],amount:Number(options['--amount']||0),receiptKey:options['--receipt']||null});
  }
  const observation={schemaVersion:1,source:'demo-brote-local-observation',projectId:PROJECT,runId,uid:account.uid,label,capturedAt:new Date().toISOString(),providerEndToEndPurchaseTested:false,economy,...(comparison?{comparison}:{})};
  const evidenceFile=await writeRunFile(runId,label+'.json',observation);
  console.log(JSON.stringify({evidenceFile,...observation},null,2));
  if(comparison&&!comparison.passed)process.exitCode=1;
}
try{await main();}catch(error){console.error(error.code==='EEXIST'?'La etiqueta ya existe; usa una nueva para conservar la evidencia anterior.':error.message);process.exitCode=1;}
