import {BUSINESS} from './business.js';
import {doc,getDocFromServer,getDocs,collection,query,where,runTransaction,serverTimestamp,writeBatch} from 'firebase/firestore';

const CODE=/^[A-HJ-NP-Z2-9]{10}$/;
const RECEIPT=/^[a-f0-9]{32}$/;
export function normalizeInvite(value){const text=String(value||'').replace(/[\s-]/g,'').toUpperCase();return CODE.test(text)?text:null;}
export function invitationURL(code){const clean=normalizeInvite(code);if(!clean)throw Error('El código de invitación no es válido.');return BUSINESS.siteUrl+'/?invite='+clean;}
const hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const randomCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(10)),n=>alphabet[n%alphabet.length]).join('');};

/** Referrer receipts contain no friend identifier, name or address. */
export function createReferralBackend(db,api={doc,getDocFromServer,getDocs,collection,query,where,runTransaction,serverTimestamp,writeBatch}){
  const marker=uid=>api.doc(db,'accountDeletions',uid),pointer=uid=>api.doc(db,'users',uid,'referralCode','main'),attribution=uid=>api.doc(db,'referralAttributions',uid),codeRef=code=>api.doc(db,'inviteCodes',code);
  const active=async(uid,tx)=>{if((await tx.get(marker(uid))).exists())throw Error('Esta cuenta se está eliminando. No se pueden usar invitaciones.');};
  return {
    async getCode(uid){
      for(let attempt=0;attempt<6;attempt++){
        const code=randomCode();
        const result=await api.runTransaction(db,async tx=>{
          await active(uid,tx);const existing=await tx.get(pointer(uid));if(existing.exists())return existing.data().code;
          const reserved=await tx.get(codeRef(code));if(reserved.exists())return null;
          tx.set(pointer(uid),{code,createdAt:api.serverTimestamp()});tx.set(codeRef(code),{uid,createdAt:api.serverTimestamp()});return code;
        });
        if(result)return result;
      }
      throw Error('No se ha podido preparar la invitación. Vuelve a intentarlo.');
    },
    async attach(uid,input){
      const code=normalizeInvite(input);if(!code)throw Error('Revisa el código de invitación.');
      const receiptId=hex();
      return api.runTransaction(db,async tx=>{
        await active(uid,tx);const [owner,previous,...lessons]=await Promise.all([tx.get(codeRef(code)),tx.get(attribution(uid)),...[0,100,150,450,950,1150,1450].map(id=>tx.get(api.doc(db,'users',uid,'gameClaims','lesson-'+id)))]);
        if(previous.exists()){if(previous.data().code===code)return {linked:true,already:true};throw Error('Esta cuenta ya tiene otra invitación vinculada.');}
        if(!owner.exists())throw Error('No encontramos esa invitación.');
        const inviterUid=owner.data().uid;if(inviterUid===uid)throw Error('No puedes usar tu propia invitación.');
        if(lessons.some(d=>d.exists()))throw Error('La invitación se vincula antes de completar la primera lección.');
        tx.set(attribution(uid),{inviterUid,code,receiptId,createdAt:api.serverTimestamp(),qualified:false});return {linked:true,already:false};
      });
    },
    async qualify(uid){
      return api.runTransaction(db,async tx=>{
        await active(uid,tx);const record=await tx.get(attribution(uid));if(!record.exists()||record.data().qualified)return false;
        const data=record.data();
        const lessons=await Promise.all([0,100,150,450,950,1150,1450].map(id=>tx.get(api.doc(db,'users',uid,'gameClaims','lesson-'+id))));if(!lessons.some(d=>d.exists()))return false;
        const target=api.doc(db,'users',data.inviterUid,'referrals',data.receiptId);
        tx.set(target,{qualifiedAt:api.serverTimestamp()});
        tx.update(attribution(uid),{qualified:true,qualifiedAt:api.serverTimestamp()});return true;
      });
    },
    async read(uid){
      const [own,invited,receipts]=await Promise.all([api.getDocFromServer(pointer(uid)),api.getDocFromServer(attribution(uid)),api.getDocs(api.collection(db,'users',uid,'referrals'))]);
      return {code:own.exists()?own.data().code:null,linked:invited.exists(),qualified:invited.exists()&&invited.data().qualified,receipts:receipts.docs.map(d=>d.id).filter(id=>RECEIPT.test(id))};
    },
    async remove(uid){
      if(!(await api.getDocFromServer(marker(uid))).exists())throw Error('Primero debe iniciarse la eliminación de la cuenta.');
      const own=await api.getDocFromServer(pointer(uid));
      const receipts=await api.getDocs(api.collection(db,'users',uid,'referrals'));
      const incoming=await api.getDocs(api.query(api.collection(db,'referralAttributions'),api.where('inviterUid','==',uid)));
      const refs=[...receipts.docs,...incoming.docs].map(d=>d.ref);
      for(let from=0;from<refs.length;from+=400){const batch=api.writeBatch(db);for(const ref of refs.slice(from,from+400))batch.delete(ref);await batch.commit();}
      // Keep the code pointer until its public code can be removed atomically, so retries can find it.
      const batch=api.writeBatch(db);batch.delete(pointer(uid));batch.delete(attribution(uid));
      if(own.exists())batch.delete(codeRef(own.data().code));await batch.commit();
      // Anonymous receipts already given to another person no longer link back to this UID.
    }
  };
}
