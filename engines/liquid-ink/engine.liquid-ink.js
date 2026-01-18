// Liquid Ink Engine: Rectangular wet-on-wet between letters
window.LiquidInkEngine = (function() {
  const BUFFER_CLEAR = true;
  const LAYERS = 7; // watercolor layering
  const SUBDIV_ITER = 3;
  const NOISE_SCALE = 0.02;
  const GRAIN_BASE = 120; // base pigment grain count multiplier

  // Internal blur and brush options
  const ENABLE_INTERNAL_BLUR = true; // apply mild blur to simulate bleeding
  const BLUR_RADIUS = 6; // p5 `filter(BLUR, n)` radius (try 2 - 8)
  const BLUR_PASSES = 1; // passes of blur
  const DEBUG_COMPARE = false; // if true, draw before/after side-by-side

  const ENABLE_BRUSH = true; // draw small brush strokes on the fringe
  const BRUSH_DENSITY = 0.6; // 0.0 - 1.0 density
  const USE_EXTERNAL_P5_BRUSH = true; // if p5.brush available, use it for richer texture

  let _buffer = null;
  // remember previous letter/position so we can draw rectangles between letters
  let _prev = { x: null, y: null, letter: null };

  function init(opts) {
    try {
      const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
      const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
      _buffer = createGraphics(w, h);
      // allow soft blending for ink accumulation
      try { if (typeof _buffer.clear === 'function' && BUFFER_CLEAR) _buffer.clear(); } catch (e) {}
      try { if (typeof _buffer.blendMode === 'function') _buffer.blendMode(MULTIPLY); } catch (e) {}
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
    _prev = { x: null, y: null, letter: null };
  }

  // subdivide + deform an edge-based polygon to make organic edges
  function subdivideDeform(points, iterations, dispScale, noiseScale) {
    for (let it = 0; it < iterations; it++) {
      let newPts = [];
      for (let i = 0; i < points.length; i++) {
        let a = points[i];
        let b = points[(i + 1) % points.length];
        newPts.push(a);

        let mx = (a.x + b.x) / 2;
        let my = (a.y + b.y) / 2;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let len = sqrt(dx * dx + dy * dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;

        let n = noise(mx * noiseScale, my * noiseScale, it * 0.11);
        let disp = map(n, 0, 1, -dispScale, dispScale);
        disp += randomGaussian() * (dispScale * 0.08);

        let mx2 = mx + nx * disp;
        let my2 = my + ny * disp;

        newPts.push({ x: mx2, y: my2 });
      }
      points = newPts;
      dispScale *= 0.55;
    }
    return points;
  }

  // simple point-in-polygon (ray casting)
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      let xi = poly[i].x, yi = poly[i].y;
      let xj = poly[j].x, yj = poly[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function darkerColor(col, factor) {
    if (!Array.isArray(col)) return col;
    return [Math.max(0, Math.floor(col[0] * factor)), Math.max(0, Math.floor(col[1] * factor)), Math.max(0, Math.floor(col[2] * factor))];
  }

  function drawDot(gfx, cx, cy, color, baseSize) {
    gfx.push();
    gfx.noStroke();
    for (let l = 0; l < 3; l++) {
      let s = baseSize * (1 + l * 0.2 + random(-0.06, 0.06));
      let a = Math.floor(map(l, 0, 2, 140, 18) * (0.6 + random(-0.12, 0.12)));
      gfx.fill(color[0], color[1], color[2], a);
      gfx.ellipse(cx + randomGaussian() * baseSize * 0.06, cy + randomGaussian() * baseSize * 0.06, s, s * random(0.7, 1.0));
    }
    gfx.pop();
  }

  function drawBrushStroke(gfx, poly, color) {
    // Improved brush: elongated tapered strokes along edges, with perpendicular smear and soft shadows
    if (!ENABLE_BRUSH) return;

    // Access native 2D context for shadow-based softening
    let ctx = gfx.drawingContext;

    for (let i = 0; i < poly.length; i++) {
      let a = poly[i];
      let b = poly[(i + 1) % poly.length];
      let dx = b.x - a.x, dy = b.y - a.y;
      let segLen = sqrt(dx * dx + dy * dy) || 1;
      let dirAngle = atan2(dy, dx);
      // normal vector (perpendicular)
      let nx = -dy / segLen;
      let ny = dx / segLen;

      // number of strokes scales with segment length and BRUSH_DENSITY
      let strokeCount = Math.max(2, Math.floor(segLen * 0.02 * (1 + BRUSH_DENSITY * 3)));

      for (let s = 0; s < strokeCount; s++) {
        // sample along the segment
        let t0 = random(0.05, 0.95);
        let startX = a.x + dx * t0 + nx * randomGaussian() * segLen * 0.01;
        let startY = a.y + dy * t0 + ny * randomGaussian() * segLen * 0.01;

        // stroke parameters
        let strokeLen = Math.max(6, Math.min(segLen * random(0.12, 0.5), segLen));
        let strokeSteps = Math.max(3, Math.floor(strokeLen * 0.25));
        let baseWidth = Math.max(3, Math.round(4 + BRUSH_DENSITY * 8 * random(0.6, 1.2)));
        let baseAlpha = Math.floor(30 + BRUSH_DENSITY * 120 * random(0.6, 1.0));

        // shadow to soften edges and create a wet look
        if (ctx) {
          ctx.save();
          ctx.shadowColor = `rgba(${color[0]},${color[1]},${color[2]},${Math.min(0.4, baseAlpha / 255)})`;
          ctx.shadowBlur = Math.max(4, baseWidth * 1.2);
        }

        // draw overlapping ellipses along the stroke direction to emulate a dragged brush
        for (let u = 0; u < strokeSteps; u++) {
          let t = u / (strokeSteps - 1);
          // taper the width and alpha towards end
          let taper = 1 - t * (0.85 + random(0, 0.1));
          let px = startX + Math.cos(dirAngle) * strokeLen * t + nx * randomGaussian() * baseWidth * 0.18;
          let py = startY + Math.sin(dirAngle) * strokeLen * t + ny * randomGaussian() * baseWidth * 0.18;
          let w = baseWidth * (0.6 + taper * 1.4) * (1 + random(-0.12, 0.12));
          let h = w * random(0.35, 0.92);
          let aAlpha = Math.floor(baseAlpha * taper * (0.6 + random(-0.12, 0.12)));

          gfx.noStroke();
          gfx.fill(color[0], color[1], color[2], aAlpha);

          gfx.push();
          gfx.translate(px, py);
          gfx.rotate(dirAngle + random(-0.2, 0.2));
          gfx.ellipse(0, 0, w, h);
          gfx.pop();
        }

        if (ctx) ctx.restore();

        // add perpendicular smear: a few small, faint ellipses offset along normal to simulate liquid spreading
        let smearCount = Math.max(1, Math.floor(2 * BRUSH_DENSITY));
        for (let m = 0; m < smearCount; m++) {
          let ox = (random(-1, 1) * baseWidth * 0.6);
          let oy = (random(-1, 1) * baseWidth * 0.6);
          let sx = startX + nx * ox + cos(dirAngle) * random(0, strokeLen * 0.2);
          let sy = startY + ny * oy + sin(dirAngle) * random(0, strokeLen * 0.2);
          let sw = baseWidth * random(0.4, 1.2);
          let sa = Math.floor(baseAlpha * 0.15 * (0.8 + random(-0.2, 0.2)));
          gfx.noStroke();
          gfx.fill(color[0], color[1], color[2], sa);
          gfx.push(); gfx.translate(sx, sy); gfx.rotate(dirAngle + random(-1.2, 1.2)); gfx.ellipse(0, 0, sw, sw * random(0.5, 1.2)); gfx.pop();
        }
      }
    }
  }

  function drawDeformedRect(gfx, x1, y1, x2, y2, color) {
    // build axis-aligned rectangle with corners at the two points
    let minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    let minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

    // small guard: if points are extremely close, draw a dot instead
    let dx = maxX - minX, dy = maxY - minY;
    let diag = sqrt(dx * dx + dy * dy) || 1;
    let baseRadius = Math.max(10, diag * 0.12);

    // initial polygon (clockwise)
    let poly = [ {x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY} ];

    // deform edges
    let disp = baseRadius * 1.6;
    let noisy = subdivideDeform(poly, SUBDIV_ITER, disp, NOISE_SCALE);

    // center for scaling (simulate bleed)
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2;

    // draw to temporary graphics so we can blur separately
    let w = Math.max(64, Math.ceil(maxX - minX + baseRadius * 2));
    let h = Math.max(64, Math.ceil(maxY - minY + baseRadius * 2));
    let tmp = createGraphics(w, h);
    try {
      tmp.push();
      tmp.translate(-minX + baseRadius, -minY + baseRadius); // align polygon into tmp

      // layered fills (inner-to-outer)
      for (let layer = 0; layer < LAYERS; layer++) {
        let t = layer / (LAYERS - 1);
        let scale = map(t, 0, 1, 0.86, 1.08);
        let alpha = Math.floor(map(1 - t, 0, 1, 18, 200) * (0.7 + random(-0.06, 0.06)));
        tmp.noStroke();
        tmp.fill(color[0], color[1], color[2], alpha);

        tmp.beginShape();
        for (let p of noisy) {
          let sx = cx + (p.x - cx) * scale + randomGaussian() * baseRadius * 0.01 * (1 - t);
          let sy = cy + (p.y - cy) * scale + randomGaussian() * baseRadius * 0.01 * (1 - t);
          tmp.vertex(sx, sy);
        }
        tmp.endShape(CLOSE);
      }

      // brush strokes (pre-blur) for wet-on-wet edges
      if (ENABLE_BRUSH) {
        // Prefer external p5.brush if available for richer textures
        let usedExternal = false;
        if (USE_EXTERNAL_P5_BRUSH) {
          try {
            // Detect available brush APIs and log status for debugging
            let found = {
              Brush: typeof window.Brush !== 'undefined',
              P5Brush: typeof window.P5Brush !== 'undefined',
              p5Brush: typeof window.p5Brush !== 'undefined',
              p5: typeof window.p5 !== 'undefined'
            };
            try { console.log('[LiquidInk] p5.brush availability', found); } catch(e){}

            let BrushClass = window.Brush || window.P5Brush || (window.p5 && window.p5.Brush);
            let brushInstance = null;

            // Try constructing / creating with tmp first
            if (BrushClass) {
              try { brushInstance = new BrushClass(tmp); } catch (e) { try { brushInstance = BrushClass.create ? BrushClass.create(tmp) : null; } catch (e2) {} }
            }

            // Try window.p5Brush.createBrush(tmp)
            if (!brushInstance && typeof window.p5Brush === 'object' && typeof window.p5Brush.createBrush === 'function') {
              try { brushInstance = window.p5Brush.createBrush(tmp); } catch (e) { try { brushInstance = window.p5Brush.createBrush(); } catch (e2) {} }
            }

            // If still not available, try creating brush bound to the main engine buffer (older libs expect the p5 init layer)
            if (!brushInstance) {
              try {
                if (BrushClass && typeof BrushClass === 'function') {
                  brushInstance = new BrushClass(_buffer);
                }
              } catch (e) {}
              try {
                if (!brushInstance && typeof window.p5Brush === 'object' && typeof window.p5Brush.createBrush === 'function') {
                  brushInstance = window.p5Brush.createBrush(_buffer);
                }
              } catch (e) {}
            }

            // Log what we got
            try { console.log('[LiquidInk] brushInstance created?', !!brushInstance, brushInstance); } catch (e) {}

            if (brushInstance) {
              // Build color string and brush options tailored for liquid ink
              let baseRGB = Array.isArray(color) ? color.slice() : [0,0,0];
              let rgba = `rgba(${baseRGB[0]},${baseRGB[1]},${baseRGB[2]},${0.85})`;

              let opts = {
                color: rgba,
                size: Math.max(6, Math.round((Math.max(tmp.width, tmp.height) * 0.004) * (1 + BRUSH_DENSITY))),
                wetness: 0.95,
                spread: 0.92,
                bleed: 0.92,
                scattering: 0.16,
                blend: 'multiply',
                field: { grain: (GRAIN_BASE * 0.01) },
                opacity: 0.9
              };

              // Helper to attempt a call and log if it fails
              function tryCall(fn, ...args) {
                try { return { ok: true, res: fn(...args) }; } catch (e) { try { console.warn('[LiquidInk] brush call failed', e); } catch (e2) {} return { ok: false, err: e }; }
              }

              // Use stroke/paint/draw as available, apply along edges and some interior points
              if (typeof brushInstance.paint === 'function') {
                tryCall(() => { for (let p = 0; p < 3 + Math.floor(BRUSH_DENSITY * 4); p++) { let rx = cx + randomGaussian() * (diag * 0.06); let ry = cy + randomGaussian() * (diag * 0.06); brushInstance.paint(rx, ry, opts); } });

                tryCall(() => { for (let i = 0; i < noisy.length; i++) { let a = noisy[i]; let b = noisy[(i+1) % noisy.length]; let steps = Math.max(3, Math.floor(dist(a.x,a.y,b.x,b.y) * 0.04)); for (let s = 0; s < steps; s++) { let t = s / (steps-1 || 1); let px = lerp(a.x, b.x, t) + randomGaussian() * (diag * 0.004); let py = lerp(a.y, b.y, t) + randomGaussian() * (diag * 0.004); if (brushInstance.stroke) brushInstance.stroke({ x: px, y: py, size: opts.size, color: opts.color, options: opts }); else if (brushInstance.draw) brushInstance.draw(px, py, opts); else brushInstance(px, py, opts); } } });

                usedExternal = true;
              } else if (typeof brushInstance.stroke === 'function') {
                tryCall(() => { for (let i = 0; i < noisy.length; i++) { let a = noisy[i]; let b = noisy[(i+1) % noisy.length]; let steps = Math.max(3, Math.floor(dist(a.x,a.y,b.x,b.y) * 0.04)); for (let s = 0; s < steps; s++) { let t = s / (steps-1 || 1); let px = lerp(a.x, b.x, t) + randomGaussian() * (diag * 0.004); let py = lerp(a.y, b.y, t) + randomGaussian() * (diag * 0.004); brushInstance.stroke({ x: px, y: py, size: opts.size, color: opts.color, options: opts }); } } });
                usedExternal = true;
              } else if (typeof brushInstance.draw === 'function') {
                tryCall(() => { for (let p = 0; p < 4 + Math.floor(BRUSH_DENSITY * 6); p++) { let rx = cx + randomGaussian() * (diag * 0.06); let ry = cy + randomGaussian() * (diag * 0.06); brushInstance.draw(rx, ry, opts); } });
                usedExternal = true;
              } else if (typeof brushInstance === 'function') {
                tryCall(() => { for (let p = 0; p < 3; p++) { let rx = cx + randomGaussian() * (diag * 0.06); let ry = cy + randomGaussian() * (diag * 0.06); brushInstance(rx, ry, opts); } });
                usedExternal = true;
              }
            }
          } catch (e) { console.warn('[LiquidInk] external brush error', e); }
        }

        // fallback to internal brush if external not used
        if (!usedExternal) drawBrushStroke(tmp, noisy, color);
      }

      // fringe: a darker irregular outline
      let dark = darkerColor(color, 0.6);
      tmp.noStroke();
      for (let e = 0; e < 2; e++) {
        let alpha = Math.floor(map(e, 0, 1, 80, 24));
        tmp.fill(dark[0], dark[1], dark[2], alpha);
        tmp.beginShape();
        for (let p of noisy) {
          let r = 1 + e * 4 + random(-2, 2);
          let vx = cx + (p.x - cx) * (1 + 0.004 * r) + noise(p.x * 0.01, p.y * 0.01, e * 10) * r;
          let vy = cy + (p.y - cy) * (1 + 0.004 * r) + noise(p.y * 0.01, p.x * 0.01, e * 20) * r;
          tmp.vertex(vx, vy);
        }
        tmp.endShape(CLOSE);
      }

      // pigment grain (random dots inside polygon)
      let bboxArea = (maxX - minX) * (maxY - minY);
      let grainCount = Math.max(30, Math.floor((bboxArea / 1000) * (GRAIN_BASE * 0.02)));
      for (let i = 0; i < grainCount; i++) {
        let gx = random(minX - baseRadius * 0.5, maxX + baseRadius * 0.5);
        let gy = random(minY - baseRadius * 0.5, maxY + baseRadius * 0.5);
        if (!pointInPoly(gx, gy, noisy)) continue;
        let gs = random(0.3, 2.2);
        let a = Math.floor(random(5, 28));
        tmp.fill(color[0], color[1], color[2], a);
        tmp.noStroke();
        tmp.ellipse(gx + randomGaussian() * 0.6, gy + randomGaussian() * 0.6, gs, gs);
      }

      tmp.pop();

      // create blurred copy if enabled
      let final = tmp;
      let blurred = null;
      if (ENABLE_INTERNAL_BLUR && typeof tmp.filter === 'function') {
        blurred = createGraphics(w, h);
        blurred.image(tmp, 0, 0);
        for (let p = 0; p < BLUR_PASSES; p++) {
          try { blurred.filter(BLUR, BLUR_RADIUS); } catch (e) { /* ignore if filter not available */ }
        }
      } else if (ENABLE_INTERNAL_BLUR) {
        // fallback: simple multi-draw soften
        blurred = createGraphics(w, h);
        blurred.noStroke();
        for (let i = 0; i < 6; i++) blurred.image(tmp, random(-1,1), random(-1,1));
      }

      // composite onto main gfx — support debug comparison
      if (DEBUG_COMPARE && blurred) {
        // left: original, right: blurred
        let offset = diag * 0.5 + 8;
        gfx.image(tmp, minX - offset, minY - baseRadius);
        gfx.image(blurred, minX + offset, minY - baseRadius);
        // small divider
        gfx.push(); gfx.stroke(0, 0, 0, 60); gfx.strokeWeight(1); gfx.line(minX, minY - baseRadius, minX, minY + baseRadius); gfx.pop();
      } else if (blurred) {
        gfx.image(blurred, minX - baseRadius, minY - baseRadius);
      } else {
        gfx.image(tmp, minX - baseRadius, minY - baseRadius);
      }

      // cleanup
      try { if (tmp && typeof tmp.remove === 'function') tmp.remove(); } catch (e) {}
      try { if (blurred && typeof blurred.remove === 'function') blurred.remove(); } catch (e) {}

    } catch (e) {
      // fallback drawing directly if tmp fails
      console.error('[LiquidInk] drawDeformedRect error', e);
      // fallback to original simple drawing
      for (let layer = 0; layer < LAYERS; layer++) {
        let t = layer / (LAYERS - 1);
        let scale = map(t, 0, 1, 0.86, 1.08);
        let alpha = Math.floor(map(1 - t, 0, 1, 18, 200) * (0.7 + random(-0.06, 0.06)));
        gfx.noStroke();
        gfx.fill(color[0], color[1], color[2], alpha);

        gfx.beginShape();
        for (let p of noisy) {
          let sx = cx + (p.x - cx) * scale + randomGaussian() * baseRadius * 0.01 * (1 - t);
          let sy = cy + (p.y - cy) * scale + randomGaussian() * baseRadius * 0.01 * (1 - t);
          gfx.vertex(sx, sy);
        }
        gfx.endShape(CLOSE);
      }
    }

    return baseRadius;
  }

  return {
    init,
    compose,
    dispose,
    execute: function(letter, x, y, chosenColor) {
      if (!_buffer) init();
      if (!_buffer) return;

      let art = _buffer;
      art.push();

      // normalize color
      let col = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

      // if whitespace or control character — reset chain
      if (!letter || (typeof letter === 'string' && letter.trim() === '')) {
        _prev = { x: null, y: null, letter: null };
        art.pop();
        return;
      }

      // if we have a previous letter, draw rectangle between prev and this letter
      if (_prev && _prev.x !== null) {
        // draw small anchor dots on corner letters
        drawDot(art, _prev.x, _prev.y, col, 8);
        drawDot(art, x, y, col, 8);

        // draw deformed rectangle fill + fringe + grain
        drawDeformedRect(art, _prev.x, _prev.y, x, y, col);
      } else {
        // first letter in sequence: draw a small puddle at the letter
        drawDot(art, x, y, col, 12);
      }

      // update prev anchor to this letter so next call will make next rectangle
      _prev.x = x; _prev.y = y; _prev.letter = letter;

      art.pop();
    }
  };
})();