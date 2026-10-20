import test from 'node:test';
import assert from 'node:assert/strict';
import {learningAccess} from '../src/access.js';
const user={uid:'account-a',emailVerified:true,isAnonymous:false};
const base={configured:true,ready:true,user,currentUser:user,owner:user.uid,status:'saved'};
test('an incompatible cloud format never opens a misleading empty course',()=>{
  for(const ready of [true,false])assert.deepEqual(learningAccess({...base,ready,status:'update-required'}),{canLearn:false,mode:'unavailable'});
});
test('only a selected verified registered account can learn, including its offline cache',()=>{
  for(const status of ['saved','saving','offline','error'])assert.equal(learningAccess({...base,status}).canLearn,true);
  for(const change of [{user:null,currentUser:null,owner:null},{currentUser:{...user,isAnonymous:true}},{user:{...user,emailVerified:false},currentUser:{...user,emailVerified:false}},{owner:'account-b'},{currentUser:{...user,uid:'account-b'}},{ready:false},{configured:false},{busy:true},{selecting:true},{pending:true},{status:'deletion-pending'},{status:'storage-error'}])assert.equal(learningAccess({...base,...change}).canLearn,false);
});
test('logout and account switch revoke access before storage finishes switching',()=>{
  assert.equal(learningAccess({...base,currentUser:{...user}}).canLearn,false);
  assert.deepEqual(learningAccess({...base,currentUser:null}),{canLearn:false,mode:'signed-out'});
  assert.equal(learningAccess({...base,currentUser:{...user,uid:'b'},pending:true}).mode,'loading');
  assert.equal(learningAccess({...base,user:null,currentUser:null,owner:null,status:'loading',ready:false}).mode,'loading');
});
