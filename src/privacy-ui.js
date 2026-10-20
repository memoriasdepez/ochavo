import {NEWSLETTER_LABEL} from './communication-preferences.js';
export function mountPrivacyUI({analytics,communications,ads,getUser,onPrivacy}){
 const root=document.querySelector('#brote-preview'),dialog=document.createElement('dialog');dialog.className='och-privacy-dialog';dialog.setAttribute('aria-label','Privacidad y correos');root.append(dialog);
 let generation=0,busy=false,owner=null;
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 function toggle(label){const row=el('label'),input=el('input');input.type='checkbox';row.className='och-consent-option';row.append(input,el('span',label));return {row,input};}
 const heading=el('h2','Privacidad y correos'),close=el('button','Cerrar');close.type='button';close.className='br-secondary';close.addEventListener('click',()=>{if(!busy)dialog.close();});
 const form=el('form'),newsletter=toggle(NEWSLETTER_LABEL),stats=toggle('Permitir cookies de Google Analytics para mejorar la web (opcional).');
 const emailHelp=el('p','Puedes darte de baja aquí cuando quieras. Esta elección se guarda con tu cuenta y no afecta a los correos necesarios para gestionarla.');
 const statsHelp=el('p','Solo en este navegador: medimos visitas, uso de caminos y lecciones. No enviamos tu correo, nombre, respuestas ni identificador de cuenta. Rechazar no limita el juego.');
 const save=el('button','Guardar preferencias');save.type='submit';save.className='br-main-button';
 const message=el('p');message.setAttribute('role','status');const privacy=el('button','Consultar privacidad');privacy.type='button';privacy.className='br-link';privacy.addEventListener('click',()=>{if(!busy){dialog.close();onPrivacy();}});
 const adPrivacy=el('button','Opciones de privacidad de los anuncios');adPrivacy.type='button';adPrivacy.className='br-secondary och-ad-privacy';
 adPrivacy.addEventListener('click',async()=>{if(busy)return;adPrivacy.disabled=true;message.textContent='';dialog.close();try{if(!await ads?.privacyOptions()){dialog.showModal();message.textContent='Las opciones publicitarias todavía no están disponibles. Puedes seguir usando Ochavo.';}}catch{if(!dialog.open)dialog.showModal();message.textContent='No se pudieron abrir las opciones de publicidad. Vuelve a intentarlo.';}finally{adPrivacy.disabled=false;}});
 form.append(newsletter.row,emailHelp,stats.row,statsHelp,save,adPrivacy,message,privacy);dialog.append(heading,close,form);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{generation++;});
 const banner=el('section');banner.className='och-cookie-banner';banner.setAttribute('aria-label','Cookies de analítica');
 banner.append(el('strong','¿Nos ayudas a mejorar Ochavo?'),el('p','Con tu permiso usamos cookies de Google Analytics para medir el uso de la web. Puedes seguir jugando si las rechazas.'));
 const actions=el('div');actions.className='och-cookie-actions';const accept=el('button','Aceptar analítica'),reject=el('button','Rechazar analítica');for(const b of [accept,reject]){b.type='button';b.className='br-secondary';}actions.append(accept,reject);banner.append(actions);const info=el('button','Más información');info.type='button';info.className='br-link';info.addEventListener('click',onPrivacy);banner.append(info);root.append(banner);
 const refresh=()=>{banner.hidden=!analytics.available||analytics.choice()!==null;adPrivacy.hidden=!ads?.configured;};
 async function choose(value){await analytics.choose(value);refresh();}
 accept.addEventListener('click',()=>void choose(true));reject.addEventListener('click',()=>void choose(false));
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const ticket=generation,user=getUser();if(user!==owner){message.textContent='La cuenta ha cambiado. Vuelve a abrir estas preferencias.';return;}
  busy=true;save.disabled=close.disabled=newsletter.input.disabled=stats.input.disabled=true;message.textContent='Guardando…';
  try{
   if(owner&&communications)await communications.write(owner,newsletter.input.checked,'profile');
   if(ticket!==generation||getUser()!==owner)return;
   if(analytics.available&&!await analytics.choose(stats.input.checked))throw Error('No se pudo guardar la elección de cookies en este navegador.');
   refresh();message.textContent='Preferencias guardadas.';
  }catch{if(ticket===generation)message.textContent='No se han podido guardar todas las preferencias. Comprueba la conexión y vuelve a intentarlo.';}
  finally{busy=false;if(ticket===generation){save.disabled=close.disabled=false;newsletter.input.disabled=!owner||!communications;stats.input.disabled=!analytics.available;}}
 });
 async function open(){if(busy||dialog.open)return;refresh();const ticket=++generation;owner=getUser();newsletter.input.checked=false;newsletter.input.disabled=true;save.disabled=true;stats.row.hidden=statsHelp.hidden=!analytics.available;stats.input.checked=analytics.choice()===true;stats.input.disabled=!analytics.available;emailHelp.textContent=owner?'Puedes darte de baja aquí cuando quieras. La elección se guarda con tu cuenta y no afecta a sus correos de gestión.':'Inicia sesión para elegir si quieres recibir newsletters y promociones.';message.textContent=owner?'Cargando tus preferencias…':'';dialog.showModal();
  try{const p=owner&&communications?await communications.read(owner):{newsletter:false};if(ticket!==generation||getUser()!==owner)return;newsletter.input.checked=p.newsletter===true;newsletter.input.disabled=!owner||!communications;save.disabled=false;message.textContent='';}
  catch{if(ticket===generation){message.textContent='No se pudieron consultar tus preferencias. Cierra esta ventana y vuelve a intentarlo.';save.disabled=true;}}
 }
 window.addEventListener('storage',()=>refresh());refresh();void analytics.start();return {open,refresh,reset(){if(dialog.open&&!busy)dialog.close();},destroy(){banner.remove();dialog.remove();}};
}
