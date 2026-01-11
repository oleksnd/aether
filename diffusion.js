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

    // accumulation and timing (retain some of the previous behavior)
    let now = millis();
    let distFromLast = (lastInk.x === null) ? Infinity : dist(x, y, lastInk.x, lastInk.y);
    let dt = (lastInk.time) ? (now - lastInk.time) : 0;

    if (distFromLast < 20 && dt < 900) {
      lastInk.size = Math.min(DIFFUSION.basePuddleMaxCap, lastInk.size + DIFFUSION.basePuddleGrowthRate);
      let alphaInc = Math.floor(DIFFUSION.accumulationRate * (dt / 100));
      lastInk.alpha = Math.min(DIFFUSION.maxAccumAlpha, (lastInk.alpha || 0) + alphaInc);
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    } else {
      lastInk.size = random(DIFFUSION.basePuddleMin, DIFFUSION.basePuddleMax);
      lastInk.alpha = Math.floor(random(DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMin * 2));
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    }

    // Compute speed-based size modifier (larger when nozzle was moving faster)
    let speed = dt > 0 ? (distFromLast / dt) : 0;
    let speedFactor = map(constrain(speed, 0, 2), 0, 2, 0.7, 1.6);
    let brushSize = lastInk.size * speedFactor * random(0.85, 1.25);

    // Preferred path: use p5.brush API when available
    let usedBrush = false;
    try {
      // try common global entrypoints for the library
      let BrushClass = window.Brush || window.P5Brush || window.p5Brush || (window.p5 && window.p5.Brush);

      if (BrushClass) {
        // create an instance per-call if not persistent (safe). Prefer constructors that accept a graphics target.
        let brushInstance = null;
        try {
          // common constructor signatures attempted
          if (typeof BrushClass === 'function') {
            try { brushInstance = new BrushClass(artLayer); } catch (e) { /* ignore */ }
            if (!brushInstance && typeof BrushClass.create === 'function') brushInstance = BrushClass.create(artLayer);
          }
          if (!brushInstance && typeof window.p5Brush === 'object' && typeof window.p5Brush.createBrush === 'function') {
            brushInstance = window.p5Brush.createBrush(artLayer);
          }
        } catch (e) { brushInstance = null; }

        if (brushInstance) {
          // Configure a wet watercolor-like stroke if API supports options
          let rgba = null;
          if (Array.isArray(chosenColor)) rgba = `rgba(${chosenColor[0]},${chosenColor[1]},${chosenColor[2]},${(lastInk.alpha||DIFFUSION.baseAlphaMax)/255})`;
          else rgba = chosenColor;

          let opts = {
            color: rgba,
            size: brushSize,
            wetness: 0.9,
            spread: 0.85,
            bleed: 0.9,
            scattering: 0.15,
            blend: 'multiply'
          };

          // Try common draw/paint/stroke methods
          if (typeof brushInstance.paint === 'function') {
            brushInstance.paint(x, y, opts);
            usedBrush = true;
          } else if (typeof brushInstance.stroke === 'function') {
            brushInstance.stroke({ x, y, size: brushSize, color: rgba, options: opts });
            usedBrush = true;
          } else if (typeof brushInstance.draw === 'function') {
            brushInstance.draw(x, y, opts);
            usedBrush = true;
          } else if (typeof brushInstance === 'function') {
            // some libs export a callable factory
            brushInstance(x, y, opts);
            usedBrush = true;
          }
        }
      }
    } catch (e) {
      // swallow brush errors and fall back
      usedBrush = false;
    }

    // Fallback: single organic 'bleed' built from the existing organic blob routines
    if (!usedBrush) {
      artLayer.push();
      artLayer.noStroke();

      // soft base wash
      if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') artLayer.drawingContext.filter = `blur(${DIFFUSION.blurPx}px)`;
      drawOrganicBlob(artLayer, x + random(-6, 6), y + random(-4, 4), brushSize * 0.95, chosenColor, 4, 0.8);
      if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') artLayer.drawingContext.filter = 'none';

      // add fringe and subtle highlights (no dense ellipse loops)
      let outer = drawOrganicBlob(artLayer, x + random(-4, 4), y + random(-3, 3), brushSize * 0.5, chosenColor, 2, 0.85);
      drawFringe(artLayer, x, y, max(outer, brushSize * 0.9), chosenColor);
      applyHighlights(artLayer, x, y, brushSize * 0.9);

      // some scattered medium blobs for texture (use drawOrganicBlob only)
      let scatter = Math.max(3, Math.floor(random(2, 6)));
      for (let i = 0; i < scatter; i++) {
        let ox = x + randomGaussian() * DIFFUSION.spreadSigma * 0.45;
        let oy = y + randomGaussian() * DIFFUSION.spreadSigma * 0.35;
        let s = random(brushSize * 0.18, brushSize * 0.9);
        drawOrganicBlob(artLayer, ox, oy, s, chosenColor, 2, 0.85);
      }

      artLayer.pop();
    }
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