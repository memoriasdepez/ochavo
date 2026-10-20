import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPromotionsUI} from '../src/promo-ui.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function withUI(run,{native=false,verified=true,admin=false}={}){
 let user={uid:'account-a',emailVerified:verified},admitted=true,lifetime=false,changes=0;
 const calls=[],nodes=new Map(),created=[];
 class Node{
  constructor(){this.dataset={};this.listeners={};this.innerHTML='';this.textContent='';this.open=false;this.disabled=false;this.isConnected=true;this.value='';this.attributes={};}
  append(node){created.push(node);}setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}
  querySelector(selector){return get(selector);}querySelectorAll(){return [];}
  showModal(){this.open=true;}close(){this.open=false;this.emit('close',{});}
  focus(){}select(){calls.push('select');}
  emit(name,event){for(const fn of this.listeners[name]||[])fn(event);}
 }
 const get=key=>{if(!nodes.has(key))nodes.set(key,new Node());return nodes.get(key);};
 const root=get('#brote-preview');
 const adapters={document:{querySelector:get,createElement:()=>new Node(),activeElement:null},navigator:{clipboard:{writeText:async value=>{calls.push(['clipboard',value]);}}},location:{origin:'https://viruta.invalid'}};
 const prior=new Map(Object.entries(adapters).map(([key])=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(adapters))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const operations={getAdmin:async()=>admin,listCodes:async()=>[{hash:'hash-one',label:'Primer grupo',status:'available',createdAt:1720000000000}],createCode:async()=>({code:'VIRUTA-SECRET',hash:'hash-one',status:'available'}),disableCode:async()=>({disabled:true}),redeem:async()=>({lifetime:true}),refresh:async()=>{lifetime=true;}};
 const promotions=Object.fromEntries(['getAdmin','listCodes','createCode','disableCode','redeem'].map(name=>[name,async(...args)=>{calls.push([name,...args]);return operations[name](...args);} ]));
 const ui=mountPromotionsUI({promotions,getUser:()=>user,canLearn:()=>admitted,isNative:native,game:{getView:()=>({lifetimePremium:lifetime}),refreshCommerce:async()=>{calls.push(['refresh']);await operations.refresh();}},onChange:()=>changes++,afterAction:()=>calls.push(['after'])});
 const dialog=created[0];
 function click(action,extra={}){const button=new Node();button.dataset={promo:action,...extra};button.closest=()=>button;root.emit('click',{target:button});}
 function submit(kind,value){get(kind==='redeem'?'#vr-promo-code':'#vr-promo-label').value=value;const form=new Node();form.dataset={promoForm:kind};form.closest=()=>form;dialog.emit('submit',{target:form,preventDefault(){}});}
 try{await run({ui,calls,operations,dialog,get,click,submit,get changes(){return changes;},set user(value){user=value;},set admitted(value){admitted=value;},set lifetime(value){lifetime=value;}});}finally{for(const [key,value] of prior)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}

test('native iOS and Android expose no promotional controls or service calls',async()=>{await withUI(async app=>{assert.equal(app.ui.markup(),'');await app.ui.update();app.ui.reset();assert.equal(app.ui.busy(),false);assert.equal(app.dialog,undefined);assert.deepEqual(app.calls,[]);},{native:true,admin:true});});
test('unverified users cannot see or open a redemption form',async()=>{await withUI(async app=>{await app.ui.update();app.click('redeem-open');app.click('admin-open');assert.equal(app.ui.markup(),'');assert.equal(app.dialog.open,false);assert.deepEqual(app.calls,[]);},{verified:false});});
test('a regular verified account sees redemption but never the admin panel',async()=>{await withUI(async app=>{await app.ui.update();assert.match(app.ui.markup(),/Canjear código/);assert.doesNotMatch(app.ui.markup(),/data-promo="admin-open"/);app.click('redeem-open');assert.match(app.dialog.innerHTML,/Sin tarjeta ni renovación/);});});

test('forwarded full-length current and historical coupons are prefilled intact and never redeemed automatically',async()=>{
 for(const prefix of ['OCHAVO','VIRUTA'])await withUI(async app=>{
  const code=prefix+'-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF';
  assert.equal(app.ui.openRedeem(code),true);assert.match(app.dialog.innerHTML,/maxlength="160"/);assert.ok(app.dialog.innerHTML.includes('value="'+code+'"'));
  assert.match(app.dialog.innerHTML,/No está limitado a 10 caracteres/);assert.equal(app.calls.some(c=>c[0]==='redeem'),false);
  app.submit('redeem',code);await settle();assert.deepEqual(app.calls.find(c=>c[0]==='redeem'),['redeem',code]);assert.match(app.dialog.innerHTML,/Ochavo Plus de por vida/);
 });
});
test('forwarded coupon forms remain inaccessible without account admission or in native apps',async()=>{
 await withUI(async app=>{assert.equal(app.ui.openRedeem('PRIVATE-CODE'),false);assert.equal(app.dialog.open,false);assert.deepEqual(app.calls,[]);},{verified:false});
 await withUI(async app=>{assert.equal(app.ui.openRedeem('PRIVATE-CODE'),false);assert.equal(app.dialog,undefined);assert.deepEqual(app.calls,[]);},{native:true});
});
test('prefilled coupon text is escaped and cannot inject controls',async()=>{
 await withUI(async app=>{app.ui.openRedeem('\" autofocus onfocus=\"alert(1)<script>');assert.match(app.dialog.innerHTML,/value="&quot; autofocus onfocus=&quot;alert\(1\)&lt;script&gt;"/);assert.doesNotMatch(app.dialog.innerHTML,/<script>/);});
});
test('admins generate a single-use code and copy instructions, never send a message',async()=>{await withUI(async app=>{await app.ui.update();assert.match(app.ui.markup(),/Códigos promocionales/);app.click('admin-open');await settle();app.submit('create','<Grupo>');await settle();assert.deepEqual(app.calls.find(c=>c[0]==='createCode'),['createCode',{label:'<Grupo>'}]);assert.match(app.dialog.innerHTML,/VIRUTA-SECRET/);assert.match(app.dialog.innerHTML,/no se podrá volver a mostrar/);assert.match(app.dialog.innerHTML,/Aún no se ha enviado a nadie/);app.click('copy');await settle();assert.match(app.calls.find(c=>c[0]==='clipboard')[1],/Perfil → Canjear código/);assert.match(app.calls.find(c=>c[0]==='clipboard')[1],/VIRUTA-SECRET/);app.click('close');assert.equal(app.dialog.open,false);app.click('admin-open');await settle();assert.doesNotMatch(app.dialog.innerHTML,/VIRUTA-SECRET/);},{admin:true});});
test('redeeming confirms the server entitlement before displaying lifetime access',async()=>{await withUI(async app=>{app.click('redeem-open');app.submit('redeem','VIRUTA-TEST');await settle();assert.deepEqual(app.calls.filter(c=>['redeem','refresh'].includes(c[0])),[['redeem','VIRUTA-TEST'],['refresh']]);assert.match(app.dialog.innerHTML,/Ochavo Plus de por vida/);assert.match(app.dialog.innerHTML,/Gratis · Sin renovación ni cargos/);assert.doesNotMatch(app.ui.markup(),/data-promo="redeem-open"/);});});
test('already lifetime accounts do not consume a second code',async()=>{await withUI(async app=>{app.lifetime=true;app.click('redeem-open');app.submit('redeem','OTHER-CODE');await settle();assert.equal(app.calls.some(c=>c[0]==='redeem'),false);assert.match(app.dialog.innerHTML,/Ochavo Plus de por vida/);});});
test('a redemption completing after logout cannot refresh another account or reveal the previous result',async()=>{await withUI(async app=>{const pending=deferred();app.operations.redeem=()=>pending.promise;app.click('redeem-open');app.submit('redeem','PRIVATE-CODE');assert.equal(app.ui.busy(),true);app.admitted=false;app.ui.reset();app.user={uid:'account-b',emailVerified:true};app.admitted=true;pending.resolve({lifetime:true});await settle();assert.equal(app.dialog.innerHTML,'');assert.equal(app.dialog.open,false);assert.equal(app.calls.some(c=>c[0]==='refresh'),false);assert.equal(app.ui.busy(),false);});});
test('an admin code arriving after an account replacement is never shown to the new account',async()=>{await withUI(async app=>{await app.ui.update();app.click('admin-open');await settle();const pending=deferred();app.operations.createCode=()=>pending.promise;app.submit('create','PRIVATE-LABEL');app.ui.reset();app.user={uid:'account-b',emailVerified:true};pending.resolve({code:'PRIVATE-CODE',hash:'private-hash'});await settle();assert.equal(app.dialog.innerHTML,'');assert.doesNotMatch(app.ui.markup(),/admin-open/);},{admin:true});});
test('replacing the Auth object for the same UID invalidates a delayed entitlement result',async()=>{await withUI(async app=>{const pending=deferred();app.operations.redeem=()=>pending.promise;app.click('redeem-open');app.submit('redeem','CODE');app.user={uid:'account-a',emailVerified:true};pending.resolve();await settle();assert.equal(app.calls.some(c=>c[0]==='refresh'),false);assert.doesNotMatch(app.dialog.innerHTML,/TU ACCESO ESTÁ ACTIVO/);});});
test('admin detection from an old session cannot reveal admin controls in the new account',async()=>{await withUI(async app=>{const pending=deferred();app.operations.getAdmin=()=>pending.promise;const checking=app.ui.update();app.ui.reset();app.user={uid:'account-b',emailVerified:true};pending.resolve(true);await checking;assert.doesNotMatch(app.ui.markup(),/admin-open/);},{admin:true});});
test('busy redemption ignores duplicate form submissions and keeps failures readable',async()=>{await withUI(async app=>{const pending=deferred();app.operations.redeem=()=>pending.promise;app.click('redeem-open');app.submit('redeem','CODE');app.submit('redeem','CODE');assert.equal(app.calls.filter(c=>c[0]==='redeem').length,1);pending.reject(Error('Este código ya no está disponible.'));await settle();assert.equal(app.get('.vr-promo-message').textContent,'Este código ya no está disponible.');assert.equal(app.ui.busy(),false);});});
test('a code already redeemed but waiting for refresh is not misrepresented as activated',async()=>{await withUI(async app=>{app.operations.refresh=async()=>{};app.click('redeem-open');app.submit('redeem','CODE');await settle();assert.match(app.dialog.innerHTML,/Tu código está confirmado/);assert.match(app.dialog.innerHTML,/Comprobar mi acceso/);assert.doesNotMatch(app.dialog.innerHTML,/TU ACCESO ESTÁ ACTIVO/);});});
test('a network failure after redemption preserves confirmation and retries access without consuming another code',async()=>{await withUI(async app=>{app.operations.refresh=async()=>{throw Error('Sin conexión');};app.click('redeem-open');app.submit('redeem','CODE');await settle();assert.match(app.dialog.innerHTML,/Tu código está confirmado/);assert.doesNotMatch(app.dialog.innerHTML,/data-promo-form="redeem"/);assert.match(app.get('.vr-promo-message').textContent,/No necesitas otro código/);app.operations.refresh=async()=>{app.lifetime=true;};app.click('refresh');await settle();assert.match(app.dialog.innerHTML,/Ochavo Plus de por vida/);assert.equal(app.calls.filter(c=>c[0]==='redeem').length,1);});});
