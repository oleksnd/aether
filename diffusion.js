// AETHER Fluid Diffusion Module
// Responsible for fluid palette, diffusion parameters, and rendering ink splashes on an offscreen artLayer.

const Fluid = (function(){
  // Temporary fluid palette (red, yellow, blue)
  const FLUID_PALETTE = [
    [255, 50, 50],
    [255, 200, 0],
    [50, 50, 255]
  ];

  // Diffusion engine parameters (coalescence / puddle mode)
  const DIFFUSION = {
    // Lower count of distinct droplets but more organic mass per ink
    particlesMin: 12,
    particlesMax: 28,

    // Wider baseline spread so droplets reach far and blend
    spreadSigma: 60,

    // Multipliers used for inner and outer clouds
    innerSigmaFactor: 0.5,
    outerSigmaFactor: 2.2,

    // Droplet size ranges (small -> large globs)
    sizeMin: 3,
    sizeMax: 40,

    // Base puddle sizes (will grow when nozzle lingers)
    basePuddleMin: 90,
    basePuddleMax: 300,
    basePuddleMaxCap: 800,
    // Growth per repeated ink at the same spot (px)
    basePuddleGrowthRate: 8,

    // Opacity ranges bumped so stacks become dense (values 0..255)
    baseAlphaMin: 4,
    baseAlphaMax: 36,
    splashAlphaMin: 10,
    splashAlphaMax: 200,

    // Blur radius (px) applied to freshly drawn blobs (soft edges)
    blurPx: 4,

    // How many vertex points when drawing organic shapes
    shapeVertices: 28,

    // Pigment grain behavior (tiny dots)
    grainDensity: 0.006, // relative to area
    grainSizeMin: 0.4,
    grainSizeMax: 1.8,
    grainAlpha: 6,

    // Fringe (wet edge) settings
    fringeDarkenFactor: 0.85,
    fringeThickness: 0.12,

    // Noise parameters for ragged edges
    noiseScale: 0.008,
    noiseAmpFactor: 0.16,

    // Subdivision & deformation (Tyler Hobbs style)
    subdivideIterations: 3,
    subdivideDispFactor: 0.32,

    // Accumulation of alpha when nozzle lingers
    accumulationRate: 4, // alpha per millisecond of linger influence factor
    maxAccumAlpha: 200,

    // Wet-on-wet highlights chance
    highlightChance: 0.22
  };

  // Track last ink to allow accumulation when nozzle lingers
  let lastInk = { x: null, y: null, time: 0, size: 0, alpha: 0 };

  // Draw pigment grain: many tiny dots inside a circle area to simulate pigment texture
  function applyPigmentGrain(gfx, cx, cy, outerRadius, color) {
    // density relative to area
    let area = PI * outerRadius * outerRadius;
    let count = Math.floor(area * DIFFUSION.grainDensity);
    count = Math.max(count, 30);

    for (let i = 0; i < count; i++) {
      // sample point biased toward center to preserve core concentration
      let r = abs(randomGaussian() * (outerRadius * 0.55));
      let theta = random(0, TWO_PI);
      let gx = cx + cos(theta) * r;
      let gy = cy + sin(theta) * r * 0.85;
      let gs = random(DIFFUSION.grainSizeMin, DIFFUSION.grainSizeMax);

      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], DIFFUSION.grainAlpha);
      else gfx.fill(color);

      gfx.noStroke();
      gfx.ellipse(gx, gy, gs, gs);
    }
  }

  // Draw wet edge fringe (darker ring near outer radius)
  function drawFringe(gfx, cx, cy, outerRadius, color) {
    let ringRadius = outerRadius * (1 + DIFFUSION.fringeThickness);
    let fringeAlpha = Math.floor((DIFFUSION.baseAlphaMax || 20) * 0.9);

    // Darken color slightly for fringe
    if (Array.isArray(color)) {
      let r = Math.floor(color[0] * DIFFUSION.fringeDarkenFactor);
      let g = Math.floor(color[1] * DIFFUSION.fringeDarkenFactor);
      let b = Math.floor(color[2] * DIFFUSION.fringeDarkenFactor);
      gfx.fill(r, g, b, fringeAlpha);
    } else {
      gfx.fill(color);
    }

    // thin noisy ring
    gfx.beginShape();
    for (let i = 0; i < DIFFUSION.shapeVertices; i++) {
      let ang = map(i, 0, DIFFUSION.shapeVertices, 0, TWO_PI);
      let nx = cx * DIFFUSION.noiseScale + cos(ang) * 0.17;
      let ny = cy * DIFFUSION.noiseScale + sin(ang) * 0.17;
      let n = noise(nx, ny);
      let radialNoise = map(n, 0, 1, -outerRadius * 0.04, outerRadius * 0.06);
      let r = ringRadius + radialNoise;
      let vx = cx + cos(ang) * r;
      let vy = cy + sin(ang) * r * 0.9;
      gfx.vertex(vx, vy);
    }
    gfx.endShape(CLOSE);
  }

  // Add wet-on-wet highlights: small bright strokes inside the puddle
  function applyHighlights(gfx, cx, cy, baseRadius) {
    if (random() > DIFFUSION.highlightChance) return;
    let count = Math.floor(random(2, 6));
    for (let i = 0; i < count; i++) {
      let rx = cx + randomGaussian() * baseRadius * 0.15;
      let ry = cy + randomGaussian() * baseRadius * 0.12;
      let w = random(baseRadius * 0.06, baseRadius * 0.18);
      let h = w * random(0.3, 0.7);
      gfx.fill(255, 255, 255, Math.floor(random(6, 18))); // subtle bright spots
      gfx.noStroke();
      gfx.push();
      gfx.translate(rx, ry);
      gfx.rotate(random(-PI / 6, PI / 6));
      gfx.ellipse(0, 0, w, h);
      gfx.pop();
    }
  }

  let artLayer = null;

  function init(layer) {
    artLayer = layer;
    // Ensure the art layer can accumulate color with multiply blending
    if (artLayer && typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);
  }

  function pickColor() {
    return FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))];
  }

  // Recursive subdivision + deformation of a polygon contour (Tyler Hobbs style)
  function subdivideDeform(points, iterations, dispScale, noiseScale) {
    for (let it = 0; it < iterations; it++) {
      let newPts = [];
      for (let i = 0; i < points.length; i++) {
        let a = points[i];
        let b = points[(i + 1) % points.length];
        newPts.push(a);

        // midpoint
        let mx = (a.x + b.x) / 2;
        let my = (a.y + b.y) / 2;

        // edge normal
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let len = sqrt(dx * dx + dy * dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;

        // noise-driven displacement along normal
        let n = noise(mx * noiseScale, my * noiseScale, it * 0.12);
        let disp = map(n, 0, 1, -dispScale, dispScale);
        // small random component to break tiling
        disp += randomGaussian() * (dispScale * 0.08);

        let mx2 = mx + nx * disp;
        let my2 = my + ny * disp;

        newPts.push({ x: mx2, y: my2 });
      }
      points = newPts;
      dispScale *= 0.55; // reduce displacement each iteration
    }
    return points;
  }

  // Draw an organic, noise-deformed blob using recursive subdivision for smooth torn edges
  // Returns the approximate outer radius used (for grain/fringe calculations)
  function drawOrganicBlob(gfx, cx, cy, baseRadius, color, layers = 4, verticalSquash = 0.75) {
    let outerRadius = 0;

    for (let layer = layers; layer >= 1; layer--) {
      let radius = baseRadius * (1 + layer * 0.18);
      outerRadius = max(outerRadius, radius);

      let t = layer / layers;
      let alpha = Math.floor(map(t, 0, 1, DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMax) * (0.8 + t * 0.6));
      if (lastInk && lastInk.alpha) alpha = Math.min(255, Math.floor(alpha + lastInk.alpha * t));

      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], alpha);
      else gfx.fill(color);

      // create initial circular polygon
      let pts = [];
      for (let i = 0; i < DIFFUSION.shapeVertices; i++) {
        let ang = map(i, 0, DIFFUSION.shapeVertices, 0, TWO_PI);
        let px = cx + cos(ang) * radius;
        let py = cy + sin(ang) * radius * verticalSquash;
        pts.push({ x: px, y: py });
      }

      // subdivide + deform the polygon
      let dispScale = radius * DIFFUSION.subdivideDispFactor;
      let noiseScale = DIFFUSION.noiseScale * (0.6 + (1 - t) * 0.6);
      let finalPts = subdivideDeform(pts, DIFFUSION.subdivideIterations, dispScale, noiseScale);

      // draw shape (smooth with curveVertex)
      gfx.beginShape();
      // duplicate first points for curve smoothness
      let wrap = 3;
      for (let w = finalPts.length - wrap; w < finalPts.length; w++) gfx.curveVertex(finalPts[w].x, finalPts[w].y);
      for (let p of finalPts) gfx.curveVertex(p.x, p.y);
      for (let w = 0; w < wrap; w++) gfx.curveVertex(finalPts[w].x, finalPts[w].y);
      gfx.endShape(CLOSE);
    }

    return outerRadius;
  }

  function executeInking(letter, x, y, chosenColor) {
    if (!artLayer) return;

    // Accumulation: if nozzle is near the previous ink point and time gap is small, grow the puddle
    let now = millis();
    let distFromLast = (lastInk.x === null) ? Infinity : dist(x, y, lastInk.x, lastInk.y);
    let dt = (lastInk.time) ? (now - lastInk.time) : 0;

    if (distFromLast < 20 && dt < 900) {
      // grow existing puddle and alpha accumulation proportional to linger time
      lastInk.size = Math.min(DIFFUSION.basePuddleMaxCap, lastInk.size + DIFFUSION.basePuddleGrowthRate);
      let alphaInc = Math.floor(DIFFUSION.accumulationRate * (dt / 100));
      lastInk.alpha = Math.min(DIFFUSION.maxAccumAlpha, (lastInk.alpha || 0) + alphaInc);
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    } else {
      // new puddle: initialize alpha and size
      lastInk.size = random(DIFFUSION.basePuddleMin, DIFFUSION.basePuddleMax);
      lastInk.alpha = Math.floor(random(DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMin * 2));
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    }

    artLayer.push();
    artLayer.noStroke();

    // Use blur while drawing base puddle and inner cloud to soften edges
    if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') {
      artLayer.drawingContext.filter = `blur(${DIFFUSION.blurPx}px)`;
    }

    // Base puddle: a few layered organic shapes (very soft). Capture outer radius
    let outerA = drawOrganicBlob(artLayer, x + random(-8, 8), y + random(-6, 6), lastInk.size, chosenColor, 4, 0.8);

    // Inner core: smaller but denser blob to create concentrated center
    let outerB = drawOrganicBlob(artLayer, x + random(-6, 6), y + random(-4, 4), lastInk.size * 0.45, chosenColor, 3, 0.85);

    let puddleOuter = max(outerA, outerB);

    // Turn off blur for splatter texture and fine details (grain, fringe, highlights)
    if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') {
      artLayer.drawingContext.filter = 'none';
    }

    // Add pigment grain across the puddle to create textured pigment behavior
    applyPigmentGrain(artLayer, x, y, puddleOuter, chosenColor);

    // Wet-edge fringe (subtle darker ring)
    drawFringe(artLayer, x, y, puddleOuter, chosenColor);

    // Subtle bright 'wet' highlights in the core
    applyHighlights(artLayer, x, y, lastInk.size);

    // Dense cloud of smaller organic droplets around the puddle (allows blending)
    let particleCount = Math.floor(random(DIFFUSION.particlesMin, DIFFUSION.particlesMax + 1));
    let innerSigma = DIFFUSION.spreadSigma * DIFFUSION.innerSigmaFactor;

    for (let i = 0; i < particleCount; i++) {
      // bias horizontal spread slightly more than vertical to imitate floor puddles
      let offsetX = randomGaussian(0, innerSigma) * 1.0;
      let offsetY = randomGaussian(0, innerSigma) * 0.65;
      let size = random(DIFFUSION.sizeMin, DIFFUSION.sizeMax * 0.5);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin * 0.25, DIFFUSION.splashAlphaMax * 0.25));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      drawOrganicBlob(artLayer, x + offsetX, y + offsetY, size * random(0.8, 1.4), chosenColor, 2, 0.85);
    }

    // Outer splatter: fewer, larger, reach further, some elongated
    let outerCount = Math.floor(particleCount * 0.5);
    let outerSigma = DIFFUSION.spreadSigma * DIFFUSION.outerSigmaFactor;
    for (let i = 0; i < outerCount; i++) {
      let offsetX = randomGaussian(0, outerSigma) * 1.0;
      let offsetY = randomGaussian(0, outerSigma) * 0.6;
      let size = random(DIFFUSION.sizeMax * 0.5, DIFFUSION.sizeMax * 1.1);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin * 0.4, DIFFUSION.splashAlphaMax * 0.5));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      if (random() < 0.3) {
        artLayer.push();
        artLayer.translate(x + offsetX, y + offsetY);
        artLayer.rotate(random(-PI, PI));
        drawOrganicBlob(artLayer, 0, 0, size * random(0.7, 1.6), chosenColor, 2, 0.6);
        artLayer.pop();
      } else {
        drawOrganicBlob(artLayer, x + offsetX, y + offsetY, size, chosenColor, 2, 0.7);
      }
    }

    // Occasional heavy glob
    if (random() < 0.25) {
      let globSize = random(lastInk.size * 0.35, lastInk.size * 0.85);
      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], Math.floor(DIFFUSION.splashAlphaMax * 0.5));
      artLayer.ellipse(x + randomGaussian(0, DIFFUSION.spreadSigma * 0.45), y + randomGaussian(0, DIFFUSION.spreadSigma * 0.25), globSize, globSize * 0.5);
    }

    artLayer.pop();
  }

  return {
    init,
    pickColor,
    executeInking,
    // Expose params for runtime tweaking if needed
    DIFFUSION,
    FLUID_PALETTE
  };
})();