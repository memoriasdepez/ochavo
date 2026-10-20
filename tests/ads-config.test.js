import test from 'node:test';
import assert from 'node:assert/strict';
import {readAdsConfiguration,validateAdsRelease,validateAdsPublisherFiles,ADMOB_TEST_APP_ID,ADMOB_TEST_UNIT_ID} from '../src/ads-config.js';
test('unconfigured releases never activate either ad provider',()=>{const c=validateAdsRelease({});assert.equal(c.android.enabled,false);assert.equal(c.web.enabled,false);});
test('official Android test IDs are confined to explicit test builds',()=>{const env={VITE_ANDROID_ADS_MODE:'test'};assert.equal(readAdsConfiguration(env).android.adUnitId,ADMOB_TEST_UNIT_ID);assert.throws(()=>validateAdsRelease(env),/prueba/);});
test('live IDs must belong to one publisher and cannot be Google demo IDs',()=>{
 assert.throws(()=>validateAdsRelease({VITE_ANDROID_ADS_MODE:'live',VITE_ADMOB_ANDROID_APP_ID:ADMOB_TEST_APP_ID,VITE_ADMOB_ANDROID_INTERSTITIAL_ID:ADMOB_TEST_UNIT_ID}),/prueba/);
 assert.throws(()=>readAdsConfiguration({VITE_ANDROID_ADS_MODE:'live',VITE_ADMOB_ANDROID_APP_ID:'ca-app-pub-1111111111111111~1234567890',VITE_ADMOB_ANDROID_INTERSTITIAL_ID:'ca-app-pub-2222222222222222/1234567890'}),/editor/);
});
test('a valid web slot still requires site approval',()=>{const env={VITE_WEB_ADS_MODE:'live',VITE_ADSENSE_CLIENT_ID:'ca-pub-1111111111111111',VITE_ADSENSE_RESULT_SLOT_ID:'1234567890'};assert.throws(()=>validateAdsRelease(env),/aprobar/);assert.equal(validateAdsRelease({...env,VITE_ADSENSE_SITE_APPROVED:'true'}).web.enabled,true);});

const ochavoAndroid={VITE_ADMOB_ANDROID_APP_ID:'ca-app-pub-6376223048349440~7142035482',VITE_ADMOB_ANDROID_INTERSTITIAL_ID:'ca-app-pub-6376223048349440/1176312800'};
const ochavoWeb={VITE_ADSENSE_CLIENT_ID:'ca-pub-1646986568764636',VITE_ADSENSE_RESULT_SLOT_ID:'5844517255'};
const record=id=>`google.com, ${id}, DIRECT, f08c47fec0942fa0\n`;
test('AdMob account approval cannot accidentally enable an unapproved application',()=>{
 const env={...ochavoAndroid,VITE_ANDROID_ADS_MODE:'live'};
 assert.equal(readAdsConfiguration(env).android.enabled,false);
 assert.throws(()=>validateAdsRelease(env),/aprobar la aplicación/);
 assert.equal(readAdsConfiguration({...env,VITE_ADMOB_APP_APPROVED:'TRUE'}).android.enabled,false);
 const approved=validateAdsRelease({...env,VITE_ADMOB_APP_APPROVED:'true'});
 assert.equal(approved.android.enabled,true);
 assert.equal(approved.android.approved,true);
 assert.equal(approved.android.adUnitId,ochavoAndroid.VITE_ADMOB_ANDROID_INTERSTITIAL_ID);
 assert.equal(validateAdsRelease({...env,VITE_ADMOB_APP_APPROVED:'true',VITE_ANDROID_ADS_MODE:'disabled'}).android.enabled,false);
});
test('release verifies each publisher against its own authorization file while ads are disabled',()=>{
 const env={...ochavoAndroid,...ochavoWeb};
 const files={appAdsTxt:record('pub-6376223048349440'),adsTxt:record('pub-1646986568764636')};
 assert.equal(validateAdsPublisherFiles(env,files).android.enabled,false);
 assert.throws(()=>validateAdsPublisherFiles(env,{...files,appAdsTxt:files.adsTxt}),/app-ads.txt/);
 assert.throws(()=>validateAdsPublisherFiles(env,{...files,adsTxt:files.appAdsTxt}),/ads.txt/);
 assert.throws(()=>validateAdsPublisherFiles(env,{...files,appAdsTxt:'# '+files.appAdsTxt}),/app-ads.txt/);
 assert.throws(()=>validateAdsPublisherFiles(env,{...files,appAdsTxt:files.appAdsTxt.replace('DIRECT','RESELLER')}),/app-ads.txt/);
 assert.equal(validateAdsPublisherFiles({},{}).web.enabled,false);
});
