(()=>{
'use strict';
const root=document.getElementById('brote-preview');
const main=root.querySelector('#br-main');
const content=window.OchavoCourseContent;
const lessons=content?.lessons||JSON.parse(document.getElementById('br-invest-lessons').textContent);
for(const lesson of lessons)lesson.short??=lesson.title;
const support=JSON.parse(document.getElementById('br-reading-support').textContent);
const course=JSON.parse(document.getElementById('br-course').textContent);
const exams=content?.exams||JSON.parse(document.getElementById('br-exams').textContent);
const cases=JSON.parse(document.getElementById('br-cases')?.textContent||'[]');
const caseKey=c=>'case-'+(c.world+1);
const loadedCases=new Map();
const caseByKey=id=>loadedCases.get(id)||cases.find(c=>caseKey(c)===id);
const hasCaseAccess=()=>game()?.getView().premium===true;
const game=()=>window.virutaGame;
function showGameBlock(view){
 // A balance can be visible from the cache while its session or save is unavailable.
 // Only a confirmed, usable balance of zero is a reason to offer more lives.
 if(view.canSpend===true&&!view.pending&&!view.premium&&(view.totalLives??view.lives)===0)window.virutaSocial?.lives();
 else if(window.virutaSocial?.recovery)window.virutaSocial.recovery();
 else window.virutaSocial?.notify?.('Necesitamos confirmar tu sesión y tu progreso. Reintenta la sincronización desde Mi cuenta.');
}
let gameBusy=false,accessGeneration=0;
// Correct answers may be read and continued while the server confirms their
// reward. The durable draft keeps its UUID, never its passed flag, until then.
let answerJobs=new Map(),answerTail=Promise.resolve();
const previewPassed=d=>answerJobs.get(d)?.status==='saving';
const answerVisible=job=>state.page==='lesson'&&state.active===job.session&&state.active.step===job.step;
function resetAnswerJobs(){answerJobs=new Map();answerTail=Promise.resolve();}
const canLearn=()=>{try{return window.virutaAccess?.canLearn?.()===true;}catch{return false;}};
function accessCurrent(generation=accessGeneration){return canLearn()&&generation===accessGeneration;}
function assertAccess(generation){if(!accessCurrent(generation))throw Error('Tu sesión ha cambiado. Vuelve a acceder antes de continuar.');}
function setCourseBusy(value){gameBusy=value;const phone=root.querySelector('.br-phone');if(phone)phone.inert=value||!canLearn();}
const newAttempt=()=>window.virutaAttemptId?.()||crypto.randomUUID();

const BLOCK_SIZE=course.blockSize,PASS_COUNT=course.examPassCount;
const tracks=course.tracks||[{id:'stocks',name:'Acciones',start:0,count:lessons.length,groupStart:0,groupCount:course.groups.length,icon:'chart-no-axes-combined',tag:'Entiende el negocio detrás de una acción',description:'Aprende a investigar empresas, paso a paso.',story:'Elena y Nébula'}];
const lessonIds=t=>t.lessonIds||Array.from({length:t.count},(_,i)=>t.start+i);
const worldIds=t=>t.groupIds||Array.from({length:t.groupCount},(_,i)=>t.groupStart+i);
const legacyTracks=course.legacyTracks||[];
const allTracks=[...tracks,...legacyTracks];
const activeLesson=id=>tracks.some(t=>lessonIds(t).includes(id));
const activeWorld=id=>tracks.some(t=>worldIds(t).includes(id));
const firstStockWorld=tracks[0].groupStart,firstStockLesson=tracks[0].start;
const freeIntroWorld=tracks[0].freeIntroWorld===true;
const trackOfLesson=id=>allTracks.find(t=>lessonIds(t).includes(id));
const trackOfExam=id=>allTracks.find(t=>worldIds(t).includes(id));
const currentTrack=()=>tracks.find(t=>t.id===state.track)||tracks[0];
const pathGroups=()=>worldIds(currentTrack()).map(id=>groups[id]);
const pathLessons=()=>lessonIds(currentTrack()).map(id=>lessons[id]);
const pointNumber=id=>lessonIds(trackOfLesson(id)).indexOf(id)+1;
const examNumber=id=>worldIds(trackOfExam(id)).indexOf(id)+1;
const previousLesson=id=>lessonIds(trackOfLesson(id))[pointNumber(id)-2];
const nextLesson=id=>lessonIds(trackOfLesson(id))[pointNumber(id)];
const nextWorld=id=>worldIds(trackOfExam(id))[examNumber(id)];
const hasNextWorld=id=>nextWorld(id)!==undefined;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formats=()=>window.OchavoExercises;
const activity=(s,d)=>formats()?.activeActivity(s,d);
const stepText=(s,d,key)=>formats()?.activityText(s,d,key)??s[key];
const rich=v=>esc(v).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\n\n/g,'<br><br>');
function parseNumber(value){let s=String(value).trim().replace(/[\s\u00a0]/g,'');if(!s)return NaN;if(s.includes(',')){if(!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(s))return NaN;s=s.replace(/\./g,'').replace(',','.');}else if(/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');else if(!/^[+-]?\d+(?:\.\d+)?$/.test(s))return NaN;return Number(s);}
const fmt=(n,d=0)=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const mascot=()=>'<div class="br-mascot" aria-hidden="true"><div class="br-leaf"></div><div class="br-leaf other"></div><div class="br-seed"><span class="br-mouth"></span></div></div>';
const groups=course.groups.map((g,i)=>({...g,ids:lessons.filter(l=>Math.floor(l.id/BLOCK_SIZE)===i).map(l=>l.id)}));
const glossary=course.glossary||[...new Map([...support.glossary,...lessons.flatMap(l=>l.steps.flatMap(s=>(s.terms||[]).map(t=>[t.word,t.meaning])))].map(([k,v])=>[k.toLocaleLowerCase('es'),[k,v]])).values()];
const sources=[
 ['Investor.gov · Acciones y bonos','https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products'],
 ['Investor.gov · Diversificación','https://www.investor.gov/introduction-investing/getting-started/asset-allocation'],
 ['Investor.gov · ETF y exposición','https://www.investor.gov/introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2'],
 ['Investor.gov · Impacto de los costes','https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated'],
 ['NYU Stern · Introducción a la valoración','https://pages.stern.nyu.edu/~adamodar/New_Home_Page/background/valintro.htm']
];
for(const source of [...(course.sources||[]),...lessons.flatMap(l=>l.sources||[])]){if(source.url&&!sources.some(([,url])=>url===source.url))sources.push([source.title,source.url]);}
const visualNames={ownership:'Tu parte de Nébula',marketcap:'Cuánto valen juntas las acciones',returns:'Lo que ganas y lo que puedes comprar',drawdown:'Qué subida compensa una caída',diversification:'Repartir el dinero entre negocios',funds:'Qué contiene el fondo',compound:'El tiempo amplifica las diferencias de coste',margins:'De las ventas, cuánto queda',cash:'Vender y cobrar no ocurren a la vez',multiples:'Cuánto pagas por un euro de beneficio',discount:'Qué valen hoy unos cobros futuros',thesis:'Qué tendría que cumplirse para invertir'};
const configs={
 ownership:[['owned','Acciones que compras',1,30,1,10,'de 100']],
 marketcap:[['price','Precio de una acción de Nébula',50,200,5,120,'€']],
 returns:[['sell','Precio al vender',70,140,1,108,'€'],['dividend','Dinero repartido: dividendo',0,10,1,3,'€'],['inflation','Subida de precios: inflación',0,10,.5,3,'%']],
 drawdown:[['drop','Pérdida desde los 100 € iniciales',5,70,5,30,'%']],
 diversification:[['tech','Parte invertida en tecnología',0,100,5,70,'%']],
 compound:[['years','Tiempo que dejas el dinero invertido',1,30,1,20,'años'],['fee','Comisión que pagas cada año',0,2,.1,1.5,'%']],
 margins:[['cost','Todos los costes del período',40,95,1,75,'€']],
 cash:[['collected','Dinero cobrado durante el mes',6,20,.5,10,'mil €']],
 multiples:[['price','Precio de una acción',10,80,2,40,'€']],
 discount:[['rate','Rentabilidad anual que exigirías',4,20,1,8,'%'],['price','Precio que pagarías hoy',250,500,10,320,'€']]
};
let state={introSkipped:false,track:'stocks',activeByTrack:{},examSessions:{},archivedExamSessions:{},mapTargets:{},completedCases:{},caseSessions:{},activeCase:null,page:'map',group:tracks[0].groupStart,completed:{},active:null,sessions:{},passedExams:{},exam:null,examDetail:0,mapTarget:null,detailOrigin:'library'};
let feedback=null,lastPublished='',lastResult=null;
let contentRenderTicket=0,pathObserver=null;
const pathRanges=new Map();
const design={radius:22,companion:true};
function validState(p){return p&&[4,5].includes(p.version)&&p.completed&&typeof p.completed==='object';}
function validSession(a){return a&&lessons[a.id]&&Number.isInteger(a.step)&&a.step>=0&&a.step<lessons[a.id].steps.length&&Array.isArray(a.drafts)&&a.drafts.length===lessons[a.id].steps.length&&a.drafts.every(d=>d&&Array.isArray(d.selected)&&Array.isArray(d.order)&&d.matches&&typeof d.number==='string'&&d.vars);}
function hydrate(p){
 if(!validState(p))return;
 state.track=tracks.some(t=>t.id===p.track)?p.track:'stocks';
 state.introSkipped=p.stocksRevision===tracks[0].revision&&p.introSkipped===true;
 state.completed=Object.fromEntries(Object.entries(p.completed).filter(([k,v])=>lessons[Number(k)]&&v&&typeof v==='object'));
 state.passedExams={};
 if(p.version===5)for(const [k,v] of Object.entries(p.passedExams||{})){if(exams[Number(k)]&&v&&Number.isFinite(v.best)&&v.best>=0&&v.best<=10)state.passedExams[k]={best:v.best,attempts:v.attempts||1,passed:v.best>=PASS_COUNT};}
 state.group=p.version===4?0:(Number.isInteger(p.group)&&groups[p.group]?p.group:0);
 state.page=['map','library','lab','profile','cases'].includes(p.page)?p.page:'map';
 state.completedCases={...p.completedCases};state.caseSessions={};for(const packed of p.caseSessions||[]){try{const a=unpackSession(packed);if(caseByKey(a.id)&&a.drafts.length===6)state.caseSessions[a.id]=a;}catch{}}state.activeCase=state.caseSessions[p.activeCaseId]||null;
 state.mapTarget=typeof p.mapTarget==='string'&&/^br-(point|world|exam)-\d+$/.test(p.mapTarget)?p.mapTarget:null;
 if(state.mapTarget){const [,kind,id]=/^br-(point|world|exam)-(\d+)$/.exec(state.mapTarget);if(!(kind==='point'?lessonIds(currentTrack()):worldIds(currentTrack())).includes(Number(id)))state.mapTarget=null;}
 state.sessions={};
 if(p.version===5){for(const a of p.sessions||[]){try{const x=unpackSession(a);if(validSession(x))state.sessions[x.id]=x;}catch{}}}
 else for(const [k,a] of Object.entries(p.sessions||{}))if(validSession(a))state.sessions[k]=a;
 if(p.version===4&&validSession(p.active))state.sessions[p.active.id]=p.active;

 state.activeByTrack=Object.fromEntries(Object.entries(p.activeByTrack||{}).filter(([track,id])=>tracks.find(t=>t.id===track)?.lessonIds.includes(id)));
 if(activeLesson(p.activeId)&&state.sessions[p.activeId])state.activeByTrack[trackOfLesson(p.activeId).id]=p.activeId;
 state.active=state.sessions[state.activeByTrack[state.track]]||(validSession(p.active)?p.active:null);
 if(state.active&&(!activeLesson(state.active.id)||trackOfLesson(state.active.id)?.id!==state.track))state.active=null;
 if(state.track==='technical'&&state.group===147&&!activeWorld(147))state.group=148;
 if(!activeWorld(state.group)||trackOfExam(state.group)?.id!==state.track)state.group=currentTrack().groupStart;


 state.archivedExamSessions={...p.archivedExamSessions};
 for(const packed of [p.exam,...tracks.map(t=>p.examSessions?.[t.id])])if(packed&&trackOfExam(packed.id)?.archived)state.archivedExamSessions[packed.id]=packed;
 state.examSessions={};
 if(p.version===5){
   for(const t of tracks){const packed=p.examSessions?.[t.id];if(packed){try{const a={...packed,drafts:packed.drafts.map(unpackDraft)};if(validExam(a)&&activeWorld(a.id)&&trackOfExam(a.id)?.id===t.id)state.examSessions[t.id]=a;}catch{}}}
   if(p.exam){try{const a={...p.exam,drafts:p.exam.drafts.map(unpackDraft)};if(validExam(a)&&activeWorld(a.id))state.examSessions[trackOfExam(a.id).id]=a;}catch{}}
 }
 state.exam=state.examSessions[state.track]||null;

}
function currentContentDrafts(meta){const ds=meta.steps.map(()=>emptyDraft());if(meta.editorialRevision)ds[0].vars.contentRevision=meta.editorialRevision;return ds;}
// The unchanged first technical worlds used untagged drafts before 0.26.0.
// Keep those attempts; changed worlds require their exact editorial revision.
function currentDraftRevision(a,meta){const saved=a.drafts?.[0]?.vars?.contentRevision;const unchangedTechnical=!saved&&(meta?.id>=1450&&meta.id<1480||meta?.id>=145&&meta.id<148);return !meta?.editorialRevision||saved===meta.editorialRevision||unchangedTechnical;}
function emptyDraft(){return {choice:null,selected:[],matches:{},order:[],number:'',attempts:0,passed:false,hinted:false,vars:{}};}

function packDraft(d){const p={};if(d.choice!==null)p.c=d.choice;if(d.selected.length)p.s=d.selected;if(Object.keys(d.matches).length)p.m=d.matches;if(d.order.length)p.o=d.order;if(d.number)p.n=d.number;if(d.attempts)p.a=d.attempts;if(d.passed)p.p=1;if(d.hinted)p.h=1;if(d.gameAttemptId)p.q=d.gameAttemptId;if(Object.keys(d.vars).length)p.v=d.vars;return p;}

function unpackDraft(p){return {...emptyDraft(),choice:p.c??null,selected:p.s||[],matches:p.m||{},order:p.o||[],number:p.n||'',attempts:p.a||0,passed:!!p.p,hinted:!!p.h,gameAttemptId:p.q||null,vars:p.v||{}};}

function packSession(a){return [a.id,a.step,a.drafts.map(packDraft)];}

function unpackSession(a){const session={id:a[0],step:a[1],drafts:a[2].map(unpackDraft)},meta=lessons[session.id];if(!currentDraftRevision(session,meta))return {id:session.id,step:0,drafts:currentContentDrafts(meta),restartNotice:true};return session;}

function validExam(a){return a&&exams[a.id]&&currentDraftRevision(a,exams[a.id])&&Number.isInteger(a.step)&&a.step>=0&&a.step<exams[a.id].steps.length&&Array.isArray(a.order)&&a.order.length===10&&new Set(a.order).size===10&&a.order.every(i=>Number.isInteger(i)&&i>=0&&i<10)&&Array.isArray(a.drafts)&&a.drafts.length===10&&a.drafts.every(d=>d&&Array.isArray(d.selected)&&Array.isArray(d.order)&&d.matches&&typeof d.number==='string');}

function inCase(){return state.page==='case-lesson'&&!!state.activeCase;}
function activeSession(){return inCase()?state.activeCase:state.active;}
function activeContent(){return inCase()?caseByKey(state.activeCase.id):lessons[state.active.id];}
function inputLocked(d){return d.passed||!!d.gameAttemptId||!!(inExam()&&state.exam.pendingSubmit);}
function inExam(){return state.page==='exam'&&state.exam&&!state.exam.submitted;}

function worldSkipped(id){return game()?.getView().skippedWorldIds?.includes(id)===true;}
function worldCleared(id){return !!state.passedExams[id]?.passed||worldSkipped(id);}
function blockOpen(group){const t=trackOfExam(group);return !!t&&!t.archived&&worldIds(t).slice(0,worldIds(t).indexOf(group)).every(i=>worldCleared(i));}

// A free introductory shortcut is a learning preference, not a completed lesson or reward.
function introSkipped(id){return state.introSkipped===true&&Number.isInteger(id)&&id>=firstStockLesson&&id<firstStockLesson+6;}
function lessonCovered(id){return !!state.completed[id]||introSkipped(id);}
function introductionMarkup(id){
 if(freeIntroWorld){
  if(id!==firstStockWorld)return '';
  if(worldSkipped(id))return '<p class="br-intro-skip-note">Primer mundo saltado · Puedes volver a sus lecciones y preparar su examen cuando quieras.</p>';
  if(state.passedExams[id]?.passed)return '';
  return `<aside class="br-intro-shortcut" aria-labelledby="br-intro-title"><span class="br-intro-icon" aria-hidden="true">${icon('fast-forward')}</span><div><p class="br-intro-kicker">MUNDO 1 · INTRODUCCIÓN</p><h3 id="br-intro-title">¿Ya conoces lo básico?</h3><p>Este primer mundo es una introducción. Si quieres, puedes saltarlo entero y empezar el mundo 2, en el punto 11.</p><button type="button" class="br-main-button br-intro-skip" data-skip-intro>Saltar primer mundo <span>Gratis</span></button><small>Incluye las 10 lecciones y el paso del examen. Sin gastar gemas. Puedes volver cuando quieras.</small></div></aside>`;
 }
 if(id!==firstStockWorld||worldSkipped(id)||Array.from({length:6},(_,n)=>firstStockLesson+n).every(i=>state.completed[i]))return '';
 if(state.introSkipped)return '<p class="br-intro-skip-note">Introducción saltada · Puedes volver a los puntos 1–6 cuando quieras.</p>';
 return `<aside class="br-intro-shortcut" aria-labelledby="br-intro-title"><span class="br-intro-icon" aria-hidden="true">${icon('fast-forward')}</span><div><p class="br-intro-kicker">PUNTOS 1–6 · INTRODUCCIÓN</p><h3 id="br-intro-title">¿Ya conoces lo básico?</h3><p>Estas seis lecciones son una introducción básica. Si quieres, puedes saltarlas y seguir en el punto 7.</p><button type="button" class="br-main-button br-intro-skip" data-skip-intro>Saltar introducción <span>Gratis</span></button><small>Sin gastar gemas. Puedes volver cuando quieras.</small></div></aside>`;
}
async function skipIntroduction(){
 if(freeIntroWorld){
  if(!canLearn()||gameBusy||state.page!=='map'||state.track!=='stocks'||worldCleared(firstStockWorld))return;
  const generation=accessGeneration;
  setCourseBusy(true);
  try{
   if(!game()?.getView().canSpend||typeof game()?.skipWorld!=='function')throw Error('Necesitas conexión y el progreso sincronizado para guardar este salto gratuito.');
   await game().skipWorld(firstStockWorld);assertAccess(generation);
   state.mapTarget='br-point-'+worldIds(tracks[0])[1]*BLOCK_SIZE;save();render();scrollPathTarget();
   main.querySelector('[data-detail="'+worldIds(tracks[0])[1]*BLOCK_SIZE+'"]')?.focus({preventScroll:true});
   window.virutaSocial?.notify?.('Primer mundo saltado gratis. Continúa en el punto 11.');
  }catch(error){if(accessCurrent(generation)){render();window.virutaSocial?.notify?.(error.message);}}
  finally{if(generation===accessGeneration)setCourseBusy(false);}
  return;
 }
 if(!canLearn()||gameBusy||state.page!=='map'||state.track!=='stocks'||state.introSkipped||worldSkipped(firstStockWorld))return;
 const generation=accessGeneration,oldTarget=state.mapTarget;
 setCourseBusy(true);state.introSkipped=true;state.mapTarget='br-point-'+(firstStockLesson+6);
 try{
   if(save()===false||await window.broteStore?.flushLocal?.()===false)throw Error('No se pudo guardar el salto. Reintenta la sincronización desde Mi cuenta.');
   assertAccess(generation);render();scrollPathTarget();main.querySelector('[data-detail="'+(firstStockLesson+6)+'"]')?.focus({preventScroll:true});
   window.virutaSocial?.notify?.('Introducción saltada gratis. Continúa en el punto 7.');
 }catch(error){
   if(accessCurrent(generation)){state.introSkipped=false;state.mapTarget=oldTarget;save();render();window.virutaSocial?.notify?.(error.message);}
 }finally{if(generation===accessGeneration)setCourseBusy(false);}
}

function lessonOpen(id){const t=trackOfLesson(id);return !!lessons[id]&&!!t&&blockOpen(Math.floor(id/BLOCK_SIZE))&&(lessonCovered(id)||id===groups[Math.floor(id/BLOCK_SIZE)].ids[0]||lessonCovered(previousLesson(id)));}

function matchingOptions(s,d){let right=d.vars.matchOrder;if(!Array.isArray(right)||right.length!==s.pairs.length||new Set(right).size!==s.pairs.length){right=s.pairs.map((_,i)=>i);for(let i=right.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[right[i],right[j]]=[right[j],right[i]];}d.vars.matchOrder=right;}return right;}

function examReady(id){return !!exams[id]&&blockOpen(id)&&groups[id].ids.every(lessonCovered);}

function unlockReason(id){const g=Math.floor(id/BLOCK_SIZE),t=trackOfLesson(id);if(!blockOpen(g)){const gate=worldIds(t).slice(0,worldIds(t).indexOf(g)).find(i=>!worldCleared(i));return 'Aprueba el examen '+examNumber(gate)+' de '+t.name+' o salta ese mundo para abrir este tramo.';}const previous=previousLesson(id);return 'Completa primero el punto '+pointNumber(previous)+': '+lessons[previous].short+'.';}

function examCard(id){const ready=examReady(id),passed=state.passedExams[id]?.passed,n=examNumber(id);return `<button class="br-exam-card cursor-interaction ${passed?'is-passed':ready?'is-ready':''}" data-exam-detail="${id}"><span class="br-exam-medal" aria-hidden="true">${icon(passed?'trophy':ready?'flag':'lock')}</span><span><small>${passed?'Mundo superado':ready?'Tu siguiente reto':'El reto de este mundo'}</small><strong>Examen ${n}</strong><span>${passed?'Aprobado · '+state.passedExams[id].best+'/10':ready?'10 preguntas · necesitas 8 aciertos':id===firstStockWorld&&state.introSkipped?'Completa los puntos 7–10 de este bloque':'Completa las 10 lecciones de este bloque'}</span></span><span class="br-exam-arrow" aria-hidden="true">${icon('chevron-right')}</span></button>`;}

function nextOnPath(){for(const i of worldIds(currentTrack())){if(worldSkipped(i))continue;const id=recommended(i);if(id!==null)return {kind:'lesson',id};if(!state.passedExams[i]?.passed)return {kind:'exam',id:i};}return {kind:'complete'};}

function scrollPathTarget(){const target=state.mapTarget;if(!target)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(state.page==='map'){main.querySelector('#'+target)?.scrollIntoView({block:'center',behavior:'instant'});const range=pathRanges.get(state.track);if(range)rebasePathScroll(range);}}));}

