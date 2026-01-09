/* Aether — sketch.js
  Pure p5.js implementation: text -> watercolor + mesh
*/

// Configuration object (centralized parameters)
const CONFIG = {
  particleMin: 800,
  particleMax: 1000,
  particleAlpha: 0.05,
  backgroundHex: '#F2F0E9',
  vowelRegex: /[aeiouyаеёиоуыэюя]/giu,
  labelSize: 14,
  vertexDot: 10,
  lineColor: [0,0,12,0.28], // H,S,L,alpha for stroke
};

// Canvas size derived from CSS variables to avoid hardcoding
let canvasW, canvasH;
let inputEl, generateBtn, clearBtn;
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

  // UI hooks: prefer textarea `textInput` and `generateBtn`
  inputEl = document.getElementById('textInput');
  generateBtn = document.getElementById('generateBtn');
  clearBtn = document.getElementById('clearBtn');

  if(inputEl){
    // Auto-resize textarea
    function autoResize(){
      const maxHraw = getComputedStyle(document.documentElement).getPropertyValue('--input-max-height') || '220px';
      const maxH = parseInt(maxHraw.replace('px',''), 10) || 220;
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, maxH) + 'px';
    }
    inputEl.addEventListener('input', autoResize);
    setTimeout(autoResize, 0);
  }

  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{ if(inputEl){ inputEl.value = ''; inputEl.focus(); } });
  }

  // Only generate on explicit button click for deterministic redraws
  if(generateBtn && inputEl){
    generateBtn.addEventListener('click', ()=> generateFromText(inputEl.value || inputEl.placeholder || ''));
  }

  // create paper texture once
  paperTexture = createGraphics(width, height);
  drawPaperTexture(paperTexture);

  // optional initial sample (do not auto-generate if no input field)
  if(inputEl){
    inputEl.value = "gentle moon river drifting light";
    // do not auto-generate; keep noLoop() - user must press Generate
  }
}

function drawPaperTexture(g){
  g.clear();
  g.background(CONFIG.backgroundHex);
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

  // Deterministic seed derived from raw string so results are repeatable
  let seed = 0;
  for(let i=0;i<raw.length;i++) seed = ((seed * 31) + raw.charCodeAt(i)) >>> 0;
  randomSeed(seed);
  noiseSeed(seed);

  // Draw word clusters and collect centers
  let centers = [];

  for(let i=0;i<words.length;i++){
    const rawWord = words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if(!rawWord) continue;
    const firstChar = rawWord[0];
    const lastChar = rawWord[rawWord.length-1];
    const firstVal = (firstChar && firstChar.codePointAt(0)) ? firstChar.codePointAt(0) % 256 : 0;
    const lastVal = (lastChar && lastChar.codePointAt(0)) ? lastChar.codePointAt(0) % 256 : 0;

    // Word sum
    let sum = 0; for(const c of rawWord) sum += c.codePointAt(0);

    // Map first char -> X (left-right), last char -> Y (top-bottom) per spec
    const x = map(firstVal, 0, 255, width * 0.1, width * 0.9);
    const y = map(lastVal, 0, 255, height * 0.1, height * 0.9);

    // Spread based on total ascii sum / 10
    const spread = sum / 10;

    // Color mapping HSL per spec
    const hue = map(firstVal, 0, 255, 0, 360);
    const len = rawWord.length;
    const sat = constrain(len * 12, 45, 95);
    const vowels = (rawWord.match(CONFIG.vowelRegex) || []).length;
    const light = map(vowels, 0, 10, 40, 70);

    // Particle count deterministic between CONFIG.particleMin..Max, biased by word length
    const baseCount = Math.round(map(len, 1, 12, CONFIG.particleMin, CONFIG.particleMax));
    const particleCount = constrain(baseCount + (sum % 41) - 20, CONFIG.particleMin, CONFIG.particleMax);

    // Save center
    centers.push({x,y, hue, sat, light});

    // Draw cluster: many semi-transparent ellipses with randomGaussian offsets
    push();
    blendMode(MULTIPLY);
    noStroke();

    for(let p=0;p<particleCount;p++){
      const gx = x + randomGaussian() * spread;
      const gy = y + randomGaussian() * spread;
      const size = pow(random(), 1.6) * (spread * 0.035) + random(0.6, 12);
      const alpha = CONFIG.particleAlpha * random(0.6, 1.2);
      fill(hue, sat, light, alpha);
      ellipse(gx, gy, size, size * random(0.7,1.3));
    }

    pop();
  }

  // Draw mesh: thin lines connecting consecutive centers and small labeled dots
  push();
  strokeWeight(1);
  stroke(CONFIG.lineColor[0], CONFIG.lineColor[1], CONFIG.lineColor[2], CONFIG.lineColor[3]);
  noFill();
  for(let k=0;k<centers.length-1;k++){
    const a = centers[k], b = centers[k+1];
    line(a.x, a.y, b.x, b.y);
  }

  // draw vertices with index labels
  fill(0,0,10,0.9);
  noStroke();
  textSize(CONFIG.labelSize);
  textAlign(CENTER, CENTER);
  for(let i=0;i<centers.length;i++){
    const c = centers[i];
    fill(0,0,10,0.95);
    ellipse(c.x, c.y, CONFIG.vertexDot, CONFIG.vertexDot);
    fill(0,0,10,0.95);
    text('#' + (i+1), c.x, c.y - (CONFIG.vertexDot + 6));
  }
  pop();

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
