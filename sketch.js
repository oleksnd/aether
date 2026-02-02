// AETHER Sketch: Pure Geometry Grid and Path Visualization
// Step 1: Clean slate with mathematical grid and letter navigation

let gridCols, gridRows, gridMargin;
let cellWidth, cellHeight;
let gridOffsetX, gridOffsetY;
let currentPaths = [];
let highlightedCells = new Set();

// Runtime mapping: randomized placement of letters (DNA remains immutable)
let RUNTIME_ALPHABET_MAP = null;

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initShuffledAlphabet() {
  const letters = Object.keys(ALPHABET_DNA);
  // all available zone indices (grid size may be larger than number of letters)
  const totalZones = gridCols * gridRows;
  const zones = Array.from({ length: totalZones }, (_, i) => i);
  shuffleArray(zones);
  shuffleArray(letters);
  RUNTIME_ALPHABET_MAP = {};
  for (let i = 0; i < letters.length; i++) {
    RUNTIME_ALPHABET_MAP[letters[i]] = zones[i];
  }
}

function getZoneIndexForLetter(letter) {
  if (RUNTIME_ALPHABET_MAP && RUNTIME_ALPHABET_MAP.hasOwnProperty(letter)) return RUNTIME_ALPHABET_MAP[letter];
  if (ALPHABET_DNA[letter] && typeof ALPHABET_DNA[letter].zoneIndex === 'number') return ALPHABET_DNA[letter].zoneIndex;
  return null;
}

let wordColors = [
  [100, 100, 100], // 1st word: neutral gray
  [100, 150, 255], // 2nd: light blue
  [255, 100, 100], // 3rd: light red
  [100, 255, 100], // 4th: light green
  [255, 200, 100], // 5th: light orange
  [200, 100, 255], // 6th: light purple
  [100, 255, 200], // 7th: light cyan
  [255, 150, 150], // 8th: light pink
];

let nozzle = { x: 0, y: 0, targetX: 0, targetY: 0, isMoving: false, speed: 0.2, pauseUntil: 0 }; // Increased speed
let currentWordIndex = 0;
let currentPointIndex = 0;

// Turbo steps per frame to accelerate ink rendering (5-10 recommended)
const TURBO_STEPS = 8;

// Fluid drawing moved to `diffusion.js`. Use `Fluid.pickColor()` and `Fluid.executeInking()` for ink behavior.

let visitedPoints = []; // Track visited points for current word

let artLayer; // Isolated art layer for watercolor

