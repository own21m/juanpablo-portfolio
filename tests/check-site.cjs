'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const styles = read('styles.css');
const identifiers = [...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(identifiers).size, identifiers.length, 'Duplicate HTML identifiers');
const references = [...html.matchAll(/\b(?:src|href|data-art-src|data-video-src)="([^"]+)"/g)].map(match=>match[1]);
for (const css of ['styles.css','fonts.css']) for (const match of read(css).matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\)\s]+))\s*\)/g)) references.push(match[1]??match[2]??match[3]);
for (const reference of references) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) continue;
  if (reference.startsWith('#')) { assert(identifiers.includes(reference.slice(1)), 'Missing anchor '+reference); continue; }
  const relative = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!relative) continue;
  const target = path.resolve(root, relative);
  assert(target.startsWith(root+path.sep), 'Path escapes the repository');
  assert(fs.statSync(target).isFile(), 'Missing asset '+relative);
}
for (const file of fs.readdirSync(root).filter(name=>name.endsWith('.js'))) new vm.Script(read(file),{filename:file});
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
assert.equal((html.match(/data-drawing="\d+"/g)||[]).length,9);
assert.equal((html.match(/data-video-src=/g)||[]).length,3);
assert(!/<video[^>]*\bautoplay\b/i.test(html));
assert(!/<(?:video|img)[^>]*id="(?:robot-gallery-video|art-lightbox-image)"[^>]*\bsrc=/i.test(html));
assert(styles.includes('@keyframes artDialogIn') && styles.includes('@keyframes artImageNext'));
assert(styles.includes('prefers-reduced-motion:reduce') && styles.includes(':root.motion-off'));
const config = JSON.parse(read('vercel.json'));
assert.equal(config.framework,null); assert.equal(config.buildCommand,''); assert.equal(config.installCommand,''); assert.equal(config.outputDirectory,'.');
console.log(JSON.stringify({checks:'passed',localReferences:references.length,artworks:9,videos:3,staticVercelConfig:true}));
