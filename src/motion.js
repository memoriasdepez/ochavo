import {badgeCatalog,badgeSVG,GEM_SVG} from './badges.js';
import {createRewardMotion} from './reward-queue.js';
export {createRewardMotion} from './reward-queue.js';

/** Exercise feedback is decorative; earned rewards have their own accessible
 * full-screen, manually advanced celebration on returning to Aprende. */
export function mountLearningMotion({root,groups=[],doc=document,storage,onChange=()=>{},onError=()=>{},sensory}={}){
  const catalog=new Map(badgeCatalog(groups).map(b=>[b.id,b]));
  const layer=doc.createElement('dialog');layer.className='och-reward-screen';
  layer.setAttribute('aria-labelledby','och-reward-title');root.append(layer);
  let focusReturn=null,presentedKey=null;
  const effects=new Map();
  function removeEffect(el){const effect=effects.get(el);if(!effect)return;clearTimeout(effect.timer);el.classList.remove(effect.className);effect.art.remove();effects.delete(el);}
  function decorate(el,className,art,duration){
    if(!el)return;
    removeEffect(el);el.classList.add(className);el.append(art);
    effects.set(el,{className,art,timer:setTimeout(()=>removeEffect(el),duration)});
  }
  const rewards=createRewardMotion({
    storage,onChange,onError,
    clear:()=>{sensory?.stop();if(layer.open)layer.close();layer.replaceChildren();presentedKey=null;if(focusReturn?.isConnected)focusReturn.focus({preventScroll:true});focusReturn=null;},
    present:view=>{
      const key=[view.kind,view.id,view.phase,view.gems].join(':');
      layer.setAttribute('aria-busy',String(view.saving));
      if(layer.open&&presentedKey===key){
        layer.querySelector('button').disabled=view.saving;
        layer.querySelector('.och-reward-error').textContent=view.error||'';return;
      }
      presentedKey=key;
      layer.replaceChildren();
      layer.className='och-reward-screen '+(view.kind==='badge'?'is-badge':view.phase==='open'?'is-chest-open':'is-chest-closed');
      const page=doc.createElement('div');page.className='och-reward-page';
      const top=doc.createElement('p');top.className='och-reward-top';top.textContent='OCHAVO · CADA PASO CUENTA';
      const art=doc.createElement('div');art.className='och-reward-art';art.setAttribute('aria-hidden','true');
      const title=doc.createElement('h1');title.id='och-reward-title';
      const subtitle=doc.createElement('p');subtitle.className='och-reward-copy';
      const button=doc.createElement('button');button.type='button';button.className='br-main-button och-reward-button';button.disabled=view.saving;
      if(view.kind==='badge'){
        const badge=catalog.get(view.id)||{name:'Un nuevo logro',description:'Has dado otro paso en tu aprendizaje.',kind:'lessons',mark:'✓'};
        art.innerHTML='<span class="och-reward-rays"></span><span class="och-reward-halo"></span><span class="och-reward-laurel"></span><span class="och-reward-medal">'+badgeSVG(badge,true)+'<span class="och-medal-shine"></span></span>'+sparkles();
        title.textContent='¡Logro desbloqueado!';
        const name=doc.createElement('h2');name.className='och-reward-badge-name';name.textContent=badge.name;
        subtitle.textContent=badge.description;button.textContent='CONTINUAR';button.dataset.rewardAction='continue';
        page.append(top,art,title,name,subtitle);
      }else{
        art.innerHTML=chestMarkup()+sparkles();
        title.textContent=view.phase==='open'?'¡Enhorabuena!':'Tu esfuerzo tiene premio';
        subtitle.textContent=view.phase==='open'?'Estas son las gemas que has ganado. Sigue sumando ideas.':'Todas las gemas de este recorrido te esperan dentro.';
        page.append(top,art,title);
        if(view.phase==='open'){
          const total=doc.createElement('div');total.className='och-reward-total';
          const amount=doc.createElement('strong');amount.textContent='+'+view.gems.toLocaleString('es-ES');
          const label=doc.createElement('span');label.textContent=view.gems===1?'gema ganada':'gemas ganadas';total.append(amount,label);page.append(total);
        }
        button.textContent=view.phase==='open'?'CONTINUAR':'ABRIR COFRE';button.dataset.rewardAction=view.phase==='open'?'continue':'open';page.append(subtitle);
      }
      const footer=doc.createElement('div');footer.className='och-reward-footer';
      const note=doc.createElement('p');note.className='och-reward-next';note.textContent=view.remaining>1?`Después: ${view.remaining-1} ${view.remaining===2?'recompensa más':'recompensas más'}`:'Y seguimos aprendiendo';
      const error=doc.createElement('p');error.className='och-reward-error';error.setAttribute('role','status');error.textContent=view.error||'';
      footer.append(error,button,note);page.append(footer);layer.append(page);
      if(!layer.open){focusReturn=doc.activeElement;layer.showModal();}
      if(!view.saving)button.focus({preventScroll:true});
      if(view.kind==='badge')sensory?.play('badge');else if(view.phase==='open')sensory?.play('chest');
    }
  });
  layer.addEventListener('cancel',event=>event.preventDefault());
  layer.addEventListener('click',event=>{const action=event.target.closest('[data-reward-action]');if(!action||action.disabled)return;if(action.dataset.rewardAction==='open')rewards.openChest();else void rewards.continue();});
  function answer(correct){
    if(correct)sensory?.play('correct');
    const icon=doc.createElement('span');icon.className='och-motion-answer-mark';icon.setAttribute('aria-hidden','true');
    icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none"><path d="${correct?'m5 12 4 4 10-10':'m7 7 10 10M17 7 7 17'}" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    decorate(root.querySelector('#br-feedback .br-feedback'),correct?'och-motion-correct':'och-motion-wrong',icon,650);
  }
  function milestone(kind){
    const el=root.querySelector(kind==='exam'?'.br-exam-score.is-passed':'.br-celebrate .br-mascot');
    if(!el)return;
    const burst=doc.createElement('span');burst.className='och-motion-burst';burst.setAttribute('aria-hidden','true');
    for(let i=0;i<12;i++){
      const particle=doc.createElement('i'),angle=i*Math.PI/6;
      particle.style.setProperty('--och-x',`${Math.round(Math.cos(angle)*72)}px`);
      particle.style.setProperty('--och-y',`${Math.round(Math.sin(angle)*57)}px`);
      particle.style.setProperty('--och-turn',`${i*37}deg`);burst.append(particle);
    }
    decorate(el,kind==='exam'?'och-motion-exam':'och-motion-point',burst,750);
  }
  function reset(){rewards.reset();sensory?.stop();for(const el of [...effects.keys()])removeEffect(el);}
  return {...rewards,answer,milestone,setOwner:next=>{if(rewards.setOwner(next)){sensory?.stop();for(const el of [...effects.keys()])removeEffect(el);}},reset};
}

