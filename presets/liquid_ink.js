// Preset: Liquid Ink (particle_spray -> liquid_ink)
(function(){
  if (typeof registerFluidPreset !== 'function') return;

  registerFluidPreset('Liquid Ink', function(api){
    const artLayer = api.artLayer;

    function parseColor(col, a){
      if (Array.isArray(col)) return [col[0], col[1], col[2], a];
      if (typeof col === 'string') return [0,0,0,a];
      return [0,0,0,a];
    }

    return function(letter, x, y, chosenColor) {
      if (!artLayer) return;
      artLayer.push();
      artLayer.noStroke();

      // Parameters for the ink rectangle
      const rectW = 160;
      const rectH = 260;
      const rx = x - rectW/2;
      const ry = y - rectH/2;

      // base wash: many soft semi-transparent particles inside rectangle
      const baseColor = parseColor(chosenColor, 18);
      artLayer.fill(baseColor[0], baseColor[1], baseColor[2], baseColor[3]);
      for (let i = 0; i < 900; i++) {
        // sample biased towards center with occasional edge splashes
        const px = rx + Math.random() * rectW;
        const py = ry + Math.random() * rectH;
        const distBias = dist(px, py, x, y);
        const size = map(Math.random(), 0, 1, 0.5, 12) * (1 + noise(px*0.01, py*0.01));
        artLayer.ellipse(px + randomGaussian()*1.2, py + randomGaussian()*1.2, size, size);
      }

      // concentrated darker ink strokes (follow Gaussian around center)
      const strokeColor = parseColor(chosenColor, 90);
      artLayer.fill(strokeColor[0], strokeColor[1], strokeColor[2], strokeColor[3]);
      for (let i = 0; i < 220; i++) {
        const px = x + randomGaussian() * (rectW * 0.18);
        const py = y + randomGaussian() * (rectH * 0.25);
        const s = random(6, 26) * Math.abs(randomGaussian());
        artLayer.ellipse(px, py, s, s);
      }

      // wet edge effect: sparser, slightly larger semi-transparent spots near rectangle edges
      const edgeColor = parseColor(chosenColor, 40);
      artLayer.fill(edgeColor[0], edgeColor[1], edgeColor[2], edgeColor[3]);
      for (let i = 0; i < 160; i++) {
        // place near edges
        const side = Math.floor(Math.random()*4);
        let ex = rx + Math.random()*rectW;
        let ey = ry + Math.random()*rectH;
        if (side === 0) ex = rx + randomGaussian()*6; // left
        if (side === 1) ex = rx + rectW + randomGaussian()*6; // right
        if (side === 2) ey = ry + randomGaussian()*6; // top
        if (side === 3) ey = ry + rectH + randomGaussian()*6; // bottom
        const s = random(8, 36);
        artLayer.ellipse(ex + randomGaussian()*2, ey + randomGaussian()*2, s, s);
      }

      // faint grid overlay inside rectangle to emulate scanned paper/grid (subtle)
      artLayer.strokeWeight(0.6);
      const gridAlpha = 14;
      const gcol = parseColor(chosenColor, gridAlpha);
      artLayer.stroke(gcol[0], gcol[1], gcol[2], gcol[3]);
      artLayer.noFill();
      const step = 10;
      for (let gx = rx; gx <= rx+rectW; gx += step) {
        artLayer.line(gx, ry, gx, ry+rectH);
      }
      for (let gy = ry; gy <= ry+rectH; gy += step) {
        artLayer.line(rx, gy, rx+rectW, gy);
      }

      // light rectangle boundary for composition
      artLayer.strokeWeight(1.2);
      artLayer.stroke(30, 30, 120, 40);
      artLayer.noFill();
      artLayer.rect(rx, ry, rectW, rectH);

      artLayer.pop();
    };
  });
})();
