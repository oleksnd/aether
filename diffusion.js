// AETHER Fluid Diffusion Module
// Responsible for fluid palette, diffusion parameters, and rendering ink splashes on an offscreen artLayer.

const Fluid = (function(){
  // Temporary fluid palette (red, yellow, blue)
  const FLUID_PALETTE = [
    [255, 50, 50],
    [255, 200, 0],
    [50, 50, 255]
  ];

  // Diffusion engine parameters (heavy "flood spillage" mode)
  const DIFFUSION = {
    // Base particle counts (increased ~6x–7x from previous values)
    particlesMin: 30,
    particlesMax: 70,
    // Core spread (sigma) used as baseline — will be multiplied for layers
    spreadSigma: 45,

    // Multipliers for inner/outer clouds
    innerSigmaFactor: 0.6,
    outerSigmaFactor: 1.8,

    // Size ranges for droplets and globs
    sizeMin: 2,
    sizeMax: 36,

    // Base puddle sizes
    basePuddleMin: 80,
    basePuddleMax: 240,

    // Alpha ranges (0..255) — raise opacity so stacking becomes dense
    baseAlphaMin: 18,
    baseAlphaMax: 45,
    splashAlphaMin: 25,
    splashAlphaMax: 120
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

    // ---- Base puddle (single large, soft foundation) ----
    let baseSize = random(DIFFUSION.basePuddleMin, DIFFUSION.basePuddleMax);
    let baseAlpha = Math.floor(random(DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMax));
    if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], baseAlpha);
    else artLayer.fill(chosenColor);
    // Slight offset to avoid perfectly centered circles and make puddles organic
    artLayer.ellipse(x + random(-12, 12), y + random(-12, 12), baseSize, baseSize * random(0.4, 0.9));

    // ---- Dense inner cloud (lots of small/medium droplets, concentrated) ----
    let particleCount = Math.floor(random(DIFFUSION.particlesMin, DIFFUSION.particlesMax + 1));
    let innerCount = Math.floor(particleCount * 1.6); // thicker core
    let innerSigma = DIFFUSION.spreadSigma * DIFFUSION.innerSigmaFactor;

    for (let i = 0; i < innerCount; i++) {
      let offsetX = randomGaussian(0, innerSigma);
      let offsetY = randomGaussian(0, innerSigma);
      let size = random(DIFFUSION.sizeMin, DIFFUSION.sizeMax * 0.6);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin, DIFFUSION.splashAlphaMax * 0.6));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      artLayer.ellipse(x + offsetX, y + offsetY, size, size);
    }

    // ---- Outer spatter (fewer but larger and farther reaching droplets) ----
    let outerCount = Math.floor(particleCount * 0.7);
    let outerSigma = DIFFUSION.spreadSigma * DIFFUSION.outerSigmaFactor;

    for (let i = 0; i < outerCount; i++) {
      let offsetX = randomGaussian(0, outerSigma);
      let offsetY = randomGaussian(0, outerSigma);
      let size = random(DIFFUSION.sizeMax * 0.4, DIFFUSION.sizeMax);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin * 0.6, DIFFUSION.splashAlphaMax));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      // Some splatters are elongated (streaks) to mimic thrown/poured paint
      if (random() < 0.25) {
        // elongated ellipse
        artLayer.push();
        artLayer.translate(x + offsetX, y + offsetY);
        artLayer.rotate(random(-PI, PI));
        artLayer.ellipse(0, 0, size * random(1.2, 2.4), size * random(0.4, 1.0));
        artLayer.pop();
      } else {
        artLayer.ellipse(x + offsetX, y + offsetY, size, size);
      }
    }

    // ---- Occasional heavy glob or streak ----
    if (random() < 0.35) {
      let globSize = random(DIFFUSION.basePuddleMin * 0.4, DIFFUSION.basePuddleMax * 0.8);
      let alpha = Math.floor(random(DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMax * 1.3));
      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      artLayer.ellipse(x + randomGaussian(0, DIFFUSION.spreadSigma), y + randomGaussian(0, DIFFUSION.spreadSigma), globSize, globSize * random(0.3, 0.9));
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