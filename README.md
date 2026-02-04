# AETHER — Sequential Watercolor Generator

**AETHER** is an interactive generative tool for creating watercolor compositions from text. Each character is mapped to a zone on a mathematical grid; words become smooth trajectories that a virtual brush follows, leaving organic watercolor marks.

---

## 🎨 What is it?

AETHER transforms any input text into a visual composition. The system:
- Splits text into words and characters.
- Places each character into a grid zone (alphabetical or randomized layout).
- Draws trajectories between characters with a simulated brush that produces watercolor effects.
- Applies selected rendering style (engine) and color palette.

The output is an abstract image that encodes your input text visually.

---

## 🛠 How it works

This is a **pure front-end** project — there is no backend. All processing happens locally in the browser using JavaScript and the p5.js rendering library.

### Technologies
- **HTML5 Canvas** — rendering surface.
- **p5.js** — creative-coding library.
- **p5.brush** — optional brush emulation for organic strokes.
- **gl-matrix** — math utilities (used by brush module).
- **Vanilla JavaScript** — no front-end framework required.

### Security
- **Content Security Policy (CSP)** is applied.
- **Subresource Integrity (SRI)** is used for external libraries where configured.
- No network calls or data exfiltration — user input stays in the browser.
- Dynamic engine loading is restricted to a whitelist.

---

## 🎭 Rendering Engines

Rendering engines are isolated modules that implement different visual styles:

- **Aether Soft** — soft, spreading watercolor puddles.
- **Aether Soft Modern** — refined transitions and smoother blends.
- **Liquid Ink** — fluid ink-like flow and gradients.
- **Oil Brush** — thick brush strokes with painterly texture.
- **Splatter** — scattered drops and splatters.
- **Fractal Tree** — branching/fractal elements along strokes.
- **Torn Wet Brush** — torn, ragged wet-edge shapes.

Each engine draws to its own internal buffer and composes to the shared canvas during final rendering.

---

## 🎨 Palettes

The project includes 70+ curated palettes grouped by category:
- **Nature**, **Floral**, **Atmosphere**, **Vivid**, **Earth**, **Cool**.

You can also pick `Random` to let the system choose a palette for each generation.

---

## 🚀 Usage

### Hosted (GitHub Pages)
The project is intended to be served as a static site and can be run from the repository's GitHub Pages URL.

### Local
If you prefer local testing, serve the repo directory with any static server (CSP prevents file:// usage):

```bash
git clone https://github.com/your-username/aether.git
cd aether
# Python
python3 -m http.server 8000

# or with Node's http-server
npx http-server

# Open http://localhost:8000
```

---

## 📂 Project structure

```
aether/
├── index.html           # Main UI, initialization and controls
├── sketch.js            # p5 controller, interaction logic
├── dna.js               # Immutable grid and alphabet configuration
├── diffusion.js         # Palette and inking routing
├── palettes/
│   └── palette.js       # Color palettes
├── engines/             # Isolated rendering engines
├── assets/
│   └── logo.svg
├── CONTRIBUTING.md      # Engine isolation rules
└── README.md
```

---

## ✨ Features

- Text input and word splitting (Latin letters supported).
- 7 rendering styles (engines).
- 70+ palettes with category filtering.
- PNG export of the artwork.
- UI toggles: Grid, A-Z (randomize layout), Dark Mode.
- Brush thickness control for compatible engines.
- Per-word visibility toggles.

---

## 🔒 Privacy & Security

- No backend — everything runs in the browser.
- No external data collection — text stays local.
- No persistent storage (no cookies/localStorage used by core logic).
- CSP + SRI reduce exposure to injected scripts.

---

## 🤝 Contributing

See `CONTRIBUTING.md` for guidelines on engine isolation and contributions.

---

## 📄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

- You are welcome to use, modify and create art with this project for personal and non-commercial purposes.
- Commercial use (making money from the project or derivatives) is not permitted under this license.

See the full license text in the `LICENSE` file or online:
https://creativecommons.org/licenses/by-nc/4.0/
