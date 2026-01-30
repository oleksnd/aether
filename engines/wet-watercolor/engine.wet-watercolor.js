// Wet Watercolor Engine - Spreading, bleedy watercolor strokes
window.WetWatercolorEngine = (function () {
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

    // Helper to deform shapes
    function subdivideDeform(points, iterations, dispScale, noiseScale) {
        for (let it = 0; it < iterations; it++) {
            let newPts = [];
            for (let i = 0; i < points.length; i++) {
                let a = points[i];
                let b = points[(i + 1) % points.length];
                newPts.push(a);

                let mx = (a.x + b.x) / 2;
                let my = (a.y + b.y) / 2;

                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let len = sqrt(dx * dx + dy * dy) || 1;
                let nx = -dy / len;
                let ny = dx / len;

                let n = noise(mx * noiseScale, my * noiseScale, it * 0.11);
                let disp = map(n, 0, 1, -dispScale, dispScale);
                disp += randomGaussian() * (dispScale * 0.05);

                let mx2 = mx + nx * disp;
                let my2 = my + ny * disp;

                newPts.push({ x: mx2, y: my2 });
            }
            points = newPts;
            dispScale *= 0.55;
        }
        return points;
    }

    function drawWatercolorPuddle(gfx, x, y, baseRadius, color) {
        gfx.push();
        gfx.noStroke();

        let layers = 8;
        for (let l = 0; l < layers; l++) {
            let t = l / (layers - 1);
            // Spreading out: outer layers are larger and more transparent
            let r = baseRadius * (1.0 + t * 1.5);
            let alpha = map(t, 0, 1, 40, 5);

            // Add some color variance for "wet mix" look
            let rCol = color[0] + random(-10, 10);
            let gCol = color[1] + random(-10, 10);
            let bCol = color[2] + random(-10, 10);

            gfx.fill(rCol, gCol, bCol, alpha);

            let pts = [];
            let vertices = 12;
            for (let i = 0; i < vertices; i++) {
                let ang = map(i, 0, vertices, 0, TWO_PI);
                pts.push({
                    x: x + cos(ang) * r,
                    y: y + sin(ang) * r * 0.8 // slight vertical squash
                });
            }

            let deformed = subdivideDeform(pts, 3, r * 0.3, 0.02);
            gfx.beginShape();
            for (let p of deformed) {
                gfx.curveVertex(p.x, p.y);
            }
            // Close curve
            for (let i = 0; i < 3; i++) gfx.curveVertex(deformed[i].x, deformed[i].y);
            gfx.endShape(CLOSE);
        }

        // Add "pigment granulation" - tiny dark specs
        let grainCount = Math.floor(baseRadius * 5);
        gfx.fill(color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, 15);
        for (let i = 0; i < grainCount; i++) {
            let gr = random(baseRadius * 1.8);
            let ga = random(TWO_PI);
            gfx.ellipse(x + cos(ga) * gr, y + sin(ga) * gr * 0.8, 1, 1);
        }

        // Add "drying fringe" - a thin darker edge
        gfx.noFill();
        gfx.stroke(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 30);
        gfx.strokeWeight(random(0.5, 2));
        let fringePts = [];
        for (let i = 0; i < 15; i++) {
            let ang = map(i, 0, 15, 0, TWO_PI);
            fringePts.push({
                x: x + cos(ang) * baseRadius * 1.2,
                y: y + sin(ang) * baseRadius * 1.2 * 0.8
            });
        }
        let deformedFringe = subdivideDeform(fringePts, 2, baseRadius * 0.1, 0.05);
        gfx.beginShape();
        for (let p of deformedFringe) gfx.curveVertex(p.x, p.y);
        for (let i = 0; i < 3; i++) gfx.curveVertex(deformedFringe[i].x, deformedFringe[i].y);
        gfx.endShape(CLOSE);

        gfx.pop();
    }

    function drawDrip(gfx, x, y, color, baseRadius) {
        if (random() > 0.4) return; // Not every point drips

        gfx.push();
        let dripLen = random(20, 100);
        let steps = 20;
        let dRadius = baseRadius * random(0.1, 0.3);

        for (let i = 0; i < steps; i++) {
            let t = i / steps;
            let curX = x + noise(x * 0.05, (y + i * 5) * 0.05) * 10 - 5;
            let curY = y + i * (dripLen / steps);
            let r = dRadius * (1 - t * 0.5);
            let alpha = map(t, 0, 1, 30, 0);

            gfx.noStroke();
            gfx.fill(color[0], color[1], color[2], alpha);
            gfx.ellipse(curX, curY, r, r);
        }
        gfx.pop();
    }

    function drawBrushStroke(gfx, x1, y1, x2, y2, color) {
        // Use p5.brush if available
        const hasBrushLib = (typeof brush !== 'undefined');

        if (hasBrushLib) {
            try {
                if (typeof brush.instance === 'function') brush.instance(gfx);

                brush.noField();
                // "watercolor" brush is excellent for this
                brush.set("watercolor", color, random(100, 180));
                brush.flow(0.3);
                brush.line(x1, y1, x2, y2);

                // Add some secondary "leaks"
                if (random() > 0.5) {
                    brush.set("watercolor", color, random(40, 80));
                    let angle = atan2(y2 - y1, x2 - x1) + PI / 2;
                    let offX = cos(angle) * 30;
                    let offY = sin(angle) * 30;
                    brush.line(x1 + offX, y1 + offY, x2 + offX, y2 + offY);
                }
            } catch (e) {
                console.warn("WetWatercolorEngine: brush failed", e);
                drawNativeStroke(gfx, x1, y1, x2, y2, color);
            }
        } else {
            drawNativeStroke(gfx, x1, y1, x2, y2, color);
        }
    }

    function drawNativeStroke(gfx, x1, y1, x2, y2, color) {
        let d = dist(x1, y1, x2, y2);
        let steps = floor(d / 5);
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let px = lerp(x1, x2, t);
            let py = lerp(y1, y2, t);
            let r = map(noise(px * 0.01, py * 0.01), 0, 1, 40, 80);
            drawWatercolorPuddle(gfx, px, py, r, color);
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
                drawBrushStroke(_buffer, _prev.x, _prev.y, x, y, col);
                // Occasionally add a big puddle at the junction
                if (random() > 0.7) {
                    drawWatercolorPuddle(_buffer, x, y, random(60, 120), col);
                }
                // Bleeding drips
                if (random() > 0.8) {
                    drawDrip(_buffer, x, y, col, random(30, 60));
                }
            } else {
                // Initial massive wet spill
                drawWatercolorPuddle(_buffer, x, y, random(80, 150), col);
                for (let i = 0; i < 3; i++) {
                    drawDrip(_buffer, x + random(-20, 20), y + random(-10, 10), col, random(40, 80));
                }
            }

            _prev.x = x; _prev.y = y;
        }
    };
})();
