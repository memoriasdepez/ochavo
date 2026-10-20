/** Public learning content, split into immutable files. Account progress stays separate. */
export function createCourseContent({course,lessons,exams,fetchFile=globalThis.fetch,timeoutMs=15000}) {
  const files=new Map((course.worldFiles||[]).map(file=>[file.id,file]));
  const loaded=new Set(),pending=new Map();
  const hasWorld=id=>!files.size||loaded.has(id);
  async function ensureWorld(id) {
    if(hasWorld(id))return;
    if(pending.has(id))return pending.get(id);
    const file=files.get(id);
    if(!file||!new RegExp('^/course/world-'+id+'-[a-f0-9]{16}\\.json$').test(file.url))throw Error('Este mundo no está disponible en esta versión.');
    const request=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try {
        const response=await fetchFile(file.url,{signal:controller.signal});
        if(!response.ok)throw Error('No se pudo descargar este mundo.');
        const data=await response.json();
        if(controller.signal.aborted)throw Error('La descarga no se ha confirmado.');
        if(data.schemaVersion!==1||data.worldId!==id||!Array.isArray(data.lessons)||data.lessons.length!==file.lessonIds.length||data.exam?.id!==id)throw Error('El contenido de este mundo no coincide con la app.');
        for(const [i,lesson] of data.lessons.entries()){
          const meta=lessons[file.lessonIds[i]];
          if(!meta||lesson.id!==meta.id||!Array.isArray(lesson.steps)||lesson.steps.length!==meta.steps.length||typeof lesson.title!=='string'||!lesson.story||!Array.isArray(lesson.prerequisites)||lesson.steps.some((step,n)=>step.type!==meta.steps[n].type||typeof step.body!=='string'))throw Error('La lección descargada está incompleta.');
        }
        if(!Array.isArray(data.exam.steps)||data.exam.steps.length!==exams[id]?.steps.length||data.exam.steps.some((step,n)=>step.type!==exams[id].steps[n].type||typeof step.body!=='string'))throw Error('El examen descargado está incompleto.');
        // Validate the entire file before replacing any metadata or rendering an exercise.
        for(const lesson of data.lessons)Object.assign(lessons[lesson.id],lesson);
        Object.assign(exams[id],data.exam);loaded.add(id);
      }finally{clearTimeout(timer);}
    })();
    pending.set(id,request);
    try{await request;}finally{if(pending.get(id)===request)pending.delete(id);}
  }
  return {lessons,exams,hasWorld,ensureWorld,ensureWorlds:ids=>Promise.all([...new Set(ids)].map(ensureWorld)),loadedWorldIds:()=>[...loaded]};
}
