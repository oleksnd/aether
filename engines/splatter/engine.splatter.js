// Splatter Paint Engine - Jackson Pollock style splatters
window.SplatterEngine = (function() {
  // Private constants
  const MAX_SPLAT_SIZE = 50;
  const MIN_SPLAT_SIZE = 5;
  const SPLAT_COUNT_BASE = 100;
  const SPLAT_COUNT_SPEED_FACTOR = 200;
  const SPREAD_RADIUS_BASE = 60;
  const SPREAD_RADIUS_SPEED_FACTOR = 100;
  const COLOR_VARIATION = 15;

  // Private state
  let _buffer = null;
  let _prev = { x: null, y: null, time: 0 };

  function init(opts) {
    try {
      const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
      const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
      _buffer = createGraphics(w, h);
      _buffer.clear();
    } catch (e) { _buffer = null; }
  }

  function compose(target) {
    try {
      if (!_buffer || !target) return;
      target.image(_buffer, 0, 0);
    } catch (e) { /* ignore */ }
  }

  function dispose() {
    try { if (_buffer && typeof _buffer.remove === 'function') _buffer.remove(); } catch (e) {}
    _buffer = null;
    _prev = { x: null, y: null, time: 0 };
  }

  // Function to create a splatter at position
  function createSplatter(gfx, cx, cy, baseColor, splatCount, spreadRadius) {
    gfx.noStroke();
    for (let i = 0; i < splatCount; i++) {
      // Random position within spread
      let angle = random(0, TWO_PI);
      let radius = random(0, spreadRadius);
      let sx = cx + cos(angle) * radius;
      let sy = cy + sin(angle) * radius;

      // Random size
      let size = random(MIN_SPLAT_SIZE, MAX_SPLAT_SIZE);

      // Vary color slightly
      let col = baseColor.slice();
      if (Array.isArray(col)) {
        col[0] = constrain(col[0] + random(-COLOR_VARIATION, COLOR_VARIATION), 0, 255);
        col[1] = constrain(col[1] + random(-COLOR_VARIATION, COLOR_VARIATION), 0, 255);
        col[2] = constrain(col[2] + random(-COLOR_VARIATION, COLOR_VARIATION), 0, 255);
      }

      // Random alpha for depth
      let alpha = random(100, 255);
      if (Array.isArray(col)) {
        gfx.fill(col[0], col[1], col[2], alpha);
      } else {
        gfx.fill(col);
      }

      // Draw ellipse or circle
      gfx.ellipse(sx, sy, size, size);
    }
  }

  return {
    init,
    compose,
    dispose,
    execute: function(letter, x, y, chosenColor) {
      if (!_buffer) init();
      if (!_buffer) return;

      let col = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

      let now = millis();
      let distFromLast = (_prev.x !== null) ? dist(x, y, _prev.x, _prev.y) : 0;
      let dt = (_prev.time) ? (now - _prev.time) : 0;
      let speed = dt > 0 ? (distFromLast / dt) : 0;

      // Calculate splat parameters based on speed
      let speedNorm = constrain(speed, 0, 2);
      let splatCount = Math.floor(SPLAT_COUNT_BASE + speedNorm * SPLAT_COUNT_SPEED_FACTOR);
      let spreadRadius = SPREAD_RADIUS_BASE + speedNorm * SPREAD_RADIUS_SPEED_FACTOR;

      // Create splatter at current position
      createSplatter(_buffer, x, y, col, splatCount, spreadRadius);

      // If moving fast, add connecting splatters
      if (distFromLast > 10 && speedNorm > 0.5) {
        let steps = Math.floor(distFromLast / 10);
        for (let i = 1; i < steps; i++) {
          let t = i / steps;
          let ix = _prev.x + t * (x - _prev.x);
          let iy = _prev.y + t * (y - _prev.y);
          let miniCount = Math.floor(splatCount * 0.3);
          let miniRadius = spreadRadius * 0.5;
          createSplatter(_buffer, ix, iy, col, miniCount, miniRadius);
        }
      }

      _prev.x = x;
      _prev.y = y;
      _prev.time = now;
    }
  };
})();