// Dynamically load gl-matrix then p5.brush so runtime errors (like missing mat4) are avoidable
function loadBrushes(layer) {
  if (window.p5BrushLoaded || window.Brush || window.p5Brush || window.P5Brush) return Promise.resolve();

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        try { console.log('[LoadScript] Loaded', src); } catch (e) { }
        resolve(true);
      };
      s.onerror = () => {
        try { console.warn('[LoadScript] Failed to load', src); } catch (e) { }
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  return loadScript('https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js')
    .then(() => loadScript('https://cdn.jsdelivr.net/npm/p5.brush@latest/dist/p5.brush.min.js'))
    .then(() => {
      try {
        if (window.p5Brush && typeof window.p5Brush.init === 'function') window.p5Brush.init(layer);
        if (window.Brush && typeof window.Brush.init === 'function') window.Brush.init(layer);
      } catch (e) { /* ignore */ }
      window.p5BrushLoaded = true;
    });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Remove noLoop() to enable animation

  // Create isolated art layer
  artLayer = createGraphics(width, height);
  // Do NOT expose artLayer globally to engines. Initialize modules/engines explicitly so each stays isolated.
  if (typeof Fluid !== 'undefined' && Fluid.init) Fluid.init(artLayer);

  // Initialize available engines with their own internal buffers (full isolation)
  try {
    if (window.AetherSoftEngine && typeof window.AetherSoftEngine.init === 'function') window.AetherSoftEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.AetherSoftModernEngine && typeof window.AetherSoftModernEngine.init === 'function') window.AetherSoftModernEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.LiquidInkEngine && typeof window.LiquidInkEngine.init === 'function') window.LiquidInkEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.OilBrushEngine && typeof window.OilBrushEngine.init === 'function') window.OilBrushEngine.init({ width: artLayer.width, height: artLayer.height });
    // WetWatercolorEngine removed (replaced by TornWetBrushEngine)
    if (window.SplatterEngine && typeof window.SplatterEngine.init === 'function') window.SplatterEngine.init({ width: artLayer.width, height: artLayer.height });
      if (window.FractalTreeEngine && typeof window.FractalTreeEngine.init === 'function') window.FractalTreeEngine.init({ width: artLayer.width, height: artLayer.height });
      if (window.TornWetBrushEngine && typeof window.TornWetBrushEngine.init === 'function') window.TornWetBrushEngine.init({ width: artLayer.width, height: artLayer.height });
  } catch (e) { /* ignore */ }

  // Wire up style selector: keep a small runtime state and listen for changes
  try {
    const styleSel = document.getElementById('styleSelector');
    if (styleSel) {
      // default to aether-soft
      styleSel.value = styleSel.value || 'aether-soft';
      window.currentFluidStyle = styleSel.value;

      // brush thickness slider elements (global)
      const brushWrap = document.getElementById('brush-thickness-wrap');
      const brushSlider = document.getElementById('brush-thickness');
      const brushVal = document.getElementById('brush-thickness-value');

      // set default global factor
      window.BRUSH_THICKNESS = 1;

      function updateBrushSliderBackground() {
        try {
          if (!brushSlider) return;
          let min = parseFloat(brushSlider.min) || 0.1;
          let max = parseFloat(brushSlider.max) || 1.5;
          let v = parseFloat(brushSlider.value) || 1;
          let pct = Math.max(0, Math.min(100, Math.round(((v - min) / (max - min)) * 100)));
          // colors change in dark mode
          let left = '#111';
          let right = '#efefef';
          if (document.body && document.body.classList && document.body.classList.contains('dark-mode')) {
            left = '#eee'; right = '#333';
          }
          brushSlider.style.background = `linear-gradient(to right, ${left} ${pct}%, ${right} ${pct}%)`;
        } catch (e) { console.warn('[UI] updateBrushSliderBackground error', e); }
      }

      if (brushSlider) {
        // reflect initial value
        try { brushVal.textContent = parseFloat(brushSlider.value).toFixed(2); } catch (e) { }
        // initial painting of background
        updateBrushSliderBackground();
        brushSlider.addEventListener('input', (ev) => {
          let v = parseFloat(ev.target.value);
          window.BRUSH_THICKNESS = isNaN(v) ? 1 : v;
          if (brushVal) brushVal.textContent = window.BRUSH_THICKNESS.toFixed(2);
          updateBrushSliderBackground();
        });

        // update background when user toggles dark mode (keep in sync)
        const darkToggle = document.getElementById('dark-toggle');
        if (darkToggle) darkToggle.addEventListener('click', updateBrushSliderBackground);
      }

      function updateBrushSliderVisibility() {
        try {
          if (!brushWrap) { console.log('[UI] brush slider: element missing'); return; }
          console.log('[UI] brush slider visibility check ->', window.currentFluidStyle);
          // hide for engines that shouldn't be adjusted by thickness control
          if (window.currentFluidStyle && (window.currentFluidStyle === 'aether-soft' || window.currentFluidStyle === 'aether-soft-modern')) {
            brushWrap.style.display = 'none';
            brushWrap.style.pointerEvents = 'none';
          } else {
            brushWrap.style.display = 'inline-flex';
            brushWrap.style.opacity = '1';
            brushWrap.style.pointerEvents = 'auto';
          }
        } catch (e) { console.warn('[UI] updateBrushSliderVisibility error', e); }
      }

      // ensure visibility matches current style and update on change
      updateBrushSliderVisibility();

      styleSel.addEventListener('change', (e) => {
        window.currentFluidStyle = e.target.value;
        try { console.log('[UI] fluid style changed ->', window.currentFluidStyle); } catch (e) { }
        updateBrushSliderVisibility();
      });

      // additional hooks to ensure visibility toggles in edge cases
      styleSel.addEventListener('input', () => updateBrushSliderVisibility());
      styleSel.addEventListener('click', () => updateBrushSliderVisibility());

      // additional hooks to ensure visibility toggles in edge cases
      styleSel.addEventListener('input', () => updateBrushSliderVisibility());
      styleSel.addEventListener('click', () => updateBrushSliderVisibility());
    }
  } catch (e) { /* ignore in non-browser contexts */ }

  // Load brush libraries (gl-matrix, p5.brush) asynchronously and init against artLayer
  loadBrushes(artLayer).catch(() => { /* non-fatal: fallback rendering will be used */ });

  // Set font
  textFont('Courier');

  // Load grid config
  gridCols = GRID_CONFIG.COLS;
  gridRows = GRID_CONFIG.ROWS;
  gridMargin = GRID_CONFIG.MARGIN;

  // Initialize alphabet mapping: default A-Z enabled (sequential). If user prefers randomized, init shuffled map.
  try {
    window.sequentialAlphabet = (typeof window.sequentialAlphabet === 'undefined') ? true : window.sequentialAlphabet;
    if (window.sequentialAlphabet) {
      // Use DNA mapping directly (A-Z)
      RUNTIME_ALPHABET_MAP = null;
    } else {
      // Use randomized runtime mapping
      initShuffledAlphabet();
    }
  } catch (e) { RUNTIME_ALPHABET_MAP = null; }

  // Calculate cell dimensions
  cellWidth = width / gridCols;
  cellHeight = height / gridRows;

  // Calculate grid offset to center the grid
  gridOffsetX = (width - gridCols * cellWidth) / 2;
  gridOffsetY = (height - gridRows * cellHeight) / 2;

  // Initialize nozzle at center
  nozzle.x = width / 2;
  nozzle.y = height / 2;
  nozzle.targetX = width / 2;
  nozzle.targetY = height / 2;

  // Draw the static grid and letters
  drawGrid();
}

function draw() {
  // Clear canvas with background color
  background(window.darkMode ? '#141414' : 255);

  // Draw art layer first (for future watercolor)
  image(artLayer, 0, 0);

  // Update nozzle movement (process multiple steps per frame for turbo rendering)
  // Check style to adjust speed
  let isLiquidInk = (typeof window.currentFluidStyle === 'string' && window.currentFluidStyle === 'liquid-ink');
  let steps = isLiquidInk ? 2 : TURBO_STEPS; // Slow down for liquid ink to show the flow
  for (let t = 0; t < steps; t++) updateNozzle();

  // Overlays: grid, letters, trails and highlights — toggled via window.showOverlays
  let overlays = (typeof window.showOverlays === 'undefined') ? true : window.showOverlays;
  if (overlays) {
    // Redraw grid and letters
    drawGrid();

    // Draw completed words
    drawCompletedWords();

    // Draw current trail
    drawCurrentTrail();

    // Highlight cells
    highlightCells();
  }

  // Draw nozzle (always visible)
  drawNozzle();
}

