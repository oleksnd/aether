/* Aether — sketch.js
  Pure p5.js implementation: text -> watercolor + mesh
*/

// Configuration object (centralized parameters)
const CONFIG = {
  particleMin: 800,
  particleMax: 1000,
  particleAlpha: 0.25, // stronger core wash per redesign
  backgroundHex: '#F2F0E9',
  vowelRegex: /[aeiouyаеёиоуыэюя]/giu,
  labelSize: 14,
  vertexDot: 6, // smaller, less intrusive
  lineColor: [0,0,12,0.12], // H,S,L,alpha for stroke (ethereal)
  particlesPerFrame: 150,
  stagePause: 10, // frames for pauses
};

// Canvas size derived from CSS variables to avoid hardcoding
let canvasW, canvasH;
let inputEl, generateBtn, clearBtn;
let canvas; // p5 canvas reference
let hoverLabelDiv; // DOM overlay for on-hover labels
let paperTexture; // p5.Graphics for background texture
let artLayer; // persistent artwork buffer where printed particles are committed
let jobs = []; // sequential print jobs
let printingIndex = -1; // current job index
let lastArtwork = [];

// moving nozzle position (updated to last emitted particle)
let nozzleX = 0;
let nozzleY = 0;

function setup(){
  // read canvas size from CSS variables
  const rootStyles = getComputedStyle(document.documentElement);
  const cw = rootStyles.getPropertyValue('--canvas-width').trim() || '1200px';
  const ch = rootStyles.getPropertyValue('--canvas-height').trim() || '800px';
  canvasW = parseInt(cw.replace('px',''), 10);
  canvasH = parseInt(ch.replace('px',''), 10);

  canvas = createCanvas(canvasW, canvasH);
  canvas.parent('canvasHolder');
  pixelDensity(1);

  // HSL color mode for intuitive hue/sat/light mapping
  colorMode(HSL, 360, 100, 100, 1);
  // keep draw() running to animate sequential printing
  loop();

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

  // Add clear button behavior if present
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      // stop and clear jobs/art
      jobs = [];
      printingIndex = -1;
      artLayer && artLayer.clear();
      clearCanvas();
    });
  }

  // create paper texture once
  paperTexture = createGraphics(width, height);
  drawPaperTexture(paperTexture);

  // create a small DOM overlay used to reveal labels on hover (non-blocking)
  hoverLabelDiv = document.getElementById('hoverLabel');
  if(!hoverLabelDiv){
    hoverLabelDiv = document.createElement('div');
    hoverLabelDiv.id = 'hoverLabel';
    Object.assign(hoverLabelDiv.style, {
      position: 'absolute',
      pointerEvents: 'none',
      padding: '6px 8px',
      background: 'rgba(255,255,255,0.92)',
      color: '#0b0b0b',
      borderRadius: '6px',
      fontSize: '12px',
      fontFamily: 'Inter, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      display: 'none',
      zIndex: 9999,
      transform: 'translate(12px,12px)'
    });
    document.body.appendChild(hoverLabelDiv);
  }

  // show a label only when mouse is near a vertex (subtle UX)
  window.addEventListener('mousemove', (ev)=>{
    if(!lastArtwork || lastArtwork.length === 0){ hoverLabelDiv.style.display = 'none'; return; }
    const rect = canvas.elt.getBoundingClientRect();
    // account for CSS scaling of the canvas
    const scaleX = rect.width / canvas.elt.width;
    const scaleY = rect.height / canvas.elt.height;
    let found = false;

    for(let i=0;i<lastArtwork.length;i++){
      const c = lastArtwork[i];
      // compute vertex position in viewport coordinates
      const vx = rect.left + c.x * scaleX;
      const vy = rect.top + c.y * scaleY;
      const mx = ev.clientX;
      const my = ev.clientY;
      const threshold = Math.max(12, CONFIG.vertexDot * 1.4 * Math.max(scaleX, scaleY));
      const d = Math.hypot(mx - vx, my - vy);

      if(d < threshold){
        hoverLabelDiv.textContent = '#' + (i+1);
        // ensure visible for measurement
        hoverLabelDiv.style.display = 'block';
        hoverLabelDiv.style.left = '0px';
        hoverLabelDiv.style.top = '0px';

        // preferred position (page coordinates)
        const baseLeft = Math.round(rect.left + window.scrollX + c.x * scaleX + 12);
        const baseTop = Math.round(rect.top + window.scrollY + c.y * scaleY + 12);

        // measure tooltip and clamp inside viewport with margin
        const tipRect = hoverLabelDiv.getBoundingClientRect();
        const tipW = tipRect.width;
        const tipH = tipRect.height;
        const margin = 8;
        const minLeft = window.scrollX + margin;
        const maxLeft = window.scrollX + window.innerWidth - tipW - margin;
        const minTop = window.scrollY + margin;
        const maxTop = window.scrollY + window.innerHeight - tipH - margin;
        const left = Math.min(Math.max(baseLeft, minLeft), maxLeft);
        const top = Math.min(Math.max(baseTop, minTop), maxTop);

        hoverLabelDiv.style.left = left + 'px';
        hoverLabelDiv.style.top = top + 'px';

        found = true; break;
      }
    }
    if(!found) hoverLabelDiv.style.display = 'none';
  });

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
  // ensure artLayer is drawn above paper (artLayer persists printed particles)
  if(artLayer) image(artLayer, 0, 0);
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

  // Compute dynamic min/max character codes across the raw input so mappings use full range
  const codePoints = [];
  for(const ch of raw){
    const v = ch.codePointAt(0);
    if(!Number.isNaN(v)) codePoints.push(v);
  }
  let minChar = codePoints.length ? Math.min(...codePoints) : 0;
  let maxChar = codePoints.length ? Math.max(...codePoints) : minChar + 1;

  // If range is too small, expand it (+/- 20) to ensure better spatial spread
  if((maxChar - minChar) < 10){
    minChar = Math.max(0, minChar - 20);
    maxChar = maxChar + 20;
  }

  // Prepare job list (one job per word) for sequential animated printing
  let centers = [];
  jobs = [];

  for(let i=0;i<words.length;i++){
    const rawWord = words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if(!rawWord) continue;
    const firstChar = rawWord[0];
    const lastChar = rawWord[rawWord.length-1];
    const firstVal = (firstChar && firstChar.codePointAt(0)) ? firstChar.codePointAt(0) : minChar;
    const lastVal = (lastChar && lastChar.codePointAt(0)) ? lastChar.codePointAt(0) : minChar;

    // Word sum
    let sum = 0; for(const c of rawWord) sum += c.codePointAt(0);

    // Big Bang cubic mapping to compute reserved coordinates
    const normX = (firstVal - minChar) / (maxChar - minChar);
    const pushedX = pow((normX - 0.5) * 2, 3);
    const x = map(pushedX, -1, 1, width * 0.05, width * 0.95);

    const normY = (lastVal - minChar) / (maxChar - minChar);
    const pushedY = pow((normY - 0.5) * 2, 3);
    const y = map(pushedY, -1, 1, height * 0.05, height * 0.95);

    // Spread based on total ascii sum / constant
    const spread = Math.max(sum / 12, 6);

    // Hash-based hue and golden ratio offset
    let hval = 5381;
    for(const ch2 of rawWord){ hval = ((hval << 5) + hval) + ch2.codePointAt(0); }
    const baseHue = Math.abs(hval) % 360;
    const hue = (baseHue + (i * 137.5)) % 360;

    // Shape DNA: unique geometric distribution per word
    const shapeType = Math.abs(hval) % 4;
    let streamAngle = 0;
    if (shapeType === 2) streamAngle = random(TWO_PI);

    const len = rawWord.length;
    const sat = constrain(90 + (Math.abs(hval) % 11), 90, 100);
    const vowels = (rawWord.match(CONFIG.vowelRegex) || []).length;
    const light = map(vowels, 0, 10, 42, 68);

    // Totals for staged printing
    const washTotal = constrain(len * 40, 200, 1200); // larger faint spots
    const bodyTotal = constrain(len * 600, 3000, 12000); // increased body density for blobs
    const splatterTotal = Math.round(random(80, 200)); // accents only

    // reserve box size
    const boxSize = Math.max(160, spread * 6);

    // sub-centers for organic blobs (3-5 per word), deterministic from hval
    const subCount = 3 + (Math.abs(hval) % 3); // 3..5
    const subCenters = [];
    for(let k=0;k<subCount;k++){
      const ph = ((Math.abs(hval) + (k * 2654435761)) >>> 0);
      const ang = (ph % 360) * (PI / 180);
      const frac = ((ph >>> 8) % 100) / 100;
      const dist = frac * spread * 1.5; // up to 1.5x spread
      subCenters.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist });
    }

    jobs.push({
      id: i,
      word: rawWord,
      x, y, hue, sat, light,
      spread,
      washTotal, washDone: 0,
      bodyTotal, bodyDone: 0,
      splatterTotal, splatterDone: 0,
      boxSize,
      state: 'pending',
      sum, len,
      stage: 'scan',
      pauseCounter: CONFIG.stagePause,
      shapeType,
      streamAngle,
      subCenters,
    });

    centers.push({x, y, hue, sat, light});
  }

  // reset art layer and lastArtwork
  artLayer = createGraphics(width, height);
  artLayer.clear();
  artLayer.colorMode(HSL, 360, 100, 100, 1);

  lastArtwork = centers;

  // begin sequential printing
  printingIndex = 0;
  // ensure loop() is running
  loop();

  // subtle grid overlay for technical feel
  push();
  stroke(0,0,100,0.03);
  strokeWeight(0.5);
  for(let gx=0; gx<=width; gx+=80) line(gx,0,gx,height);
  for(let gy=0; gy<=height; gy+=80) line(0,gy,width,gy);
  pop();

  // Draw mesh: thin lines connecting consecutive centers and small labeled dots
  push();
  strokeWeight(0.45);
  stroke(CONFIG.lineColor[0], CONFIG.lineColor[1], CONFIG.lineColor[2], CONFIG.lineColor[3]);
  noFill();
  for(let k=0;k<centers.length-1;k++){
    const a = centers[k], b = centers[k+1];
    line(a.x, a.y, b.x, b.y);
  }

  // draw vertices with subtle labels (faint by default)
  noStroke();
  textSize(CONFIG.labelSize);
  textAlign(CENTER, CENTER);
  for(let i=0;i<centers.length;i++){
    const c = centers[i];
    fill(0,0,10,0.65);
    ellipse(c.x, c.y, CONFIG.vertexDot, CONFIG.vertexDot);
    fill(0,0,10,0.1);
    text('#' + (i+1), c.x, c.y - (CONFIG.vertexDot + 6));
  }
  pop();

  lastArtwork = centers;
}

