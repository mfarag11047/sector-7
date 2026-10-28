// How the two corporate sides show in the HUD (TEAM_COLORS and TEAM_NAMES in constants.ts): each
// side's text colour and glow, and the dark ink for symbols drawn on its colour, which is too light
// for white ones.

import { TEAM_NAMES } from '../constants';

export type Side = 'blue' | 'red';
export const FACTION_TEXT: Record<Side, string> = { blue: 'text-slate-100', red: 'text-lime-300' };
export const FACTION_TEXT_SOFT: Record<Side, string> = { blue: 'text-slate-200', red: 'text-lime-200' };
export const FACTION_GLOW: Record<Side, string> = { blue: 'hud-glow-vanta', red: 'hud-glow-tokugen' };
export const FACTION_INK = '#0b1220';
export const teamName = (team: string) => TEAM_NAMES[team as keyof typeof TEAM_NAMES] ?? 'Neutral';