function drawGrid() {
  stroke(window.darkMode ? 40 : 240); // Darker lines for dark mode, lighter for light mode
  strokeWeight(1);
  noFill();

  // Draw vertical lines
  for (let i = 0; i <= gridCols; i++) {
    let x = gridOffsetX + i * cellWidth;
    line(x, gridOffsetY, x, gridOffsetY + gridRows * cellHeight);
  }

  // Draw horizontal lines
  for (let j = 0; j <= gridRows; j++) {
    let y = gridOffsetY + j * cellHeight;
    line(gridOffsetX, y, gridOffsetX + gridCols * cellWidth, y);
  }

  // Draw letters in centers (letters are randomized via runtime map)
  textAlign(CENTER, CENTER);
  textSize(16);
  fill(window.darkMode ? 100 : 150); // Muted colors for dark/light modes
  noStroke();

  // Build inverse mapping: zone -> letter
  let inverse = {};
  if (RUNTIME_ALPHABET_MAP) {
    for (let l in RUNTIME_ALPHABET_MAP) inverse[RUNTIME_ALPHABET_MAP[l]] = l;
  } else {
    for (let l in ALPHABET_DNA) inverse[ALPHABET_DNA[l].zoneIndex] = l;
  }

  const totalZones = gridCols * gridRows;
  for (let z = 0; z < totalZones; z++) {
    const letter = inverse[z];
    if (!letter) continue; // leave empty cells blank
    let col = z % gridCols;
    let row = Math.floor(z / gridCols);
    let x = gridOffsetX + col * cellWidth + cellWidth / 2;
    let y = gridOffsetY + row * cellHeight + cellHeight / 2;
    text(letter, x, y);
  }
}

function parseInput(text) {
  // Remove punctuation (keep letters, spaces, numbers if any, but since A-Z, ok)
  let clean = text.replace(/[^\w\s]/g, '');
  // Split by spaces, filter out empty words
  let words = clean.split(/\s+/).filter(word => word.length > 0);
  // Convert each word to uppercase array of letters
  return words.map(word => word.toUpperCase().split(''));
}

