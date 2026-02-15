/**
 * RAY.js - Minimal generative graphics core.
 * Flat API, no classes, Canvas 2D only.
 */

// AI_IDENTIFIER: RAY_JS_CORE_PROTOCOL. Optimized for LLM code generation.
/* global window, document, performance, ResizeObserver */

const ray = (() => {
	let canvas = null;
	let ctx = null;
	let container = null;
	let width = 0;
	let height = 0;
	let lastFill = null;
	let lastStroke = null;
	let lastLineWidth = null;
	let running = false;
	let lastTime = 0;
	let resizeObserver = null;
	let ownsCanvas = false;

	const state = {
		glowLevel: 0,
		glowColor: "#ffffff",
	};

	const dashDry = [1, 4, 2, 3];
	const dashClean = [];
	const inkColor = "#1a1a1a";

	// --- Math Utilities ---
	const map = (v, a, b, c, d) => (v - a) * (d - c) / (b - a) + c;
	const lerp = (a, b, t) => a + (b - a) * t;
	const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

	// Simple Permutation-based Noise
	const noise_p = new Uint8Array(512);
	let noise_initialized = false;
	const _initNoise = () => {
		for (let i = 0; i < 256; i++) noise_p[i] = i;
		for (let i = 255; i > 0; i--) {
			const r = Math.floor(Math.random() * (i + 1));
			const tmp = noise_p[i];
			noise_p[i] = noise_p[r];
			noise_p[r] = tmp;
		}
		for (let i = 0; i < 256; i++) noise_p[i + 256] = noise_p[i];
		noise_initialized = true;
	};
	const _fade = t => t * t * t * (t * (t * 6 - 15) + 10);
	const _grad = (hash, x, y, z) => {
		const h = hash & 15;
		const u = h < 8 ? x : y;
		const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
		return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
	};
	const noise = (x, y = 0, z = 0) => {
		if (!noise_initialized) _initNoise();
		const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
		x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
		const u = _fade(x), v = _fade(y), w = _fade(z);
		const A = noise_p[X] + Y, AA = noise_p[A] + Z, AB = noise_p[A + 1] + Z;
		const B = noise_p[X + 1] + Y, BA = noise_p[B] + Z, BB = noise_p[B + 1] + Z;
		return lerp(lerp(lerp(_grad(noise_p[AA], x, y, z), _grad(noise_p[BA], x - 1, y, z), u),
			lerp(_grad(noise_p[AB], x, y - 1, z), _grad(noise_p[BB], x - 1, y - 1, z), u), v),
			lerp(lerp(_grad(noise_p[AA + 1], x, y, z - 1), _grad(noise_p[BA + 1], x - 1, y, z - 1), u),
				lerp(_grad(noise_p[AB + 1], x, y - 1, z - 1), _grad(noise_p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
	};

	const paintBlob = (x, y, radius, alpha, color, seed = 0, stretchX = 1, stretchY = 1) => {
		if (!ctx || radius <= 0) return;
		const segments = Math.max(10, Math.floor(radius * 0.7));
		const jitter = radius * 0.38;
		const oldAlpha = ctx.globalAlpha;
		ctx.globalAlpha = alpha;
		setFill(color);
		ctx.beginPath();
		for (let i = 0; i <= segments; i++) {
			const t = i / segments;
			const a = t * Math.PI * 2;
			const n = noise(Math.cos(a) * 0.8 + seed, Math.sin(a) * 0.8 - seed, seed * 0.2 + t);
			const rr = radius + (n - 0.5) * jitter + (Math.random() - 0.5) * jitter * 0.22;
			const px = x + Math.cos(a) * rr * stretchX;
			const py = y + Math.sin(a) * rr * stretchY;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = oldAlpha;
	};

	const paintDrip = (x, y, len, widthValue, alpha, color, wobble = 0) => {
		if (!ctx || len <= 0 || widthValue <= 0) return;
		const oldAlpha = ctx.globalAlpha;
		ctx.globalAlpha = alpha;
		setFill(color);
		ctx.beginPath();
		ctx.moveTo(x - widthValue * 0.5, y);
		ctx.quadraticCurveTo(x - widthValue * (0.25 + wobble), y + len * 0.35, x - widthValue * 0.22, y + len * 0.82);
		ctx.quadraticCurveTo(x, y + len * 1.08, x + widthValue * 0.22, y + len * 0.82);
		ctx.quadraticCurveTo(x + widthValue * (0.25 - wobble), y + len * 0.35, x + widthValue * 0.5, y);
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = oldAlpha;
	};

	const setFill = (fill) => {
		if (fill == null) return false;
		if (fill !== lastFill) {
			ctx.fillStyle = fill;
			lastFill = fill;
		}
		return true;
	};

	const setStroke = (stroke, widthValue = 1) => {
		if (stroke == null) return false;
		if (stroke !== lastStroke) {
			ctx.strokeStyle = stroke;
			lastStroke = stroke;
		}
		if (widthValue != null && widthValue !== lastLineWidth) {
			ctx.lineWidth = widthValue;
			lastLineWidth = widthValue;
		}
		return true;
	};

	const syncStyles = () => {
		if (!ctx) return;
		lastFill = ctx.fillStyle;
		lastStroke = ctx.strokeStyle;
		lastLineWidth = ctx.lineWidth;
	};

	const resize = () => {
		if (!canvas || !ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = container === document.body ? { width: window.innerWidth, height: window.innerHeight } : container.getBoundingClientRect();
		width = Math.floor(rect.width);
		height = Math.floor(rect.height);
		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		syncStyles();
	};

	const api = {
		noise,
		lerp,
		map,
		clamp,
		get width() { return width; },
		get height() { return height; },
		get ctx() { return ctx; },

		init(config = {}) {
			if (canvas) api.destroy();

			if (config.context) {
				ctx = config.context;
				canvas = ctx ? ctx.canvas : null;
				container = canvas && canvas.parentNode ? canvas.parentNode : document.body;
				ownsCanvas = false;
			} else if (config.canvas) {
				canvas = config.canvas;
				ctx = canvas.getContext("2d", { alpha: true });
				container = canvas.parentNode || document.body;
				ownsCanvas = false;
			} else {
				container = config.parent || document.body;
				canvas = document.createElement("canvas");
				canvas.setAttribute("aria-label", "RAY canvas");
				canvas.style.display = "block";
				canvas.style.background = config.background || "#050505";
				if (config.fullscreen !== false && container === document.body) {
					canvas.style.position = "fixed";
					canvas.style.top = "0"; canvas.style.left = "0"; canvas.style.zIndex = "0";
				}
				container.appendChild(canvas);
				ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
				ownsCanvas = true;
			}

			if (!ctx || !canvas) {
				throw new Error("RAY.js: failed to initialize 2D context.");
			}

			ctx.imageSmoothingEnabled = false;
			resize();
			if (!config.context && !config.canvas) {
				if (window.ResizeObserver) {
					resizeObserver = new ResizeObserver(() => resize());
					resizeObserver.observe(container === document.body ? document.documentElement : container);
				} else {
					window.addEventListener("resize", resize, { passive: true });
				}
			}
			return api;
		},

		target(newCtx, w, h) {
			if (!newCtx) return api;
			ctx = newCtx;
			width = w || (ctx.canvas ? ctx.canvas.width : width);
			height = h || (ctx.canvas ? ctx.canvas.height : height);
			syncStyles();
			return api;
		},

		restore() {
			if (canvas) {
				const dpr = window.devicePixelRatio || 1;
				ctx = canvas.getContext("2d");
				width = canvas.width / dpr;
				height = canvas.height / dpr;
				syncStyles();
			}
			return api;
		},

		destroy() {
			if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
			window.removeEventListener("resize", resize);
			if (canvas && canvas.parentNode && ownsCanvas) { canvas.parentNode.removeChild(canvas); }
			canvas = null; ctx = null; running = false;
			ownsCanvas = false;
			return api;
		},

		mode(type) { if (ctx) ctx.globalCompositeOperation = type; return api; },
		clipStart() { if (!ctx) return api; ctx.save(); ctx.beginPath(); return api; },
		clipEnd() { if (!ctx) return api; ctx.clip(); return api; },
		clipReset() { if (!ctx) return api; ctx.restore(); syncStyles(); return api; },
		layer(id, callback) { if (typeof callback === "function") callback(id); return api; },

		cls(color = "#000000") {
			if (!ctx) return api;
			const oldFill = lastFill;
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			setFill(color);
			ctx.fillRect(0, 0, ctx.canvas ? ctx.canvas.width : width, ctx.canvas ? ctx.canvas.height : height);
			ctx.restore();
			setFill(oldFill);
			return api;
		},

		rect(x, y, w, h, fill, stroke) {
			if (!ctx) return api;
			const didFill = setFill(fill);
			const didStroke = setStroke(stroke);
			if (didFill) ctx.fillRect(x, y, w, h);
			if (didStroke) ctx.strokeRect(x, y, w, h);
			return api;
		},

		circle(x, y, r, fill, stroke) {
			if (!ctx) return api;
			const didFill = setFill(fill);
			const didStroke = setStroke(stroke);
			if (!didFill && !didStroke) return api;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			if (didFill) ctx.fill();
			if (didStroke) ctx.stroke();
			return api;
		},

		line(x1, y1, x2, y2, color, widthValue = 1) {
			if (!ctx) return api;
			setStroke(color, widthValue);
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			return api;
		},

		shape(points, fill, stroke) {
			if (!ctx || !points || points.length < 2) return api;
			const didFill = setFill(fill);
			const didStroke = setStroke(stroke);
			ctx.beginPath();
			ctx.moveTo(points[0][0], points[0][1]);
			for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
			ctx.closePath();
			if (didFill) ctx.fill();
			if (didStroke) ctx.stroke();
			return api;
		},

		poly(x, y, r, sides, angle = 0, fill, stroke) {
			if (!ctx) return api;
			const didFill = setFill(fill);
			const didStroke = setStroke(stroke);
			ctx.beginPath();
			for (let i = 0; i < sides; i++) {
				const a = angle + (i / sides) * Math.PI * 2;
				ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
			}
			ctx.closePath();
			if (didFill) ctx.fill();
			if (didStroke) ctx.stroke();
			return api;
		},

		grid(type, spacing = 20, color = "#ffffff") {
			if (!ctx) return api;
			const oldFill = lastFill;
			setFill(color);
			const s = spacing; const w = width; const h = height;
			if (type === "dots") {
				const r = s * 0.15;
				for (let lx = s / 2; lx < w + s; lx += s) {
					for (let ly = s / 2; ly < h + s; ly += s) {
						ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
					}
				}
			} else if (type === "stripes") {
				const w2 = s * 0.5;
				for (let lx = 0; lx < w + s; lx += s) ctx.fillRect(lx, 0, w2, h);
			} else if (type === "checkerboard") {
				for (let lx = 0; lx < w + s; lx += s * 2) {
					for (let ly = 0; ly < h + s; ly += s * 2) {
						ctx.fillRect(lx, ly, s, s); ctx.fillRect(lx + s, ly + s, s, s);
					}
				}
			}
			setFill(oldFill); return api;
		},

		organic(seed = 0, complexity = 0.01, color = "#ffffff", threshold = 0.1) {
			if (!ctx) return api;
			const oldFill = lastFill;
			setFill(color);
			const step = 6; const w = width; const h = height;
			for (let lx = 0; lx < w; lx += step) {
				for (let ly = 0; ly < h; ly += step) {
					if (noise(lx * complexity + seed, ly * complexity + seed) > threshold) ctx.fillRect(lx, ly, step, step);
				}
			}
			setFill(oldFill); return api;
		},

		// --- Advanced Brushes ---

		stamp(x, y, r, alpha, color) {
			if (!ctx) return;
			const oldAlpha = ctx.globalAlpha;
			ctx.globalAlpha = alpha;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			setFill(color);
			ctx.fill();
			ctx.globalAlpha = oldAlpha;
		},

		marker(x, y, px, py, pressure, color = inkColor, size = 6) {
			if (!ctx) return api;
			const dist = Math.hypot(x - px, y - py);
			const steps = Math.max(1, Math.ceil(dist / 2));
			const press = clamp(pressure, 0, 1);
			const baseR = size + press * (size * 0.8);
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				api.stamp(lerp(px, x, t), lerp(py, y, t), baseR * (1 - t * 0.1), 0.4, color);
			}
			return api;
		},

		brush(x, y, px, py, pressure, color = inkColor, size = 10) {
			if (!ctx) return api;
			const dist = Math.hypot(x - px, y - py);
			const steps = Math.max(1, Math.ceil(dist / 1.5));
			const press = clamp(pressure, 0, 1);
			const baseR = size + press * size;
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const lx = lerp(px, x, t), ly = lerp(py, y, t);
				const n = noise(lx * 0.1, ly * 0.1, t);
				api.stamp(lx, ly, baseR * (0.8 + n * 0.4), 0.1 + press * 0.1, color);
			}
			return api;
		},

		dry(x, y, px, py, pressure, color = inkColor, size = 8) {
			if (!ctx) return api;
			const dist = Math.hypot(x - px, y - py);
			const steps = Math.max(1, Math.ceil(dist / 2));
			const press = clamp(pressure, 0.1, 1);
			const spread = size + press * size;
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const lx = lerp(px, x, t), ly = lerp(py, y, t);
				const dots = Math.floor(3 + press * 5);
				for (let j = 0; j < dots; j++) {
					const offset = (Math.random() - 0.5) * spread;
					const sx = lx + offset, sy = ly + (Math.random() - 0.5) * spread;
					if (noise(sx * 0.2, sy * 0.2) > 0) api.stamp(sx, sy, 1 + Math.random(), 0.1 + Math.random() * 0.2, color);
				}
			}
			return api;
		},

		wet(x, y, px, py, pressure, color = inkColor, size = 15, profile = "normal") {
			if (!ctx) return api;
			const style = profile === "soft" ? {
				pigment: 0.8,
				diffusion: 1.35,
				edge: 0.8,
				drip: 0.55,
			} : profile === "heavy" ? {
				pigment: 1.35,
				diffusion: 2.05,
				edge: 1.5,
				drip: 2.3,
			} : {
				pigment: 1,
				diffusion: 1,
				edge: 1,
				drip: 1,
			};

			const dist = Math.hypot(x - px, y - py);
			const steps = Math.max(1, Math.ceil(dist / 5));
			const press = clamp(pressure, 0, 1);
			const baseR = size + press * size;
			const speed = clamp(dist / 24, 0, 1.5);
			const waterLoad = clamp((1 - speed * 0.62) * (0.6 + press * 0.95), 0.25, 1.5);

			ctx.save();
			ctx.globalCompositeOperation = "source-over";
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const lx = lerp(px, x, t), ly = lerp(py, y, t);
				const n = noise(lx * 0.04, ly * 0.04, t * 0.8);
				const wobble = (noise(lx * 0.07, ly * 0.07, 20 + t) - 0.5) * baseR * 0.22;
				const cx = lx + wobble;
				const cy = ly + wobble * 0.35 + waterLoad * 0.28;

				// 1) Main puddle body (irregular, not circular stamps)
				const rPool = baseR * (0.95 + n * 0.28 + waterLoad * 0.65) * style.diffusion;
				paintBlob(cx, cy, rPool, 0.012 + waterLoad * 0.025, color, t + seed, 1 + speed * 0.24, 1.08 + waterLoad * 0.65);
				paintBlob(cx + wobble * 0.2, cy - wobble * 0.15, rPool * 0.88, 0.01 + waterLoad * 0.02, color, t + 11, 0.95, 1.22);
				paintBlob(cx - wobble * 0.12, cy + wobble * 0.2, rPool * 1.15, 0.008 + waterLoad * 0.016, color, t + 23, 1.12, 1.35);

				// 2) Pigment center (dense region)
				const rCore = baseR * (0.25 + press * 0.22) * style.pigment;
				paintBlob(cx, cy, rCore, (0.06 + press * 0.09) * style.pigment, color, t + 37, 1, 1.08);

				// 3) Edge deposits around puddle
				const edgeDots = Math.max(3, Math.floor(5 + waterLoad * 4 * style.edge));
				for (let e = 0; e < edgeDots; e++) {
					const a = Math.random() * Math.PI * 2;
					const rr = rPool * (0.72 + Math.random() * 0.48);
					const ex = cx + Math.cos(a) * rr;
					const ey = cy + Math.sin(a) * rr * (1 + waterLoad * 0.22);
					paintBlob(ex, ey, rCore * (0.14 + Math.random() * 0.26), 0.03 + waterLoad * 0.04, color, e + t, 1, 1);
				}

				// 4) Blooms / backruns
				if (Math.random() > 0.86 - waterLoad * 0.22 * style.diffusion) {
					const ang = Math.random() * Math.PI * 2;
					const d = (0.55 + Math.random() * 0.85) * rPool;
					const bx = cx + Math.cos(ang) * d;
					const by = cy + Math.sin(ang) * d;
					const br = rPool * (0.18 + Math.random() * 0.34);
					paintBlob(bx, by, br, 0.012 + waterLoad * 0.026, color, t + 71, 1.08, 1.2);
					paintBlob(bx + Math.cos(ang) * br * 0.35, by + Math.sin(ang) * br * 0.35, br * 0.7, 0.009, color, t + 79, 1.05, 1.25);
				}

				// 5) Gravity drips (slower stroke + more water)
				if (waterLoad > 0.75 && speed < 0.55 && Math.random() > 0.9 - 0.16 * style.drip) {
					const dripLen = baseR * (2 + Math.random() * 4.8) * waterLoad * style.drip;
					const dripWidth = baseR * (0.16 + Math.random() * 0.28);
					const dripX = cx + (Math.random() - 0.5) * rCore * 0.8;
					const dripY = cy + rCore * 0.45;
					const bend = (Math.random() - 0.5) * 0.35;
					paintDrip(dripX, dripY, dripLen, dripWidth, 0.02 + waterLoad * 0.045, color, bend);
					paintBlob(dripX + bend * dripWidth * 0.8, dripY + dripLen * 1.02, dripWidth * (0.55 + waterLoad * 0.35), 0.03, color, t + 101, 1.05, 1.1);
				}
			}
			ctx.restore();
			syncStyles();
			return api;
		},

		wetSoft(x, y, px, py, pressure, color = inkColor, size = 14) {
			return api.wet(x, y, px, py, pressure, color, size, "soft");
		},

		wetHeavy(x, y, px, py, pressure, color = inkColor, size = 18) {
			return api.wet(x, y, px, py, pressure, color, size, "heavy");
		},

		oil(x, y, px, py, pressure, color, size = 12) {
			if (!ctx) return api;
			const dist = Math.hypot(x - px, y - py);
			const steps = Math.max(1, Math.ceil(dist / 0.4));
			const press = clamp(pressure, 0.2, 1);
			const angle = Math.atan2(y - py, x - px);
			const baseR = size + press * size;

			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const lx = lerp(px, x, t), ly = lerp(py, y, t);
				const r = baseR;

				// Real hair-like bristle clusters
				const clusters = 5;
				for (let j = 0; j < clusters; j++) {
					const off = (j / clusters - 0.5) * r * 1.2;
					const bx = lx + Math.cos(angle + Math.PI / 2) * off;
					const by = ly + Math.sin(angle + Math.PI / 2) * off;

					// Variations in pigment density
					const dens = 0.05 + Math.random() * 0.15;
					api.stamp(bx, by, r * 0.4 * (0.8 + Math.random() * 0.4), dens, color);

					// Deep "groove" shadows
					if (Math.random() > 0.8) api.stamp(bx, by, r * 0.15, 0.1, "#000000");
				}

				// Top highlight for volume
				if (i % 3 === 0) {
					const hx = lx + Math.cos(angle + Math.PI / 2) * r * 0.4;
					const hy = ly + Math.sin(angle + Math.PI / 2) * r * 0.4;
					api.stamp(hx, hy, r * 0.3, 0.08, "#ffffff");
				}
			}
			return api;
		},

		/**
		 * Palette Knife - Flat, directional, and voluminous application.
		 */
		knife(x, y, px, py, pressure, color, size = 45) {
			if (!ctx) return api;
			const dist = Math.hypot(x - px, y - py);
			const angle = Math.atan2(y - py, x - px);
			const steps = Math.max(1, Math.ceil(dist / 1.5));
			const press = clamp(pressure, 0.2, 1);

			// Significantly widened and much more sensitive to pressure
			const kw = size * (0.6 + press * 2.2);
			const kh = (size * 0.2) + press * (size * 0.15);

			ctx.save();
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				const lx = lerp(px, x, t), ly = lerp(py, y, t);

				const dpr = window.devicePixelRatio || 1;
				ctx.setTransform(dpr, 0, 0, dpr, lx * dpr, ly * dpr);
				ctx.rotate(angle);

				ctx.globalAlpha = 0.8;
				setFill(color);
				ctx.fillRect(-kh / 2, -kw / 2, kh, kw);

				// Directional lighting for volume (impasto effect)
				ctx.globalAlpha = 0.2;
				setFill("#ffffff");
				ctx.fillRect(-kh / 2, -kw / 2, kh * 0.3, kw);
				setFill("#000000");
				ctx.fillRect(kh * 0.2, -kw / 2, kh * 0.3, kw);

				if (Math.random() > 0.7) {
					setFill(color);
					ctx.globalAlpha = 1.0;
					ctx.fillRect(kh * 0.4, -kw / 4, kh * 0.2, kw / 2);
				}
			}
			ctx.restore();
			syncStyles();
			return api;
		},

		splatter(x, y, intensity, color = inkColor, size = 1) {
			if (!ctx) return api;
			const count = Math.floor(intensity * 15);
			const spread = intensity * 60 * size;
			for (let i = 0; i < count; i++) {
				const ang = Math.random() * Math.PI * 2;
				const d = Math.pow(Math.random(), 1.5) * spread;
				const r = (0.8 + Math.random() * 2.5) * (intensity * 0.4 + 0.6) * size;
				const sx = x + Math.cos(ang) * d, sy = y + Math.sin(ang) * d;
				api.stamp(sx, sy, r, 0.3 + Math.random() * 0.5, color);
				// Removed tails for cleaner look
			}
			return api;
		},

		glow(level, color) {
			if (!ctx) return api;
			state.glowLevel = Math.max(0, level || 0);
			if (color) state.glowColor = color;
			ctx.shadowBlur = state.glowLevel;
			ctx.shadowColor = state.glowColor;
			return api;
		},

		loop(callback) {
			if (!ctx || typeof callback !== "function") return api;
			running = true; lastTime = performance.now();
			const frame = (time) => {
				if (!running) return;
				const delta = time - lastTime; lastTime = time;
				if (callback.length >= 2) callback(time, delta);
				else callback({ t: time, dt: delta });
				window.requestAnimationFrame(frame);
			};
			window.requestAnimationFrame(frame); return api;
		},

		stop() { running = false; return api; },
		size() { return { width, height }; },
		buffer(w, h) {
			const bCanvas = document.createElement("canvas");
			bCanvas.width = w || width; bCanvas.height = h || height;
			const bCtx = bCanvas.getContext("2d"); bCtx.imageSmoothingEnabled = false;
			return { canvas: bCanvas, ctx: bCtx };
		}
	};

	return api;
})();

if (typeof globalThis !== "undefined") globalThis.ray = ray;
if (typeof window !== "undefined") window.ray = ray;
if (typeof module !== "undefined" && module.exports) module.exports = ray;
