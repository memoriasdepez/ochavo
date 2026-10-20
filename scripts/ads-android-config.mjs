import {readFileSync,writeFileSync} from 'node:fs';
import {loadEnv} from 'vite';
import {readAdsConfiguration,ADMOB_TEST_APP_ID} from '../src/ads-config.js';
const mode=process.argv.includes('--test')?'ads-test':'production';
const {android}=readAdsConfiguration(loadEnv(mode,process.cwd(),'VITE_'));
// The disabled build uses Google's placeholder App ID, never requests an ad,
// and delays SDK measurement until the consent-gated adapter initializes it.
const appId=android.appId||ADMOB_TEST_APP_ID;
const file='android/app/src/main/res/values/ochavo_ads.xml';
const xml=`<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="ochavo_admob_app_id" translatable="false">${appId}</string>\n</resources>\n`;
writeFileSync(file,xml);
console.log(`Publicidad Android: ${android.mode}. Configuración nativa preparada.`);
