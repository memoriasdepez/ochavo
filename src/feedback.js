import {doc,runTransaction,serverTimestamp,collection,query,where,limit,getDocs,writeBatch} from 'firebase/firestore';
import {prepareReport,reportContext} from './feedback-domain.js';

export function createFeedbackBackend({db,getUser,isOnline=()=>true,timeoutMs=12000},api={doc,runTransaction,serverTimestamp,collection,query,where,limit,getDocs,writeBatch}) {
  function identity(user) {
    if(!user?.uid||user.isAnonymous||!user.emailVerified)throw Error('Inicia sesión y confirma tu correo para enviar un aviso.');
    if(getUser()!==user)throw Error('La cuenta ha cambiado. Vuelve a abrir el aviso desde tu cuenta.');
  }
  return {
    async send({id,...input}) {
      const user=getUser();identity(user);
      if(!isOnline())throw Error('Conecta a internet para enviar el aviso.');
      if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw Error('No se pudo preparar el aviso. Vuelve a abrirlo.');
      const payload=prepareReport(input),ref=api.doc(db,'feedbackReports',id);
      const request=api.runTransaction(db,async tx=>{
        identity(user);
        const marker=await tx.get(api.doc(db,'accountDeletions',user.uid));
        if(marker.exists())throw Error('Esta cuenta está en proceso de eliminación.');
        const existing=await tx.get(ref);identity(user);
        if(existing.exists()) {
          const prior=existing.data();
          if(prior.ownerUid!==user.uid||prior.category!==payload.category||prior.message!==payload.message||JSON.stringify(reportContext(prior.context,true))!==JSON.stringify(payload.context))throw Error('Este aviso ya existe con otro contenido. Vuelve a abrirlo.');
          return;
        }
        tx.set(ref,{...payload,ownerUid:user.uid,createdAt:api.serverTimestamp()});
      });
      let timer;
      try{await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('El envío sigue sin confirmación. Reintenta el mismo aviso.')),timeoutMs);})]);}
      finally{clearTimeout(timer);}
      identity(user);
      return {id};
    },
    // Called only after the account deletion barrier, while the identity still exists.
    async remove(uid) {
      const user=getUser();identity(user);
      if(user.uid!==uid)throw Error('La cuenta ha cambiado.');
      while(true) {
        const page=await api.getDocs(api.query(api.collection(db,'feedbackReports'),api.where('ownerUid','==',uid),api.limit(200)));
        if(page.empty||!page.docs.length)return;
        identity(user);
        const batch=api.writeBatch(db);for(const record of page.docs)batch.delete(record.ref);await batch.commit();
      }
    }
  };
}
