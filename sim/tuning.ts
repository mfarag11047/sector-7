// Balance experiments without editing code: the tables of numbers a sweep (tools/doctrineSweep.ts)
// may override for one run, by dotted path, e.g. "SALVAGE.share=0.2;DOCTRINE_CONFIG.heavy_metal.tier2_cost=700".
// Each override writes into the live table, so it only belongs in a throwaway process (a sweep's
// workers), never in the game.

import { ABILITY_CONFIG, DOCTRINE_CONFIG } from '../constants';
import { BLACKWALL } from './blackwall';
import { CLOAK_FIELD } from './cloak';
import { FORCE_FIELD } from './forcefield';
import { SALVAGE } from './salvage';
import { BASE_REPAIR } from './support';
import { HERO_ULTS } from './unitAbilities';
import { EDGES } from './doctrineTrack';
import { AI_DOCTRINE } from './ai';

export const TUNABLE: Record<string, object> = { ABILITY_CONFIG, DOCTRINE_CONFIG, BLACKWALL, CLOAK_FIELD, FORCE_FIELD, SALVAGE, BASE_REPAIR, HERO_ULTS, EDGES, AI_DOCTRINE };

// Applies "TABLE.key.key=number;..." to the tables above. Throws on a path that doesn't name an
// existing number, so a typo can't pass for a result.
export function applyTuning(spec: string, tables: Record<string, object> = TUNABLE): string[] {
  const applied: string[] = [];
  for (const part of spec.split(';').map(s => s.trim()).filter(Boolean)) {
    const [path, raw] = part.split('=').map(s => s.trim());
    const value = Number(raw);
    const keys = path.split('.');
    let target: Record<string, unknown> | undefined = tables[keys[0]] as Record<string, unknown> | undefined;
    for (const k of keys.slice(1, -1)) target = target?.[k] as Record<string, unknown> | undefined;
    const last = keys[keys.length - 1];
    if (keys.length < 2 || !target || typeof target[last] !== 'number' || Number.isNaN(value)) throw new Error(`can't tune "${part}": not a number in ${Object.keys(tables).join(', ')}`);
    target[last] = value;
    applied.push(`${path}=${value}`);
  }
  return applied;
}
