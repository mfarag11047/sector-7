
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { StructureData, UnitType } from '../types';
import StructureStatus from './StructureStatus';
import { UNIT_STATS } from '../constants';
import { facingOwnerView } from './kit/facing';
import { CommandHqModel } from './models/CommandHqModel';
import { TIER_RESEARCH_COST, UNIT_RULES } from '../sim/units';

// Where its status bar and menu sit: above the cab, below the mast.
const HQ_HEIGHT = 17;

// What the HQ itself trains.
const HQ_UNITS = (Object.keys(UNIT_RULES) as UnitType[]).filter(t => UNIT_RULES[t].producer === 'hq');
import { isObjectInFrustum, isPointInFrustum } from '../frustum';

interface BaseProps {
  position: [number, number, number];
  gridPos: { x: number; z: number };
  teamColor: string;
  label: string;
  onMoveCommand?: (x: number, z: number) => void;
  onRightClick?: (x: number, z: number) => void;
  onDoubleClick?: (e: any, gridPos: {x: number, z: number}) => void;
  menuOpen?: boolean;
  resources?: number;
  // The HQ structure from game state, for its health bar.
  hq?: StructureData;
  // Research, for the owner: the tier reached, compute in hand, and the order to send.
  tier?: number;
  compute?: number;
  onResearch?: (tier: 2 | 3) => void;
  // Units the HQ trains (the scout car), for the owner.
  onTrain?: (unitType: UnitType) => void;
  // 0 to 1 while a newly ordered HQ goes up (sim/bases.ts); it rises out of the ground.
  buildProgress?: number;
  // Free building pads and turret corners across all the owner's Command HQs (sim/baseLayout.ts).
  freePads?: { building: number; turret: number };
}

const Base: React.FC<BaseProps> = ({ 
  position, gridPos, teamColor, label, onMoveCommand, onRightClick, onDoubleClick, menuOpen, resources = 0, hq, tier = 1, compute = 0, onResearch, onTrain, buildProgress = 1, freePads
}) => {
  const baseGroupRef = useRef<THREE.Group>(null);
  
  // Animation for radar rotation and visibility culling
  useFrame(() => {
    if (baseGroupRef.current) {
        const isVisible = isObjectInFrustum(baseGroupRef.current, 30);
        if (baseGroupRef.current.visible !== isVisible) {
            baseGroupRef.current.visible = isVisible;
        }
    }
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (onMoveCommand) {
      onMoveCommand(gridPos.x, gridPos.z);
    }
  };

  const handleRightClick = (e: any) => {
      e.stopPropagation();
      if (onRightClick) {
          onRightClick(gridPos.x, gridPos.z);
      }
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    if (onDoubleClick) {
      onDoubleClick(e, gridPos);
    }
  }


  // The HQ faces its owner's view (kit/facing.ts).
  const facing = useMemo(() => facingOwnerView(gridPos), [gridPos.x, gridPos.z]);
  // The model itself, built once per team colour: the map re-renders on every game tick and gives
  // the HQ new props each time.
  const hqModel = useMemo(() => <group rotation={[0, facing, 0]}><CommandHqModel teamColor={teamColor} /></group>, [teamColor, facing]);

  return (
    <group 
      ref={baseGroupRef}
      position={position} 
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={() => (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {hq && <StructureStatus data={hq} height={HQ_HEIGHT} />}
      {/* A new HQ rises out of the ground as it is built. */}
      <group scale={[1, Math.max(0.12, buildProgress), 1]}>
      {hqModel}

      {/* Construction Menu Overlay */}
      </group>

      {menuOpen && (
        <Html position={[0, HQ_HEIGHT, 0]} center zIndexRange={[200, 0]}>
          <div className="hud-plate hud-corners hud-menu backdrop-blur min-w-[220px] overflow-hidden flex flex-col pointer-events-auto">
             <div className="px-3 py-2 border-b border-cyan-400/30 flex justify-between items-center">
                <span className="text-cyan-400 font-mono font-bold text-xs uppercase">Command HQ</span>
                <span className={`text-[10px] font-mono ${resources > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {resources} Cores
                </span>
             </div>
             
             {freePads && (
                <div className="px-3 py-1 border-b border-cyan-400/20 text-[9px] font-mono text-slate-400">
                    Building pads free: <span className={freePads.building > 0 ? 'text-cyan-300' : 'text-red-400'}>{freePads.building}</span>
                    {' · '}Turret corners free: <span className={freePads.turret > 0 ? 'text-cyan-300' : 'text-red-400'}>{freePads.turret}</span>
                    {freePads.building + freePads.turret > 0 && <div className="text-cyan-300/80">Click a + on a free pad around the HQ to build there</div>}
                    {freePads.building === 0 && <div className="text-amber-300">Build another Command HQ for more pads</div>}
                </div>
             )}
             <div className="flex flex-col gap-1 p-1">
                {onResearch && tier < 3 && (() => {
                    const next = (tier + 1) as 2 | 3;
                    const ready = compute >= TIER_RESEARCH_COST[next];
                    return (
                        <button
                            disabled={!ready}
                            onClick={(e) => { e.stopPropagation(); onResearch(next); }}
                            className={`flex items-center justify-between px-3 py-2 text-left rounded border ${ready ? 'border-blue-300 bg-blue-500/20 text-white hover:bg-blue-500/40' : 'border-slate-700 opacity-60 text-slate-400 cursor-not-allowed'}`}
                        >
                            <div className="flex flex-col">
                                <span className="text-xs font-mono font-bold">Research Tier {next}</span>
                                <span className="text-[9px] font-mono text-slate-400">Unlocks for good · compute from server nodes</span>
                            </div>
                            <span className="text-[10px] font-mono text-blue-300">{Math.floor(compute)}/{TIER_RESEARCH_COST[next]} ⚡</span>
                        </button>
                    );
                })()}
                {onTrain && HQ_UNITS.map(unitType => {
                    const stats = UNIT_STATS[unitType];
                    const canAfford = resources >= stats.cost;
                    const queued = hq?.queue?.filter(q => q.unitType === unitType).length ?? 0;
                    const head = hq?.queue?.[0];
                    const progress = head && head.unitType === unitType ? 1 - head.remainingMs / head.totalMs : 0;
                    return (
                        <button
                            key={unitType}
                            disabled={!canAfford}
                            onClick={(e) => { e.stopPropagation(); if (canAfford) onTrain(unitType); }}
                            className={`relative overflow-hidden flex items-center justify-between px-3 py-2 text-left rounded border ${canAfford ? 'border-emerald-400/40 hover:bg-emerald-900/30 text-slate-200' : 'border-slate-700 opacity-50 text-slate-500 cursor-not-allowed'}`}
                        >
                            {queued > 0 && <div className="absolute left-0 bottom-0 h-0.5 bg-emerald-400" style={{ width: `${progress * 100}%` }} />}
                            <div className="flex flex-col">
                                <span className="text-xs font-mono font-bold">Train {stats.label}{queued > 0 ? ` ×${queued}` : ''}</span>
                                <span className="text-[9px] font-mono text-slate-500">Fast unarmed scout · {UNIT_RULES[unitType].buildTimeMs / 1000}s</span>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400">{stats.cost}</span>
                        </button>
                    );
                })}
             </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default Base;
