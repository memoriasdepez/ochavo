import {doc,getDocFromServer,writeBatch,serverTimestamp} from 'firebase/firestore';
export const COMMUNICATION_VERSION='2026-10-05';
export const NEWSLETTER_LABEL='Quiero recibir por correo newsletters, novedades y promociones de Ochavo (opcional).';
export function createCommunicationPreferences(db,api={doc,getDocFromServer,writeBatch,serverTimestamp},newId=()=>crypto.randomUUID().replaceAll('-','')){
 const ref=uid=>api.doc(db,'users',uid,'preferences','communications');
 return {
  async read(user){if(!user||user.isAnonymous)throw Error('Inicia sesión para consultar tus preferencias.');const r=await api.getDocFromServer(ref(user.uid));return r.exists()?r.data():{newsletter:false};},
  async write(user,newsletter,source='profile'){
   if(!user||user.isAnonymous)throw Error('Inicia sesión para guardar tus preferencias.');
   if(typeof newsletter!=='boolean'||!['registration','profile'].includes(source))throw Error('Preferencia no válida.');
   const eventId=newId(),data={newsletter,version:COMMUNICATION_VERSION,source,eventId,updatedAt:api.serverTimestamp()};
   const batch=api.writeBatch(db);batch.set(ref(user.uid),data);batch.set(api.doc(db,'users',user.uid,'consentEvents',eventId),data);await batch.commit();return data;
  }
 };
}
