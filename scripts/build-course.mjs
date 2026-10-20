import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TRACKS,LEGACY_TRACKS,ALL_TRACKS} from '../src/tracks.js';
import {COURSE_PARTS,CASE_PARTS,PARTS_BY_TRACK} from '../src/content-files.js';
import {validateCourse} from '../src/content-validation.js';
import {validateCases} from '../src/cases-validation.js';
import {applyExerciseVariety} from '../src/exercise-variety.js';
import {buildDictionary} from './dictionary-authoring.mjs';

const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL('src/content/'+name+'.json',root),'utf8'));
const parts=await Promise.all(COURSE_PARTS.map(read));
const base=parts[0],byName=Object.fromEntries(COURSE_PARTS.map((name,i)=>[name,parts[i]]));
const lessons=parts.flatMap(p=>p.lessons),exams=parts.flatMap(p=>p.exams),groups=parts.flatMap(p=>p.groups);
applyExerciseVariety(lessons,[...await read('exercise-variety'),...await read('stocks-variety-v2'),...await read('etfs-variety-v2'),...await read('crypto-variety-v2')]);
const caseParts=await Promise.all(CASE_PARTS.map(read));
const cases=caseParts.flatMap(part=>part.cases);
// Only the catalogue is public. Full explanations and answer keys live in protected Firestore documents.
const caseCatalogue=cases.map(({id,world,track,company,title,summary,period,minutes,cover,revision,lessonIds,learningGoals})=>({id,world,track,company,title,summary,period,minutes,cover,...(revision?{revision,lessonIds,learningGoals}:{})}));
const tracks=TRACKS.map(t=>({...t,sources:PARTS_BY_TRACK[t.id].flatMap(name=>byName[name].sources||[]),glossary:PARTS_BY_TRACK[t.id].flatMap(name=>byName[name].glossary||byName[name].readingSupport?.glossary||[])}));
const course={blockSize:10,examPassCount:8,courseComplete:false,tracks,legacyTracks:LEGACY_TRACKS,groups,sources:parts.flatMap(p=>p.sources||[]),continuation:'Cuatro caminos que seguirán creciendo. Cada ampliación desarrolla nuevos conceptos sin cerrar el curso.'};
validateCourse({lessons,exams,course});
validateCases(cases,{lessons});
const contentDirectory=new URL('public/course/',root);
await mkdir(contentDirectory,{recursive:true});
course.worldFiles=[];
for(const track of ALL_TRACKS)for(const id of track.groupIds){
  const lessonIds=track.lessonIds.filter(lessonId=>Math.floor(lessonId/course.blockSize)===id);
  const payload=JSON.stringify({schemaVersion:1,worldId:id,lessons:lessonIds.map(lessonId=>lessons[lessonId]),exam:exams[id]}).replace(/</g,'\\u003c');
  const hash=createHash('sha256').update(payload).digest('hex').slice(0,16),name=`world-${id}-${hash}.json`;
  // Keep earlier hashed files usable by clients already running a previous release.
  await writeFile(new URL(name,contentDirectory),payload);
  course.worldFiles.push({id,lessonIds,url:'/course/'+name});
}
course.worldFiles.sort((a,b)=>a.id-b.id);
course.glossary=[...new Map([...base.readingSupport.glossary,...lessons.flatMap(l=>l.steps.flatMap(s=>(s.terms||[]).map(t=>[t.word,t.meaning])))].map(([word,meaning])=>[word.toLocaleLowerCase('es'),[word,meaning]])).values()];
await buildDictionary({course,lessons});
// Most short labels equal the title; avoid shipping the same string twice.
// The course runtime restores that alias before using the initial metadata.
const lessonMetadata=lessons.map(({id,title,short,prerequisites,takeaway,steps,editorialRevision})=>({id,title,...(short!==title?{short}:{}),prerequisites,takeaway,...(editorialRevision?{editorialRevision}:{}),steps:steps.map(({type,visual})=>({type,...(visual?{visual}:{})}))}));
const examMetadata=exams.map(({id,title,summary,steps,editorialRevision})=>({id,title,summary,...(editorialRevision?{editorialRevision}:{}),steps:steps.map(({type})=>({type}))}));
const index=new URL('index.html',root);
let html=await readFile(index,'utf8');
if(!/<script[^>]*id="br-cases"[^>]*>/.test(html)){
  if(!html.includes('</body>'))throw Error('Missing body close for study case slot');
  html=html.replace('</body>','<script type="application/json" id="br-cases"></script>\n</body>');
}
for(const [id,value] of Object.entries({'br-invest-lessons':lessonMetadata,'br-exams':examMetadata,'br-course':course,'br-reading-support':base.readingSupport,'br-cases':caseCatalogue})){
  const regex=new RegExp('(<script[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(</script>)');
  if(!regex.test(html))throw Error('Missing embedded course slot '+id);
  const json=JSON.stringify(value).replace(/</g,'\\u003c');
  html=html.replace(regex,(_,open,close)=>open+json+close);
}
await writeFile(index,html);
console.log(`Ochavo: ${TRACKS.map(t=>t.name+' '+t.count).join(' + ')}; ${exams.length} exámenes y ${cases.length} casos validados.`);
