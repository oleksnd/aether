// Preset: Particle Spray (scaffold)
(function(){
  if (typeof registerFluidPreset !== 'function') return;

  registerFluidPreset('Particle Spray', function(api){
    const artLayer = api.artLayer;
    const DIFFUSION = api.DIFFUSION;

    return function(letter, x, y, chosenColor) {
      if (!artLayer) return;
      artLayer.push();
      artLayer.noStroke();
      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], 24);
      else artLayer.fill(chosenColor || 'rgba(0,0,0,0.06)');
      // Placeholder small spray
      for (let i = 0; i < 20; i++) {
        let rx = x + randomGaussian() * 6;
        let ry = y + randomGaussian() * 6;
        let s = random(0.5, 2.5);
        artLayer.ellipse(rx, ry, s, s);
      }
      artLayer.pop();
    };
  });
})();
