// Aether Soft Engine (named file): Isolated watercolor logic
window.AetherSoftEngine = (function() {
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
    let area = Math.PI * outerRadius * outerRadius;
    let count = Math.floor(area * (GRAIN_DENSITY * 0.12));
    count = Math.max(count, 40);
    gfx.noStroke();
    for (let i = 0; i < count; i++) {
      let r = Math.abs(randomGaussian() * (outerRadius * 0.6));
      let theta = random(0, TWO_PI);
      let gx = cx + Math.cos(theta) * r;
      let gy = cy + Math.sin(theta) * r * 0.9;
      let gs = random(1, 2);
      let a = Math.floor(random(2, 10));
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], a);
      else gfx.fill(color);
      gfx.ellipse(gx, gy, gs, gs);
    }
  }

  function applyPigmentGrain(gfx, cx, cy, outerRadius, color) {
    let area = Math.PI * outerRadius * outerRadius;
    let density = (typeof GRAIN_DENSITY === 'number') ? GRAIN_DENSITY : 0.006;
    if (density > 1) density = density * 0.01;
    let count = Math.floor(area * density);
    count = Math.max(count, 50);

    for (let i = 0; i < count; i++) {
      let r = Math.abs(randomGaussian() * (outerRadius * 0.5));
      let theta = random(0, TWO_PI);
      let gx = cx + Math.cos(theta) * r;
      let gy = cy + Math.sin(theta) * r * 0.85;
      let gs = random(0.4, 1.6);
      let a = Math.floor(random(4, 14));
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], a);
      else gfx.fill(color);
      gfx.noStroke();
      gfx.ellipse(gx, gy, gs, gs);
    }
  }

  let _buffer = null;

  function init(opts) {
    try {
      const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
      const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
      _buffer = createGraphics(w, h);
      try { if (typeof _buffer.clear === 'function') _buffer.clear(); } catch (e) {}
    } catch (e) { _buffer = null; }
  }

  function compose(target) {
    try {
      if (!_buffer || !target) return;
      if (typeof target.push === 'function') target.push();
      try { if (typeof target.blendMode === 'function') target.blendMode(BLEND); } catch (e) {}
      target.image(_buffer, 0, 0);
      try { if (typeof target.pop === 'function') target.pop(); } catch (e) {}
    } catch (e) { /* ignore */ }
  }

  function dispose() {
    try { if (_buffer && typeof _buffer.remove === 'function') _buffer.remove(); } catch (e) {}
    _buffer = null;
  }

  return {
    init,
    compose,
    dispose,
    execute: function(letter, x, y, chosenColor) {
      if (!_buffer) init();
      if (!_buffer) return;

      let artLayer = _buffer; // use internal buffer for all drawing
      try { if (artLayer && artLayer.drawingContext) artLayer.drawingContext.globalCompositeOperation = 'source-over'; } catch (e) { /* ignore */ }
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
              brushInstance.paint(x, y, opts);
              usedBrush = true;
            } else if (typeof brushInstance.stroke === 'function') {
              brushInstance.stroke({ x, y, size: brushSize, color: rgba, options: opts });
              usedBrush = true;
            } else if (typeof brushInstance.draw === 'function') {
              brushInstance.draw(x, y, opts);
              usedBrush = true;
            } else if (typeof brushInstance === 'function') {
              brushInstance(x, y, opts);
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
        let speedNorm = constrain(speed / 0.6, 0, 1);
        let spread = SPREAD_SIGMA * (1 + (1 - speedNorm) * 1.2);

        let streamCount = Math.max(24, Math.floor(map(brushSize, 8, 400, 24, 160)));
        let totalDroplets = Math.floor(map(brushSize, 8, 400, 4000, 15000));

        let streamAllocation = Math.floor(totalDroplets * 0.78);
        let backgroundAllocation = Math.max(40, totalDroplets - streamAllocation);

        for (let s = 0; s < streamCount; s++) {
          let ang = random(0, TWO_PI);
          let originOffset = randomGaussian() * (brushSize * 0.12);
          let ox0 = x + Math.cos(ang + PI/2) * originOffset;
          let oy0 = y + Math.sin(ang + PI/2) * originOffset;

          let len = random(brushSize * 0.6, brushSize * 2.0) * (1 + (1 - speedNorm) * 0.9);
          let dropletsPerStream = Math.max(6, Math.floor(map(len, brushSize * 0.6, brushSize * 2.0, 8, 48)));

          for (let k = 0; k < dropletsPerStream; k++) {
            let t = (k / dropletsPerStream) + random(-0.06, 0.06);
            t = constrain(t, 0, 1);
            let px = ox0 + Math.cos(ang) * (t * len + random(-len * 0.06, len * 0.06));
            let py = oy0 + Math.sin(ang) * (t * len + random(-len * 0.06, len * 0.06));

            px += randomGaussian() * spread * 0.16;
            py += randomGaussian() * spread * 0.12;

            let psize = random(0.5, 3.0) * 200.0;
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
          let sz = random(0.4, 2.2) * 200.0;
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