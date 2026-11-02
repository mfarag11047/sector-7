// How the two corporate sides show in the HUD (TEAM_COLORS and TEAM_NAMES in constants.ts): each
// side's text colour and glow, and the ink for symbols drawn on a side's colour: light on Vanta's
// deep red, dark on Tokugen's bright green (inkOn).

import { TEAM_NAMES } from '../constants';

export type Side = 'blue' | 'red';
export const FACTION_TEXT: Record<Side, string> = { blue: 'text-red-500', red: 'text-lime-300' };
export const FACTION_TEXT_SOFT: Record<Side, string> = { blue: 'text-red-400', red: 'text-lime-200' };
export const FACTION_GLOW: Record<Side, string> = { blue: 'hud-glow-vanta', red: 'hud-glow-tokugen' };
export const FACTION_INK = '#0b1220';
export const FACTION_INK_LIGHT = '#fff1f2';
// The ink that reads on a badge of `hex`: dark on a light colour, light on a dark one.
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.2 ? FACTION_INK : FACTION_INK_LIGHT;
}
export const teamName = (team: string) => TEAM_NAMES[team as keyof typeof TEAM_NAMES] ?? 'Neutral';