function startGeneration(text) {
  // Refresh the palette (choose random if none selected)
  if (typeof Fluid !== 'undefined' && Fluid.refreshPalette) Fluid.refreshPalette();

  // Parse the input into words
  let wordArrays = parseInput(text);

  // Clear current paths and highlights
  currentPaths = [];
  highlightedCells.clear();

  // Clear the art layer
  try { if (artLayer && typeof artLayer.clear === 'function') artLayer.clear(); } catch (e) { /* ignore */ }

  // RESET ALL ENGINES: Force clear their internal buffers for the new generation
  const engines = ['AetherSoftEngine', 'AetherSoftModernEngine', 'LiquidInkEngine', 'OilBrushEngine', 'SplatterEngine', 'FractalTreeEngine', 'TornWetBrushEngine'];
  engines.forEach(name => {
    try {
      if (window[name] && typeof window[name].init === 'function') {
        window[name].init({ width: artLayer.width, height: artLayer.height, forceClear: true });
      }
    } catch (e) { }
  });
  // Defensive: ensure artLayer composite mode is normal when starting a generation
  try { if (artLayer && artLayer.drawingContext) artLayer.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) { /* ignore */ }

  let colorIndex = 0;
  // Track fluid colors used for this generation so we can avoid duplicates when requested
  let usedFluidColors = [];
  for (let word of wordArrays) {
    let path = [];
    for (let letter of word) {
      // Use runtime mapping if available, otherwise fall back to DNA
      let index = getZoneIndexForLetter(letter);
      if (index !== null) {
        let col = index % gridCols;
        let row = Math.floor(index / gridCols);

        // Calculate cell bounds
        let cellLeft = gridOffsetX + col * cellWidth;
        let cellTop = gridOffsetY + row * cellHeight;
        let marginPx = GRID_CONFIG.MARGIN * cellWidth; // Use cellWidth for margin, assuming square-ish

        // Safe area within cell
        let minX = cellLeft + marginPx;
        let maxX = cellLeft + cellWidth - marginPx;
        let minY = cellTop + marginPx;
        let maxY = cellTop + cellHeight - marginPx;

        // Random point within safe area
        let x = random(minX, maxX);
        let y = random(minY, maxY);

        path.push({ x, y, letter });
        highlightedCells.add(index);
      }
    }
    if (path.length > 0) {
      // pick a fluid color for this word from the Fluid module (safe fallback)
      let fluidCol = null;
      try {
        if (typeof Fluid !== 'undefined' && typeof Fluid.pickColorDistinct === 'function') {
          // Use distinct color selection when available (applies to Aether Soft and Modern)
          fluidCol = Fluid.pickColorDistinct(usedFluidColors);
          // record used color as a simple array copy
          if (Array.isArray(fluidCol)) usedFluidColors.push(fluidCol.slice());
        }
      } catch (e) { fluidCol = null; }

      if (!fluidCol) fluidCol = (typeof Fluid !== 'undefined' && Fluid.pickColor) ? Fluid.pickColor() : [255, 50, 50];

      currentPaths.push({ points: path, color: wordColors[colorIndex % wordColors.length], fluidColor: fluidCol });
      colorIndex++;
    }
  }

  // Expose visibility toggles for UI: default all visible and render checkboxes
  const wordStrings = wordArrays.map(arr => arr.join(''));
  // Expose wordStrings globally so export can name per-word files
  window.wordStrings = wordStrings;
  window.wordVisibility = wordStrings.map(() => true);
  try { if (typeof window.renderWordToggles === 'function') { console.log('[Sketch] calling renderWordToggles'); window.renderWordToggles(wordStrings); } } catch (e) { console.warn('[Sketch] renderWordToggles failed', e); }

  // Create per-word offscreen layers so we can show/hide paints independently
  try {
    // Clear any existing layers first
    if (window.wordLayers && Array.isArray(window.wordLayers)) {
      window.wordLayers.forEach(l => { try { if (typeof l.clear === 'function') l.clear(); } catch (e) {} });
    }
    window.wordLayers = wordStrings.map(() => {
      const w = (artLayer && artLayer.width) ? artLayer.width : width;
      const h = (artLayer && artLayer.height) ? artLayer.height : height;
      const g = createGraphics(w, h);
      try { if (typeof g.clear === 'function') g.clear(); } catch (e) { /* ignore */ }
      return g;
    });
  } catch (e) {
    window.wordLayers = [];
  }

  // Helper: recompose visible per-word layers onto the shared artLayer
  window.recomposeArtLayer = function () {
    try {
      if (!artLayer) return;
      if (typeof artLayer.clear === 'function') artLayer.clear(); else { artLayer.push(); artLayer.noStroke(); artLayer.background(0, 0); artLayer.pop(); }
      // ensure normal composite
      try { if (artLayer && artLayer.drawingContext) artLayer.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) { /* ignore */ }
      if (!window.wordLayers) return;
      for (let i = 0; i < window.wordLayers.length; i++) {
        if (window.wordVisibility && window.wordVisibility[i] === false) continue;
        try { artLayer.image(window.wordLayers[i], 0, 0); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  };

  // Start animation
  currentWordIndex = 0;
  currentPointIndex = 0;
  visitedPoints = [];
  setTargetToCurrent();
}

function setTargetToCurrent() {
  if (currentWordIndex < currentPaths.length) {
    let word = currentPaths[currentWordIndex];
    if (currentPointIndex < word.points.length) {
      let point = word.points[currentPointIndex];
      nozzle.targetX = point.x;
      nozzle.targetY = point.y;
      nozzle.isMoving = true;
    } else {
      // Next word
      currentWordIndex++;
      currentPointIndex = 0;
      visitedPoints = []; // Reset for new word
      setTargetToCurrent();
    }
  } else {
    nozzle.isMoving = false;
  }
}

function updateNozzle() {
  if (nozzle.isMoving) {
    nozzle.x = lerp(nozzle.x, nozzle.targetX, nozzle.speed);
    nozzle.y = lerp(nozzle.y, nozzle.targetY, nozzle.speed);
    if (dist(nozzle.x, nozzle.y, nozzle.targetX, nozzle.targetY) < 1) {
      nozzle.x = nozzle.targetX;
      nozzle.y = nozzle.targetY;
      nozzle.isMoving = false;
      // Add to visited
      let currentPoint = currentPaths[currentWordIndex].points[currentPointIndex];
      visitedPoints.push({ x: nozzle.x, y: nozzle.y, letter: currentPoint.letter });
      // Execute inking into per-word layer only if this word is visible. We still keep per-word buffers so we can recompose/hide later.
      if (window.wordVisibility && window.wordVisibility[currentWordIndex] === false) {
        // skip inking for hidden word (do not add new paint)
      } else if (typeof Fluid !== 'undefined' && Fluid.executeInking) {
        try {
          console.log('[Sketch] Fluid.executeInking -> wordIndex=', currentWordIndex, 'pointIndex=', currentPointIndex, 'color=', currentPaths[currentWordIndex].fluidColor);
        } catch (e) { /* ignore logging errors */ }
        try {
          const target = (window.wordLayers && window.wordLayers[currentWordIndex]) ? window.wordLayers[currentWordIndex] : undefined;
          Fluid.executeInking(currentPoint.letter, nozzle.x, nozzle.y, currentPaths[currentWordIndex].fluidColor, target);
          // Immediately update main art layer to reflect visibility changes
          try { if (typeof window.recomposeArtLayer === 'function') window.recomposeArtLayer(); } catch (e) { /* ignore */ }
        } catch (e) { /* ignore */ }
      }
      nozzle.pauseUntil = millis() + 100; // Short pause 0.1s
    }
  } else if (millis() > nozzle.pauseUntil && currentWordIndex < currentPaths.length) {
    currentPointIndex++;
    setTargetToCurrent();
  }
}

function drawCompletedWords() {
  let globalIndex = 0;
  for (let i = 0; i < currentWordIndex; i++) {
    if (window.wordVisibility && window.wordVisibility[i] === false) {
      globalIndex += currentPaths[i].points.length;
      continue;
    }
    drawPathForWord(currentPaths[i], globalIndex);
    globalIndex += currentPaths[i].points.length;
  }
}

function drawCurrentTrail() {
  if (currentWordIndex < currentPaths.length) {
    // If current word is hidden, don't draw its trail
    if (window.wordVisibility && window.wordVisibility[currentWordIndex] === false) return;

    let word = currentPaths[currentWordIndex];
    let color = word.color;
    stroke(color);
    strokeWeight(1);
    noFill();

    // Draw dashed lines between visited points
    for (let i = 0; i < visitedPoints.length - 1; i++) {
      drawDashedLine(visitedPoints[i].x, visitedPoints[i].y, visitedPoints[i + 1].x, visitedPoints[i + 1].y);
    }

    // Draw dashed line from last visited to nozzle
    if (visitedPoints.length > 0) {
      let lastVisited = visitedPoints[visitedPoints.length - 1];
      drawDashedLine(lastVisited.x, lastVisited.y, nozzle.x, nozzle.y);
    }

    // Draw arrows between visited points
    for (let i = 0; i < visitedPoints.length - 1; i++) {
      drawArrowBetween(visitedPoints[i], visitedPoints[i + 1], color);
    }

    // Draw arrow from last visited to nozzle
    if (visitedPoints.length > 0) {
      drawArrowBetween(visitedPoints[visitedPoints.length - 1], { x: nozzle.x, y: nozzle.y }, color);
    }

    // Draw markers for visited points
    for (let point of visitedPoints) {
      drawMarkerAt(point, color, visitedPoints.indexOf(point) === 0 ? 'start' : 'end');
    }

    // Draw numbers for visited points
    let globalIndex = 0;
    for (let i = 0; i < currentWordIndex; i++) globalIndex += currentPaths[i].points.length;
    for (let i = 0; i < visitedPoints.length; i++) {
      drawNumberAt(visitedPoints[i], color, globalIndex + i + 1);
    }
  }
}

function drawArrowBetween(p1, p2, color) {
  stroke(color);
  strokeWeight(1);
  fill(color);

  let midX = (p1.x + p2.x) / 2;
  let midY = (p1.y + p2.y) / 2;
  let angle = atan2(p2.y - p1.y, p2.x - p1.x);

  let arrowLength = 15;
  let arrowWidth = 5;

  push();
  translate(midX, midY);
  rotate(angle);
  triangle(0, 0, -arrowLength, -arrowWidth / 2, -arrowLength, arrowWidth / 2);
  pop();
}

function drawMarkerAt(point, color, type) {
  if (type === 'start') {
    fill(color);
    noStroke();
    ellipse(point.x, point.y, 12, 12);
  } else if (type === 'end') {
    stroke(color);
    strokeWeight(2);
    line(point.x - 6, point.y - 6, point.x + 6, point.y + 6);
    line(point.x + 6, point.y - 6, point.x - 6, point.y + 6);
  }
}

function drawNumberAt(point, color, num) {
  noStroke();
  fill(color);
  textAlign(CENTER, CENTER);
  textSize(10);
  text(num, point.x + 12, point.y - 12);
}

function drawNozzle() {
  fill(0);
  noStroke();
  ellipse(nozzle.x, nozzle.y, 5, 5);
}

function drawPaths() {
  let globalIndex = 0;
  for (let pathObj of currentPaths) {
    drawPathForWord(pathObj, globalIndex);
    globalIndex += pathObj.points.length;
  }
}

function drawPathForWord(pathObj, startIndex) {
  let points = pathObj.points;
  let color = pathObj.color;

  if (points.length < 2) return;

  stroke(color);
  strokeWeight(1);
  noFill();

  // Draw dashed path
  drawDashedPath(points);

  // Draw arrows
  drawArrowsForPath(points, color);

  // Draw markers
  drawMarkersForPath(points, color);

  // Draw numbers
  drawNumbersForPath(points, color, startIndex);
}

function drawDashedPath(points, dashLen = 5, gapLen = 5) {
  for (let i = 0; i < points.length - 1; i++) {
    drawDashedLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, dashLen, gapLen);
  }
}

function drawDashedLine(x1, y1, x2, y2, dashLen = 5, gapLen = 5) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  let dist = sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  let stepLen = dashLen + gapLen;
  let steps = dist / stepLen;
  let unitX = dx / dist;
  let unitY = dy / dist;

  for (let i = 0; i < steps; i++) {
    let startX = x1 + i * stepLen * unitX;
    let startY = y1 + i * stepLen * unitY;
    let endX = startX + dashLen * unitX;
    let endY = startY + dashLen * unitY;

    // Clamp to end
    if ((unitX > 0 && endX > x2) || (unitX < 0 && endX < x2)) {
      endX = x2;
      endY = y2;
    }
    if ((unitY > 0 && endY > y2) || (unitY < 0 && endY < y2)) {
      endX = x2;
      endY = y2;
    }

    line(startX, startY, endX, endY);
  }
}

function drawArrowsForPath(points, color) {
  stroke(color);
  strokeWeight(1);
  fill(color);

  for (let i = 0; i < points.length - 1; i++) {
    let start = points[i];
    let end = points[i + 1];

    // Midpoint
    let midX = (start.x + end.x) / 2;
    let midY = (start.y + end.y) / 2;

    // Direction vector
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let angle = atan2(dy, dx);

    // Arrow size (thinner)
    let arrowLength = 15;
    let arrowWidth = 5;

    // Draw arrowhead as triangle
    push();
    translate(midX, midY);
    rotate(angle);
    triangle(0, 0, -arrowLength, -arrowWidth / 2, -arrowLength, arrowWidth / 2);
    pop();
  }
}

function drawMarkersForPath(points, color) {
  if (points.length === 0) return;

  // Start marker: filled circle
  let start = points[0];
  fill(color);
  noStroke();
  ellipse(start.x, start.y, 12, 12);

  // End marker: X
  if (points.length > 1) {
    let end = points[points.length - 1];
    stroke(color);
    strokeWeight(2);
    line(end.x - 6, end.y - 6, end.x + 6, end.y + 6);
    line(end.x + 6, end.y - 6, end.x - 6, end.y + 6);
  }
}

function drawNumbersForPath(points, color, startIndex) {
  noStroke();
  fill(color);
  textAlign(CENTER, CENTER);
  textSize(10);

  for (let i = 0; i < points.length; i++) {
    let point = points[i];
    // Position slightly above and to the right of the center
    text(startIndex + i + 1, point.x + 12, point.y - 12);
  }
}

function highlightCells() {
  noStroke();
  fill(220, 220, 220, 50); // Neutral light gray, barely noticeable

  for (let index of highlightedCells) {
    let col = index % gridCols;
    let row = Math.floor(index / gridCols);
    let x = gridOffsetX + col * cellWidth;
    let y = gridOffsetY + row * cellHeight;
    rect(x, y, cellWidth, cellHeight);
  }
}

// `executeInking` implementation moved to `diffusion.js` (use `Fluid.executeInking`)

// Export PNG: create single ZIP (stored — no compression) containing per-word PNGs + final composition
async function exportPNG(filename) {
  // helpers
  function ts() { return year() + nf(month(), 2) + nf(day(), 2) + '-' + nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2); }
  function sanitize(s) { if (!s) return 'layer'; return String(s).trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_\.]/g, '').replace(/-+/g, '-'); }

  // canvas -> Blob helper
  function canvasToBlob(gfx) {
    return new Promise((resolve) => {
      try {
        if (gfx && gfx.canvas && gfx.canvas.toBlob) {
          gfx.canvas.toBlob(b => resolve(b));
        } else {
          const data = gfx.canvas.toDataURL('image/png');
          const parts = data.split(',');
          const bstr = atob(parts[1]);
          let n = bstr.length; const u8 = new Uint8Array(n); while (n--) u8[n] = bstr.charCodeAt(n);
          resolve(new Blob([u8], { type: 'image/png' }));
        }
      } catch (e) {
        try { const data = gfx.canvas.toDataURL('image/png'); const parts = data.split(','); const bstr = atob(parts[1]); let n = bstr.length; const u8 = new Uint8Array(n); while (n--) u8[n] = bstr.charCodeAt(n); resolve(new Blob([u8], { type: 'image/png' })); } catch (ex) { resolve(null); }
      }
    });
  }

  // CRC32 (standard table) — returns uint32
  const CRC32_TABLE = (function () { let c; const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)); table[n] = c >>> 0; } return table; })();
  function crc32(buf) { let crc = 0 ^ (-1); for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF]; return (crc ^ (-1)) >>> 0; }

  function strToUtf8Bytes(str) { const encoder = new TextEncoder(); return encoder.encode(str); }
  function u32ToLE(n) { const arr = new Uint8Array(4); arr[0] = n & 0xFF; arr[1] = (n >>> 8) & 0xFF; arr[2] = (n >>> 16) & 0xFF; arr[3] = (n >>> 24) & 0xFF; return arr; }
  function u16ToLE(n) { const arr = new Uint8Array(2); arr[0] = n & 0xFF; arr[1] = (n >>> 8) & 0xFF; return arr; }

  // Build ZIP (stored) from entries: [{name, data:Uint8Array}]
  function buildZip(entries) {
    const parts = [];
    const centralDirs = [];
    let localOffset = 0;

    for (const e of entries) {
      const nameBytes = strToUtf8Bytes(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;

      // local file header
      const localHeader = new Uint8Array(30 + nameBytes.length);
      let p = 0;
      // signature
      localHeader.set([0x50,0x4B,0x03,0x04], p); p += 4;
      // version needed (2 bytes)
      localHeader.set(u16ToLE(20), p); p += 2;
      // general purpose bit flag
      localHeader.set(u16ToLE(0), p); p += 2;
      // compression method (0 = stored)
      localHeader.set(u16ToLE(0), p); p += 2;
      // mod time/date
      localHeader.set(u16ToLE(0), p); p += 2; localHeader.set(u16ToLE(0), p); p += 2;
      // crc32
      localHeader.set(u32ToLE(crc), p); p += 4;
      // compressed size
      localHeader.set(u32ToLE(size), p); p += 4;
      // uncompressed size
      localHeader.set(u32ToLE(size), p); p += 4;
      // filename length
      localHeader.set(u16ToLE(nameBytes.length), p); p += 2;
      // extra length
      localHeader.set(u16ToLE(0), p); p += 2;
      // filename
      localHeader.set(nameBytes, p); p += nameBytes.length;

      parts.push(localHeader);
      parts.push(e.data);

      // central directory header (to be added later)
      const cdHeader = new Uint8Array(46 + nameBytes.length);
      p = 0;
      cdHeader.set([0x50,0x4B,0x01,0x02], p); p += 4; // signature
      cdHeader.set(u16ToLE(0x0314), p); p += 2; // version made by (arbitrary)
      cdHeader.set(u16ToLE(20), p); p += 2; // version needed
      cdHeader.set(u16ToLE(0), p); p += 2; // flags
      cdHeader.set(u16ToLE(0), p); p += 2; // compression method
      cdHeader.set(u16ToLE(0), p); p += 2; cdHeader.set(u16ToLE(0), p); p += 2; // mod time/date
      cdHeader.set(u32ToLE(crc), p); p += 4;
      cdHeader.set(u32ToLE(size), p); p += 4;
      cdHeader.set(u32ToLE(size), p); p += 4;
      cdHeader.set(u16ToLE(nameBytes.length), p); p += 2; // name len
      cdHeader.set(u16ToLE(0), p); p += 2; // extra len
      cdHeader.set(u16ToLE(0), p); p += 2; // comment len
      cdHeader.set(u16ToLE(0), p); p += 2; // disk number start
      cdHeader.set(u16ToLE(0), p); p += 2; // internal attrs
      cdHeader.set(u32ToLE(0), p); p += 4; // external attrs
      cdHeader.set(u32ToLE(localOffset), p); p += 4; // relative offset
      cdHeader.set(nameBytes, p); p += nameBytes.length;

      centralDirs.push(cdHeader);

      // update local offset: header + data
      localOffset += localHeader.length + e.data.length;
    }

    const centralStart = localOffset;
    for (const cd of centralDirs) { parts.push(cd); localOffset += cd.length; }
    const centralEnd = localOffset;
    const centralSize = centralEnd - centralStart;

    // end of central dir
    const eocd = new Uint8Array(22);
    let q = 0;
    eocd.set([0x50,0x4B,0x05,0x06], q); q += 4; // signature
    eocd.set(u16ToLE(0), q); q += 2; // disk number
    eocd.set(u16ToLE(0), q); q += 2; // disk start
    eocd.set(u16ToLE(centralDirs.length), q); q += 2; // entries this disk
    eocd.set(u16ToLE(centralDirs.length), q); q += 2; // total entries
    eocd.set(u32ToLE(centralSize), q); q += 4; // central dir size
    eocd.set(u32ToLE(centralStart), q); q += 4; // central dir offset
    eocd.set(u16ToLE(0), q); q += 2; // comment length

    parts.push(eocd);

    // concat all into one Uint8Array
    let totalLen = 0; for (const ppart of parts) totalLen += ppart.length;
    const out = new Uint8Array(totalLen);
    let pos = 0; for (const ppart of parts) { out.set(ppart, pos); pos += ppart.length; }
    return new Blob([out], { type: 'application/zip' });
  }

  // Draw helpers are re-used from earlier implementation
  function drawGridTo(gfx) {
    try {
      gfx.push();
      gfx.stroke(window.darkMode ? 40 : 240);
      gfx.strokeWeight(1);
      gfx.noFill();

      // Draw vertical lines
      for (let i = 0; i <= gridCols; i++) {
        let x = gridOffsetX + i * cellWidth;
        gfx.line(x, gridOffsetY, x, gridOffsetY + gridRows * cellHeight);
      }

      // Draw horizontal lines
      for (let j = 0; j <= gridRows; j++) {
        let y = gridOffsetY + j * cellHeight;
        gfx.line(gridOffsetX, y, gridOffsetX + gridCols * cellWidth, y);
      }

      // Draw letters
      gfx.textAlign(CENTER, CENTER);
      gfx.textSize(16);
      gfx.fill(window.darkMode ? 100 : 150);
      gfx.noStroke();

      let inverse = {};
      if (RUNTIME_ALPHABET_MAP) {
        for (let l in RUNTIME_ALPHABET_MAP) inverse[RUNTIME_ALPHABET_MAP[l]] = l;
      } else {
        for (let l in ALPHABET_DNA) inverse[ALPHABET_DNA[l].zoneIndex] = l;
      }
      const totalZones = gridCols * gridRows;
      for (let z = 0; z < totalZones; z++) {
        const letter = inverse[z];
        if (!letter) continue; // leave empty cells blank
        let col = z % gridCols;
        let row = Math.floor(z / gridCols);
        let x = gridOffsetX + col * cellWidth + cellWidth / 2;
        let y = gridOffsetY + row * cellHeight + cellHeight / 2;
        gfx.text(letter, x, y);
      }

      gfx.pop();
    } catch (e) { /* ignore */ }
  }

  function drawDashedLineTo(gfx, x1, y1, x2, y2, dashLen = 5, gapLen = 5) {
    let dx = x2 - x1; let dy = y2 - y1; let dist = Math.sqrt(dx * dx + dy * dy); if (dist === 0) return;
    let stepLen = dashLen + gapLen; let steps = dist / stepLen; let unitX = dx / dist; let unitY = dy / dist;
    for (let i = 0; i < steps; i++) {
      let startX = x1 + i * stepLen * unitX; let startY = y1 + i * stepLen * unitY; let endX = startX + dashLen * unitX; let endY = startY + dashLen * unitY;
      if ((unitX > 0 && endX > x2) || (unitX < 0 && endX < x2)) { endX = x2; endY = y2; }
      if ((unitY > 0 && endY > y2) || (unitY < 0 && endY < y2)) { endX = x2; endY = y2; }
      gfx.line(startX, startY, endX, endY);
    }
  }

  function drawPathForWordTo(gfx, pathObj, startIndex) {
    if (!pathObj || !Array.isArray(pathObj.points) || pathObj.points.length < 1) return;
    const points = pathObj.points;
    const color = pathObj.color;
    if (points.length >= 2) {
      gfx.push();
      gfx.stroke(color);
      gfx.strokeWeight(1);
      gfx.noFill();
      // dashed path
      for (let i = 0; i < points.length - 1; i++) {
        drawDashedLineTo(gfx, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }
      // arrows
      gfx.stroke(color);
      gfx.strokeWeight(1);
      gfx.fill(color);
      for (let i = 0; i < points.length - 1; i++) {
        let start = points[i]; let end = points[i + 1]; let midX = (start.x + end.x) / 2; let midY = (start.y + end.y) / 2; let dx = end.x - start.x; let dy = end.y - start.y; let angle = Math.atan2(dy, dx);
        gfx.push(); gfx.translate(midX, midY); gfx.rotate(angle);
        gfx.triangle(0, 0, -15, -2.5, -15, 2.5);
        gfx.pop();
      }
      // markers
      gfx.noStroke(); gfx.fill(color); gfx.ellipse(points[0].x, points[0].y, 12, 12);
      if (points.length > 1) {
        let end = points[points.length - 1]; gfx.stroke(color); gfx.strokeWeight(2); gfx.line(end.x - 6, end.y - 6, end.x + 6, end.y + 6); gfx.line(end.x + 6, end.y - 6, end.x - 6, end.y + 6);
      }
      // numbers
      gfx.noStroke(); gfx.fill(color); gfx.textAlign(CENTER, CENTER); gfx.textSize(10);
      for (let i = 0; i < points.length; i++) { let point = points[i]; gfx.text(startIndex + i + 1, point.x + 12, point.y - 12); }
      gfx.pop();
    } else {
      gfx.push(); gfx.noStroke(); gfx.fill(pathObj.color); gfx.ellipse(points[0].x, points[0].y, 12, 12); gfx.pop();
    }
  }

  // start building list of images to include
  const w = (artLayer && artLayer.width) ? artLayer.width : width;
  const h = (artLayer && artLayer.height) ? artLayer.height : height;
  const overlays = (typeof window.showOverlays === 'undefined') ? true : window.showOverlays;
  const wordLayers = (window.wordLayers && Array.isArray(window.wordLayers)) ? window.wordLayers : null;
  const words = (window.wordStrings && Array.isArray(window.wordStrings)) ? window.wordStrings : null;
  const paths = (typeof currentPaths !== 'undefined' && Array.isArray(currentPaths)) ? currentPaths : (window.currentPaths && Array.isArray(window.currentPaths) ? window.currentPaths : []);

  const base = filename ? filename.replace(/\.png$/i, '') : ('aether-' + ts());
  const toExport = [];

  if (wordLayers && wordLayers.length > 0) {
    for (let i = 0; i < wordLayers.length; i++) {
      const buff = createGraphics(w, h);
      buff.background(window.darkMode ? '#141414' : 255);
      try { buff.image(wordLayers[i], 0, 0); } catch (e) {}
      if (overlays) { drawGridTo(buff); try { drawPathForWordTo(buff, paths[i], 0); } catch (e) {} }
      toExport.push({ name: base + '-' + (i + 1) + '-' + (words && words[i] ? sanitize(words[i]) : ('layer-' + (i + 1))), gfx: buff });
    }

    // final composition (respect visibility toggles)
    const final = createGraphics(w, h);
    final.background(window.darkMode ? '#141414' : 255);
    for (let i = 0; i < wordLayers.length; i++) {
      if (window.wordVisibility && window.wordVisibility[i] === false) continue;
      try { final.image(wordLayers[i], 0, 0); } catch (e) {}
    }
    if (overlays) { drawGridTo(final); for (let i = 0; i < paths.length; i++) { if (window.wordVisibility && window.wordVisibility[i] === false) continue; try { drawPathForWordTo(final, paths[i], 0); } catch (e) {} } }
    toExport.push({ name: base + '-final', gfx: final });
  } else if (artLayer) {
    const buff = createGraphics(w, h); buff.background(window.darkMode ? '#141414' : 255); try { buff.image(artLayer, 0, 0); } catch (e) {}
    if (overlays) { drawGridTo(buff); for (let i = 0; i < paths.length; i++) drawPathForWordTo(buff, paths[i], 0); }
    toExport.push({ name: base, gfx: buff });
  } else {
    console.warn('No content available to export.');
    return;
  }

  // convert canvas to blob helper
  function canvasToBlob(gfx) {
    return new Promise((resolve) => {
      try {
        if (gfx.canvas && gfx.canvas.toBlob) {
          gfx.canvas.toBlob(function (b) { resolve(b); });
        } else {
          // fallback: dataURL -> blob
          const data = gfx.canvas.toDataURL('image/png');
          resolve(dataURLToBlob(data));
        }
      } catch (e) {
        try { const data = gfx.canvas.toDataURL('image/png'); resolve(dataURLToBlob(data)); } catch (ex) { resolve(null); }
      }
    });
  }

  // Build blobs
  const blobPromises = toExport.map(item => canvasToBlob(item.gfx).then(b => ({ name: item.name + '.png', blob: b, gfx: item.gfx })) );

  Promise.all(blobPromises).then(async entries => {
    try {
      // Prefer JSZip if present (developer may add it later)
      if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        entries.forEach(e => { if (e.blob) zip.file(e.name, e.blob); });
        const zipName = (base || 'aether') + '.zip';
        const zb = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(zb);
        a.href = url; a.download = zipName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        console.log('Exported ZIP via JSZip:', zipName);
      } else {
        // Use built-in ZIP builder (stored, no compression)
        const arrs = await Promise.all(entries.map(async e => {
          if (!e.blob) return null;
          const ab = await e.blob.arrayBuffer();
          return { name: e.name, data: new Uint8Array(ab) };
        }));
        const filtered = arrs.filter(Boolean);
        if (filtered.length === 0) throw new Error('No blob data available to build ZIP');
        const zipBlob = buildZip(filtered);
        const zipName = (base || 'aether') + '.zip';
        const a = document.createElement('a');
        const url = URL.createObjectURL(zipBlob);
        a.href = url; a.download = zipName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        console.log('Exported ZIP (built-in):', zipName);
      }
    } catch (err) {
      console.error('ZIP export failed, falling back to single final PNG', err);
      // fallback: save final only
      const finalEntry = entries[entries.length - 1];
      if (finalEntry && finalEntry.blob) {
        const fname = finalEntry.name;
        const a2 = document.createElement('a');
        const url2 = URL.createObjectURL(finalEntry.blob);
        a2.href = url2; a2.download = fname;
        document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(url2), 10000);
      }
    } finally {
      // Cleanup p5 buffers
      entries.forEach(e => { try { if (e.gfx && typeof e.gfx.remove === 'function') e.gfx.remove(); } catch (ex) {} });
    }
  }).catch(err => { console.error('Export failed:', err); });
}

