// Liquid Ink Engine: Deformed Polygon Stacking
window.LiquidInkEngine = (function() {
  // Private constants (no sharing with other engines)
  const LAYER_COUNT = 50;
  const BASE_RADIUS = 80;
  const VERTEX_COUNT = 24;
  const NOISE_SCALE = 0.02;
  const RADIUS_VARIATION = 0.3; // how much noise affects radius
  const ALPHA_START = 40;
  const ALPHA_END = 10;

  return {
    execute: function(letter, x, y, chosenColor) {
      if (!window.artLayer) return;

      let artLayer = window.artLayer;
      artLayer.push();
      artLayer.noStroke();

      let baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

      for (let layer = 0; layer < LAYER_COUNT; layer++) {
        let layerAlpha = map(layer, 0, LAYER_COUNT - 1, ALPHA_START, ALPHA_END);
        artLayer.fill(baseCol[0], baseCol[1], baseCol[2], layerAlpha);

        artLayer.beginShape();
        for (let i = 0; i < VERTEX_COUNT; i++) {
          let angle = map(i, 0, VERTEX_COUNT, 0, TWO_PI);
          let noiseVal = noise(x * NOISE_SCALE + cos(angle) * 0.1, y * NOISE_SCALE + sin(angle) * 0.1, layer * 0.1);
          let radius = BASE_RADIUS * (1 + (noiseVal - 0.5) * RADIUS_VARIATION);
          let vx = x + cos(angle) * radius;
          let vy = y + sin(angle) * radius;
          artLayer.vertex(vx, vy);
        }
        artLayer.endShape(CLOSE);
      }

      artLayer.pop();
    }
  };
})();