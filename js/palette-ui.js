// Palette UI Logic
(function () {
  'use strict';

  const indicator = document.getElementById('palette-indicator');
  const dropdown = document.getElementById('palette-dropdown');
  const grid = document.getElementById('palette-grid');
  const tabs = document.querySelectorAll('.palette-tab');
  let currentCategory = 'all';

  function populateDropdown() {
    if (!grid) return;
    grid.textContent = '';

    if (currentCategory === 'all') {
      const div = document.createElement('div');
      div.className = 'palette-option' + (window.SELECTED_PALETTE_ID === null ? ' active' : '');
      div.dataset.id = 'null';

      const preview = document.createElement('div');
      preview.className = 'palette-preview';
      preview.style.background = 'linear-gradient(45deg, #ddd, #444)';

      const name = document.createElement('div');
      name.className = 'palette-name-mini';
      name.textContent = 'Random';

      div.appendChild(preview);
      div.appendChild(name);
      grid.appendChild(div);
    }

    if (window.PALETTES) {
      const filtered = currentCategory === 'all'
        ? window.PALETTES
        : window.PALETTES.filter(p => p.category === currentCategory);

      filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'palette-option' + (window.SELECTED_PALETTE_ID === p.id ? ' active' : '');
        div.dataset.id = p.id;

        const preview = document.createElement('div');
        preview.className = 'palette-preview';
        const colors = p.colors || ['#ccc'];
        const c1 = colors[0];
        const c2 = colors[Math.min(1, colors.length - 1)];
        const c3 = colors[Math.min(2, colors.length - 1)];
        preview.style.background = `conic-gradient(${c1} 0% 50%, ${c2} 50% 75%, ${c3} 75% 100%)`;

        const name = document.createElement('div');
        name.className = 'palette-name-mini';
        name.textContent = p.name;

        div.appendChild(preview);
        div.appendChild(name);
        grid.appendChild(div);
      });
    }
  }

  function updateIndicator() {
    if (!indicator) return;
    let meta = null;
    if (window.SELECTED_PALETTE_ID) {
      meta = (window.PALETTES || []).find(p => p.id === window.SELECTED_PALETTE_ID);
    }
    if (!meta) meta = window.CURRENT_ACTIVE_PALETTE_METADATA;

    if (meta && meta.colors) {
      const c1 = meta.colors[0] || '#ccc';
      const c2 = meta.colors[1] || c1;
      const c3 = meta.colors[2] || c2;
      indicator.style.background = `conic-gradient(${c1} 0% 50%, ${c2} 50% 75%, ${c3} 75% 100%)`;
    } else {
      indicator.style.background = 'conic-gradient(#ccc 0% 50%, #999 50% 75%, #666 75% 100%)';
    }
  }

  if (indicator) {
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = dropdown.style.display !== 'flex';
      dropdown.style.display = isOpening ? 'flex' : 'none';
      if (isOpening) populateDropdown();
    });
  }

  document.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'none';
  });

  if (dropdown) {
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = e.target.closest('.palette-tab');
      if (tab) {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        populateDropdown();
        return;
      }

      const option = e.target.closest('.palette-option');
      if (option) {
        const id = option.dataset.id === 'null' ? null : option.dataset.id;
        window.SELECTED_PALETTE_ID = id;
        grid.querySelectorAll('.palette-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        window.CURRENT_ACTIVE_PALETTE_METADATA = null;
        updateIndicator();
        dropdown.style.display = 'none';
      }
    });
  }

  populateDropdown();
  setInterval(updateIndicator, 1000);
  updateIndicator();
  window.refreshPaletteUI = () => { populateDropdown(); updateIndicator(); };

})();
