// Trowel Engine V7: "The Wet Brush"
// Organic fluid strokes using overlapping circles, not geometric quads
window.TrowelEngine = (function () {
    const BUFFER_CLEAR = true;
    const BRUSH_SIZE = 160; // WIDE brush
    const DROPS_PER_STEP = 8; // Dense coverage

    // POLLOCK PALETTE
    const PALETTE = [
        [30, 30, 140],    // Deep Blue
        [15, 15, 15],     // Near Black
        [180, 20, 40],    // Crimson Red
        [80, 20, 140],    // Dark Violet
        [20, 100, 100],   // Dark Teal
        [200, 80, 30],    // Burnt Orange
    ];
    let _colorIdx = 0;

    let _buffer = null;
    let _prev = { x: null, y: null };
    let _pos = { x: 0, y: 0 };
    let _vel = { x: 0, y: 0 };
    let _paintLoad = 1.0;

    function init(opts) {
        try {
            const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
            const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
            _buffer = createGraphics(w, h);
            if (BUFFER_CLEAR) _buffer.clear();
        } catch (e) { _buffer = null; }
    }

    function compose(target) {
        try {
            if (!_buffer || !target) return;
            target.image(_buffer, 0, 0);
        } catch (e) { }
    }

    function dispose() {
        try { if (_buffer && typeof _buffer.remove === 'function') _buffer.remove(); } catch (e) { }
        _buffer = null;
        _prev = { x: null, y: null };
    }

    // Draw a single "ink blob" - the atomic unit of our brush
    function inkBlob(gfx, x, y, size, color, alpha) {
        gfx.noStroke();
        gfx.fill(color[0], color[1], color[2], alpha);

        // Main blob
        gfx.ellipse(x, y, size, size * random(0.8, 1.2));

        // Smaller satellite blobs for organic edge
        if (random() > 0.6) {
            let offX = random(-size * 0.4, size * 0.4);
            let offY = random(-size * 0.4, size * 0.4);
            gfx.ellipse(x + offX, y + offY, size * 0.4, size * 0.4);
        }
    }

    // Splatter - just random dots, no connecting lines
    function splatter(gfx, x, y, color, intensity) {
        let count = floor(random(5, 20) * intensity);
        gfx.noStroke();

        for (let i = 0; i < count; i++) {
            let angle = random(TWO_PI);
            let dist = random(20, 120) * intensity;
            let px = x + cos(angle) * dist;
            let py = y + sin(angle) * dist;
            let sz = random(3, 12);

            gfx.fill(color[0] * 0.8, color[1] * 0.8, color[2] * 0.8, random(180, 255));
            gfx.ellipse(px, py, sz, sz);
        }
    }

    // Gravity drip - vertical organic line
    function drip(gfx, x, y, color) {
        let length = random(40, 150);
        let width = random(3, 8);
        let cx = x, cy = y;

        gfx.noStroke();
        for (let i = 0; i < 20; i++) {
            let t = i / 20;
            let sz = width * (1 - t * 0.7); // Taper
            cx += (noise(cy * 0.05, i) - 0.5) * 6;
            cy += length / 20;

            gfx.fill(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 200);
            gfx.ellipse(cx, cy, sz, sz * 1.5);
        }
        // Bulb at end
        gfx.fill(color[0] * 0.4, color[1] * 0.4, color[2] * 0.4, 255);
        gfx.ellipse(cx, cy, width * 2, width * 2.5);
    }

    // The main stroke rendering - organic blob trail
    function renderWetStroke(gfx, ox, oy, nx, ny, color, load) {
        let d = dist(ox, oy, nx, ny);
        if (d < 1) return;

        let steps = max(1, floor(d / 5));
        let angle = atan2(ny - oy, nx - ox);
        let perpX = -sin(angle);
        let perpY = cos(angle);

        // Dynamic brush size based on pressure/speed
        let currentSize = BRUSH_SIZE * load * random(0.8, 1.3);

        gfx.push();

        // Draw blob trail along the path
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let px = lerp(ox, nx, t);
            let py = lerp(oy, ny, t);

            // Add natural wobble - MORE CHAOS
            px += (noise(py * 0.02, i) - 0.5) * 40;
            py += (noise(px * 0.02, i + 100) - 0.5) * 40;

            // Draw multiple blobs per step for thickness
            for (let j = 0; j < DROPS_PER_STEP; j++) {
                let spread = (j / DROPS_PER_STEP - 0.5) * currentSize;
                let bx = px + perpX * spread + random(-20, 20);
                let by = py + perpY * spread + random(-20, 20);
                let bSize = currentSize * random(0.25, 0.8);
                let alpha = map(load, 0.1, 1.0, 150, 255);

                inkBlob(gfx, bx, by, bSize, color, alpha);
            }
        }

        // Edge darkening - thicker paint at edges
        let edgeColor = [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6];
        for (let i = 0; i <= steps; i += 2) {
            let t = i / steps;
            let px = lerp(ox, nx, t);
            let py = lerp(oy, ny, t);

            // Left edge
            inkBlob(gfx, px + perpX * currentSize * 0.5, py + perpY * currentSize * 0.5,
                currentSize * 0.2, edgeColor, 180);
            // Right edge
            inkBlob(gfx, px - perpX * currentSize * 0.5, py - perpY * currentSize * 0.5,
                currentSize * 0.2, edgeColor, 180);
        }

        gfx.pop();
    }

    return {
        init,
        compose,
        dispose,
        execute: function (letter, tx, ty, chosenColor) {
            if (!_buffer) init();
            if (!_buffer) return;

            let col = PALETTE[_colorIdx % PALETTE.length].slice();

            if (!letter || (typeof letter === 'string' && letter.trim() === '')) {
                _prev = { x: null, y: null };
                _vel = { x: 0, y: 0 };
                _paintLoad = 1.0;
                _colorIdx++; // Next color for next word
                return;
            }

            if (_prev.x === null) {
                _pos = { x: tx, y: ty };
                _prev = { x: tx, y: ty };

                // Initial splash
                _buffer.push();
                for (let j = 0; j < 15; j++) {
                    inkBlob(_buffer, tx + random(-50, 50), ty + random(-50, 50),
                        BRUSH_SIZE * random(0.5, 1.2), col, 255);
                }
                splatter(_buffer, tx, ty, col, 1.5);
                _buffer.pop();
            } else {
                let maxIter = 80;
                let iter = 0;
                let friction = 0.75;
                let spring = 0.1;

                while (dist(_pos.x, _pos.y, tx, ty) > 5 && iter < maxIter) {
                    let lx = _pos.x, ly = _pos.y;

                    let ax = (tx - _pos.x) * spring;
                    let ay = (ty - _pos.y) * spring;
                    _vel.x = (_vel.x + ax) * friction;
                    _vel.y = (_vel.y + ay) * friction;
                    _pos.x += _vel.x;
                    _pos.y += _vel.y;

                    _paintLoad = constrain(_paintLoad - 0.002, 0.1, 1.2);

                    renderWetStroke(_buffer, lx, ly, _pos.x, _pos.y, col, _paintLoad);
                    iter++;

                    let speed = sqrt(_vel.x * _vel.x + _vel.y * _vel.y);

                    // Splatter at high speed
                    if (speed > 8 && random() > 0.7) {
                        splatter(_buffer, _pos.x, _pos.y, col, speed / 20);
                    }

                    // Drip at slow zones
                    if (speed < 1 && random() > 0.9) {
                        drip(_buffer, _pos.x, _pos.y, col);
                    }
                }

                // End splatter
                if (random() > 0.5) {
                    splatter(_buffer, _pos.x, _pos.y, col, 0.8);
                }
            }

            _prev.x = tx;
            _prev.y = ty;
        }
    };
})();
