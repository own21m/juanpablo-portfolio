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
const source = read('robot-gallery.js');
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
    this.classList = {add:(...names)=>names.forEach(name=>this.classes.add(name)), remove:(...names)=>names.forEach(name=>this.classes.delete(name)), contains:name=>this.classes.has(name)};
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
function environment(mode='native', tamper=false, extraNavigation=false) {
  const doc=parse(read('index.html'));
  const dialog=doc.getElementById('robot-gallery'), opener=doc.getElementById('robot-gallery-open');
  assert(dialog && opener,'Production HTML must contain the gallery');
  const video=doc.getElementById('robot-gallery-video'), section=doc.getElementById('robotica'), cursor=doc.getElementById('cursor');
  if(extraNavigation)for(const id of ['robot-video-prev','robot-video-next']) {const button=new Node('button',doc);button.setAttribute('id',id);dialog.append(button);}
  let loads=0, pauses=0, plays=0; video.currentTime=42; video.pause=()=>{pauses++;}; video.load=()=>{loads++;}; video.play=()=>{plays++;};
  if(mode!=='fallback'){
    dialog.showModal=()=>{if(mode==='native-throws')throw new Error('Fixture unavailable');dialog.setAttribute('open','');};
    dialog.close=()=>{dialog.removeAttribute('open');dialog.emit('close');};
  }
  const invalid=doc.querySelector('[data-robot-video="2"]');
  if(tamper)invalid.setAttribute('data-video-src','https://example.invalid/third.mp4');
  const globalEvents=new Node('window',doc), observers=[];
  const context=vm.createContext({document:doc,Element:Node,WeakMap,WeakSet,console,
    addEventListener:globalEvents.addEventListener.bind(globalEvents),
    MutationObserver:class { constructor(callback){this.callback=callback;observers.push(this);}observe(node){this.node=node;} }
  }); context.window=context;
  // Bind exactly the original app's generic dialog behavior before the gallery.
  const app=read('app.js');
  const generic=app.slice(app.indexOf('  function focusFirst(dialog)'),app.indexOf('  function element(tag, className, text)'));
  Object.assign(context,{root:doc.documentElement,cursor,mobileNav:doc.getElementById('mobile-nav'),returnFocus:new WeakMap(),dialogFallback:new WeakSet(),
    $:(selector,scope=doc)=>scope.querySelector(selector),$$:(selector,scope=doc)=>scope.querySelectorAll(selector),setMenu(){},resetImageZoom(){}});
  vm.runInContext(generic+'\nglobalThis.externalClose=closeDialog;',context);
  vm.runInContext(source,context,{filename:'robot-gallery.js'});
  return {doc,dialog,video,section,cursor,opener,context,invalid,globalEvents,observers,
    get loads(){return loads;},get pauses(){return pauses;},get plays(){return plays;},$:selector=>doc.querySelector(selector)};
}

