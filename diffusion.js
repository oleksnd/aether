// AETHER Fluid Diffusion Module
// Responsible for fluid palette, diffusion parameters, and rendering ink splashes on an offscreen artLayer.

const Fluid = (function(){
  // Fluid palette can be provided by a separate palette script as
  // window.CUSTOM_FLUID_PALETTE_ITEMS = [{id,name,hex,rgb:[r,g,b]}...]
  // Build internal FLUID_PALETTE (array of RGB arrays) from that if present,
  // otherwise fall back to a small default palette.
  let FLUID_PALETTE = null;
  try {
    if (typeof window !== 'undefined' && Array.isArray(window.CUSTOM_FLUID_PALETTE_ITEMS) && window.CUSTOM_FLUID_PALETTE_ITEMS.length > 0) {
      FLUID_PALETTE = window.CUSTOM_FLUID_PALETTE_ITEMS.map(it => Array.isArray(it.rgb) ? it.rgb.slice() : [255,0,0]);
      // Expose metadata for UI if needed
      if (typeof window !== 'undefined') window.FLUID_PALETTE_META = window.CUSTOM_FLUID_PALETTE_ITEMS.map(it => ({ id: it.id, name: it.name, hex: it.hex }));
    }
  } catch (e) { FLUID_PALETTE = null; }

  if (!Array.isArray(FLUID_PALETTE) || FLUID_PALETTE.length === 0) {
    FLUID_PALETTE = [
      [255, 50, 50],
      [255, 200, 0],
      [50, 50, 255]
    ];
  }

  // Diffusion engine parameters (coalescence / puddle mode) - kept for potential future use
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

  // Pick a color that's not present in `usedList` (array of RGB arrays).
  // Falls back to `pickColor()` if all colors are used or input is invalid.
  function pickColorDistinct(usedList) {
    try {
      if (!Array.isArray(FLUID_PALETTE)) return pickColor();
      // Normalize usedList to list of strings for quick comparison
      let used = Array.isArray(usedList) ? usedList.map(c => Array.isArray(c) ? c.join(',') : String(c)) : [];
      // candidates = palette colors not present in used
      let candidates = FLUID_PALETTE.filter(col => used.indexOf(Array.isArray(col) ? col.join(',') : String(col)) === -1);
      if (candidates.length > 0) {
        // choose randomly among unused candidates to provide random ordering
        let pick = candidates[Math.floor(random(0, candidates.length))];
        return Array.isArray(pick) ? pick.slice() : pick;
      }
    } catch (e) {
      // ignore and fallback
    }
    // all used or error — return a random color from the full palette
    return FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))].slice ? FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))].slice() : FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))];
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

    // Draw from inner to outer (ascending) so inner layers are rendered last and appear on top
    for (let layer = 1; layer <= layers; layer++) {
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

  // Preset registry: external preset modules can register factories via `registerFluidPreset`.
  // Factories receive an `api` object and should return an inking function `(letter,x,y,chosenColor) => {}`.
  function executeInking(letter, x, y, chosenColor) {
    if (!artLayer) return;
    // Prefer window-managed current style, then DOM selector, fall back to aether-soft
    let styleName = 'aether-soft';
    try {
      if (typeof window !== 'undefined' && window.currentFluidStyle) styleName = window.currentFluidStyle;
      else if (typeof document !== 'undefined' && document.getElementById('styleSelector')) styleName = document.getElementById('styleSelector').value;
    } catch (e) { styleName = 'aether-soft'; }

    console.log('[Fluid] requested style:', styleName, 'letter:', letter, 'pos:', x, y);

    // Map style name to engine object
    let engineKey = styleName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Engine';
    let engine = window[engineKey];
    if (!engine || !engine.execute) {
      console.error('[Fluid] No engine found for style', styleName, 'expected', engineKey);
      return;
    }
    try {
      // Ensure new ink is composited on top of existing content (defensive fix)
      try {
        if (artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation !== 'source-over') {
          // If some code changed it to an odd mode (e.g. destination-over), force normal source-over
          artLayer.drawingContext.globalCompositeOperation = 'source-over';
        }
      } catch (_) { /* ignore if unavailable */ }

      try {
        console.log('[Fluid] composite BEFORE execute:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation);
      } catch (e) { /* ignore */ }

      // Robustness: draw engine output into a temporary offscreen buffer and then composite onto the real art layer
      // This ensures the engine cannot accidentally draw 'behind' existing pixels using destination-over
      let tmp = null;
      try {
        tmp = createGraphics(artLayer.width || width, artLayer.height || height);
        // make sure tmp starts cleared and uses normal composite
        try { if (tmp && typeof tmp.clear === 'function') tmp.clear(); } catch (e) {}
        try { if (tmp && tmp.drawingContext) tmp.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) {}

        // Temporarily point global artLayer to tmp so engines draw into this buffer
        const prevLayer = window.artLayer;
        window.artLayer = tmp;
        try {
          engine.execute(letter, x, y, chosenColor);
        } finally {
          // restore original art layer reference
          window.artLayer = prevLayer;
        }

        // Composite tmp onto the real artLayer using BLEND/source-over so the rendered result is guaranteed on top
        try {
          if (artLayer && typeof artLayer.push === 'function') artLayer.push();
          try { if (typeof artLayer.blendMode === 'function') artLayer.blendMode(BLEND); } catch (e) {}
          try { if (artLayer && artLayer.drawingContext) artLayer.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) {}
          try { console.log('[Fluid] compositing tmp onto artLayer with BLEND'); } catch (e) {}
          artLayer.image(tmp, 0, 0);
        } finally {
          try { if (artLayer && typeof artLayer.pop === 'function') artLayer.pop(); } catch (e) {}
        }

        try {
          console.log('[Fluid] executed inking for', styleName, 'at', x, y, 'COMPOSITE_AFTER:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation);
        } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('[Fluid] engine.execute error (fallback to direct):', err);
        // fallback to direct execution if buffering fails
        try {
          engine.execute(letter, x, y, chosenColor);
        } catch (err2) {
          console.error('Fluid style error (direct fallback)', err2);
        }
      } finally {
        try { if (tmp && typeof tmp.remove === 'function') tmp.remove(); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Fluid style error', err);
    }
  }

  return {
    init,
    pickColor,
    pickColorDistinct,
    executeInking,
    // Expose params for runtime tweaking if needed
    DIFFUSION,
    FLUID_PALETTE
  };
})();