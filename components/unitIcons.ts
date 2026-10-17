// Role badges: a small team-coloured square with a white pictogram, shown above every unit and
// on the minimap, so an army's make-up reads at a glance from far away.
//
// Pictograms borrow from military map symbols: a cross for infantry, a track for armour, a wing
// for aircraft, and so on. Each is an SVG path in a 24x24 box, drawn with the same path on a
// canvas (for the 3D sprite) and in SVG (for the minimap).

import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import type { UnitType } from '../types';

export type UnitRole =
  | 'infantry' | 'anti_armor' | 'raider' | 'armor' | 'anti_air' | 'gunship' | 'scout'
  | 'support' | 'artillery' | 'engineer' | 'sentinel' | 'swarm';

export const UNIT_ROLE: Record<UnitType, UnitRole> = {
  trooper: 'infantry', ghost: 'infantry',
  lancer: 'anti_armor',
  razorback: 'raider', courier: 'raider',
  tank: 'armor', titan_dropped: 'armor', sun_plate: 'support',
  aegis: 'anti_air',
  wasp: 'gunship', hornet: 'gunship',
  drone: 'scout',
  guardian: 'support', helios: 'support', banshee: 'support',
  ballista: 'artillery', bombard: 'artillery', mule: 'artillery', howitzer: 'artillery',
  mason: 'engineer',
  defense_drone: 'sentinel',
  swarm_host: 'swarm', crawler_drone: 'swarm',
};

export const ROLE_LABEL: Record<UnitRole, string> = {
  infantry: 'Infantry', anti_armor: 'Anti-armour infantry', raider: 'Light vehicle', armor: 'Heavy armour',
  anti_air: 'Anti-air', gunship: 'Attack aircraft', scout: 'Scout', support: 'Support', artillery: 'Artillery / ordnance',
  engineer: 'Engineer', sentinel: 'Sentinel', swarm: 'Swarm',
};

// White strokes inside a 24x24 box; the badge is drawn behind them.
export const ROLE_GLYPH: Record<UnitRole, string> = {
  // Crossed rifles (the map symbol for infantry).
  infantry: 'M6 6 L18 18 M18 6 L6 18',
  // Infantry cross with a rocket head over it.
  anti_armor: 'M6 8 L18 18 M18 8 L6 18 M8 8 L12 4 L16 8',
  // A fast wedge.
  raider: 'M5 17 L12 6 L19 17 Z',
  // A tank track.
  armor: 'M5 9 H19 A3 3 0 0 1 19 15 H5 A3 3 0 0 1 5 9 Z',
  // A dome over a base line: air defence.
  anti_air: 'M5 17 H19 M7 16 A5 5 0 0 1 17 16',
  // Swept wings.
  gunship: 'M4 15 L12 7 L20 15 M8 15 L12 11 L16 15',
  // An eye.
  scout: 'M4 12 Q12 5 20 12 Q12 19 4 12 Z M12 10 A2 2 0 1 1 11.99 10 Z',
  // A plus.
  support: 'M12 5 V19 M5 12 H19',
  // A shell in flight.
  artillery: 'M12 4 L15 9 V17 H9 V9 Z M8 20 H16',
  // A spanner-ish bracket.
  engineer: 'M6 18 V8 H10 V12 H14 V8 H18 V18',
  // A hexagon.
  sentinel: 'M12 4 L19 8 V16 L12 20 L5 16 V8 Z',
  // Three dots.
  swarm: 'M8 9 A1.5 1.5 0 1 1 7.99 9 Z M16 9 A1.5 1.5 0 1 1 15.99 9 Z M12 16 A1.5 1.5 0 1 1 11.99 16 Z',
};

// Solid shapes are filled; the rest are drawn as strokes.
const FILLED: ReadonlySet<UnitRole> = new Set(['raider', 'swarm']);
export const roleGlyphFilled = (role: UnitRole) => FILLED.has(role);

export const teamBadgeColor = (team: string) => TEAM_COLORS[team as keyof typeof TEAM_COLORS] ?? '#94a3b8';

// One texture per role and team, shared by every unit that shows it.
const cache = new Map<string, THREE.CanvasTexture>();
export function roleBadgeTexture(role: UnitRole, team: string): THREE.CanvasTexture {
  const key = `${role}:${team}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Badge: team colour with a dark rim, so it stands out on both lit roads and dark blocks.
  ctx.fillStyle = '#020617';
  roundRect(ctx, 2, 2, size - 4, size - 4, 12);
  ctx.fill();
  ctx.fillStyle = teamBadgeColor(team);
  roundRect(ctx, 6, 6, size - 12, size - 12, 9);
  ctx.fill();
  // Pictogram, scaled from the 24-unit box into the badge.
  ctx.save();
  ctx.translate(8, 8);
  ctx.scale((size - 16) / 24, (size - 16) / 24);
  const path = new Path2D(ROLE_GLYPH[role]);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (roleGlyphFilled(role)) ctx.fill(path); else ctx.stroke(path);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
