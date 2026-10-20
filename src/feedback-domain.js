import {trackForLesson, trackForExam, lessonNumber,worldNumber,TRACKS} from './tracks.js';

export const REPORT_CATEGORIES = Object.freeze({contenido:'La explicación o el ejercicio',funcionamiento:'Algo no funciona',progreso:'Mi progreso o el guardado',cuenta:'Mi cuenta',otro:'Otro problema'});
export const REPORT_PAGES = Object.freeze(['map','detail','lesson','exam-detail','exam','exam-result','case-lesson','cases','profile','lab','help']);
export const cleanReportText = value => typeof value === 'string' ? value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\t/g,' ').slice(0,2000).trim() : '';

/** Strict allowlist: no answers, names, emails, tokens, URLs or error dumps. */
export function reportContext(input={}, includeTechnical=false) {
  const page=REPORT_PAGES.includes(input.page)?input.page:'help';
  const track=TRACKS.find(t=>t.id===input.track);
  const lesson=Number.isInteger(input.lessonId)&&trackForLesson(input.lessonId)?.id===track?.id ? input.lessonId : -1;
  const world=Number.isInteger(input.worldId)&&trackForExam(input.worldId)?.id===track?.id ? input.worldId : -1;
  const step=Number.isInteger(input.stepIndex)&&input.stepIndex>=0&&input.stepIndex<50 ? input.stepIndex : -1;
  const total=Number.isInteger(input.stepCount)&&input.stepCount>0&&input.stepCount<=50 ? input.stepCount : 0;
  const kind=typeof input.exerciseKind==='string'&&/^[a-z-]{1,40}$/.test(input.exerciseKind)?input.exerciseKind:'';
  const version=includeTechnical&&typeof input.appVersion==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion)?input.appVersion:'';
  const platform=includeTechnical&&['web','android','ios'].includes(input.platform?.toLowerCase?.())?input.platform.toLowerCase():'';
  const question=Number.isInteger(input.questionIndex)&&input.questionIndex>=0&&input.questionIndex<10?input.questionIndex:-1;
  return {page,track:track?.id||'',lessonId:lesson,worldId:world,stepIndex:step<total?step:-1,stepCount:total,questionIndex:question,exerciseKind:kind,appVersion:version,platform};
}

export function reportLocation(context) {
  const c=reportContext(context),track=TRACKS.find(t=>t.id===c.track);
  const parts=track?[track.name]:[];
  if(c.worldId>=0)parts.push('Mundo '+worldNumber(c.worldId));
  if(c.page==='exam'||c.page==='exam-result')parts.push('Examen');
  else if(c.page==='case-lesson')parts.push('Caso de estudio');
  else if(c.lessonId>=0)parts.push('Punto '+lessonNumber(c.lessonId));
  if(c.stepIndex>=0)parts.push('Paso '+(c.stepIndex+1)+' de '+c.stepCount);
  return parts.join(' · ')||({map:'Aprende',cases:'Casos',profile:'Perfil',lab:'Laboratorio'}[c.page]||'Ayuda');
}

export function prepareReport({category,text,context,includeTechnical=false}={}) {
  const message=cleanReportText(text);
  if(message.length<10)throw Error('Describe el problema con al menos 10 caracteres.');
  if(!Object.hasOwn(REPORT_CATEGORIES,category))throw Error('Elige el tipo de problema.');
  return {schemaVersion:1,category,message,context:reportContext(context,includeTechnical)};
}

export const newReportId=()=>crypto.randomUUID().replace(/-/g,'');
