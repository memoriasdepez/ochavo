import {doc,getDocFromServer} from 'firebase/firestore';

/** Premium text is fetched from protected documents, never embedded in the public app. */
export function createCaseAccess({db,getUser,getGame,api={doc,getDocFromServer}}){
  let generation=0;
  function clear(){generation++;}
  async function load(metadata){
    const user=getUser(),epoch=generation;
    if(!db||!user?.emailVerified||!getGame().premium)throw Error('Los casos de estudio están incluidos en Ochavo Plus.');
    const record=await api.getDocFromServer(api.doc(db,'premiumCases','case-'+(metadata.world+1)));
    if(epoch!==generation||getUser()?.uid!==user.uid||!getGame().premium)throw Error('Tu sesión ha cambiado. Vuelve a abrir el caso.');
    if(!record.exists())throw Error('Este caso todavía no está disponible. Reinténtalo más tarde.');
    const value=record.data();
    let content;
    try{content=typeof value.caseJson==='string'?JSON.parse(value.caseJson):null;}catch{content=null;}
    if(value.schemaVersion!==1||content?.id!==metadata.id||content?.world!==metadata.world||(metadata.revision&&content?.revision!==metadata.revision)||!Array.isArray(content?.steps)||content.steps.length!==6)throw Error('El caso necesita una actualización.');
    return content;
  }
  return {load,clear};
}
