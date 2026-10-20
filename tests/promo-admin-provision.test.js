import test from 'node:test';
import assert from 'node:assert/strict';
import {adminCandidate,parseArgs,PROJECT} from '../scripts/provision-promo-admin.mjs';
test('admin provisioning requires one exact verified active registered account',()=>{
  const user={localId:'A_123',email:'Owner@example.com',emailVerified:true,disabled:false};
  assert.equal(adminCandidate({users:[user]},'owner@example.com'),'A_123');
  for(const result of [{},{users:[]},{users:[user,user]},{users:[{...user,email:'other@example.com'}]},{users:[{...user,emailVerified:false}]},{users:[{...user,disabled:true}]},{users:[{...user,localId:'../admin'}]}])assert.throws(()=>adminCandidate(result,'owner@example.com'));
  assert.equal(PROJECT,'brote-62d26');
});
test('admin provisioning is preview by default and rejects ambiguous flags',()=>{
  assert.deepEqual(parseArgs(['--email','owner@example.com']),{email:'owner@example.com',apply:false});
  assert.equal(parseArgs(['--email','owner@example.com','--apply']).apply,true);
  for(const args of [[],['--apply'],['--email','invalid'],['--email','owner@example.com','--project','other'],['--email','owner@example.com','--apply','--apply']])assert.throws(()=>parseArgs(args));
});