function saveArtwork(){
  // small visual feedback: re-draw to ensure no UI overlap
  // ensure current frame is flushed
  redraw();
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  saveCanvas('aura_' + ts, 'png');
}

/* Utilities */
function clamp(v, a, b){return Math.max(a, Math.min(b, v));}

/* PRINT speed in particles per frame (configurable) */
CONFIG.printSpeed = CONFIG.particlesPerFrame;

/* For completeness, allow resizing to keep ratio but not required by spec */
function windowResized(){
  // keep canvas same size; do nothing. Optionally you could implement responsive scaling.
}

/* draw loop to animate sequential printing */
function draw(){
  // draw background paper
  blendMode(BLEND);
  image(paperTexture,0,0);
  // draw persistent art
  blendMode(MULTIPLY);
  if(artLayer) image(artLayer, 0, 0);

  // helpful subtle grid
  push();
  stroke(0,0,100,0.02);
  strokeWeight(0.4);
  for(let gx=0; gx<=width; gx+=80) line(gx,0,gx,height);
  for(let gy=0; gy<=height; gy+=80) line(0,gy,width,gy);
  pop();

  // draw mesh connections only for completed jobs
  push();
  strokeWeight(0.45);
  stroke(CONFIG.lineColor[0], CONFIG.lineColor[1], CONFIG.lineColor[2], CONFIG.lineColor[3]);
  noFill();
  for(let k=0;k<jobs.length-1;k++){
    if(jobs[k].state === 'done'){
      const a = jobs[k], b = jobs[k+1];
      line(a.x, a.y, b.x, b.y);
    }
  }
  pop();

  // if no jobs, nothing to animate
  if(!jobs || jobs.length === 0) return;

  // show reserved zones for pending jobs
  for(let j=0;j<jobs.length;j++){
    const job = jobs[j];
    if(job.state === 'pending'){
      drawReservedBox(job);
    }
  }

  // ensure current printing index is valid
  if(printingIndex < 0 || printingIndex >= jobs.length) return;
  const job = jobs[printingIndex];

  // draw reserved box and metadata UI for current job
  drawReservedBox(job, true);

  // perform printing based on stage (scan -> ink -> move)
  if (job.stage === 'scan') {
    job.pauseCounter--;
    if (job.pauseCounter <= 0) job.stage = 'ink';
  } else if (job.stage === 'ink') {
    // add particles slowly into the job.box (particles drop into center)
    let remaining = CONFIG.printSpeed;
    while (remaining > 0) {
      // Layer 1 (Base): Large, sparse drops. size = random(10, 25). Alpha very low (0.08).
      if (job.washDone < job.washTotal) {
        // pick one of the sub-centers as origin
        const origin = job.subCenters && job.subCenters.length ? random(job.subCenters) : {x: job.x, y: job.y};
        // base position with slight Gaussian
        const bx = origin.x + randomGaussian() * job.spread * 0.7;
        const by = origin.y + randomGaussian() * job.spread * 0.7;
        // noise displacement for irregular smears
        const noiseX = noise(bx * 0.01, by * 0.01, job.id);
        const noiseY = noise(bx * 0.01 + 100, by * 0.01 + 100, job.id);
        const gx = bx + map(noiseX, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        const gy = by + map(noiseY, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        // stretched, rotated brushstroke
        const angle = random(TWO_PI);
        const w = job.spread * 2 * random(0.8, 1.3) * 0.4;
        const h = w * random(2.0, 4.0);
        artLayer.push();
        artLayer.translate(gx, gy);
        artLayer.rotate(angle);
        artLayer.noStroke();
        artLayer.fill(job.hue, job.sat, job.light, 0.05);
        artLayer.ellipse(0, 0, w, h);
        artLayer.pop();
        nozzleX = gx; nozzleY = gy;
        job.washDone++; remaining--; continue;
      }

      // Layer 2 (Body - The Main Fill): MASSIVE density of medium dots. size = random(3, 12). Alpha medium (0.15).
      if (job.bodyDone < job.bodyTotal) {
        // pick a sub-center for this particle
        const origin = job.subCenters && job.subCenters.length ? random(job.subCenters) : {x: job.x, y: job.y};
        // base position
        const bx = origin.x + randomGaussian() * job.spread * 0.7;
        const by = origin.y + randomGaussian() * job.spread * 0.7;
        // noise displacement
        const noiseX = noise(bx * 0.01, by * 0.01, job.id);
        const noiseY = noise(bx * 0.01 + 100, by * 0.01 + 100, job.id);
        const gx = bx + map(noiseX, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        const gy = by + map(noiseY, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        // stretched brushstroke
        const angle = random(TWO_PI);
        const size = random(3, 12);
        const w = size * 0.4;
        const h = size * random(2.0, 4.0);
        artLayer.push();
        artLayer.translate(gx, gy);
        artLayer.rotate(angle);
        artLayer.noStroke();
        artLayer.fill(job.hue, job.sat, job.light, 0.15);
        artLayer.ellipse(0, 0, w, h);
        artLayer.pop();
        nozzleX = gx; nozzleY = gy;
        job.bodyDone++; remaining--; continue;
      }

      // Layer 3 (Accent Splatter): Tiny, sharp dots scattered wide. size = random(1, 4). Alpha high (0.6).
      if (job.splatterDone < job.splatterTotal) {
        const origin = job.subCenters && job.subCenters.length ? random(job.subCenters) : {x: job.x, y: job.y};
        // base position
        const bx = origin.x + randomGaussian() * job.spread * 0.7;
        const by = origin.y + randomGaussian() * job.spread * 0.7;
        // noise displacement
        const noiseX = noise(bx * 0.01, by * 0.01, job.id);
        const noiseY = noise(bx * 0.01 + 100, by * 0.01 + 100, job.id);
        const gx = bx + map(noiseX, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        const gy = by + map(noiseY, 0, 1, -job.spread * 1.5, job.spread * 1.5);
        // stretched brushstroke
        const angle = random(TWO_PI);
        const size = random(1, 4);
        const w = size * 0.4;
        const h = size * random(2.0, 4.0);
        artLayer.push();
        artLayer.translate(gx, gy);
        artLayer.rotate(angle);
        artLayer.noStroke();
        artLayer.fill(job.hue, job.sat, job.light, 0.6);
        artLayer.ellipse(0, 0, w, h);
        artLayer.pop();
        nozzleX = gx; nozzleY = gy;
        job.splatterDone++; remaining--; continue;
      }

      // finished ink stage
      job.stage = 'move';
      job.pauseCounter = CONFIG.stagePause;
      break;
    }
  } else if (job.stage === 'move') {
    job.pauseCounter--;
    if (job.pauseCounter <= 0) {
      job.state = 'done';
      printingIndex++;
    }
  }

  // draw a subtle printer nozzle for visual feedback at current job position
  push();
  noStroke();
  fill(0,0,10,0.9);
  // ensure nozzle has a valid position; default to job center
  const nx = nozzleX || job.x;
  const ny = nozzleY || job.y;
  ellipse(nx, ny, 6, 6);
  pop();

  // update metadata overlay for current job
  drawJobMetadata(job);
}

/* Helper: draw reserved box with grid; highlight = boolean shows metadata */
function drawReservedBox(job, highlight = false){
  push();
  rectMode(CENTER);
  strokeWeight(1);
  stroke(0,0,10, highlight ? 0.24 : 0.12);
  fill(0,0,100, highlight ? 0.02 : 0.01);
  rect(job.x, job.y, job.boxSize, job.boxSize, 4);

  // internal fine grid
  const cell = Math.max(8, Math.round(job.boxSize / 8));
  stroke(0,0,20,0.08);
  strokeWeight(1);
  for(let gx=job.x - job.boxSize/2 + cell; gx < job.x + job.boxSize/2; gx += cell){
    line(gx, job.y - job.boxSize/2, gx, job.y + job.boxSize/2);
  }
  for(let gy=job.y - job.boxSize/2 + cell; gy < job.y + job.boxSize/2; gy += cell){
    line(job.x - job.boxSize/2, gy, job.x + job.boxSize/2, gy);
  }
  pop();
}

/* Helper: draw metadata text near a job */
function drawJobMetadata(job){
  const bx = Math.min(job.x + job.boxSize/2 + 12, width - 140);
  const by = Math.max(12, job.y - job.boxSize/2);
  push();
  rectMode(CORNER);
  noStroke();
  fill(0,0,100,0.92);
  rect(bx, by, 132, 24, 6);
  fill(0,0,10,0.96);
  textSize(12);
  textAlign(LEFT, TOP);
  const totalPrinted = job.washDone + job.bodyDone + job.splatterDone;
  text('Max: ' + job.bodyTotal + ' | Count: ' + totalPrinted, bx + 8, by + 6);
  pop();
}
