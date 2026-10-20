import {doc,getDocFromServer,runTransaction,serverTimestamp,collection,query,where,limit,getDocs,writeBatch} from 'firebase/firestore';
import {GAME_CONFIG,emptyGame,validateGame,effectiveCommerce,validateGemCommerce,dayKeyAt,dayWindow,normalizeCommand,eventIdFor,claimIdsFor,applyGameCommand,sameCommand,gameError,validateSkippedWorlds} from './game-domain.js';

const firebaseApi={doc,getDocFromServer,runTransaction,serverTimestamp,collection,query,where,limit,getDocs,writeBatch};
/** Needs the protected catalog/calendar and the proposed rules before production use. */
export function createGameBackend(db,{api=firebaseApi,now=()=>Date.now(),config=GAME_CONFIG}={}){
  const wallet=uid=>api.doc(db,'users',uid,'game','main');
  const skips=uid=>api.doc(db,'users',uid,'game','skips');
  const commerce=uid=>api.doc(db,'users',uid,'commerce','main');
  const commerceGems=uid=>api.doc(db,'users',uid,'commerceGems','main');
  const promotion=uid=>api.doc(db,'users',uid,'promotions','lifetime');
  const marker=uid=>api.doc(db,'accountDeletions',uid);
  const event=(uid,id)=>api.doc(db,'users',uid,'gameEvents',id);
  const claim=(uid,id)=>api.doc(db,'users',uid,'gameClaims',id);
  const deleted=()=>Object.assign(Error('Esta cuenta se ha eliminado o su eliminación está en curso.'),{code:'account/deletion-pending'});
  const ensureUid=uid=>{if(typeof uid!=='string'||!uid||uid.includes('/'))throw gameError('identity','Falta identificar la cuenta.');};
  async function guarded(uid,fn){
    ensureUid(uid);
    try{return await fn();}catch(error){
      if(String(error?.code).endsWith('permission-denied')){
        let removed=false;try{removed=(await api.getDocFromServer(marker(uid))).exists();}catch{}
        if(removed)throw deleted();
      }
      throw error;
    }
  }
  return {
    async readSkips(uid){return guarded(uid,async()=>{
      if((await api.getDocFromServer(marker(uid))).exists())throw deleted();
      const result=await api.getDocFromServer(skips(uid));
      if(result.exists()&&result.data().schemaVersion!==1)throw gameError('invalid-state','No se pudieron verificar los mundos saltados.');
      return validateSkippedWorlds(result.exists()?result.data().worldIds:[]);
    });},
    async readCommerce(uid){return guarded(uid,async()=>{
      if((await api.getDocFromServer(marker(uid))).exists())throw deleted();
      const [result,grant]=await Promise.all([api.getDocFromServer(commerce(uid)),api.getDocFromServer(promotion(uid))]);
      return effectiveCommerce(result.exists()?result.data():null,grant.exists()?grant.data():null);
    });},
    async readGemCommerce(uid){return guarded(uid,async()=>{
      if((await api.getDocFromServer(marker(uid))).exists())throw deleted();
      const result=await api.getDocFromServer(commerceGems(uid));
      return validateGemCommerce(result.exists()?result.data():null);
    });},
    async read(uid){return guarded(uid,async()=>{
      if((await api.getDocFromServer(marker(uid))).exists())throw deleted();
      const result=await api.getDocFromServer(wallet(uid));
      return result.exists()?validateGame(result.data(),config):emptyGame(config);
    });},
    async commit(uid,raw){
      const command=normalizeCommand(raw),day=dayKeyAt(now(),config.timeZone),id=eventIdFor(command,day);
      let observedRevision=-1,observedGemRevision=-1;
      const transact=()=>api.runTransaction(db,async tx=>{
        if((await tx.get(marker(uid))).exists())throw deleted();
        const stateRecord=await tx.get(wallet(uid)),previous=stateRecord.exists()?validateGame(stateRecord.data(),config):emptyGame(config);
        const commerceRecord=await tx.get(commerce(uid)),grantRecord=await tx.get(promotion(uid));
        const funds=effectiveCommerce(commerceRecord.exists()?commerceRecord.data():null,grantRecord.exists()?grantRecord.data():null);
        const gemRecord=await tx.get(commerceGems(uid)),gemFunds=validateGemCommerce(gemRecord.exists()?gemRecord.data():null);
        observedGemRevision=gemFunds.revision;
        observedRevision=previous.revision;
        const skipRecord=command.kind==='skip-world'?await tx.get(skips(uid)):null;
        const skippedWorldIds=skipRecord?validateSkippedWorlds(skipRecord.exists()?skipRecord.data().worldIds:[]):undefined;
        const existing=await tx.get(event(uid,id));
        if(existing.exists()){
          const receipt=existing.data();
          if(!sameCommand(receipt,command))throw gameError('attempt-conflict','El identificador ya pertenece a otra operación.');
          return {state:previous,commerce:funds,commerceGems:gemFunds,receipt,duplicate:true,...(skippedWorldIds?{skippedWorldIds}: {})};
        }
        const configuration=await tx.get(api.doc(db,'gameConfig','economy'));
        if(!configuration.exists())throw gameError('not-configured','El juego todavía no está configurado.');
        const activeConfig=configuration.data();
        if(activeConfig.version!==config.version||activeConfig.timeZone!==config.timeZone)throw gameError('update-required','Actualiza Ochavo para usar esta configuración del juego.');
        const calendar=await tx.get(api.doc(db,'gameDays',day));
        if(!calendar.exists())throw gameError('calendar-unavailable','Falta el calendario del juego para esta fecha.');
        const window=dayWindow(day,config.timeZone),savedWindow=calendar.data();
        const milliseconds=value=>typeof value?.toMillis==='function'?value.toMillis():value;
        if(milliseconds(savedWindow.startAt)!==window.startAt||milliseconds(savedWindow.endAt)!==window.endAt)throw gameError('calendar-invalid','El calendario del juego necesita revisión.');
        let entry=null;
        if(command.target&&!['referral','import-debit'].includes(command.kind)){
          const item=await tx.get(api.doc(db,'gameCatalog',command.target));
          entry=item.exists()?item.data():null;
        }
        const candidates=claimIdsFor(command,previous,day,entry);
        if(entry?.requiredClaim)candidates.push(entry.requiredClaim);
        const existingClaims=[];
        for(const claimId of new Set(candidates))if((await tx.get(claim(uid,claimId))).exists())existingClaims.push(claimId);
        let referralVerified=false;
        if(command.kind==='referral')referralVerified=(await tx.get(api.doc(db,'users',uid,'referrals',command.target))).exists();
        const result=applyGameCommand(previous,command,{day,config:activeConfig,entry,existingClaims,referralVerified,commerce:funds,commerceGems:gemFunds,now:now(),skippedWorldIds});
        if(result.duplicate)return result;
        if(command.kind==='skip-world')tx.set(skips(uid),{schemaVersion:1,worldIds:result.skippedWorldIds,updatedAt:api.serverTimestamp()});
        else delete result.skippedWorldIds;
        tx.set(wallet(uid),{...result.state,updatedAt:api.serverTimestamp()});
        tx.set(event(uid,id),{...result.receipt,createdAt:api.serverTimestamp()});
        if(result.commerce.paidConsumed!==funds.paidConsumed){
          result.commerce.revision=funds.revision+1;
          // Persist only the consumed balance. Effective lifetime access must never overwrite billing.
          tx.set(commerce(uid),{...commerceRecord.data(),revision:result.commerce.revision,paidConsumed:result.commerce.paidConsumed,paidLives:result.commerce.paidLives,updatedAt:api.serverTimestamp()});
        }
        if(result.commerceGems.consumed!==gemFunds.consumed){
          result.commerceGems.revision=gemFunds.revision+1;
          // Grant, environment and server audit fields are preserved verbatim.
          tx.set(commerceGems(uid),{...gemRecord.data(),consumed:result.commerceGems.consumed,balance:result.commerceGems.balance,revision:result.commerceGems.revision,updatedAt:api.serverTimestamp()});
        }
        for(const earned of result.claims)tx.set(claim(uid,earned.id),{eventId:id,createdAt:api.serverTimestamp()});
        return result;
      });
      for(let attempt=0;attempt<3;attempt++){
        try{return await guarded(uid,transact);}
        catch(error){
          // Rules can observe a competing commit before the optimistic precondition is retried.
          // Only retry a denied request when a newer wallet revision proves that race occurred.
          if(attempt<2&&observedRevision>=0&&String(error?.code).endsWith('permission-denied')){
            let latest=null,latestGems=null;try{[latest,latestGems]=await Promise.all([api.getDocFromServer(wallet(uid)),api.getDocFromServer(commerceGems(uid))]);}catch{}
            if(latest?.exists()&&latest.data().revision>observedRevision||latestGems?.exists()&&latestGems.data().revision>observedGemRevision)continue;
          }
          throw error;
        }
      }
    },
    /** Call after progressBackend.remove creates the irreversible deletion marker, before deleteUser. */
    async remove(uid){
      ensureUid(uid);
      if(!(await api.getDocFromServer(marker(uid))).exists())throw gameError('deletion-marker-required','Primero debe bloquearse la cuenta para borrarla.');
      const grant=await api.getDocFromServer(promotion(uid));
      const codeHash=grant.exists()?grant.data().codeHash:null;
      const redeemedCode=typeof codeHash==='string'&&/^[a-f0-9]{64}$/.test(codeHash)?api.doc(db,'promoCodes',codeHash):null;
      // Clear an administrator's identifiers and disable unclaimed codes. Consumed codes remain
      // permanent tombstones: deleting an account must not make its free access code usable again.
      while(true){
        const page=await api.getDocs(api.query(api.collection(db,'promoCodes'),api.where('createdBy','==',uid),api.limit(200)));
        if(page.empty||!page.docs.length)break;
        const batch=api.writeBatch(db);
        for(const record of page.docs){
          const value=record.data(),changes={createdBy:'',label:''};
          if(value.status==='available')changes.status='disabled';
          batch.update(record.ref,changes);
        }
        await batch.commit();
      }
      // No new events/claims can be written once the marker exists. Batches are restartable.
      for(const name of ['gameEvents','gameClaims','commercePurchases','consentEvents']){
        while(true){
          const page=await api.getDocs(api.query(api.collection(db,'users',uid,name),api.limit(200)));
          if(page.empty||!page.docs.length)break;
          const batch=api.writeBatch(db);for(const record of page.docs)batch.delete(record.ref);await batch.commit();
        }
      }
      const batch=api.writeBatch(db);
      if(redeemedCode){
        const code=await api.getDocFromServer(redeemedCode);
        if(code.exists()&&code.data().redeemedBy===uid)batch.update(redeemedCode,{redeemedBy:''});
      }
      batch.delete(promotion(uid));batch.delete(api.doc(db,'promoAdmins',uid));
      batch.delete(api.doc(db,'users',uid,'preferences','communications'));
      batch.delete(wallet(uid));batch.delete(skips(uid));batch.delete(commerce(uid));batch.delete(commerceGems(uid));await batch.commit();return true;
    }
  };
}
