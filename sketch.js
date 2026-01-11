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
