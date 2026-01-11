// AETHER Sketch: Pure Geometry Grid and Path Visualization
// Step 1: Clean slate with mathematical grid and letter navigation

let gridCols, gridRows, gridMargin;
let cellWidth, cellHeight;
let gridOffsetX, gridOffsetY;
let currentPath = [];
let highlightedCells = new Set();

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

  // Draw path if any
  if (currentPath.length > 0) {
    drawPath();
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

  for (let index = 0; index < 26; index++) {
    let col = index % gridCols;
    let row = Math.floor(index / gridCols);
    let x = gridOffsetX + col * cellWidth + cellWidth / 2;
    let y = gridOffsetY + row * cellHeight + cellHeight / 2;
    let letter = String.fromCharCode(65 + index); // A=65
    text(letter, x, y);
  }
}

function parseInput(text) {
  // Convert to uppercase
  let upperText = text.toUpperCase();
  // Remove non-A-Z characters
  let cleanText = upperText.replace(/[^A-Z]/g, '');
  // Return array of characters
  return cleanText.split('');
}

function startGeneration(text) {
  // Parse the input
  let letters = parseInput(text);

  // Clear previous path and highlights
  currentPath = [];
  highlightedCells.clear();

  // For each letter, find its position
  for (let letter of letters) {
    if (ALPHABET_DNA[letter]) {
      let index = ALPHABET_DNA[letter].zoneIndex;
      let col = index % gridCols;
      let row = Math.floor(index / gridCols);
      let x = gridOffsetX + col * cellWidth + cellWidth / 2;
      let y = gridOffsetY + row * cellHeight + cellHeight / 2;
      currentPath.push({x, y});
      highlightedCells.add(index);
    }
  }

  // Redraw to show path and highlights
  redraw();
}

function drawPath() {
  if (currentPath.length < 2) return;

  stroke(100); // Gray
  strokeWeight(1);
  noFill();

  // Draw dashed path
  drawDashedPath(currentPath);

  // Draw arrows on each segment
  drawArrows();

  // Draw start and end markers
  drawMarkers();

  // Draw step numbers
  drawNumbers();
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

function drawArrows() {
  stroke(100);
  strokeWeight(1);
  fill(100);

  for (let i = 0; i < currentPath.length - 1; i++) {
    let start = currentPath[i];
    let end = currentPath[i + 1];

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

function drawMarkers() {
  if (currentPath.length === 0) return;

  // Start marker: minimalist filled circle
  let start = currentPath[0];
  fill(100);
  noStroke();
  ellipse(start.x, start.y, 12, 12);

  // End marker: minimalist X
  if (currentPath.length > 1) {
    let end = currentPath[currentPath.length - 1];
    stroke(100);
    strokeWeight(2);
    line(end.x - 6, end.y - 6, end.x + 6, end.y + 6);
    line(end.x + 6, end.y - 6, end.x - 6, end.y + 6);
  }
}

function drawNumbers() {
  noStroke();
  fill(100);
  textAlign(CENTER, CENTER);
  textSize(10);

  for (let i = 0; i < currentPath.length; i++) {
    let point = currentPath[i];
    // Position slightly above and to the right of the center
    text(i + 1, point.x + 12, point.y - 12);
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
