import {worlds} from './outline-300.mjs';
import {scenario,figure,num} from './scenarios.mjs';
import {graphCase} from './later-worlds-b.mjs';
import {learn,choice,rows,activity} from './second-world-tools.mjs';
import {lateReasoningCases} from './late-reasoning-cases.mjs';

export const LATE_TECHNICAL_REASONING_REVISION='technical-reasoning-2026-10-10';
// Zero-based topics where the actual learning objective needs a numerical
// procedure. All lessons retain the existing topic-specific chart application.
export const lateTechnicalCalculateTopics={
  16:[1],17:[3],18:[0],19:[0,1,5,6,7],20:[],21:[1,6],22:[0],
  23:[3,6,7,8,9],24:[1,3,4,5,6,7,9],25:[0,2,4,6,8],
  26:[5],27:[5],28:[],29:[],30:[6,7],
};
const kind=step=>step.activity?.kind||step.type;
const formats=['truth','repair','classify','clues','choice'];

function application(p,title,format,id){
  const options=id%2?[p.wrong,p.right]:[p.right,p.wrong],answer=options.indexOf(p.right);
  const body=p.scene+'\n\n¿Qué interpretación respeta la situación y la explicación anterior?';
  const explanation=p.right+' '+p.teaching;
  if(format==='truth'||format==='classify')return rows(format,title,p.scene+'\n\nComprueba cada conclusión completa.','Distingue lo que permite afirmar el caso de lo que añade una conclusión no justificada.',options.map(option=>({label:option,options:['Respaldada por el caso','No respaldada'],answer:option===p.right?0:1})),explanation);
  if(format==='repair')return rows('repair',title,p.scene+'\n\nEl informe propone la siguiente frase. Corrígela.','Selecciona la corrección que respete los datos y el significado explicado.',[{label:p.wrong,wrongWord:p.wrong,options,answer}],explanation);
  if(format==='clues')return activity({kind:'clues',title,prompt:body,instruction:'Elige la interpretación que no añade garantías ni cambia las condiciones del caso.',options,answer,clues:[p.teaching,'Revisa si la propuesta confunde una observación con su posible consecuencia.'],explanation});
  return choice(title,body,options,answer,explanation);
}

export function refineLateTechnicalReasoning(lessons,exams){
  let previousSequence='';
  for(const w of worlds.filter(world=>world.number>=16)){
    const exam=exams.find(e=>e.id===144+w.number);
    if(!exam)throw Error('Missing technical exam '+w.number);
    for(let j=0;j<10;j++){
      const id=1450+(w.number-1)*10+j,l=lessons.find(lesson=>lesson.id===id),p=lateReasoningCases[id],topic=w.topics[j];
      if(!l||!p)throw Error('Missing late technical interpretation '+id);
      const calculate=lateTechnicalCalculateTopics[w.number].includes(j);
      if(!calculate&&!l.editorialBalance?.extraInterpretation){
        const pair=[
          learn('La diferencia que necesitas entender',p.teaching,topic.correct),
          application(p,'Interpreta antes de actuar',formats[j%formats.length],id),
        ];
        l.steps.splice(2,2,...pair);
      }
      // Keep the worked chart and its fresh chart task together. Only swap
      // independent pairs to avoid imposing the same interaction order twice.
      let sequence=l.steps.filter(step=>step.type!=='learn').map(kind).join(',');
      if(sequence===previousSequence){
        const pair2=l.steps.splice(2,2);l.steps.push(...pair2);
        sequence=l.steps.filter(step=>step.type!=='learn').map(kind).join(',');
      }
      previousSequence=sequence;
      l.story.text=`En «${topic.title.toLocaleLowerCase('es')}» distinguirás qué describe cada dato, comprobarás una lectura del gráfico y aplicarás sus límites a situaciones diferentes.`;
      l.editorialRevision=LATE_TECHNICAL_REASONING_REVISION;
      l.editorialBalance={revision:LATE_TECHNICAL_REASONING_REVISION,numericPractice:calculate,extraInterpretation:!calculate};

      const old=exam.steps[j];
      if(!calculate&&old.type==='numeric'){
        // The previous generator imposed a numeric exam every third topic,
        // even for bias, data selection, indicator limits or information timing.
        // Use another topic-specific scenario with independent chart data.
        const fresh=scenario(w,j,6),c=graphCase(w,j,fresh),options=(id+w.number)%2?[c.wrong,c.right]:[c.right,c.wrong];
        const chart=figure(fresh);
        if(w.number>=23&&w.number<=28){chart.operations=true;chart.sample=true;}
        const q=choice(topic.title,`Caso de examen con otros datos: primer cierre ${num(fresh.candles[0].c)} € y último ${num(fresh.candles.at(-1).c)} €.\n\n${c.question}`,options,options.indexOf(c.right),c.explanation||c.right,chart);
        q.reviewLesson=id;
        q.calculator=true;
        delete q.hint;
        exam.steps[j]=q;
      }
    }
    exam.editorialRevision=LATE_TECHNICAL_REASONING_REVISION;
  }
  return {lessons,exams};
}
