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
    basePuddleMaxCap: 120,
    basePuddleGrowthRate: 2,
    accumulationRate: 4,
    maxAccumAlpha: 220,
    basePuddleMin: 8,
    basePuddleMax: 28,
    baseAlphaMin: 12,
    baseAlphaMax: 120,
    spreadSigma: 28,
    highlightChance: 0.45,
    shapeVertices: 18,
    subdivideDispFactor: 0.28,
    noiseScale: 0.02,
    subdivideIterations: 3,
    blurPx: 8,
    grainDensity: 0.6
  };
  
  let lastInk = { x: null, y: null, time: 0, size: 0, alpha: 0 };
  // Convert HSL back to RGB array
    function hslToRgb(h, s, l) {
      h /= 360; s /= 100; l /= 100;
      let r, g, b;
      if (s === 0) { r = g = b = l; }
      else {
        function hue2rgb(p, q, t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        }
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
  
    // Convert RGB to HSL object {h,s,l} where h in degrees, s,l in percentage
    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      let max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
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

  // Draw wet-edge fringe (darker ring near outer radius)
  function drawFringe(gfx, cx, cy, outerRadius, color) {
    const fringeThickness = 0.12;
    const fringeDarkenFactor = 0.85;
    let ringRadius = outerRadius * (1 + fringeThickness);
    let fringeAlpha = Math.floor((DIFFUSION.baseAlphaMax || 20) * 0.9);

    // Darken color slightly for fringe
    if (Array.isArray(color)) {
      let r = Math.floor(color[0] * fringeDarkenFactor);
      let g = Math.floor(color[1] * fringeDarkenFactor);
      let b = Math.floor(color[2] * fringeDarkenFactor);
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

    // Add a couple thinner, darker strokes to emulate pigment edge accumulation
    let edgeCount = 2;
    for (let e = 0; e < edgeCount; e++) {
      let ringR = ringRadius * (1 + 0.02 * e);
      let edgeAlpha = Math.floor(fringeAlpha * (0.6 + e * 0.2));
      if (Array.isArray(color)) {
        let r2 = Math.floor(color[0] * (fringeDarkenFactor * (0.9 + e * 0.06)));
        let g2 = Math.floor(color[1] * (fringeDarkenFactor * (0.9 + e * 0.06)));
        let b2 = Math.floor(color[2] * (fringeDarkenFactor * (0.9 + e * 0.06)));
        gfx.fill(r2, g2, b2, edgeAlpha);
      }
      gfx.beginShape();
      for (let i = 0; i < DIFFUSION.shapeVertices; i++) {
        let ang = map(i, 0, DIFFUSION.shapeVertices, 0, TWO_PI);
        let nx = cx * DIFFUSION.noiseScale + cos(ang) * 0.17 * (1 + e * 0.1);
        let ny = cy * DIFFUSION.noiseScale + sin(ang) * 0.17 * (1 + e * 0.1);
        let n = noise(nx, ny + e * 10);
        let radialNoise = map(n, 0, 1, -outerRadius * 0.02, outerRadius * 0.04);
        let r = ringR + radialNoise;
        let vx = cx + cos(ang) * r;
        let vy = cy + sin(ang) * r * 0.9;
        gfx.vertex(vx, vy);
      }
      gfx.endShape(CLOSE);
    }
  }

  // Very fine paper grain: 1-2px 'sand' dots over area with very low alpha
  function applyPaperGrain(gfx, cx, cy, outerRadius, color) {
    let area = PI * outerRadius * outerRadius;
    // much lighter density than pigment grain
    let count = Math.floor(area * (DIFFUSION.grainDensity * 0.12));
    count = Math.max(count, 40);
    gfx.noStroke();
    for (let i = 0; i < count; i++) {
      let r = abs(randomGaussian() * (outerRadius * 0.6));
      let theta = random(0, TWO_PI);
      let gx = cx + cos(theta) * r;
      let gy = cy + sin(theta) * r * 0.9;
      let gs = random(1, 2);
      let a = Math.floor(random(2, 10));
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], a);
      else gfx.fill(color);
      gfx.ellipse(gx, gy, gs, gs);
    }
  }

  // Pigment grain: denser tiny dots inside puddle area to simulate pigment settling
  function applyPigmentGrain(gfx, cx, cy, outerRadius, color) {
    let area = PI * outerRadius * outerRadius;
    // scale density to DIFFUSION.grainDensity; fallback to 0.006 if weird
    let density = (typeof DIFFUSION.grainDensity === 'number') ? DIFFUSION.grainDensity : 0.006;
    // adjust for this codebase where grainDensity may be larger (normalize)
    if (density > 1) density = density * 0.01;
    let count = Math.floor(area * density);
    count = Math.max(count, 50);

    for (let i = 0; i < count; i++) {
      let r = abs(randomGaussian() * (outerRadius * 0.5));
      let theta = random(0, TWO_PI);
      let gx = cx + cos(theta) * r;
      let gy = cy + sin(theta) * r * 0.85;
      let gs = random(0.4, 1.6);
      let a = Math.floor(random(4, 14));
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], a);
      else gfx.fill(color);
      gfx.noStroke();
      gfx.ellipse(gx, gy, gs, gs);
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

    // Pulsate brush size slightly based on letter seed and time (gives rhythm per-letter)
    let seed = 0;
    try { seed = (letter && letter.charCodeAt && letter.charCodeAt(0)) || 0; } catch (e) { seed = 0; }
    let pulse = 1 + 0.06 * sin((millis() * 0.004) + (seed * 0.13));
    brushSize *= pulse;

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
          // Apply slight hue/brightness jitter per stroke to avoid uniform color
          let baseRGB = Array.isArray(chosenColor) ? chosenColor.slice() : null;
          let jittered = baseRGB;
          if (baseRGB) {
            let hsl = rgbToHsl(baseRGB[0], baseRGB[1], baseRGB[2]);
            hsl.h += random(-5, 5);
            hsl.l = constrain(hsl.l + random(-4, 6), 6, 94);
            jittered = hslToRgb(hsl.h, hsl.s, hsl.l);
          }

          let rgba = null;
          if (Array.isArray(jittered)) rgba = `rgba(${jittered[0]},${jittered[1]},${jittered[2]},${(lastInk.alpha||DIFFUSION.baseAlphaMax)/255})`;
          else rgba = chosenColor;

          let opts = {
            color: rgba,
            size: brushSize,
            wetness: 0.9,
            spread: 0.85,
            bleed: 0.9,
            scattering: 0.15,
            blend: 'multiply',
            field: { grain: DIFFUSION.grainDensity * 2.0 }
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

    // Helper: draw capillary rays (thin elongated blobs) radiating from center
    function drawCapillaries(gfx, cx, cy, baseSize, color, count) {
      count = count || Math.floor(map(baseSize, 40, 400, 6, 20));
      for (let i = 0; i < count; i++) {
        let ang = random(0, TWO_PI);
        let len = random(baseSize * 0.6, baseSize * 1.6) * (1 + random(-0.15, 0.3));
        let midx = cx + cos(ang) * (len * 0.45 + random(-6, 6));
        let midy = cy + sin(ang) * (len * 0.45 + random(-6, 6));
        let thin = random(max(1, baseSize * 0.04), max(1.5, baseSize * 0.12));
        // color jitter per capillary
        let c = color;
        if (Array.isArray(color)) {
          let hsl = rgbToHsl(color[0], color[1], color[2]);
          hsl.h += random(-3, 3);
          hsl.l = constrain(hsl.l + random(-6, 4), 4, 96);
          c = hslToRgb(hsl.h, hsl.s, hsl.l);
        }
        gfx.push();
        gfx.translate(midx, midy);
        gfx.rotate(ang + random(-0.15, 0.15));
        gfx.noStroke();
        if (Array.isArray(c)) gfx.fill(c[0], c[1], c[2], Math.floor(random(8, 28)));
        else gfx.fill(c);
        // elongated organic blob
        drawOrganicBlob(gfx, 0, 0, thin, c, 2, random(0.25, 0.6));
        gfx.pop();
      }
    }

    // Fallback: high-density micro-droplet streams (many filaments)
    if (!usedBrush) {
      artLayer.push();
      artLayer.noStroke();

      // Ensure multiply blending for accumulation
      if (typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);

      // Base parameters
      let baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : null;
      // compute spread: larger when nozzle is slower
      let speedNorm = constrain(speed / 0.6, 0, 1);
      let spread = DIFFUSION.spreadSigma * (1 + (1 - speedNorm) * 1.2);

      // Streams: number of filament groups scales with brushSize (increased for denser flow)
      let streamCount = Math.max(24, Math.floor(map(brushSize, 8, 400, 24, 160)));
      // Total droplets per call (distribute across streams + background) — greatly increased for heavy pours
      let totalDroplets = Math.floor(map(brushSize, 8, 400, 4000, 15000));

      // Allocate droplets to streams (majority) and background (minor)
      let streamAllocation = Math.floor(totalDroplets * 0.78);
      let backgroundAllocation = Math.max(40, totalDroplets - streamAllocation);

      // For each stream, emit multiple micro-droplets along an elongated path
      for (let s = 0; s < streamCount; s++) {
        let ang = random(0, TWO_PI);
        // origin offset so streams don't all start at exact center
        let originOffset = randomGaussian() * (brushSize * 0.12);
        let ox0 = x + cos(ang + PI/2) * originOffset;
        let oy0 = y + sin(ang + PI/2) * originOffset;

        // length scales with brushSize and speed (slower -> longer bleed)
        let len = random(brushSize * 0.6, brushSize * 2.0) * (1 + (1 - speedNorm) * 0.9);
        // droplets per stream proportional to len and brushSize
        let dropletsPerStream = Math.max(6, Math.floor(map(len, brushSize * 0.6, brushSize * 2.0, 8, 48)));

        for (let k = 0; k < dropletsPerStream; k++) {
          let t = (k / dropletsPerStream) + random(-0.06, 0.06);
          t = constrain(t, 0, 1);
          // along-line position
          let px = ox0 + cos(ang) * (t * len + random(-len * 0.06, len * 0.06));
          let py = oy0 + sin(ang) * (t * len + random(-len * 0.06, len * 0.06));

          // lateral jitter to create fine capillaries
          px += randomGaussian() * spread * 0.16;
          py += randomGaussian() * spread * 0.12;

          // increase particle visual weight: scale sizes up so droplets occupy more area
          // increase particle visual weight substantially to build large puddles per click
          let psize = random(0.5, 3.0) * 200.0; // ~100-600px
          // keep alpha low so large particles blend via many overlaps
          let palpha = Math.floor(random(1, 5));

          // slight color jitter per droplet
          let col = baseCol;
          if (Array.isArray(baseCol) && random() < 0.12) {
            let hsl = rgbToHsl(baseCol[0], baseCol[1], baseCol[2]);
            hsl.h += random(-3, 3);
            hsl.l = constrain(hsl.l + random(-3, 3), 2, 98);
            col = hslToRgb(hsl.h, hsl.s, hsl.l);
          }

          if (Array.isArray(col)) artLayer.fill(col[0], col[1], col[2], palpha);
          else artLayer.fill(col);
          artLayer.ellipse(px, py, psize, psize);
        }
      }

      // Background micro-dust to fill volume
      for (let i = 0; i < backgroundAllocation; i++) {
        let ox = randomGaussian() * spread * 1.0;
        let oy = randomGaussian() * spread * 0.7;
        // background dust scaled up to contribute to big soft volumes
        let sz = random(0.4, 2.2) * 200.0; // ~80-440px
        let alpha = Math.floor(random(1, 5));
        let col = baseCol;
        if (Array.isArray(baseCol) && random() < 0.06) {
          let hsl = rgbToHsl(baseCol[0], baseCol[1], baseCol[2]);
          hsl.h += random(-2, 2);
          col = hslToRgb(hsl.h, hsl.s, hsl.l);
        }
        if (Array.isArray(col)) artLayer.fill(col[0], col[1], col[2], alpha);
        else artLayer.fill(col);
        artLayer.ellipse(x + ox, y + oy, sz, sz);
      }

      // Texture overlays
      if (baseCol) applyPigmentGrain(artLayer, x, y, spread * 0.9, baseCol);
      applyPaperGrain(artLayer, x, y, spread * 0.9, baseCol || [0,0,0]);

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