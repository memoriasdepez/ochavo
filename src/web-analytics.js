import {LESSON_COUNT,WORLD_COUNT,CASE_WORLD_IDS} from './tracks.js';
export const ANALYTICS_VERSION=1;
export const ANALYTICS_KEY='ochavo:web-analytics-consent';
export const ANALYTICS_MAX_AGE=180*24*60*60*1000;
const caseWorlds=new Set(CASE_WORLD_IDS);
const pages={map:'aprende',profile:'perfil',cases:'casos',lab:'laboratorio',lesson:'leccion',exam:'examen','case-lesson':'caso',success:'punto-completado','exam-result':'resultado-examen','case-success':'caso-completado',detail:'punto',glossary:'glosario',sources:'fuentes','exam-detail':'examen',gate:'inicio'};
export function analyticsChoice(storage,now=Date.now()){
 try{const c=JSON.parse(storage.getItem(ANALYTICS_KEY));return c?.version===ANALYTICS_VERSION&&typeof c.accepted==='boolean'&&Number.isFinite(c.at)&&c.at<=now&&now-c.at<ANALYTICS_MAX_AGE?c.accepted:null;}catch{return null;}
}
export function cleanAnalyticsParams(params={}){
 const clean={};if(['stocks','etfs','crypto','technical'].includes(params.track))clean.learning_track=params.track;
 for(const [key,max] of Object.entries({lesson_id:LESSON_COUNT-1,world_id:WORLD_COUNT-1,case_id:WORLD_COUNT-1,score:10}))if(Number.isInteger(params[key])&&params[key]>=0&&params[key]<=max&&(key!=='case_id'||caseWorlds.has(params[key])))clean[key]=params[key];
 if(typeof params.passed==='boolean')clean.passed=params.passed;
 return clean;
}
const events=new Set(['sign_up','login','lesson_start','lesson_complete','exam_start','exam_complete','case_start','case_complete']);
export function createWebAnalytics({enabled,id,storage,origin,now=Date.now,loadTag,disable,clearCookies}){
 const usable=Boolean(enabled&&/^G-[A-Z0-9]+$/.test(id||''));let choice=usable?analyticsChoice(storage,now()):null,tag=null,loading=null,lastScreen='',screen={page:'gate'};
 const accepted=()=>usable&&choice===true;
 async function start(){
  if(!accepted())return false;if(tag)return true;if(loading)return loading;
  loading=(async()=>{try{const next=await loadTag(id);if(!accepted())return false;tag=next;disable(false);tag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});tag('js',new Date(now()));tag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:origin+'/',page_referrer:'',page_title:'Ochavo',cookie_expires:63072000});return true;}catch{return false;}finally{loading=null;}})();return loading;
 }
 async function track(name,params){if(!events.has(name)||!accepted()||!await start()||!accepted())return false;tag('event',name,{...cleanAnalyticsParams(params),page_location:origin+'/',page_referrer:'',page_title:'Ochavo'});return true;}
 async function view(next){screen=next;const name=pages[next.page]||'aprende',key=[name,next.track,next.lesson_id,next.world_id,next.case_id].join(':');if(key===lastScreen||!accepted()||!await start()||!accepted())return false;lastScreen=key;tag('event','page_view',{...cleanAnalyticsParams(next),page_location:origin+'/'+name,page_referrer:'',page_title:'Ochavo · '+name});if(['lesson','exam','case-lesson'].includes(next.page))await track({'lesson':'lesson_start',exam:'exam_start','case-lesson':'case_start'}[next.page],next);return true;}
 async function choose(value){if(!usable)return false;choice=value===true;try{storage.setItem(ANALYTICS_KEY,JSON.stringify({version:ANALYTICS_VERSION,accepted:choice,at:now()}));}catch{choice=false;disable(true);clearCookies();return false;}lastScreen='';if(choice&&tag){disable(false);tag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});}if(!choice){disable(true);tag?.('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});clearCookies();return true;}await view(screen);return true;}
 return {available:usable,choice:()=>choice,choose,track,view,start:()=>view(screen),syncChoice:async()=>{const next=analyticsChoice(storage,now());if(next===choice)return;choice=next;lastScreen='';if(!accepted()){disable(true);tag?.('consent','update',{analytics_storage:'denied'});clearCookies();}else{disable(false);tag?.('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});await view(screen);}}};
}
export function browserAnalytics({enabled,id,storage=localStorage,origin=location.origin}){
 const disable=value=>{window['ga-disable-'+id]=value;};
 const clearCookies=()=>{for(const cookie of document.cookie.split(';')){const name=cookie.trim().split('=')[0];if(!/^_ga(?:_|$)/.test(name))continue;for(const domain of ['',location.hostname,'.'+location.hostname,'.ochavo.app'])document.cookie=name+'=; Max-Age=0; path=/'+(domain?'; domain='+domain:'')+'; SameSite=Lax; Secure';}};
 const loadTag=async()=>{
  window.dataLayer=window.dataLayer||[];const gtag=function(){window.dataLayer.push(arguments);};
  gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;
  // Queue our explicit consent/config before the external script executes.
  document.head.append(script);return gtag;
 };
 const controller=createWebAnalytics({enabled,id,storage,origin,loadTag,disable,clearCookies});
  if(controller.available){disable(controller.choice()!==true);window.addEventListener('storage',e=>{if(e.key===ANALYTICS_KEY)void controller.syncChoice();});}
 return controller;
}
