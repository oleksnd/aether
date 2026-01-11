// AETHER Sketch: Pure Geometry Grid and Path Visualization
// Step 1: Clean slate with mathematical grid and letter navigation

let gridCols, gridRows, gridMargin;
let cellWidth, cellHeight;
let gridOffsetX, gridOffsetY;
let currentPaths = [];
let highlightedCells = new Set();

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
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
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
  // Initialize Fluid module with the art layer (module sets blend mode internally)
  if (typeof Fluid !== 'undefined' && Fluid.init) Fluid.init(artLayer);

  // Wire up style selector: keep a small runtime state and listen for changes
  try {
    const styleSel = document.getElementById('styleSelector');
    if (styleSel) {
      // default to Aether Soft
      styleSel.value = styleSel.value || 'Aether Soft';
      window.currentFluidStyle = styleSel.value;
      styleSel.addEventListener('change', (e) => {
        window.currentFluidStyle = e.target.value;
        try { console.log('[UI] fluid style changed ->', window.currentFluidStyle); } catch (e) {}
      });
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
  // Clear canvas
  background(255);

  // Draw art layer first (for future watercolor)
  image(artLayer, 0, 0);

  // Update nozzle movement (process multiple steps per frame for turbo rendering)
  for (let t = 0; t < TURBO_STEPS; t++) updateNozzle();

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
  stroke(240); // Very light gray
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

  // Draw letters in centers
  textAlign(CENTER, CENTER);
  textSize(16);
  fill(150); // Light gray, quiet
  noStroke();

  for (let letter in ALPHABET_DNA) {
    let index = ALPHABET_DNA[letter].zoneIndex;
    let col = index % gridCols;
    let row = Math.floor(index / gridCols);
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
  // Parse the input into words
  let wordArrays = parseInput(text);

  // Clear previous paths and highlights
  currentPaths = [];
  highlightedCells.clear();
  // Clear the art layer so each generation starts fresh
  try { if (artLayer && typeof artLayer.clear === 'function') artLayer.clear(); } catch (e) { /* ignore */ }

  let colorIndex = 0;
  // Track fluid colors used for this generation so we can avoid duplicates when requested
  let usedFluidColors = [];
  for (let word of wordArrays) {
    let path = [];
    for (let letter of word) {
      if (ALPHABET_DNA[letter]) {
        let index = ALPHABET_DNA[letter].zoneIndex;
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

        path.push({x, y, letter});
        highlightedCells.add(index);
      }
    }
    if (path.length > 0) {
      // pick a fluid color for this word from the Fluid module (safe fallback)
      let fluidCol = null;
      try {
        if (typeof Fluid !== 'undefined' && typeof Fluid.pickColorDistinct === 'function' && window.currentFluidStyle === 'Aether Soft Modern') {
          fluidCol = Fluid.pickColorDistinct(usedFluidColors);
          // record used color as a simple array copy
          if (Array.isArray(fluidCol)) usedFluidColors.push(fluidCol.slice());
        }
      } catch (e) { fluidCol = null; }

      if (!fluidCol) fluidCol = (typeof Fluid !== 'undefined' && Fluid.pickColor) ? Fluid.pickColor() : [255, 50, 50];

      currentPaths.push({points: path, color: wordColors[colorIndex % wordColors.length], fluidColor: fluidCol});
      colorIndex++;
    }
  }

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
      visitedPoints.push({x: nozzle.x, y: nozzle.y, letter: currentPoint.letter});
      // Execute inking hook (delegated to Fluid module)
      if (typeof Fluid !== 'undefined' && Fluid.executeInking) {
        Fluid.executeInking(currentPoint.letter, nozzle.x, nozzle.y, currentPaths[currentWordIndex].fluidColor);
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
    drawPathForWord(currentPaths[i], globalIndex);
    globalIndex += currentPaths[i].points.length;
  }
}

function drawCurrentTrail() {
  if (currentWordIndex < currentPaths.length) {
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
      drawArrowBetween(visitedPoints[visitedPoints.length - 1], {x: nozzle.x, y: nozzle.y}, color);
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

// Export PNG containing only the art layer (no grid / letters / nozzle)
function exportPNG(filename) {
  if (!artLayer) {
    console.warn('No artLayer available to export.');
    return;
  }

  // Create filename with timestamp if not provided
  let name = filename;
  if (!name) {
    const ts = year() + nf(month(), 2) + nf(day(), 2) + '-' + nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2);
    name = 'aether-' + ts + '.png';
  }

  // Extract a p5.Image snapshot of the art layer
  let img = artLayer.get();

  // Save the image as PNG — this will preserve transparency
  save(img, name);
  console.log('Exported PNG:', name);
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

  // Recalculate cell dims
  cellWidth = width / gridCols;
  cellHeight = height / gridRows;
  gridOffsetX = (width - gridCols * cellWidth) / 2;
  gridOffsetY = (height - gridRows * cellHeight) / 2;
}
