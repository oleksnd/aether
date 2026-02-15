// Ray Collage Engine: Bold Matisse/Warhol aesthetic with high-contrast cutouts
window.RayCollageEngine = (function () {
  let _rayCanvas = null;
  let _rayCtx = null;
  let _width = 800;
  let _height = 600;
  let _seed = 0;

  const PALETTE = [
    '#FF3B30', // Red
    '#007AFF', // Electric Blue
    '#FFCC02', // Bright Yellow
    '#FF2D55', // Hot Pink
    '#FF9500', // Deep Orange
    '#FFFFFF', // Pure White
  ];

  function init(opts) {
    _width = opts && opts.width ? opts.width : (typeof width !== 'undefined' ? width : 800);
    _height = opts && opts.height ? opts.height : (typeof height !== 'undefined' ? height : 600);
    _seed = Math.floor(Math.random() * 10000);

    // Offscreen buffer
    _rayCanvas = document.createElement('canvas');
    _rayCanvas.width = _width;
    _rayCanvas.height = _height;
    _rayCtx = _rayCanvas.getContext('2d');

    if (typeof ray !== 'undefined' && ray.init) {
      ray.init({ canvas: _rayCanvas, context: _rayCtx, background: 'transparent' });
      _rayCtx.clearRect(0, 0, _width, _height);
    }
  }

  function seededRandom(seed, min = 0, max = 1) {
    const x = Math.sin(seed++) * 10000;
    const r = (x - Math.floor(x));
    return min + r * (max - min);
  }

  function seededChoice(seed, array) {
    const idx = Math.floor(seededRandom(seed, 0, array.length));
    return array[idx];
  }

  function letterToSeed(letter) {
    return (String(letter).charCodeAt(0) || 0) * 997;
  }

  // Smooth Matisse-style organic wiggles
  function drawWiggles(x, y, color, localSeed, size) {
    const count = 3;
    _rayCtx.fillStyle = color;
    for (let j = 0; j < count; j++) {
      const points = [];
      const verts = 10;
      const rBase = size * seededRandom(localSeed + j, 0.4, 0.8);
      const ox = x + seededRandom(localSeed + j + 100, -size, size);
      const oy = y + seededRandom(localSeed + j + 200, -size, size);

      for (let i = 0; i < verts; i++) {
        const ang = (i / verts) * Math.PI * 2;
        const r = rBase * seededRandom(localSeed + j + i, 0.6, 1.4);
        points.push([ox + Math.cos(ang) * r, oy + Math.sin(ang) * r]);
      }

      _rayCtx.beginPath();
      _rayCtx.moveTo(points[0][0], points[0][1]);
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const xc = (p1[0] + p2[0]) / 2;
        const yc = (p1[1] + p2[1]) / 2;
        _rayCtx.quadraticCurveTo(p1[0], p1[1], xc, yc);
      }
      _rayCtx.fill();
    }
  }

  // Draw large black graphic elements (ribbons, dots)
  function drawBoldBlacks(x, y, localSeed) {
    const type = seededChoice(localSeed, ['ribbon', 'big-dots', 'blob']);

    if (type === 'ribbon') {
      const points = [];
      const count = 4;
      for (let i = 0; i < count; i++) {
        points.push([
          x + seededRandom(localSeed + i, -250, 250),
          y + seededRandom(localSeed + i + 10, -250, 250)
        ]);
      }
      _rayCtx.strokeStyle = '#000';
      _rayCtx.lineWidth = seededRandom(localSeed + 100, 50, 100);
      _rayCtx.lineCap = 'round';
      _rayCtx.lineJoin = 'round';
      _rayCtx.beginPath();
      _rayCtx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i][0] + points[i - 1][0]) / 2;
        const yc = (points[i][1] + points[i - 1][1]) / 2;
        _rayCtx.quadraticCurveTo(points[i - 1][0], points[i - 1][1], xc, yc);
      }
      _rayCtx.stroke();
    } else if (type === 'big-dots') {
      const r = seededRandom(localSeed, 40, 70);
      for (let i = 0; i < 3; i++) {
        const dx = x + seededRandom(localSeed + i, -150, 150);
        const dy = y + seededRandom(localSeed + i + 50, -150, 150);
        ray.circle(dx, dy, r, '#000');
      }
    } else {
      // Large Matisse "leaf"
      drawWiggles(x, y, '#000', localSeed, 120);
    }
  }

  function execute(letter, x, y, chosenColor) {
    if (!_rayCanvas || !_rayCtx) init();
    _rayCtx.clearRect(0, 0, _width, _height);

    const baseSeed = _seed + letterToSeed(letter);
    const mode = seededChoice(baseSeed, ['paper', 'paper', 'black-only']);

    if (mode === 'paper') {
      // 1. Solid Color Block (Paper)
      const color = seededChoice(baseSeed + 1, PALETTE);
      const size = seededRandom(baseSeed + 2, 300, 600);
      const points = [];
      const verts = 4;
      for (let i = 0; i < verts; i++) {
        const ang = (i / verts) * Math.PI * 2 + seededRandom(baseSeed + i, -0.3, 0.3);
        const r = size * seededRandom(baseSeed + 10 + i, 0.8, 1.2);
        points.push([x + Math.cos(ang) * r, y + Math.sin(ang) * r]);
      }
      ray.shape(points, color);

      // 2. Pattern Overlay on this paper
      _rayCtx.save();
      _rayCtx.beginPath();
      _rayCtx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) _rayCtx.lineTo(points[i][0], points[i][1]);
      _rayCtx.clip();

      const overlayType = seededChoice(baseSeed + 20, ['none', 'wiggles', 'dots']);
      if (overlayType === 'wiggles') {
        drawWiggles(x, y, '#000', baseSeed + 30, size * 0.4);
      } else if (overlayType === 'dots') {
        const dotR = seededRandom(baseSeed + 31, 20, 50);
        for (let i = 0; i < 5; i++) {
          const dx = x + seededRandom(baseSeed + i, -size * 0.6, size * 0.6);
          const dy = y + seededRandom(baseSeed + i + 7, -size * 0.6, size * 0.6);
          ray.circle(dx, dy, dotR, '#000');
        }
      }
      _rayCtx.restore();
    }

    // 3. Global Bold Black
    if (seededRandom(baseSeed + 40, 0, 1) > 0.3) {
      drawBoldBlacks(x, y, baseSeed + 50);
    }
  }

  function compose(target) {
    if (!_rayCanvas || !target) return;
    if (target.drawingContext && target.drawingContext.drawImage) {
      target.drawingContext.drawImage(_rayCanvas, 0, 0);
    }
  }

  function dispose() {
    try { if (typeof ray !== 'undefined' && ray.destroy) ray.destroy(); } catch (e) { }
    _rayCanvas = null; _rayCtx = null;
  }

  return { init, execute, compose, dispose, getBrushThicknessSupport: () => ({ supported: false }) };
})();
