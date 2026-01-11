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

function setup() {
  createCanvas(windowWidth, windowHeight);
  noLoop(); // Static drawing, redraw only when needed

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

  // Draw the static grid and letters
  drawGrid();
}

function draw() {
  // Clear canvas
  background(255);

  // Redraw grid and letters
  drawGrid();

  // Draw paths if any
  if (currentPaths.length > 0) {
    drawPaths();
  }

  // Highlight cells
  highlightCells();
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

  for (let index = 0; index < 30; index++) {
    let letter = String.fromCharCode(65 + index); // A=65
    if (ALPHABET_DNA[letter]) {
      let col = index % gridCols;
      let row = Math.floor(index / gridCols);
      let x = gridOffsetX + col * cellWidth + cellWidth / 2;
      let y = gridOffsetY + row * cellHeight + cellHeight / 2;
      text(letter, x, y);
    }
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

  let colorIndex = 0;
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

        path.push({x, y});
        highlightedCells.add(index);
      }
    }
    if (path.length > 0) {
      currentPaths.push({points: path, color: wordColors[colorIndex % wordColors.length]});
      colorIndex++;
    }
  }

  // Redraw to show paths and highlights
  redraw();
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

function drawDashedLine(x1, y1, x2, y2, dashLen, gapLen) {
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

// Make startGeneration global
window.startGeneration = startGeneration;
