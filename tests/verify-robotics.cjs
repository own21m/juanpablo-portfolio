// Execute the real local robotics controller with DOM/WebGL fixtures.
// This verifies state and geometry; it is not a GPU or visual browser test.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8').replace(/\r\n/g, '\n');
const sourceBytes = fs.readFileSync(path.join(base,'robot-arm.js'));
const source = sourceBytes.toString('utf8').replace(/\r\n/g,'\n');
new vm.Script(source);

function match(node, selector) {
  selector = selector.trim();
  if (selector.includes(' ')) {
    const parts = selector.split(/\s+/); const last = parts.pop();
    if (!match(node, last)) return false;
    for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) if (match(ancestor, parts.join(' '))) return true;
    return false;
  }
  const tag = selector.match(/^[a-z][\w:-]*/i)?.[0];
  if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  for (const m of selector.matchAll(/#([\w-]+)/g)) if (node.id !== m[1]) return false;
  for (const m of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(m[1])) return false;
  for (const m of selector.matchAll(/\[([^\]=\s]+)(?:\s*=\s*["']?([^\]"']+)["']?)?\]/g)) {
    if (!node.hasAttribute(m[1])) return false;
    if (m[2] !== undefined && node.getAttribute(m[1]) !== m[2]) return false;
  }
  return true;
}
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this.events = new Map(); this.tokens = new Set();
    this.style = {setProperty(){}, removeProperty(){}}; this.width = 1000; this.height = 900;
    this.clientWidth = 600; this.clientHeight = 540; this.disabled = false; this.hidden = false;
    this.classList = {
      contains: name => this.tokens.has(name),
      add: (...names) => names.forEach(name => this.tokens.add(name)),
      remove: (...names) => names.forEach(name => this.tokens.delete(name)),
      toggle: (name, force) => { const on = force === undefined ? !this.tokens.has(name) : !!force; on ? this.tokens.add(name) : this.tokens.delete(name); return on; }
    };
    this.captured = new Set();
  }
  get id() { return this.getAttribute('id') || ''; }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set textContent(value) { this.children = [String(value)]; }
  setAttribute(name, value) {
    value = String(value); this.attributes.set(name, value);
    if (name === 'class') this.tokens = new Set(value.split(/\s+/).filter(Boolean));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(child) { if (typeof child !== 'string') child.parentElement = this; this.children.push(child); }
  descendants() { return this.children.filter(child => typeof child !== 'string').flatMap(child => [child, ...child.descendants()]); }
  matches(selector) { return selector.split(',').some(part => match(this, part)); }
  querySelectorAll(selector) { return this.descendants().filter(child => child.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  addEventListener(name, callback) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(callback); }
  removeEventListener(name, callback) { this.events.set(name, (this.events.get(name) || []).filter(handler => handler !== callback)); }
  emit(name, properties = {}) {
    const event = {target:this, currentTarget:this, pointerId:1, pointerType:'mouse', button:0, clientX:300, clientY:300, cancelable:true, defaultPrevented:false, preventDefault(){this.defaultPrevented = true;}, ...properties};
    for (const callback of this.events.get(name) || []) callback(event);
    return event;
  }
  getBoundingClientRect() { return {left:0, top:0, width:this.clientWidth, height:this.clientHeight, right:this.clientWidth, bottom:this.clientHeight}; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}
function documentFromHtml(text) {
  const doc = new Element('document'), stack = [doc];
  const voids = new Set('meta link img br hr input source area embed param track wbr'.split(' '));
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const token of text.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { const tag = token.match(/^<\/([\w:-]+)/)?.[1].toLowerCase(); while (stack.length > 1) if (stack.pop().tagName.toLowerCase() === tag) break; continue; }
    if (token.startsWith('<')) {
      const parsed = token.match(/^<([\w:-]+)([\s\S]*?)(\/?)>$/); if (!parsed) continue;
      const node = new Element(parsed[1]); node.ownerDocument = doc;
      for (const attr of parsed[2].matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      stack.at(-1).append(node); if (!parsed[3] && !voids.has(parsed[1].toLowerCase())) stack.push(node);
    } else stack.at(-1).append(token);
  }
  doc.documentElement = doc.querySelector('html'); doc.body = doc.querySelector('body'); doc.hidden = false;
  doc.visibilityState = 'visible'; doc.getElementById = id => doc.querySelector('#' + id);
  return doc;
}
function webglFixture({shaderFailure = false,inactiveSurface = false} = {}) {
  const counters = {draws:0, buffers:0, vertexArrays:[],drawCalls:[],stateCalls:[],uniforms:[]}; let unique = 1;
  const gl = {
    VERTEX_SHADER:35633, FRAGMENT_SHADER:35632, COMPILE_STATUS:35713, LINK_STATUS:35714,
    ARRAY_BUFFER:34962, STATIC_DRAW:35044, DYNAMIC_DRAW:35048, FLOAT:5126,
    TRIANGLES:4, LINES:1, DEPTH_TEST:2929, CULL_FACE:2884, BLEND:3042, BACK:1029, POLYGON_OFFSET_FILL:32823,
    COLOR_BUFFER_BIT:16384, DEPTH_BUFFER_BIT:256, SRC_ALPHA:770, ONE_MINUS_SRC_ALPHA:771,
    LEQUAL:515, LESS:513, NO_ERROR:0,
    createShader:() => ({id:unique++}), shaderSource(){}, compileShader(){},
    getShaderParameter:() => !shaderFailure, getShaderInfoLog:() => 'Mock shader failure', deleteShader(){},
    createProgram:() => ({id:unique++}), attachShader(){}, linkProgram(){}, getProgramParameter:() => true,
    getProgramInfoLog:() => '', deleteProgram(){}, useProgram(){},
    createBuffer:() => { counters.buffers++; return {id:unique++}; }, bindBuffer(){},
    bufferData(target, data) { if (ArrayBuffer.isView(data)) { assert([...data].every(Number.isFinite), 'GPU buffer has non-finite coordinates'); counters.vertexArrays.push(data.length); } },
    bufferSubData(target, offset, data) { assert([...data].every(Number.isFinite)); }, deleteBuffer(){},
    getAttribLocation:(program,name) => inactiveSurface&&name==='aSurface'?-1:0, getUniformLocation:(program,name) => ({name}), enableVertexAttribArray(){}, vertexAttribPointer(){},
    uniformMatrix4fv(location, transpose, values) { assert([...values].every(Number.isFinite)); },
    uniformMatrix3fv(location, transpose, values) { assert([...values].every(Number.isFinite)); },
    uniform1f(location,value){counters.uniforms.push({name:location.name,value});}, uniform1i(){}, uniform2f(){}, uniform3f(){}, uniform4f(){}, uniform3fv(){},
    enable(capability){counters.stateCalls.push({action:'enable',capability});}, disable(capability){counters.stateCalls.push({action:'disable',capability});},
    depthFunc(){}, depthMask(value){counters.stateCalls.push({action:'depthMask',value});}, polygonOffset(factor,units){counters.stateCalls.push({action:'polygonOffset',factor,units});}, lineWidth(){},
    cullFace(){}, blendFunc(){}, clearColor(){}, clearDepth(){}, clear(){}, viewport(){},
    drawArrays(mode,first,count) { counters.draws++; counters.drawCalls.push({mode,first,count}); }, getError:() => 0, isContextLost:() => false,
    getExtension:() => null
  };
  return {gl, counters};
}
function environment(options = {}) {
  const doc = documentFromHtml(read('index.html'));
  const section = doc.querySelector('#robotica'), canvas = doc.querySelector('#robot-arm-canvas');
  assert(section && canvas, 'Production HTML must contain robotics exhibit');
  const frames = new Map(), timeouts = new Map(), observers = {intersection:[], mutation:[], resize:[]};
  let tick = 0, serial = 1, contextRequests = 0;
  const {gl, counters} = webglFixture(options);
  canvas.getContext = () => { contextRequests++; return options.noWebGL ? null : gl; };
  const media = {matches:!!options.reduced, events:new Map(), addEventListener(name, callback) { this.events.set(name, callback); }, addListener(callback){this.events.set('change', callback);}, change(value){this.matches=value; this.events.get('change')?.({matches:value});}};
  const globalEvents = new Element('window');
  if (options.globalPause) doc.documentElement.classList.add('motion-off');
  const context = vm.createContext({console, document:doc, Element, Float32Array, Uint16Array, Math, Array, Object,
    performance:{now:() => tick}, devicePixelRatio:3, innerWidth:390, innerHeight:844,
    matchMedia:() => media,
    requestAnimationFrame:callback => { const id=serial++; frames.set(id,callback); return id; },
    cancelAnimationFrame:id => frames.delete(id),
    setTimeout:(callback) => {const id=serial++; timeouts.set(id,callback); return id;}, clearTimeout:id=>timeouts.delete(id),
    addEventListener:globalEvents.addEventListener.bind(globalEvents), removeEventListener:globalEvents.removeEventListener.bind(globalEvents),
    IntersectionObserver:class { constructor(callback) {this.callback=callback; observers.intersection.push(this);} observe(node){this.node=node;} unobserve(){} disconnect(){} },
    ResizeObserver:class { constructor(callback) {this.callback=callback; observers.resize.push(this);} observe(node){this.node=node;} disconnect(){} },
    MutationObserver:class { constructor(callback) {this.callback=callback; this.targets=[]; observers.mutation.push(this);} observe(node, config){this.targets.push({node,config});} disconnect(){} }
  });
  context.window = context; context.globalThis = context;
  vm.runInContext(source, context, {filename:'robot-arm.js'});
  function step(ms = 40) { tick+=ms; const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(tick); }
  function intersect(visible) { for (const observer of observers.intersection) observer.callback([{target:observer.node, isIntersecting:visible, intersectionRatio:visible?1:0}]); }
  function mutate(name='class',target=doc.documentElement) { for (const observer of observers.mutation) if(observer.targets.some(item=>item.node===target)) observer.callback([{type:'attributes', target, attributeName:name}]); }
  function hide(hidden) { doc.hidden=hidden; doc.visibilityState=hidden?'hidden':'visible'; doc.emit('visibilitychange'); }
  return {doc, canvas, section, context, media, observers, frames, timeouts, counters, step, intersect, mutate, hide, get contextRequests(){return contextRequests;}, $:selector=>doc.querySelector(selector)};
}

// Tests below intentionally inspect the public geometry and invoke real listeners.
const coreContext = vm.createContext({console});
vm.runInContext(source, coreContext);
const core = coreContext.JPRobotArmCore;
assert(core && typeof core.createScene === 'function' && typeof core.projectScene === 'function');
assert.equal(core.edgeMeshes.box.length,12,'A box must contain12physicaledges, excludingtriangleface diagonals');
for(const edge of core.edgeMeshes.box) {
  const changed=edge.start.map((value,index)=>Math.abs(value-edge.end[index])>.0001).filter(Boolean).length;
  assert.equal(changed,1,'Box feature edge must follow oneaxis');
}
const technicalChecks={boxFeatureEdges:core.edgeMeshes.box.length,horizontalGripperCases:0,stationaryChassisCases:0,lineGeometryCases:0,themeContrastCases:0};

const geometry = [], poses = ['saludo','alcance','reposo'];
for (const pose of poses) {
  const parts = core.createScene(pose, .68, 0);
  assert(parts.length > 100, 'Model should contain actual assembled parts');
  const tags = new Set(parts.map(part => part.tag));
  for (const tag of ['square-base-plate','joint-shaft','servo-wire','gripper-jaw','gripper-teeth']) assert(tags.has(tag), 'Missing physical reference feature: ' + tag);
  const vertices = core.sceneVertices(parts);
  assert.equal(vertices.length % 33, 0); assert([...vertices].every(Number.isFinite));
  for(let i=0;i<vertices.length;i+=11) assert(Math.abs(Math.hypot(vertices[i+3],vertices[i+4],vertices[i+5])-1)<.001,'Surface normals must be normalized after transforms');
  const uniqueCoordinates = new Set();
  for (let i=0; i<vertices.length; i+=11) uniqueCoordinates.add([vertices[i],vertices[i+1],vertices[i+2]].map(v=>v.toFixed(3)).join(','));
  assert(uniqueCoordinates.size > 500, 'Model should have genuine 3D geometry');
  const frame = core.projectScene(1000,900,pose);
  assert(frame.triangles.length > 1000);
  for (const triangle of frame.triangles) {
    assert.equal(triangle.points.length, 3); assert(triangle.points.flat().every(Number.isFinite));
    assert(triangle.color.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255));
  }
  assert(frame.edges.length>100,'Technical view must expose actual feature lines');
  for(const edge of frame.edges) {
    assert.equal(edge.points.length,2); assert(edge.points.flat().every(Number.isFinite));
    assert(edge.color.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255));
    assert(typeof edge.tag==='string'&&edge.tag);
  }
  const camera=core.cameraMatrix(1000/900,.63,.36,vertices);
  const lineData=core.featureVertices(parts,camera.eye);
  assert.equal(lineData.count%2,0); assert(lineData.count*11<=lineData.vertices.length); assert([...lineData.vertices].every(Number.isFinite));
  technicalChecks.lineGeometryCases++;
  const jawParts=parts.filter(part=>part.tag==='gripper-jaw'); assert.equal(jawParts.length,2);
  const jawDelta=[12,13,14].map(index=>jawParts[1].matrix[index]-jawParts[0].matrix[index]);
  assert(Math.abs(jawDelta[1])<.0001,'Opposingjaws must openhorizontally with equalworldY');
  assert(Math.hypot(jawDelta[0],jawDelta[2])>.2,'Openjaw separation must be horizontal'); technicalChecks.horizontalGripperCases++;
  geometry.push({pose, parts:parts.length, triangles:vertices.length/33, visibleFallbackTriangles:frame.triangles.length,visibleFeatureSegments:frame.edges.length});
}
for(const tag of ['square-base-plate','controller-board','usb-port','usb-connector','base-fastener']) {
  const baseline=core.createScene('saludo',.68,0).filter(part=>part.tag===tag).map(part=>part.matrix);
  assert(baseline.length>0);
  for(const pose of ['alcance','reposo']) assert.equal(JSON.stringify(core.createScene(pose,.06,5).filter(part=>part.tag===tag).map(part=>part.matrix)),JSON.stringify(baseline),'Chassis shouldremain stationary:'+tag);
  technicalChecks.stationaryChassisCases++;
}
for(const pose of poses) {
  const dark=core.projectScene(390,351,pose,{lightTheme:false}),light=core.projectScene(390,351,pose,{lightTheme:true});
  assert.equal(dark.edges.length,light.edges.length,'Theme must notaltergeometry');
  const neutralDark=dark.edges.find(edge=>edge.color[0]>150&&edge.color[1]>150);
  const neutralLight=light.edges.find(edge=>edge.color[0]<60&&edge.color[1]<60);
  assert(neutralDark&&neutralLight,'Featurelines shouldbeinvertedforcontrast in both themes');
  assert(dark.triangles.some(triangle=>triangle.color[0]<40&&triangle.color[1]<40),'Darkthemefaces shouldbemattemuted');
  assert(light.triangles.some(triangle=>triangle.color[0]>190&&triangle.color[1]>190),'Lightthemefaces shouldbepaperlike');
  technicalChecks.themeContrastCases++;
}
assert.notEqual(JSON.stringify(core.createScene('saludo',.68,0)),JSON.stringify(core.createScene('saludo',.06,0)), 'Gripper must articulate');
assert.notEqual(JSON.stringify(core.createScene('saludo',.68,0)),JSON.stringify(core.createScene('saludo',.68,4)), 'Time must move articulated geometry');
const projectionCases = [], geometryFailures = [];
for (const [width,height] of [[1000,900],[390,351],[320,288]]) for (const pose of poses) {
  const frame = core.projectScene(width,height,pose);
  const b=frame.bounds;
  if (!(b.left>=0&&b.top>=0&&b.right<=width&&b.bottom<=height)) geometryFailures.push('Default camera clips '+pose+' at '+width+'x'+height+': '+JSON.stringify(b));
  assert((b.right-b.left)/width>.45&&(b.bottom-b.top)/height>.4, 'Model is too small for exhibit');
  projectionCases.push({width,height,pose,bounds:JSON.parse(JSON.stringify(b))});
}
let orbitProjectionCases = 0;
for(const pose of poses) for(const azimuth of [-2.5,0,.63,Math.PI]) for(const elevation of [-.12,.8]) {
  const frame=core.projectScene(390,351,pose,{azimuth,elevation,time:orbitProjectionCases*.9,grip:orbitProjectionCases%2?.06:.68});
  const b=frame.bounds;
  if(!(b.left>=0&&b.top>=0&&b.right<=390&&b.bottom<=351)) geometryFailures.push('Orbit camera clips '+pose+': '+JSON.stringify({azimuth,elevation,bounds:b}));
  assert(frame.triangles.length>500); orbitProjectionCases++;
}