function showPath(target=state.mapTarget){if(!canLearn())return false;pathRanges.delete(state.track);state.page='map';if(target)state.mapTarget=target;feedback=null;render();save();scrollPathTarget();}

function worldMarkup(g,i){
 const next=nextOnPath(),activeIndex=next.kind==='lesson'?g.ids.indexOf(next.id):-1;
 const xs=[50,74,50,26,50,74,50,26,50,74],tops=g.ids.map((_,n)=>44+n*136+(activeIndex>0&&n>=activeIndex?28:0)),ys=tops.map(y=>y+36),path=g.ids.map((_,n)=>n===0?`M ${xs[n]} ${ys[n]}`:`C ${xs[n-1]} ${ys[n-1]+68}, ${xs[n]} ${ys[n]-68}, ${xs[n]} ${ys[n]}`).join(' ');
 const done=g.ids.filter(id=>state.completed[id]).length,skipped=g.ids.filter(id=>introSkipped(id)&&!state.completed[id]).length,passed=state.passedExams[i]?.passed;
 const theme=(examNumber(i)-1+({stocks:0,etfs:1,crypto:3}[currentTrack().id]||0))%5;
 return `<section class="br-world br-world-${theme}" id="br-world-${i}" aria-labelledby="br-world-title-${i}"><header class="br-world-header"><div class="br-world-heading"><span class="br-world-number" aria-hidden="true">${String(examNumber(i)).padStart(2,'0')}</span><div><p class="br-eyebrow">Mundo ${examNumber(i)} · puntos ${pointNumber(g.ids[0])}–${pointNumber(g.ids.at(-1))}</p><h2 id="br-world-title-${i}">${esc(g.title)}</h2></div></div><p class="br-world-intro">${esc(g.sub)}</p><div class="br-world-meter" aria-hidden="true">${g.ids.map(id=>`<span class="${state.completed[id]?'is-filled':introSkipped(id)?'is-skipped':''}"></span>`).join('')}</div><p class="br-world-status">${done}/10 lecciones${skipped?` · ${skipped} saltadas`:""} · ${passed?'examen aprobado':worldSkipped(i)?'mundo saltado':blockOpen(i)?'examen al terminar':'se abre al superar el mundo anterior'}</p>${blockOpen(i)&&!worldCleared(i)&&!(freeIntroWorld&&i===firstStockWorld)?`<button type="button" class="br-world-skip cursor-interaction" data-vr="skip-world" data-value="${i}" aria-label="Saltar mundo ${examNumber(i)} por 200 gemas">${icon('fast-forward')}<span>Saltar mundo</span><span class="br-world-skip-price">${icon('gem')} 200</span></button>`:''}</header>${introductionMarkup(i)}<div class="br-long-path" aria-label="Camino del mundo ${examNumber(i)}"><svg class="br-path-line" viewBox="0 0 100 1440" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 10"/></svg>${pathScenery(i)}${g.ids.map((id,n)=>{
 const complete=!!state.completed[id],open=lessonOpen(id),active=next.kind==='lesson'&&next.id===id&&open;
 return `<div class="br-node ${active?'br-node-next':''}" id="br-point-${id}" style="left:${xs[n]}%">${active?`<span class="br-node-callout" aria-hidden="true">${state.sessions[id]?'Continúa':done?'Siguiente paso':'Empieza aquí'}</span>`:''}<button class="cursor-interaction ${complete?'br-done':open?'br-current':'br-locked'}" data-detail="${id}" aria-label="Punto ${pointNumber(id)}: ${esc(lessons[id].title)}. ${complete?'Completado':introSkipped(id)?'Introducción saltada. Disponible para repasar':open?'Disponible':'Bloqueado'}"><span class="br-node-symbol" aria-hidden="true">${icon(pathLessonIcon(lessons[id]))}</span><span class="br-node-number" aria-hidden="true">${pointNumber(id)}</span>${complete?`<small class="br-node-check" aria-hidden="true">${icon('check')}</small>`:!open?`<small class="br-lock-mark" aria-hidden="true">${icon('lock')}</small>`:''}</button><span class="br-node-label">${esc(lessons[id].short)}${introSkipped(id)&&!complete?'<small class="br-intro-node-note">Saltada</small>':""}</span></div>`;
 }).join('')}</div><div class="br-world-exam" id="br-exam-${i}">${examCard(i)}</div></section>`;
}

