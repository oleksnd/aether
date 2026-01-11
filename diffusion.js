// AETHER Fluid Diffusion Module
// Responsible for fluid palette, diffusion parameters, and rendering ink splashes on an offscreen artLayer.

const Fluid = (function(){
  // Temporary fluid palette (red, yellow, blue)
  const FLUID_PALETTE = [
    [255, 50, 50],
    [255, 200, 0],
    [50, 50, 255]
  ];

  // Diffusion engine parameters (coalescence / puddle mode)
  const DIFFUSION = {
    // Lower count of distinct droplets but more organic mass per ink
    particlesMin: 12,
    particlesMax: 28,

    // Wider baseline spread so droplets reach far and blend
    spreadSigma: 60,

    // Multipliers used for inner and outer clouds
    innerSigmaFactor: 0.5,
    outerSigmaFactor: 2.2,

    // Droplet size ranges (small -> large globs)
    sizeMin: 3,
    sizeMax: 40,

    // Base puddle sizes (will grow when nozzle lingers)
    basePuddleMin: 90,
    basePuddleMax: 300,
    basePuddleMaxCap: 600,
    // Growth per repeated ink at the same spot (px)
    basePuddleGrowthRate: 6,

    // Opacity ranges bumped so stacks become dense
    baseAlphaMin: 6,
    baseAlphaMax: 30,
    splashAlphaMin: 18,
    splashAlphaMax: 200,

    // Blur radius (px) applied to freshly drawn blobs (soft edges)
    blurPx: 3,

    // How many vertex points when drawing organic shapes
    shapeVertices: 18
  };

  // Track last ink to allow accumulation when nozzle lingers
  let lastInk = { x: null, y: null, time: 0, size: 0 };

  let artLayer = null;

  function init(layer) {
    artLayer = layer;
    // Ensure the art layer can accumulate color with multiply blending
    if (artLayer && typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);
  }

  function pickColor() {
    return FLUID_PALETTE[Math.floor(random(0, FLUID_PALETTE.length))];
  }

  // Draw an organic, slightly-noisy blob with multiple layered fills for soft edges
  function drawOrganicBlob(gfx, cx, cy, baseRadius, color, layers = 4, verticalSquash = 0.75) {
    // Draw from outermost (largest, lowest alpha) to core
    for (let layer = layers; layer >= 1; layer--) {
      let radius = baseRadius * (1 + layer * 0.18);
      // Outer layers are very soft and low-alpha; inner layers are denser
      let t = layer / layers;
      let alpha = 0;
      if (t > 0.85) alpha = Math.floor(map(t, 0.85, 1, DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMax));
      else alpha = Math.floor(map(t, 0.0, 0.85, DIFFUSION.baseAlphaMin * 0.25, DIFFUSION.baseAlphaMin * 0.9));

      // Convert color array or accept string
      if (Array.isArray(color)) {
        gfx.fill(color[0], color[1], color[2], alpha);
      } else {
        gfx.fill(color);
      }

      // Create noisy polygon
      gfx.beginShape();
      for (let i = 0; i < DIFFUSION.shapeVertices; i++) {
        let ang = map(i, 0, DIFFUSION.shapeVertices, 0, TWO_PI);
        // Add per-vertex noise and elliptical squash in vertical axis
        let radialNoise = randomGaussian() * (radius * 0.08);
        let r = radius + radialNoise;
        let vx = cx + cos(ang) * r;
        let vy = cy + sin(ang) * r * verticalSquash;
        gfx.vertex(vx, vy);
      }
      gfx.endShape(CLOSE);
    }
  }

  function executeInking(letter, x, y, chosenColor) {
    if (!artLayer) return;

    // Accumulation: if nozzle is near the previous ink point and time gap is small, grow the puddle
    let now = millis();
    let distFromLast = (lastInk.x === null) ? Infinity : dist(x, y, lastInk.x, lastInk.y);
    if (distFromLast < 18 && (now - lastInk.time) < 900) {
      // grow existing puddle
      lastInk.size = Math.min(DIFFUSION.basePuddleMaxCap, lastInk.size + DIFFUSION.basePuddleGrowthRate);
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    } else {
      // new puddle
      lastInk.size = random(DIFFUSION.basePuddleMin, DIFFUSION.basePuddleMax);
      lastInk.time = now;
      lastInk.x = x;
      lastInk.y = y;
    }

    artLayer.push();
    artLayer.noStroke();

    // Use blur while drawing base puddle and inner cloud to soften edges
    if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') {
      artLayer.drawingContext.filter = `blur(${DIFFUSION.blurPx}px)`;
    }

    // Base puddle: a few layered organic shapes (very soft)
    drawOrganicBlob(artLayer, x + random(-8, 8), y + random(-6, 6), lastInk.size, chosenColor, 4, 0.8);

    // Inner core: smaller but denser blob to create concentrated center
    drawOrganicBlob(artLayer, x + random(-6, 6), y + random(-4, 4), lastInk.size * 0.45, chosenColor, 3, 0.85);

    // Turn off blur for sharp splatter edges (so they have texture)
    if (artLayer.drawingContext && typeof artLayer.drawingContext.filter !== 'undefined') {
      artLayer.drawingContext.filter = 'none';
    }

    // Dense cloud of smaller organic droplets around the puddle (allows blending)
    let particleCount = Math.floor(random(DIFFUSION.particlesMin, DIFFUSION.particlesMax + 1));
    let innerSigma = DIFFUSION.spreadSigma * DIFFUSION.innerSigmaFactor;

    for (let i = 0; i < particleCount; i++) {
      // bias horizontal spread slightly more than vertical to imitate floor puddles
      let offsetX = randomGaussian(0, innerSigma) * 1.0;
      let offsetY = randomGaussian(0, innerSigma) * 0.65;
      let size = random(DIFFUSION.sizeMin, DIFFUSION.sizeMax * 0.5);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin * 0.5, DIFFUSION.splashAlphaMax * 0.35));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      drawOrganicBlob(artLayer, x + offsetX, y + offsetY, size * random(0.8, 1.4), chosenColor, 2, 0.85);
    }

    // Outer splatter: fewer, larger, reach further, some elongated
    let outerCount = Math.floor(particleCount * 0.5);
    let outerSigma = DIFFUSION.spreadSigma * DIFFUSION.outerSigmaFactor;
    for (let i = 0; i < outerCount; i++) {
      let offsetX = randomGaussian(0, outerSigma) * 1.0;
      let offsetY = randomGaussian(0, outerSigma) * 0.6;
      let size = random(DIFFUSION.sizeMax * 0.5, DIFFUSION.sizeMax * 1.1);
      let alpha = Math.floor(random(DIFFUSION.splashAlphaMin * 0.5, DIFFUSION.splashAlphaMax * 0.6));

      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], alpha);
      else artLayer.fill(chosenColor);

      if (random() < 0.3) {
        artLayer.push();
        artLayer.translate(x + offsetX, y + offsetY);
        artLayer.rotate(random(-PI, PI));
        drawOrganicBlob(artLayer, 0, 0, size * random(0.7, 1.6), chosenColor, 2, 0.6);
        artLayer.pop();
      } else {
        drawOrganicBlob(artLayer, x + offsetX, y + offsetY, size, chosenColor, 2, 0.7);
      }
    }

    // Occasional heavy glob
    if (random() < 0.25) {
      let globSize = random(lastInk.size * 0.35, lastInk.size * 0.85);
      if (Array.isArray(chosenColor)) artLayer.fill(chosenColor[0], chosenColor[1], chosenColor[2], Math.floor(DIFFUSION.splashAlphaMax * 0.5));
      artLayer.ellipse(x + randomGaussian(0, DIFFUSION.spreadSigma * 0.45), y + randomGaussian(0, DIFFUSION.spreadSigma * 0.25), globSize, globSize * 0.5);
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