let lifecycleChecks = 0, pointerChecks = 0, accessibilityChecks = 0;
const e=environment();
assert.equal(e.contextRequests,0,'WebGL must be lazy offscreen'); assert.equal(e.frames.size,0); lifecycleChecks++;
e.intersect(true); assert(e.contextRequests>0); assert.equal(e.section.dataset.renderer,'webgl'); assert(e.counters.draws>0);
assert.equal(e.canvas.width,900); assert.equal(e.canvas.height,810); assert(e.frames.size>0); lifecycleChecks++;
assert.deepEqual(e.counters.drawCalls.slice(-2).map(call=>call.mode),[4,1],'Technical model needs opaque faces then actual feature lines');
assert(e.counters.stateCalls.some(call=>call.action==='enable'&&call.capability===2929),'Feature lines require depth testing');
assert(e.counters.stateCalls.some(call=>call.action==='polygonOffset'&&call.factor>0&&call.units>0),'Offset faces must allow their own visible edge lines');
assert(e.counters.stateCalls.some(call=>call.action==='depthMask'&&call.value===false));
assert(e.counters.stateCalls.filter(call=>call.action==='depthMask').at(-1).value===true,'Line pass must restore depth writes');
technicalChecks.renderPassChecks=5;
const beforeAnimated=e.counters.draws; e.step(); e.step(); assert(e.counters.draws>beforeAnimated); assert(e.frames.size<=1); lifecycleChecks++;
e.$('#robot-play').emit('click'); assert.equal(e.$('#robot-play').getAttribute('aria-pressed'),'false'); assert.equal(e.frames.size,0);
const pausedDraws=e.counters.draws; for(let i=0;i<4;i++)e.step(); assert.equal(e.counters.draws,pausedDraws); lifecycleChecks++;
e.$('#robot-grip').emit('click'); assert.equal(e.$('#robot-grip').getAttribute('aria-pressed'),'false'); assert(e.counters.draws>pausedDraws); assert.equal(e.frames.size,0); accessibilityChecks++;
e.$('[data-robot-pose="alcance"]').emit('click');
assert.equal(e.$('[data-robot-pose="alcance"]').getAttribute('aria-pressed'),'true');
assert.equal(e.$('[data-robot-pose="saludo"]').getAttribute('aria-pressed'),'false');
for(let i=0;i<20;i++)e.step(); assert.equal(e.frames.size,0,'A paused pose transition must settle'); accessibilityChecks++;
const arrow = e.canvas.emit('keydown',{key:'ArrowRight'}); assert(arrow.defaultPrevented); assert.equal(e.frames.size,0); accessibilityChecks++;
assert(e.canvas.emit('keydown',{key:'Home'}).defaultPrevented); assert(!e.canvas.emit('keydown',{key:'Tab'}).defaultPrevented); accessibilityChecks++;
e.canvas.emit('keydown',{key:' '}); assert.equal(e.$('#robot-play').getAttribute('aria-pressed'),'true'); assert(e.frames.size>0); accessibilityChecks++;
e.doc.documentElement.classList.add('motion-off'); e.mutate(); assert.equal(e.frames.size,0); assert.equal(e.$('#robot-play').getAttribute('aria-pressed'),'false'); lifecycleChecks++;
e.$('#robot-play').emit('click'); assert.equal(e.frames.size,0); assert(e.$('#robot-status').textContent.includes('control superior')); lifecycleChecks++;
e.doc.documentElement.classList.remove('motion-off'); e.mutate(); assert(e.frames.size>0); lifecycleChecks++;
e.hide(true); assert.equal(e.frames.size,0); const hiddenDraws=e.counters.draws; e.step(); assert.equal(e.counters.draws,hiddenDraws); lifecycleChecks++;
e.hide(false); assert(e.frames.size>0); e.step(); lifecycleChecks++;
e.intersect(false); assert.equal(e.frames.size,0); const offscreenDraws=e.counters.draws; e.step(); assert.equal(e.counters.draws,offscreenDraws); lifecycleChecks++;
e.intersect(true); e.$('#robot-play').emit('click');
e.canvas.emit('pointerdown',{pointerType:'touch',clientX:100,clientY:100});
const vertical=e.canvas.emit('pointermove',{pointerType:'touch',clientX:103,clientY:140});
assert(!vertical.defaultPrevented); assert.equal(e.canvas.captured.size,0); assert(!e.section.classList.contains('robot-is-dragging')); pointerChecks++;
e.canvas.emit('pointerup',{pointerType:'touch'});
e.canvas.emit('pointerdown',{pointerType:'touch',clientX:100,clientY:100});
const horizontal=e.canvas.emit('pointermove',{pointerType:'touch',clientX:150,clientY:102});
assert(!horizontal.defaultPrevented); assert(e.canvas.captured.has(1)); assert(e.section.classList.contains('robot-is-dragging')); pointerChecks++;
e.canvas.emit('pointercancel',{pointerType:'touch'}); assert.equal(e.canvas.captured.size,0); assert(!e.section.classList.contains('robot-is-dragging')); pointerChecks++;
e.canvas.emit('pointerdown',{button:2}); e.canvas.emit('pointermove',{clientX:450}); assert.equal(e.canvas.captured.size,0); pointerChecks++;
e.canvas.emit('pointerdown',{clientX:100,clientY:100}); e.canvas.emit('pointermove',{clientX:104,clientY:104}); assert.equal(e.canvas.captured.size,0); pointerChecks++;
e.canvas.emit('pointermove',{clientX:145,clientY:125}); assert(e.canvas.captured.has(1)); e.canvas.emit('pointerup'); assert.equal(e.canvas.captured.size,0); pointerChecks++;

