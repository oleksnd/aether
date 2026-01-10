// AETHER: Watercolor Text Generator — Revamped Watercolor 2.0
// Автор: GitHub Copilot | Модель: Raptor mini (Preview)

// Цель: строгая разделённость слоёв, натуральная акварель, пастельная палитра,
// органичное распределение слов по холсту (не по одной диагонали), и Perlin-фаллбек.

let words = [];
let currentIndex = -1;
let state = 'IDLE'; // IDLE, MOVING, PAINTING, DONE
let nozzle = { x: 0, y: 0 };
let target = { x: 0, y: 0 };
let paintingTimer = 0;
let uiLayer;
let paperLayer; // static paper texture
let artLayer;   // persistent watercolor paint

// Конфиг. Пастельная палитра. Никакого чистого чёрного в живом слое.
const CONFIG = {
  minRadius: 10,
  maxRadius: 140,
  moveSpeed: 0.12,
  paintDuration: 90,
  brushAlpha: 8, // очень низкая прозрачность
  bleedIntensity: 0.25,

  // Fast-mode: lower-fidelity but much faster rendering/animation
  fastMode: true,
  fast: {
    moveSpeed: 0.28,
    paintDuration: 30,
    layersScale: 0.5,
    ellipseCountScale: 0.6,
    dropletFreqScale: 0.45
  },

  palette: [
    '#CDECCF', // Mint
    '#E9D6F4', // Lavender
    '#F8C8DC', // Pale Rose
    '#CFEAFD'  // Sky Blue
  ]
};

