// Torn Wet Brush Engine - ragged, wet, human-like strokes
window.TornWetBrushEngine = (function () {
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

            if (opts && opts.forceClear && _buffer) _buffer.clear();
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

    // Simple midpoint subdivision with perpendicular displacement
    function subdivideRagged(pts, iters, disp) {
        for (let k = 0; k < iters; k++) {
            let out = [];
            for (let i = 0; i < pts.length - 1; i++) {
                let a = pts[i];
                let b = pts[i + 1];
                out.push(a);
                let mx = (a.x + b.x) / 2;
                let my = (a.y + b.y) / 2;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let len = sqrt(dx * dx + dy * dy) || 1;
                let nx = -dy / len;
                let ny = dx / len;
                let n = noise(mx * 0.02, my * 0.02, k * 0.13);
                let d = map(n, 0, 1, -disp, disp) + randomGaussian() * (disp * 0.08);
                out.push({ x: mx + nx * d, y: my + ny * d });
            }
            out.push(pts[pts.length - 1]);
            pts = out;
            disp *= 0.6;
        }
        return pts;
    }

    function drawRaggedEdge(gfx, cx, cy, radius, color) {
        gfx.push();
        gfx.noStroke();
        let rings = 6;
        for (let r = 0; r < rings; r++) {
            let t = map(r, 0, rings - 1, 0, 1);
            let rr = radius * (1 + t * 1.5);
            let alpha = map(t, 0, 1, 90, 6);
            gfx.fill(color[0] + random(-8, 8), color[1] + random(-8, 8), color[2] + random(-8, 8), alpha);

            let verts = 10 + Math.floor(t * 8);
            let pts = [];
            for (let i = 0; i < verts; i++) {
                let ang = map(i, 0, verts, 0, TWO_PI);
                pts.push({ x: cx + cos(ang) * rr * random(0.85, 1.15), y: cy + sin(ang) * rr * random(0.7, 1.1) });
            }
            let de = subdivideRagged(pts, 3, rr * 0.25);
            gfx.beginShape();
            for (let p of de) gfx.curveVertex(p.x, p.y);
            for (let i = 0; i < 3; i++) gfx.curveVertex(de[i].x, de[i].y);
            gfx.endShape(CLOSE);
        }

        // fiber speckles
        let specks = Math.floor(radius * 3);
        gfx.fill(color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 18);
        for (let i = 0; i < specks; i++) {
            let rr = random(radius * 1.6);
            let a = random(TWO_PI);
            let sx = cx + cos(a) * rr;
            let sy = cy + sin(a) * rr * random(0.8, 1.1);
            gfx.ellipse(sx, sy, random(0.6, 2), random(0.6, 2));
        }
        gfx.pop();
    }

    function drawSmearSegment(gfx, x1, y1, x2, y2, color, widthBase) {
        gfx.push();
        let segLen = dist(x1, y1, x2, y2) || 1;
        let steps = Math.max(4, Math.floor(segLen / 6));
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let px = lerp(x1, x2, t) + noise((x1 + x2) * 0.005, (y1 + y2) * 0.005, t * 10) * 6 - 3;
            let py = lerp(y1, y2, t) + noise((y1 + y2) * 0.005, (x1 + x2) * 0.005, t * 11) * 6 - 3;
            let r = widthBase * map(t, 0, 1, 0.9, 0.4) * random(0.8, 1.2);
            drawRaggedEdge(gfx, px, py, r, color);
        }
        gfx.pop();
    }

    function drawBristleHints(gfx, x1, y1, x2, y2, color, widthBase) {
        gfx.push();
        gfx.strokeWeight(1);
        for (let i = 0; i < 8; i++) {
            let t0 = random();
            let sx = lerp(x1, x2, t0) + random(-widthBase * 0.2, widthBase * 0.2);
            let sy = lerp(y1, y2, t0) + random(-widthBase * 0.2, widthBase * 0.2);
            let ang = atan2(y2 - y1, x2 - x1) + random(-0.6, 0.6);
            let len = random(widthBase * 0.6, widthBase * 1.8);
            let ex = sx + cos(ang) * len;
            let ey = sy + sin(ang) * len;
            gfx.stroke(color[0] + random(-10, 10), color[1] + random(-10, 10), color[2] + random(-10, 10), 60);
            gfx.line(sx, sy, ex, ey);
        }
        gfx.pop();
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

            // Tuning derived from stroke speed/length
            if (_prev && _prev.x !== null) {
                let dx = x - _prev.x;
                let dy = y - _prev.y;
                let d = sqrt(dx * dx + dy * dy) || 1;
                let baseW = map(d, 0, 120, 40, 160, true) * random(0.9, 1.1);

                // Primary smeared ragged stroke
                drawSmearSegment(_buffer, _prev.x, _prev.y, x, y, col, baseW);

                // Add bristle texture and torn fibers
                if (random() > 0.3) drawBristleHints(_buffer, _prev.x, _prev.y, x, y, col, baseW);

                // Add occasional heavier wet puddle at contact points
                if (random() > 0.75) {
                    drawRaggedEdge(_buffer, x + random(-8, 8), y + random(-8, 8), baseW * random(0.6, 1.1), col);
                }

                // Slight directional smear (drag)
                if (random() > 0.5) {
                    let rx = x + (dx * 0.3) + random(-10, 10);
                    let ry = y + (dy * 0.3) + random(-6, 6);
                    drawRaggedEdge(_buffer, rx, ry, baseW * 0.5, col);
                }
            } else {
                // initial wet blot
                drawRaggedEdge(_buffer, x, y, random(80, 160), col);
                for (let i = 0; i < 4; i++) {
                    drawRaggedEdge(_buffer, x + random(-40, 40), y + random(-30, 30), random(20, 70), col);
                }
            }

            _prev.x = x; _prev.y = y;
        }
    };
})();
