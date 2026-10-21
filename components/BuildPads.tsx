// The free pads around your Command HQs (sim/baseLayout.ts), each marked on the ground with a
// "+". Clicking one opens what can be built there: base buildings on the building pads,
// turrets on the turret corners. Picking one places it on that pad.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { ABILITY_CONFIG, STRUCTURE_INFO, UNIT_CLASSES } from '../constants';
import type { StructureType, UnitClass } from '../types';
import { BASE_BUILDINGS, BASE_TURRETS, type PadKind } from '../sim/baseLayout';
import type { GridPos } from '../sim/commands';
import { STRUCTURE_RULES } from '../sim/units';

// What each base building is for, so a new player knows what to build.
export const STRUCTURE_PURPOSE: Partial<Record<StructureType, string>> = {
  infantry: 'Troopers, Ghosts, Lancers',
  armor: 'Razorbacks, Thunderheads, Titans, Aegis, Battery Mules',
  air: 'Drones, Wasps, Hornets, Bombards',
  support: 'Guardians, Helios, Banshees, Ballistas',
  builder: 'Masons; walls',
  ordnance_fab: 'Warheads and Field Fabricators',
  research_lab: 'Unit upgrades',
  defense: 'Anti-vehicle cannon · ground only',
  aa_turret: 'Anti-air CIWS · weak vs ground',
};

// Taken pads stay listed, hidden.
export interface FreePad { at: GridPos; kind: PadKind; taken: boolean }
export const padKey = (p: GridPos) => `${p.x},${p.z}`;

const TURRET_COLOR = '#fbbf24';
const Z_OPEN: [number, number] = [190, 0];

