// Pack authored answers as real current-revision drafts, including activity
// selection. Old tests accidentally exercised the retired base fallback only.
export function packedEditorial(step){
 const a=step.activity;
 if(a){const v={exerciseKind:a.kind};
  if(a.rows)return {m:Object.fromEntries(a.rows.map((r,i)=>[i,String(r.answer)])),v};
  if(a.answers)return {s:a.answers,v};
  if(['clues','audio','intruder','hotspot','sequence','reverse'].includes(a.kind))return {c:a.answer,v};
  if(['sort','build'].includes(a.kind))return {o:a.answer,v};
  if(a.kind==='allocate')return {v:{...v,exerciseAlloc:a.answer}};
  if(a.kind==='slider')return {n:String(a.answer),v:{...v,exerciseTouched:1}};
  if(a.kind==='interval')return {m:{0:String(a.answer[0]),1:String(a.answer[1])},v};
  return typeof a.answer==='number'?{n:String(a.answer).replace('.',','),v}:{v:{...v,exerciseText:a.answer}};
 }
 return step.type==='choice'?{c:step.answer}:step.type==='multi'?{s:step.answers}:step.type==='numeric'?{n:String(step.answer).replace('.',',')}:step.type==='order'?{o:step.answer}:step.type==='match'?{m:Object.fromEntries(step.pairs.map((_,i)=>[i,String(i)]))}:{};
}
export function editorialDrafts(content){return content.steps.map((step,i)=>{const packed=packedEditorial(step);if(i===0&&content.editorialRevision)packed.v={...packed.v,contentRevision:content.editorialRevision};return packed;});}