// Decorative learning scenes have no controls or rewards; progress keeps its stable IDs.
function pathLessonIcon(lesson){
 const symbols={ownership:'building-2',marketcap:'scale',returns:'coins',drawdown:'chart-no-axes-combined',diversification:'chart-pie',funds:'layers',compound:'sprout',margins:'factory',cash:'coins',multiples:'scale',discount:'hourglass',thesis:'search'};
 const visual=lesson.steps.find(s=>symbols[s.visual])?.visual;
 return symbols[visual]||trackOfLesson(lesson.id).icon;
}
function pathScenery(world){
 const track=trackOfExam(world).id;
 const scene=track==='etfs'?'<rect x="25" y="22" width="55" height="67" rx="9" fill="var(--br-art-accent)" transform="rotate(-12 52 55)"/><rect x="45" y="17" width="55" height="74" rx="9" fill="var(--br-art-paper)" stroke="var(--br-art-ink)" stroke-width="2"/><path d="M55 71V54h9v17m7 0V42h9v29m7 0V32h6v39" fill="var(--br-art-accent)"/><path d="M54 80h38" stroke="var(--br-art-ink)" stroke-width="2"/>':track==='crypto'?'<path d="m36 38 49-8 14 44-63 12Z" fill="none" stroke="var(--br-art-ink)" stroke-width="3"/><path d="m36 38 63 36M85 30 36 86" stroke="var(--br-art-ink)" stroke-width="2"/><rect x="18" y="24" width="31" height="31" rx="9" fill="var(--br-art-accent)"/><rect x="73" y="13" width="28" height="28" rx="8" fill="var(--br-art-paper)" stroke="var(--br-art-ink)" stroke-width="2"/><rect x="23" y="74" width="27" height="27" rx="8" fill="var(--br-art-paper)" stroke="var(--br-art-ink)" stroke-width="2"/><rect x="84" y="61" width="29" height="29" rx="8" fill="var(--br-art-accent)"/>':'<rect x="29" y="46" width="67" height="47" rx="4" fill="var(--br-art-paper)" stroke="var(--br-art-ink)" stroke-width="2"/><path d="M23 47 34 25h57l11 22Z" fill="var(--br-art-accent)"/><path d="M33 47v9m17-9v9m16-9v9m17-9v9m14-9v9" stroke="var(--br-art-ink)" stroke-width="7" stroke-linecap="round"/><path d="M40 93V72h17v21" fill="var(--br-art-accent)"/><rect x="68" y="68" width="16" height="13" rx="2" fill="var(--br-art-accent)"/><path d="M44 17h35" stroke="var(--br-art-ink)" stroke-width="4" stroke-linecap="round"/>';
 return `<div class="br-path-scene br-scene-companion" aria-hidden="true"><span class="br-scene-halo"></span>${mascot()}<span class="br-companion-book"></span><span class="br-scene-spark">✦</span></div><div class="br-path-scene br-scene-topic" aria-hidden="true"><svg viewBox="0 0 130 120"><ellipse cx="65" cy="106" rx="54" ry="9" fill="var(--br-art-ground)"/>${scene}<path d="M112 27v10m-5-5h10" stroke="var(--br-art-ink)" stroke-width="2" stroke-linecap="round"/></svg></div><div class="br-path-scene br-scene-growth" aria-hidden="true"><svg viewBox="0 0 130 120"><ellipse cx="65" cy="105" rx="49" ry="8" fill="var(--br-art-ground)"/><path d="M41 74h50l-6 27H48Z" fill="var(--br-art-accent)"/><rect x="36" y="69" width="60" height="12" rx="5" fill="var(--br-art-paper)" stroke="var(--br-art-ink)" stroke-width="2"/><path d="M66 70V37" stroke="var(--br-art-ink)" stroke-width="4" stroke-linecap="round"/><path d="M65 51C40 53 34 34 34 27c21-2 35 9 31 24Zm2-12c-3-23 10-28 28-27-1 19-10 27-28 27Z" fill="var(--br-art-accent)"/><circle cx="27" cy="67" r="4" fill="var(--br-art-ink)"/><path d="M106 52v10m-5-5h10" stroke="var(--br-art-ink)" stroke-width="2" stroke-linecap="round"/></svg></div>`;
}

function exploreMarkup(x,d){const i=Number.isInteger(d.vars.explore)&&x.options[d.vars.explore]?d.vars.explore:0;const o=x.options[i];return `<div class="br-visual br-explore"><p class="br-viz-title">${esc(x.prompt)}</p><div class="br-tabs">${x.options.map((v,j)=>`<button class="br-tab cursor-interaction" data-explore="${j}" aria-pressed="${i===j}">${esc(v.label)}</button>`).join('')}</div><div aria-live="polite"><h3>${esc(o.title)}</h3><p class="br-body">${rich(o.body)}</p>${o.figure?figureMarkup(o.figure):''}</div></div>`;}

function renderExamDetail(){const id=state.examDetail,e=exams[id],ready=examReady(id),record=state.passedExams[id],pending=state.exam?.id===id&&!state.exam.submitted;main.innerHTML=`<div class="br-page"><button class="br-back cursor-interaction" data-nav="map">← Aprende</button><div class="br-exam-heading"><span class="br-exam-medal" aria-hidden="true">E${examNumber(id)}</span><p class="br-eyebrow">Después de los puntos ${(examNumber(id)-1)*10+1}–${examNumber(id)*10}</p><h1>${esc(e.title)}</h1><p class="br-section-intro">${esc(e.summary)}</p></div><div class="br-exam-rules"><p><strong>10 preguntas · 8 aciertos para aprobar.</strong></p><p>${game()?.getView().premium?'Con Ochavo Plus tienes vidas ilimitadas: los errores no descuentan vidas.':'Cada error descuenta una vida al entregar; primero usamos las diarias y después las compradas. El saldo nunca baja de cero. Necesitas una vida para entregar o iniciar otro intento.'}</p><p>Responde a tu ritmo. Puedes usar una calculadora y volver a las preguntas anteriores. Verás la corrección al entregar las diez.</p><p>${hasNextWorld(id)?'Al aprobar, se abre el siguiente bloque.':'Al aprobar, dejas superado este tramo. El camino seguirá creciendo con nuevas lecciones.'}</p></div>${record?`<p class="br-note">Mejor resultado: ${record.best}/10 · ${record.attempts} ${record.attempts===1?'intento':'intentos'}${record.passed?' · aprobado':''}</p>`:''}${!ready?`<div class="br-takeaway"><strong>Aún falta un paso</strong>${blockOpen(id)?id===firstStockWorld&&state.introSkipped?'Completa los puntos 7–10 antes de hacer el examen.':'Completa las diez lecciones de este bloque antes de hacer el examen.':'Aprueba los exámenes anteriores para llegar hasta aquí.'}</div>`:`<button class="br-main-button br-wide cursor-interaction" data-exam-start="${id}" ${state.exam?.id===id&&state.exam.submitted?'data-new-exam="true"':''}>${pending?'Retomar examen':record?'Volver a intentarlo':'Empezar examen'}</button>`}${state.exam?.id===id&&state.exam.submitted?`<button class="br-link cursor-interaction br-wide" style="margin-top:18px" data-exam-result>Ver última corrección</button>`:''}</div>`;}

function startExam(id,force=false){if(!canLearn())return false;if(!exams[id])return;if(game()&&!game().getView().canPlay&&!(state.exam?.id===id&&state.exam.pendingSubmit&&!force)){showGameBlock(game().getView());return;}if(trackOfExam(id)?.id!==state.track)switchTrack(trackOfExam(id).id);state.mapTarget='br-exam-'+id;if(!examReady(id)){state.examDetail=id;state.page='exam-detail';render();return;}if(force||state.exam?.id!==id||state.exam.submitted){const order=exams[id].steps.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}state.exam={id,step:0,order,drafts:currentContentDrafts(exams[id]),submitted:false,attemptId:newAttempt(),pendingSubmit:false};}state.group=id;state.page='exam';feedback=null;render();save();}

function renderExam(){const a=state.exam;if(!a||a.submitted){state.page=a?'exam-result':'map';render();return;}const s=currentStep(),d=draft();main.innerHTML=`<div class="br-page"><div class="br-lesson-top"><button class="br-back cursor-interaction" data-exit>← Guardar y salir</button><div class="br-progress" role="progressbar" aria-label="Avance del examen" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${a.step}"><span style="width:${a.step*10}%"></span></div><span class="br-counter">${a.step+1} / 10</span></div><p class="br-lesson-title">Examen ${examNumber(a.id)} · ${esc(currentTrack().name)}</p><p class="br-game-tag">Aplica lo que has aprendido</p><h2>${esc(s.title)}</h2><p class="br-body">${rich(s.body)}</p><div id="br-activity">${s.figure?figureMarkup(s.figure):''}${exerciseMarkup(s,d)}</div><div id="br-feedback" aria-live="polite"></div><div class="br-actions"><button class="br-main-button br-wide cursor-interaction" data-exam-next>${a.pendingSubmit?'Reintentar entrega':a.step===9?'Entregar examen':'Guardar respuesta y seguir'}</button><div class="br-action-row">${a.step?'<button class="br-link cursor-interaction" data-exam-prev>← Pregunta anterior</button>':'<span></span>'}<span class="br-note">Corrección al terminar</span></div></div>${reportButton()}</div>`;renderFeedback();}

function advanceExam(){if(!canLearn())return false;if(state.exam.pendingSubmit){if(game())void finishExamWithGame();return;}const s=currentStep(),d=draft();if(!isAnswered(s,d)){feedback={kind:'bad',title:'Completa tu respuesta',text:s.type==='match'?'Relaciona todas las situaciones antes de seguir.':'Deja tu respuesta antes de pasar a la siguiente pregunta.'};renderFeedback();return;}feedback=null;if(state.exam.step<9){state.exam.step++;render();save();return;}if(game())void finishExamWithGame();else finishExam();}

function finishExam(){if(!canLearn())return false;const a=state.exam,e=exams[a.id];if(a.submitted)return;const missing=e.steps.findIndex((s,i)=>!isAnswered(s,a.drafts[i]));if(missing>=0){a.step=a.order.indexOf(missing);render();return;}const score=e.steps.reduce((n,s,i)=>n+(evaluate(s,a.drafts[i])?1:0),0),old=state.passedExams[a.id];a.submitted=true;a.pendingSubmit=false;a.score=score;state.passedExams[a.id]={best:Math.max(old?.best||0,score),attempts:(old?.attempts||0)+1,passed:!!old?.passed||score>=PASS_COUNT};state.page='exam-result';render();save();if(score>=PASS_COUNT)window.OchavoMotion?.milestone('exam');void window.virutaReconcile?.();void window.virutaLessonCompleted?.({kind:'exam',track:currentTrack().id,world_id:a.id,score,passed:score>=PASS_COUNT,attemptId:'exam-'+a.attemptId});}

function answerText(s,d){if(s.type==='choice')return s.options[d.choice]?.text||'Sin respuesta';if(s.type==='multi')return d.selected.map(i=>s.options[i]?.text).join(' · ');if(s.type==='numeric')return d.number+' '+(s.unit||'');if(s.type==='order')return d.order.map(i=>s.items[i]).join(' → ');if(s.type==='match')return s.pairs.map((p,i)=>p.left+' → '+(s.pairs[Number(d.matches[i])]?.right||'Sin respuesta')).join(' · ');return '';}

function renderExamResult(){const a=state.exam;if(!a?.submitted){state.page='map';renderMap();return;}const e=exams[a.id],passed=a.score>=PASS_COUNT,wrong=e.steps.map((s,i)=>evaluate(s,a.drafts[i])?-1:i).filter(i=>i>=0);const review=[...new Set(wrong.map(i=>e.steps[i].reviewLesson))];main.innerHTML=`<div class="br-page"><p class="br-eyebrow">Examen ${examNumber(a.id)} · resultado</p><h1>${passed?'Un bloque más<br>afianzado.':'Repasa y vuelve<br>a intentarlo.'}</h1><div class="br-exam-score ${passed?'is-passed':''}"><strong>${a.score}<small> / 10</small></strong><span>${passed?'Examen aprobado':'Necesitas 8 aciertos'}</span></div><p class="br-section-intro">${passed?hasNextWorld(a.id)?'Ya puedes entrar en el siguiente bloque.':'Has superado el bloque '+examNumber(a.id)+'. El punto '+currentTrack().count+' deja el camino abierto: seguirá habiendo nuevas ideas que aprender.':state.passedExams[a.id]?.passed?'Este intento queda por debajo de 8; conservas el acceso que ya habías desbloqueado.':'Tu progreso en las lecciones se conserva. Revisa las explicaciones y repite el examen cuando quieras.'}</p><div id="ochavo-result-ad" class="och-result-ad" hidden></div>${passed&&hasNextWorld(a.id)?`<button class="br-main-button br-wide cursor-interaction" data-group="${nextWorld(a.id)}">Continuar al mundo ${examNumber(a.id)+1}</button>`:`<button class="br-main-button br-wide cursor-interaction" data-exam-start="${a.id}" data-new-exam="true">${passed?'Volver a practicar':'Repetir examen'}</button>`}<button class="br-secondary br-wide cursor-interaction" style="margin-top:12px" data-nav="map">Volver a Aprende</button>${review.length?`<div class="br-review-links"><h3>Ideas que conviene repasar</h3>${review.map(id=>`<button class="br-link cursor-interaction" data-detail="${id}">Punto ${pointNumber(id)}: ${esc(lessons[id].short)}</button>`).join('')}</div>`:''}<h3 style="margin-top:26px">La corrección, pregunta a pregunta</h3><div class="br-exam-corrections">${a.order.map((i,n)=>{const s=e.steps[i],good=!wrong.includes(i);return `<details><summary class="cursor-interaction"><span>${good?'✓':'↻'} ${n+1}. ${esc(s.title)}</span><small>${good?'Correcta':'Para repasar'}</small></summary><p class="br-note"><strong>Tu respuesta:</strong> ${esc(answerText(s,a.drafts[i]))}</p><p class="br-body">${rich(s.explanation)}</p></details>`;}).join('')}</div></div>`;}

hydrate(window.broteStore?.getSnapshot());
function save(){
 if(!canLearn())return false;
 if(state.active){state.sessions[state.active.id]=state.active;state.activeByTrack[state.track]=state.active.id;}else delete state.activeByTrack[state.track];
 if(state.exam)state.examSessions[state.track]=state.exam;else delete state.examSessions[state.track];
 if(state.mapTarget)state.mapTargets[state.track]=state.mapTarget;
 if(state.activeCase)state.caseSessions[state.activeCase.id]=state.activeCase;
 const examSessions=Object.fromEntries(Object.entries(state.examSessions).map(([key,a])=>[key,{...a,drafts:a.drafts.map(packDraft)}]));
 const p={version:5,stocksRevision:tracks[0].revision,introSkipped:state.introSkipped===true,track:state.track,page:['map','library','lab','profile','cases'].includes(state.page)?state.page:inCase()?'cases':'map',group:state.group,mapTarget:state.mapTarget,completed:state.completed,sessions:Object.values(state.sessions).map(packSession),activeId:state.active?.id??null,activeByTrack:state.activeByTrack,passedExams:state.passedExams,exam:examSessions[state.track]||null,examSessions,archivedExamSessions:state.archivedExamSessions,completedCases:state.completedCases,caseSessions:Object.values(state.caseSessions).map(packSession),activeCaseId:state.activeCase?.id??null};
 if(new TextEncoder().encode(JSON.stringify(p)).length>30000){const active=new Set(Object.values(state.activeByTrack));p.sessions=p.sessions.filter(a=>!state.completed[a[0]]||active.has(a[0]));}
 lastPublished=JSON.stringify(p);return window.broteStore?.save(p)??false;
}
function switchTrack(id){if(!canLearn())return false;
 const target=tracks.find(t=>t.id===id);if(!target||id===state.track)return;
 flushInputs();state.track=id;pathRanges.delete(id);state.group=target.groupStart;
 state.active=state.sessions[state.activeByTrack[id]]||Object.values(state.sessions).filter(a=>target.lessonIds.includes(a.id)&&!state.completed[a.id]).at(-1)||null;
 state.exam=state.examSessions[id]||null;state.mapTarget=state.mapTargets[id]||null;
 state.page='map';feedback=null;render();save();
 main.querySelector(`[data-track="${id}"]`)?.focus({preventScroll:true});
}
function trackSelector(showNote=true){return `<section class="br-track-picker" aria-label="Elige tu camino"><div class="br-track-intro"><h2>Elige tu camino</h2><p>Cuatro caminos para aprender. Elige el tuyo.</p></div><div class="br-track-options">${tracks.map(t=>{const done=Object.keys(state.completed).filter(id=>t.lessonIds.includes(Number(id))).length,passed=Object.entries(state.passedExams).filter(([id,v])=>v.passed&&t.groupIds.includes(Number(id))).length;return `<button class="br-track-card cursor-interaction ${t.id===state.track?'is-selected':''}" data-track="${t.id}" aria-pressed="${t.id===state.track}" aria-label="${t.name}: ${done} de ${t.count} puntos, ${passed} de ${t.groupCount} exámenes aprobados"><span class="br-track-icon" aria-hidden="true">${icon(t.icon)}</span><strong>${t.name}</strong><span class="br-track-count">${done} / ${t.count} puntos</span><span class="br-track-meter" aria-hidden="true"><i style="width:${done/t.count*100}%"></i></span><small>${t.groupCount} exámenes</small></button>`;}).join('')}</div>${showNote?'<p class="br-track-note">Puedes cambiar cuando quieras. Cada camino conserva su avance.</p>':''}</section>`;}

