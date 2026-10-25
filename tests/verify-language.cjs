/* Exercise the saved translation controller on the actual portfolio HTML.
   This lightweight DOM preserves real text nodes, attributes and mutation delivery.
   It is a behavioral fixture, not a visual browser or screen-reader test. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base, file), 'utf8').replace(/\r\n/g, '\n');
const controller = read('i18n.js');
const dictionarySource = read('translations.js');
const projectsSource = read('projects.js');
const page = read('index.html');
for (const source of [controller, dictionarySource, projectsSource]) new vm.Script(source);
const counts = {defaultAndPersistence:0, controls:0, mutations:0, reversibleContent:0, safety:0, patterns:0, lifecycle:0};
function check(group, condition, message) { assert(condition, message); counts[group]++; }
function equal(group, actual, expected, message) { assert.equal(actual, expected, message); counts[group]++; }
function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, token => {
    const named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
    return named[token] ?? String.fromCodePoint(parseInt(token.slice(2,-1).replace(/^x/i,''), /^&#x/i.test(token)?16:10));
  });
}
function environment(options={}) {
  const observers = [];
  const queue = record => {
    for (const observer of observers) {
      if (!observer.active || !observer.target.contains(record.target)) continue;
      if (!observer.options[record.type]) continue;
      if (record.type === 'attributes' && !observer.options.attributeFilter.includes(record.attributeName)) continue;
      observer.pending.push(record);
    }
  };
  class Text {
    constructor(value) { this.nodeType=3; this.parentElement=null; this.value=String(value); }
    get data() { return this.value; }
    set data(value) { this.value=String(value); queue({type:'characterData',target:this}); }
    get textContent() { return this.data; }
    set textContent(value) { this.data=value; }
  }
  class Element {
    constructor(tag) {
      this.nodeType=1; this.tagName=tag.toUpperCase(); this.parentElement=null; this.childNodes=[];
      this.attrs=new Map(); this.events=new Map(); this.checked=false; this.value=''; this.name='';
    }
    get id() { return this.getAttribute('id')||''; }
    get lang() { return this.getAttribute('lang')||''; }
    set lang(value) { this.setAttribute('lang',value); }
    get textContent() { return this.childNodes.map(child=>child.textContent).join(''); }
    set textContent(value) {
      const removedNodes=this.childNodes;
      for(const node of removedNodes) node.parentElement=null;
      const text=new Text(value); text.parentElement=this; this.childNodes=[text];
      queue({type:'childList',target:this,addedNodes:[text],removedNodes});
    }
    setAttribute(name,value) {
      this.attrs.set(name,String(value));
      if(name==='name'||name==='value') this[name]=String(value);
      if(name==='checked') this.checked=true;
      queue({type:'attributes',target:this,attributeName:name});
    }
    getAttribute(name) { return this.attrs.get(name)??null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) { this.attrs.delete(name); queue({type:'attributes',target:this,attributeName:name}); }
    append(...nodes) {
      const addedNodes=nodes.map(node=>typeof node==='string'?new Text(node):node);
      for(const node of addedNodes) { node.parentElement=this; this.childNodes.push(node); }
      queue({type:'childList',target:this,addedNodes,removedNodes:[]});
    }
    contains(node) { for(let current=node;current;current=current.parentElement) if(current===this)return true; return false; }
    descendants() { return this.childNodes.flatMap(child=>child.nodeType===1?[child,...child.descendants()]:[]); }
    matches(selector) {
      if(selector.startsWith('#')) return this.id===selector.slice(1);
      const match=selector.match(/^([a-z]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/i);
      return !!match && (!match[1]||this.tagName===match[1].toUpperCase()) && (!match[2]||this.hasAttribute(match[2])&&(match[3]===undefined||this.getAttribute(match[2])===match[3]));
    }
    closest(selector) { for(let current=this;current;current=current.parentElement) if(selector.split(',').some(part=>current.matches(part.trim())))return current;return null; }
    querySelectorAll(selector) { return this.descendants().filter(node=>selector.split(',').some(part=>node.matches(part.trim()))); }
    addEventListener(name,handler) { if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(handler); }
    emit(type,properties={}) { const event={type,target:this,...properties};for(const handler of this.events.get(type)||[])handler(event); }
  }
  const doc=new Element('document'); doc.nodeType=9;
  doc.createElement=tag=>new Element(tag);
  doc.createTextNode=value=>new Text(value);
  doc.getElementById=id=>doc.descendants().find(node=>node.id===id)||null;
  const stack=[doc], voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const html=page.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,'<script$1></script>');
  for(const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g)||[]) {
    if(token.startsWith('<!'))continue;
    if(token.startsWith('</')) {const tag=token.match(/^<\/([\w:-]+)/)?.[1].toUpperCase();while(stack.length>1)if(stack.pop().tagName===tag)break;continue;}
    if(token.startsWith('<')) {
      const match=token.match(/^<([\w:-]+)([\s\S]*?)(\/?)>$/);if(!match)continue;
      const node=new Element(match[1]);
      for(const attr of match[2].matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))node.setAttribute(attr[1],decode(attr[2]??attr[3]??attr[4]??''));
      stack.at(-1).append(node);if(!match[3]&&!voids.has(match[1]))stack.push(node);
    } else stack.at(-1).append(decode(token));
  }
  doc.documentElement=doc.descendants().find(node=>node.tagName==='HTML');
  doc.body=doc.descendants().find(node=>node.tagName==='BODY');
  const events=new Map(), emitted=[], storage=new Map();
  if(options.saved!==undefined)storage.set('jp-language',options.saved);
  const storageWrites=[];
  const localStorage={
    getItem(key){if(options.storageUnavailable)throw new Error('Storage unavailable');return storage.get(key)??null;},
    setItem(key,value){if(options.storageUnavailable)throw new Error('Storage unavailable');storage.set(key,String(value));storageWrites.push([key,String(value)]);}
  };
  const window={
    addEventListener(name,handler){if(!events.has(name))events.set(name,[]);events.get(name).push(handler);},
    dispatchEvent(event){emitted.push(event);for(const handler of events.get(event.type)||[])handler(event);return true;}
  };
  class MutationObserver {
    constructor(callback){this.callback=callback;this.pending=[];this.active=false;this.observeCalls=[];observers.push(this);}
    observe(target,options){this.target=target;this.options=options;this.active=true;this.observeCalls.push(options);}
    disconnect(){this.active=false;this.pending=[];}
  }
  const context={window,document:doc,localStorage,navigator:{language:'en-US',languages:['en-US','en']},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},MutationObserver:options.noObserver?undefined:MutationObserver};
  vm.createContext(context);
  vm.runInContext(projectsSource,context);
  const catalogBefore=JSON.stringify(window.portfolioProjects);
  vm.runInContext(dictionarySource,context);
  vm.runInContext(controller,context);
  function flush(){for(let iteration=0;iteration<20;iteration++){const pending=observers.filter(observer=>observer.active&&observer.pending.length);if(!pending.length)return;for(const observer of pending){const records=observer.pending.splice(0);observer.callback(records);}}throw new Error('Translation observer did not settle');}
  return {doc,window,api:window.portfolioI18n,observers,flush,storage,storageWrites,emitted,catalogBefore,
    element(tag,text,attrs={}){const node=new Element(tag);for(const [name,value]of Object.entries(attrs))node.setAttribute(name,value);if(text!==undefined)node.append(text);return node;},
    emit(name,properties={}){window.dispatchEvent({type:name,...properties});flush();}};
}

const env=environment(), root=env.doc.documentElement;
equal('defaultAndPersistence',env.api.getLanguage(),'es','Spanish is the default even with an English navigator');
equal('defaultAndPersistence',root.lang,'es');
equal('defaultAndPersistence',env.storageWrites.length,0,'Initialization must not persist a guessed preference');
const toggle=env.doc.getElementById('language-toggle');
check('controls',!!toggle,'The actual header contains the language toggle');
equal('controls',toggle.getAttribute('aria-label'),'Cambiar a inglés');
const contact=env.doc.getElementById('header-contact');
check('controls',contact?.hasAttribute('data-contact'),'The persistent contact CTA uses the existing contact workflow');
equal('controls',contact.getAttribute('aria-controls'),'contact-dialog');
const SpanishContactNode=contact.childNodes.find(node=>node.nodeType===1&&node.tagName==='SPAN').childNodes[0];
const originalContactChildren=contact.childNodes.slice();
const input=env.doc.querySelectorAll('input[name="name"]')[0], textarea=env.doc.descendants().find(node=>node.tagName==='TEXTAREA');
input.value='Mi nombre real';textarea.value='Mi idea personal: una web con arte.';
textarea.textContent='Texto del usuario que no debe traducirse.';
const textBefore=textarea.textContent;
const image=env.doc.getElementById('hero-art-wrap').descendants().find(node=>node.tagName==='IMG');
const srcBefore=image.getAttribute('src');
const linksBefore=env.doc.querySelectorAll('a').map(node=>node.getAttribute('href'));
toggle.emit('click');env.flush();
equal('controls',env.api.getLanguage(),'en');equal('controls',root.lang,'en');
equal('controls',toggle.getAttribute('aria-label'),'Switch to Spanish');
equal('controls',contact.textContent.trim(),'Contact me');
equal('controls',env.storage.get('jp-language'),'en');
equal('controls',env.doc.getElementById('language-status').textContent,'Language: English.');
check('controls',env.doc.querySelectorAll('input[name="language"]').find(node=>node.value==='en').checked);
equal('safety',input.value,'Mi nombre real');equal('safety',textarea.value,'Mi idea personal: una web con arte.');
equal('safety',textarea.textContent,textBefore,'User-provided textarea text is not translated');
equal('safety',textarea.getAttribute('placeholder'),env.api.t('Una web, un video, algo que todavía no tiene nombre…'),'Textarea placeholder remains localized without touching its contents');
equal('safety',image.getAttribute('src'),srcBefore);
assert.deepEqual(env.doc.querySelectorAll('a').map(node=>node.getAttribute('href')),linksBefore);counts.safety++;
equal('safety',JSON.stringify(env.window.portfolioProjects),env.catalogBefore,'Spanish project source remains immutable');
assert.deepEqual(contact.childNodes,originalContactChildren);counts.reversibleContent++;
equal('reversibleContent',SpanishContactNode.data,'Contact me','Translation edits text in place');
toggle.emit('click');env.flush();
equal('reversibleContent',SpanishContactNode.data,'Contáctame');
assert.deepEqual(contact.childNodes,originalContactChildren);counts.reversibleContent++;
equal('reversibleContent',root.lang,'es');
equal('reversibleContent',toggle.getAttribute('aria-label'),'Cambiar a inglés');
const picker=env.doc.getElementById('language-picker'), radio=env.doc.querySelectorAll('input[name="language"]').find(node=>node.value==='en');
radio.checked=true;picker.emit('change',{target:radio});env.flush();
equal('controls',env.api.getLanguage(),'en');
picker.emit('change',{target:{name:'theme',value:'es',checked:true}});env.flush();
equal('controls',env.api.getLanguage(),'en','An unrelated radio cannot change language');

const dynamic=env.element('section');env.doc.body.append(dynamic);env.flush();
const newCaption=env.element('p','La misma receta, en pantalla amplia');dynamic.append(newCaption);env.flush();
equal('mutations',newCaption.textContent,'The same recipe on a wider screen','New gallery captions localize after insertion');
const changing=env.element('button','Pausar animaciones',{'aria-label':'Pausar animaciones',title:'Abrir menú'});dynamic.append(changing);env.flush();
equal('mutations',changing.textContent,'Pause animations');equal('mutations',changing.getAttribute('aria-label'),'Pause animations');
changing.textContent='Activar animaciones';changing.setAttribute('aria-label','Activar animaciones');env.flush();
equal('mutations',changing.textContent,'Enable animations');equal('mutations',changing.getAttribute('aria-label'),'Enable animations');
const label=changing.childNodes[0];label.data='Pausar animaciones';env.flush();equal('mutations',label.data,'Pause animations','Character data updates localize');
const theme=env.element('p','Siguiendo el sistema: claro');dynamic.append(theme);env.flush();
equal('mutations',theme.textContent,env.window.portfolioTranslations['Siguiendo el sistema: claro']);
theme.textContent='Tema oscuro';env.flush();equal('mutations',theme.textContent,'Dark theme');
const copy=env.element('span','Correo copiado al portapapeles.');dynamic.append(copy);env.flush();
equal('mutations',copy.textContent,'Email address copied to clipboard.');
const copied=env.element('span','Copiado');dynamic.append(copied);env.flush();equal('mutations',copied.textContent,'Copied');
const savedEnglishLabel=changing.textContent;changing.textContent='Copiado';env.flush();changing.textContent=savedEnglishLabel;env.flush();
env.api.setLanguage('es');env.flush();equal('mutations',changing.textContent,'Pausar animaciones','A restored English label can return to its Spanish source');
env.api.setLanguage('en');env.flush();
const attributed=env.element('img',undefined,{alt:'Ingredientes que se adaptan','aria-description':'Dentro del proyecto',title:'Tamaño real',src:'assets/projects/runtime-recepy-astra-ingredientes.webp'});
dynamic.append(attributed);env.flush();
equal('mutations',attributed.getAttribute('alt'),'Ingredients that adapt');
equal('mutations',attributed.getAttribute('title'),'Actual size');
equal('mutations',attributed.getAttribute('aria-description'),env.api.t('Dentro del proyecto'));
attributed.setAttribute('alt','Cocinar, paso a paso');env.flush();equal('mutations',attributed.getAttribute('alt'),'Cooking, step by step');
equal('safety',attributed.getAttribute('src'),'assets/projects/runtime-recepy-astra-ingredientes.webp');
const excluded=env.element('div','Contáctame',{translate:'no'}), code=env.element('code','Contáctame'), script=env.element('script','Contáctame'), pre=env.element('pre','Contáctame');
dynamic.append(excluded,code,script,pre);env.flush();for(const node of [excluded,code,script,pre])equal('safety',node.textContent,'Contáctame');
const nested=env.element('span','Pausar animaciones');excluded.append(nested);env.flush();equal('safety',nested.textContent,'Pausar animaciones');
const controlNames=env.doc.querySelectorAll('input[name="language"]').map(node=>node.parentElement.textContent.trim());
assert.deepEqual(controlNames,['Español','English']);counts.safety++;
const observer=env.observers[0];
check('safety',observer.options.attributeFilter.includes('aria-label')&&observer.options.attributeFilter.includes('placeholder'));
check('safety',!observer.options.attributeFilter.some(name=>['style','class','src','href','value'].includes(name)),'Animated styles and user values are not observed');
const observeCount=observer.observeCalls.length;changing.setAttribute('style','transform:translateX(1px)');changing.setAttribute('class','motion-on');env.flush();
equal('safety',observer.observeCalls.length,observeCount,'Animation churn does not trigger translation passes');

const patterns=[
  ['27 repositorios','27 repositories'],
  ['27 / REPOSITORIOS PÚBLICOS','27 / PUBLIC REPOSITORIES'],
  ['08 / REPOSITORIOS EN ESTA CATEGORÍA','08 / REPOSITORIES IN THIS CATEGORY'],
  ['01 imagen / 9 pasos','01 image / 9 steps'],
  ['23 imágenes / 8 pasos','23 images / 8 steps'],
  ['7 pasos / 6 herramientas','7 steps / 6 tools'],
  ['Ampliar: Ingredientes que se adaptan','Enlarge: Ingredients that adapt'],
  ['Ver dibujo original: Mis dibujos','View original drawing: My drawings'],
  ['Ver imagen 8: Cocinar, paso a paso','View image 8: Cooking, step by step'],
  ['Ver Expresiones faciales, IA y datos','View Facial expressions, AI & data'],
  ['8 / 19 · La misma receta, en pantalla amplia','8 / 19 · The same recipe on a wider screen'],
  ['Postura: Alcance.','Pose: Reach.'],
  ['Tamaño real / Dentro del proyecto','Actual size / '+env.api.t('Dentro del proyecto')],
  ['Tu aplicación de correo abrirá la consulta. Si no se abre, escribe a hello@example.com.','Your email app will open your enquiry. If it does not open, write to hello@example.com.'],
  ['Puedes escribir a hello@example.com.','You can write to hello@example.com.'],
];
for(const [es,en]of patterns){equal('patterns',env.api.t(es),en,es);const node=env.element('p',es);dynamic.append(node);env.flush();equal('patterns',node.textContent,en);env.api.setLanguage('es');equal('patterns',node.textContent,es);env.api.setLanguage('en');}
equal('patterns',env.api.t('  Contáctame\n'),'  Contact me\n','Whitespace around translated labels is preserved');
equal('patterns',env.api.t('An unlisted proper name'),'An unlisted proper name');
equal('patterns',env.api.t('Contáctame','es'),'Contáctame');

env.emit('storage',{key:'unrelated',newValue:'es'});equal('lifecycle',env.api.getLanguage(),'en');
const writesBefore=env.storageWrites.length;env.emit('storage',{key:'jp-language',newValue:'es'});equal('lifecycle',env.api.getLanguage(),'es');
equal('lifecycle',env.storageWrites.length,writesBefore,'Cross-tab changes do not echo storage writes');
env.emit('storage',{key:'jp-language',newValue:'en'});equal('lifecycle',root.lang,'en');
env.emit('storage',{key:null,newValue:null});equal('lifecycle',root.lang,'es','Clearing storage restores default Spanish');
env.emit('storage',{key:'jp-language',newValue:'fr'});equal('lifecycle',root.lang,'es','Unsupported values fall back to Spanish');
env.api.setLanguage('en');env.emit('pagehide');equal('lifecycle',observer.active,false);
const resumed=env.element('p','Contáctame');dynamic.append(resumed);equal('lifecycle',resumed.textContent,'Contáctame');
env.emit('pageshow');equal('lifecycle',observer.active,true);equal('lifecycle',resumed.textContent,'Contact me');
check('lifecycle',env.emitted.some(event=>event.type==='portfolio:languagechange'&&event.detail.language==='en'));
const saved=environment({saved:'en'});equal('defaultAndPersistence',saved.doc.documentElement.lang,'en');
equal('defaultAndPersistence',saved.doc.getElementById('header-contact').textContent.trim(),'Contact me');
equal('defaultAndPersistence',saved.storageWrites.length,0,'Saved preference initialization remains read-only');
const invalid=environment({saved:'de'});equal('defaultAndPersistence',invalid.api.getLanguage(),'es');
const blocked=environment({storageUnavailable:true});blocked.doc.getElementById('language-toggle').emit('click');blocked.flush();
equal('defaultAndPersistence',blocked.api.getLanguage(),'en','Unavailable storage does not prevent switching');
equal('defaultAndPersistence',blocked.doc.getElementById('header-contact').textContent.trim(),'Contact me');
const unsupportedObserver=environment({noObserver:true});unsupportedObserver.api.setLanguage('en');
equal('defaultAndPersistence',unsupportedObserver.doc.getElementById('header-contact').textContent.trim(),'Contact me','Explicit language changes still work without MutationObserver');
equal('safety',JSON.stringify(env.window.portfolioProjects),env.catalogBefore);
const report={checks:'passed',...counts,translationEntries:Object.keys(env.window.portfolioTranslations).length,projects:21,
  controllerSha256:crypto.createHash('sha256').update(controller).digest('hex'),
  coverage:['actual saved HTML, text nodes and production controller','Spanish default independent of browser locale','persistent toggle and explicit radio selection','language-specific ARIA labels and polite status','text-node and child-list mutation delivery','dynamic project captions, counters and workflow labels','art and robotic labels, theme changes and copy-label restoration','translated attributes without changing media URLs','user input, textarea contents, code and translate=no preserved','reversible translation without replacing child elements','animation mutations ignored','storage changes, unavailable storage and page lifecycle','Spanish project source remains immutable'],
  limitation:'DOM and mutation fixtures validate behavior. No portfolio browser rendering or screen-reader test was performed; the existing explicit browser access block was respected.'};
fs.writeFileSync(path.join(__dirname,'results/language-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
