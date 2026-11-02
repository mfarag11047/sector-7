// The city's colours, kept apart from the colours that carry meaning in play.
//
// Some colours are reserved so they always mean one thing:
//   - The sides: Vanta's deep red and Tokugen's green (TEAM_COLORS in constants.ts), on every
//     unit, on the indicator lights of the streetlights its grid powers, and on the objectives it
//     holds.
//     Neutral purple marks unowned units.
//   - The objectives: cyan for server nodes (neutral) and amber for core nodes.
// So the scenery never uses them: neon in green or red would read as a side's,
// cyan or amber trim next to a node would blur the objective, and units would melt into walls in
// their own colours. The scenery keeps to magenta and pink, orange, and blue and indigo (SCENE),
// with neutral dark bodies between them as rest for the eye. (Its reds went to pink-magenta and
// orange when Vanta's colour became red.)
//
// Exceptions, on purpose: the two sides' own megatowers in the core wear their corporation's
// colours (Vanta red, Tokugen green), as the sides take theirs from them, and the gold-scale
// towers keep their gold panels (none stands near a core node). Paint on the ground (road lines,
// crossings) is plain road paint, not light.
//
// reservedFor() says which reserved colour a colour is too close to, for the palette test.

export const SCENE = {
  magenta: '#e879f9',
  hotPink: '#ff4fd8',
  pink: '#f472b6',
  rose: '#ff5c9a',
  red: '#ff2a7a', // a hot pink-red, well clear of Vanta's
  crimson: '#e8458f',
  orange: '#ff6a1a',
  amberless: '#ff8a3d', // a warm orange, well clear of the core nodes' amber
  coral: '#ff8a5a',
  blue: '#4f7bff',
  indigo: '#6d6bff',
} as const;

// The neon signs over shopfronts.
export const SHOP_SIGNS = [SCENE.pink, SCENE.blue, SCENE.red, SCENE.hotPink, SCENE.amberless, SCENE.magenta];

// Hue (0-360), saturation and lightness (0-1) of a #rrggbb colour.
export function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

// Which reserved colour `hex` would be mistaken for, or null if it is fine for scenery.
export function reservedFor(hex: string): 'Vanta red' | 'Tokugen green' | 'neutral purple' | 'server cyan' | 'core amber' | null {
  const { h, s, l } = hsl(hex);
  if (s < 0.2) return null; // dark greys and other near-greys are just body colour
  // Any true red, from dark to bright: pinks start at 345 and orange at 12.
  if ((h >= 345 || h < 12) && s >= 0.3 && l >= 0.18 && l <= 0.8) return 'Vanta red';
  if (h >= 70 && h < 170) return 'Tokugen green';
  if (h >= 170 && h < 205) return 'server cyan';
  if (h >= 35 && h < 70) return 'core amber';
  if (h >= 262 && h < 282) return 'neutral purple';
  return null;
}
