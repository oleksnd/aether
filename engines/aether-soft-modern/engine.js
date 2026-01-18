// Aether Soft Modern Engine: Isolated watercolor logic with extra randomization
window.AetherSoftModernEngine = (function() {
  // Private constants (no sharing with other engines)
  const BASE_PUDDLE_MAX_CAP = 120;
  const BASE_PUDDLE_GROWTH_RATE = 2;
  const ACCUMULATION_RATE = 4;
  const MAX_ACCUM_ALPHA = 220;
  const BASE_PUDDLE_MIN = 8;
  const BASE_PUDDLE_MAX = 28;
  const BASE_ALPHA_MIN = 12;
  const BASE_ALPHA_MAX = 120;
  const SPREAD_SIGMA = 28;
  const GRAIN_DENSITY = 0.6;

  // Private state
  let lastInk = { x: null, y: null, time: 0, size: 0, alpha: 0 };

  // Private helper functions
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

  function applyPaperGrain(gfx, cx, cy, outerRadius, color) {
    if (!color || !Array.isArray(color)) return;
    let count = Math.floor(outerRadius * GRAIN_DENSITY * 0.8);
    for (let i = 0; i < count; i++) {
      let ang = random(0, TWO_PI);
      let rad = random(0, outerRadius);
      let px = cx + cos(ang) * rad;
      let py = cy + sin(ang) * rad;
      let sz = random(0.3, 1.2);
      let alpha = Math.floor(random(2, 8));
      let col = color.slice();
      col[0] = constrain(col[0] + random(-12, 12), 0, 255);
      col[1] = constrain(col[1] + random(-12, 12), 0, 255);
      col[2] = constrain(col[2] + random(-12, 12), 0, 255);
      gfx.fill(col[0], col[1], col[2], alpha);
      gfx.noStroke();
      gfx.ellipse(px, py, sz, sz);
    }
  }

  function applyPigmentGrain(gfx, cx, cy, outerRadius, color) {
    if (!color || !Array.isArray(color)) return;
    let count = Math.floor(outerRadius * GRAIN_DENSITY * 0.6);
    for (let i = 0; i < count; i++) {
      let ang = random(0, TWO_PI);
      let rad = random(0, outerRadius * 0.8);
      let px = cx + cos(ang) * rad;
      let py = cy + sin(ang) * rad;
      let sz = random(0.2, 0.8);
      let alpha = Math.floor(random(1, 6));
      let col = color.slice();
      let hsl = rgbToHsl(col[0], col[1], col[2]);
      hsl.l = constrain(hsl.l + random(-8, 4), 0, 100);
      col = hslToRgb(hsl.h, hsl.s, hsl.l);
      gfx.fill(col[0], col[1], col[2], alpha);
      gfx.noStroke();
      gfx.ellipse(px, py, sz, sz);
    }
  }

  function subdivideDeform(points, iterations, dispScale, noiseScale) {
    for (let iter = 0; iter < iterations; iter++) {
      let newPoints = [];
      for (let i = 0; i < points.length; i++) {
        let a = points[i];
        let b = points[(i + 1) % points.length];
        let mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let disp = dispScale * (1 - iter / iterations);
        let nx = noise(mid.x * noiseScale, mid.y * noiseScale, iter * 0.1);
        let ny = noise(mid.x * noiseScale + 100, mid.y * noiseScale + 100, iter * 0.1);
        mid.x += (nx - 0.5) * disp;
        mid.y += (ny - 0.5) * disp;
        newPoints.push(a, mid);
      }
      points = newPoints;
    }
    return points;
  }

  function drawOrganicBlob(gfx, cx, cy, baseRadius, color, layers = 4, verticalSquash = 0.75) {
    let shapeVertices = 18;
    let subdivideDispFactor = 0.28;
    let noiseScale = 0.02;
    let subdivideIterations = 3;

    for (let layer = 0; layer < layers; layer++) {
      let radius = baseRadius * (1 - layer * 0.15);
      let alpha = Math.floor(map(layer, 0, layers - 1, 120, 20));
      let points = [];
      for (let i = 0; i < shapeVertices; i++) {
        let ang = map(i, 0, shapeVertices, 0, TWO_PI);
        let r = radius + random(-radius * 0.2, radius * 0.2);
        let x = cos(ang) * r;
        let y = sin(ang) * r * verticalSquash;
        points.push({ x, y });
      }
      points = subdivideDeform(points, subdivideIterations, radius * subdivideDispFactor, noiseScale);
      gfx.push();
      gfx.translate(cx, cy);
      gfx.noStroke();
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], alpha);
      else gfx.fill(color);
      gfx.beginShape();
      for (let p of points) {
        gfx.vertex(p.x, p.y);
      }
      gfx.endShape(CLOSE);
      gfx.pop();
    }
  }

  function drawCapillaries(gfx, cx, cy, baseSize, color, count) {
    count = count || Math.floor(map(baseSize, 40, 400, 6, 20));
    for (let i = 0; i < count; i++) {
      let ang = random(0, TWO_PI);
      let len = random(baseSize * 0.6, baseSize * 1.6) * (1 + random(-0.15, 0.3));
      let midx = cx + cos(ang) * (len * 0.45 + random(-6, 6));
      let midy = cy + sin(ang) * (len * 0.45 + random(-6, 6));
      let thin = random(max(1, baseSize * 0.04), max(1.5, baseSize * 0.12));
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
      drawOrganicBlob(gfx, 0, 0, thin, c, 2, random(0.25, 0.6));
      gfx.pop();
    }
  }

  return {
    execute: function(letter, x, y, chosenColor) {
      if (!window.artLayer) return;

      let artLayer = window.artLayer;
      // Defensive: ensure new ink goes on top of existing content
      try { if (artLayer && artLayer.drawingContext) artLayer.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) { /* ignore */ }
      try { console.log('[Aether Soft Modern] composite at start:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) { /* ignore */ }
      // Debug log to help diagnose why Modern may not be painting
      try { console.log('[Aether Soft Modern] called for', letter, {x, y}, 'color=', chosenColor); } catch (e) {}

      let now = millis();
      let distFromLast = (lastInk.x === null) ? Infinity : dist(x, y, lastInk.x, lastInk.y);
      let dt = (lastInk.time) ? (now - lastInk.time) : 0;

      if (distFromLast < 20 && dt < 900) {
        lastInk.size = Math.min(BASE_PUDDLE_MAX_CAP, lastInk.size + BASE_PUDDLE_GROWTH_RATE);
        let alphaInc = Math.floor(ACCUMULATION_RATE * (dt / 100));
        lastInk.alpha = Math.min(MAX_ACCUM_ALPHA, (lastInk.alpha || 0) + alphaInc);
        lastInk.time = now;
        lastInk.x = x;
        lastInk.y = y;
      } else {
        lastInk.size = random(BASE_PUDDLE_MIN, BASE_PUDDLE_MAX);
        lastInk.alpha = Math.floor(random(BASE_ALPHA_MIN, BASE_ALPHA_MIN * 2));
        lastInk.time = now;
        lastInk.x = x;
        lastInk.y = y;
      }

      let speed = dt > 0 ? (distFromLast / dt) : 0;
      let speedFactor = map(constrain(speed, 0, 2), 0, 2, 0.7, 1.6);
      let brushSize = lastInk.size * speedFactor * random(0.85, 1.25);

      let seed = 0;
      try { seed = (letter && letter.charCodeAt && letter.charCodeAt(0)) || 0; } catch (e) { seed = 0; }
      let pulse = 1 + 0.06 * sin((millis() * 0.004) + (seed * 0.13));
      brushSize *= pulse;

      // Modern variant: randomize overall scale of the puddle for variety
      // Size can be smaller or larger than the original (0.4x .. 2.0x)
      let sizeScale = random(0.4, 2.0);
      brushSize *= sizeScale;

      let usedBrush = false;
      try {
        let BrushClass = window.Brush || window.P5Brush || window.p5Brush || (window.p5 && window.p5.Brush);

        if (BrushClass) {
          let brushInstance = null;
          try {
            if (typeof BrushClass === 'function') {
              try { brushInstance = new BrushClass(artLayer); } catch (e) { /* ignore */ }
              if (!brushInstance && typeof BrushClass.create === 'function') brushInstance = BrushClass.create(artLayer);
            }
            if (!brushInstance && typeof window.p5Brush === 'object' && typeof window.p5Brush.createBrush === 'function') {
              brushInstance = window.p5Brush.createBrush(artLayer);
            }
          } catch (e) { brushInstance = null; }

          if (brushInstance) {
            let baseRGB = Array.isArray(chosenColor) ? chosenColor.slice() : null;
            let jittered = baseRGB;
            if (baseRGB) {
              let hsl = rgbToHsl(baseRGB[0], baseRGB[1], baseRGB[2]);
              hsl.h += random(-5, 5);
              hsl.l = constrain(hsl.l + random(-4, 6), 6, 94);
              jittered = hslToRgb(hsl.h, hsl.s, hsl.l);
            }

            let rgba = null;
            if (Array.isArray(jittered)) rgba = `rgba(${jittered[0]},${jittered[1]},${jittered[2]},${(lastInk.alpha||BASE_ALPHA_MAX)/255})`;
            else rgba = chosenColor;

            let opts = {
              color: rgba,
              size: brushSize,
              wetness: 0.9,
              spread: 0.85,
              bleed: 0.9,
              scattering: 0.15,
              blend: 'multiply',
              field: { grain: GRAIN_DENSITY * 2.0 }
            };

            if (typeof brushInstance.paint === 'function') {
              try { console.log('[Aether Soft Modern] composite before brush paint:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              brushInstance.paint(x, y, opts);
              try { console.log('[Aether Soft Modern] composite after brush paint:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              usedBrush = true;
            } else if (typeof brushInstance.stroke === 'function') {
              try { console.log('[Aether Soft Modern] composite before brush stroke:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              brushInstance.stroke({ x, y, size: brushSize, color: rgba, options: opts });
              try { console.log('[Aether Soft Modern] composite after brush stroke:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              usedBrush = true;
            } else if (typeof brushInstance.draw === 'function') {
              try { console.log('[Aether Soft Modern] composite before brush draw:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              brushInstance.draw(x, y, opts);
              try { console.log('[Aether Soft Modern] composite after brush draw:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              usedBrush = true;
            } else if (typeof brushInstance === 'function') {
              try { console.log('[Aether Soft Modern] composite before brush func:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              brushInstance(x, y, opts);
              try { console.log('[Aether Soft Modern] composite after brush func:', artLayer && artLayer.drawingContext && artLayer.drawingContext.globalCompositeOperation); } catch (e) {}
              usedBrush = true;
            }
          }
        }
      } catch (e) {
        usedBrush = false;
      }

      if (!usedBrush) {
        artLayer.push();
        artLayer.noStroke();
        if (typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);

        let baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : null;

        // Ensure a visible organic blob is drawn first (fallback for missing brush libs)
        try {
          let blobSize = Math.max(8, brushSize * 0.6);
          if (baseCol) {
            // drawOrganicBlob expects (gfx, cx, cy, baseRadius, color, layers, verticalSquash)
            drawOrganicBlob(artLayer, x, y, blobSize, baseCol, 4, 0.75);
          } else {
            artLayer.fill(0, 0, 0, Math.floor((lastInk.alpha || BASE_ALPHA_MAX) * 0.28));
            artLayer.ellipse(x, y, blobSize * 1.4, blobSize * 1.4);
          }
        } catch (e) { /* non-fatal */ }
        // Stronger visible fallback: draw a semi-opaque ellipse to ensure the preset always shows marks
        try {
          let visAlpha = 120;
          if (Array.isArray(baseCol)) artLayer.fill(baseCol[0], baseCol[1], baseCol[2], visAlpha);
          else artLayer.fill(60, 60, 60, visAlpha);
          artLayer.ellipse(x, y, Math.max(12, brushSize * 0.9), Math.max(12, brushSize * 0.9));
        } catch (e) { /* ignore */ }

        try { console.log('[Aether Soft Modern] drew fallback blob at', x, y, 'brushSize=', brushSize); } catch (e) {}
        let speedNorm = constrain(speed / 0.6, 0, 1);
        let spread = SPREAD_SIGMA * (1 + (1 - speedNorm) * 1.2);

        let streamCount = Math.max(24, Math.floor(map(brushSize, 8, 400, 24, 160)));
        let totalDroplets = Math.floor(map(brushSize, 8, 400, 4000, 15000));

        let streamAllocation = Math.floor(totalDroplets * 0.78);
        let backgroundAllocation = Math.max(40, totalDroplets - streamAllocation);

        for (let s = 0; s < streamCount; s++) {
          let ang = random(0, TWO_PI);
          let originOffset = randomGaussian() * (brushSize * 0.12);
          let ox0 = x + cos(ang + PI/2) * originOffset;
          let oy0 = y + sin(ang + PI/2) * originOffset;

          let len = random(brushSize * 0.6, brushSize * 2.0) * (1 + (1 - speedNorm) * 0.9);
          let dropletsPerStream = Math.max(6, Math.floor(map(len, brushSize * 0.6, brushSize * 2.0, 8, 48)));

          for (let k = 0; k < dropletsPerStream; k++) {
            let t = (k / dropletsPerStream) + random(-0.06, 0.06);
            t = constrain(t, 0, 1);
            let px = ox0 + cos(ang) * (t * len + random(-len * 0.06, len * 0.06));
            let py = oy0 + sin(ang) * (t * len + random(-len * 0.06, len * 0.06));

            px += randomGaussian() * spread * 0.16;
            py += randomGaussian() * spread * 0.12;

            let psize = random(0.5, 3.0) * 200.0 * (typeof sizeScale === 'number' ? sizeScale : 1);
            let palpha = Math.floor(random(1, 5));

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

        for (let i = 0; i < backgroundAllocation; i++) {
          let ox = randomGaussian() * spread * 1.0;
          let oy = randomGaussian() * spread * 0.7;
          let sz = random(0.4, 2.2) * 200.0 * (typeof sizeScale === 'number' ? sizeScale : 1);
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

        if (baseCol) applyPigmentGrain(artLayer, x, y, spread * 0.9, baseCol);
        applyPaperGrain(artLayer, x, y, spread * 0.9, baseCol || [0,0,0]);

        artLayer.pop();
      }
    }
  };
})();