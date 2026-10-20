import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {emptySnapshot} from '../src/progress.js';
import {fullCourseTestData} from './course-fixture.js';
import * as exerciseFormats from '../src/exercise-formats.js';
import * as matchArrows from '../src/match-arrows.js';
import * as technicalCharts from '../src/technical-charts.js';
import {renderCalculator} from '../src/exercise-calculator.js';
import {renderGrowthLab} from '../src/growth-lab.js';
const source=readFileSync(new URL('../src/course.js',import.meta.url),'utf8');
const data=fullCourseTestData();
export const lessons=JSON.parse(data['br-invest-lessons']);
export const exams=JSON.parse(data['br-exams']);
const copy=value=>JSON.parse(JSON.stringify(value));
export function mount(snapshot=emptySnapshot(),skippedWorldIds=null,laboratory=null){
  const handlers={},nodes=new Map();
  let number=null,saved=null;
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',insertAdjacentHTML(position,html){this.innerHTML=position==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){}});
    return nodes.get(selector);
  };
  const main=node('#br-main');
  main.querySelector=selector=>selector==='#br-number'?number:selector==='#br-viz-output'?null:node(selector);
  main.querySelectorAll=()=>[];
  const root={querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(type,handler)=>{handlers[type]=handler;}};
  const window={OchavoExercises:exerciseFormats,OchavoMatchArrows:matchArrows,OchavoCandles:technicalCharts,OchavoCalculator:{render:renderCalculator},OchavoGrowthLab:{render:renderGrowthLab,readValues:()=>null},virutaAccess:{canLearn:()=>true},broteStore:{getSnapshot:()=>copy(snapshot),save:p=>{saved=copy(p);return true;}}};
  if(laboratory)window.OchavoLaboratory=laboratory;
  if(skippedWorldIds)window.virutaGame={getView:()=>({skippedWorldIds,canPlay:true})};
  vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?root:{textContent:data[id]}},TextEncoder,requestAnimationFrame:callback=>callback()});
  return {window,course:window.BroteCourse,main,get saved(){return saved;},setNumber:value=>{number=value===null?null:{value};},click(dataset){
    const button={dataset,disabled:false,closest(){return this;},hasAttribute:attribute=>Object.hasOwn(dataset,attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};
    handlers.click({target:button,preventDefault(){}});
  }};
}

export function selectTrack(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  app.click({track:id});
}
export function openLesson(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  if(!app.main.innerHTML.includes(`data-detail="${id}"`))app.click({group:String(Math.floor(id/10))});
  assert.ok(app.main.innerHTML.includes(`data-detail="${id}"`));
  app.click({detail:String(id)});
  if(app.main.dataset.view==='detail'){
    assert.ok(app.main.innerHTML.includes(`data-start="${id}"`));
    app.click({start:String(id)});
  }
  assert.equal(app.main.dataset.view,'lesson');
}
export function openExam(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  if(!app.main.innerHTML.includes(`data-exam-detail="${id}"`))app.click({group:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-detail="${id}"`));
  app.click({examDetail:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-start="${id}"`));
  app.click({examStart:String(id)});
}
