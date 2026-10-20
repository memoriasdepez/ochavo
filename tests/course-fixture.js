import {readFileSync} from 'node:fs';
import {TRACKS,LEGACY_TRACKS} from '../src/tracks.js';
const app=new URL('../',import.meta.url);
/** Existing engine tests use real complete content; the production HTML stays metadata-only. */
export function fullCourseTestData({previousRevision=false}={}){
 const html=readFileSync(new URL('index.html',app),'utf8'),data={};
 for(const id of ['br-invest-lessons','br-reading-support','br-course','br-exams','br-cases']){
   const match=html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'));
   if(!match)throw Error('Missing course slot: '+id);data[id]=JSON.parse(match[1]);
 }
 for(const file of data['br-course'].worldFiles||[]){
   const payload=JSON.parse(readFileSync(new URL('public'+file.url,app),'utf8'));
   for(const lesson of payload.lessons)data['br-invest-lessons'][lesson.id]=lesson;
   data['br-exams'][payload.exam.id]=payload.exam;
 }
 // Explicit compatibility fixture for clients with the previous immutable course cached.
 // New-course tests use the default, complete production fixture.
 if(previousRevision){
   data['br-invest-lessons']=data['br-invest-lessons'].slice(0,450);
   data['br-exams']=data['br-exams'].slice(0,45);
   data['br-course'].groups=data['br-course'].groups.slice(0,45);
   data['br-course'].worldFiles=data['br-course'].worldFiles.filter(f=>f.id<45);
   data['br-course'].tracks=[{...LEGACY_TRACKS[0],name:'Acciones',archived:false,revision:TRACKS[0].revision},{...LEGACY_TRACKS[1],name:'ETFs',archived:false},{...LEGACY_TRACKS[2],name:'Cripto',archived:false}];
   data['br-course'].legacyTracks=[];
 }
 return Object.fromEntries(Object.entries(data).map(([id,value])=>[id,JSON.stringify(value)]));
}
