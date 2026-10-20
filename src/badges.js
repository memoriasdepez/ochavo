import {WORLD_COUNT,trackForExam,worldNumber} from './tracks.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const GEM_SVG='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 5h16l6 9-14 14L2 14Z" fill="#d6b5f3" stroke="#76519d" stroke-width="2" stroke-linejoin="round"/><path d="m8 5 4 9 4 14 4-14 4-9M2 14h28M12 14l4-9 4 9" stroke="#76519d" stroke-width="1.5" stroke-linejoin="round"/><path d="m8 5 4 9H2Z" fill="#f4e9ff"/></svg>';
export const HEART_SVG='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28 4.5 16.5C-3 9 7-1 16 8c9-9 19 1 11.5 8.5Z" fill="currentColor"/><path d="M7 10q2-3 5-1" fill="none" stroke="white" stroke-opacity=".7" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const FIRE_SVG='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M17 2c3 7 10 10 10 17a11 11 0 0 1-22 0c0-5 3-8 6-11-1 7 3 7 4 3 1-3 1-6 2-9Z" fill="#ed9944"/><path d="M17 16c1 4 5 5 5 8a6 6 0 0 1-12 0c0-3 4-5 7-8Z" fill="#ffe098"/></svg>';

const palettes={technical:['#b8d6f3','#eaf3fc','#416fac','#80a9d4'],stocks:['#c9ed89','#f1fadf','#456931','#91b94a'],etfs:['#a4d8d2','#e6f7f4','#306c69','#60a69c'],crypto:['#d1b3eb','#f4e9fc','#70508e','#a17ac1'],streak:['#f6c56e','#fff3d9','#9d642a','#dca147'],lessons:['#c9ed89','#f1fadf','#456931','#91b94a'],cases:['#a7c9ea','#eef5ff','#456b92','#7da5ce'],invite:['#efc1ce','#fff0f3','#9a5d70','#cb8ba1']};
const marks={
  technical:'<path d="M41 32v53m-7-37h14v22H34Zm27-18v48m-7-36h14v23H54Zm27-57v58m-7-42h14v28H74Z"/>',
  stocks:'<path d="M38 75V61h9v14m9 0V48h9v27m9 0V37h9v38"/><path d="m37 49 17-10 12 3 15-13"/>',
  etfs:'<path d="m35 49 25-14 25 14-25 14Zm0 13 25 14 25-14M35 75l25 14 25-14"/>',
  crypto:'<path d="m60 31 25 15v29L60 90 35 75V46Zm0 30 25-15M60 61 35 46m25 15v29"/><path d="m47 39 26 15v14"/>',
  streak:'<path d="M64 29c-1 14 19 19 19 36a23 23 0 0 1-46 0c0-10 7-16 12-23-3 18 8 13 10 6 2-6 1-12 5-19Z" fill="currentColor" stroke="none"/><path d="M62 60c-1 8 9 10 9 18a11 11 0 0 1-22 0c0-6 7-11 13-18Z" fill="white" opacity=".65" stroke="none"/>',
  lessons:'<path d="M35 39q14-5 25 4 11-9 25-4v40q-14-5-25 4-11-9-25-4Zm25 4v40M42 50l10 2m-10 10 10 2m16-12 10-2m-10 14 10-2"/>',
  cases:'<path d="M34 45h18l6 7h28v27H34Zm6 0V35h19l6 7h15v10"/><circle cx="65" cy="65" r="9"/><path d="m72 72 10 12"/>',
  invite:'<circle cx="46" cy="48" r="9"/><circle cx="76" cy="48" r="9"/><path d="M30 78v-6a16 16 0 0 1 32 0v6m0-13a16 16 0 0 1 30 7v6M51 88l9 6 10-6"/>'
};

