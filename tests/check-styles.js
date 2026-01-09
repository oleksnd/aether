#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function fail(msg){
  console.error('ERROR:', msg);
  process.exitCode = 1;
}

let errors = [];

// helper to read file relative to repo root
const SRC = path.join(__dirname, '..', 'src');

// 1) Check index.html for inline style attributes
const indexPath = path.join(SRC, 'index.html');
if(!fs.existsSync(indexPath)){
  errors.push('src/index.html not found');
} else {
  const indexSrc = fs.readFileSync(indexPath, 'utf8');
  const styleAttrRegex = /\sstyle\s*=\s*"[^"]*"/i;
  if(styleAttrRegex.test(indexSrc)){
    errors.push('Inline style attributes found in src/index.html. All styles must be in src/style.css');
  }
}

// 2) Check src/style.css for hardcoded hex colors or px values outside :root
const cssPath = path.join(SRC, 'style.css');
if(!fs.existsSync(cssPath)){
  errors.push('src/style.css not found');
} else {
  const cssSrc = fs.readFileSync(cssPath, 'utf8');

  // find :root block (first occurrence)
  const rootStart = cssSrc.indexOf(':root');
  let rootBlock = '';
  if(rootStart !== -1){
    const braceStart = cssSrc.indexOf('{', rootStart);
    if(braceStart !== -1){
      let depth = 1;
      let i = braceStart + 1;
      for(; i < cssSrc.length; i++){
        const ch = cssSrc[i];
        if(ch === '{') depth++;
        else if(ch === '}') depth--;
        if(depth === 0) break;
      }
      rootBlock = cssSrc.slice(braceStart+1, i);
    }
  }

  // Collect vars defined in :root
  const varRegex = /--[a-zA-Z0-9-_]+\s*:/g;
  const vars = new Set();
  let m;
  while((m = varRegex.exec(rootBlock)) !== null){
    vars.add(m[0].replace(':','').trim());
  }

  // Now scan CSS lines and flag any hex or px occurrences outside :root
  const lines = cssSrc.split(/\n/);
  let inRoot = false;
  for(let ln=0; ln<lines.length; ln++){
    const line = lines[ln];
    if(line.includes(':root')){ inRoot = true; }
    if(inRoot && line.includes('}')){ inRoot = false; continue; }
    if(inRoot) continue; // skip checks inside :root

    // find hex colors
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    let hex;
    while((hex = hexRegex.exec(line)) !== null){
      errors.push(`Hardcoded hex color ${hex[0]} found in src/style.css at line ${ln+1}`);
    }

    // find px values
    const pxRegex = /\b\d+px\b/g;
    let px;
    while((px = pxRegex.exec(line)) !== null){
      // allow px if referenced via var(...) already (e.g., var(--something)) - but this regex won't catch var()
      errors.push(`Hardcoded px value ${px[0]} found in src/style.css at line ${ln+1}`);
    }
  }
}

// 3) Check src/sketch.js for canvas parent set to canvasHolder
const sketchPath = path.join(SRC, 'sketch.js');
if(!fs.existsSync(sketchPath)){
  errors.push('src/sketch.js not found');
} else {
  const sketchSrc = fs.readFileSync(sketchPath, 'utf8');
  const parentRegex = /\.parent\(\s*['"`]canvasHolder['"`]\s*\)/m;
  if(!parentRegex.test(sketchSrc)){
    errors.push('src/sketch.js does not set canvas parent to "canvasHolder" (expected .parent("canvasHolder"))');
  }
}

if(errors.length){
  console.error('\nAETHER style check failed. Issues found:');
  errors.forEach(e => console.error('- ' + e));
  process.exitCode = 2;
} else {
  console.log('\nAETHER style check passed — no inline styles, and no hardcoded hex/px found outside :root.');
}