const reduced=environment({reduced:true}); reduced.intersect(true); assert.equal(reduced.frames.size,0); assert.equal(reduced.$('#robot-play').getAttribute('aria-pressed'),'false');
reduced.$('[data-robot-pose="reposo"]').emit('click'); assert.equal(reduced.frames.size,0); assert.equal(reduced.$('[data-robot-pose="reposo"]').getAttribute('aria-pressed'),'true'); lifecycleChecks++;
reduced.$('#robot-play').emit('click'); assert(reduced.frames.size>0,'Deliberate local animation request can enable motion');
reduced.media.change(true); assert.equal(reduced.frames.size,0); assert.equal(reduced.$('#robot-play').getAttribute('aria-pressed'),'false'); lifecycleChecks++;
const globallyPaused=environment({globalPause:true}); globallyPaused.intersect(true); assert.equal(globallyPaused.frames.size,0); assert.equal(globallyPaused.$('#robot-play').getAttribute('aria-pressed'),'false'); lifecycleChecks++;
const gallery=environment(); gallery.intersect(true); assert(gallery.frames.size>0);
gallery.section.dataset.galleryOpen='true'; gallery.mutate('data-gallery-open',gallery.section); assert.equal(gallery.frames.size,0,'Opening media gallery must suspend 3D frames');
const galleryDraws=gallery.counters.draws; gallery.step(); assert.equal(gallery.counters.draws,galleryDraws); lifecycleChecks++;
gallery.doc.documentElement.dataset.theme='light'; gallery.mutate('data-theme'); assert.equal(gallery.counters.draws,galleryDraws,'Theme changes behind gallery must not redraw hidden 3D'); lifecycleChecks++;
gallery.section.dataset.galleryOpen='false'; gallery.mutate('data-gallery-open',gallery.section); assert(gallery.frames.size>0,'Closing gallery should restore requested animation'); lifecycleChecks++;
gallery.$('#robot-play').emit('click'); assert.equal(gallery.frames.size,0);
gallery.section.dataset.galleryOpen='true'; gallery.mutate('data-gallery-open',gallery.section);
gallery.section.dataset.galleryOpen='false'; gallery.mutate('data-gallery-open',gallery.section);
assert.equal(gallery.frames.size,0,'Closing gallery must preserve an intentional local pause'); assert.equal(gallery.$('#robot-play').getAttribute('aria-pressed'),'false'); lifecycleChecks++;
gallery.$('#robot-play').emit('click'); gallery.section.dataset.galleryOpen='true'; gallery.mutate('data-gallery-open',gallery.section);
gallery.doc.documentElement.classList.add('motion-off'); gallery.mutate();
gallery.section.dataset.galleryOpen='false'; gallery.mutate('data-gallery-open',gallery.section); assert.equal(gallery.frames.size,0,'Gallery close cannot override global pause'); lifecycleChecks++;
gallery.doc.documentElement.classList.remove('motion-off'); gallery.mutate(); assert(gallery.frames.size>0,'Requested playback should survive gallery and global pause'); lifecycleChecks++;

