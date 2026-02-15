// Word Toggles UI
(function() {
  'use strict';

  function renderWordToggles(words) {
    const wrap = document.getElementById('word-toggles');
    if (!wrap) return;
    console.log('[UI] renderWordToggles called, words=', words);
    wrap.textContent = '';
    window.wordVisibility = words.map(() => true);

    words.forEach((w, idx) => {
      const label = document.createElement('label');
      label.className = 'word-toggle';
      label.style.cursor = 'pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.disabled = false;
      cb.tabIndex = 0;
      cb.style.pointerEvents = 'auto';
      cb.dataset.index = idx;
      cb.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        window.wordVisibility[i] = e.target.checked;
        if (typeof currentWordIndex !== 'undefined' && typeof currentPaths !== 'undefined') {
          if (i === currentWordIndex && !window.wordVisibility[i]) setTargetToCurrent();
        }
        try { 
          if (typeof window.recomposeArtLayer === 'function') window.recomposeArtLayer(); 
        } catch (err) { /* ignore */ }
      });

      const span = document.createElement('span');
      span.textContent = `${idx + 1}. ${w}`;

      label.appendChild(cb);
      label.appendChild(span);
      wrap.appendChild(label);
    });
  }

  function renderPreviewWordToggles(words) {
    const wrap = document.getElementById('word-toggles');
    if (!wrap) return;
    wrap.textContent = '';
    words.forEach((w, idx) => {
      const label = document.createElement('label');
      label.className = 'word-toggle preview';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.disabled = true;
      const span = document.createElement('span');
      span.textContent = `${idx + 1}. ${w}`;
      label.appendChild(cb);
      label.appendChild(span);
      wrap.appendChild(label);
    });
  }

  // Keep a live preview of the words as the user types
  const textInput = document.getElementById('text-input');
  if (textInput) {
    textInput.addEventListener('input', (e) => {
      const clean = (e.target.value || '').replace(/[^\w\s]/g, '');
      const words = clean.split(/\s+/).filter(Boolean);
      renderPreviewWordToggles(words);
    });

    // Initialize preview on load
    const initialValue = textInput.value || '';
    const initialWords = initialValue.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    renderPreviewWordToggles(initialWords);
  }

  // Expose for external usage
  window.renderWordToggles = renderWordToggles;
  window.renderPreviewWordToggles = renderPreviewWordToggles;

})();