// Simple, deterministic string hash
function cyrb53(str, seed = 0) {
  let h1 = 0xDEADBEEF ^ seed, h2 = 0x41C6CE57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    let ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // Layers: paperLayer (static), artLayer (persistent paint), uiLayer (cleared each frame)
  paperLayer = createGraphics(width, height);
  artLayer = createGraphics(width, height);
  uiLayer = createGraphics(width, height);

  // Draw paper texture once
  drawPaperTexture();

  // Initialize brush & palette safely (try/catch to avoid crashes)
  window.hasBrush = false;
  window.hasPalette = false;
  try {
    if (typeof brush !== 'undefined') {
      if (typeof brush.load === 'function') brush.load();
      if (typeof brush.pick === 'function') brush.pick('watercolor');
      if (typeof brush.scaleBrushes === 'function') brush.scaleBrushes(1.2);
      window.hasBrush = true;
    }
  } catch (e) {
    console.warn('Brush init failed:', e);
    window.hasBrush = false;
  }

  // Try to initialize a pastel palette if a palette API exists; otherwise fallback to CONFIG.palette
  try {
    if (typeof palette !== 'undefined' && palette && typeof palette.seed === 'function') {
      // some palette libs accept seed; keep as-is
      window.hasPalette = true;
    } else if (typeof p5 !== 'undefined' && p5.prototype && p5.prototype.palette) {
      try { palette = new p5.prototype.palette(CONFIG.palette); window.hasPalette = true; } catch(e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('Palette init failed:', e);
    window.hasPalette = false;
  }

  // Start position (absolute coords)
  nozzle.x = width / 2;
  nozzle.y = height / 2;

  // Ensure fast-mode settings applied
  setFastMode(CONFIG.fastMode);

  // Expose API
  window.startGeneration = startGeneration;
  window.setFastMode = setFastMode;
}

// Toggle fast-mode at runtime (reduces fidelity but speeds up animation & draw)
function setFastMode(enabled) {
  CONFIG.fastMode = !!enabled;
  if (CONFIG.fastMode) {
    CONFIG.moveSpeed = CONFIG.fast.moveSpeed;
    CONFIG.paintDuration = CONFIG.fast.paintDuration;
  } else {
    CONFIG.moveSpeed = 0.12;
    CONFIG.paintDuration = 90;
  }
} 

function draw() {
  // Clear transient UI layer first (always) so transient elements live only on uiLayer
  uiLayer.clear();

  // Render: paper texture (static) under everything, then art, then UI
  image(paperLayer, 0, 0);
  image(artLayer, 0, 0);

  if (state === 'MOVING') moveNozzle();
  else if (state === 'PAINTING') paintWord();

  // Draw persistent UI elements after inking steps (nozzle, guides)
  drawUI();
  image(uiLayer, 0, 0);
}

// Draw tactile paper texture ON paperLayer once (not every frame)
function drawPaperTexture() {
  paperLayer.clear();
  paperLayer.push();
  // change to a neutral, very light gray paper (matches body)
  paperLayer.background('#f5f5f5');

  // Subtle fiber noise (lighter and less dense)
  paperLayer.noStroke();
  paperLayer.fill(0, 4);
  for (let i = 0; i < 12000; i++) {
    let x = random(paperLayer.width);
    let y = random(paperLayer.height);
    paperLayer.ellipse(x, y, random(0.4, 1.6), random(0.4, 1.6));
  }

  // Very soft tonal patches (even lighter)
  paperLayer.blendMode(OVERLAY);
  paperLayer.noStroke();
  paperLayer.fill(255, 6);
  for (let y = 0; y < paperLayer.height; y += 12) {
    let n = noise(y * 0.0015);
    let h = max(0.4, 6 * n);
    paperLayer.ellipse(paperLayer.width * 0.5, y + h * 0.5, paperLayer.width * 1.05, h);
  }
  paperLayer.blendMode(BLEND);

  // Smaller grid with subtle blue tint and slightly stronger contrast
  // stroke(r, g, b, a) — blue-gray tint, low alpha for subtlety
  paperLayer.stroke(140, 170, 200, 22);
  paperLayer.strokeWeight(0.7);
  let gap = 24; // smaller cells for finer grid
  for (let x = 0; x < paperLayer.width; x += gap) {
    paperLayer.line(x, 0, x, paperLayer.height);
  }
  for (let y = 0; y < paperLayer.height; y += gap) {
    paperLayer.line(0, y, paperLayer.width, y);
  }

  paperLayer.pop();
}

function startGeneration(inputText = 'AETHER VOID SILENCE') {
  // Reset persistent paint but keep paper texture
  artLayer.clear();
  words = [];
  currentIndex = -1;
  state = 'IDLE';

  // Parse words
  let rawWords = inputText.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) rawWords = ['AETHER','VOID','SILENCE'];

  // Placement via deterministic formula from word characters (Unicode-aware).
  // Each word becomes a visual 'rectangle' (puddle area). Formula uses:
  // - sum of char codes, word length, and a fast hash `cyrb53` to derive angle, radius, orientation and color.
  let minR = min(width, height) * 0.06;
  let maxR = min(width, height) * 0.46;

  // Placement: Golden Spiral / radial distribution for organic coverage
  // Use a deterministic golden angle + seed offset so placement is stable per text.
  const GOLDEN_ANGLE = PI * (3 - sqrt(5)); // ~2.399963229728653
  let centerX = width / 2;
  let centerY = height / 2;
  // scale so that spiral covers most of the canvas without overlapping edges aggressively
  maxR = min(width, height) * 0.42;

  for (let i = 0; i < rawWords.length; i++) {
    let w = rawWords[i];
    let seed = cyrb53(w + '|' + i);

    // sum of Unicode codepoints and unicode-aware length
    let sumCodes = 0;
    for (let ch of w) sumCodes += ch.codePointAt(0) || 0;
    let N = Array.from(w).length;

    // golden spiral position with small seed jitter
    let angle = (i * GOLDEN_ANGLE) + (seed % 360) * 0.008; // seed introduces variation without breaking spiral
    let rnorm = sqrt(i + ((seed % 13) / 13)); // sqrt spacing feels organic
    let radius = map(rnorm, 0, sqrt(max(1, rawWords.length)), min(width, height) * 0.04, maxR);

    let x = centerX + radius * cos(angle) + map(noise(seed * 0.00017, i * 0.03), 0, 1, -24, 24);
    let y = centerY + radius * sin(angle) + map(noise(seed * 0.00023, i * 0.035), 0, 1, -24, 24);

    // size scales with word length, but limited to avoid overlap
    let minSide = min(width, height) * 0.06;
    let maxSide = min(width, height) * 0.38;
    let normSize = constrain((N + (sumCodes % 9) / 9) / 14, 0, 1);
    let side = lerp(minSide, maxSide, pow(normSize, 0.9)) * (0.9 + noise(seed * 0.0007) * 0.2);

    // orientation roughly tangent to spiral for better composition
    let orientation = degrees(angle + PI * 0.5) + map(noise(seed * 0.002), 0, 1, -20, 20);

    // Pastel HSL color derived from seed + sum codes, constrained to soft tones
    let hue = (seed % 360 + sumCodes) % 360;
    let sat = lerp(18, 34, ((sumCodes % 97) / 97));
    let light = lerp(74, 88, 1 - ((sumCodes % 103) / 103));
    let alpha = constrain(0.025 + (N / 16) * 0.045, 0.02, 0.06);
    let col = `hsla(${Math.floor(hue)}, ${Math.floor(sat)}%, ${Math.floor(light)}%, ${alpha})`;

    words.push({
      text: w,
      x, y,
      orientation,
      width: side,
      height: side,
      color: col,
      baseSize: side,
      seed,
      sumCodes,
      N
    });

    // Compute a trapezoid-shaped geometric boundary (relative coords) — top narrower than bottom
    // Keep local coordinates to speed up per-frame transforms.
    let topW = side * (0.76 + (Math.min(14, N) / 14) * 0.08);
    let botW = side * (0.96 + (Math.min(14, N) / 14) * 0.18);
    let hh = side * (0.6 + (Math.min(14, N) / 14) * 0.6);
    let polyRel = [
      { x: -topW * 0.5, y: -hh * 0.5 },
      { x: topW * 0.5, y: -hh * 0.5 },
      { x: botW * 0.5, y: hh * 0.5 },
      { x: -botW * 0.5, y: hh * 0.5 }
    ];

    // Area -> determine number of iterations (frames) and droplets per iteration
    let area = (topW + botW) * 0.5 * hh;
    let minArea = pow(min(width, height) * 0.06, 2) * 0.5;
    let maxArea = pow(min(width, height) * 0.38, 2) * 1.2;

    // iterations = frames over which the container is filled (100..200)
    let iterations = floor(map(constrain(area, minArea, maxArea), minArea, maxArea, 110, 190));
    // droplets per iteration (5..15) deterministic by seed
    let perIteration = 5 + (seed % 11); // 5..15

    // Attach computed geometry and inking state
    let wobj = words[words.length - 1];
    wobj.polyRel = polyRel; // local polygon relative coords
    wobj.iterTotal = iterations;
    wobj.iterDone = 0;
    wobj.perIteration = perIteration;
    wobj.dropletsDeposited = 0; // total droplets for blending progress tracking

    // Precompute a small jitter table and droplet angles to avoid calling noise() many times per frame
    let preCount = 18;
    let jarr = [];
    for (let p = 0; p < preCount; p++) {
      jarr.push({
        jx: map(noise(seed * 0.001 + p, i * 0.01), 0, 1, -side * 0.18, side * 0.18),
        jy: map(noise(seed * 0.0012 + p, i * 0.012), 0, 1, -side * 0.18, side * 0.18),
        ang: map(noise(seed * 0.003 + p), 0, 1, 0, TWO_PI)
      });
    }
    wobj.jitter = jarr;
  }

  if (words.length) {
    currentIndex = 0;
    target.x = words[0].x;
    target.y = words[0].y;
    state = 'MOVING';
  }
}

function moveNozzle() {
  // smooth, eased movement
  let dx = target.x - nozzle.x;
  let dy = target.y - nozzle.y;
  let d = sqrt(dx*dx + dy*dy);
  if (d < 0.6) {
    nozzle.x = target.x;
    nozzle.y = target.y;
    paintingTimer = 0;
    state = 'PAINTING';
    return;
  }
  // easing that slows near the target
  let t = constrain(map(d, 0, width, 0, 1), 0, 1);
  let ease = pow(1 - t, 2);
  nozzle.x += dx * CONFIG.moveSpeed * ease + random(-0.4, 0.4);
  nozzle.y += dy * CONFIG.moveSpeed * ease + random(-0.4, 0.4);
}

function paintWord() {
  let w = words[currentIndex];

  // On first frame: ensure nozzle gently centers and boundary is visible
  if (paintingTimer === 0) {
    nozzle.x = lerp(nozzle.x, w.x + map(noise(w.seed * 0.01), 0, 1, -8, 8), 0.6);
    nozzle.y = lerp(nozzle.y, w.y + map(noise(w.seed * 0.02), 0, 1, -8, 8), 0.6);
  }

  // Draw faint geometric boundary (trapezoid/elongated rectangle) on uiLayer
  uiLayer.push();
  uiLayer.noFill();
  uiLayer.stroke(45, 60);
  uiLayer.strokeWeight(1);
  uiLayer.push();
  uiLayer.translate(w.x, w.y);
  uiLayer.rotate(radians(w.orientation));
  uiLayer.beginShape();
  for (let p of w.polyRel) uiLayer.vertex(p.x, p.y);
  uiLayer.endShape(CLOSE);
  uiLayer.pop();

  // Movement guide from nozzle to the container center
  uiLayer.stroke(45, 24);
  uiLayer.strokeWeight(1);
  drawDashedLine(uiLayer, nozzle.x, nozzle.y, w.x, w.y);
  uiLayer.pop();

  // Micro-droplets per iteration: deterministic per word with gentle noise
  let perFrame = w.perIteration;
  perFrame = floor(perFrame * (1 + (noise(w.seed * 0.001 + w.iterDone * 0.01) - 0.5) * 0.16));
  perFrame = constrain(perFrame, 3, 16);
  if (CONFIG.fastMode) perFrame = max(2, floor(perFrame * 0.6));

  artLayer.push();
  artLayer.blendMode(MULTIPLY);

  for (let i = 0; i < perFrame; i++) {
    // sample point within polygon using deterministic noise-guided sampling
    let local = randomPointInPolygonLocal(w.polyRel, w.seed + w.iterDone * 7 + i);
    if (!local) continue;
    let a = radians(w.orientation);
    let px = w.x + (local.x * cos(a) - local.y * sin(a));
    let py = w.y + (local.x * sin(a) + local.y * cos(a));

    // nudge nozzle toward deposition
    nozzle.x = lerp(nozzle.x, px + random(-1.5, 1.5), 0.42);
    nozzle.y = lerp(nozzle.y, py + random(-1.5, 1.5), 0.42);

    // micro-splash size and alpha
    let baseSize = w.baseSize * 0.035;
    let sz = random(baseSize * 0.45, baseSize * 1.15);
    let progress = constrain(w.iterDone / max(1, w.iterTotal), 0, 1);
    let alpha = lerp(0.02, 0.05, pow(progress, 1.3));

    let splashCol = usePaletteColor(w, alpha);

    if (typeof brush !== 'undefined') {
      brush.noStroke();
      brush.fill(splashCol);
      if (typeof brush.splat === 'function') {
        brush.splat(px, py, sz * random(0.6, 1.15));
      } else {
        brush.flowShape(px - w.x, py - w.y, sz * 0.9, 0.45);
      }
    } else {
      let c = artLayer.color(splashCol);
      artLayer.noStroke();
      if (c.setAlpha) c.setAlpha(alpha * 255);
      artLayer.fill(c);
      artLayer.ellipse(px, py, sz, sz * random(0.7, 1.15));
    }

    w.dropletsDeposited++;
  }

  // diffusion / bleed call (gradual as progress increases)
  if (typeof brush !== 'undefined' && typeof brush.bleed === 'function' && (w.iterDone % max(6, floor(12 * (1 - progress))) === 0)) {
    brush.bleed(CONFIG.bleedIntensity * (0.6 + progress * 0.9), 'outwards', 0.55);
  }

  artLayer.blendMode(BLEND);
  artLayer.pop();

  // If a brush implementation is available, snapshot any brush drawing into the persistent art layer periodically
  if (window.hasBrush && (w.iterDone % 6 === 0)) {
    artLayer.push();
    artLayer.image(get(), 0, 0);
    artLayer.pop();
  }

  // internal flow guides
  drawFlowGuidesUI(w, w.iterDone, max(w.width, w.height));

  // advance iteration
  w.iterDone += 1;
  paintingTimer += (CONFIG.fastMode ? 1 : 1);

  // dark edge as we near completion
  if (w.iterDone >= w.iterTotal * 0.75) {
    let rimStrength = map(constrain(w.iterDone, w.iterTotal * 0.75, w.iterTotal), w.iterTotal * 0.75, w.iterTotal, 0, 0.6);
    artLayer.push();
    artLayer.blendMode(MULTIPLY);
    let rimCol = artLayer.color(w.color);
    rimCol = lerpColor(rimCol, artLayer.color('#000000'), 0.12);
    rimCol.setAlpha(min(255, 200 * rimStrength));
    artLayer.fill(rimCol);
    artLayer.push();
    artLayer.translate(w.x, w.y);
    artLayer.rotate(radians(w.orientation));
    artLayer.beginShape();
    for (let p of w.polyRel) artLayer.vertex(p.x * (1 + 0.03 * rimStrength), p.y * (1 + 0.03 * rimStrength));
    artLayer.endShape(CLOSE);
    artLayer.pop();
    artLayer.blendMode(BLEND);
    artLayer.pop();
  }

  // finish when iterations complete
  if (w.iterDone >= w.iterTotal) {
    // final outline
    artLayer.push();
    artLayer.noFill();
    artLayer.stroke(0, 30);
    artLayer.strokeWeight(0.9);
    artLayer.push();
    artLayer.translate(w.x, w.y);
    artLayer.rotate(radians(w.orientation));
    artLayer.beginShape();
    for (let p of w.polyRel) artLayer.vertex(p.x, p.y);
    artLayer.endShape(CLOSE);
    artLayer.pop();
    artLayer.pop();

    paintingTimer = 0;
    currentIndex++;
    if (currentIndex < words.length) {
      state = 'MOVING';
      target.x = words[currentIndex].x;
      target.y = words[currentIndex].y;
    } else {
      state = 'DONE';
    }
  }
}

// Deprecated: large-puddle routine is removed to enforce true container filling.
function drawPuddleRect(w, grow, t) {
  // intentionally empty; container filling is performed by micro-droplet INK state.
  return;
}

function drawUI() {
  // Minimal, clean UI — small coords + nozzle indicator; no huge logs
  uiLayer.push();
  uiLayer.noStroke();
  uiLayer.fill(20, 120);
  uiLayer.textSize(11);
  uiLayer.textAlign(LEFT, TOP);
  uiLayer.textFont('Helvetica');
  // Minimal UI — no coordinate dump or state text, as requested

  // Nozzle marker
  uiLayer.stroke(30, 160);
  uiLayer.strokeWeight(1.2);
  uiLayer.noFill();
  uiLayer.circle(nozzle.x, nozzle.y, 12);

  // Soft line to current target when moving
  if (state === 'MOVING') {
    uiLayer.stroke(30, 60);
    uiLayer.strokeWeight(1);
    drawDashedLine(uiLayer, nozzle.x, nozzle.y, target.x, target.y);
  }

  uiLayer.pop();
}

function drawDashedLine(pg, x1, y1, x2, y2) {
  pg.push();
  let d = dist(x1, y1, x2, y2);
  let dash = 8;
  for (let i = 0; i < d; i += dash*1.5) {
    let a = i / d;
    let b = (i + dash) / d;
    let sx = lerp(x1, x2, a);
    let sy = lerp(y1, y2, a);
    let ex = lerp(x1, x2, b);
    let ey = lerp(y1, y2, b);
    pg.line(sx, sy, ex, ey);
  }
  pg.pop();
}

// Draw faint curved flow guides (UI only) to show direction of watercolor spreading
function drawFlowGuidesUI(w, t, size) {
  uiLayer.push();
  uiLayer.translate(w.x, w.y);
  uiLayer.rotate(radians(w.orientation));
  uiLayer.noFill();

  for (let i = 0; i < 6; i++) {
    let a0 = map(i, 0, 6, -PI, PI) + noise(w.seed * 0.001 + i, t * 0.03) * 1.2;
    let len = size * 0.4 + noise(w.seed * 0.002 + i) * size * 0.8;
    uiLayer.strokeWeight(1);
    uiLayer.stroke(30, map(noise(w.seed * 0.004 + i, t * 0.02), 0, 1, 12, 36));
    uiLayer.beginShape();
    for (let s = 0; s <= 1; s += 0.12) {
      let ang = lerp(a0, a0 + 0.6, s) + noise(w.seed * 0.01 + s*10, t * 0.02) * 0.8;
      let r = s * len * (0.6 + noise(w.seed * 0.005 + s * 7, t * 0.01));
      let px = cos(ang) * r;
      let py = sin(ang) * r * (0.6 + noise(w.seed * 0.006 + s * 3, t * 0.02));
      uiLayer.curveVertex(px, py);
    }
    uiLayer.endShape();
  }

  uiLayer.pop();
}

// --- Helpers for geometric container filling & micro-splashes ---
// Try to sample a random point inside a local polygon (relative coordinates). Uses Perlin-noise seeded sampling for stable randomness.
function randomPointInPolygonLocal(polyRel, seed) {
  // bounding box
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let p of polyRel) {
    minx = min(minx, p.x); maxx = max(maxx, p.x);
    miny = min(miny, p.y); maxy = max(maxy, p.y);
  }
  // attempt a few times, using noise to guide samples (more deterministic than pure Math.random)
  for (let attempt = 0; attempt < 48; attempt++) {
    // use noise for coordinates so runs are consistent per seed
    let sx = noise(seed * 0.001 + attempt * 0.02);
    let sy = noise(seed * 0.0017 + attempt * 0.031);
    let x = lerp(minx, maxx, sx);
    let y = lerp(miny, maxy, sy);
    if (pointInPolygon({x, y}, polyRel)) return {x, y};
  }
  // fallback: centroid
  let cx = 0, cy = 0;
  for (let p of polyRel) { cx += p.x; cy += p.y; }
  return { x: cx / polyRel.length, y: cy / polyRel.length };
}

