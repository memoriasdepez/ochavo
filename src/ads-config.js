const modes=new Set(['disabled','test','live']);
export const ADMOB_TEST_APP_ID='ca-app-pub-3940256099942544~3347511713';
export const ADMOB_TEST_UNIT_ID='ca-app-pub-3940256099942544/1033173712';
const appPattern=/^ca-app-pub-\d{16}~\d{10}$/;
const unitPattern=/^ca-app-pub-\d{16}\/\d{10}$/;
export function readAdsConfiguration(env={}){
  const androidMode=env.VITE_ANDROID_ADS_MODE||'disabled',webMode=env.VITE_WEB_ADS_MODE||'disabled';
  if(!modes.has(androidMode)||!modes.has(webMode))throw new Error('Modo de publicidad no válido.');
  const appId=androidMode==='test'?ADMOB_TEST_APP_ID:env.VITE_ADMOB_ANDROID_APP_ID||'';
  const unitId=androidMode==='test'?ADMOB_TEST_UNIT_ID:env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID||'';
  if(androidMode!=='disabled'&&(!appPattern.test(appId)||!unitPattern.test(unitId)))throw new Error('Faltan los identificadores de aplicación y bloque intersticial de AdMob.');
  if(androidMode==='live'&&(appId===ADMOB_TEST_APP_ID||unitId===ADMOB_TEST_UNIT_ID))throw new Error('Los identificadores de prueba de AdMob no son válidos para publicidad real.');
  if(androidMode==='live'&&appId.split('~')[0]!==unitId.split('/')[0])throw new Error('La aplicación y el bloque AdMob deben pertenecer al mismo editor.');
  const clientId=env.VITE_ADSENSE_CLIENT_ID||'',slotId=env.VITE_ADSENSE_RESULT_SLOT_ID||'';
  if(webMode!=='disabled'&&(!/^ca-pub-\d{16}$/.test(clientId)||!/^\d{10}$/.test(slotId)))throw new Error('Faltan el editor y el bloque de anuncios de AdSense.');
  const appApproved=env.VITE_ADMOB_APP_APPROVED==='true';
  // Account approval alone does not approve the application. Fail closed even
  // if a developer accidentally switches the mode before its readiness review.
  return {android:{mode:androidMode,enabled:androidMode==='test'||androidMode==='live'&&appApproved,testMode:androidMode==='test',approved:appApproved,appId,adUnitId:unitId},web:{mode:webMode,enabled:webMode!=='disabled',testMode:webMode==='test',clientId,slotId,approved:env.VITE_ADSENSE_SITE_APPROVED==='true'}};
}
export function validateAdsRelease(env={}){
  const config=readAdsConfiguration(env);
  if(config.android.testMode||config.web.testMode)throw new Error('Los anuncios de prueba solo se permiten en una compilación de pruebas, no en la publicación.');
  if(config.android.mode==='live'&&!config.android.approved)throw new Error('AdMob debe aprobar la aplicación Ochavo antes de habilitar anuncios Android reales.');
  if(config.web.enabled&&!config.web.approved)throw new Error('AdSense debe aprobar ochavo.app antes de habilitar anuncios web reales.');
  return config;
}

export function validateAdsPublisherFiles(env={}, {appAdsTxt='',adsTxt=''}={}){
  const config=readAdsConfiguration(env);
  const authorizes=(file,publisher)=>file.split(/\r?\n/).some(line=>{
    const [domain,id,relationship,authority]=line.split('#')[0].split(',').map(value=>value.trim());
    return domain==='google.com'&&id===publisher&&relationship==='DIRECT'&&authority==='f08c47fec0942fa0';
  });
  if(config.android.appId){
    const publisher=config.android.appId.split('~')[0].replace('ca-app-','');
    if(!authorizes(appAdsTxt,publisher))throw new Error('app-ads.txt no autoriza al editor configurado de AdMob.');
  }
  if(config.web.clientId&&!authorizes(adsTxt,config.web.clientId.replace('ca-','')))throw new Error('ads.txt no autoriza al editor configurado de AdSense.');
  return config;
}
