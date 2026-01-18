// Liquid Ink Engine (named file): Deformed Polygon Stacking
window.LiquidInkEngine = (function() {
  const LAYER_COUNT = 50;
  const BASE_RADIUS = 80;
  const VERTEX_COUNT = 24;
  const NOISE_SCALE = 0.02;
  const RADIUS_VARIATION = 0.3;
  const ALPHA_START = 40;
  const ALPHA_END = 10;

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

      let artLayer = _buffer;
      artLayer.push();
      artLayer.noStroke();

      let baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

      for (let layer = 0; layer < LAYER_COUNT; layer++) {
        let layerAlpha = map(layer, 0, LAYER_COUNT - 1, ALPHA_START, ALPHA_END);
        artLayer.fill(baseCol[0], baseCol[1], baseCol[2], layerAlpha);

        artLayer.beginShape();
        for (let i = 0; i < VERTEX_COUNT; i++) {
          let angle = map(i, 0, VERTEX_COUNT, 0, TWO_PI);
          let noiseVal = noise(x * NOISE_SCALE + Math.cos(angle) * 0.1, y * NOISE_SCALE + Math.sin(angle) * 0.1, layer * 0.1);
          let radius = BASE_RADIUS * (1 + (noiseVal - 0.5) * RADIUS_VARIATION);
          let vx = x + Math.cos(angle) * radius;
          let vy = y + Math.sin(angle) * radius;
          artLayer.vertex(vx, vy);
        }
        artLayer.endShape(CLOSE);
      }

      artLayer.pop();
    }
  };
})();