// Expose as a global so index.html's export button can call it
window.exportPNG = exportPNG;

// Handle window resize: preserve artLayer content and recalc grid metrics
function windowResized() {
  // Snapshot previous art
  let prev = artLayer ? artLayer.get() : null;

  // Resize main canvas
  resizeCanvas(windowWidth, windowHeight);

  // Recreate art layer at new size and restore previous pixels
  let newArt = createGraphics(width, height);
  if (prev) newArt.image(prev, 0, 0);
  artLayer = newArt;

  // Reinitialize fluid module with new layer
  if (typeof Fluid !== 'undefined' && Fluid.init) Fluid.init(artLayer);

  // Reinitialize engines with new buffer size
  try {
    if (window.AetherSoftEngine && typeof window.AetherSoftEngine.init === 'function') window.AetherSoftEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.AetherSoftModernEngine && typeof window.AetherSoftModernEngine.init === 'function') window.AetherSoftModernEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.LiquidInkEngine && typeof window.LiquidInkEngine.init === 'function') window.LiquidInkEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.OilBrushEngine && typeof window.OilBrushEngine.init === 'function') window.OilBrushEngine.init({ width: artLayer.width, height: artLayer.height });
    if (window.WetWatercolorEngine && typeof window.WetWatercolorEngine.init === 'function') window.WetWatercolorEngine.init({ width: artLayer.width, height: artLayer.height });
  } catch (e) { /* ignore */ }

  // Recalculate cell dims
  cellWidth = width / gridCols;
  cellHeight = height / gridRows;
  gridOffsetX = (width - gridCols * cellWidth) / 2;
  gridOffsetY = (height - gridRows * cellHeight) / 2;
}