function icons(){globalThis.lucide?.createIcons({attrs:{width:20,height:20}});}
function focusNext(){main.querySelector('[data-next], [data-check], [data-nav="map"]')?.focus({preventScroll:true});}
function draft(){return inExam()?state.exam.drafts[state.exam.order[state.exam.step]]:activeSession().drafts[activeSession().step];}
function currentStep(){return inExam()?exams[state.exam.id].steps[state.exam.order[state.exam.step]]:activeContent().steps[activeSession().step];}
function reportContext(){
 const isLesson=state.page==='lesson',isTest=inExam(),isStudy=inCase();
 const lessonId=isLesson?state.active.id:state.page==='detail'?state.detail:-1;
 const worldId=isTest||state.page==='exam-result'?state.exam.id:state.page==='exam-detail'?state.examDetail:isStudy?activeContent().world:lessonId>=0?Math.floor(lessonId/BLOCK_SIZE):-1;
 const track=trackOfExam(worldId)||currentTrack();
 const s=isLesson||isTest||isStudy?currentStep():null,d=s?draft():null;
 return {page:state.page,track:track.id,lessonId,worldId,
  stepIndex:isTest?state.exam.step:isLesson||isStudy?activeSession().step:-1,
  stepCount:isTest?10:isLesson||isStudy?activeContent().steps.length:0,
  questionIndex:isTest?state.exam.order[state.exam.step]:-1,
  exerciseKind:s?(activity(s,d)?.kind||s.type):''};
}
const reportButton=()=>'<button type="button" class="br-report-link" data-report-problem>Informar de un problema</button>';
function recommended(group=state.group){return groups[group].ids.find(id=>!lessonCovered(id))??null;}
function repeatsLessonIntroduction(lesson){
 const normalize=text=>String(text||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
 const introduction=normalize(lesson?.summary),first=lesson?.steps?.[0];
 return !!introduction&&first?.type==='learn'&&normalize(first.body).includes(introduction);
}
function render(){
 const ticket=++contentRenderTicket;
 const previousPage=main.dataset.view;
 // Invalidate a result before replacing it, including content-loading and
 // locked branches that return before the normal renderer runs.
 if(['success','exam-result'].includes(previousPage)&&(previousPage!==state.page||!canLearn()))window.virutaLeaveResult?.();
 if(state.page!=='map'||!canLearn()){pathObserver?.disconnect();pathObserver=null;}
 const needed=state.page==='detail'?Math.floor(state.detail/BLOCK_SIZE):state.page==='lesson'||state.page==='success'?Math.floor((state.active?.id??lastResult?.id)/BLOCK_SIZE):state.page==='exam-detail'?state.examDetail:['exam','exam-result'].includes(state.page)?state.exam?.id:null;
 if(canLearn()&&Number.isInteger(needed)&&content&&!content.hasWorld(needed)){
   const page=state.page,generation=accessGeneration;
   main.dataset.view='content-loading';
   main.innerHTML='<div class="br-page br-content-loading"><button class="br-back" data-nav="map">← Aprende</button><p role="status">Preparando este mundo…</p></div>';
   content.ensureWorld(needed).then(()=>{if(ticket===contentRenderTicket&&accessCurrent(generation)&&state.page===page)render();},()=>{
     if(ticket===contentRenderTicket&&accessCurrent(generation)&&state.page===page)main.innerHTML='<div class="br-page br-content-loading"><button class="br-back" data-nav="map">← Aprende</button><p role="alert">No se pudo cargar este mundo. Comprueba la conexión y vuelve a intentarlo. Tu progreso se conserva.</p><button class="br-secondary" data-content-retry>Reintentar</button></div>';
   });
   return;
 }
window.speechSynthesis?.cancel();if(state.page==='library')state.page='map';
 if(!canLearn()){loadedCases.clear();main.innerHTML='';main.dataset.view='locked';root.querySelector('.br-nav').hidden=true;return;}
 // Decide after the world has loaded: metadata alone cannot tell whether
 // the introduction repeats the first explanation. Use the normal start
 // route so saved attempts and progression checks stay intact.
 if(state.page==='detail'&&lessonOpen(state.detail)&&repeatsLessonIntroduction(lessons[state.detail])){start(state.detail);return;}
 if(inCase()&&!loadedCases.has(state.activeCase.id))state.page='cases';
 if((inCase()||state.page==='case-success')&&!hasCaseAccess()){state.page='cases';feedback=null;loadedCases.clear();}
 if(state.page==='map'&&previousPage!=='map')pathRanges.delete(state.track);if(state.page==='lab'&&previousPage!=='lab')window.OchavoLaboratory?.reset();main.dataset.view=state.page;
 const done=pathLessons().filter(l=>state.completed[l.id]).length,passed=Object.values(state.passedExams).filter(v=>v.passed).length;
 root.querySelector('#br-xp').textContent=Object.keys(state.completed).length*40+passed*100;
 root.querySelector('#br-completed').textContent=done+' / '+currentTrack().count;
 root.querySelector('#br-completed').setAttribute('aria-label',done+' de '+currentTrack().count+' puntos de '+currentTrack().name+' completados');
 root.querySelector('.br-nav').hidden=['lesson','success','exam','exam-result','case-lesson','case-success'].includes(state.page);
 root.querySelectorAll('.br-nav button').forEach(b=>{const page=['detail','glossary','sources','exam-detail'].includes(state.page)?'map':state.page;b.removeAttribute('aria-current');if(b.dataset.nav===page)b.setAttribute('aria-current','page');});
 const renderers={profile:()=>window.virutaSocial?.render('profile'),cases:()=>window.virutaSocial?.render('cases'),'case-lesson':renderLesson,'case-success':renderCaseSuccess,map:renderMap,detail:renderDetail,lesson:renderLesson,lab:renderLab,success:renderSuccess,glossary:renderGlossary,sources:renderSources,'exam-detail':renderExamDetail,exam:renderExam,'exam-result':renderExamResult};
 (renderers[state.page]||renderMap)();icons();void window.OchavoAnalytics?.view({page:state.page,track:currentTrack().id,lesson_id:state.active?.id,world_id:state.exam?.id,case_id:state.activeCase?.id});
 window.OchavoRewards?.onPage(state.page);
 if(previousPage!==state.page&&['profile','cases','case-lesson','case-success'].includes(state.page)||previousPage==='map'&&state.page!=='map')requestAnimationFrame(()=>requestAnimationFrame(()=>{if(state.page!=='map')root.querySelector('.br-phone').scrollIntoView({block:'start',behavior:'instant'});}));
}
function pathRange(){
 const ids=worldIds(currentTrack()),match=state.mapTarget?.match(/^br-(point|world|exam)-(\d+)$/);
 const next=nextOnPath(),target=match?(match[1]==='point'?Math.floor(Number(match[2])/BLOCK_SIZE):Number(match[2])):next.kind==='lesson'?Math.floor(next.id/BLOCK_SIZE):next.kind==='exam'?next.id:ids.at(-1);
 const index=Math.max(0,ids.indexOf(target));let range=pathRanges.get(state.track);
 if(!range||match&&(index<range.start||index>=range.end)){
   const start=Math.min(Math.floor(index/2)*2,Math.max(0,ids.length-2));range={track:state.track,start,end:Math.min(start+2,ids.length),busy:false,error:false,ready:false,scrollArmed:false,lastScrollY:pathScrollY()};pathRanges.set(state.track,range);
 }
 return range;
}
function pathCurrent(range){return canLearn()&&state.page==='map'&&state.track===range.track&&pathRanges.get(range.track)===range;}
function pathScrollY(){return Number(window.scrollY)||0;}
function rebasePathScroll(range){range.scrollArmed=false;range.lastScrollY=pathScrollY();}
function pathNearEnd(){const rect=main.querySelector('[data-path-sentinel]')?.getBoundingClientRect?.();return rect&&rect.top<=(window.innerHeight||0)+200&&rect.bottom>=0;}
// An observer's initial notification or a re-render is not a request to load
// more. Only a fresh downward scroll can arm the next automatic pair.
window.addEventListener?.('scroll',()=>{
 const range=pathRanges.get(state.track);if(!range||!pathCurrent(range))return;
 const position=pathScrollY(),down=position>range.lastScrollY;range.lastScrollY=position;
 if(!down){range.scrollArmed=false;return;}range.scrollArmed=true;
 requestAnimationFrame(()=>{if(pathCurrent(range)&&range.scrollArmed&&range.ready&&!range.busy&&!range.error&&pathNearEnd())void extendPath('next');});
},{passive:true});
function pathFooter(range){
 const more=range.end<worldIds(currentTrack()).length;
 if(range.error)return '<p role="status">No se han podido cargar los mundos. Revisa la conexión; tu progreso se conserva.</p><button class="br-link" data-path-retry>Reintentar carga</button>';
 if(range.busy)return '<p role="status">Cargando mundos…</p>';
 if(more)return '<button class="br-link" data-path-next>Cargar dos mundos más</button>';
 return `<div class="br-to-be-continued"><strong>El camino continúa.</strong><p>Este tramo llega al punto ${currentTrack().count} de ${esc(currentTrack().name)}. Seguiremos ampliándolo, con espacio para entender cada nueva idea.</p></div><p class="br-simulation-note">Casos ficticios para aprender. No son previsiones.</p>`;
}
function pathPrevious(range){return range.start>0?`<button class="br-link" data-path-previous ${range.busy?'disabled':''}>Ver mundos anteriores</button>`:'';}
function updatePathControls(range){
 if(!pathCurrent(range))return;
 const footer=main.querySelector('[data-path-sentinel]'),previous=main.querySelector('[data-path-before]');
 if(footer)footer.innerHTML=pathFooter(range);if(previous)previous.innerHTML=pathPrevious(range);
 pathObserver?.disconnect();pathObserver=null;
 if(!range.busy&&!range.error&&range.ready&&range.end<worldIds(currentTrack()).length&&typeof IntersectionObserver==='function'&&footer){
   const observer=new IntersectionObserver(entries=>{if(pathObserver===observer&&range.scrollArmed&&entries.some(e=>e.isIntersecting&&e.target===main.querySelector('[data-path-sentinel]'))&&pathCurrent(range)&&pathNearEnd())void extendPath('next');},{rootMargin:'200px 0px',threshold:0});
   pathObserver=observer;observer.observe(footer);
 }
}
async function preparePath(range){
 if(range.busy||range.ready||!pathCurrent(range))return;
 if(!content){range.ready=true;updatePathControls(range);return;}
 range.busy=true;range.error=false;updatePathControls(range);
 try{await content.ensureWorlds(worldIds(currentTrack()).slice(range.start,range.end));range.ready=true;}
 catch{range.error=true;range.failedDirection=null;}
 finally{range.busy=false;updatePathControls(range);}
}
async function extendPath(direction,manual=false){
 const range=pathRange(),ids=worldIds(currentTrack());
 if(!pathCurrent(range)||range.busy||range.error)return;
 if(!range.ready){await preparePath(range);if(!range.ready||!pathCurrent(range))return;}
 const start=direction==='previous'?Math.max(0,range.start-2):range.end;
 const end=direction==='previous'?range.start:Math.min(ids.length,range.end+2);
 if(start===end)return;
 range.busy=true;rebasePathScroll(range);updatePathControls(range);
 try{
   await content?.ensureWorlds(ids.slice(start,end));
   if(!pathCurrent(range))return;
   const first=main.querySelector('#br-world-'+ids[range.start]),oldTop=first?.getBoundingClientRect?.().top;
   const markup=ids.slice(start,end).map(id=>worldMarkup(groups[id],id)).join('');
   main.querySelector('.br-worlds')?.insertAdjacentHTML(direction==='previous'?'afterbegin':'beforeend',markup);
   if(direction==='previous')range.start=start;else range.end=end;
   rebasePathScroll(range);
   icons();
   if(direction==='previous'&&Number.isFinite(oldTop)&&typeof window.scrollBy==='function')window.scrollBy(0,first.getBoundingClientRect().top-oldTop);
 }catch{if(pathCurrent(range)){range.error=true;range.failedDirection=direction;}}
 finally{
   range.busy=false;updatePathControls(range);
   if(manual&&pathCurrent(range))main.querySelector(direction==='previous'?'[data-path-previous]':'[data-path-next]')?.focus({preventScroll:true});
 }
}
function renderMap(){
 const range=pathRange(),ids=worldIds(currentTrack());
 rebasePathScroll(range);
 pathObserver?.disconnect();pathObserver=null;
 main.innerHTML=`<div class="br-page br-continuous-map">${trackSelector(false)}<div class="br-path-before" data-path-before>${pathPrevious(range)}</div><div class="br-worlds">${ids.slice(range.start,range.end).map(id=>worldMarkup(groups[id],id)).join('')}</div><div class="br-path-loader" data-path-sentinel>${pathFooter(range)}</div></div>`;
 updatePathControls(range);void preparePath(range);
}

function groupTabs(){const t=currentTrack();return `<div class="br-tabs br-block-tabs" aria-label="Bloques del camino">${pathGroups().map((g,i)=>`<button class="br-tab cursor-interaction" data-library-group="${worldIds(t)[i]}" aria-pressed="${worldIds(t)[i]===state.group}">${pointNumber(g.ids[0])}–${pointNumber(g.ids.at(-1))}</button>`).join('')}</div>`;}

function storyMarkup(l,compact=false){if(compact&&l.story.hideDuringPractice)return '';return `<div class="br-story ${compact?'br-story-compact':''}"><p class="br-eyebrow">${esc(trackOfLesson(l.id).story)} · ${esc(l.story.scene)}</p><p>${esc(l.story.text)}</p></div>`;}
function readingHelp(l,index){const step=l.steps[index];const entries=new Map();for(const s of l.steps.slice(0,index+1))for(const t of s.terms||[])entries.set(t.word,t.meaning);const previous=index>0?l.steps[index-1]:null;return `<div class="br-reading-help">${step.type!=='learn'&&previous?.type==='learn'?`<details class="br-recap"><summary class="cursor-interaction">Volver a la explicación</summary><h3>${esc(previous.title)}</h3><p>${rich(previous.body)}</p>${previous.takeaway?`<p class="br-recap-key">${esc(previous.takeaway)}</p>`:''}</details>`:''}${entries.size?`<details class="br-terms"><summary class="cursor-interaction">Recordar estas palabras <span>${entries.size}</span></summary><dl>${[...entries].map(([word,meaning])=>`<dt>${esc(word)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl></details>`:''}</div>`;}
function renderDetail(){const l=lessons[state.detail];if(!l){state.page='map';renderMap();return;}const previous=l.prerequisites.map(id=>lessons[id]),open=lessonOpen(l.id);main.innerHTML=`<div class="br-page br-level-detail"><button class="br-back cursor-interaction" data-nav="map">← Aprende</button><div class="br-detail-box"><p class="br-eyebrow">Punto ${pointNumber(l.id)} · ${l.minutes} minutos</p><h1>${esc(l.title)}</h1><p>${esc(l.summary)}</p></div>${open?storyMarkup(l):''}${previous.length?`<details class="br-prerequisites"><summary class="cursor-interaction">Lo que ya has aprendido</summary>${previous.map(p=>`<p>${esc(p.takeaway)}</p><button class="br-link cursor-interaction" data-detail="${p.id}">Repasar: ${esc(p.short)}</button>`).join('')}</details>`:''}<div class="br-takeaway"><strong>${open?'Al terminar podrás explicar':'Este punto te espera'}</strong>${esc(open?l.takeaway:unlockReason(l.id))}</div>${open?`<p class="br-note">${l.steps.some(step=>step.growthLab)?'Cuatro ideas para explorar, con simulaciones y un reto después de cada explicación.':'Cuatro explicaciones breves, cada una seguida de un reto.'}</p><button style="margin-top:20px" class="br-main-button br-wide cursor-interaction" data-start="${l.id}">${state.sessions[l.id]?'Retomar el capítulo':state.completed[l.id]?'Volver a recorrerlo':'Empezar la lección'}</button>`:'<button class="br-main-button br-wide cursor-interaction" style="margin-top:20px" data-nav="map">Volver a Aprende</button>'}</div>`;}
function start(id){if(!canLearn())return false;if(!lessons[id])return;if(trackOfLesson(id)?.id!==state.track)switchTrack(trackOfLesson(id).id);state.mapTarget='br-point-'+id;if(!lessonOpen(id)){state.detail=id;state.page='detail';render();return;}if(state.active)state.sessions[state.active.id]=state.active;state.active=state.sessions[id]||{id,step:0,drafts:currentContentDrafts(lessons[id])};if(state.active.restartNotice){window.virutaSocial?.notify?.('Hemos actualizado las explicaciones de este punto. Empieza de nuevo este intento; tus puntos completados, exámenes y recompensas se conservan.');delete state.active.restartNotice;}state.group=Math.floor(id/BLOCK_SIZE);state.page='lesson';feedback=null;render();save();main.querySelector('[data-exit]')?.focus({preventScroll:true});}
function learnVisual(type){return type&&type!=='none'&&visualNames[type];}
function exampleSourceMarkup(step){
 if(!step.sources?.length)return '';
 return `<details class="br-terms"><summary class="cursor-interaction">${esc(step.sourceLabel||'Ver fuentes del ejemplo real')}</summary><div class="br-source-list">${step.sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><p class="br-note">${esc(source.period||'')}</p>`).join('')}</div></details>`;
}
function practiceContextMarkup(lesson,step){
 if(step.type==='learn'||!lesson.practiceContext)return '';
 return `<p class="br-note">${lesson.practiceContext==='real-identification'?'Identificadores y clases reales · Sin precios actuales':'Práctica con un caso ficticio, distinto de la empresa del ejemplo real'}</p>`;
}
function renderLesson(){const l=activeContent(),s=currentStep(),d=draft(),count=l.steps.length;const labels={learn:'Entiende la idea',choice:'Tu decisión',multi:'Qué puedes concluir',match:'Conecta estas ideas',order:'Ordena los pasos',numeric:'Pon números a la decisión'};
 main.innerHTML=`<div class="br-page"><div class="br-lesson-top"><button class="br-back cursor-interaction" data-exit>← Salir</button><div class="br-progress" role="progressbar" aria-label="Avance del capítulo" aria-valuemin="0" aria-valuemax="${count}" aria-valuenow="${activeSession().step}"><span style="width:${activeSession().step/count*100}%"></span></div><span class="br-counter">${activeSession().step+1} / ${count}</span></div><p class="br-lesson-title">${inCase()?'Caso de estudio · '+esc(l.company):esc(currentTrack().name)+' · capítulo '+pointNumber(l.id)} · ${esc(l.title)}</p>${inCase()?'<p class="vr-case-source-label">'+esc(l.period)+' · Sin gastar vidas</p>':activeSession().step===0?storyMarkup(l,true):''}<p class="br-game-tag">${activity(s,d)?formats().FORMAT_LABELS[activity(s,d).kind]:labels[s.type]}</p><h2>${esc(stepText(s,d,'title'))}</h2><p class="br-body">${rich(stepText(s,d,'prompt')??s.body)}</p>${practiceContextMarkup(l,s)}<div class="br-activity" id="br-activity"></div>${readingHelp(l,activeSession().step)}<div id="br-feedback" aria-live="polite"></div><div id="br-actions" class="br-actions"></div>${reportButton()}</div>`;
 const activityElement=main.querySelector('#br-activity');
 if(s.type==='learn'&&s.laboratoryLink?.tool==='recovery')main.querySelector('.br-body')?.insertAdjacentHTML('afterend',`<p class="br-note"><a class="br-lab-link" href="#laboratorio-recuperacion" data-lesson-tool="recovery">${esc(s.laboratoryLink.label)}</a></p>`);
 if(s.type==='learn'){activityElement.innerHTML=`${s.figure?figureMarkup(s.figure):''}${s.explore?exploreMarkup(s.explore,d):''}${s.growthLab?window.OchavoGrowthLab?.render(s.growthLab)||'':''}${learnVisual(s.visual)?visualMarkup(s.visual,d.vars):''}${exampleSourceMarkup(s)}${s.takeaway?`<div class="br-takeaway"><strong>La idea clave</strong>${esc(s.takeaway)}</div>`:''}`;if(learnVisual(s.visual))updateVisual(s.visual,d.vars);}
 else activityElement.innerHTML=(s.figure&&!activity(s,d)?.hideFigure?figureMarkup(s.figure):'')+exerciseMarkup(s,d);
 if((d.passed||previewPassed(d))&&s.type!=='learn')feedback={kind:'good',title:'Así encajan las piezas',text:stepText(s,d,'explanation')};
 renderFeedback();renderActions();if(d.gameAttemptId&&!previewPassed(d))main.querySelector('#br-actions').insertAdjacentHTML('afterbegin','<p class="vr-pending-note">Falta confirmar este intento. Reintenta con la misma respuesta; conservamos su identificador para evitar duplicados.</p>');
}
function exerciseMarkup(s,d){
 const calculator=s.type==='numeric'||s.calculator===true||activity(s,d)?.kind==='hotspot'?(window.OchavoCalculator?.render({allowUse:s.type==='numeric'})||''):'';
 return exerciseMarkupContent(s,d)+calculator;
}
function exerciseMarkupContent(s,d){
 const a=activity(s,d);if(a)return formats().activityMarkup(a,d,inputLocked(d));
 if(s.type==='choice'||s.type==='multi')return `${s.type==='multi'?'<p class="br-select-instruction">Puede haber varias respuestas correctas. Selecciona todas las que correspondan.</p>':''}<div class="br-choice-list">${s.options.map((o,i)=>`<button class="br-choice cursor-interaction" data-option="${i}" aria-pressed="${s.type==='choice'?d.choice===i:d.selected.includes(i)}" ${inputLocked(d)?'disabled':''}><span class="br-option-letter">${s.type==='multi'?(d.selected.includes(i)?'✓':'+'):String.fromCharCode(65+i)}</span><span>${esc(o.text)}${o.detail?`<small>${esc(o.detail)}</small>`:''}</span></button>`).join('')}</div>`;
 if(s.type==='match'){const right=matchingOptions(s,d);if(s.matchStyle==='arrows'&&window.OchavoMatchArrows)return window.OchavoMatchArrows.matchArrowsMarkup(s,d,right,inputLocked(d));return '<p class="br-select-instruction">Elige la relación que corresponde a cada concepto.</p>'+s.pairs.map((p,i)=>`<div class="br-match-row"><label for="br-match-${i}">${esc(p.left)}</label><select id="br-match-${i}" data-match="${i}" aria-describedby="br-match-full-${i}" ${inputLocked(d)?'disabled':''}><option value="">Selecciona una relación</option>${right.map(j=>`<option value="${j}" ${Number(d.matches[i])===j&&d.matches[i]!==undefined&&d.matches[i]!==''?'selected':''}>${esc(s.pairs[j].right)}</option>`).join('')}</select><p class="br-note" id="br-match-full-${i}" style="margin-top:0">${d.matches[i]!==undefined&&d.matches[i]!==''?esc(s.pairs[Number(d.matches[i])].right):''}</p></div>`).join('');}
 if(s.type==='order'){if(d.order.length!==s.items.length)d.order=s.items.map((_,i)=>i);return '<p class="br-select-instruction">Mueve las tarjetas con las flechas. El primer paso va arriba.</p><div id="br-order-list">'+d.order.map((idx,pos)=>`<div class="br-order-row"><b class="br-order-num">${pos+1}</b><span>${esc(s.items[idx])}</span><div class="br-order-controls"><button class="cursor-interaction" data-move="${pos}" data-direction="-1" aria-label="Subir: ${esc(s.items[idx])}" ${inputLocked(d)||pos===0?'disabled':''}>↑</button><button class="cursor-interaction" data-move="${pos}" data-direction="1" aria-label="Bajar: ${esc(s.items[idx])}" ${inputLocked(d)||pos===d.order.length-1?'disabled':''}>↓</button></div></div>`).join('')+'</div>';}
 if(s.type==='numeric')return `<label class="br-slider-label" for="br-number">Tu respuesta${s.tolerance?`<span class="br-muted">Aproxima si hace falta</span>`:''}</label><div class="br-number-wrap">${s.prefix?`<span>${esc(s.prefix)}</span>`:''}<input id="br-number" type="text" inputmode="decimal" autocomplete="off" maxlength="32" value="${esc(d.number)}" placeholder="Escribe el resultado" aria-label="Respuesta en ${esc(s.unit||'unidades')}" ${inputLocked(d)?'disabled':''}><span>${esc(s.unit||'')}</span></div><p class="br-note">Aquí importa comprender el resultado. Puedes desplegar la calculadora para hacer la cuenta.</p>`;
 return '';
}
function renderFeedback(){const el=main.querySelector('#br-feedback');if(!el)return;el.innerHTML=feedback?`<div class="br-feedback ${feedback.kind==='bad'?'is-error':feedback.kind==='hint'?'is-hint':''}"><strong>${esc(feedback.title)}</strong><p>${rich(feedback.text)}</p></div>`:'';}
function renderActions(){const s=currentStep(),d=draft();main.querySelector('#br-actions').innerHTML=`${s.type==='learn'||d.passed||previewPassed(d)?`<button class="br-main-button br-wide cursor-interaction" data-next>${activeSession().step===activeContent().steps.length-1?'Completar nivel':s.type==='learn'?'Vamos al reto':'Continuar'}</button>`:`<button class="br-main-button br-wide cursor-interaction" data-check>${d.gameAttemptId?'Reintentar comprobación':'Comprobar respuesta'}</button>`}<div class="br-action-row">${activeSession().step>0?'<button class="br-link cursor-interaction" data-prev>← Paso anterior</button>':'<span></span>'}${s.type!=='learn'&&!d.passed&&!previewPassed(d)?'<button class="br-link cursor-interaction" data-hint>Una pista</button>':'<span></span>'}</div>`;}
function isAnswered(s,d){const a=activity(s,d);if(a)return formats().activityAnswered(a,d);if(s.type==='choice')return d.choice!==null;if(s.type==='multi')return d.selected.length>0;if(s.type==='match')return s.pairs.every((_,i)=>d.matches[i]!==undefined&&d.matches[i]!=='');if(s.type==='order')return true;if(s.type==='numeric')return Number.isFinite(parseNumber(d.number));return true;}
function evaluate(s,d){const a=activity(s,d);if(a)return formats().activityCorrect(a,d);if(s.type==='choice')return d.choice===s.answer;if(s.type==='multi')return JSON.stringify([...d.selected].sort((a,b)=>a-b))===JSON.stringify([...s.answers].sort((a,b)=>a-b));if(s.type==='match')return s.pairs.every((_,i)=>Number(d.matches[i])===i);if(s.type==='order')return JSON.stringify(d.order)===JSON.stringify(s.answer);if(s.type==='numeric')return Math.abs(parseNumber(d.number)-s.answer)<=(s.tolerance??.01)+1e-8;return false;}
function check(){if(!canLearn())return false;const s=currentStep(),d=draft();if(d.passed)return;if(!isAnswered(s,d)){feedback={kind:'bad',title:'Falta una parte de tu respuesta',text:s.type==='match'?'Asocia todos los conceptos antes de comprobar.':'Completa tu respuesta y veremos por qué encaja o qué conviene revisar.'};renderFeedback();return;}d.attempts++;const good=evaluate(s,d);if(good){d.passed=true;feedback={kind:'good',title:d.attempts===1?'Idea bien aplicada':'Ya has encontrado la clave',text:stepText(s,d,'explanation')};}else feedback={kind:'bad',title:'Revisa esta parte del razonamiento',text:stepText(s,d,'hint')||stepText(s,d,'explanation')};renderLesson();save();window.OchavoMotion?.answer(good);if(good)focusNext();else main.querySelector('[data-check]')?.focus({preventScroll:true});}
function advance(){if(!canLearn())return false;if(inCase()&&!hasCaseAccess()){state.page='cases';render();return;}const s=currentStep(),d=draft();if(s.type!=='learn'&&!d.passed&&!previewPassed(d))return;if(s.type==='learn')d.passed=true;feedback=null;if(activeSession().step===activeContent().steps.length-1){if(inCase())finishCase();else if(game()&&state.active.drafts.some(x=>x.gameAttemptId))void finishWithAnswers();else finish();return;}activeSession().step++;render();save();main.querySelector('[data-exit]')?.focus({preventScroll:true});}
function finish(){if(!canLearn())return false;const active=state.active,l=lessons[active.id];const firstTry=l.steps.reduce((n,s,i)=>n+(s.type!=='learn'&&active.drafts[i].attempts===1&&!active.drafts[i].hinted?1:0),0);const repeated=!!state.completed[l.id];state.completed[l.id]={firstTry:Math.max(state.completed[l.id]?.firstTry||0,firstTry)};lastResult={id:l.id,firstTry,repeated};delete state.sessions[l.id];state.active=null;state.page='success';render();save();window.OchavoMotion?.milestone('point');void window.virutaReconcile?.();void window.virutaLessonCompleted?.({kind:'lesson',track:currentTrack().id,lesson_id:l.id,attemptId:'lesson-'+l.id+'-'+newAttempt()});}
function renderSuccess(){const r=lastResult,l=lessons[r.id],checkpoint=(r.id+1)%BLOCK_SIZE===0;main.innerHTML=`<div class="br-page br-celebrate">${mascot()}<p class="br-eyebrow">${r.repeated?'Una idea más afianzada':'Punto '+pointNumber(r.id)+' de '+currentTrack().name+' completado'}</p><h1>${checkpoint?'Ahora conecta<br>las ideas.':currentTrack().id==='etfs'?'Una idea más<br>aprendida.':'La historia<br>continúa.'}</h1><p class="br-section-intro">${esc(l.title)}</p><div class="br-summary-stats"><div><strong>${r.repeated?'✓':'+40'}</strong><span>${r.repeated?'Capítulo repasado':'Puntos de aprendizaje'}</span></div><div><strong>${r.firstTry} / ${l.steps.filter(s=>s.type!=='learn').length}</strong><span>A la primera, sin pistas</span></div></div><div class="br-takeaway"><strong>La idea que te llevas</strong>${esc(l.takeaway)}</div><div id="ochavo-result-ad" class="och-result-ad" hidden></div><p class="br-bridge">${esc(checkpoint?'Has recorrido diez puntos. El examen te ayudará a comprobar cómo encajan sus ideas antes de seguir.':l.bridge)}</p>${checkpoint?`<button class="br-main-button br-wide cursor-interaction" data-exam-detail="${Math.floor(r.id/BLOCK_SIZE)}">Ir a la casilla de examen</button>`:nextLesson(r.id)!==undefined?`<button class="br-main-button br-wide cursor-interaction" data-start="${nextLesson(r.id)}">Seguir: ${esc(lessons[nextLesson(r.id)].short)}</button>`:''}<button class="br-secondary br-wide cursor-interaction" style="margin-top:13px" data-nav="map">Volver a Aprende</button></div>`;}
function pathGlossary(){return [...new Map([...(currentTrack().glossary||support.glossary),...pathLessons().flatMap(l=>l.steps.flatMap(s=>(s.terms||[]).map(t=>[t.word,t.meaning])))].map(([word,meaning])=>[word.toLocaleLowerCase('es'),[word,meaning]])).values()].sort((a,b)=>a[0].localeCompare(b[0],'es'));}
function pathSources(){return currentTrack().sources?.length?[...new Map(currentTrack().sources.map(s=>[s.url,[s.title,s.url]])).values()]:sources;}
function renderGlossary(){main.innerHTML=`<div class="br-page"><button class="br-back cursor-interaction" data-nav="map">← Aprende</button><p class="br-eyebrow">Puedes volver cuando lo necesites</p><h1 style="margin-top:8px">Las palabras,<br>explicadas.</h1><div class="br-glossary" style="margin-top:15px">${pathGlossary().map(([word,def])=>`<details><summary class="cursor-interaction">${esc(word)}</summary><p>${esc(def)}</p></details>`).join('')}</div></div>`;}
function renderSources(){main.innerHTML=`<div class="br-page"><button class="br-back cursor-interaction" data-nav="map">← Aprende</button><h1 style="margin-top:12px">Para seguir<br>investigando.</h1><p class="br-section-intro">Fuentes para el camino de ${esc(currentTrack().name)}. Las lecciones usan ejemplos didácticos. Los casos de estudio identifican sus fuentes históricas y distinguen los datos reales de las simulaciones.</p><div class="br-source-list" style="margin-top:15px">${pathSources().map(([name,url])=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`).join('')}</div><p class="br-note">Las simulaciones simplifican la realidad y detallan sus supuestos. No incluyen recomendaciones sobre activos reales.</p></div>`;}
function renderLab(){window.OchavoLaboratory?.render();}
function ensureVars(type,vars){for(const [key,label,min,max,step,value] of configs[type]||[])if(!Number.isFinite(vars[key]))vars[key]=value;if(type==='funds'&&!vars.fund)vars.fund='global';if(type==='thesis'&&!vars.evidence)vars.evidence='business';}
function visualMarkup(type,vars){ensureVars(type,vars);const controls=(configs[type]||[]).map(([key,label,min,max,step,value,unit])=>`<div class="br-control"><label for="br-slider-${key}">${esc(label)}<strong data-viz-value="${key}">${fmt(vars[key],step<1?1:0)} ${unit}</strong></label><input class="cursor-interaction" id="br-slider-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${vars[key]}" data-viz="${key}" aria-label="${esc(label)}"><div class="br-slider-ends"><span>${fmt(min)} ${unit}</span><span>${fmt(max)} ${unit}</span></div></div>`).join('');return `<div class="br-visual" data-visual-root="${type}" role="group" aria-label="${visualNames[type]}"><div class="br-viz-top"><span>Experimenta</span><small>${state.page==='lesson'&&['ownership','marketcap'].includes(type)?'El caso de Nébula':'Escenario de prueba'}</small></div>${state.page==='lab'?`<p class="br-viz-intro">${esc(support.visualIntro[type])}</p>`:''}<div id="br-viz-output"></div>${controls}<p class="br-viz-caption" id="br-viz-summary" aria-live="polite"></p></div>`;}
function bars(labels,values,unit='',alternate=false){const max=Math.max(...values.map(Math.abs),1);return `<div class="br-horizontal" role="img" aria-label="${esc(labels.map((l,i)=>l+': '+fmt(values[i],Number.isInteger(values[i])?0:2)+' '+unit).join('; '))}">${labels.map((label,i)=>`<div class="br-bar-row"><div class="br-bar-head"><span>${esc(label)}</span><strong>${fmt(values[i],Number.isInteger(values[i])?0:2)} ${esc(unit)}</strong></div><div class="br-bar-track"><div class="br-bar-fill ${values[i]<0?'negative':alternate&&i%2?'alt':''}" style="width:${Math.abs(values[i])/max*100}%"></div></div></div>`).join('')}</div>`;}
function figureMarkup(f){
 if(f.kind==='candles')return window.OchavoCandles.render(f);
 const title=f.caption?`<p class="br-viz-title">${esc(f.caption)}</p>`:'';
 if(f.kind==='table')return `<div class="br-visual br-figure-table">${title}<div class="br-table-scroll" tabindex="0" role="region" aria-label="${esc(f.caption||'Tabla del ejemplo')}"><table><thead><tr>${f.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${f.rows.map(row=>`<tr>${row.map((v,i)=>i===0?`<th scope="row">${esc(v)}</th>`:`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
 if(f.kind==='flow')return `<div class="br-visual">${title}<ol class="br-flow">${f.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ol></div>`;
 return `<div class="br-visual" style="margin-top:0;margin-bottom:17px">${title}${bars(f.labels,f.values,f.unit,true)}${f.values.some(v=>v<0)?'<p class="br-note">La longitud muestra la magnitud. El signo distingue valores positivos y negativos.</p>':''}</div>`;
}

function stack(values,labels){const colors=['var(--br-lime)','light-dark(#b5a0db,#947ec0)','light-dark(#86b8b7,#629998)','light-dark(#e7be8c,#a98559)'];return `<div class="br-stack" role="img" aria-label="${esc(labels.map((l,i)=>l+' '+fmt(values[i],1)+' %').join('; '))}">${values.map((v,i)=>`<span style="width:${v}%;background:${colors[i]}"></span>`).join('')}</div><div class="br-legend">${labels.map((l,i)=>`<span><i style="background:${colors[i]}"></i>${esc(l)} ${fmt(values[i],1)} %</span>`).join('')}</div>`;}
function updateVisual(type,v){ensureVars(type,v);const output=main.querySelector('#br-viz-output'),summary=main.querySelector('#br-viz-summary');if(!output)return;let html='',text='';
 if(type==='ownership'){html=`<p class="br-viz-title">Nébula · 100 acciones iguales</p><div class="br-viz-big">${v.owned} % de la empresa</div><div class="br-share-grid" role="img" aria-label="Posees ${v.owned} de 100 acciones">${Array.from({length:100},(_,i)=>`<span class="br-share ${i<v.owned?'owned':''}"></span>`).join('')}</div>`;text=`Con ${v.owned} de las 100 acciones, serías dueño de un ${v.owned} % de Nébula. Ese porcentaje no dice cuánto dinero ganarás.`;}
 if(type==='marketcap'){html=`<p class="br-viz-title">Valor conjunto de las 100 acciones</p><div class="br-viz-big">${fmt(v.price*100)} €</div><p class="br-viz-caption">${fmt(v.price)} € por acción × 100 acciones</p>${bars(['Precio del conjunto a 120 € por acción','Precio del conjunto con tu cambio'],[12000,v.price*100],'€',true)}`;text='Este valor conjunto en el mercado se llama capitalización. No es el dinero de la cuenta bancaria de la empresa.';}
 if(type==='returns'){const nominal=(v.sell+v.dividend-2-100)/100,real=(1+nominal)/(1+v.inflation/100)-1;html=`<p class="br-viz-title">100 € invertidos · 2 € de coste al vender</p><div class="br-viz-pair"><div><small>Ganancia o pérdida después de costes</small><strong>${fmt(nominal*100,1)} %</strong></div><div><small>Cambio de lo que puedes comprar</small><strong class="br-highlight">${fmt(real*100,1)} %</strong></div></div><div class="br-cash-row"><span>Dinero al final, incluido el reparto recibido</span><strong>${fmt(v.sell+v.dividend-2)} €</strong></div>`;text='Comparamos un único periodo, sin impuestos ni coste de compra. El cambio de lo que puedes comprar es la rentabilidad real: dividimos (1 + rentabilidad después de costes) entre (1 + inflación) y restamos 1.';}
 if(type==='drawdown'){const end=100-v.drop,recovery=v.drop/end*100;html=`<p class="br-viz-title">Partimos de una inversión de 100 €</p>${bars(['Al principio','Después de la caída'],[100,end],'€',true)}<div class="br-viz-pair"><div><small>Pérdida inicial</small><strong>−${v.drop} %</strong></div><div><small>Subida para volver a 100 €</small><strong class="br-highlight">+${fmt(recovery,1)} %</strong></div></div>`;text=`La recuperación se calcula sobre los ${end} € que quedan, no sobre los 100 € iniciales. Saber qué subida haría falta no garantiza que vaya a ocurrir.`;}
 if(type==='diversification'){const other=(100-v.tech)/3,loss=v.tech*.4;html=`<p class="br-viz-title">Cómo repartes el dinero entre distintos negocios</p>${stack([v.tech,other,other,other],['Tecnología','Salud','Consumo','Industria'])}<div style="margin-top:18px"><p class="br-viz-title">Si tecnología cae un 40 % y el resto no cambia</p><div class="br-viz-big">−${fmt(loss,1)} % en el conjunto</div></div>`;text='Cada grupo reúne empresas de una actividad: es un sector. Aquí aislamos una caída para entender su efecto. En la realidad pueden caer varios sectores a la vez.';}
 if(type==='funds'){const all={global:{label:'Varios sectores',values:[30,25,25,20],labels:['Tecnología','Salud','Consumo','Otros'],text:'Reparte el dinero entre grupos de empresas que hacen cosas diferentes. Mira también en qué países trabajan y qué inversiones repiten tus otros fondos.'},sector:{label:'Un solo sector',values:[100],labels:['Tecnología'],text:'Puede contener muchas empresas, pero todas trabajan en una actividad parecida. Un mismo problema podría afectar a muchas.'},single:{label:'Una empresa',values:[100],labels:['Una empresa'],text:'En este ejemplo, toda la inversión depende de una sola empresa. La palabra fondo, por sí sola, no te dice cuánto está repartido el riesgo.'}};const f=all[v.fund];html=`<div class="br-reveal">${Object.entries(all).map(([key,x])=>`<button class="br-tab cursor-interaction" data-preset="${key}" aria-pressed="${v.fund===key}">${x.label}</button>`).join('')}</div>${stack(f.values,f.labels)}<p class="br-viz-caption">${f.text}</p>`;text='Estas cestas son ejemplos inventados para comparar su contenido. No representan productos concretos.';}
 if(type==='compound'){const gross=10000*1.07**v.years,net=10000*(1.07*(1-v.fee/100))**v.years;html=`<p class="br-viz-title">10.000 € · suponemos un 7 % anual antes de costes</p>${bars(['Sin cobrar comisión','Cobrando comisión cada año'],[gross,net],'€',true)}<div class="br-viz-pair"><div><small>Diferencia de dinero al final</small><strong>${fmt(gross-net)} €</strong></div><div><small>Tiempo transcurrido</small><strong>${v.years} ${v.years===1?'año':'años'}</strong></div></div>`;text='Cada año aplicamos primero el 7 % y después cobramos la comisión sobre el saldo. No añades ni retiras dinero y no calculamos impuestos. El 7 % constante permite comparar costes; no predice el futuro.';}
 if(type==='margins'){html=`<p class="br-viz-title">Por cada 100 € de ventas</p>${stack([v.cost,100-v.cost],['Todos los costes','Beneficio'])}<div class="br-viz-pair"><div><small>Beneficio del período</small><strong>${100-v.cost} €</strong></div><div><small>Margen de beneficio</small><strong class="br-highlight">${100-v.cost} %</strong></div></div>`;text='Aquí incluimos todos los costes del período. Cambia cuánto cuestan las ventas y observa qué parte queda como beneficio. El margen compara el beneficio con las ventas; no es el saldo del banco.';}
 if(type==='cash'){const final=6000+v.collected*1000-8500;html=`<p class="br-viz-title">Un mes de prueba: empieza con 6.000 €</p><div class="br-cash-row"><span>Dinero al empezar</span><strong>6.000 €</strong></div><div class="br-cash-row"><span>Cobros durante el mes</span><strong>+${fmt(v.collected*1000)} €</strong></div><div class="br-cash-row"><span>Pagos durante el mes</span><strong>−8.500 €</strong></div><div class="br-cash-row"><span>Dinero disponible al terminar</span><strong>${fmt(final)} €</strong></div>`;text='Solo contamos entradas y salidas reales. Una venta que todavía no se ha cobrado no entra en esta suma. En este escenario no hay otros movimientos de dinero.';}
 if(type==='multiples'){html=`<p class="br-viz-title">Beneficio de un año por cada acción: 2 €</p><div class="br-viz-big">PER: ${fmt(v.price/2,1)} veces</div><p class="br-viz-caption">Precio ${v.price} € ÷ beneficio por acción 2 €</p>${bars(['Este caso','Otra empresa con PER de 20'],[v.price/2,20],'veces',true)}`;text=`Pagarías ${fmt(v.price/2,1)} € por cada euro de ese beneficio anual. No significa recuperar el dinero en ${fmt(v.price/2,1)} años: el beneficio puede cambiar y puede no repartirse.`;}
 if(type==='discount'){const a=216/(1+v.rate/100),b=233.28/(1+v.rate/100)**2,value=a+b,margin=(value-v.price)/value*100;html=`<p class="br-viz-title">El proyecto: 216 € al final del año 1 y 233,28 € al final del año 2</p>${bars(['Valor hoy del primer cobro','Valor hoy del segundo cobro'],[a,b],'€',true)}<div class="br-viz-pair"><div><small>Estimación del valor hoy</small><strong>${fmt(value,2)} €</strong></div><div><small>Margen de seguridad</small><strong class="br-highlight">${fmt(margin,1)} %</strong></div></div>`;text='Los cobros son el dinero que recibirías después de restar costes e impuestos. Después de dos años el proyecto termina. Compara el valor calculado con el precio: si el margen es negativo, pagarías más que tu estimación. El margen no es una ganancia asegurada.';}
 if(type==='thesis'){const evidence={business:['Negocio','En el período del último caso, Nébula vendió 72.000 €','Investiga cuánto costó conseguir esas ventas y cuándo las cobró. Vender no explica por sí solo cuánto queda.'],value:['Precio','En el caso de la parcela, el precio era 42 € y el beneficio habitual por acción era 2,50 €','La relación entre precio y beneficio habitual era 16,8 veces. Investiga si ese beneficio puede mantenerse; la cifra sola no decide la compra.'],risk:['Dependencias','Un cliente aportó 18.000 € de los 72.000 € vendidos: el 25 %','Si se marcha o exige pagar menos, la empresa podría vender y ganar menos. Revisa los acuerdos con ese cliente y las alternativas.']};const x=evidence[v.evidence];html=`<div class="br-reveal">${Object.entries(evidence).map(([key,item])=>`<button class="br-tab cursor-interaction" data-evidence="${key}" aria-pressed="${v.evidence===key}">${item[0]}</button>`).join('')}</div><div class="br-reveal-body"><strong>${x[1]}</strong><p>${x[2]}</p></div>`;text='Recupera las piezas que has estudiado. Conecta los datos y explica también qué información te haría cambiar de opinión.';}
 output.innerHTML=html;summary.textContent=text;
 for(const [key,label,min,max,step,value,unit] of configs[type]||[]){const el=main.querySelector(`[data-viz-value="${key}"]`);if(el)el.textContent=fmt(v[key],step<1?1:0)+' '+unit;}
}
function visualContext(){if(state.page==='lesson'||inExam()||inCase())return {type:currentStep().visual,vars:draft().vars};return {type:null,vars:{}};}
root.addEventListener('click',async e=>{if(!canLearn()){render();return;}const b=e.target.closest('button, a[data-lesson-tool]');if(!b||!root.contains(b)||b.disabled||gameBusy||b.dataset.vr)return;
 if(b.dataset.lessonTool){
  e.preventDefault();
  if(state.page!=='lesson'||currentStep()?.laboratoryLink?.tool!=='recovery'||b.dataset.lessonTool!=='recovery'||!window.OchavoLaboratory?.open)return;
  const id=state.active.id,generation=accessGeneration;
  flushInputs();state.page='lab';feedback=null;render();
  window.OchavoLaboratory.open('recovery',{onReturn:()=>{if(accessCurrent(generation)&&state.page==='lab')start(id);}});
  return;
 }
 if(['success','exam-result'].includes(state.page)&&typeof window.virutaContinueAfterLesson==='function'&&main.contains(b)&&b.matches('[data-nav],[data-start],[data-exam-detail],[data-group],[data-exam-start],[data-detail]')){
  const generation=accessGeneration,page=state.page;
  setCourseBusy(true);
  try{await window.virutaContinueAfterLesson?.();}catch{/* Advertising never blocks a saved result. */}
  finally{setCourseBusy(false);void window.virutaAfterAction?.();}
  if(!accessCurrent(generation)||state.page!==page)return;
 }
 if(b.hasAttribute('data-content-retry')){render();return;}
 if(b.hasAttribute('data-skip-intro')){void skipIntroduction();return;}
 if(b.hasAttribute('data-path-next')){void extendPath('next',true);return;}
 if(b.hasAttribute('data-path-previous')){void extendPath('previous',true);return;}
 if(b.hasAttribute('data-path-retry')){const range=pathRange(),direction=range.failedDirection;range.error=false;range.failedDirection=null;if(direction)void extendPath(direction,true);else void preparePath(range);return;}
 if(b.hasAttribute('data-report-problem')){flushInputs();window.OchavoFeedback?.open();return;}
 if(inCase()&&!hasCaseAccess()){state.page='cases';render();return;}
 if(b.hasAttribute('data-path-picker')){flushInputs();pathRanges.delete(state.track);state.page='map';state.mapTarget=null;feedback=null;render();save();main.querySelector('.br-track-picker')?.scrollIntoView({block:'start',behavior:'instant'});rebasePathScroll(pathRange());main.querySelector(`[data-track="${state.track}"]`)?.focus({preventScroll:true});return;}
 if(b.dataset.track){switchTrack(b.dataset.track);return;}
 if(b.dataset.growthTool&&state.page==='lesson'&&currentStep()?.growthLab){
  const id=state.active.id,generation=accessGeneration,config=currentStep().growthLab;
  if(b.dataset.growthTool!==config.kind||!window.OchavoLaboratory?.open)return;
  const values=window.OchavoGrowthLab?.readValues(b.closest('[data-growth-lab]'))||config.values;
  flushInputs();state.page='lab';feedback=null;render();
  window.OchavoLaboratory.open(config.kind,{values,onReturn:()=>{if(accessCurrent(generation)&&state.page==='lab')start(id);}});
  return;
 }
 if(b.dataset.nav){if(state.page==='lab')window.OchavoLaboratory?.reset();if(b.dataset.nav==='map'){showPath();return;}state.page=b.dataset.nav;feedback=null;render();save();return;}
 if(b.dataset.group!==undefined){const g=Number(b.dataset.group);if(!groups[g])return;if(trackOfExam(g)?.id!==state.track)switchTrack(trackOfExam(g).id);state.group=g;showPath('br-world-'+g);return;}
 if(b.dataset.libraryGroup!==undefined){const g=Number(b.dataset.libraryGroup);if(!groups[g])return;if(trackOfExam(g)?.id!==state.track)switchTrack(trackOfExam(g).id);state.group=g;render();save();return;}
 if(b.dataset.detail!==undefined){const id=Number(b.dataset.detail);if(!lessons[id])return;if(trackOfLesson(id)?.id!==state.track)switchTrack(trackOfLesson(id).id);if(state.page==='map')state.detailOrigin='map';else if(state.page!=='detail')state.detailOrigin='library';state.mapTarget='br-point-'+id;state.group=Math.floor(id/BLOCK_SIZE);state.detail=id;state.page='detail';render();return;}
 if(b.dataset.start!==undefined){start(Number(b.dataset.start));return;}
 if(b.dataset.examDetail!==undefined){state.examDetail=Number(b.dataset.examDetail);if(!exams[state.examDetail])return;if(trackOfExam(state.examDetail)?.id!==state.track)switchTrack(trackOfExam(state.examDetail).id);state.group=state.examDetail;state.mapTarget='br-exam-'+state.examDetail;state.page='exam-detail';render();return;}
 if(b.dataset.examStart!==undefined){startExam(Number(b.dataset.examStart),b.hasAttribute('data-new-exam'));return;}
 if(b.hasAttribute('data-exam-result')){state.page='exam-result';render();return;}
 if(b.hasAttribute('data-resume')&&state.active){start(state.active.id);return;}
 if(b.hasAttribute('data-exit')){if(inCase()){state.page='cases';feedback=null;render();save();}else showPath();return;}
 if(b.dataset.preset){const c=visualContext();c.vars.fund=b.dataset.preset;updateVisual(c.type,c.vars);save();return;}
 if(b.dataset.evidence){const c=visualContext();c.vars.evidence=b.dataset.evidence;updateVisual(c.type,c.vars);save();return;}
 if((!state.active||state.page!=='lesson')&&!inExam()&&!inCase())return;
 const s=currentStep(),d=draft();
 const a=activity(s,d);
 if(b.dataset.ex!==undefined&&a){
  if(b.dataset.ex==='listen'){playExerciseAudio(a);return;}
  if(!inputLocked(d)&&formats().activityAction(a,d,b.dataset.ex,b.dataset.exValue,b.dataset.exIndex)){
   feedback=null;main.querySelector('#br-activity').innerHTML=(s.figure&&!activity(s,d)?.hideFigure?figureMarkup(s.figure):'')+exerciseMarkup(s,d);renderFeedback();
   const candidates=main.querySelectorAll('[data-ex]');const next=Array.from(candidates).find(el=>el.dataset.ex===b.dataset.ex&&el.dataset.exValue===b.dataset.exValue&&!el.disabled);next?.focus({preventScroll:true});save();
  }
  return;
 }
 if(b.dataset.explore!==undefined&&(state.page==='lesson'||inCase())&&s.explore){const i=Number(b.dataset.explore);if(!s.explore.options[i])return;d.vars.explore=i;main.querySelector('.br-explore').outerHTML=exploreMarkup(s.explore,d);main.querySelector(`[data-explore="${i}"]`)?.focus({preventScroll:true});save();return;}
 if((b.dataset.matchLeft!==undefined||b.dataset.matchRight!==undefined)&&!inputLocked(d)){const side=b.dataset.matchLeft!==undefined?'left':'right',value=Number(side==='left'?b.dataset.matchLeft:b.dataset.matchRight);if(window.OchavoMatchArrows?.applyMatchArrow(s,d,side,value)){renderLesson();save();main.querySelector(`[data-match-${side}="${value}"]`)?.focus({preventScroll:true});}return;}
 if(b.dataset.option!==undefined&&!inputLocked(d)){const i=Number(b.dataset.option);if(s.type==='choice')d.choice=i;else d.selected=d.selected.includes(i)?d.selected.filter(x=>x!==i):[...d.selected,i];main.querySelectorAll('[data-option]').forEach(el=>{const j=Number(el.dataset.option),selected=s.type==='choice'?d.choice===j:d.selected.includes(j);el.setAttribute('aria-pressed',String(selected));if(s.type==='multi')el.querySelector('.br-option-letter').textContent=selected?'✓':'+';});save();return;}
 if(b.dataset.move!==undefined&&!inputLocked(d)){const pos=Number(b.dataset.move),target=pos+Number(b.dataset.direction);if(target<0||target>=d.order.length)return;[d.order[pos],d.order[target]]=[d.order[target],d.order[pos]];feedback=null;main.querySelector('#br-activity').innerHTML=(s.figure?figureMarkup(s.figure):'')+exerciseMarkup(s,d);renderFeedback();(main.querySelector(`[data-move="${target}"][data-direction="${b.dataset.direction}"]:not(:disabled)`)||main.querySelector(`[data-move="${target}"]:not(:disabled)`))?.focus({preventScroll:true});save();return;}
 if(inExam()){
  if(b.hasAttribute('data-exam-next'))advanceExam();
  if(b.hasAttribute('data-exam-prev')&&state.exam.step>0&&!state.exam.pendingSubmit){state.exam.step--;feedback=null;render();save();}
  return;
 }
 if(b.hasAttribute('data-check')){if(game()&&!inCase())void checkWithGame();else check();return;}
 if(b.hasAttribute('data-hint')){d.hinted=true;feedback={kind:'hint',title:'Una pista para razonar',text:stepText(s,d,'hint')};renderFeedback();save();return;}
 if(b.hasAttribute('data-next')){advance();return;}
 if(b.hasAttribute('data-prev')&&activeSession().step>0){activeSession().step--;feedback=null;render();save();main.querySelector('[data-exit]')?.focus({preventScroll:true});}
});
root.addEventListener('input',e=>{if(!canLearn()||gameBusy)return;const el=e.target;if(handleExerciseInput(el))return;if(el.dataset.viz){const c=visualContext();c.vars[el.dataset.viz]=Number(el.value);updateVisual(c.type,c.vars);return;}if(el.id==='br-number'&&(state.page==='lesson'||inExam()||inCase())&&!inputLocked(draft())){draft().number=el.value;save();}});
root.addEventListener('change',e=>{if(!canLearn()||gameBusy)return;const el=e.target;if(handleExerciseInput(el,true))return;if(el.dataset.match!==undefined&&(state.page==='lesson'||inExam()||inCase())){draft().matches[el.dataset.match]=el.value;main.querySelector(`#br-match-full-${el.dataset.match}`).textContent=el.value===''?'':currentStep().pairs[Number(el.value)].right;save();}if(el.dataset.viz||el.id==='br-number')save();});
root.addEventListener('keydown',e=>{if(!canLearn()||gameBusy)return;if((e.target.id==='br-number'||['word','number'].includes(e.target.dataset.exInput))&&e.key==='Enter'){e.preventDefault();if(inExam())advanceExam();else if(game()&&!inCase())void checkWithGame();else check();}});

function handleExerciseInput(el,redraw=false){
 if(!el.dataset.exInput||!(state.page==='lesson'||inExam()||inCase()))return false;
 const s=currentStep(),d=draft(),a=activity(s,d);if(!a||inputLocked(d))return true;
 if(formats().activityInput(a,d,el.dataset.exInput,el.value,el.dataset.exIndex)){
  feedback=null;renderFeedback();
  if(el.dataset.exInput==='slider'){const output=main.querySelector('[data-ex-output]');if(output)output.textContent=d.number+' '+(a.unit||'');}
  if(redraw&&a.kind==='interval'){main.querySelector('#br-activity').innerHTML=(s.figure&&!activity(s,d)?.hideFigure?figureMarkup(s.figure):'')+exerciseMarkup(s,d);main.querySelector('[data-ex-input="row"][data-ex-index="'+el.dataset.exIndex+'"]')?.focus({preventScroll:true});}
  save();
 }
 return true;
}
function playExerciseAudio(a){
 const status=main.querySelector('[data-ex-audio-status]');
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){if(status)status.textContent='Este dispositivo no ofrece voz. Puedes leer la misma explicación debajo.';return;}
 window.speechSynthesis.cancel();const utterance=new window.SpeechSynthesisUtterance(a.narration);utterance.lang='es-ES';utterance.rate=.9;
 utterance.onerror=()=>{if(status)status.textContent='No se pudo reproducir la voz. Puedes leer la misma explicación debajo.';};
 if(status)status.textContent='Reproduciendo la explicación. El texto también está disponible debajo.';
 window.speechSynthesis.speak(utterance);
}
let exerciseDrag=null;
root.addEventListener('dragstart',e=>{if(!canLearn()||gameBusy)return;const node=e.target.closest('[data-ex-drag]');if(node){exerciseDrag=Number(node.dataset.exDrag);e.dataTransfer?.setData('text/plain',String(exerciseDrag));}});
root.addEventListener('dragover',e=>{if(exerciseDrag!==null&&e.target.closest('[data-ex-drag]'))e.preventDefault();});
root.addEventListener('drop',e=>{const node=e.target.closest('[data-ex-drag]');if(!node||exerciseDrag===null||!canLearn()||gameBusy)return;e.preventDefault();const s=currentStep(),d=draft(),a=activity(s,d);if(a&&!inputLocked(d)&&formats().activityAction(a,d,'drop',exerciseDrag,node.dataset.exDrag)){feedback=null;main.querySelector('#br-activity').innerHTML=(s.figure&&!activity(s,d)?.hideFigure?figureMarkup(s.figure):'')+exerciseMarkup(s,d);save();}exerciseDrag=null;});
root.addEventListener('dragend',()=>{exerciseDrag=null;});
function flushInputs(){
 if(canLearn())for(const el of main.querySelectorAll('[data-ex-input="word"], [data-ex-input="number"]'))handleExerciseInput(el);
if(!canLearn())return false;const el=main.querySelector('#br-number');if(el&&(state.page==='lesson'||inExam()||inCase()))draft().number=el.value;return save();}
window.BroteCourse={
 reportContext,
 restore(p){++accessGeneration;resetAnswerJobs();setCourseBusy(false);++contentRenderTicket;pathObserver?.disconnect();pathObserver=null;pathRanges.clear();loadedCases.clear();state={introSkipped:false,track:'stocks',activeByTrack:{},examSessions:{},archivedExamSessions:{},mapTargets:{},completedCases:{},caseSessions:{},activeCase:null,page:'map',group:tracks[0].groupStart,completed:{},active:null,sessions:{},lab:'compound',labVars:{},passedExams:{},exam:null,examDetail:0,mapTarget:null,detailOrigin:'library'};feedback=null;lastPublished='';lastResult=null;hydrate(p);render();},
 mergeAchievements(p){
   state.introSkipped=state.introSkipped===true||(p.stocksRevision===tracks[0].revision&&p.introSkipped===true);
   state.archivedExamSessions={...state.archivedExamSessions,...p.archivedExamSessions};
   const lessonBeingEdited=state.page==='lesson'?state.active?.id:null;
   const caseBeingEdited=inCase()?state.activeCase?.id:null;
   const examBeingEdited=['exam','exam-result'].includes(state.page)?state.exam?.id:null;
   for(const [id,v] of Object.entries(p.completedCases||{})){if(!state.completedCases[id]||(state.completedCases[id].firstTry||0)<v.firstTry)state.completedCases[id]=v;}
   const incomingCases=new Set((p.caseSessions||[]).map(a=>a[0]));
   for(const id of Object.keys(state.caseSessions))if(id!==caseBeingEdited&&!incomingCases.has(id))delete state.caseSessions[id];
   for(const packed of p.caseSessions||[]){if(packed[0]!==caseBeingEdited){try{const a=unpackSession(packed);if(caseByKey(a.id))state.caseSessions[a.id]=a;}catch{}}}
   for(const [id,v] of Object.entries(p.completed||{})){if(!state.completed[id]||(state.completed[id].firstTry||0)<v.firstTry)state.completed[id]=v;}

   for(const [id,v] of Object.entries(p.passedExams||{})){if(!state.passedExams[id]||state.passedExams[id].best<v.best)state.passedExams[id]=v;}
   const protectedSessions=new Set([...answerJobs.values()].map(job=>job.session.id));
   const incoming=new Map((p.sessions||[]).map(a=>[a[0],a]));
   for(const id of Object.keys(state.sessions))if(Number(id)!==lessonBeingEdited&&!protectedSessions.has(Number(id))&&!incoming.has(Number(id)))delete state.sessions[id];
   for(const packed of incoming.values()){try{const a=unpackSession(packed);if(validSession(a)&&a.id!==lessonBeingEdited&&!protectedSessions.has(a.id))state.sessions[a.id]=a;}catch{}}
   for(const t of tracks){
     const editing=examBeingEdited!==null&&trackOfExam(examBeingEdited)?.id===t.id;
     if(!editing){const packed=p.examSessions?.[t.id]||(t.id===p.track?p.exam:null);if(packed){try{const a={...packed,drafts:packed.drafts.map(unpackDraft)};if(validExam(a)&&activeWorld(a.id)&&trackOfExam(a.id)?.id===t.id)state.examSessions[t.id]=a;}catch{}}else delete state.examSessions[t.id];}
     if(lessonBeingEdited!==null&&t.id===state.track)continue;
     const active=p.activeByTrack?.[t.id]??(p.track===t.id?p.activeId:null);
     if(t.lessonIds.includes(active)&&state.sessions[active])state.activeByTrack[t.id]=active;else delete state.activeByTrack[t.id];
   }
   if(lessonBeingEdited===null)state.active=state.sessions[state.activeByTrack[state.track]]||null;
   if(examBeingEdited===null)state.exam=state.examSessions[state.track]||null;
   if(caseBeingEdited===null)state.activeCase=state.caseSessions[p.activeCaseId]||null;
   if(!gameBusy&&['map','detail','exam-detail','profile','cases'].includes(state.page))render();
 },
 flushInputs,
 refreshAccess(){++accessGeneration;resetAnswerJobs();render();},
 startCase,
 isBusy:()=>gameBusy,
 hasPendingAnswers:()=>[...answerJobs.values()].some(job=>job.status==='saving'),
 refreshWorldSkips(){const key=(game()?.getView().skippedWorldIds||[]).join(',');if(window.BroteCourse.skipKey===key)return;window.BroteCourse.skipKey=key;if(['map','library','detail','exam-detail'].includes(state.page))render();},
 worldSkipped(id){const t=trackOfExam(id),index=worldIds(t).indexOf(id),next=worldIds(t)[index+1];showPath('br-world-'+(next??id));},
 refreshSocial(){if(['profile','cases'].includes(state.page))render();},
 refreshPremium(){if((inCase()||state.page==='case-success')&&!hasCaseAccess()){loadedCases.clear();state.page='cases';render();}},
 clearPremium(){loadedCases.clear();if(inCase()||state.page==='case-success'){state.page='cases';render();}},
 backToPath(){if(!canLearn()){render();return false;}if(gameBusy)return true;flushInputs();if(state.page==='lab'&&window.OchavoLaboratory?.back())return true;if(inCase()||state.page==='case-success'){state.page='cases';render();save();return true;}if(state.page==='map')return false;showPath();root.querySelector('.br-nav [data-nav="map"]')?.focus({preventScroll:true});return true;}
};


async function startCase(id){if(!canLearn())return false;const generation=accessGeneration;const metadata=cases.find(x=>x.id===id);if(!metadata||gameBusy)return false;if(!hasCaseAccess()){window.virutaSocial?.plus();return false;}setCourseBusy(true);try{const c=await window.virutaCaseAccess.load(metadata);assertAccess(generation);if(!hasCaseAccess())throw Error('Tu suscripción necesita confirmación.');loadedCases.set(caseKey(c),c);state.activeCase=state.caseSessions[caseKey(c)]||{id:caseKey(c),step:0,drafts:c.steps.map(emptyDraft)};state.page='case-lesson';feedback=null;render();save();main.scrollIntoView({block:'start',behavior:'instant'});return true;}finally{setCourseBusy(false);void window.virutaAfterAction?.();}}
function finishCase(){if(!canLearn())return false;const a=state.activeCase,c=caseByKey(a.id),firstTry=c.steps.reduce((n,s,i)=>n+(s.type!=='learn'&&a.drafts[i].attempts===1&&!a.drafts[i].hinted?1:0),0);const repeated=!!state.completedCases[a.id];state.completedCases[a.id]={firstTry:Math.max(state.completedCases[a.id]?.firstTry||0,firstTry)};lastResult={caseId:a.id,firstTry,repeated};delete state.caseSessions[a.id];state.activeCase=null;state.page='case-success';render();save();void window.virutaReconcile?.();}
function renderCaseSuccess(){const r=lastResult,c=caseByKey(r.caseId);main.innerHTML=`<div class="br-page br-celebrate">${mascot()}<p class="br-eyebrow">${r.repeated?'Una investigación más afianzada':'Caso de estudio completado'}</p><h1>Las ideas,<br>puestas a prueba.</h1><p class="br-section-intro">${esc(c.company)} · ${esc(c.title)}</p><div class="br-summary-stats"><div><strong>${r.firstTry} / 3</strong><span>A la primera, sin pistas</span></div><div><strong>${r.repeated?'✓':'+10'}</strong><span>${r.repeated?'Ya completado':'Gemas al confirmar'}</span></div></div><div class="br-takeaway"><strong>La idea que te llevas</strong>${esc(c.takeaway)}</div><button class="br-main-button br-wide" data-nav="cases">Volver a los casos</button><div class="br-source-list" style="margin-top:25px">${c.sources.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>`).join('')}</div></div>`;}
async function transaction(fn){if(gameBusy||!canLearn())return;const generation=accessGeneration;setCourseBusy(true);try{await fn(generation);}catch(e){if(!accessCurrent(generation)){if(!canLearn())render();return;}feedback={kind:'bad',title:'Este intento necesita confirmación',text:window.virutaOperationError?.(e)||e.message||'Vuelve a intentarlo cuando tengas conexión. Conservamos tu respuesta.'};if(state.page==='lesson')renderLesson();else if(inExam())renderExam();renderFeedback();}finally{setCourseBusy(false);window.virutaSocial?.update();void window.virutaAfterAction?.();}}
async function persistAttempt(){if(save()===false||await window.broteStore?.flushLocal?.()===false)throw Error('No se pudo guardar el intento en este dispositivo. No hemos descontado vidas; libera espacio o reintenta el guardado.');}
function scheduleCorrectAnswer(session,step){
 const d=session.drafts[step],generation=accessGeneration,jobs=answerJobs;
 const job={session,step,d,status:'saving'};jobs.set(d,job);
 const previous=answerTail;
 job.promise=answerTail=previous.then(async()=>{
  assertAccess(generation);await persistAttempt();assertAccess(generation);
  await game().answer({lessonId:session.id,stepId:step,attemptId:d.gameAttemptId,correct:true});
  assertAccess(generation);
  d.gameAttemptId=null;d.attempts++;d.passed=true;jobs.delete(d);save();
  // Do not rebuild the question, move focus or replay an animation after the
  // learner has already moved on. Only the server may update the gem balance.
  if(answerVisible(job))renderActions();
 });
 void job.promise.catch(error=>{
  if(!accessCurrent(generation))return;
  job.status='error';
  if(answerVisible(job)){
   feedback={kind:'bad',title:'Tu respuesta es correcta; falta guardarla',text:window.virutaOperationError?.(error)||error.message||'Reintenta para confirmar este mismo intento.'};
   renderLesson();
  }else window.virutaSocial?.notify?.('Falta confirmar una respuesta. Conservamos tu intento; podrás reintentarlo antes de completar el punto.');
 }).finally(()=>{if(accessCurrent(generation))void window.virutaAfterAction?.();});
 return job;
}
function retryCorrectAnswers(){
 // Stop after a lost acknowledgement. An explicit retry resubmits the same
 // UUIDs in order, including answers continued before the failure arrived.
 if([...answerJobs.values()].some(job=>job.status==='saving'))return;
 const failed=[...answerJobs.values()];answerTail=Promise.resolve();
 for(const job of failed)scheduleCorrectAnswer(job.session,job.step);
}
async function finishWithAnswers(){
 const session=state.active;
 await transaction(async generation=>{
  retryCorrectAnswers();
  for(const [step,d] of session.drafts.entries())if(d.gameAttemptId&&!answerJobs.has(d)){
   const s=lessons[session.id].steps[step];
   if(!isAnswered(s,d)||!evaluate(s,d))throw Error('Vuelve a la respuesta pendiente y reintenta su comprobación antes de completar el punto.');
   scheduleCorrectAnswer(session,step);
  }
  await answerTail;assertAccess(generation);
  if(state.active!==session||session.drafts.some(d=>d.gameAttemptId))throw Error('Falta confirmar una respuesta antes de completar el punto.');
  finish();
 });
}
async function checkWithGame(){
 if(!canLearn())return false;
 const s=currentStep(),d=draft();if(d.passed||previewPassed(d)||gameBusy)return;
 if(!isAnswered(s,d)){check();return;}
 const g=game().getView(),background=[...answerJobs.values()].some(job=>job.status==='saving');
 if(!g.canPlay&&!g.pending&&!d.gameAttemptId&&!(background&&g.status==='saving')){showGameBlock(g);return;}
 d.gameAttemptId||=newAttempt();
 if(evaluate(s,d)){
  retryCorrectAnswers();
  if(!answerJobs.has(d))scheduleCorrectAnswer(state.active,state.active.step);
  feedback={kind:'good',title:d.attempts===0?'Idea bien aplicada':'Ya has encontrado la clave',text:stepText(s,d,'explanation')};
  renderLesson();save();window.OchavoMotion?.answer(true);focusNext();return;
 }
 // A mistake still needs a confirmed life debit before it can be retried.
 const session=state.active,step=session.step;
 await transaction(async generation=>{
  retryCorrectAnswers();
  await answerTail;await persistAttempt();assertAccess(generation);
  await game().answer({lessonId:session.id,stepId:step,attemptId:d.gameAttemptId,correct:false});
  assertAccess(generation);d.gameAttemptId=null;check();
 });
}
async function finishExamWithGame(){if(!canLearn())return false;const a=state.exam,e=exams[a.id];if(a.submitted||gameBusy)return;const missing=e.steps.findIndex((s,i)=>!isAnswered(s,a.drafts[i]));if(missing>=0){a.step=a.order.indexOf(missing);render();return;}const g=game().getView();if(!g.canPlay&&!g.pending&&!a.pendingSubmit){showGameBlock(game().getView());return;}const score=e.steps.reduce((n,s,i)=>n+(evaluate(s,a.drafts[i])?1:0),0);a.attemptId||=newAttempt();a.pendingSubmit=true;await transaction(async generation=>{await persistAttempt();assertAccess(generation);await game().gradeExam({examId:a.id,attemptId:a.attemptId,wrongCount:10-score,passed:score>=PASS_COUNT});assertAccess(generation);finishExam();});}

render();
})();
