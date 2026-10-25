/* Local, reversible translations. Existing interactive controllers keep their state. */
(() => {
  'use strict';
  const root = document.documentElement;
  const translations = window.portfolioTranslations || {};
  const normalize = value => String(value).trim().replace(/\s+/g, ' ');
  const english = new Map(Object.entries(translations).map(([es, en]) => [normalize(es), en]));
  const spanish = new Map();
  for (const [es, en] of Object.entries(translations)) {
    if (!spanish.has(normalize(en))) spanish.set(normalize(en), es);
  }
  const textState = new WeakMap(), attributeState = new WeakMap();
  const attributes = ['aria-label', 'aria-description', 'title', 'alt', 'placeholder'];
  const ignored = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);
  const valid = value => value === 'es' || value === 'en';
  let language = 'es';
  try { const saved = localStorage.getItem('jp-language'); if (valid(saved)) language = saved; } catch (_) { /* Local storage is optional. */ }
  let observer;

  function translate(value, target = language) {
    const input = String(value), key = normalize(input);
    if (target === 'es' || !key) return input;
    let translated = english.get(key);
    if (translated === undefined) {
      let match;
      if ((match = key.match(/^(\d+) repositorios$/))) translated = `${match[1]} repositories`;
      else if ((match = key.match(/^(\d+) \/ REPOSITORIOS (PÚBLICOS|EN ESTA CATEGORÍA)$/))) translated = `${match[1]} / ${match[2] === 'PÚBLICOS' ? 'PUBLIC REPOSITORIES' : 'REPOSITORIES IN THIS CATEGORY'}`;
      else if ((match = key.match(/^(\d+) im(?:agen|ágenes) \/ (\d+) pasos$/))) translated = `${match[1]} ${Number(match[1]) === 1 ? 'image' : 'images'} / ${match[2]} steps`;
      else if ((match = key.match(/^(\d+) pasos \/ (\d+) herramientas$/))) translated = `${match[1]} steps / ${match[2]} tools`;
      else if ((match = key.match(/^(Ampliar: |Ver dibujo original: |Ver imagen \d+: )(.+)$/))) {
        const prefix = match[1].startsWith('Ver imagen') ? match[1].replace('Ver imagen', 'View image') : match[1] === 'Ampliar: ' ? 'Enlarge: ' : 'View original drawing: ';
        translated = prefix + translate(match[2], 'en');
      } else if ((match = key.match(/^Ver (.+), (Web|IA y datos|Simulación|Aplicaciones|Pruebas QA)$/))) translated = `View ${translate(match[1], 'en')}, ${translate(match[2], 'en')}`;
      else if ((match = key.match(/^Ver (.+)$/))) translated = 'View ' + match[1].split(', ').map(part => translate(part, 'en')).join(', ');
      else if ((match = key.match(/^(\d+ \/ \d+ · )(.+)$/))) translated = match[1] + translate(match[2], 'en');
      else if ((match = key.match(/^Postura: (.+)\.$/))) translated = `Pose: ${translate(match[1], 'en')}.`;
      else if ((match = key.match(/^Siguiendo el sistema: (claro|oscuro)$/))) translated = `Following system: ${match[1] === 'claro' ? 'light' : 'dark'}`;
      else if ((match = key.match(/^Tema (claro|oscuro)$/))) translated = `${match[1] === 'claro' ? 'Light' : 'Dark'} theme`;
      else if ((match = key.match(/^Tu aplicación de correo abrirá la consulta\. Si no se abre, escribe a (.+)\.$/))) translated = `Your email app will open your enquiry. If it does not open, write to ${match[1]}.`;
      else if ((match = key.match(/^Puedes escribir a (.+)\.$/))) translated = `You can write to ${match[1]}.`;
      else if (key.includes(' / ')) translated = key.split(' / ').map(part => translate(part, 'en')).join(' / ');
    }
    if (translated === undefined) return input;
    return input.slice(0, input.indexOf(input.trimStart())) + translated + input.slice(input.trimEnd().length);
  }

  function sourceValue(current, previous) {
    if (previous && current === previous.last) return previous.source;
    // A controller may restore a label it read while the English UI was active.
    const source = spanish.get(normalize(current));
    return source !== undefined && !english.has(normalize(current)) ? source : current;
  }

  function translateText(node) {
    const previous = textState.get(node), current = node.data;
    const source = sourceValue(current, previous), output = translate(source);
    if (current !== output) node.data = output;
    textState.set(node, {source, last: output});
  }

  function translateAttributes(node) {
    const state = attributeState.get(node) || new Map();
    const names = node.tagName === 'META' && ['description', 'og:title', 'og:description'].includes(node.getAttribute('name') || node.getAttribute('property')) ? [...attributes, 'content'] : attributes;
    for (const name of names) {
      if (!node.hasAttribute(name)) { state.delete(name); continue; }
      const current = node.getAttribute(name), source = sourceValue(current, state.get(name));
      const output = translate(source);
      if (current !== output) node.setAttribute(name, output);
      state.set(name, {source, last: output});
    }
    attributeState.set(node, state);
  }

  function excluded(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    return element && (ignored.has(element.tagName) || element.closest('[translate="no"], script, style, code, pre') || (node.nodeType === 3 && element.closest('textarea')));
  }

  function visit(node) {
    if (!node || excluded(node)) return;
    if (node.nodeType === 3) { translateText(node); return; }
    if (node.nodeType === 1) {
      translateAttributes(node);
      if (node.tagName === 'TEXTAREA') return;
    }
    for (const child of node.childNodes || []) visit(child);
  }

  const watch = () => { if (observer) observer.observe(root, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:[...attributes, 'content']}); };
  function controls() {
    const button = document.getElementById('language-toggle');
    if (button) button.setAttribute('aria-label', language === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish');
    document.querySelectorAll('input[name="language"]').forEach(input => { input.checked = input.value === language; });
  }
  function setLanguage(value, persist = false) {
    language = valid(value) ? value : 'es';
    if (observer) observer.disconnect();
    root.lang = language;
    visit(root);
    controls();
    if (persist) {
      try { localStorage.setItem('jp-language', language); } catch (_) { /* The choice still works in memory. */ }
      const status = document.getElementById('language-status');
      if (status) status.textContent = language === 'es' ? 'Idioma: español.' : 'Language: English.';
    }
    watch();
    window.dispatchEvent(new CustomEvent('portfolio:languagechange', {detail:{language}}));
  }
  window.portfolioI18n = Object.freeze({t:translate, setLanguage, getLanguage:() => language});
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(records => {
      observer.disconnect();
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(visit);
        else visit(record.target);
      }
      watch();
    });
  }
  const toggle = document.getElementById('language-toggle');
  if (toggle) toggle.addEventListener('click', () => setLanguage(language === 'es' ? 'en' : 'es', true));
  const picker = document.getElementById('language-picker');
  if (picker) picker.addEventListener('change', event => { const input = event.target; if (input && input.name === 'language' && input.checked && valid(input.value)) setLanguage(input.value, true); });
  window.addEventListener('storage', event => { if (event.key === 'jp-language' || event.key === null) setLanguage(event.newValue); });
  window.addEventListener('pagehide', () => { if (observer) observer.disconnect(); });
  window.addEventListener('pageshow', () => { setLanguage(language); });
  setLanguage(language);
})();