const PadMenu: React.FC<{
  kind: PadKind; cores: number; hasDepot: boolean; hasMason: boolean; onBuild: (type: StructureType) => void;
}> = ({ kind, cores, hasDepot, hasMason, onBuild }) => {
  const options = kind === 'building' ? BASE_BUILDINGS : BASE_TURRETS;
  // Turrets are put up by Masons from a Depot.
  const turretBlock = kind === 'turret' ? (!hasDepot ? 'Needs a finished Depot' : !hasMason ? 'Needs a Mason (train one at the Depot)' : null) : null;
  return (
    <div className="hud-plate hud-corners hud-menu backdrop-blur w-[300px] p-1 flex flex-col gap-0.5 text-left" onWheel={e => e.stopPropagation()}>
      <div className="px-2 pt-1 flex justify-between items-center">
        <span className={`font-mono font-bold text-xs uppercase ${kind === 'turret' ? 'text-amber-300' : 'text-cyan-400'}`}>{kind === 'turret' ? 'Turret corner' : 'Building pad'}</span>
        <span className={`text-[10px] font-mono ${cores > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Math.floor(cores)} Cores</span>
      </div>
      {turretBlock && <div className="px-2 text-[9px] font-mono text-red-400">{turretBlock}</div>}
      {options.map(type => {
        const info = STRUCTURE_INFO[type];
        const ok = cores >= info.cost && !turretBlock;
        const time = kind === 'turret'
          ? (() => { const trips = Math.max(1, Math.ceil(info.maxProgress / ABILITY_CONFIG.MASON_BUILD_AMOUNT)); return `${trips} Mason ${trips === 1 ? 'trip' : 'trips'}`; })()
          : `${STRUCTURE_RULES[type].buildTimeMs / 1000}s`;
        return (
          <button
            key={type}
            disabled={!ok}
            onClick={(e) => { e.stopPropagation(); if (ok) onBuild(type); }}
            className={`flex items-center justify-between gap-3 px-2.5 py-1.5 text-left rounded ${ok ? 'hover:bg-cyan-900/40 text-slate-200' : 'opacity-50 text-slate-500 cursor-not-allowed'}`}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: info.color }} className="text-sm">{type in UNIT_CLASSES ? UNIT_CLASSES[type as UnitClass].icon : '■'}</span>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold whitespace-nowrap">{info.label}</span>
                <span className="text-[9px] font-mono text-slate-500">{STRUCTURE_PURPOSE[type]} · {time}</span>
              </div>
            </div>
            <span className={`text-[10px] font-mono ${cores >= info.cost ? 'text-cyan-500' : 'text-red-400'}`}>{info.cost}</span>
          </button>
        );
      })}
    </div>
  );
};

// Holds the menu beside the pad, so the pad stays in view: to its right, or its left when there's
// no room, and moved up or down to stay on screen.
const GAP = 28;
const BesidePad: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: false, dy: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The pad's screen position is the wrapper's origin, before our own offset.
    const r = el.getBoundingClientRect();
    const padX = place.left ? r.right + GAP : r.left - GAP;
    const padY = r.top + r.height / 2 - place.dy;
    const left = padX + GAP + r.width > window.innerWidth - 8;
    const top = padY - r.height / 2;
    const dy = top < 8 ? 8 - top : top + r.height > window.innerHeight - 8 ? window.innerHeight - 8 - (top + r.height) : 0;
    if (left !== place.left || Math.abs(dy - place.dy) > 1) setPlace({ left, dy });
  });
  return (
    <div ref={ref} className="pointer-events-auto" onPointerDown={e => e.stopPropagation()}
      style={{ transform: `translate(${place.left ? `calc(-100% - ${GAP}px)` : `${GAP}px`}, calc(-50% + ${place.dy}px))` }}>
      {children}
    </div>
  );
};

// One free pad: a square outline on the ground with a + in the middle, both brighter on hover.
// Drawn in 3D rather than as a page overlay: there can be a dozen of them on screen.
const PadMarker: React.FC<{
  pad: FreePad; show: boolean; open: boolean; color: string; tileSize: number; offset: number;
  onToggle: () => void; children?: React.ReactNode;
}> = ({ pad, show, open, color, tileSize, offset, onToggle, children }) => {
  const [hover, setHover] = useState(false);
  // Built on while under the pointer: it never gets the pointer-out.
  useEffect(() => { if (!show && hover) { setHover(false); document.body.style.cursor = ''; } }, [show, hover]);
  const lit = show && (open || hover);
  const arm = tileSize * 0.15;
  const bar = tileSize * 0.05;
  return (
    <group position={[pad.at.x * tileSize - offset, 0.6, pad.at.z * tileSize - offset]} visible={show}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tileSize * 0.34, tileSize * 0.42, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color={color} transparent opacity={lit ? 0.95 : 0.6} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* The click target: the whole pad, faintly filled. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        raycast={show ? undefined : () => null}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      >
        <planeGeometry args={[tileSize * 0.62, tileSize * 0.62]} />
        <meshBasicMaterial color={color} transparent opacity={lit ? 0.28 : 0.1} depthWrite={false} />
      </mesh>
      {/* Turned 45° so it reads as a + from the game's diagonal camera. */}
      <group position={[0, 0.08, 0]} rotation={[0, Math.PI / 4, 0]} scale={lit ? 1.15 : 1}>
        <mesh raycast={() => null}><boxGeometry args={[arm * 2, 0.06, bar]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
        <mesh raycast={() => null}><boxGeometry args={[bar, 0.06, arm * 2]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      </group>
      {open && children}
    </group>
  );
};

const BuildPads: React.FC<{
  pads: readonly FreePad[];
  // Hides every pad (while placing a wall, or spectating).
  hidden?: boolean;
  tileSize: number;
  offset: number;
  teamColor: string;
  openKey: string | null;
  onToggle: (key: string) => void;
  cores: number;
  hasDepot: boolean;
  hasMason: boolean;
  onBuild: (type: StructureType, at: GridPos) => void;
}> = ({ pads, hidden = false, tileSize, offset, teamColor, openKey, onToggle, cores, hasDepot, hasMason, onBuild }) => (
  <>
    {pads.map(p => {
      const key = padKey(p.at);
      const show = !hidden && !p.taken;
      return (
        <PadMarker key={key} pad={p} show={show} open={show && openKey === key} color={p.kind === 'turret' ? TURRET_COLOR : teamColor}
          tileSize={tileSize} offset={offset} onToggle={() => onToggle(key)}>
          <Html position={[0, 1, 0]} zIndexRange={Z_OPEN}>
            <BesidePad>
              <PadMenu kind={p.kind} cores={cores} hasDepot={hasDepot} hasMason={hasMason} onBuild={type => onBuild(type, p.at)} />
            </BesidePad>
          </Html>
        </PadMarker>
      );
    })}
  </>
);

export default BuildPads;
