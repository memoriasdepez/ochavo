const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function matchArrowsMarkup(step,draft,right,locked=false){
 const focus=Number.isInteger(draft.vars.matchFocus)&&draft.vars.matchFocus>=0&&draft.vars.matchFocus<step.pairs.length?draft.vars.matchFocus:0;
 const color=i=>['#59863a','#288bac','#9167b9','#bb7b25'][i];
 const paths=step.pairs.flatMap((_,i)=>{
  const answer=draft.matches[i],position=answer===undefined||answer===''?-1:right.indexOf(Number(answer));
  if(position<0)return [];
  const from=(i+.5)*100,to=(position+.5)*100;
  return [`<path d="M2 ${from} C16 ${from} 24 ${to} 36 ${to}" fill="none" stroke="${color(i)}" stroke-width="3" vector-effect="non-scaling-stroke" marker-end="url(#br-match-tip-${i})"/>`];
 });
 const left=step.pairs.map((p,i)=>`<button class="br-arrow-card br-arrow-left cursor-interaction" style="grid-row:${i+1}" data-match-left="${i}" aria-pressed="${i===focus}" ${locked?'disabled':''}><b>${i+1}</b><span>${esc(p.left)}</span></button>`).join('');
 const destinations=right.map((j,i)=>`<button class="br-arrow-card br-arrow-right cursor-interaction" style="grid-row:${i+1}" data-match-right="${j}" aria-label="Relacionar la situación ${focus+1} con: ${esc(step.pairs[j].right)}" aria-pressed="${String(draft.matches[focus])===String(j)}" ${locked?'disabled':''}>${esc(step.pairs[j].right)}</button>`).join('');
 const relations=step.pairs.flatMap((p,i)=>draft.matches[i]!==undefined&&draft.matches[i]!==''?[`${p.left} → ${step.pairs[Number(draft.matches[i])]?.right||''}`]:[]);
 return `<p class="br-select-instruction">Selecciona una situación y después su explicación. Puedes tocar de nuevo para cambiar una relación.</p><div class="br-arrow-grid" role="group" aria-label="Une las cuatro situaciones con flechas">${left}<svg class="br-arrow-lines" viewBox="0 0 40 400" preserveAspectRatio="none" aria-hidden="true"><defs>${step.pairs.map((_,i)=>`<marker id="br-match-tip-${i}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="${color(i)}"/></marker>`).join('')}</defs>${paths.join('')}</svg>${destinations}</div><p class="br-note">${relations.length} de ${step.pairs.length} relaciones elegidas.</p><div class="br-arrow-accessible" aria-live="polite">${relations.map(text=>`<p>${esc(text)}</p>`).join('')}</div>`;
}
export function applyMatchArrow(step,draft,side,value){
 if(step.type!=='match'||step.matchStyle!=='arrows'||!['left','right'].includes(side)||!Number.isInteger(value)||value<0||value>=step.pairs.length)return false;
 if(side==='left')draft.vars.matchFocus=value;
 else{
  const focus=Number.isInteger(draft.vars.matchFocus)&&draft.vars.matchFocus>=0&&draft.vars.matchFocus<step.pairs.length?draft.vars.matchFocus:0;
  for(let i=0;i<step.pairs.length;i++)if(i!==focus&&String(draft.matches[i])===String(value))delete draft.matches[i];
  draft.matches[focus]=String(value);
 }
 return true;
}
