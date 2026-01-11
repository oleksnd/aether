// AETHER DNA: Immutable Source of Truth - Base Values for Alphabet Mapping and Grid Configuration
// This file defines the fundamental DNA of the system and must never be modified.
// All artistic updates should occur in sketch.js or constants.js.

const ALPHABET_DNA = {
  'A': { zoneIndex: 0, hueRange: [45, 60] },   // Yellow
  'B': { zoneIndex: 1, hueRange: [60, 75] },
  'C': { zoneIndex: 2, hueRange: [75, 90] },
  'D': { zoneIndex: 3, hueRange: [90, 105] },
  'E': { zoneIndex: 4, hueRange: [105, 120] },
  'F': { zoneIndex: 5, hueRange: [120, 135] },
  'G': { zoneIndex: 6, hueRange: [135, 150] },
  'H': { zoneIndex: 7, hueRange: [150, 165] },
  'I': { zoneIndex: 8, hueRange: [165, 180] },
  'J': { zoneIndex: 9, hueRange: [180, 195] },
  'K': { zoneIndex: 10, hueRange: [195, 210] },
  'L': { zoneIndex: 11, hueRange: [210, 225] },
  'M': { zoneIndex: 12, hueRange: [225, 240] },
  'N': { zoneIndex: 13, hueRange: [240, 255] },
  'O': { zoneIndex: 14, hueRange: [255, 270] },
  'P': { zoneIndex: 15, hueRange: [270, 285] },
  'Q': { zoneIndex: 16, hueRange: [285, 300] },
  'R': { zoneIndex: 17, hueRange: [300, 315] },
  'S': { zoneIndex: 18, hueRange: [315, 330] },
  'T': { zoneIndex: 19, hueRange: [330, 345] },
  'U': { zoneIndex: 20, hueRange: [345, 360] },
  'V': { zoneIndex: 21, hueRange: [0, 15] },   // Wrap around
  'W': { zoneIndex: 22, hueRange: [15, 30] },
  'X': { zoneIndex: 23, hueRange: [30, 45] },
  'Y': { zoneIndex: 24, hueRange: [45, 60] },  // Back to yellow-ish
  'Z': { zoneIndex: 29, hueRange: [60, 75] }
};

const GRID_CONFIG = {
  COLS: 6,
  ROWS: 5,
  MARGIN: 0.1,
  SATURATION: 70,
  BRIGHTNESS: 90
};