import {readFile,writeFile} from 'node:fs/promises';
const input=process.argv[2];
if(!input)throw Error('Falta el índice aprobado.');
const text=await readFile(input,'utf8');
const worlds=[];let section='',current;
for(const line of text.split(/\r?\n/)){
 if(line.startsWith('## '))section=line.slice(3).trim();
 const heading=line.match(/^### Mundo (\d+) — (.+)$/);
 if(heading){current={number:Number(heading[1]),section,title:heading[2],lessons:[]};worlds.push(current);}
 const lesson=line.match(/^(\d+)\. (.+)$/);
 if(lesson&&current)current.lessons.push({number:Number(lesson[1]),title:lesson[2]});
}
if(worlds.length!==50||worlds.some((w,i)=>w.number!==i+1||w.lessons.length!==10||w.lessons.some((l,n)=>l.number!==n+1)))throw Error('El índice debe contener 50 mundos de 10 lecciones.');
await writeFile(new URL('../src/content/stocks-outline-v2.json',import.meta.url),JSON.stringify({revision:'stocks-2026-10',worlds},null,2)+'\n');
console.log('Índice aprobado: 50 mundos, 500 lecciones.');
