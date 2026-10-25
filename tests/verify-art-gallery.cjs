/* Run the production gallery alongside the portfolio's existing dialog bindings.
   Media APIs and DOM are fixtures; this is not a browser playback test. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base, file), 'utf8').replace(/\r\n/g, '\n');
const source = read('art-gallery.js');
new vm.Script(source);

function matches(node, selector) {
  const excluded = [...selector.matchAll(/:not\(([^()]*)\)/g)].map(match => match[1]);
  selector = selector.replace(/:not\([^()]*\)/g, '');
  if (excluded.some(part => matches(node, part))) return false;
  const tag = selector.match(/^[a-z][\w:-]*/i)?.[0];
  if (tag && tag.toLowerCase() !== node.tag.toLowerCase()) return false;
  for (const match of selector.matchAll(/#([\w-]+)/g)) if (node.id !== match[1]) return false;
  for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(match[1])) return false;
  for (const match of selector.matchAll(/\[([^\]=\s]+)(?:\s*=\s*["']?([^\]"']+)["']?)?\]/g)) {
    if (!node.hasAttribute(match[1])) return false;
    if (match[2] !== undefined && node.getAttribute(match[1]) !== match[2]) return false;
  }
  return true;
}
class Node {
  constructor(tag, doc) {
    this.tag = tag; this.ownerDocument = doc; this.children = []; this.parentElement = null;
    this.attrs = new Map(); this.dataset = {}; this.events = new Map(); this.classes = new Set(); this.inert = false;
    this.classList = {add:(...names)=>names.forEach(name=>this.classes.add(name)), remove:(...names)=>names.forEach(name=>this.classes.delete(name)), contains:name=>this.classes.has(name), toggle:(name,on)=>{if(on??!this.classes.has(name))this.classes.add(name);else this.classes.delete(name);}};
    this.properties = new Map();
    this.style = {setProperty:(key,value)=>this.properties.set(key,String(value)), getPropertyValue:key=>this.properties.get(key)||'', removeProperty:key=>this.properties.delete(key)};
  }
  get id() { return this.getAttribute('id') || ''; }
  get open() { return this.hasAttribute('open'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { value ? this.setAttribute('disabled','') : this.removeAttribute('disabled'); }
  get hidden() { return this.hasAttribute('hidden'); }
  get isConnected() { return this.tag === '#document' || !!this.parentElement?.isConnected; }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); }
  setAttribute(key, value) {
    this.attrs.set(key, String(value));
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (key === 'class') String(value).split(/\s+/).filter(Boolean).forEach(name => this.classes.add(name));
  }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  hasAttribute(key) { return this.attrs.has(key); }
  removeAttribute(key) { this.attrs.delete(key); }
  append(child) {
    if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child),1);
    child.parentElement = this; this.children.push(child);
  }
  descendants() { return this.children.flatMap(child => [child,...child.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter(child => selector.split(',').some(part => matches(child,part.trim()))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(child) { return child === this || this.descendants().includes(child); }
  closest(selector) { return selector.split(',').some(part=>matches(this,part.trim()))?this:this.parentElement?.closest(selector)||null; }
  getClientRects() { return this.hidden || !this.isConnected ? [] : [{}]; }
  getBoundingClientRect() { return {left:100,right:900,top:100,bottom:700,width:800,height:600}; }
  focus() { this.ownerDocument.activeElement = this; this.focusCount = (this.focusCount || 0)+1; }
  addEventListener(name, callback, capture = false) {
    if (!this.events.has(name)) this.events.set(name,[]);
    this.events.get(name).push({callback,capture:!!capture});
  }
  emit(name, properties = {}) {
    const event = {target:this,currentTarget:this,defaultPrevented:false,propagationStopped:false,clientX:400,clientY:400,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.propagationStopped=true;},...properties};
    const handlers = [...(this.events.get(name)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture));
    for (const handler of handlers) { handler.callback(event); if (event.propagationStopped) break; }
    return event;
  }
}
function parse(text) {
  const doc = new Node('#document'); doc.ownerDocument = doc;
  const stack = [doc], voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  for (const token of text.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { const name=token.match(/^<\/([\w:-]+)/)?.[1].toLowerCase(); while(stack.length>1) if(stack.pop().tag.toLowerCase()===name) break; continue; }
    const parsed=token.match(/^<([\w:-]+)([\s\S]*?)(\/?)>$/); if(!parsed)continue;
    const node=new Node(parsed[1],doc);
    for(const attr of parsed[2].matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) node.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
    stack.at(-1).append(node); if(!parsed[3]&&!voids.has(node.tag))stack.push(node);
  }
  doc.documentElement=doc.querySelector('html'); doc.body=doc.querySelector('body'); doc.activeElement=doc.body;
  Object.defineProperty(doc,'hidden',{value:false,writable:true});
  doc.getElementById=id=>doc.querySelector('#'+id); return doc;
}
function environment(mode='native', tamper=false, options={}) {
  const doc=parse(read('index.html'));
  const dialog=doc.getElementById('art-lightbox'), section=doc.getElementById('arte');
  assert(dialog&&section,'Production HTML must contain the artwork section and lightbox');
  const cards=section.querySelectorAll('[data-drawing]');
  assert.equal(cards.length,9,'All nine original drawings must be present');
  const invalid=cards[8];
  if(tamper)invalid.setAttribute('data-art-src','https://example.invalid/altered.webp');
  const image=doc.getElementById('art-lightbox-image'), cursor=doc.getElementById('cursor');
  if(mode!=='fallback'){
    dialog.showModal=()=>{if(mode==='native-throws')throw new Error('Fixture unavailable');dialog.setAttribute('open','');};
    dialog.close=()=>{dialog.removeAttribute('open');dialog.emit('close');};
  }
  const globalEvents=new Node('window',doc), observers=[], intersections=[], frames=new Map(),timers=new Map();let frameId=0,timerId=0,now=0;
  const media={matches:true,addEventListener(name,callback){this.changed=callback;}};
  const preference={matches:!options.motion,addEventListener(name,callback){this.changed=callback;}};
  const context=vm.createContext({document:doc,Element:Node,WeakMap,WeakSet,console,
    addEventListener:globalEvents.addEventListener.bind(globalEvents),matchMedia:query=>query.includes('reduced-motion')?preference:media,
    requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    MutationObserver:class {constructor(callback){this.callback=callback;observers.push(this);}observe(node){this.node=node;}}
  });context.window=context;
  if(options.intersection!==false)context.IntersectionObserver=class {
    constructor(callback){this.callback=callback;this.targets=new Set();intersections.push(this);}
    observe(target){this.targets.add(target);}unobserve(target){this.targets.delete(target);}disconnect(){this.targets.clear();this.disconnected=true;}
  };
  const app=read('app.js');
  const generic=app.slice(app.indexOf('  function focusFirst(dialog)'),app.indexOf('  function element(tag, className, text)'));
  Object.assign(context,{root:doc.documentElement,cursor,mobileNav:doc.getElementById('mobile-nav'),returnFocus:new WeakMap(),dialogFallback:new WeakSet(),
    $:(selector,scope=doc)=>scope.querySelector(selector),$$:(selector,scope=doc)=>scope.querySelectorAll(selector),setMenu(){},resetImageZoom(){}});
  vm.runInContext(generic+'\nglobalThis.externalClose=closeDialog;',context);
  vm.runInContext(source,context,{filename:'art-gallery.js'});
  return {doc,dialog,section,image,cursor,cards,invalid,context,globalEvents,observers,intersections,media,preference,frames,timers,
    flush(){const queued=[...frames.values()];frames.clear();queued.forEach(callback=>callback(16));},
    advance(ms){now+=ms;for(const[id,timer]of[...timers])if(timer.at<=now){timers.delete(id);timer.callback();}},
    mutateRoot(){for(const observer of observers)if(observer.node===doc.documentElement)observer.callback([{attributeName:'class'}]);},
    $:selector=>doc.querySelector(selector)};
}

let revealChecks=0,dialogChecks=0,navigationChecks=0,focusChecks=0,motionChecks=0;
const pointer=environment(), card=pointer.cards[0], surface=card.querySelector('.drawing-surface');
assert(surface);assert.equal(surface.style.getPropertyValue('--reveal-active'),'');assert.equal(pointer.frames.size,0);revealChecks++;
card.emit('pointermove',{pointerType:'mouse',clientX:280,clientY:310});
card.emit('pointermove',{pointerType:'mouse',clientX:340,clientY:370});
assert.equal(pointer.frames.size,1);assert.equal(surface.style.getPropertyValue('--reveal-active'),'');pointer.flush();
assert.equal(surface.style.getPropertyValue('--reveal-x'),'240.00px');assert.equal(surface.style.getPropertyValue('--reveal-y'),'270.00px');assert.equal(surface.style.getPropertyValue('--reveal-active'),'1');revealChecks++;
card.emit('pointermove',{pointerType:'mouse',clientX:-50,clientY:1500});pointer.flush();
assert.equal(surface.style.getPropertyValue('--reveal-x'),'0.00px');assert.equal(surface.style.getPropertyValue('--reveal-y'),'600.00px');revealChecks++;
card.emit('pointermove',{pointerType:'mouse',clientX:500,clientY:500});assert.equal(pointer.frames.size,1);card.emit('pointerleave');assert.equal(pointer.frames.size,0);assert.equal(surface.style.getPropertyValue('--reveal-active'),'0');assert.equal(surface.style.getPropertyValue('--reveal-x'),'');revealChecks++;
card.emit('pointermove',{pointerType:'touch',clientX:300,clientY:300});assert.equal(pointer.frames.size,0);assert.equal(surface.style.getPropertyValue('--reveal-active'),'0');revealChecks++;
pointer.media.matches=false;card.emit('pointermove',{pointerType:'mouse',clientX:300,clientY:300});assert.equal(pointer.frames.size,0);revealChecks++;
pointer.media.matches=true;pointer.doc.documentElement.classList.add('motion-off');card.emit('pointermove',{pointerType:'mouse',clientX:300,clientY:300});pointer.flush();assert.equal(surface.style.getPropertyValue('--reveal-active'),'1');revealChecks++;
card.emit('focus');assert.equal(surface.style.getPropertyValue('--reveal-x'),'400.00px');assert.equal(surface.style.getPropertyValue('--reveal-y'),'300.00px');card.emit('blur');assert.equal(surface.style.getPropertyValue('--reveal-active'),'0');revealChecks++;
card.emit('pointermove',{pointerType:'mouse',clientX:400,clientY:400});pointer.media.matches=false;pointer.media.changed();assert.equal(pointer.frames.size,0);assert.equal(surface.style.getPropertyValue('--reveal-active'),'0');revealChecks++;
pointer.media.matches=true;card.emit('pointermove',{pointerType:'mouse',clientX:400,clientY:400});pointer.flush();pointer.doc.hidden=true;pointer.doc.emit('visibilitychange');assert.equal(surface.style.getPropertyValue('--reveal-active'),'0');revealChecks++;

for(const mode of ['native','fallback','native-throws']) {
  const e=environment(mode), {doc,dialog,image,cards}=e, opener=cards[0];
  assert(!dialog.open);assert.equal(image.getAttribute('src'),null);dialogChecks++;
  opener.focus();opener.emit('click');
  assert(dialog.open);assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(e.section.dataset.lightboxOpen,'true');assert(doc.documentElement.classList.contains('art-lightbox-open'));
  assert.equal(image.getAttribute('src'),opener.dataset.artSrc);assert.equal(image.getAttribute('alt'),opener.dataset.artAlt);
  assert.equal(e.cursor.parentElement,dialog);assert.equal(doc.activeElement,e.$('#art-lightbox-close'));assert.equal(e.$('#art-lightbox-count').textContent,'01 / 09');dialogChecks++;
  for(let i=1;i<cards.length;i++){
    e.$('#art-lightbox-next').emit('click');assert.equal(image.getAttribute('src'),cards[i].dataset.artSrc);assert.equal(e.$('#art-lightbox-title').textContent,cards[i].dataset.artTitle);assert.equal(e.$('#art-lightbox-caption').textContent,cards[i].dataset.artCaption);navigationChecks++;
  }
  e.$('#art-lightbox-next').emit('click');assert.equal(image.getAttribute('src'),cards[0].dataset.artSrc);e.$('#art-lightbox-prev').emit('click');assert.equal(image.getAttribute('src'),cards[8].dataset.artSrc);navigationChecks++;
  assert(dialog.emit('keydown',{key:'Home'}).defaultPrevented);assert.equal(image.getAttribute('src'),cards[0].dataset.artSrc);
  assert(dialog.emit('keydown',{key:'End'}).defaultPrevented);assert.equal(image.getAttribute('src'),cards[8].dataset.artSrc);navigationChecks++;
  dialog.emit('keydown',{key:'ArrowRight'});assert.equal(image.getAttribute('src'),cards[0].dataset.artSrc);dialog.emit('keydown',{key:'ArrowLeft'});assert.equal(image.getAttribute('src'),cards[8].dataset.artSrc);navigationChecks++;
  const zoom=e.$('#art-lightbox-zoom'),scroller=e.$('.art-lightbox-scroller');assert(zoom&&scroller);
  zoom.emit('click');assert.equal(zoom.getAttribute('aria-pressed'),'true');assert(scroller.classList.contains('is-zoomed'));assert.equal(doc.activeElement,scroller);navigationChecks++;
  const old=image.getAttribute('src');assert(!dialog.emit('keydown',{key:'ArrowLeft',target:scroller}).defaultPrevented);assert.equal(image.getAttribute('src'),old);scroller.scrollTop=90;scroller.scrollLeft=40;
  e.$('#art-lightbox-next').emit('click');assert.equal(zoom.getAttribute('aria-pressed'),'false');assert(!scroller.classList.contains('is-zoomed'));assert.equal(scroller.scrollTop,0);assert.equal(scroller.scrollLeft,0);navigationChecks++;
  if(mode!=='native'){
    const main=doc.querySelector('main');assert.equal(main.getAttribute('aria-hidden'),'true');assert(main.inert);focusChecks++;
    const focusables=dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const last=focusables.at(-1);last.focus();const tab=dialog.emit('keydown',{key:'Tab'});assert(tab.defaultPrevented);assert.equal(doc.activeElement,e.$('#art-lightbox-close'));focusChecks++;
    const reverse=dialog.emit('keydown',{key:'Tab',shiftKey:true});assert(reverse.defaultPrevented);assert.equal(doc.activeElement,last);focusChecks++;
    opener.focus();doc.emit('focusin',{target:opener});assert.equal(doc.activeElement,e.$('#art-lightbox-close'));focusChecks++;
  }
  dialog.emit(mode==='native'?'cancel':'keydown',{key:'Escape'});
  assert(!dialog.open);assert.equal(image.getAttribute('src'),null);assert.equal(image.getAttribute('alt'),'');assert.equal(e.cursor.parentElement,doc.body);assert.equal(e.section.dataset.lightboxOpen,'false');assert(!doc.documentElement.classList.contains('art-lightbox-open'));assert.equal(doc.activeElement,opener);dialogChecks++;
  if(mode!=='native'){assert.equal(doc.querySelector('main').getAttribute('aria-hidden'),null);assert.equal(doc.querySelector('main').getAttribute('inert'),null);assert(!doc.querySelector('main').inert);focusChecks++;}
  for(let i=0;i<cards.length;i++){
    cards[i].focus();cards[i].emit('click');assert.equal(image.getAttribute('src'),cards[i].dataset.artSrc);e.$('#art-lightbox-close').emit('click');assert.equal(doc.activeElement,cards[i]);assert.equal(image.getAttribute('src'),null);navigationChecks++;
  }
  opener.emit('click');const inside=dialog.emit('click',{clientX:500,clientY:400});assert(!inside.defaultPrevented);assert(dialog.open);
  const backdrop=dialog.emit('click',{clientX:1,clientY:1});assert(backdrop.defaultPrevented);assert(backdrop.propagationStopped);assert(!dialog.open);assert.equal(image.getAttribute('src'),null);dialogChecks++;
  opener.emit('click');e.context.externalClose(dialog);for(const observer of e.observers)observer.callback([{attributeName:'open'}]);assert(!dialog.open);assert.equal(image.getAttribute('src'),null);assert.equal(e.section.dataset.lightboxOpen,'false');dialogChecks++;
  opener.emit('click');const focusCount=opener.focusCount;e.globalEvents.emit('pagehide');assert(!dialog.open);assert.equal(image.getAttribute('src'),null);assert.equal(opener.focusCount,focusCount);dialogChecks++;
}
const invalid=environment('native',true);assert(invalid.invalid.disabled);invalid.invalid.emit('click');assert(!invalid.dialog.open);dialogChecks++;
const restoration=environment('fallback'),header=restoration.doc.querySelector('header');header.setAttribute('aria-hidden','false');header.setAttribute('inert','prior-value');header.inert=true;restoration.cards[0].emit('click');restoration.$('#art-lightbox-close').emit('click');assert.equal(header.getAttribute('aria-hidden'),'false');assert.equal(header.getAttribute('inert'),'prior-value');assert(header.inert);focusChecks++;
const remaining=environment('native');remaining.cards[0].focus();remaining.cards[0].emit('click');const contact=remaining.$('#contact-dialog');contact.setAttribute('open','');contact.focus();remaining.$('#art-lightbox-close').emit('click');assert.equal(remaining.doc.activeElement,contact);assert.equal(remaining.cursor.parentElement,contact);assert(contact.open);dialogChecks++;

const animated=environment('native',false,{motion:true});
assert(animated.section.classList.contains('art-motion-ready'));assert.equal(animated.intersections.length,1);assert.equal(animated.intersections[0].targets.size,9);motionChecks++;
const firstFigure=animated.cards[0].closest('.drawing-entry');
animated.intersections[0].callback([{target:firstFigure,isIntersecting:false}]);assert(!firstFigure.classList.contains('art-is-visible'));
animated.intersections[0].callback([{target:firstFigure,isIntersecting:true}]);assert(firstFigure.classList.contains('art-is-visible'));assert.equal(animated.intersections[0].targets.size,8);motionChecks++;
animated.cards[0].getBoundingClientRect=()=>({left:0,top:0,width:20,height:20});
animated.cards[0].emit('pointermove',{pointerType:'mouse',clientX:900,clientY:100});animated.flush();
assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'2.50deg');assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-y'),'2.50deg');motionChecks++;
animated.cards[0].emit('pointermove',{pointerType:'mouse',clientX:-900,clientY:1500});animated.flush();
assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'-2.50deg');assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-y'),'-2.50deg');motionChecks++;
animated.cards[0].emit('pointerleave');assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'');assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-y'),'');assert.equal(animated.frames.size,0);motionChecks++;
animated.cards[0].emit('pointermove',{pointerType:'touch',clientX:900,clientY:100});assert.equal(animated.frames.size,0);assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'');motionChecks++;
animated.cards[0].emit('pointermove',{pointerType:'mouse',clientX:900,clientY:100});animated.flush();animated.doc.documentElement.classList.add('motion-off');animated.mutateRoot();
assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'');assert(!animated.section.classList.contains('art-motion-ready'));assert(animated.cards.every(item=>item.closest('.drawing-entry').classList.contains('art-is-visible')));assert(animated.intersections[0].disconnected);motionChecks++;
animated.cards[0].emit('pointermove',{pointerType:'mouse',clientX:340,clientY:370});animated.flush();assert.equal(animated.cards[0].querySelector('.drawing-surface').style.getPropertyValue('--reveal-active'),'1');assert.equal(animated.cards[0].style.getPropertyValue('--art-tilt-x'),'');motionChecks++;

