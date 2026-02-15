// Dynamic Engine Loader with strict whitelist
(function() {
  'use strict';

  let loadedEngines = new Set();

  const ENGINE_WHITELIST = {
    'aether-soft': 'engines/aether-soft/engine.aether-soft.js',
    'aether-soft-modern': 'engines/aether-soft-modern/engine.aether-soft-modern.js',
    'liquid-ink': 'engines/liquid-ink/engine.liquid-ink.js',
    'oil-brush': 'engines/oil-brush/engine.oil-brush.js',
    'splatter': 'engines/splatter/engine.splatter.js',
    'fractal-tree': 'engines/fractal-tree/engine.fractal-tree.js',
    'torn-wet-brush': 'engines/torn-wet-brush/engine.torn-wet-brush.js',
    'ray-collage': 'engines/ray-collage/engine.ray-collage.js'
  };

  function loadEngine(style) {
    if (!ENGINE_WHITELIST.hasOwnProperty(style)) {
      return Promise.reject(new Error('Engine not allowed: ' + String(style)));
    }
    if (loadedEngines.has(style)) return Promise.resolve();

    return new Promise((resolve) => {
      const script = document.createElement('script');
      const src = ENGINE_WHITELIST[style] + '?v=' + Date.now();
      script.src = src;
      script.onload = () => {
        loadedEngines.add(style);
        resolve();
      };
      script.onerror = () => {
        try {
          const dir = ENGINE_WHITELIST[style].replace(/\/engine\.[^/]+$/, '');
          const legacy = dir + '/engine.js?v=' + Date.now();
          const fallback = document.createElement('script');
          fallback.src = legacy;
          fallback.onload = () => { loadedEngines.add(style); resolve(); };
          fallback.onerror = () => { console.warn('Failed to load engine:', style, src); resolve(); };
          document.head.appendChild(fallback);
        } catch (e) {
          console.warn('Engine load error for', style, e);
          resolve();
        }
      };
      document.head.appendChild(script);
    });
  }

  // Load default engine
  loadEngine('aether-soft');

  // Load engine on style change
  const styleSelector = document.getElementById('styleSelector');
  if (styleSelector) {
    styleSelector.addEventListener('change', (e) => {
      loadEngine(e.target.value);
    });
  }

  // Expose for external usage
  window.loadEngine = loadEngine;

})();
