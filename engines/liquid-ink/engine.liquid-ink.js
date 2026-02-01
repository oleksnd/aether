// Liquid Ink Engine: Rectangular wet-on-wet between letters
window.LiquidInkEngine = (function () {
  const BUFFER_CLEAR = true;
  const LAYERS = 10;
  const SUBDIV_ITER = 5;
  const NOISE_SCALE = 0.008;
  const GRAIN_BASE = 250;

  // Internal blur and brush options
  const BLUR_RADIUS = 4;
  const ENABLE_BRUSH = true;
  const BRUSH_DENSITY = 0.75;
  const USE_EXTERNAL_P5_BRUSH = true;

  let _buffer = null;
  let _prev = { x: null, y: null, letter: null, size: 10 };

  function init(opts) {
    try {
      const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
      const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
      _buffer = createGraphics(w, h);
      // allow soft blending for ink accumulation
      try { if (typeof _buffer.clear === 'function' && BUFFER_CLEAR) _buffer.clear(); } catch (e) { }
      try { if (typeof _buffer.blendMode === 'function') _buffer.blendMode(MULTIPLY); } catch (e) { }
    } catch (e) { _buffer = null; }
  }

  function compose(target) {
    try {
      if (!_buffer || !target) return;
      if (typeof target.push === 'function') target.push();
      try { if (typeof target.blendMode === 'function') target.blendMode(BLEND); } catch (e) { }
      target.image(_buffer, 0, 0);
      try { if (typeof target.pop === 'function') target.pop(); } catch (e) { }
    } catch (e) { /* ignore */ }
  }

  function dispose() {
    try { if (_buffer && typeof _buffer.remove === 'function') _buffer.remove(); } catch (e) { }
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

  function drawOrganicShape(gfx, x, y, size, color, alpha) {
    gfx.push();
    gfx.fill(color[0], color[1], color[2], alpha);
    gfx.noStroke();
    let vertices = 12;
    gfx.beginShape();
    for (let i = 0; i < vertices; i++) {
      let ang = map(i, 0, vertices, 0, TWO_PI);
      let r = size * (0.8 + noise(x * 0.01, y * 0.01, i * 0.2) * 0.4);
      gfx.vertex(x + cos(ang) * r, y + sin(ang) * r);
    }
    gfx.endShape(CLOSE);
    gfx.pop();
  }

  function drawDot(gfx, cx, cy, color, baseSize) {
    gfx.push();
    let steps = 4;
    for (let l = 0; l < steps; l++) {
      let s = baseSize * (1.1 - l * 0.2 + random(-0.1, 0.1));
      let a = Math.floor(map(l, 0, steps - 1, 80, 5));
      drawOrganicShape(gfx, cx + randomGaussian() * 2, cy + randomGaussian() * 2, s, color, a);
    }
    gfx.pop();
  }

  function drawDrip(gfx, x, y, color, size) {
    gfx.push();
    gfx.noStroke();
    let len = random(size * 2.0, size * 5.0);
    let steps = Math.floor(len / 2.5);
    let alpha = random(15, 45);
    for (let i = 0; i < steps; i++) {
      let t = i / steps;
      let r = size * (1 - t * 0.4) * random(0.7, 1.2);
      let px = x + randomGaussian() * 1.5;
      let py = y + i * 2.5; // drip downwards
      gfx.fill(color[0], color[1], color[2], alpha * (1 - t));
      gfx.ellipse(px, py, r, r);
    }
    gfx.pop();
  }

  function drawSplatter(gfx, x, y, color, intensity) {
    gfx.push();
    gfx.noStroke();
    let count = Math.floor(random(8, 20) * intensity);
    for (let i = 0; i < count; i++) {
      let r = randomGaussian() * 25 * intensity;
      let ang = random(TWO_PI);
      let px = x + cos(ang) * r;
      let py = y + sin(ang) * r;
      let sz = random(0.5, 4) * intensity;
      let a = random(10, 130);
      gfx.fill(color[0], color[1], color[2], a);
      gfx.ellipse(px, py, sz, sz);
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
    let dx = x2 - x1, dy = y2 - y1;
    let distVal = sqrt(dx * dx + dy * dy) || 1;

    // MASSIVE thickness for true flooding/spilling effect
    let baseThickness = map(constrain(distVal, 10, 400), 10, 400, 120, 50);
    // Apply global thickness multiplier
    let thicknessFactor = (typeof window.LIQUID_INK_THICKNESS === 'number') ? window.LIQUID_INK_THICKNESS : ((typeof window.BRUSH_THICKNESS === 'number') ? window.BRUSH_THICKNESS : 1);
    baseThickness *= thicknessFactor;

    // Normal vector
    let nx = -dy / distVal;
    let ny = dx / distVal;

    // Build path with "turbulent surging" and "breaks"
    let segments = Math.max(5, Math.floor(distVal / 10));
    let path = [];
    let isBroken = false;

    for (let i = 0; i <= segments; i++) {
      let t = i / segments;
      let px = lerp(x1, x2, t);
      let py = lerp(y1, y2, t);

      // "Break" logic: sometimes the liquid stops flowing and starts again (splatter gap)
      let turbulence = noise(px * 0.02, py * 0.02, i * 0.1);
      if (random() < 0.05) isBroken = !isBroken;

      // if broken, thickness is 0 (invisible connection)
      let surge = isBroken ? 0 : (0.2 + turbulence * 2.0); // very varied surge

      // EXTREME wobble for wide spread
      let wobble = (noise(px * 0.01, py * 0.01, 100) - 0.5) * baseThickness * 5.0;
      path.push({ x: px + nx * wobble, y: py + ny * wobble, t: t, surge: surge });
    }

    // Create organic thick poly from path - handle breaks by drawing sub-polys
    // For simplicity in this engine, we just modulate thickness to 0 which creates a pinch
    // A better approach is drawing separate blobs for disconnected parts

    let poly = [];
    for (let i = 0; i < path.length; i++) {
      let thick = baseThickness * path[i].surge * (0.5 + noise(path[i].x * 0.05, path[i].y * 0.05) * 1.0);
      poly.push({ x: path[i].x + nx * thick, y: path[i].y + ny * thick });
    }
    for (let i = path.length - 1; i >= 0; i--) {
      let thick = baseThickness * path[i].surge * (0.5 + noise(path[i].x * 0.05, path[i].y * 0.05) * 1.0);
      poly.push({ x: path[i].x - nx * thick, y: path[i].y - ny * thick });
    }

    // deform edges aggressively
    let noisy = subdivideDeform(poly, SUBDIV_ITER, baseThickness * 3.0, NOISE_SCALE);

    gfx.push();
    // Direct drawing to gfx
    for (let layer = 0; layer < LAYERS; layer++) {
      let t = layer / (LAYERS - 1);
      let scale = map(t, 0, 1, 0.95, 1.05);
      let alpha = Math.floor(map(1 - t, 0, 1, 3, 55));
      gfx.noStroke();
      gfx.fill(color[0], color[1], color[2], alpha);

      gfx.beginShape();
      for (let p of noisy) {
        let ns = noise(p.x * 0.03, p.y * 0.03, layer * 0.2);
        gfx.vertex(p.x + (ns - 0.5) * baseThickness * 0.3, p.y + (ns - 0.5) * baseThickness * 0.3);
      }
      gfx.endShape(CLOSE);
    }

    // Occasional "leaks" or longer runs from the noisy poly
    if (random() > 0.6) {
      let leakIdx = Math.floor(random(noisy.length));
      let leakPt = noisy[leakIdx];
      drawSplatter(gfx, leakPt.x, leakPt.y, color, 1.0);
      if (random() > 0.4) drawDrip(gfx, leakPt.x, leakPt.y, color, baseThickness * 0.5);
    }

    // Pigment edge-darkening (drying fringe) - wider
    let dark = darkerColor(color, 0.4);
    gfx.noFill();
    for (let e = 0; e < 2; e++) {
      gfx.strokeWeight(random(0.6, 2.0));
      gfx.stroke(dark[0], dark[1], dark[2], random(15, 40));
      gfx.beginShape();
      for (let p of noisy) {
        gfx.vertex(p.x + randomGaussian() * 2, p.y + randomGaussian() * 2);
      }
      gfx.endShape(CLOSE);
    }

    // MASSIVE satellite splatters and large puddles along path
    let splatterChance = distVal * 0.3; // doubled frequency
    let count = Math.floor(splatterChance);
    if (random() < (splatterChance - count)) count++;

    for (let i = 0; i < count; i++) {
      if (random() > 0.2) {
        let t = random();
        let off = random(-4.0, 4.0) * baseThickness; // much wider spread
        let sx = lerp(x1, x2, t) + nx * off + randomGaussian() * 15;
        let sy = lerp(y1, y2, t) + ny * off + randomGaussian() * 15;

        // Much larger organic shapes
        if (random() > 0.3) {
          drawOrganicShape(gfx, sx, sy, random(10, 35), color, random(15, 70));
        } else {
          drawSplatter(gfx, sx, sy, color, random(0.8, 2.0));
        }
      }
    }

    // Add random LARGE puddles along the path
    if (random() > 0.6) {
      let t = random();
      let px = lerp(x1, x2, t) + randomGaussian() * baseThickness;
      let py = lerp(y1, y2, t) + randomGaussian() * baseThickness;
      drawDot(gfx, px, py, color, random(30, 80));
    }

    gfx.pop();
    return baseThickness;
  }

  return {
    init,
    compose,
    dispose,
    execute: function (letter, x, y, chosenColor) {
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
        // Continuous flow - pure segment drawing
        drawDeformedRect(art, _prev.x, _prev.y, x, y, col);

        // Frequent large pooling 
        let stepDist = dist(_prev.x, _prev.y, x, y);
        // More frequent and larger pools
        if (random() > 0.7) {
          drawDot(art, x, y, col, random(40, 90));
          if (random() > 0.6) drawSplatter(art, x, y, col, 2.5);
        }
      } else {
        // First point: HUGE initial spill
        drawDot(art, x, y, col, 80);
        drawSplatter(art, x, y, col, 4.0);
        // Multiple drips from start
        for (let j = 0; j < 5; j++) {
          drawDrip(art, x + random(-30, 30), y, col, random(15, 25));
        }
      }

      _prev.x = x; _prev.y = y; _prev.letter = letter;

      art.pop();
    }
  };
})();