// Fractal Geometry Engine - geometric abstraction with expressive marks
// Style: geometric forms + abstract expressionism (gestural smears, drips, grain)
window.FractalGeomEngine = (function() {
  const MAX_NODES = 160;
  const MAX_DEPTH = 3;
  const GRAIN_DENSITY = 0.002; // fraction of area

  let _buffer = null;
  let _nodes = [];
  let _prev = { x: null, y: null, time: 0 };

  function init(opts) {
    try {
      const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
      const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
      const forceClear = opts && opts.forceClear;

      if (!_buffer || _buffer.width !== w || _buffer.height !== h) {
        if (_buffer) _buffer.remove();
        _buffer = createGraphics(w, h);
        try { if (typeof _buffer.clear === 'function') _buffer.clear(); } catch (e) { /* ignore */ }
      } else if (forceClear && _buffer) {
        try { if (typeof _buffer.clear === 'function') _buffer.clear(); } catch (e) { /* ignore */ }
      }
    } catch (e) { _buffer = null; }
  }

  function compose(target) {
    try {
      if (!_buffer || !target) return;
      // subtle overlay so geometric forms can sit over canvas
      if (typeof target.push === 'function') target.push();
      try { if (typeof target.blendMode === 'function') target.blendMode(MULTIPLY); } catch (e) {}
      target.image(_buffer, 0, 0);
      try { if (typeof target.pop === 'function') target.pop(); } catch (e) {}
    } catch (e) { /* ignore */ }
  }

  function dispose() {
    try { if (_buffer && typeof _buffer.remove === 'function') _buffer.remove(); } catch (e) {}
    _buffer = null;
    _nodes = [];
    _prev = { x: null, y: null, time: 0 };
  }

  // utility: polygon vertex positions
  function polygonVerts(cx, cy, radius, sides, rot) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * TWO_PI;
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    return pts;
  }

  // draw a single geometric primitive with depth recursion
  function drawFractal(gfx, x, y, size, rot, depth, baseColor) {
    if (size < 6 || depth <= 0) return;

    gfx.push();
    // choose shape type depending on depth and randomness
    const choices = ['triangle', 'hex', 'circle', 'star'];
    const shape = choices[Math.floor(random(0, choices.length))];

    let alpha = Math.floor(map(depth, 0, MAX_DEPTH, 35, 220));
    const col = Array.isArray(baseColor) ? baseColor.slice() : [40,40,40];

    // jitter color slightly
    if (Array.isArray(col)) {
      col[0] = constrain(col[0] + random(-18, 18), 0, 255);
      col[1] = constrain(col[1] + random(-18, 18), 0, 255);
      col[2] = constrain(col[2] + random(-18, 18), 0, 255);
    }

    gfx.translate(x, y);
    gfx.rotate(rot + random(-0.35, 0.35));

    // fill with noisy hatch to create painterly texture
    if (shape === 'circle') {
      gfx.noStroke();
      for (let i = 0; i < 4; i++) {
        const r = size * random(0.6, 1.0) * (1 + i * 0.08);
        const a = Math.floor(alpha * random(0.5, 1));
        if (Array.isArray(col)) gfx.fill(col[0], col[1], col[2], a);
        else gfx.fill(col);
        gfx.ellipse(0, 0, r, r * random(0.85, 1.15));
      }
    } else {
      const sides = (shape === 'triangle') ? 3 : (shape === 'hex' ? 6 : 5);
      const verts = polygonVerts(0,0,size * random(0.75,1.05), sides, 0);
      gfx.noStroke();
      // layered fills
      for (let layer = 0; layer < 3; layer++) {
        const scale = map(layer, 0, 2, 0.92, 1.02);
        const a = Math.floor(alpha * map(1 - layer, 0, 1, 0.25, 1));
        if (Array.isArray(col)) gfx.fill(col[0], col[1], col[2], a);
        else gfx.fill(col);
        gfx.beginShape();
        for (let v of verts) gfx.vertex(v.x * scale, v.y * scale);
        gfx.endShape(CLOSE);
      }
    }

    // expressive smear: a radial smear with heavy alpha and rotation
    if (random() < 0.5) {
      gfx.noStroke();
      const smearCount = Math.floor(map(size, 6, 240, 2, 8));
      for (let s = 0; s < smearCount; s++) {
        const ang = random(TWO_PI);
        const rx = Math.cos(ang) * random(size * 0.2, size * 0.9);
        const ry = Math.sin(ang) * random(size * 0.2, size * 0.5);
        const w = random(size * 0.08, size * 0.35);
        const h = w * random(0.4, 1.2);
        const a = Math.floor(alpha * random(0.06, 0.22));
        if (Array.isArray(col)) gfx.fill(col[0], col[1], col[2], a);
        else gfx.fill(col);
        gfx.push();
        gfx.translate(rx, ry);
        gfx.rotate(random(-1.2, 1.2));
        gfx.ellipse(0, 0, w, h);
        gfx.pop();
      }
    }

    // recursively spawn small shapes at vertices
    if (depth > 0) {
      const spawn = Math.max(1, Math.floor(map(depth, 0, MAX_DEPTH, 1, 4)));
      const verts = polygonVerts(0,0,size * 0.6, 3 + Math.floor(random(0,4)), 0);
      for (let i = 0; i < spawn; i++) {
        const v = verts[i % verts.length];
        const nx = v.x + randomGaussian() * (size * 0.08);
        const ny = v.y + randomGaussian() * (size * 0.06);
        const nsize = size * map(random(), 0, 1, 0.25, 0.6);
        drawFractal(gfx, nx, ny, nsize, rot + random(-0.6,0.6), depth - 1, baseColor);
      }
    }

    gfx.pop();
  }

  function applyGrain(gfx) {
    try {
      const area = gfx.width * gfx.height;
      const count = Math.floor(area * GRAIN_DENSITY);
      gfx.push();
      gfx.noStroke();
      for (let i = 0; i < count; i++) {
        const x = random(gfx.width);
        const y = random(gfx.height);
        const a = Math.floor(random(6, 18));
        gfx.fill(0, 0, 0, a);
        gfx.ellipse(x, y, random(0.6, 1.6), random(0.6, 1.6));
      }
      gfx.pop();
    } catch (e) { /* ignore */ }
  }

  function makeDrip(gfx, x, y, color, size) {
    gfx.push();
    gfx.noStroke();
    const len = random(size * 0.8, size * 3.6);
    const steps = Math.max(5, Math.floor(len / 6));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = x + noise(i * 0.03, x * 0.01) * 8 - 4;
      const py = y + t * len + random(-1, 2) * (size * 0.02);
      const r = Math.max(1, size * (1 - t) * random(0.08, 0.22));
      const a = Math.floor(140 * (1 - t) * random(0.3, 1));
      if (Array.isArray(color)) gfx.fill(color[0], color[1], color[2], a);
      else gfx.fill(color);
      gfx.ellipse(px, py, r, r);
    }
    gfx.pop();
  }

  return {
    init,
    compose,
    dispose,
    execute: function(letter, x, y, chosenColor) {
      if (!_buffer) init();
      if (!_buffer) return;

      const now = millis();
      const dt = _prev.time ? (now - _prev.time) : 0;
      const distFromLast = (_prev.x !== null) ? dist(x, y, _prev.x, _prev.y) : 0;
      const speed = dt > 0 ? (distFromLast / dt) : 0;

      // reset on whitespace
      if (!letter || (typeof letter === 'string' && letter.trim() === '')) {
        _nodes = [];
        _prev = { x: null, y: null, time: 0 };
        return;
      }

      // create a node representing a geometric burst at position
      const baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : [30,30,30];
      const node = {
        x, y,
        size: constrain(map(speed, 0, 0.8, 18, 220) * random(0.7, 1.2), 6, 380),
        rot: random(TWO_PI),
        depth: Math.floor(map(constrain(map(speed, 0, 1, 0, 1), 0, 1), 0, 1, 1, MAX_DEPTH)),
        color: baseCol,
        time: now
      };

      _nodes.push(node);
      if (_nodes.length > MAX_NODES) _nodes.splice(0, _nodes.length - MAX_NODES);

      // draw immediately to buffer
      try {
        const art = _buffer;
        art.push();

        // subtle change of blend for boldness
        try { if (typeof art.blendMode === 'function') art.blendMode(ADD); } catch (e) {}

        // draw main fractal geometry
        drawFractal(art, x, y, node.size, node.rot, Math.min(node.depth, MAX_DEPTH), node.color);

        // occasional heavy gesture lines
        if (random() < 0.6) {
          art.push();
          art.noFill();
          art.stroke(node.color[0], node.color[1], node.color[2], Math.floor(random(70, 200)));
          art.strokeWeight(map(node.size, 6, 400, 2, 40) * random(0.6, 1.2));
          art.line(x + random(-node.size*0.3, node.size*0.3), y + random(-node.size*0.3, node.size*0.3), x + random(-node.size*1.2, node.size*1.2), y + random(-node.size*1.2, node.size*1.2));
          art.pop();
        }

        // occasional drips
        if (random() < 0.28) makeDrip(art, x + random(-node.size*0.2, node.size*0.2), y + random(node.size*0.2, node.size*0.6), node.color, node.size);

        // small splatter dots for texture
        art.noStroke();
        for (let i = 0; i < Math.floor(map(node.size, 6, 400, 2, 18)); i++) {
          const sx = x + randomGaussian() * node.size * 0.7;
          const sy = y + randomGaussian() * node.size * 0.45;
          const s = random(0.4, 6.0);
          const a = Math.floor(random(10, 130) * random(0.1, 1));
          if (Array.isArray(node.color)) art.fill(node.color[0], node.color[1], node.color[2], a);
          else art.fill(node.color);
          art.ellipse(sx, sy, s, s);
        }

        // occasionally apply small local grain
        if (random() < 0.12) {
          const gcount = Math.floor(map(node.size, 6, 400, 6, 80));
          for (let i = 0; i < gcount; i++) {
            const gx = x + random(-node.size*0.8, node.size*0.8);
            const gy = y + random(-node.size*0.4, node.size*0.4);
            const ga = Math.floor(random(4, 16));
            art.fill(0, 0, 0, ga);
            art.ellipse(gx, gy, random(0.5, 1.6), random(0.5, 1.6));
          }
        }

        // restore blend
        try { if (typeof art.blendMode === 'function') art.blendMode(BLEND); } catch (e) {}
        art.pop();

        // occasionally apply global grain overlay
        if (random() < 0.02) applyGrain(_buffer);

      } catch (e) { /* ignore drawing errors */ }

      _prev.x = x; _prev.y = y; _prev.time = now;
    }
  };
})();

// Backwards-compatible alias expected by Fluid for style `fractal-tree`
// Fluid maps 'fractal-tree' -> 'FractalTreeEngine', so expose the alias here.
try { window.FractalTreeEngine = window.FractalGeomEngine; } catch (e) { /* ignore in non-browser env */ }