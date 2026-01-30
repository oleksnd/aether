// Oil Brush Engine - Massive Painterly Strokes
window.OilBrushEngine = (function () {
    let _buffer = null;
    let _prev = { x: null, y: null };

    function init(opts) {
        try {
            const w = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
            const h = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);

            if (!_buffer || _buffer.width !== w || _buffer.height !== h) {
                if (_buffer) _buffer.remove();
                _buffer = createGraphics(w, h);
                _buffer.clear();
            }

            // Clear if explicitly requested (new generation)
            if (opts && opts.forceClear && _buffer) {
                _buffer.clear();
            }
        } catch (e) { _buffer = null; }
    }

    function compose(target) {
        if (!_buffer || !target) return;
        target.image(_buffer, 0, 0);
    }

    function dispose() {
        if (_buffer && typeof _buffer.remove === 'function') _buffer.remove();
        _buffer = null;
        _prev = { x: null, y: null };
    }

    function drawP5BrushStroke(gfx, x1, y1, x2, y2, color) {
        // Robust check for p5.brush library
        const hasBrushLib = (typeof brush !== 'undefined');

        gfx.push();
        const baseWeight = random(250, 500); // Reduced width by half

        if (hasBrushLib) {
            try {
                // Redirect brush to our buffer
                if (typeof brush.instance === 'function') {
                    brush.instance(gfx);
                }

                brush.noField();
                brush.set("oil", color, baseWeight);
                brush.flow(0.5);

                // Draw multiple times for density
                brush.line(x1, y1, x2, y2);
                if (random() > 0.6) {
                    brush.line(x1 + 5, y1 + 5, x2 + 5, y2 + 5);
                }

                // Texture dabs
                if (random() > 0.7) {
                    brush.circle(x2, y2, baseWeight * 0.5);
                }
            } catch (e) {
                console.warn("OilBrushEngine: p5.brush call failed", e);
                // Fallback to native p5 drawing below
                drawNativeFallback(gfx, x1, y1, x2, y2, color, baseWeight);
            }
        } else {
            drawNativeFallback(gfx, x1, y1, x2, y2, color, baseWeight);
        }
        gfx.pop();
    }

    function drawNativeFallback(gfx, x1, y1, x2, y2, color, weight) {
        gfx.stroke(color[0], color[1], color[2], 120);
        gfx.strokeWeight(weight);
        gfx.line(x1, y1, x2, y2);

        // Add some noise to make it look less like a plain line
        for (let i = 0; i < 5; i++) {
            let ox = random(-weight / 2, weight / 2);
            let oy = random(-weight / 2, weight / 2);
            gfx.stroke(color[0], color[1], color[2], 40);
            gfx.strokeWeight(weight * 0.2);
            gfx.line(x1 + ox, y1 + oy, x2 + ox, y2 + oy);
        }
    }

    return {
        init,
        compose,
        dispose,
        execute: function (letter, x, y, chosenColor) {
            if (!_buffer) init();
            if (!_buffer) return;

            let col = Array.isArray(chosenColor) ? chosenColor.slice() : [0, 0, 0];

            if (!letter || (typeof letter === 'string' && letter.trim() === '')) {
                _prev = { x: null, y: null };
                return;
            }

            if (_prev && _prev.x !== null) {
                drawP5BrushStroke(_buffer, _prev.x, _prev.y, x, y, col);
            } else {
                // Initial blob
                _buffer.push();
                _buffer.noStroke();
                _buffer.fill(col[0], col[1], col[2], 100);
                _buffer.ellipse(x, y, 200, 150);
                _buffer.pop();
            }

            _prev.x = x; _prev.y = y;
        }
    };
})();
