import {initializeApp} from 'firebase/app';
import {initializeAuth,connectAuthEmulator,browserLocalPersistence,indexedDBLocalPersistence} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import {mergeProgress} from './progress.js';

export function createCloud(){
  const emulator=import.meta.env.DEV&&import.meta.env.VITE_USE_EMULATORS==='true'&&['localhost','127.0.0.1'].includes(location.hostname);
  const config=emulator?{apiKey:'demo-brote-key',authDomain:'demo-brote.firebaseapp.com',projectId:'demo-brote',appId:'1:123:web:demo'}:{
    apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId:import.meta.env.VITE_FIREBASE_APP_ID
  };
  if(!Object.values(config).every(v=>typeof v==='string'&&v.trim()))return null;
  // Choose persistence before Auth installs cross-tab listeners. The fallback
  // also lets Firebase migrate sessions from earlier IndexedDB installations.
  const app=initializeApp(config),auth=initializeAuth(app,{persistence:[browserLocalPersistence,indexedDBLocalPersistence]}),db=getFirestore(app);
  if(emulator){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);}
  auth.languageCode='es';
  const persistence=auth.authStateReady();
  const backend=createProgressBackend(db);
  return {auth,db,backend,persistence,emulator};
}

export function createProgressBackend(db,api={doc,getDocFromServer,runTransaction,serverTimestamp}){
  const ref=uid=>api.doc(db,'users',uid,'progress','main');
  const marker=uid=>api.doc(db,'accountDeletions',uid);
  const pending=()=>Object.assign(new Error('Esta cuenta se ha eliminado o su eliminación está en curso. La sincronización está bloqueada.'),{code:'account/deletion-pending'});
  async function guarded(uid,operation){
    try{return await operation();}
    catch(error){
      // A deletion may commit between our marker read and the progress request.
      if(String(error?.code).endsWith('permission-denied')){
        let deleted=false;
        try{deleted=(await api.getDocFromServer(marker(uid))).exists();}catch{/* Preserve the original access/network failure. */}
        if(deleted)throw pending();
      }
      throw error;
    }
  }
  function decode(record){
    if(!record.exists())return null;
    const d=record.data();
    if(![1,2,3,4,5,6,7,8,9].includes(d.schemaVersion)||typeof d.payload!=='string')throw Object.assign(Error('Actualiza Ochavo para recuperar este formato de progreso. No se ha sobrescrito tu avance.'),{code:'progress/update-required'});
    return JSON.parse(d.payload);
  }
  return {
    async read(uid){return guarded(uid,async()=>{
      if((await api.getDocFromServer(marker(uid))).exists())throw pending();
      return decode(await api.getDocFromServer(ref(uid)));
    });},
    async commit(uid,local){
      let observedRevision=-1;
      const transact=()=>api.runTransaction(db,async tx=>{
      if((await tx.get(marker(uid))).exists())throw pending();
      const target=ref(uid),record=await tx.get(target);
      observedRevision=record.exists()?record.data().revision:0;
      const merged=mergeProgress(decode(record),local),payload=JSON.stringify(merged);
      if(new TextEncoder().encode(payload).length>131072)throw Error('El progreso supera el tamaño permitido.');
      // Version 9 protects the ten-screen OPV draft from older clients that
      // retain only eight screens. Rules reject format downgrades.
      tx.set(target,{schemaVersion:9,payload,revision:record.exists()?record.data().revision+1:1,updatedAt:api.serverTimestamp()});
      return merged;
      });
      for(let attempt=0;attempt<3;attempt++){
        try{return await guarded(uid,transact);}
        catch(error){
          // Rules can see a competing revision before Firestore retries its
          // optimistic precondition. Retry only a proven race, never a denial
          // of access, a deletion barrier or an incompatible progress format.
          if(attempt<2&&observedRevision>=0&&String(error?.code).endsWith('permission-denied')){
            let latest=null;
            try{latest=await api.getDocFromServer(ref(uid));}catch{}
            if(latest?.exists()&&Number.isSafeInteger(latest.data().revision)&&latest.data().revision>observedRevision)continue;
          }
          throw error;
        }
      }
    },
    async remove(uid){return api.runTransaction(db,async tx=>{
      const target=marker(uid),existing=await tx.get(target);
      if(!existing.exists())tx.set(target,{deletedAt:api.serverTimestamp()});
      tx.delete(ref(uid));
    });}
  };
}
