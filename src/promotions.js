import {doc,getDocFromServer,getDocsFromServer,collection,query,orderBy,limit,runTransaction,serverTimestamp} from 'firebase/firestore';

const firebaseApi={doc,getDocFromServer,getDocsFromServer,collection,query,orderBy,limit,runTransaction,serverTimestamp};
const HASH=/^[a-f0-9]{64}$/;
const fail=(code,message)=>Object.assign(new Error(message),{code:'promotions/'+code});
const invalid=()=>fail('invalid-code','No se puede canjear este código. Revisa que esté completo o pide otro a quien te lo envió.');
const verified=user=>!!(user&&typeof user.uid==='string'&&user.uid&&!user.uid.includes('/')&&user.emailVerified===true&&!user.isAnonymous);
const validRole=data=>data?.schemaVersion===1&&data.enabled===true;
export const PROMO_CODE_INPUT_MAX=160;

/** A code contains 128 random bits; its public prefix and separators carry no entropy. */
export function normalizePromoCode(value){
  if(typeof value!=='string'||value.length>PROMO_CODE_INPUT_MAX)return null;
  const normalized=value.toUpperCase().replace(/[\s-]/g,'').replace(/^(?:VIRUTA|OCHAVO)/,'');
  return /^[A-F0-9]{32}$/.test(normalized)?normalized:null;
}
export function generatePromoCode(){
  const hex=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  return 'OCHAVO-'+hex.match(/.{4}/g).join('-');
}
export async function hashPromoCode(value){
  const normalized=normalizePromoCode(value);if(!normalized)throw invalid();
  // Keep the original hash namespace so issued codes and lifetime grants remain valid after rebranding.
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode('VIRUTA:'+normalized));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}

/** All permissions and the two-document redemption are enforced by Firestore rules. */
export function createPromotions({db,api=firebaseApi,getUser}){
  const identity=()=>{const user=getUser();if(!verified(user))throw fail('auth-required','Entra en tu cuenta y confirma tu correo para usar códigos.');return user.uid;};
  const same=uid=>{if(!verified(getUser())||getUser().uid!==uid)throw fail('identity-changed','La cuenta ha cambiado. Vuelve a abrir esta pantalla.');};
  const role=uid=>api.doc(db,'promoAdmins',uid),marker=uid=>api.doc(db,'accountDeletions',uid);
  const grant=uid=>api.doc(db,'users',uid,'promotions','lifetime'),codeRef=hash=>api.doc(db,'promoCodes',hash);
  const active=record=>{if(record.exists())throw Object.assign(new Error('Esta cuenta se está eliminando.'),{code:'account/deletion-pending'});};
  async function admin(uid){
    const [removed,record]=await Promise.all([api.getDocFromServer(marker(uid)),api.getDocFromServer(role(uid))]);same(uid);active(removed);
    return record.exists()&&validRole(record.data());
  }
  async function guarded(uid,fn,kind='redeem'){
    try{const result=await fn();same(uid);return result;}
    catch(error){
      same(uid);
      if(String(error?.code).endsWith('permission-denied'))throw kind==='redeem'?invalid():fail('admin-required','Esta cuenta no tiene permiso para gestionar códigos.');
      if(['unavailable','deadline-exceeded','failed-precondition'].some(code=>String(error?.code).endsWith(code)))throw fail('unavailable','Conecta a internet y vuelve a intentarlo. El código solo se activa cuando el servidor lo confirma.');
      throw error;
    }
  }
  return {
    async getAdmin(){const uid=identity();return guarded(uid,()=>admin(uid),'admin');},
    async listCodes(){
      const uid=identity();return guarded(uid,async()=>{
        if(!await admin(uid))throw fail('admin-required','Esta cuenta no tiene permiso para gestionar códigos.');
        const result=await api.getDocsFromServer(api.query(api.collection(db,'promoCodes'),api.orderBy('createdAt','desc'),api.limit(100)));same(uid);
        return result.docs.map(record=>{const d=record.data();return {hash:record.id,label:d.label,status:d.status,createdAt:d.createdAt,redeemedAt:d.redeemedAt};});
      },'admin');
    },
    async createCode({label=''}={}){
      const uid=identity();
      if(typeof label!=='string'||label.trim().length>80)throw fail('invalid-label','La referencia del código debe tener como máximo 80 caracteres.');
      label=label.trim();
      return guarded(uid,async()=>{
        for(let attempt=0;attempt<3;attempt++){
          const code=generatePromoCode(),hash=await hashPromoCode(code);same(uid);
          const created=await api.runTransaction(db,async tx=>{
            const [removed,owner,existing]=await Promise.all([tx.get(marker(uid)),tx.get(role(uid)),tx.get(codeRef(hash))]);same(uid);active(removed);
            if(!owner.exists()||!validRole(owner.data()))throw fail('admin-required','Esta cuenta no tiene permiso para gestionar códigos.');
            if(existing.exists())return false;
            tx.set(codeRef(hash),{schemaVersion:1,createdBy:uid,createdAt:api.serverTimestamp(),label,status:'available',redeemedBy:'',redeemedAt:null});return true;
          });
          if(created)return {code,hash,label,status:'available'};
        }
        throw fail('unavailable','No se pudo crear el código. Vuelve a intentarlo.');
      },'admin');
    },
    async disableCode(hash){
      const uid=identity();if(!HASH.test(String(hash)))throw invalid();
      return guarded(uid,()=>api.runTransaction(db,async tx=>{
        const [removed,owner,record]=await Promise.all([tx.get(marker(uid)),tx.get(role(uid)),tx.get(codeRef(hash))]);same(uid);active(removed);
        if(!owner.exists()||!validRole(owner.data()))throw fail('admin-required','Esta cuenta no tiene permiso para gestionar códigos.');
        if(!record.exists()||record.data().status==='redeemed')throw fail('already-used','Este código ya no está disponible. Los accesos activados se mantienen.');
        if(record.data().status==='disabled')return {disabled:true};
        tx.update(codeRef(hash),{status:'disabled'});return {disabled:true};
      }),'admin');
    },
    async redeem(code){
      const uid=identity(),hash=await hashPromoCode(code);same(uid);
      return guarded(uid,()=>api.runTransaction(db,async tx=>{
        const [removed,existing]=await Promise.all([tx.get(marker(uid)),tx.get(grant(uid))]);same(uid);active(removed);
        // Do not consume another invitation for an account that already has lifetime access.
        if(existing.exists())return {lifetime:true,alreadyActive:true};
        const record=await tx.get(codeRef(hash));same(uid);
        if(!record.exists()||record.data().status!=='available')throw invalid();
        tx.update(codeRef(hash),{status:'redeemed',redeemedBy:uid,redeemedAt:api.serverTimestamp()});
        tx.set(grant(uid),{schemaVersion:1,codeHash:hash,grantedAt:api.serverTimestamp()});
        return {lifetime:true,alreadyActive:false};
      }));
    }
  };
}
