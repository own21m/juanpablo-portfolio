'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
for(const file of ['check-site.cjs','verify-art-gallery.cjs','verify-robot-gallery.cjs','verify-robotics.cjs','verify-language.cjs']) {
  const result = spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
  if(result.status!==0) process.exit(result.status||1);
}