const phase=environment('native',false,{motion:true});phase.cards[0].focus();phase.cards[0].emit('click');
assert(phase.dialog.classList.contains('art-is-opening'));assert.equal(phase.timers.size,1);assert(phase.dialog.open);motionChecks++;
phase.image.emit('load');assert(phase.$('.art-lightbox-scroller').classList.contains('art-image-enter'));assert.equal(phase.$('.art-lightbox-scroller').dataset.artDirection,'open');assert.equal(phase.timers.size,2);motionChecks++;
phase.image.emit('animationend');assert(!phase.$('.art-lightbox-scroller').classList.contains('art-image-enter'));
phase.dialog.emit('animationend',{target:phase.image,animationName:'artImageIn'});assert(phase.dialog.classList.contains('art-is-opening'));
phase.dialog.emit('animationend',{animationName:'artDialogOpen'});assert(!phase.dialog.classList.contains('art-is-opening'));assert.equal(phase.timers.size,0);motionChecks++;
phase.image.complete=true;phase.image.naturalWidth=1800;
let restarts=0;Object.defineProperty(phase.image,'offsetWidth',{get(){restarts++;return 800;}});
phase.$('#art-lightbox-next').emit('click');assert.equal(phase.$('.art-lightbox-scroller').dataset.artDirection,'next');assert(phase.$('.art-lightbox-scroller').classList.contains('art-image-enter'));assert.equal(phase.timers.size,1);
phase.$('#art-lightbox-prev').emit('click');assert.equal(phase.$('.art-lightbox-scroller').dataset.artDirection,'previous');assert.equal(phase.timers.size,1);assert(restarts>=2);motionChecks++;
phase.$('#art-lightbox-zoom').emit('click');assert(phase.dialog.classList.contains('art-is-zooming'));assert(phase.$('.art-lightbox-scroller').classList.contains('is-zoomed'));phase.advance(260);assert(!phase.dialog.classList.contains('art-is-zooming'));motionChecks++;
phase.$('#art-lightbox-next').emit('click');assert.equal(phase.$('#art-lightbox-zoom').getAttribute('aria-pressed'),'false');
phase.$('#art-lightbox-close').emit('click');assert(phase.dialog.open);assert(phase.dialog.classList.contains('art-is-closing'));assert(!phase.dialog.classList.contains('art-is-opening'));assert(!phase.$('.art-lightbox-scroller').classList.contains('art-image-enter'));assert.equal(phase.timers.size,1);motionChecks++;
const closingSource=phase.image.getAttribute('src');phase.$('#art-lightbox-next').emit('click');assert.equal(phase.image.getAttribute('src'),closingSource);
phase.dialog.emit('cancel');assert.equal(phase.timers.size,1);phase.advance(229);assert(phase.dialog.open);phase.advance(1);assert(!phase.dialog.open);assert.equal(phase.image.getAttribute('src'),null);assert.equal(phase.timers.size,0);assert.equal(phase.doc.activeElement,phase.cards[0]);motionChecks++;
phase.cards[1].emit('click');phase.$('#art-lightbox-close').emit('click');phase.dialog.emit('animationend',{animationName:'artDialogIn'});assert(phase.dialog.open);phase.dialog.emit('animationend',{animationName:'artDialogOut'});assert(!phase.dialog.open);assert.equal(phase.timers.size,0);motionChecks++;
phase.cards[0].emit('click');phase.$('#art-lightbox-close').emit('click');phase.doc.documentElement.classList.add('motion-off');phase.mutateRoot();assert(!phase.dialog.open);assert.equal(phase.timers.size,0);motionChecks++;
const preferenceClose=environment('native',false,{motion:true});preferenceClose.cards[0].emit('click');preferenceClose.$('#art-lightbox-close').emit('click');preferenceClose.preference.matches=true;preferenceClose.preference.changed();assert(!preferenceClose.dialog.open);assert.equal(preferenceClose.timers.size,0);assert(preferenceClose.cards.every(item=>item.closest('.drawing-entry').classList.contains('art-is-visible')));motionChecks++;
const hiddenClose=environment('native',false,{motion:true});hiddenClose.cards[0].emit('click');hiddenClose.$('#art-lightbox-close').emit('click');hiddenClose.doc.hidden=true;hiddenClose.doc.emit('visibilitychange');assert(!hiddenClose.dialog.open);assert.equal(hiddenClose.timers.size,0);motionChecks++;
const pageClose=environment('native',false,{motion:true});pageClose.cards[0].focus();pageClose.cards[0].emit('click');const priorFocus=pageClose.cards[0].focusCount;pageClose.$('#art-lightbox-close').emit('click');pageClose.globalEvents.emit('pagehide');assert(!pageClose.dialog.open);assert.equal(pageClose.timers.size,0);assert.equal(pageClose.cards[0].focusCount,priorFocus);motionChecks++;
const interrupted=environment('native',false,{motion:true});interrupted.cards[0].emit('click');interrupted.$('#art-lightbox-close').emit('click');const newDialog=interrupted.$('#contact-dialog');newDialog.setAttribute('open','');newDialog.focus();interrupted.context.externalClose(interrupted.dialog);interrupted.advance(1000);assert(!interrupted.dialog.open);assert(newDialog.open);assert.equal(interrupted.doc.activeElement,newDialog);assert.equal(interrupted.cursor.parentElement,newDialog);assert.equal(interrupted.timers.size,0);motionChecks++;
const noObserver=environment('native',false,{motion:true,intersection:false});assert(!noObserver.section.classList.contains('art-motion-ready'));assert(noObserver.cards.every(item=>item.closest('.drawing-entry').classList.contains('art-is-visible')));noObserver.cards[0].emit('click');noObserver.mutateRoot();assert(noObserver.dialog.classList.contains('art-is-opening'));noObserver.advance(520);assert(!noObserver.dialog.classList.contains('art-is-opening'));noObserver.$('#art-lightbox-close').emit('click');noObserver.advance(230);assert(!noObserver.dialog.open);assert.equal(noObserver.timers.size,0);motionChecks++;
const fallbackExit=environment('fallback',false,{motion:true});fallbackExit.cards[0].emit('click');fallbackExit.$('#art-lightbox-close').emit('click');const lastFocusable=fallbackExit.$('.art-lightbox-scroller');lastFocusable.focus();assert(fallbackExit.dialog.emit('keydown',{key:'Tab'}).defaultPrevented);assert.equal(fallbackExit.doc.activeElement,fallbackExit.$('#art-lightbox-close'));fallbackExit.advance(230);assert(!fallbackExit.dialog.open);assert.equal(fallbackExit.doc.querySelector('main').getAttribute('inert'),null);motionChecks++;
const reduced=environment();reduced.cards[0].emit('click');assert(!reduced.dialog.classList.contains('art-is-opening'));assert.equal(reduced.timers.size,0);reduced.image.emit('load');assert(!reduced.$('.art-lightbox-scroller').classList.contains('art-image-enter'));reduced.$('#art-lightbox-close').emit('click');assert(!reduced.dialog.open);motionChecks++;
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|setInterval)\s*\(/.test(source));
const report={checks:'passed',drawings:9,revealChecks,dialogChecks,navigationChecks,focusChecks,motionChecks,
  controllerSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'art-gallery.js'))).digest('hex'),
  covered:['actual nine drawing buttons and production controller','one coalesced pointer frame','bounded local reveal coordinates','pointer exit/cancel and coarse input reset','manual reveal while global animations paused','keyboard centered reveal','touch opens original without hover dependence','nine original photographs and captions','wraparound navigation and keyboard shortcuts','zoom without hijacking pan keys','zoom reset on navigation and close','native/fallback Escape','cursor portal and focus return','fallback focus trap and exact outside attributes restore','existing generic app dialog bindings','outside backdrop only','external close and pagehide cleanup','whitelisted local image paths','one-shot intersection entrances with unsupported fallback','bounded tilt measured from stable figure','opening and directional image phases','finite zoom pulse','animated close with timer and animationend completion','reduced motion and global pause cancellation','background and pagehide immediate cleanup','interrupted close preserves another active modal','fallback focus trap during exit animation'],
  limitation:'DOM doubles validate interactions. No browser rendering or visual mask support test was performed; the previous explicit local portfolio URL access block was respected.'};
fs.writeFileSync(path.join(__dirname,'results/art-gallery-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
