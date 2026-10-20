import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProductionBillingConfiguration,PRODUCTION_BILLING_URL} from '../scripts/release-config.mjs';

const production={VITE_FIREBASE_PROJECT_ID:'brote-62d26',VITE_BILLING_ENVIRONMENT:'production',VITE_BILLING_API_URL:PRODUCTION_BILLING_URL,
  VITE_REVENUECAT_WEB_KEY:'rcb_publicFixture',VITE_REVENUECAT_ANDROID_KEY:'goog_publicFixture',VITE_REVENUECAT_IOS_KEY:'appl_publicFixture'};

test('publication accepts disabled purchases and public production configuration',()=>{
  assert.doesNotThrow(()=>validateProductionBillingConfiguration({VITE_FIREBASE_PROJECT_ID:'brote-62d26'}));
  assert.doesNotThrow(()=>validateProductionBillingConfiguration(production));
});

test('publication rejects sandbox, test-store, private and mismatched-platform keys',()=>{
  for(const changes of [
    {VITE_BILLING_ENVIRONMENT:'sandbox'},{VITE_BILLING_ENVIRONMENT:'unknown'},
    {VITE_REVENUECAT_WEB_KEY:'rcb_sb_publicFixture'},{VITE_REVENUECAT_WEB_KEY:'test_publicFixture'},
    {VITE_REVENUECAT_WEB_KEY:'sk_privateFixture'},{VITE_REVENUECAT_ANDROID_KEY:'test_publicFixture'},
    {VITE_REVENUECAT_IOS_KEY:'goog_publicFixture'},
  ])assert.throws(()=>validateProductionBillingConfiguration({...production,...changes}));
  assert.throws(()=>validateProductionBillingConfiguration({VITE_BILLING_ENVIRONMENT:'sandbox'}));
});

test('publication cannot combine production purchases with another Firebase project or backend',()=>{
  assert.throws(()=>validateProductionBillingConfiguration({...production,VITE_FIREBASE_PROJECT_ID:'demo-ochavo'}));
  for(const endpoint of [
    'https://billing.example.invalid/billing',PRODUCTION_BILLING_URL+'?token=private',PRODUCTION_BILLING_URL+'#fragment',
    PRODUCTION_BILLING_URL.replace('https:','http:'),PRODUCTION_BILLING_URL.replace('https://','https://user:secret@'),
    PRODUCTION_BILLING_URL.replace('brote-62d26','ochavo-sandbox'),
  ])assert.throws(()=>validateProductionBillingConfiguration({...production,VITE_BILLING_API_URL:endpoint}));
});

test('checkout CSP permits the actual payment hosts without unsafe scripts or arbitrary frames',()=>{
  const firebase=JSON.parse(readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
  const value=firebase.hosting.headers.find(item=>item.source==='**').headers.find(header=>header.key==='Content-Security-Policy').value;
  const directives=Object.fromEntries(value.split(';').map(part=>part.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...sources])=>[name,sources]));
  assert.ok(directives['connect-src'].includes(new URL(PRODUCTION_BILLING_URL).origin));
  for(const host of ['https://api.revenuecat.com','https://e.revenue.cat','https://api.stripe.com','https://link.com','https://*.link.com'])assert.ok(directives['connect-src'].includes(host));
  assert.ok(directives['script-src'].includes('https://js.stripe.com'));
  for(const host of ['https://js.stripe.com','https://*.js.stripe.com','https://hooks.stripe.com','https://link.com','https://*.link.com'])assert.ok(directives['frame-src'].includes(host));
  for(const directive of ['script-src','frame-src'])for(const disallowed of ["'unsafe-inline'","'unsafe-eval'",'*','https:','https://*.stripe.com','https://*.cloudfunctions.net'])assert.ok(!directives[directive].includes(disallowed));
  assert.deepEqual(directives['object-src'],["'none'"]);assert.deepEqual(directives['frame-ancestors'],["'none'"]);
});
