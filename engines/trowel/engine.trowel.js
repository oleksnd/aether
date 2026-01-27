// Trowel Engine V8: "The Wet Scrubbing Trowel"
// A high-performance, painterly engine that simulates thick, wet paint being scrubbed onto a surface.
// Focuses on "back-and-forth" movement and organic, layered texture.

window.TrowelEngine = (function () {
    let _buffer = null;
    let _prev = { x: null, y: null };
    const BRUSH_THICKNESS = 45;
    const SCRUB_JITTER = 15;
    const NOISE_SCALE = 0.02;

    function init(opts) {
        const w = opts?.width || (typeof width !== 'undefined' ? width : 800);
        const h = opts?.height || (typeof height !== 'undefined' ? height : 600);
        if (!_buffer || _buffer.width !== w || _buffer.height !== h) {
            _buffer = createGraphics(w, h);
            _buffer.clear();
        }
    }

    function compose(target) {
        if (_buffer && target) {
            target.image(_buffer, 0, 0);
        }
    }

    function dispose() {
        if (_buffer && typeof _buffer.remove === 'function') _buffer.remove();
        _buffer = null;
        _prev = { x: null, y: null };
    }

    /**
     * Main entry point for inking.
     * @param {string} letter 
     * @param {number} tx 
     * @param {number} ty 
     * @param {number[]} chosenColor [r, g, b]
     */
    function execute(letter, tx, ty, chosenColor) {
        if (!_buffer) init();

        const col = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

        // Reset chain on word boundaries/whitespace
        if (!letter || (typeof letter === 'string' && letter.trim() === '')) {
            _prev = { x: null, y: null };
            return;
        }

        // First letter of a word: initial blotch
        if (_prev.x === null) {
            drawInitialImpact(_buffer, tx, ty, col);
            _prev = { x: tx, y: ty };
            return;
        }

        // Standard movement: scrubbing stroke from _prev to (tx, ty)
        performScrubbingStroke(_buffer, _prev.x, _prev.y, tx, ty, col);

        _prev = { x: tx, y: ty };
    }

    /**
     * Draws a heavy splash of paint where the brush first hits the paper.
     */
    function drawInitialImpact(gfx, x, y, color) {
        const ctx = gfx.drawingContext;
        ctx.save();

        // Wet highlight effect
        ctx.shadowColor = `rgba(${color[0]},${color[1]},${color[2]}, 0.6)`;
        ctx.shadowBlur = 30;

        gfx.noStroke();
        const blotchSize = random(50, 80);

        // Core of the impact
        for (let i = 0; i < 6; i++) {
            let alpha = map(i, 0, 5, 120, 20);
            let s = blotchSize * (1 - i * 0.12);
            gfx.fill(color[0], color[1], color[2], alpha);
            gfx.ellipse(x + randomGaussian() * 5, y + randomGaussian() * 5, s, s * 0.85);
        }

        // Directional splatters
        for (let i = 0; i < 15; i++) {
            let ang = random(TWO_PI);
            let dist = random(10, 50);
            let sz = random(2, 6);
            gfx.fill(color[0], color[1], color[2], random(100, 200));
            gfx.ellipse(x + cos(ang) * dist, y + sin(ang) * dist, sz, sz);
        }

        ctx.restore();
    }

    /**
     * Decomposes a segment into multiple "back-and-forth" scrubbing motions.
     */
    function performScrubbingStroke(gfx, x1, y1, x2, y2, color) {
        const d = dist(x1, y1, x2, y2);
        const angle = atan2(y2 - y1, x2 - x1);
        const pX = -sin(angle); // Perpendicular X
        const pY = cos(angle);  // Perpendicular Y

        const segments = Math.max(2, Math.floor(d / 25));

        for (let i = 0; i < segments; i++) {
            let tStart = i / segments;
            let tEnd = (i + 1) / segments;

            // Control points for the scrubbing cycle
            let pA = { x: lerp(x1, x2, tStart), y: lerp(y1, y2, tStart) };
            let pB = { x: lerp(x1, x2, tEnd), y: lerp(y1, y2, tEnd) };

            // The "Back" point in the middle of the segment
            let pBack = { x: lerp(pA.x, pB.x, 0.4), y: lerp(pA.y, pB.y, 0.4) };
            let pFore = { x: lerp(pA.x, pB.x, 0.8), y: lerp(pA.y, pB.y, 0.8) };

            // Wide, painterly strokes for each "scrub"
            // Jitter adds the organic "hand-painted" look
            const offset = (amt) => ({ x: pX * amt, y: pY * amt });

            let scrubAmt = SCRUB_JITTER * (0.8 + noise(tStart * 5) * 1.5);

            // 1. Scrub forward
            drawPainterlySegment(gfx,
                pA.x + offset(scrubAmt).x, pA.y + offset(scrubAmt).y,
                pFore.x + offset(-scrubAmt).x, pFore.y + offset(-scrubAmt).y,
                color, 1.0);

            // 2. Scrub backward
            drawPainterlySegment(gfx,
                pFore.x + offset(-scrubAmt * 1.2).x, pFore.y + offset(-scrubAmt * 1.2).y,
                pBack.x + offset(scrubAmt * 0.8).x, pBack.y + offset(scrubAmt * 0.8).y,
                color, 0.7); // Light coverage on backstroke

            // 3. Final push to the end of segment
            drawPainterlySegment(gfx,
                pBack.x + offset(scrubAmt).x, pBack.y + offset(scrubAmt).y,
                pB.x + offset(-scrubAmt * 0.5).x, pB.y + offset(-scrubAmt * 0.5).y,
                color, 1.1); // Heavy build up
        }
    }

    /**
     * Draws a single wide, textured "blade" of paint with inner bristle details.
     */
    function drawPainterlySegment(gfx, x1, y1, x2, y2, color, load) {
        const d = dist(x1, y1, x2, y2);
        if (d < 1) return;

        const angle = atan2(y2 - y1, x2 - x1);
        const pX = -sin(angle);
        const pY = cos(angle);

        const steps = Math.ceil(d / 4);
        const ctx = gfx.drawingContext;

        ctx.save();
        // Wet-on-wet shadow glow
        ctx.shadowColor = `rgba(${color[0]},${color[1]},${color[2]}, ${0.2 * load})`;
        ctx.shadowBlur = 8;

        gfx.noStroke();

        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let cx = lerp(x1, x2, t);
            let cy = lerp(y1, y2, t);

            // Noise-driven variation in paint thickness and texture
            let flowNoise = noise(cx * NOISE_SCALE, cy * NOISE_SCALE, t * 10);

            // Draw 8-12 parallel "bristles" or "paint streaks"
            const bristleCount = 8;
            for (let b = 0; b < bristleCount; b++) {
                let bT = b / (bristleCount - 1);
                let bOffset = (bT - 0.5) * BRUSH_THICKNESS;

                // Add subtle streakiness with noise
                let bNoise = noise(cx * 0.05, cy * 0.05, b * 0.5);
                let bx = cx + pX * bOffset + (bNoise - 0.5) * 12;
                let by = cy + pY * bOffset + (bNoise - 0.5) * 12;

                // Tapering at the ends of the stroke
                let fadeOut = sin(t * PI);
                let bSize = 8 * load * fadeOut * (0.6 + flowNoise * 0.8);
                let alpha = map(flowNoise * bNoise, 0, 1, 15, 95) * load;

                gfx.fill(color[0], color[1], color[2], alpha);
                gfx.ellipse(bx, by, bSize, bSize * random(0.85, 1.15));
            }

            // Occasional "heavy paint" blobs in the center of the brush
            if (flowNoise > 0.8 && random() > 0.7) {
                gfx.fill(color[0], color[1], color[2], 120 * load);
                let spotSize = random(10, 20) * load;
                gfx.ellipse(cx + random(-5, 5), cy + random(-5, 5), spotSize, spotSize);
            }
        }

        // Add trailing drips at low speed (simulated by small segment length)
        if (d < 15 && random() > 0.8) {
            drawOrganicDrip(gfx, x2, y2, color, load);
        }

        ctx.restore();
    }

    function drawOrganicDrip(gfx, x, y, color, load) {
        const len = random(20, 60) * load;
        const dripSize = random(4, 10);
        gfx.noStroke();
        for (let i = 0; i < 15; i++) {
            let t = i / 14;
            let dX = x + (noise(y * 0.01, i) - 0.5) * 10;
            let dY = y + t * len;
            let alpha = map(t, 0, 1, 100, 0) * load;
            let sz = dripSize * (1 - t * 0.5);
            gfx.fill(color[0], color[1], color[2], alpha);
            gfx.ellipse(dX, dY, sz, sz * 1.3);
        }
    }

    return {
        init,
        compose,
        dispose,
        execute
    };
})();
