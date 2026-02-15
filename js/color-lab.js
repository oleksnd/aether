/**
 * Color Lab Logic
 */
(function () {
    'use strict';

    const searchInput = document.getElementById('search-input');
    const colorGrid = document.getElementById('color-grid');
    const stats = document.getElementById('stats');
    const darkToggle = document.getElementById('dark-toggle');

    // Synonym mapping for search
    const SYNONYM_MAP = {
        'moth': ['chitin', 'wings', 'night', 'brown ash', 'fatal attraction', 'lamp', 'attraction to light'],
        'tragedy': ['blood', 'decay', 'ash', 'rage', 'last dance', 'departure', 'finale'],
        'forest': ['moss', 'petal', 'hidden life', 'green needle', 'metamorphosis'],
        'ocean': ['depth', 'abyss', 'cold', 'oblivion', 'eternal sleep'],
        'antiquity': ['metal', 'rust', 'forgotten era', 'hot dust', 'humility'],
        'death': ['ash', 'decay', 'departure', 'finale', 'silence'],
        'life': ['pulsation', 'growth', 'petal', 'flash', 'ecstasy']
    };

    let allColors = [];

    function init() {
        if (!window.PALETTES) return;

        window.PALETTES.forEach(palette => {
            palette.colors.forEach(hex => {
                const upHex = hex.toUpperCase();
                const meta = window.PALETTE_METADATA && window.PALETTE_METADATA[upHex] ? window.PALETTE_METADATA[upHex] : {
                    moods: ['unknown'],
                    objects: ['void'],
                    abstracts: ['hidden meaning'],
                    recipe: 'Secret Formula'
                };

                allColors.push({
                    hex: upHex,
                    paletteName: palette.name,
                    moods: meta.moods || [],
                    objects: meta.objects || [],
                    abstracts: meta.abstracts || [],
                    recipe: meta.recipe
                });
            });
        });

        render(allColors);
        setupEvents();
    }

    function render(colors) {
        colorGrid.innerHTML = '';
        stats.textContent = `Found colors: ${colors.length}`;

        colors.forEach(item => {
            const card = document.createElement('div');
            card.className = 'color-card';

            card.innerHTML = `
        <div class="color-swatch" style="background-color: ${item.hex}"></div>
        <div class="color-info">
          <div class="color-hex">${item.hex}</div>
          <div class="palette-name">${item.paletteName}</div>
          
          <div class="tag-section">
            <span class="recipe-label">Mood:</span>
            <div class="mood-list">
              ${item.moods.map(m => `<span class="mood-tag mood">${m}</span>`).join('')}
            </div>
          </div>

          <div class="tag-section">
            <span class="recipe-label">Object:</span>
            <div class="mood-list">
              ${item.objects.map(m => `<span class="mood-tag object">${m}</span>`).join('')}
            </div>
          </div>

          <div class="tag-section">
            <span class="recipe-label">Metaphor:</span>
            <div class="mood-list">
              ${item.abstracts.map(m => `<span class="mood-tag abstract">${m}</span>`).join('')}
            </div>
          </div>

          <div class="recipe-box">
             <span class="recipe-label">Mixing Recipe:</span>
             ${item.recipe}
          </div>
        </div>
      `;
            colorGrid.appendChild(card);
        });
    }

    function setupEvents() {
        searchInput.addEventListener('input', (e) => {
            const initialQuery = e.target.value.toLowerCase().trim();
            if (!initialQuery) {
                render(allColors);
                return;
            }

            // Expand search via synonyms
            const searchTerms = [initialQuery];
            if (SYNONYM_MAP[initialQuery]) {
                searchTerms.push(...SYNONYM_MAP[initialQuery]);
            }

            const filtered = allColors.filter(item => {
                const allTags = [...item.moods, ...item.objects, ...item.abstracts, item.paletteName, item.hex];

                return searchTerms.some(term => {
                    return allTags.some(tag => tag.toLowerCase().includes(term));
                });
            });

            render(filtered);
        });

        // Toggle dark mode
        if (darkToggle) {
            darkToggle.addEventListener('click', () => {
                const isDark = document.body.classList.toggle('dark-mode');
                darkToggle.classList.toggle('on', isDark);
            });

            // Initial state based on body class (now light by default)
            if (document.body.classList.contains('dark-mode')) {
                darkToggle.classList.add('on');
            } else {
                darkToggle.classList.remove('on');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