let mediaChecks=0, dialogChecks=0, focusChecks=0;
for(const mode of ['native','fallback','native-throws']) {
  const e=environment(mode), {doc,dialog,video,opener}=e;
  assert(!dialog.open); assert.equal(video.getAttribute('src'),null); assert.equal(e.loads,0); assert.equal(e.plays,0); assert.equal(video.preload,'none');mediaChecks++;
  opener.focus(); opener.emit('click');
  assert(dialog.open); assert.equal(dialog.getAttribute('aria-modal'),'true'); assert.equal(e.section.dataset.galleryOpen,'true'); assert(doc.documentElement.classList.contains('robot-gallery-open'));
  assert.equal(e.cursor.parentElement,dialog); assert.equal(doc.activeElement,e.$('#robot-gallery-close'));assert.equal(opener.getAttribute('aria-expanded'),'true');dialogChecks++;
  assert.equal(video.getAttribute('src'),'assets/robotics/montaje-01.mp4');assert.equal(e.plays,0);assert.equal(video.currentTime,0);mediaChecks++;
  e.$('[data-robot-video="1"]').emit('click');
  assert.equal(video.getAttribute('src'),'assets/robotics/montaje-02.mp4');assert.equal(e.$('[data-robot-video="1"]').getAttribute('aria-pressed'),'true');assert.equal(e.$('[data-robot-video="0"]').getAttribute('aria-pressed'),'false');assert.equal(e.$('#robot-gallery-count').textContent,'2 / 3');mediaChecks++;
  e.$('[data-robot-video="2"]').emit('click');assert.equal(video.getAttribute('src'),'assets/robotics/montaje-03.mp4');
  e.$('[data-robot-video="0"]').emit('click');assert.equal(video.getAttribute('src'),'assets/robotics/montaje-01.mp4');
  e.$('[data-robot-video="2"]').emit('click');assert.equal(video.getAttribute('src'),'assets/robotics/montaje-03.mp4');mediaChecks++;
  doc.hidden=true; const pauses=e.pauses;doc.emit('visibilitychange');assert(e.pauses>pauses);mediaChecks++;
  if(mode!=='native') {
    const main=doc.querySelector('main');assert.equal(main.getAttribute('aria-hidden'),'true');assert(main.inert);focusChecks++;
    const last=e.$('[data-robot-video="2"]');last.focus();const tab=dialog.emit('keydown',{key:'Tab'});assert(tab.defaultPrevented);assert.equal(doc.activeElement,e.$('#robot-gallery-close'));focusChecks++;
    const reverse=dialog.emit('keydown',{key:'Tab',shiftKey:true});assert(reverse.defaultPrevented);assert.equal(doc.activeElement,last);focusChecks++;
    opener.focus();doc.emit('focusin',{target:opener});assert.equal(doc.activeElement,e.$('#robot-gallery-close'));focusChecks++;
  }
  dialog.emit(mode==='native'?'cancel':'keydown',{key:'Escape'});
  assert(!dialog.open);assert.equal(video.getAttribute('src'),null);assert.equal(e.cursor.parentElement,doc.body);assert.equal(e.section.dataset.galleryOpen,'false');assert(!doc.documentElement.classList.contains('robot-gallery-open'));assert.equal(doc.activeElement,opener);dialogChecks++;
  if(mode!=='native'){assert.equal(doc.querySelector('main').getAttribute('aria-hidden'),null);assert.equal(doc.querySelector('main').getAttribute('inert'),null);assert(!doc.querySelector('main').inert);focusChecks++;}
  opener.emit('click');assert.equal(video.getAttribute('src'),'assets/robotics/montaje-03.mp4');mediaChecks++;
  const inside=dialog.emit('click',{clientX:500,clientY:400});assert(!inside.defaultPrevented);assert(dialog.open);dialogChecks++;
  const backdrop=dialog.emit('click',{clientX:1,clientY:1});assert(backdrop.defaultPrevented);assert(backdrop.propagationStopped);assert(!dialog.open);assert.equal(video.getAttribute('src'),null);dialogChecks++;
  opener.emit('click');e.context.externalClose(dialog);
  for(const observer of e.observers)observer.callback([{attributeName:'open'}]);
  assert(!dialog.open);assert.equal(video.getAttribute('src'),null);assert.equal(e.section.dataset.galleryOpen,'false');dialogChecks++;
  opener.emit('click');const focusCount=opener.focusCount;e.globalEvents.emit('pagehide');assert(!dialog.open);assert.equal(video.getAttribute('src'),null);assert.equal(opener.focusCount,focusCount);dialogChecks++;
  assert.equal(e.plays,0);mediaChecks++;
}
const invalid=environment('native',true);assert(invalid.invalid.disabled);invalid.opener.focus();invalid.opener.emit('click');invalid.$('[data-robot-video="1"]').emit('click');assert.equal(invalid.video.getAttribute('src'),'assets/robotics/montaje-02.mp4');invalid.invalid.emit('click');assert.equal(invalid.video.getAttribute('src'),'assets/robotics/montaje-02.mp4');mediaChecks++;
const navigation=environment('native',false,true);navigation.opener.focus();navigation.opener.emit('click');navigation.$('#robot-video-prev').emit('click');assert.equal(navigation.video.getAttribute('src'),'assets/robotics/montaje-03.mp4');navigation.$('#robot-video-next').emit('click');assert.equal(navigation.video.getAttribute('src'),'assets/robotics/montaje-01.mp4');mediaChecks++;
const restoration=environment('fallback');const header=restoration.doc.querySelector('header');header.setAttribute('aria-hidden','false');header.setAttribute('inert','original-value');header.inert=true;restoration.opener.focus();restoration.opener.emit('click');restoration.$('#robot-gallery-close').emit('click');assert.equal(header.getAttribute('aria-hidden'),'false');assert.equal(header.getAttribute('inert'),'original-value');assert(header.inert);focusChecks++;
const remaining=environment('native');remaining.opener.focus();remaining.opener.emit('click');const contact=remaining.$('#contact-dialog');contact.setAttribute('open','');contact.focus();remaining.$('#robot-gallery-close').emit('click');assert.equal(remaining.doc.activeElement,contact);assert.equal(remaining.cursor.parentElement,contact);assert(contact.open);dialogChecks++;
assert(!/\.play\s*\(/.test(source),'The gallery must not start playback automatically');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source));mediaChecks++;
const report={checks:'passed',mediaChecks,dialogChecks,focusChecks,
  controllerSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'robot-gallery.js'))).digest('hex'),
  covered:['actual gallery HTML and production controller','unopened gallery has no video source or load','no autoplay','three local videos and wraparound controls','selection and ARIA state','pause and unload on close','native and fallback Escape','cursor portal and focus return','fallback focus trap and exact outside attribute restoration','existing generic app dialog bindings','outside backdrop only','external close and pagehide cleanup','whitelisted local media paths'],
  limitation:'DOM and media doubles verify controller behavior; no browser video playback or visual rendering was performed.'};
fs.writeFileSync(path.join(__dirname,'results/robot-gallery-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