function sparkles(){return '<div class="och-reward-sparkles">'+Array.from({length:14},(_,i)=>`<i style="--spark:${i};--sx:${6+(i*37)%88}%;--sy:${4+(i*23)%85}%;--sz:${10+(i%3)*5}px;--drift:${i%2===0?1:-1}">${i%3===0?'✦':'◆'}</i>`).join('')+'</div>';}
function chestMarkup(){return `<span class="och-reward-rays"></span><div class="och-chest"><span class="och-chest-shadow"></span><span class="och-chest-glow"></span><span class="och-chest-light"></span><span class="och-chest-inside"></span><div class="och-chest-gems"><span>${GEM_SVG}</span><span>${GEM_SVG}</span><span>${GEM_SVG}</span></div><svg class="och-chest-base" viewBox="0 0 280 160"><path d="m29 14 22 125 180 2 21-127Z" fill="#76aa47" stroke="#355734" stroke-width="7" stroke-linejoin="round"/><path d="M53 16v120m175-120v120" stroke="#efd084" stroke-width="22"/><path d="m42 68 197 2" stroke="#355734" stroke-width="5" opacity=".3"/><rect x="111" y="-3" width="61" height="59" rx="14" fill="#f9dc8e" stroke="#775935" stroke-width="5"/><path d="m141 12 13 13-13 13-13-13Z" fill="#ab83d0" stroke="#68468c" stroke-width="3"/><path d="m75 105 28 2" stroke="#a7d471" stroke-width="8" stroke-linecap="round"/></svg><svg class="och-chest-lid" viewBox="0 0 280 104"><path d="M24 91V68C24 31 63 12 140 12s116 19 116 56v23Z" fill="#96c75b" stroke="#355734" stroke-width="7" stroke-linejoin="round"/><path d="M54 87V65c0-23 9-37 23-45m149 67V65c0-23-9-37-23-45" stroke="#f3d58c" stroke-width="18"/><path d="M100 35q38-9 79 0" stroke="#cde89c" stroke-width="9" stroke-linecap="round"/><path d="M24 91h232" stroke="#355734" stroke-width="7"/></svg><span class="och-chest-latch-glint">✦</span></div>`;}
