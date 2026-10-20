import {REPORT_CATEGORIES,reportContext,reportLocation,prepareReport,newReportId} from './feedback-domain.js';

/** A report never changes the lesson, submits an answer or spends a life. */
export function mountFeedbackUI({getUser,getContext,onSend,isBusy=()=>false}) {
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const dialog=el('dialog','br-product-dialog br-report-dialog');
  dialog.id='br-feedback-report';dialog.setAttribute('aria-labelledby','br-report-title');
  const header=el('header','br-product-header'),title=el('h2','br-product-title','Informar de un problema');title.id='br-report-title';title.tabIndex=-1;
  const close=el('button','br-product-button br-product-button--quiet','Cerrar');close.type='button';close.setAttribute('aria-label','Cerrar el aviso');header.append(title,close);
  const intro=el('p','br-product-copy','Cuéntanos qué no está claro o qué ha fallado. Tu respuesta y tu progreso se conservan.');
  const location=el('p','br-report-location');
  const privacy=el('p','br-product-small','El aviso se guarda de forma privada con tu cuenta y la ubicación mostrada arriba. No adjuntamos tus respuestas ni datos de acceso.');
  const form=el('form','br-product-form');form.noValidate=true;
  const categoryLabel=el('label','br-product-label','¿Qué problema has encontrado?');categoryLabel.htmlFor='br-report-category';
  const category=el('select','br-product-input');category.id=categoryLabel.htmlFor;
  for(const [value,label] of Object.entries(REPORT_CATEGORIES)){const option=el('option','',label);option.value=value;category.append(option);}
  const textLabel=el('label','br-product-label','Cuéntanos qué ha ocurrido');textLabel.htmlFor='br-report-message';
  const text=el('textarea','br-product-input br-product-textarea');text.id=textLabel.htmlFor;text.minLength=10;text.maxLength=2000;text.rows=4;text.required=true;text.placeholder='Por ejemplo: el dato que pide este ejercicio no aparece en la explicación.';
  const hint=el('p','br-product-small','Entre 10 y 2.000 caracteres. No incluyas contraseñas ni datos personales.');hint.id='br-report-hint';text.setAttribute('aria-describedby',hint.id);
  const technical=el('label','br-product-consent'),checkbox=el('input','br-product-checkbox');checkbox.type='checkbox';checkbox.id='br-report-technical';technical.htmlFor=checkbox.id;technical.append(checkbox,el('span','','Añadir la versión de Ochavo y si uso web, Android o iPhone (opcional).'));
  const submit=el('button','br-product-button br-product-button--primary','Enviar aviso');submit.type='submit';
  const status=el('p','br-product-notice');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const error=el('p','br-product-notice br-product-notice--error');error.setAttribute('role','alert');error.hidden=true;
  form.append(categoryLabel,category,textLabel,text,hint,technical,submit);
  dialog.append(header,intro,location,privacy,form,status,error);document.body.append(dialog);
  let opener=null,owner=null,context=null,busy=false,generation=0,attempt=null,draftKey='';
  function notice(message,bad=false){status.hidden=error.hidden=true;const node=bad?error:status;node.textContent=message;node.hidden=false;}
  function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const node of [close,category,text,checkbox,submit])node.disabled=value;submit.textContent=value?'Enviando…':'Enviar aviso';}
  function reset(){++generation;owner=null;attempt=null;draftKey='';context=null;lock(false);text.value='';checkbox.checked=false;if(dialog.open)dialog.close();}
  close.addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)dialog.close();});
  dialog.addEventListener('close',()=>{if(opener?.isConnected&&!opener.disabled)opener.focus({preventScroll:true});});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(getUser()!==owner){reset();return;}
    let payload;
    try{payload=prepareReport({category:category.value,text:text.value,context,includeTechnical:checkbox.checked});}
    catch(e){notice(e.message,true);text.focus();return;}
    const key=JSON.stringify(payload);if(key!==draftKey){attempt=newReportId();draftKey=key;}
    const ticket=generation;lock(true);notice('Enviando tu aviso…');
    try {
      const result=await onSend({id:attempt,category:payload.category,text:payload.message,context:payload.context,includeTechnical:checkbox.checked});
      if(ticket!==generation||getUser()!==owner)return;
      form.hidden=true;notice('Aviso recibido. Gracias por ayudarnos a mejorar Ochavo. Referencia: '+result.id.slice(0,8).toUpperCase());close.textContent='Volver a la lección';
    }catch(e){if(ticket===generation)notice('No se ha podido confirmar el envío. Conservamos tu texto: revisa la conexión y pulsa Enviar aviso para reintentarlo.',true);}
    finally{if(ticket===generation)lock(false);}
  });
  return {
    open(){
      const user=getUser();if(!user?.uid||user.isAnonymous||!user.emailVerified||isBusy())return false;
      const raw=getContext()||{},clean=reportContext(raw,true),same=owner===user&&JSON.stringify(context)===JSON.stringify(clean);
      if(!same){++generation;owner=user;context=clean;text.value='';checkbox.checked=false;attempt=null;draftKey='';category.value=['lesson','exam','case-lesson'].includes(clean.page)?'contenido':'funcionamiento';}
      opener=document.activeElement;location.textContent=reportLocation(clean);form.hidden=false;status.hidden=error.hidden=true;close.textContent='Cerrar';lock(false);
      if(!dialog.open)dialog.showModal();title.focus({preventScroll:true});return true;
    },
    reset,
    busy:()=>busy,
    dispose(){reset();dialog.remove();}
  };
}
