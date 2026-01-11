// AETHER Fluid Diffusion Module
// Responsible for fluid palette, diffusion parameters, and rendering ink splashes on an offscreen artLayer.

const Fluid = (function(){
  // Temporary fluid palette (red, yellow, blue)
  const FLUID_PALETTE = [
    [255, 50, 50],
    [255, 200, 0],
    [50, 50, 255]
  ];

  // Diffusion engine parameters
  const DIFFUSION = {
    particlesMin: 5,
    particlesMax: 10,
    spreadSigma: 15,
    sizeMin: 2,
    sizeMax: 15,
    alphaMin: 5,
    alphaMax: 10
  };

  let artLayer = null;

  function init(layer) {
    artLayer = layer;
    // Ensure the art layer can accumulate color with multiply blending
    if (artLayer && typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);
  }

  function pickColor() {
    return FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))];
  }

  function executeInking(letter, x, y, chosenColor) {
    if (!artLayer) return;

    artLayer.push();
    artLayer.noStroke();

    // Determine particle count for this ink event
    let particleCount = Math.floor(random(DIFFUSION.particlesMin, DIFFUSION.particlesMax + 1));

    for (let i = 0; i < particleCount; i++) {
      let offsetX = randomGaussian(0, DIFFUSION.spreadSigma);
      let offsetY = randomGaussian(0, DIFFUSION.spreadSigma);
      let size = random(DIFFUSION.sizeMin, DIFFUSION.sizeMax);
      let alpha = Math.floor(random(DIFFUSION.alphaMin, DIFFUSION.alphaMax + 1));

      if (Array.isArray(chosenColor)) {
        let [r, g, b] = chosenColor;
        artLayer.fill(r, g, b, alpha);
      } else {
        artLayer.fill(chosenColor);
      }

      artLayer.ellipse(x + offsetX, y + offsetY, size, size);
    }

    // Occasional larger splash for variety
    if (random() < 0.15) {
      let splashSize = random(20, 60);
      let alpha = Math.floor(random(DIFFUSION.alphaMin, DIFFUSION.alphaMax + 3));
      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      artLayer.ellipse(x + randomGaussian(0, DIFFUSION.spreadSigma * 2), y + randomGaussian(0, DIFFUSION.spreadSigma * 2), splashSize, splashSize * 0.6);
    }

    artLayer.pop();
  }

  return {
    init,
    pickColor,
    executeInking,
    // Expose params for runtime tweaking if needed
    DIFFUSION,
    FLUID_PALETTE
  };
})();