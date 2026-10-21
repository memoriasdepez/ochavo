import prose from './published-prose.json' with {type:'json'};

// Final editable prose recovered from ochavo.app (0.35.4, 2026-10-21).
// Keep the existing identities, exercises, exams and compatible draft revisions.
export function applyPublishedProse(result){
  for(const lesson of result.lessons){
    const text=prose[lesson.id];
    if(!text)continue;
    if(text.summary!==undefined)lesson.summary=text.summary;
    for(const [index,body] of Object.entries(text.bodies||{})){
      const step=lesson.steps[index];
      if(step?.type!=='learn'||typeof body!=='string')throw Error('Published prose requires a learning screen: '+lesson.id+'/'+index);
      step.body=body;
    }
  }
  return result;
}
