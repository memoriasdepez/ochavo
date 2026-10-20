import {isArchivedWorld,worldNumber,TRACKS} from './tracks.js';
export const caseProgressKey=item=>'case-'+(item.world+1);
export const activeCases=items=>items.filter(item=>!isArchivedWorld(item.world));
export function orderedCases(items,filter='all'){
 return activeCases(items).filter(item=>filter==='all'||item.track===filter).sort((a,b)=>TRACKS.findIndex(t=>t.id===a.track)-TRACKS.findIndex(t=>t.id===b.track)||worldNumber(a.world)-worldNumber(b.world));
}
export function caseHistory(items,snapshot){
 return items.filter(item=>isArchivedWorld(item.world)&&(snapshot.completedCases?.[caseProgressKey(item)]||snapshot.caseSessions?.some(s=>s[0]===caseProgressKey(item))));
}
export function caseWorldLabel(item,groups){
 return isArchivedWorld(item.world)?'Caso del recorrido anterior':`Mundo ${worldNumber(item.world)} · ${groups[item.world]?.title||''}`;
}
