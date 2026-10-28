// The selection and army panel, above the minimap.
//
// It lists what is selected, one row per unit type with a count (×2, ×3...), so a mixed army
// reads at a glance. Clicking a row puts that type in focus: its action menu opens on one of
// them (the camera glides over) and aimed attacks from that menu are carried out by every
// selected unit of the type at once. "Group Army" saves the selection as a numbered army that
// one click, or its number key, selects again.
//
// The panel only draws; CityMap owns the selection and the armies (see ArmyControls).

import React from 'react';
import { UNIT_STATS } from '../constants';
import type { UnitType } from '../types';
import { ROLE_GLYPH, roleGlyphFilled, teamBadgeColor, UNIT_ROLE } from './unitIcons';
import { FACTION_INK } from './factions';

export interface SelectionSummary {
  // One entry per type in the selection, largest group first.
  types: { type: UnitType; count: number }[];
  // The type whose action menu is open.
  focused: UnitType | null;
  total: number;
}

export interface ArmyInfo { name: string; alive: number; selected: boolean }

export interface ArmyControls {
  focusType: (type: UnitType) => void;
  groupArmy: () => void;
  selectArmy: (index: number) => void;
  removeArmy: (index: number) => void;
}

export const MAX_ARMIES = 9;

const Badge: React.FC<{ type: UnitType; color: string }> = ({ type, color }) => {
  const role = UNIT_ROLE[type];
  const filled = roleGlyphFilled(role);
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" className="shrink-0">
      <rect x={1} y={1} width={22} height={22} rx={5} fill={color} stroke="#020617" strokeWidth={1.5} />
      <g transform="translate(3 3) scale(0.75)">
        <path d={ROLE_GLYPH[role]} fill={filled ? FACTION_INK : 'none'} stroke={filled ? 'none' : FACTION_INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

export const ArmyPanel: React.FC<{
  team: 'blue' | 'red';
  selection: SelectionSummary;
  armies: ArmyInfo[];
  controls: React.MutableRefObject<ArmyControls | null>;
}> = ({ team, selection, armies, controls }) => {
  const color = teamBadgeColor(team);
  if (selection.total === 0 && armies.length === 0) return null;
  return (
    <div className="w-56 hud-plate hud-corners backdrop-blur pointer-events-auto p-2 flex flex-col gap-1.5" data-testid="army-panel">
      {armies.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {armies.map((a, i) => (
            <div key={a.name} className={`flex items-center border text-[10px] font-mono ${a.selected ? 'border-cyan-300 bg-cyan-900/60 text-cyan-100' : 'border-slate-600 bg-slate-900/60 text-slate-300'}`}>
              <button onClick={() => controls.current?.selectArmy(i)} className="px-1.5 py-0.5 hover:text-white" title={`Select ${a.name} (key ${i + 1}); click again to centre on it`}>
                <span className="text-amber-300">{i + 1}</span> {a.name} <span className="text-slate-400">·{a.alive}</span>
              </button>
              <button onClick={() => controls.current?.removeArmy(i)} className="px-1 text-slate-500 hover:text-rose-300" title={`Disband ${a.name}`} aria-label={`Disband ${a.name}`}>×</button>
            </div>
          ))}
        </div>
      )}
      {selection.total > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Selected · {selection.total}</span>
            <button
              onClick={() => controls.current?.groupArmy()}
              disabled={armies.length >= MAX_ARMIES}
              className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-amber-400/70 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
            >
              Group Army
            </button>
          </div>
          <ul className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
            {selection.types.map(({ type, count }) => (
              <li key={type}>
                <button
                  onClick={() => controls.current?.focusType(type)}
                  className={`w-full flex items-center gap-1.5 px-1 py-0.5 text-left text-[11px] border ${selection.focused === type ? 'border-cyan-400/80 bg-cyan-900/40 text-white' : 'border-transparent text-slate-200 hover:bg-slate-800/70'}`}
                  title={`Open ${UNIT_STATS[type].label} orders; aimed attacks use all ${count}`}
                >
                  <Badge type={type} color={color} />
                  <span className="truncate flex-1">{UNIT_STATS[type].label}</span>
                  {count > 1 && <span className="font-mono text-amber-300">×{count}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
