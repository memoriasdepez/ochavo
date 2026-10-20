import test from 'node:test';
import assert from 'node:assert/strict';
import {PASSWORD_POLICY, FIREBASE_PASSWORD_SYMBOLS, inspectPassword, passwordRequirementMessage} from '../src/password-policy.js';

test('password policy accepts all Firebase supported symbols and preserves unicode, whitespace and long passwords', () => {
  assert.deepEqual(PASSWORD_POLICY, {minLength:12,maxLength:4096,requireUppercase:true,requireLowercase:true,requireNumeric:true,requireNonAlphanumeric:true});
  assert.equal(Object.isFrozen(PASSWORD_POLICY), true);
  const documentedSymbols = ['^','$','*','.','[',']','{','}','(',')','?','"','!','@','#','%','&','/','\\',',','>','<',"'",':',';','|','_','~','`'];
  assert.deepEqual([...FIREBASE_PASSWORD_SYMBOLS], documentedSymbols);
  for(const symbol of documentedSymbols) assert.equal(inspectPassword('Abcdefghij1'+symbol).valid,true,`Firebase symbol ${symbol}`);
  for(const value of ['Abcdefghij1!', ' 日本語🙂ÁáAa1! ', 'Aa1!'+'x'.repeat(4092)]) {
    assert.equal(inspectPassword(value).valid,true);
    assert.equal(passwordRequirementMessage(value),'');
  }
});

test('password policy identifies each missing requirement and enforces the maximum independently of HTML', () => {
  const samples = [
    ['Abcdefghi1!', ['minLength']],
    ['abcdefghijkl1!', ['uppercase']],
    ['ABCDEFGHIJKL1!', ['lowercase']],
    ['Abcdefghijkl!', ['numeric']],
    ['Abcdefghijkl1', ['symbol']],
    ['Aa1!'+'x'.repeat(4093), ['maxLength']],
  ];
  for(const [value, missing] of samples) {
    assert.equal(inspectPassword(value).valid,false);
    assert.deepEqual(inspectPassword(value).missing,missing);
    assert.ok(passwordRequirementMessage(value));
    assert.ok(!passwordRequirementMessage(value).includes(value),'validation never echoes credentials');
  }
  for(const invalid of [undefined,null,123,{},[]]) assert.equal(inspectPassword(invalid).valid,false);
});

test('unicode letters, digits and unsupported symbols cannot stand in for Firebase required ASCII categories', () => {
  assert.deepEqual(inspectPassword('Ááááááááááá1!').missing,['uppercase','lowercase']);
  assert.deepEqual(inspectPassword('Abcdefghijk١!').missing,['numeric']);
  for(const symbol of ['-','+','=','🙂','€',' ','é']) assert.deepEqual(inspectPassword('Abcdefghijk1'+symbol).missing,['symbol']);
  assert.equal(inspectPassword('Aa1!🙂🙂🙂🙂').valid,true,'Firebase Web SDK counts UTF-16 code units');
});
