import test from 'node:test';
import assert from 'node:assert/strict';
import {configurePasswordPolicy,desiredPasswordPolicy,normalizePasswordPolicy,parseArgs,CONFIG_URL,PROJECT,UPDATE_MASK,unrelatedConfigUnchanged} from '../scripts/configure-password-policy.mjs';
import {PASSWORD_POLICY} from '../src/password-policy.js';

const original=()=>({name:'projects/brote-62d26/config',subtype:'FIREBASE_AUTH',signIn:{email:{enabled:true,passwordRequired:true},hashConfig:{signerKey:'PRIVATE_TEST_VALUE'}},client:{apiKey:'PRIVATE_TEST_KEY'},notification:{smtp:{password:'PRIVATE_TEST_VALUE'}},authorizedDomains:['brote-62d26.web.app']});
const updated=()=>({...original(),passwordPolicyConfig:{...desiredPasswordPolicy(),lastUpdateTime:'2026-10-04T00:00:00Z',passwordPolicyVersions:[{...desiredPasswordPolicy().passwordPolicyVersions[0],schemaVersion:1}]}});

test('policy CLI is read-only by default and cannot change project or expand the update mask',()=>{
  assert.deepEqual(parseArgs([]),{apply:false});
  assert.deepEqual(parseArgs(['--apply']),{apply:true});
  for(const args of [['--apply','--apply'],['--project','other'],['--mask','signIn'],['--upgrade'],['--apply','other']])assert.throws(()=>parseArgs(args));
  assert.equal(PROJECT,'brote-62d26');assert.equal(UPDATE_MASK,'passwordPolicyConfig');
});

test('REST policy uses current Discovery schema and preserves access for existing passwords',()=>{
  assert.deepEqual(desiredPasswordPolicy(),{passwordPolicyEnforcementState:'ENFORCE',passwordPolicyVersions:[{customStrengthOptions:{minPasswordLength:12,maxPasswordLength:4096,containsLowercaseCharacter:true,containsUppercaseCharacter:true,containsNumericCharacter:true,containsNonAlphanumericCharacter:true}}],forceUpgradeOnSignin:false});
  assert.deepEqual(normalizePasswordPolicy(desiredPasswordPolicy()),{enforcementState:'ENFORCE',forceUpgradeOnSignin:false,...PASSWORD_POLICY});
  const publicPolicy={enforcementState:'ENFORCE',customStrengthOptions:desiredPasswordPolicy().passwordPolicyVersions[0].customStrengthOptions};
  assert.deepEqual(normalizePasswordPolicy(publicPolicy),normalizePasswordPolicy(desiredPasswordPolicy()));
  assert.throws(()=>normalizePasswordPolicy({passwordPolicyVersions:[]}));
  assert.throws(()=>normalizePasswordPolicy({passwordPolicyVersions:[{},{}]}));
});

test('read-only check requests no personal data and returns no private project configuration',async()=>{
  const calls=[];
  const result=await configurePasswordPolicy({request:async(...args)=>{calls.push(args);return original();},saveBackup:()=>assert.fail('read-only must not write backup')});
  assert.deepEqual(calls,[[CONFIG_URL]]);assert.equal(result.changed,false);assert.equal(result.readyToApply,true);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|signerKey|smtp|authorizedDomains|apiKey/);
});

test('apply backs up only policy, patches only policy and verifies config without dumping secrets',async()=>{
  const calls=[],backup=[];
  const result=await configurePasswordPolicy({apply:true,saveBackup:async value=>backup.push(value),request:async(url,options)=>{
    calls.push({url,options});
    if(options){assert.equal(backup.length,1);assert.equal(options.method,'PATCH');assert.deepEqual(Object.keys(JSON.parse(options.body)),['passwordPolicyConfig']);return updated();}
    return calls.length===1?original():updated();
  }});
  assert.deepEqual(calls.map(c=>c.url),[CONFIG_URL,`${CONFIG_URL}?updateMask=passwordPolicyConfig`,CONFIG_URL]);
  assert.equal(backup[0].passwordPolicyConfig,null);
  assert.doesNotMatch(JSON.stringify({result,backup}),/PRIVATE|signerKey|smtp|authorizedDomains|apiKey/);
  assert.equal(result.policyVerified,true);assert.equal(result.unrelatedConfigurationUnchanged,true);assert.equal(result.changed,true);
});

test('an already matching policy is idempotent and handles omitted false fields and output metadata',async()=>{
  const config=updated();delete config.passwordPolicyConfig.forceUpgradeOnSignin;
  let calls=0;
  const result=await configurePasswordPolicy({apply:true,request:async(url,options)=>{calls++;assert.equal(options,undefined);return config;},saveBackup:()=>assert.fail('no mutation needs no backup')});
  assert.equal(calls,1);assert.equal(result.changed,false);assert.equal(result.policyVerified,true);
});

test('backup failure, unknown project type and disabled email stop before any mutation',async()=>{
  for(const config of [{...original(),subtype:'UNKNOWN'},{...original(),signIn:{email:{enabled:false}}},original()]){
    let calls=0;
    await assert.rejects(configurePasswordPolicy({apply:true,request:async(url,options)=>{calls++;assert.equal(options,undefined);return config;},saveBackup:async()=>{throw Error('disk full');}}));
    assert.equal(calls,1);
  }
});

test('verification rejects a policy that was not applied or an unrelated project setting change',async()=>{
  for(const after of [original(),{...updated(),subtype:'IDENTITY_PLATFORM'},{...updated(),signIn:{email:{enabled:false}}},{...updated(),client:{apiKey:'changed'}}]){
    let calls=0;
    await assert.rejects(configurePasswordPolicy({apply:true,saveBackup:async()=>{},request:async()=>{calls++;return calls<3?original():after;}}));
    assert.equal(calls,3);
  }
  assert.equal(unrelatedConfigUnchanged(original(),updated()),true);
});

test('backup whitelists only recognized policy fields, retaining prior requirements',async()=>{
  const before={...original(),passwordPolicyConfig:{passwordPolicyEnforcementState:'ENFORCE',forceUpgradeOnSignin:true,passwordPolicyVersions:[{customStrengthOptions:{minPasswordLength:8,containsNumericCharacter:true},schemaVersion:1}],accidentalPrivateField:'PRIVATE_TEST_VALUE'}};
  let calls=0,backup;
  await configurePasswordPolicy({apply:true,saveBackup:async value=>{backup=value;},request:async()=>++calls<3?before:updated()});
  assert.equal(backup.passwordPolicyConfig.passwordPolicyVersions[0].customStrengthOptions.minPasswordLength,8);
  assert.equal(backup.passwordPolicyConfig.forceUpgradeOnSignin,true);
  assert.doesNotMatch(JSON.stringify(backup),/PRIVATE|accidentalPrivateField|schemaVersion/);
});
