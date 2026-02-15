// UI Event Handlers
(function() {
  'use strict';

  // Generate button
  document.getElementById('generate-btn').addEventListener('click', () => {
    window.startGeneration(document.getElementById('text-input').value);
  });

  // Export button (art layer only)
  document.getElementById('export-btn').addEventListener('click', () => {
    if (typeof window.exportPNG === 'function') window.exportPNG();
  });

  // Overlay toggle: show/hide grid/letters/paths (default: visible)
  (function () {
    const toggle = document.getElementById('overlay-toggle');
    const label = document.getElementById('overlay-label');
    window.showOverlays = true;

    function updateUI(state) {
      if (!toggle) return;
      toggle.classList.toggle('on', state);
      toggle.setAttribute('aria-pressed', String(state));
      if (label) label.classList.toggle('inactive', !state);
    }

    updateUI(window.showOverlays);

    if (toggle) {
      toggle.addEventListener('click', () => {
        window.showOverlays = !window.showOverlays;
        updateUI(window.showOverlays);
      });
    }

    if (label) {
      label.addEventListener('click', () => {
        if (toggle) toggle.click();
      });
    }
  })();

  // A-Z toggle: show letters A-Z in order by default (ON). When OFF, letters are randomized.
  (function () {
    const toggle = document.getElementById('az-toggle');
    const label = document.getElementById('az-label');

    window.sequentialAlphabet = (typeof window.sequentialAlphabet === 'undefined') ? true : window.sequentialAlphabet;

    function updateUI(state) {
      if (!toggle) return;
      toggle.classList.toggle('on', state);
      toggle.setAttribute('aria-pressed', String(state));
      if (label) label.classList.toggle('inactive', !state);
    }

    updateUI(window.sequentialAlphabet);

    if (toggle) {
      toggle.addEventListener('click', () => {
        window.sequentialAlphabet = !window.sequentialAlphabet;
        updateUI(window.sequentialAlphabet);

        if (window.sequentialAlphabet) {
          try { RUNTIME_ALPHABET_MAP = null; } catch (e) { /* ignore */ }
        } else {
          try { initShuffledAlphabet(); } catch (e) { RUNTIME_ALPHABET_MAP = null; }
        }
      });
    }

    if (label) {
      label.addEventListener('click', () => {
        if (toggle) toggle.click();
      });
    }
  })();

  // Dark Mode toggle
  (function () {
    const toggle = document.getElementById('dark-toggle');
    const label = document.getElementById('dark-label');
    window.darkMode = false;

    function updateUI(state) {
      if (!toggle) return;
      toggle.classList.toggle('on', state);
      toggle.setAttribute('aria-pressed', String(state));
      document.body.classList.toggle('dark-mode', state);
    }

    if (toggle) {
      toggle.addEventListener('click', () => {
        window.darkMode = !window.darkMode;
        updateUI(window.darkMode);
      });
    }

    if (label) {
      label.addEventListener('click', () => {
        if (toggle) toggle.click();
      });
    }
  })();

})();
