/* Aether — sketch.js
   Pure p5.js implementation: text -> watercolor + mesh
*/

// Canvas size derived from CSS variables to avoid hardcoding
let canvasW, canvasH;
let inputEl, generateBtn;
let paperTexture; // p5.Graphics for background texture
let lastArtwork = [];

function setup(){
  // read canvas size from CSS variables
  const rootStyles = getComputedStyle(document.documentElement);
  const cw = rootStyles.getPropertyValue('--canvas-width').trim() || '1200px';
  const ch = rootStyles.getPropertyValue('--canvas-height').trim() || '800px';
  canvasW = parseInt(cw.replace('px',''), 10);
  canvasH = parseInt(ch.replace('px',''), 10);

  const cnv = createCanvas(canvasW, canvasH);
  cnv.parent('canvasHolder');
  pixelDensity(1);

  // HSL color mode for intuitive hue/sat/light mapping
  colorMode(HSL, 360, 100, 100, 1);
  noLoop();

  // UI hooks
  inputEl = document.getElementById('textInput'); // now a textarea
  generateBtn = document.getElementById('generateBtn');

  // Auto-resize textarea (chat-like)
  function autoResize(){
    const maxHraw = getComputedStyle(document.documentElement).getPropertyValue('--input-max-height') || '220px';
    const maxH = parseInt(maxHraw.replace('px',''), 10) || 220;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, maxH) + 'px';
  }
  inputEl.addEventListener('input', autoResize);
  setTimeout(autoResize, 0);

  // Ctrl/Cmd+Enter to submit (Enter alone inserts newline)
  inputEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
      e.preventDefault();
      generateFromText(inputEl.value || inputEl.placeholder);
    }
  });

  generateBtn.addEventListener('click', () => generateFromText(inputEl.value || inputEl.placeholder));

  // create paper texture once
  paperTexture = createGraphics(width, height);
  drawPaperTexture(paperTexture);

  // initial sample
  inputEl.value = "gentle moon river drifting light";
  generateFromText(inputEl.value);
}

function drawPaperTexture(g){
  g.clear();
  g.background(7, 2, 96); // subtle off-white using HSL
  g.noStroke();

  // Add faint grain/noise
  for(let i=0;i<12000;i++){
    let x = random(g.width);
    let y = random(g.height);
    let size = random(0.3,1.6);
    let alpha = random(0.02, 0.08);
    g.fill(25, 8, 92, alpha);
    g.ellipse(x,y,size,size);
  }

  // Some soft vignetting to mimic paper edges
  g.push();
  g.fill(0,0,100,0.02);
  g.rect(0,0,g.width,g.height);
  g.pop();
}

function clearCanvas(){
  // draw paper texture as background
  blendMode(BLEND);
  image(paperTexture,0,0);
}

function generateFromText(raw){
  // Preprocess input: split into words, remove surrounding punctuation
  const words = (raw || '').match(/[^\s]+/g) || [];
  if(words.length === 0) return;

  // Prepare canvas
  clearCanvas();
  lastArtwork = [];

  // Compute global char bounds for better normalization
  let charCodes = [];
  for(const w of words){ for(const c of w){ charCodes.push(c.codePointAt(0)); }}
  let minC = Math.min(...charCodes), maxC = Math.max(...charCodes);
  minC = Math.max(minC, 32); // guard
  maxC = Math.min(maxC, 0x10FFFF);

  // Draw word clusters and collect centers
  let centers = [];

  for(let i=0;i<words.length;i++){
    const rawWord = words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if(!rawWord) continue;
    const firstChar = rawWord[0];
    const lastChar = rawWord[rawWord.length-1];
    const firstVal = firstChar.codePointAt(0);
    const lastVal = lastChar.codePointAt(0);

    // Word sum
    let sum = 0; for(const c of rawWord) sum += c.codePointAt(0);

    // Map first char -> X (left-right), last char -> Y (top-bottom)
    const rootStyles = getComputedStyle(document.documentElement);
    const marginPx = parseInt((rootStyles.getPropertyValue('--canvas-margin') || '60px').trim().replace('px',''), 10);
    const margin = marginPx || 60;
    const x = map(firstVal, minC, maxC, margin, width - margin);
    const y = map(lastVal, minC, maxC, margin, height - margin);

    // Spread based on sum (bigger sum = more spread)
    const spread = constrain(map(sum % 1024, 0, 1023, 8, 180), 6, 220);

    // Color mapping HSL
    const hue = (firstVal % 360 + 360) % 360; // hue 0-360
    const len = rawWord.length;
    // Saturation: shorter -> more pastel (lower sat), longer -> more vibrant
    const sat = constrain(map(len, 1, 12, 28, 84), 18, 92);
    // Lightness: based on vowel count -> variation in depth
    const vowels = (rawWord.match(/[aeiouyаеёиоуыэюя]/giu) || []).length;
    const light = constrain(map(vowels, 0, Math.max(1,len), 40, 82), 28, 88);

    // Number of particles relative to spread
    const particleCount = Math.round(map(spread, 6, 180, 180, 700));

    // Save center
    centers.push({x,y});

    // Draw cluster: many semi-transparent ellipses with randomGaussian offsets
    push();
    blendMode(MULTIPLY);
    noStroke();

    for(let p=0;p<particleCount;p++){
      // Slight skew based on word index to create rhythm
      const gx = x + randomGaussian() * spread + random(-spread*0.08, spread*0.08);
      const gy = y + randomGaussian() * spread + random(-spread*0.08, spread*0.08);

      // size varies; fewer large blobs, many small ones
      const size = pow(random(), 2) * (spread * 0.14) + random(1.2, 18);

      // Alpha small to build watercolor accumulations
      const alpha = random(0.02, 0.08);
      fill(hue, sat, light, alpha);
      ellipse(gx, gy, size, size * random(0.6,1.4));
    }

    // Slight central highlight/dark spot to suggest pigment pooling
    for(let h=0; h<6; h++){
      const hx = x + randomGaussian() * spread * 0.25;
      const hy = y + randomGaussian() * spread * 0.25;
      const hsize = random(6, Math.max(6, spread * 0.18));
      fill(hue, max(10, sat-6), max(12, light-18), 0.08);
      ellipse(hx,hy,hsize,hsize*random(0.6,1.2));
    }

    pop();
  }

  // Draw structural links (thin elegant lines) connecting consecutive centers
  push();
  strokeWeight(1);
  for(let k=0;k<centers.length-1;k++){
    const a = centers[k], b = centers[k+1];
    // Draw a faint graceful curve to feel organic
    push();
    stroke(220, 20, 18, 0.12); // HSL with alpha low
    noFill();
    // slight midpoint offset
    const mx = (a.x + b.x)/2 + random(-26,26);
    const my = (a.y + b.y)/2 + random(-18,18);
    // use quadratic curve
    beginShape();
    vertex(a.x, a.y);
    quadraticVertex(mx, my, b.x, b.y);
    endShape();
    pop();
  }
  pop();

  // Save last centers if needed
  lastArtwork = centers;
}

function saveArtwork(){
  // small visual feedback: re-draw to ensure no UI overlap
  // Save canvas
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  saveCanvas('aura_' + ts, 'png');
}

/* Utilities */
function clamp(v, a, b){return Math.max(a, Math.min(b, v));}

/* For completeness, allow resizing to keep ratio but not required by spec */
function windowResized(){
  // keep canvas same size; do nothing. Optionally you could implement responsive scaling.
}
