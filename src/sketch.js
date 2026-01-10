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

    // Hash-based hue and golden-ratio offset (compute hash first for deterministic placement)
    let hval = 5381;
    for(const ch2 of rawWord){ hval = ((hval << 5) + hval) + ch2.codePointAt(0); }
    const baseHue = Math.abs(hval) % 360;
    const hue = (baseHue + (i * 137.5)) % 360;

    // Place job centers around canvas center using Perlin noise (more even, centered distribution)
    const cx = width * 0.5;
    const cy = height * 0.5;
    // derive two noise seeds from the word hash so placement is deterministic
    const nx = noise(Math.abs(hval) * 0.00013 + i * 0.1);
    const ny = noise(Math.abs(hval) * 0.00029 + i * 0.13 + 97);
    const x = cx + map(nx, 0, 1, -width * 0.38, width * 0.38);
    const y = cy + map(ny, 0, 1, -height * 0.38, height * 0.38);

    // Spread based on total ascii sum / constant
    const spread = Math.max(sum / 12, 6);

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

    // reserve box size (increase to allow blobs to spread across canvas)
    const boxSize = Math.max(240, spread * 8);

    // sub-centers for organic blobs (3-5 per word), deterministic from hval
    const subCount = 3 + (Math.abs(hval) % 3); // 3..5
    const subCenters = [];
    // place sub-centers across the reserved box (more spread, not just tiny offsets)
    for(let k=0;k<subCount;k++){
      const ph = ((Math.abs(hval) + (k * 2654435761)) >>> 0);
      const ang = (ph % 360) * (PI / 180);
      const frac = ((ph >>> 8) % 100) / 100;
      const dist = frac * (boxSize / 2); // up to half the box size
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
CONFIG.printSpeed = 8; // Each "particle" is now a full blob/wash

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
    if (!job.diffusionDrawn) {
      renderZoneWithWetEffect(job, artLayer);
      job.diffusionDrawn = true;
    }
    job.stage = 'move';
    job.pauseCounter = CONFIG.stagePause;
  } else if (job.stage === 'move') {
    job.pauseCounter--;
    if (job.pauseCounter <= 0) {
      job.state = 'done';
      printingIndex++;
    }
  }
