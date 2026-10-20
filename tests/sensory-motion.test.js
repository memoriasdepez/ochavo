import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLearningMotion} from '../src/motion.js';

const receipt=(id,gems,extra={})=>({owner:'A',duplicate:false,receipt:{id,gemDelta:gems,kind:'lesson',target:'lesson-450',...extra}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// A tiny DOM adapter exercises the actual modal handlers and persistent reward
// queue. Artwork rendering and the operating system's audio hardware are outside
// this test; no real account, browser or storage is used.
function fixture(){
  let doc;
  const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
  class Element{
    constructor(tag){
      this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;
      this.attributes=new Map();this.dataset={};this.listeners=new Map();
      this.className='';this.disabled=false;this.open=false;this.innerHTML='';
      this.style={setProperty(){}};
      this.classList={
        add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
        remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},
      };
    }
    get isConnected(){return this===doc.body||Boolean(this.parentElement?.isConnected);}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const node of this.children)node.parentElement=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
    setAttribute(name,value){this.attributes.set(name,String(value));}
    getAttribute(name){return this.attributes.get(name)??null;}
    addEventListener(type,handler){this.listeners.set(type,handler);}
    matches(selector){
      if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
      if(selector==='[data-reward-action]')return Object.hasOwn(this.dataset,'rewardAction');
      return this.tagName.toLowerCase()===selector;
    }
    querySelector(selector){return descendants(this).find(node=>node.matches(selector))||null;}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    focus(){doc.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  doc={body:new Element('body'),activeElement:null,createElement:tag=>new Element(tag)};
  const root=doc.createElement('div');doc.body.append(root);
  const feedback=doc.createElement('div');feedback.className='br-feedback';root.append(feedback);
  const select=root.querySelector.bind(root);
  root.querySelector=selector=>selector==='#br-feedback .br-feedback'?feedback:select(selector);
  const data=new Map(),calls=[],storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  let stops=0;
  const sensory={play:kind=>{calls.push(kind);return Promise.resolve(true);},stop:()=>{stops++;}};
  const motion=mountLearningMotion({root,doc,storage,sensory});motion.setOwner('A');
  const dialog=root.querySelector('dialog');
  return {motion,dialog,calls,storage,data,feedback,get stops(){return stops;},click(){
    const target=dialog.querySelector('button');assert.ok(target,'reward dialog has an action button');
    if(!target.disabled)dialog.listeners.get('click')({target});
  }};
}

test('earned badges play once on presentation, preserving Continue between queued rewards',async()=>{
  const f=fixture();
  f.motion.receive(receipt('first',10,{kind:'badge',target:'badge-first-lesson'}));
  f.motion.receive(receipt('second',10,{kind:'badge',target:'badge-streak-3'}));
  await f.motion.flush();
  assert.deepEqual(f.calls,[],'receiving rewards outside Aprende is silent');
  f.motion.setHome(true);assert.equal(f.motion.showPending(),true);
  assert.deepEqual(f.calls,['badge']);assert.equal(f.dialog.open,true);
  assert.equal(f.motion.showPending(),false);assert.deepEqual(f.calls,['badge']);
  f.click();await settle();
  assert.equal(f.motion.getView().id,'streak-3');assert.deepEqual(f.calls,['badge','badge']);
  f.click();await settle();
  assert.equal(f.motion.getView().phase,'closed');assert.deepEqual(f.calls,['badge','badge']);
  f.motion.reset();
});

test('the closed chest is silent and opening it through the button plays exactly once',async()=>{
  const f=fixture();f.motion.receive(receipt('exercise',1));f.motion.receive(receipt('exam',80));await f.motion.flush();
  f.motion.setHome(true);f.motion.showPending();
  assert.equal(f.motion.getView().phase,'closed');assert.equal(f.dialog.querySelector('button').textContent,'ABRIR COFRE');assert.deepEqual(f.calls,[]);
  f.click();assert.equal(f.motion.getView().phase,'open');assert.deepEqual(f.calls,['chest']);
  assert.equal(f.motion.openChest(),false);assert.deepEqual(f.calls,['chest']);
  assert.equal(f.dialog.querySelector('button').textContent,'CONTINUAR');
  f.click();await settle();
  assert.equal(f.motion.getView(),null);assert.equal(f.dialog.open,false);assert.deepEqual(f.calls,['chest']);
});

test('saving and a failed reward acknowledgement never replay its sound',async()=>{
  const f=fixture();f.motion.receive(receipt('badge',10,{kind:'badge',target:'badge-first-lesson'}));await f.motion.flush();
  f.motion.setHome(true);f.motion.showPending();
  f.storage.setItem=()=>{throw Error('disk full');};
  f.click();assert.equal(f.dialog.querySelector('button').disabled,true);await settle();
  assert.equal(f.motion.getView().saving,false);assert.match(f.dialog.querySelector('.och-reward-error').textContent,/reintentarlo/);assert.deepEqual(f.calls,['badge']);
  f.storage.setItem=(key,value)=>f.data.set(key,value);
  f.click();await settle();
  assert.equal(f.motion.getView().phase,'closed');assert.deepEqual(f.calls,['badge']);
  f.motion.reset();
});

test('only a correct answer triggers its short sensory cue and feedback stays immediately usable',()=>{
  const f=fixture();
  f.motion.answer(false);assert.deepEqual(f.calls,[]);
  f.motion.answer(true);assert.deepEqual(f.calls,['correct']);
  assert.ok(f.feedback.className.includes('och-motion-correct'));
  assert.equal(f.dialog.open,false,'exercise feedback must not open or advance the reward dialog');
  f.motion.reset();
});

test('resetting or switching owner cancels feedback without presenting another account’s rewards',()=>{
  const f=fixture();f.motion.receive(receipt('exercise',1));f.motion.setHome(true);f.motion.showPending();f.click();
  const beforeReset=f.stops;f.motion.reset();assert.ok(f.stops>beforeReset);assert.equal(f.dialog.open,false);
  f.motion.setHome(true);f.motion.showPending();f.click();const beforeSwitch=f.stops;
  f.motion.setOwner('B');assert.ok(f.stops>beforeSwitch);assert.equal(f.dialog.open,false);
  f.motion.setHome(true);assert.equal(f.motion.showPending(),false);assert.deepEqual(f.motion.pending(),{gems:0,badges:[]});
});