const lost=e.canvas.emit('webglcontextlost'); assert(lost.defaultPrevented); assert.equal(e.section.dataset.renderer,'fallback'); assert.equal(e.frames.size,0);
assert.equal(e.canvas.getAttribute('aria-hidden'),'true'); assert.equal(e.canvas.tabIndex,-1); lifecycleChecks++;
for(const button of e.section.querySelectorAll('[data-robot-only]')) assert(button.disabled);
e.canvas.emit('webglcontextrestored'); assert.equal(e.section.dataset.renderer,'webgl'); assert.equal(e.canvas.getAttribute('aria-hidden'),null); assert.equal(e.canvas.tabIndex,0); lifecycleChecks++;
for(const button of e.section.querySelectorAll('[data-robot-only]')) assert(!button.disabled);
for(const options of [{noWebGL:true},{shaderFailure:true}]) {
  const fallback=environment(options); fallback.intersect(true); assert.equal(fallback.section.dataset.renderer,'fallback'); assert.equal(fallback.frames.size,0); assert.equal(fallback.canvas.tabIndex,-1); lifecycleChecks++;
}
const optimizedAttributes=environment({inactiveSurface:true}); optimizedAttributes.intersect(true); assert.equal(optimizedAttributes.section.dataset.renderer,'webgl','Optional GLSL attributes optimized out must not force fallback'); lifecycleChecks++;
assert(e.section.querySelectorAll('[data-robot-only]').length>=6,'All 3D controls must declare their fallback disabled state');
assert(e.$('#robot-status').getAttribute('role')==='status'&&e.$('#robot-status').getAttribute('aria-live')==='polite'); accessibilityChecks++;
assert(read('styles.css').includes('touch-action: pan-y')); accessibilityChecks++;
assert(!e.section.querySelector('.robot-real-build'),'The old reference photograph figure should be absent');
assert(e.$('#robot-gallery-open')&&e.$('#robot-gallery'),'The video gallery must have an opener and dialog');
assert.equal(e.$('#robot-gallery-open').getAttribute('aria-controls'),'robot-gallery');
assert.equal(e.$('#robot-gallery-open').getAttribute('aria-haspopup'),'dialog'); accessibilityChecks++;
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|requestPort|getUserMedia)\s*\(/.test(source),'Viewer must not request network, camera or serial access');
assert(!/\bimport\s*(?:\(|.*\bfrom\b)/.test(source),'Viewer must work directly from local files'); lifecycleChecks++;
assert.deepEqual(geometryFailures, [], 'Camera projection must fit each default pose');
assert(fs.readFileSync(path.join(base,'robot-arm.js')).equals(sourceBytes),'Engine changed during verification; rerun on the final source');

const report={checks:'passed',geometry,technicalChecks,projectionCases,orbitProjectionCases,lifecycleChecks,pointerChecks,accessibilityChecks,
  engineSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),
  covered:['real production controller syntax and listeners','procedural assembled 3D reference features','horizontal gripper assembly and stationary chassis','finite face and line GPU vertex data','box feature topology excludes face diagonals','opaque matte faces then depth-tested feature lines','technical line contrast in dark and light themes','shared geometry SVG fallback','three default poses fit desktop and mobile stage','gripper and animated scene geometry change','lazy WebGL initialization','pixel ratio capped at 1.5','bounded animation frames','global pause and system reduced motion','offscreen and background suspension','gallery suspends 3D without overriding playback intent','keyboard and ARIA state','vertical mobile scrolling preserved','horizontal pointer capture and cancellation','context loss and restoration','WebGL and shader allocation failure fallback','inactive optional shader attributes','no camera, serial or network access'],
  limitations:['No GPU shader compilation or visual browser rendering was performed.','The existing explicit local portfolio URL access block was respected.','The 3D model is a visual interpretation of the reference photograph, not a calibrated robot simulation.']};
fs.writeFileSync(path.join(__dirname,'results/robotics-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
