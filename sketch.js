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
  stroke(200); // Light gray
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
  textSize(20);
  fill(100);
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

  stroke(0, 100, 200); // Blue line
  strokeWeight(3);
  noFill();

  beginShape();
  for (let point of currentPath) {
    vertex(point.x, point.y);
  }
  endShape();

  // Draw arrows on each segment
  drawArrows();

  // Draw start and end markers
  drawMarkers();

  // Draw step numbers
  drawNumbers();
}

function drawArrows() {
  stroke(0, 100, 200);
  strokeWeight(2);
  fill(0, 100, 200);

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

    // Arrow size (increased for clarity)
    let arrowLength = 20;
    let arrowWidth = 8;

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

  // Start marker: bold filled circle in center of first cell
  let start = currentPath[0];
  fill(0, 150, 255);
  noStroke();
  ellipse(start.x, start.y, 20, 20);

  // End marker: clear X in center of last cell
  if (currentPath.length > 1) {
    let end = currentPath[currentPath.length - 1];
    stroke(255, 0, 0);
    strokeWeight(4);
    line(end.x - 10, end.y - 10, end.x + 10, end.y + 10);
    line(end.x + 10, end.y - 10, end.x - 10, end.y + 10);
  }
}

function drawNumbers() {
  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(12);

  for (let i = 0; i < currentPath.length; i++) {
    let point = currentPath[i];
    // Position slightly above and to the right of the center
    text(i + 1, point.x + 15, point.y - 15);
  }
}

function highlightCells() {
  noStroke();
  fill(200, 200, 255, 100); // Light blue with transparency

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
