import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {buildTechnical} from './technical-authoring/build-300.mjs';
import {TRACKS} from '../src/tracks.js';

// Authoring world numbers remain stable: scenario and exercise data use them as keys.
// Presentation follows the active path; the withdrawn world remains intact as history.
export function buildPublishedTechnical(){
 const data=buildTechnical(),track=TRACKS.find(t=>t.id==='technical');
 data.revision='technical-2026-10';
 const lessons=new Map(data.lessons.map(l=>[l.id,l]));
 for(const [index,id]of track.lessonIds.entries())lessons.get(id).prerequisites=index?[track.lessonIds[index-1]]:[];
 for(const [index,id]of track.groupIds.entries()){
  const exam=data.exams.find(e=>e.id===id);
  exam.title=exam.title.replace(/^Examen \d+ · /,`Examen ${index+1} · `);
 }
 return data;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const data=buildPublishedTechnical(),track=TRACKS.find(t=>t.id==='technical');
 await writeFile(new URL('../src/content/technical-curriculum-v1.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
 console.log(`Análisis técnico: ${track.count} puntos y ${track.groupCount} exámenes activos; 10 puntos y 1 examen conservados como historial.`);
}
