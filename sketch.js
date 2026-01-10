let words = [];
let currentIndex = 0;
let state = 'idle';
let nozzleX, nozzleY;
let targetX, targetY;
let minChar, maxChar;
let inkCount = 0;
let maxInk = 100; // increased for more density
let paperGrain;
let uiLayer; // off-screen buffer for UI elements

function setup() {
  createCanvas(windowWidth, windowHeight);
  uiLayer = createGraphics(width, height); // UI layer for transient elements
  paperGrain = createGraphics(width, height);
  paperGrain.loadPixels();
  for (let x = 0; x < width; x += 4) { // back to grid pattern as liked
    for (let y = 0; y < height; y += 4) {
      let n = noise(x * 0.005, y * 0.005);
      let gray = 255 - n * 20;
      paperGrain.set(x, y, color(gray, gray, gray));
    }
  }
  paperGrain.updatePixels();
  background(255);
  image(paperGrain, 0, 0);
  nozzleX = width / 2;
  nozzleY = height / 2;
  window.startGeneration = startGeneration;
}

function draw() {
  if (state === 'idle' || state === 'done') return;

  // update nozzle
  let dx = targetX - nozzleX;
  let dy = targetY - nozzleY;
  let dist = sqrt(dx * dx + dy * dy);
  let speed = 0.25; // faster nozzle movement
  if (dist > 1) {
    nozzleX += dx * speed;
    nozzleY += dy * speed;
  } else {
    nozzleX = targetX;
    nozzleY = targetY;
  }

  // clear overlay and draw on uiLayer
  uiLayer.clear();
  // draw nozzle on uiLayer
  uiLayer.fill(0, 150);
  uiLayer.noStroke();
  uiLayer.ellipse(nozzleX, nozzleY, 3, 3);

  if (state === 'SCAN') {
    if (dist <= 1) {
      // draw grid on pg
      drawGridOnPg(words[currentIndex], nozzleX, nozzleY);
      // set to INK
      state = 'INK';
      inkCount = 0;
    }
  } else if (state === 'INK') {
    // batch inking: draw 20 layers per frame
    for (let i = 0; i < 20; i++) {
      if (inkCount < maxInk) {
        drawBlob(words[currentIndex], nozzleX, nozzleY);
        inkCount++;
      }
    }
    if (inkCount >= maxInk) {
      state = 'MOVE';
      if (currentIndex < words.length - 1) {
        let nextPos = getPosition(words[currentIndex + 1]);
        targetX = nextPos.x;
        targetY = nextPos.y;
      } else {
        state = 'done';
      }
    }
  } else if (state === 'MOVE') {
    // draw aether line on uiLayer
    uiLayer.stroke(0, 30);
    uiLayer.strokeWeight(1);
    uiLayer.line(nozzleX, nozzleY, targetX, targetY);
    if (dist <= 1) {
      currentIndex++;
      if (currentIndex < words.length) {
        state = 'SCAN';
      } else {
        state = 'done';
      }
    }
  }

  // render overlay on top
  image(uiLayer, 0, 0);
}

function getPosition(word) {
  let centerX = width / 2;
  let centerY = height / 2;
  let angle = map(word.charCodeAt(0), minChar, maxChar, 0, TWO_PI);
  let rawDist = map(word.charCodeAt(word.length - 1), minChar, maxChar, 0, min(width, height) * 0.4);
  let dist = pow(rawDist / (min(width, height) * 0.4), 2) * (min(width, height) * 0.4);
  return { x: centerX + cos(angle) * dist, y: centerY + sin(angle) * dist };
}

function drawGridOnPg(word, x, y) {
  let len = word.length;
  let shape;
  if (len < 4) shape = 'triangle';
  else if (len < 7) shape = 'hexagon';
  else shape = 'trapezoid';
  uiLayer.stroke(0, 100);
  uiLayer.noFill();
  uiLayer.strokeWeight(1);
  uiLayer.push();
  uiLayer.translate(x, y);
  if (shape === 'triangle') {
    uiLayer.triangle(-20, 10, 0, -20, 20, 10);
  } else if (shape === 'hexagon') {
    uiLayer.beginShape();
    for (let i = 0; i < 6; i++) {
      let angle = i * PI / 3;
      uiLayer.vertex(cos(angle) * 30, sin(angle) * 30);
    }
    uiLayer.endShape(uiLayer.CLOSE);
  } else {
    uiLayer.beginShape();
    uiLayer.vertex(-30, 10);
    uiLayer.vertex(-10, -10);
    uiLayer.vertex(10, -10);
    uiLayer.vertex(30, 10);
    uiLayer.endShape(uiLayer.CLOSE);
  }
  uiLayer.pop();
}

function drawBlob(word, x, y) {
  let hash = word.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  let hue = (hash % 360 + 137.5) % 360;
  let sat = random(30, 50);
  let light = random(75, 90);
  let col = color('hsl(' + hue + ',' + sat + '%,' + light + '%)');
  col.setAlpha(3); // ~1% opacity for true watercolor
  noStroke(); // reset styles
  blendMode(MULTIPLY);
  beginShape();
  let numPoints = 120; // ultra-smooth edges
  let baseRadius = windowWidth * 0.1; // larger blobs
  let currentRadius = baseRadius * map(inkCount, 0, maxInk, 0.2, 1.5); // ink spread physics
  let variation = 10;
  let scale = 0.01; // smoother, more liquid edges
  let points = [];
  for (let i = 0; i <= numPoints; i++) {
    let angle = map(i, 0, numPoints, 0, TWO_PI);
    let n = noise(cos(angle) * 0.5 + 100, sin(angle) * 0.5 + 100, inkCount * 0.01); // anti-pentagram smoothing
    let radius = currentRadius + n * variation;
    let vx = x + cos(angle) * radius;
    let vy = y + sin(angle) * radius;
    points.push({x: vx, y: vy});
    curveVertex(vx, vy);
  }
  // repeat first 3 points for smooth closing
  for (let i = 0; i < 3; i++) {
    curveVertex(points[i].x, points[i].y);
  }
  endShape(CLOSE);
  blendMode(BLEND);
}

function startGeneration(text) {
  words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return;
  let allChars = text.split('').map(c => c.charCodeAt(0));
  minChar = Math.min(...allChars);
  maxChar = Math.max(...allChars);
  // seed once for the whole text
  let textHash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  randomSeed(textHash);
  noiseSeed(textHash);
  currentIndex = 0;
  nozzleX = width / 2; // start from center
  nozzleY = height / 2;
  let pos = getPosition(words[0]);
  targetX = pos.x;
  targetY = pos.y;
  state = 'SCAN';
  background(255);
  image(paperGrain, 0, 0);
}