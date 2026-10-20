const speaker='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path class="och-sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="och-sound-cross" d="m16 9 5 6m0-6-5 6"/></svg>';
export function sensorySettingsMarkup(view){
  return `<section class="och-sensory-settings"><div><h2>Sonido y vibración</h2><p>Pequeñas señales para celebrar tus aciertos y recompensas.</p></div><button type="button" class="och-sensory-switch" data-sensory-toggle role="switch" aria-checked="${view.muted}" aria-label="Modo silencio"><span>Modo silencio</span><span class="och-switch-track" aria-hidden="true"><i></i></span></button><p class="och-sensory-note">${view.native?'Los sonidos respetan el silencio del móvil. En Android, la vibración también respeta sus ajustes.':'En la web, activa los sonidos desactivando este modo. El navegador no puede consultar el silencio del móvil ni garantizar la vibración.'}</p></section>`;
}
export function mountSensoryControls({root,controller,doc=document}={}){
  const button=doc.createElement('button');button.type='button';button.className='och-sensory-header';button.dataset.sensoryToggle='';
  button.setAttribute('aria-label','Modo silencio');button.innerHTML=speaker;
  root.querySelector('.br-status-line')?.insertBefore(button,root.querySelector('#br-help-slot'));
  function refresh(){const {muted}=controller.getView();for(const toggle of root.querySelectorAll('[data-sensory-toggle]')){
    toggle.classList.toggle('is-muted',muted);toggle.title=muted?'Desactivar modo silencio':'Activar modo silencio';
    toggle.setAttribute(toggle.getAttribute('role')==='switch'?'aria-checked':'aria-pressed',String(muted));
  }}
  function click(event){if(!event.target.closest('[data-sensory-toggle]'))return;controller.setMuted(!controller.getView().muted);controller.prime();refresh();}
  root.addEventListener('click',click);const unsubscribe=controller.subscribe(refresh);refresh();
  return {refresh,dispose(){root.removeEventListener('click',click);unsubscribe();button.remove();}};
}