// Рисует зону с сеткой и акварельными пятнами, маскирует по форме зоны
function renderZoneWithWetEffect(job, targetLayer) {
  const poly = getJobPolygon(job);
  // 1. Создаём отдельный слой для зоны
  let zoneLayer = createGraphics(width, height);
  zoneLayer.colorMode(HSL, 360, 100, 100, 1);
  // 2. Рисуем сетку внутри зоны
  zoneLayer.push();
  zoneLayer.stroke(0, 0, 10, 0.08);
  zoneLayer.strokeWeight(1);
  const bb = getPolygonBoundingBox(poly);
  const cell = Math.max(8, Math.round(job.boxSize / 16));
  for(let gx=bb.minX+cell; gx<bb.maxX; gx+=cell){
    let segs = polygonLineIntersections(poly, {x1:gx, y1:bb.minY, x2:gx, y2:bb.maxY});
    for(let s of segs) zoneLayer.line(gx, s.y1, gx, s.y2);
  }
  for(let gy=bb.minY+cell; gy<bb.maxY; gy+=cell){
    let segs = polygonLineIntersections(poly, {x1:bb.minX, y1:gy, x2:bb.maxX, y2:gy});
    for(let s of segs) zoneLayer.line(s.x1, gy, s.x2, gy);
  }
  zoneLayer.pop();
  // 3. Рисуем пятна (blobs) с мягкими краями
  zoneLayer.push();
  zoneLayer.blendMode(MULTIPLY);
  const washes = Math.round(random(10,15));
  const nVertices = 40;
  const baseRadius = job.boxSize * 0.38;
  for (let w = 0; w < washes; w++) {
    const center = {
      x: job.x + random(-job.boxSize*0.08, job.boxSize*0.08),
      y: job.y + random(-job.boxSize*0.08, job.boxSize*0.08)
    };
    const alpha = 0.011 + random(0,0.018);
    zoneLayer.noStroke();
    zoneLayer.fill(job.hue, job.sat, job.light, alpha);
    zoneLayer.beginShape();
    for (let i = 0; i <= nVertices; i++) {
      const angle = random(TWO_PI) + (TWO_PI * i) / nVertices;
      const noiseVal = noise(
        w*0.2 + Math.cos(angle)*1.7 + job.id*0.13,
        w*0.2 + Math.sin(angle)*1.7 + job.id*0.19,
        job.id*0.31 + w*0.17
      );
      const r = baseRadius * (1 + noiseVal * 2.0);
      const vx = center.x + Math.cos(angle) * r;
      const vy = center.y + Math.sin(angle) * r;
      zoneLayer.curveVertex(vx, vy);
    }
    zoneLayer.endShape(CLOSE);
  }
  // 4. Core blobs (impact center)
  const cores = Math.round(random(3,5));
  for (let c = 0; c < cores; c++) {
    const center = {
      x: job.x + random(-job.boxSize*0.03, job.boxSize*0.03),
      y: job.y + random(-job.boxSize*0.03, job.boxSize*0.03)
    };
    const alpha = 0.07 + random(0,0.09);
    zoneLayer.noStroke();
    zoneLayer.fill(job.hue, job.sat, job.light-12, alpha);
    zoneLayer.beginShape();
    for (let i = 0; i <= nVertices; i++) {
      const angle = random(TWO_PI) + (TWO_PI * i) / nVertices;
      const noiseVal = noise(
        c*0.3 + Math.cos(angle)*1.2 + job.id*0.13,
        c*0.3 + Math.sin(angle)*1.2 + job.id*0.19,
        job.id*0.31 + c*0.17
      );
      const r = baseRadius * 0.45 * (1 + noiseVal * 1.2);
      const vx = center.x + Math.cos(angle) * r;
      const vy = center.y + Math.sin(angle) * r;
      zoneLayer.curveVertex(vx, vy);
    }
    zoneLayer.endShape(CLOSE);
  }
  zoneLayer.pop();
  // 5. Маска по форме зоны
  let maskG = createGraphics(width, height);
  maskG.noStroke();
  maskG.fill(255);
  maskG.beginShape();
  for (let v of poly) maskG.vertex(v.x, v.y);
  maskG.endShape(CLOSE);
  zoneLayer.loadPixels();
  maskG.loadPixels();
  for (let i = 0; i < zoneLayer.pixels.length; i += 4) {
    if (maskG.pixels[i] === 0) {
      zoneLayer.pixels[i+3] = 0;
    }
  }
  zoneLayer.updatePixels();
  // 6. Наложение слоя на artLayer
  targetLayer.image(zoneLayer, 0, 0);
}
// Draws watercolor diffusion: 10-15 large washes (irregular polygons), 3-5 core blobs
function drawDiffusionBlobs(job, g) {
  const poly = getJobPolygon(job);
  // For triangle: create a mask
  let maskG = null;
  if (poly.length === 3) {
    maskG = createGraphics(width, height);
    maskG.noStroke();
    maskG.fill(255);
    maskG.beginShape();
    for (let v of poly) maskG.vertex(v.x, v.y);
    maskG.endShape(CLOSE);
  }
  // Washes
  const washes = Math.round(random(10,15));
  const nVertices = 40;
  const baseRadius = job.boxSize * 0.38;
  for (let w = 0; w < washes; w++) {
    const center = {
      x: job.x + random(-job.boxSize*0.08, job.boxSize*0.08),
      y: job.y + random(-job.boxSize*0.08, job.boxSize*0.08)
    };
    const alpha = 0.011 + random(0,0.018);
    const spread = job.spread * random(1.1, 2.2);
    const offsetAngle = random(TWO_PI);
    let shapePts = [];
    for (let i = 0; i <= nVertices; i++) {
      const angle = offsetAngle + (TWO_PI * i) / nVertices;
      const noiseVal = noise(
        w*0.2 + Math.cos(angle)*1.7 + job.id*0.13,
        w*0.2 + Math.sin(angle)*1.7 + job.id*0.19,
        job.id*0.31 + w*0.17
      );
      const r = baseRadius * (1 + noiseVal * 2.0);
      const vx = center.x + Math.cos(angle) * r;
      const vy = center.y + Math.sin(angle) * r;
      shapePts.push({x:vx, y:vy});
    }
    g.push();
    g.blendMode(MULTIPLY);
    g.noStroke();
    g.fill(job.hue, job.sat, job.light, alpha);
    g.beginShape();
    for (let pt of shapePts) g.curveVertex(pt.x, pt.y);
    g.endShape(CLOSE);
    g.pop();
    // If triangle, mask this wash
    if (maskG) {
      maskG.push();
      maskG.blendMode(MULTIPLY);
      maskG.noStroke();
      maskG.fill(255);
      maskG.beginShape();
      for (let pt of shapePts) maskG.curveVertex(pt.x, pt.y);
      maskG.endShape(CLOSE);
      maskG.pop();
    }
  }
  // Core blobs (impact center)
  const cores = Math.round(random(3,5));
  for (let c = 0; c < cores; c++) {
    const center = {
      x: job.x + random(-job.boxSize*0.03, job.boxSize*0.03),
      y: job.y + random(-job.boxSize*0.03, job.boxSize*0.03)
    };
    const alpha = 0.07 + random(0,0.09);
    const spread = job.spread * random(0.5, 1.1);
    const offsetAngle = random(TWO_PI);
    let shapePts = [];
    for (let i = 0; i <= nVertices; i++) {
      const angle = offsetAngle + (TWO_PI * i) / nVertices;
      const noiseVal = noise(
        c*0.3 + Math.cos(angle)*1.2 + job.id*0.13,
        c*0.3 + Math.sin(angle)*1.2 + job.id*0.19,
        job.id*0.31 + c*0.17
      );
      const r = baseRadius * 0.45 * (1 + noiseVal * 1.2);
      const vx = center.x + Math.cos(angle) * r;
      const vy = center.y + Math.sin(angle) * r;
      shapePts.push({x:vx, y:vy});
    }
    g.push();
    g.blendMode(MULTIPLY);
    g.noStroke();
    g.fill(job.hue, job.sat, job.light-12, alpha);
    g.beginShape();
    for (let pt of shapePts) g.curveVertex(pt.x, pt.y);
    g.endShape(CLOSE);
    g.pop();
    if (maskG) {
      maskG.push();
      maskG.blendMode(MULTIPLY);
      maskG.noStroke();
      maskG.fill(255);
      maskG.beginShape();
      for (let pt of shapePts) maskG.curveVertex(pt.x, pt.y);
      maskG.endShape(CLOSE);
      maskG.pop();
    }
  }
  // If triangle, apply mask: only keep paint inside triangle
  if (maskG) {
    g.drawingContext.save();
    g.drawingContext.globalCompositeOperation = 'destination-in';
    g.image(maskG, 0, 0);
    g.drawingContext.restore();
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
// Draws a technical polygonal zone (triangle, rectangle, trapezoid) with grid
function drawReservedBox(job, highlight = false) {
  push();
  strokeWeight(1);
  stroke(0,0,10, highlight ? 0.24 : 0.12);
  fill(0,0,100, highlight ? 0.02 : 0.01);
  let poly = getJobPolygon(job);
  beginShape();
  for (let v of poly) vertex(v.x, v.y);
  endShape(CLOSE);

  // Draw grid inside polygon (approximate by drawing lines between bounding box intersections)
  const bb = getPolygonBoundingBox(poly);
  const cell = Math.max(8, Math.round(job.boxSize / 8));
  stroke(0,0,20,0.08);
  strokeWeight(1);
  // Vertical grid
  for(let gx=bb.minX+cell; gx<bb.maxX; gx+=cell){
    let segs = polygonLineIntersections(poly, {x1:gx, y1:bb.minY, x2:gx, y2:bb.maxY});
    for(let s of segs) line(gx, s.y1, gx, s.y2);
  }
  // Horizontal grid
  for(let gy=bb.minY+cell; gy<bb.maxY; gy+=cell){
    let segs = polygonLineIntersections(poly, {x1:bb.minX, y1:gy, x2:bb.maxX, y2:gy});
    for(let s of segs) line(s.x1, gy, s.x2, gy);
  }
  pop();
}

// Returns polygon vertices for job zone (triangle, rectangle, trapezoid)
function getJobPolygon(job) {
  const t = job.shapeType % 3;
  const cx = job.x, cy = job.y, s = job.boxSize;
  if (t === 0) { // Triangle
    const a = -PI/2 + job.id;
    return [
      {x: cx + Math.cos(a) * s/2, y: cy + Math.sin(a) * s/2},
      {x: cx + Math.cos(a+2*PI/3) * s/2, y: cy + Math.sin(a+2*PI/3) * s/2},
      {x: cx + Math.cos(a+4*PI/3) * s/2, y: cy + Math.sin(a+4*PI/3) * s/2},
    ];
  } else if (t === 1) { // Rectangle
    return [
      {x: cx-s/2, y: cy-s/2},
      {x: cx+s/2, y: cy-s/2},
      {x: cx+s/2, y: cy+s/2},
      {x: cx-s/2, y: cy+s/2},
    ];
  } else { // Trapezoid
    const h = s/2, top = s*0.45, bot = s*0.95;
    return [
      {x: cx-top/2, y: cy-h},
      {x: cx+top/2, y: cy-h},
      {x: cx+bot/2, y: cy+h},
      {x: cx-bot/2, y: cy+h},
    ];
  }
}

// Returns bounding box for polygon [{x,y}...]
function getPolygonBoundingBox(poly) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (let v of poly) {
    if (v.x<minX) minX=v.x;
    if (v.x>maxX) maxX=v.x;
    if (v.y<minY) minY=v.y;
    if (v.y>maxY) maxY=v.y;
  }
  return {minX, minY, maxX, maxY};
}

// Returns array of {x1,y1,x2,y2} segments where a line crosses the polygon
function polygonLineIntersections(poly, line) {
  let res = [];
  for (let i=0; i<poly.length; i++) {
    let a = poly[i], b = poly[(i+1)%poly.length];
    let ix = lineSegIntersection(a.x,a.y,b.x,b.y,line.x1,line.y1,line.x2,line.y2);
    if (ix) res.push(ix);
  }
  // Pair up intersections to form segments
  let segs = [];
  for (let i=0; i+1<res.length; i+=2) {
    segs.push({x1:res[i].x, y1:res[i].y, x2:res[i+1].x, y2:res[i+1].y});
  }
  return segs;
}

// Returns intersection point of two line segments, or null
function lineSegIntersection(x1,y1,x2,y2,x3,y3,x4,y4) {
  const denom = (x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if (denom===0) return null;
  const px = ((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/denom;
  const py = ((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/denom;
  if (
    px<Math.min(x1,x2)-0.1 || px>Math.max(x1,x2)+0.1 ||
    px<Math.min(x3,x4)-0.1 || px>Math.max(x3,x4)+0.1 ||
    py<Math.min(y1,y2)-0.1 || py>Math.max(y1,y2)+0.1 ||
    py<Math.min(y3,y4)-0.1 || py>Math.max(y3,y4)+0.1
  ) return null;
  return {x:px, y:py};
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
