// Preset: Aether Soft Modern (separate file for future unique tweaks)
(function(){
  if (typeof registerFluidPreset !== 'function') return;

  const factory = function(api) {
    // api provides: artLayer, DIFFUSION, lastInk, hslToRgb, rgbToHsl, applyPigmentGrain, applyPaperGrain, drawOrganicBlob
    const artLayer = api.artLayer;
    const DIFFUSION = api.DIFFUSION;
    const lastInk = api.lastInk;
    const hslToRgb = api.hslToRgb;
    const rgbToHsl = api.rgbToHsl;
    const applyPigmentGrain = api.applyPigmentGrain;
    const applyPaperGrain = api.applyPaperGrain;
    const drawOrganicBlob = api.drawOrganicBlob;

    return function(letter, x, y, chosenColor) {
      if (!artLayer) return;

      // Start with same behavior as Aether Soft — kept separate so we can tweak later.
      let now = millis();
      let distFromLast = (lastInk.x === null) ? Infinity : dist(x, y, lastInk.x, lastInk.y);
      let dt = (lastInk.time) ? (now - lastInk.time) : 0;

      if (distFromLast < 20 && dt < 900) {
        lastInk.size = Math.min(DIFFUSION.basePuddleMaxCap, lastInk.size + DIFFUSION.basePuddleGrowthRate);
        let alphaInc = Math.floor(DIFFUSION.accumulationRate * (dt / 100));
        lastInk.alpha = Math.min(DIFFUSION.maxAccumAlpha, (lastInk.alpha || 0) + alphaInc);
        lastInk.time = now;
        lastInk.x = x;
        lastInk.y = y;
      } else {
        lastInk.size = random(DIFFUSION.basePuddleMin, DIFFUSION.basePuddleMax);
        lastInk.alpha = Math.floor(random(DIFFUSION.baseAlphaMin, DIFFUSION.baseAlphaMin * 2));
        lastInk.time = now;
        lastInk.x = x;
        lastInk.y = y;
      }

      let speed = dt > 0 ? (distFromLast / dt) : 0;
      let speedFactor = map(constrain(speed, 0, 2), 0, 2, 0.7, 1.6);
      let brushSize = lastInk.size * speedFactor * random(0.85, 1.25);

      let seed = 0;
      try { seed = (letter && letter.charCodeAt && letter.charCodeAt(0)) || 0; } catch (e) { seed = 0; }
      let pulse = 1 + 0.06 * sin((millis() * 0.004) + (seed * 0.13));
      brushSize *= pulse;

      // Modern variant: randomize overall scale of the puddle for variety
      // Size can be smaller or larger than the original (0.4x .. 2.0x)
      let sizeScale = random(0.4, 2.0);
      brushSize *= sizeScale;

      let usedBrush = false;
      try {
        let BrushClass = window.Brush || window.P5Brush || window.p5Brush || (window.p5 && window.p5.Brush);

        if (BrushClass) {
          let brushInstance = null;
          try {
            if (typeof BrushClass === 'function') {
              try { brushInstance = new BrushClass(artLayer); } catch (e) { /* ignore */ }
              if (!brushInstance && typeof BrushClass.create === 'function') brushInstance = BrushClass.create(artLayer);
            }
            if (!brushInstance && typeof window.p5Brush === 'object' && typeof window.p5Brush.createBrush === 'function') {
              brushInstance = window.p5Brush.createBrush(artLayer);
            }
          } catch (e) { brushInstance = null; }

          if (brushInstance) {
            let baseRGB = Array.isArray(chosenColor) ? chosenColor.slice() : null;
            let jittered = baseRGB;
            if (baseRGB) {
              let hsl = rgbToHsl(baseRGB[0], baseRGB[1], baseRGB[2]);
              hsl.h += random(-5, 5);
              hsl.l = constrain(hsl.l + random(-4, 6), 6, 94);
              jittered = hslToRgb(hsl.h, hsl.s, hsl.l);
            }

            let rgba = null;
            if (Array.isArray(jittered)) rgba = `rgba(${jittered[0]},${jittered[1]},${jittered[2]},${(lastInk.alpha||DIFFUSION.baseAlphaMax)/255})`;
            else rgba = chosenColor;

            let opts = {
              color: rgba,
              size: brushSize,
              wetness: 0.9,
              spread: 0.85,
              bleed: 0.9,
              scattering: 0.15,
              blend: 'multiply',
              field: { grain: DIFFUSION.grainDensity * 2.0 }
            };

            if (typeof brushInstance.paint === 'function') {
              brushInstance.paint(x, y, opts);
              usedBrush = true;
            } else if (typeof brushInstance.stroke === 'function') {
              brushInstance.stroke({ x, y, size: brushSize, color: rgba, options: opts });
              usedBrush = true;
            } else if (typeof brushInstance.draw === 'function') {
              brushInstance.draw(x, y, opts);
              usedBrush = true;
            } else if (typeof brushInstance === 'function') {
              brushInstance(x, y, opts);
              usedBrush = true;
            }
          }
        }
      } catch (e) {
        usedBrush = false;
      }

      function drawCapillaries(gfx, cx, cy, baseSize, color, count) {
        count = count || Math.floor(map(baseSize, 40, 400, 6, 20));
        for (let i = 0; i < count; i++) {
          let ang = random(0, TWO_PI);
          let len = random(baseSize * 0.6, baseSize * 1.6) * (1 + random(-0.15, 0.3));
          let midx = cx + cos(ang) * (len * 0.45 + random(-6, 6));
          let midy = cy + sin(ang) * (len * 0.45 + random(-6, 6));
          let thin = random(max(1, baseSize * 0.04), max(1.5, baseSize * 0.12));
          let c = color;
          if (Array.isArray(color)) {
            let hsl = rgbToHsl(color[0], color[1], color[2]);
            hsl.h += random(-3, 3);
            hsl.l = constrain(hsl.l + random(-6, 4), 4, 96);
            c = hslToRgb(hsl.h, hsl.s, hsl.l);
          }
          gfx.push();
          gfx.translate(midx, midy);
          gfx.rotate(ang + random(-0.15, 0.15));
          gfx.noStroke();
          if (Array.isArray(c)) gfx.fill(c[0], c[1], c[2], Math.floor(random(8, 28)));
          else gfx.fill(c);
          drawOrganicBlob(gfx, 0, 0, thin, c, 2, random(0.25, 0.6));
          gfx.pop();
        }
      }

      if (!usedBrush) {
        artLayer.push();
        artLayer.noStroke();
        if (typeof artLayer.blendMode === 'function') artLayer.blendMode(MULTIPLY);

        let baseCol = Array.isArray(chosenColor) ? chosenColor.slice() : null;
        let speedNorm = constrain(speed / 0.6, 0, 1);
        let spread = DIFFUSION.spreadSigma * (1 + (1 - speedNorm) * 1.2);

        let streamCount = Math.max(24, Math.floor(map(brushSize, 8, 400, 24, 160)));
        let totalDroplets = Math.floor(map(brushSize, 8, 400, 4000, 15000));

        let streamAllocation = Math.floor(totalDroplets * 0.78);
        let backgroundAllocation = Math.max(40, totalDroplets - streamAllocation);

        for (let s = 0; s < streamCount; s++) {
          let ang = random(0, TWO_PI);
          let originOffset = randomGaussian() * (brushSize * 0.12);
          let ox0 = x + cos(ang + PI/2) * originOffset;
          let oy0 = y + sin(ang + PI/2) * originOffset;

          let len = random(brushSize * 0.6, brushSize * 2.0) * (1 + (1 - speedNorm) * 0.9);
          let dropletsPerStream = Math.max(6, Math.floor(map(len, brushSize * 0.6, brushSize * 2.0, 8, 48)));

          for (let k = 0; k < dropletsPerStream; k++) {
            let t = (k / dropletsPerStream) + random(-0.06, 0.06);
            t = constrain(t, 0, 1);
            let px = ox0 + cos(ang) * (t * len + random(-len * 0.06, len * 0.06));
            let py = oy0 + sin(ang) * (t * len + random(-len * 0.06, len * 0.06));

            px += randomGaussian() * spread * 0.16;
            py += randomGaussian() * spread * 0.12;

            let psize = random(0.5, 3.0) * 200.0 * (typeof sizeScale === 'number' ? sizeScale : 1);
            let palpha = Math.floor(random(1, 5));

            let col = baseCol;
            if (Array.isArray(baseCol) && random() < 0.12) {
              let hsl = rgbToHsl(baseCol[0], baseCol[1], baseCol[2]);
              hsl.h += random(-3, 3);
              hsl.l = constrain(hsl.l + random(-3, 3), 2, 98);
              col = hslToRgb(hsl.h, hsl.s, hsl.l);
            }

            if (Array.isArray(col)) artLayer.fill(col[0], col[1], col[2], palpha);
            else artLayer.fill(col);
            artLayer.ellipse(px, py, psize, psize);
          }
        }

        for (let i = 0; i < backgroundAllocation; i++) {
          let ox = randomGaussian() * spread * 1.0;
          let oy = randomGaussian() * spread * 0.7;
          let sz = random(0.4, 2.2) * 200.0 * (typeof sizeScale === 'number' ? sizeScale : 1);
          let alpha = Math.floor(random(1, 5));
          let col = baseCol;
          if (Array.isArray(baseCol) && random() < 0.06) {
            let hsl = rgbToHsl(baseCol[0], baseCol[1], baseCol[2]);
            hsl.h += random(-2, 2);
            col = hslToRgb(hsl.h, hsl.s, hsl.l);
          }
          if (Array.isArray(col)) artLayer.fill(col[0], col[1], col[2], alpha);
          else artLayer.fill(col);
          artLayer.ellipse(x + ox, y + oy, sz, sz);
        }

        if (baseCol) applyPigmentGrain(artLayer, x, y, spread * 0.9, baseCol);
        applyPaperGrain(artLayer, x, y, spread * 0.9, baseCol || [0,0,0]);

        artLayer.pop();
      }
    };
  };

  registerFluidPreset('Aether Soft Modern', factory);
})();
