// AETHER DNA: Colors and alphabet zones can be manually tuned here.
// Note: Base values (ALPHABET_DNA, GRID_CONFIG) have been moved to dna.js for immutability.
// This file now contains artistic configuration that can be modified.

const CONFIG = {
  minRadius: 10,
  maxRadius: 140,
  moveSpeed: 0.12,
  paintDuration: 90,
  brushAlpha: 8, // очень низкая прозрачность
  bleedIntensity: 0.25,

  // Fast-mode: lower-fidelity but much faster rendering/animation
  fastMode: true,
  fast: {
    moveSpeed: 0.28,
    paintDuration: 30,
    layersScale: 0.5,
    ellipseCountScale: 0.6,
    dropletFreqScale: 0.45
  },

  palette: [
    '#CDECCF', // Mint
    '#E9D6F4', // Lavender
    '#F8C8DC', // Pale Rose
    '#CFEAFD'  // Sky Blue
  ]
};