/** Original vector medallions: leaf crown, sculpted border and numbered ribbon. */
export function badgeSVG(badge,earned=false){
  const p=earned?(palettes[badge.kind]||palettes.lessons):['#e0e4dc','#f2f4ef','#98a294','#c7cec1'];
  return `<svg class="vr-badge-art" viewBox="0 0 120 136" role="img" aria-label="${escape(badge.name)}${earned?', conseguida':', por conseguir'}"><path d="m36 90-9 37 18-8 11 13 7-38m21-4 9 37-18-8-11 13-7-38" fill="${p[3]}" stroke="${p[2]}" stroke-width="2.5" stroke-linejoin="round"/><path d="m60 9 19 9 20 4 4 20 9 19-9 19-4 20-20 4-19 9-19-9-20-4-4-20-9-19 9-19 4-20 20-4Z" fill="${p[0]}" stroke="${p[2]}" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="61" r="40" fill="${p[1]}" stroke="${p[3]}" stroke-width="2"/><path d="M60 21c-11 0-13-7-13-9 9-1 12 3 13 9Zm0 0c10-1 12-8 12-10-8 0-11 4-12 10Z" fill="${p[2]}"/><g fill="none" stroke="currentColor" color="${p[2]}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${marks[badge.kind]||marks.lessons}</g><rect x="35" y="94" width="50" height="22" rx="11" fill="${p[2]}"/><text x="60" y="109.5" fill="white" text-anchor="middle" font-family="Nunito Variable,system-ui,sans-serif" font-weight="900" font-size="13">${escape(badge.mark)}</text>${earned?'<path d="m17 31 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="white"/>':''}</svg>`;
}

export function badgeCatalog(groups=[]){
  const extra=[
    ['first-lesson','Primer paso','Completa tu primera lección.','lessons','1','lessons',1],
    ['lessons-10','Ideas que crecen','Completa 10 lecciones.','lessons','10','lessons',10],
    ['lessons-50','Mirada inversora','Completa 50 lecciones.','lessons','50','lessons',50],
    ['lessons-100','Cien pasos','Completa 100 lecciones.','lessons','100','lessons',100],
    ['lessons-200','Horizonte amplio','Completa 200 lecciones.','lessons','200','lessons',200],
    ['streak-3','La primera chispa','Entra 3 días consecutivos.','streak','3','streak',3],
    ['streak-7','Una semana contigo','Entra 7 días consecutivos.','streak','7','streak',7],
    ['streak-30','Un hábito que prende','Entra 30 días consecutivos.','streak','30','streak',30],
    ['cases-1','De la idea al caso','Completa tu primer caso de estudio.','cases','1','cases',1],
    ['cases-5','Cinco investigaciones','Completa 5 casos de estudio.','cases','5','cases',5],
    ['cases-20','Veinte investigaciones','Completa 20 casos de estudio.','cases','20','cases',20],
    ['invite-1','Aprender en compañía','Un amigo confirma su cuenta y completa una lección con tu invitación.','invite','1','invite',1],
    ['invite-3','Pequeño círculo','Tres amigos completan los requisitos de tu invitación.','invite','3','invite',3],
    ['invite-10','Comunidad curiosa','Diez amigos completan los requisitos de tu invitación.','invite','10','invite',10],
  ].map(([id,name,description,kind,mark,metric,target])=>({id,name,description,kind,mark,metric,target,reward:10}));
  const worlds=Array.from({length:WORLD_COUNT},(_,world)=>{const kind=trackForExam(world).id,n=worldNumber(world),label=trackForExam(world).name;return {id:'world-'+world,name:groups[world]?.short||`${label} · mundo ${n}`,description:`Aprueba el examen del mundo ${n} de ${label}.`,kind,mark:String(n).padStart(2,'0'),metric:'world',world,target:1,reward:10};});
  return [...extra,...worlds];
}

export function earnedBadge(game,id){return Array.isArray(game?.badges)?game.badges.includes(id):Boolean(game?.badges?.[id]);}
export function badgeProgress(badge,snapshot,game,referrals=0){
  const value=badge.metric==='lessons'?Object.keys(snapshot.completed||{}).length:badge.metric==='streak'?(game.bestStreak||game.streak||0):badge.metric==='cases'?Object.keys(snapshot.completedCases||{}).length:badge.metric==='invite'?referrals: snapshot.passedExams?.[badge.world]?.passed?1:0;
  return Math.min(value,badge.target);
}