// point-in-polygon (ray casting)
function pointInPolygon(pt, poly) {
  let x = pt.x, y = pt.y;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let xi = poly[i].x, yi = poly[i].y;
    let xj = poly[j].x, yj = poly[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Prefer p5.palette when available; else use existing HSLA color and replace alpha, or pick from CONFIG.palette
function usePaletteColor(w, alpha) {
  alpha = constrain(alpha, 0.0, 1.0);
  // Prefer a palette library if available and deterministic
  try {
    if (typeof palette !== 'undefined' && palette) {
      if (typeof palette.pick === 'function') {
        let cstr = palette.pick(w.seed);
        if (cstr) {
          let c = color(cstr);
          c.setAlpha(alpha * 255);
          return c;
        }
      }
      if (typeof palette.random === 'function') {
        let cstr = palette.random();
        let c = color(cstr);
        c.setAlpha(alpha * 255);
        return c;
      }
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: if stored color is hsla, replace alpha and return string; otherwise pick deterministic from CONFIG
  if (typeof w.color === 'string' && w.color.startsWith('hsla')) {
    return w.color.replace(/,\s*([0-9\.]+)\s*\)\s*$/, `, ${alpha})`);
  }

  let base = CONFIG.palette[w.seed % CONFIG.palette.length];
  let c = color(base);
  c.setAlpha(alpha * 255);
  return c;
}

// Extract numeric alpha from hsla string (0..1), fallback small value
function parseAlphaFromHSLA(s) {
  if (!s || typeof s !== 'string') return 0.06;
  let m = s.match(/hsla\([^,]+,[^)]+,\s*([0-9\.]+)\s*\)/);
  if (m && m[1]) return parseFloat(m[1]);
  return 0.06;
}

function exportPNG() {
  // Compose paper + art into a temporary graphics and download PNG
  let tmp = createGraphics(width, height);
  tmp.pixelDensity(1);
  tmp.clear();
  tmp.image(paperLayer, 0, 0);
  tmp.image(artLayer, 0, 0);
  tmp.loadPixels();
  let dataURL = tmp.canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `aether_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

window.exportPNG = exportPNG;

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  paperLayer = createGraphics(windowWidth, windowHeight);
  artLayer = createGraphics(windowWidth, windowHeight);
  uiLayer = createGraphics(windowWidth, windowHeight);
  drawPaperTexture();
}

// small easing helper
function easeInOutQuad(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }
