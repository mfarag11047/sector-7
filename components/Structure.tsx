
import StructureStatus from './StructureStatus';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import { DoctrineType, StructureData, StructureType, UnitClass, UnitType } from '../types';
import { heroOf, isHeroType } from '../sim/heroes';
import { upgradeClasses, upgradeDef, upgradesFor, upgradeTitle, type UpgradeDef, type UpgradeId } from '../sim/upgrades';
import { ABILITY_CONFIG, STRUCTURE_INFO, TEAM_COLORS, UNIT_CLASSES, UNIT_STATS } from '../constants';
import * as THREE from 'three';
import { isObjectInFrustum, isPointInFrustum } from '../frustum';
import { MAX_QUEUE } from '../sim/orders';
import { STRUCTURE_RULES, TIER_REQUIREMENT, UNIT_RULES, unitsProducedBy } from '../sim/units';
import { UPGRADE_BONUS } from '../sim/unitAbilities';
import { REFINERY } from '../sim/refinery';
import { builtCost, canDismantle, DISMANTLE, dismantleRefund, isUnfinished } from '../sim/dismantle';
import type { IncomeBreakdown } from '../sim/economy';
import { WARHEAD_LABEL, WARHEAD_LIST } from '../sim/warheads';
import { FAB_LAUNCH } from '../sim/abilities';
import { BarracksModel } from './models/BarracksModel';
import { FactoryModel } from './models/FactoryModel';
import { AirpadModel } from './models/AirpadModel';
import { CommLinkModel } from './models/CommLinkModel';
import { DepotModel } from './models/DepotModel';
import { OrdnanceFabModel } from './models/OrdnanceFabModel';
import { ResearchLabModel } from './models/ResearchLabModel';
import { RefineryModel } from './models/RefineryModel';
import { AaTurretModel } from './models/AaTurretModel';
import { SentryTurretModel } from './models/SentryTurretModel';
import { facingOwnerView } from './kit/facing';
import { isCompoundPiece } from '../sim/compound';

const NO_UPGRADES: readonly UpgradeId[] = [];

interface StructureProps {
  data: StructureData;
  tileSize: number;
  offset: number;
  onRightClick?: (x: number, z: number) => void;
  onDoubleClick?: (id: string) => void;
  onClick?: (id: string) => void; // Added for explicit click
  menuOpen?: boolean;
  onAction?: (action: string, payload?: any) => void;
  hasMason?: boolean;
  resources?: number;
  compute?: number;
  warheadStock?: { emp: number; he: number; wp: number };
  // The owner's tech tier and population, for the production menu.
  tier?: number;
  popUsed?: number;
  popCap?: number;
  // The owner's researched upgrades and those under way at any of its labs, for Advanced Research.
  upgrades?: readonly UpgradeId[];
  upgradesUnderway?: readonly UpgradeId[];
  // The owner's doctrine, and why it can't train its hero now (sim/heroes.ts), for Advanced Research.
  doctrine?: DoctrineType | null;
  heroBlocked?: string | null;
  // The side's income, for a Core Refinery's menu (sim/economy.ts incomeBreakdown).
  income?: IncomeBreakdown;
  // A Core Refinery's own share of node income, from its base's distance to a core node.
  refineryShare?: { multiplier: number; blocks: number | null };
  // Where each firing CIWS gun is shooting this frame (CityMap's CiwsTracers), for an AA Turret's gun to track.
  ciwsAims?: React.MutableRefObject<Map<string, THREE.Vector3>>;
  // Where a unit or structure is in the world now, for a Sentry Turret's gun to track its target.
  targetWorldOf?: (id: string) => THREE.Vector3 | undefined;
}



const MunitionsModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
  return (
    <group position={[0, 0, 0]}>
        <mesh position={[0, 1, 0]}>
            <boxGeometry args={[7, 2, 7]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            <Edges color="#1e293b" />
        </mesh>
        {[[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].map((pos, i) => (
             <mesh key={i} position={[pos[0], 1, pos[1]]}>
                 <boxGeometry args={[1.5, 2.2, 1.5]} />
                 <meshStandardMaterial color="#1e293b" />
                 <Edges color={teamColor} />
                 <mesh position={[0, 0.8, 0]}>
                     <boxGeometry args={[0.2, 0.8, 0.2]} />
                     <meshBasicMaterial color={color} />
                 </mesh>
             </mesh>
        ))}
        {[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map((pos, i) => (
            <group key={i} position={[pos[0], 2.01, pos[1]]}>
                <mesh rotation={[-Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[1.4, 1.4, 0.2, 16]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.11, 0]}>
                    <ringGeometry args={[1.0, 1.3, 16]} />
                    <meshBasicMaterial color="#fbbf24" />
                </mesh>
                <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI/4, 0]}>
                    <boxGeometry args={[2.6, 0.1, 0.2]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>
            </group>
        ))}
        {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, i) => (
             <group key={i} rotation={[0, rot, 0]}>
                 <mesh position={[3.6, 1, 0]}>
                     <boxGeometry args={[0.5, 1, 3]} />
                     <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <mesh position={[3.9, 1, 0]}>
                     <planeGeometry args={[0.1, 2.5]} />
                     <meshBasicMaterial color={color} />
                 </mesh>
             </group>
        ))}
        <group position={[-2.5, 2.5, 2.5]}>
             <mesh>
                 <cylinderGeometry args={[0.8, 1, 1, 8]} />
                 <meshStandardMaterial color="#1e293b" />
             </mesh>
             <mesh position={[0, 0.5, 0]} rotation={[0.5, 0.5, 0]}>
                 <cylinderGeometry args={[0.8, 0.1, 0.2]} />
                 <meshStandardMaterial color="#64748b" />
             </mesh>
        </group>
    </group>
  );
}


// The LOADING ZONE marking painted on every Depot's pad. It is drawn into a texture once and
// laid on the floor as part of the 3D scene, so menus and panels cover it like the rest of the
// map (an HTML overlay sat on top of every screen).
let loadingZoneTexture: THREE.CanvasTexture | null = null;
const getLoadingZoneTexture = () => {
    if (loadingZoneTexture) return loadingZoneTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 64px ui-monospace, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOADING ZONE', 256, 68);
    loadingZoneTexture = new THREE.CanvasTexture(canvas);
    loadingZoneTexture.colorSpace = THREE.SRGBColorSpace;
    loadingZoneTexture.anisotropy = 4;
    return loadingZoneTexture;
};

// Advanced Research: a lab block under a glass dome with a slowly turning holo-ring, which spins
// up while an upgrade is being researched.


// A building being taken down: a pulsing amber frame round it.
const DismantleFrame = ({ height, tileSize }: { height: number; tileSize: number }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(({ clock }) => {
        if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.sin(clock.elapsedTime * 6);
    });
    return (
        <mesh ref={ref} position={[0, height * 0.6, 0]} raycast={() => null}>
            <boxGeometry args={[tileSize * 0.9, height * 1.2, tileSize * 0.9]} />
            <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.6} toneMapped={false} />
        </mesh>
    );
};



const wallSpan = (tileSize: number) => tileSize * 0.97;

// Low square of tank traps. The curb closes every side of the tile; the teeth fill the interior.
const WallTier1Model = ({ color, teamColor, tileSize }: { color: string, teamColor: string, tileSize: number }) => {
    const span = wallSpan(tileSize);
    const curb = 0.9;
    const count = 4;
    const inner = span - curb * 2 - 1.2;
    const step = inner / (count - 1);
    const origin = -inner / 2;
    const teeth = [];
    for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) {
            teeth.push({
                x: origin + i * step,
                z: origin + j * step,
                h: 1.15 + ((i + j * 2) % 3) * 0.42,
            });
        }
    }
    const sides = [
        { pos: [0, 0.4, span / 2 - curb / 2] as [number, number, number], size: [span, 0.8, curb] as [number, number, number] },
        { pos: [0, 0.4, -span / 2 + curb / 2] as [number, number, number], size: [span, 0.8, curb] as [number, number, number] },
        { pos: [span / 2 - curb / 2, 0.4, 0] as [number, number, number], size: [curb, 0.8, span] as [number, number, number] },
        { pos: [-span / 2 + curb / 2, 0.4, 0] as [number, number, number], size: [curb, 0.8, span] as [number, number, number] },
    ];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    return (
        <group>
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[span, span]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[span - curb * 1.4, span - curb * 1.4]} />
                <meshBasicMaterial color={teamColor} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {sides.map((side, i) => (
                <mesh key={i} position={side.pos}>
                    <boxGeometry args={side.size} />
                    <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.35} />
                    <Edges color={color} />
                </mesh>
            ))}
            {teeth.map((tooth, i) => (
                <mesh key={i} position={[tooth.x, tooth.h / 2, tooth.z]} rotation={[0, Math.PI / 4, 0]}>
                    <coneGeometry args={[0.72, tooth.h, 4]} />
                    <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.25} />
                </mesh>
            ))}
            {corners.map(([sx, sz], i) => (
                <group key={i} position={[sx * (span / 2 - 0.7), 0, sz * (span / 2 - 0.7)]}>
                    <mesh position={[0, 1.15, 0]}>
                        <boxGeometry args={[1.1, 2.3, 1.1]} />
                        <meshStandardMaterial color="#334155" metalness={0.8} />
                        <Edges color={color} />
                    </mesh>
                    <mesh position={[0, 2.45, 0]}>
                        <sphereGeometry args={[0.28, 10, 10]} />
                        <meshBasicMaterial color="#ef4444" toneMapped={false} />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

// Tall armored block. A solid mass on every face, so the tile reads as a bastion rather than a fence.
const WallTier2Model = ({ teamColor, tileSize }: { color: string, teamColor: string, tileSize: number }) => {
    const span = wallSpan(tileSize);
    const height = 3.6;
    const merlons = 5;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    return (
        <group>
            <mesh position={[0, height / 2, 0]}>
                <boxGeometry args={[span, height, span]} />
                <meshStandardMaterial color="#334155" metalness={0.72} roughness={0.32} />
                <Edges color="#0f172a" threshold={20} />
            </mesh>
            {[0, 1, 2, 3].map(face => (
                <group key={face} rotation={[0, face * Math.PI / 2, 0]}>
                    <mesh position={[0, height * 0.62, span / 2 + 0.05]}>
                        <boxGeometry args={[span * 0.78, 0.22, 0.08]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>
                    <mesh position={[0, height * 0.32, span / 2 + 0.06]}>
                        <boxGeometry args={[1.6, 0.28, 0.08]} />
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </mesh>
                    {Array.from({ length: merlons }).map((_, i) => {
                        const x = (i - (merlons - 1) / 2) * (span / merlons);
                        return (
                            <mesh key={i} position={[x, height + 0.32, span / 2 - 0.45]}>
                                <boxGeometry args={[span / merlons * 0.52, 0.64, 0.9]} />
                                <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
                            </mesh>
                        );
                    })}
                </group>
            ))}
            {corners.map(([sx, sz], i) => (
                <mesh key={i} position={[sx * (span / 2 - 0.35), height + 0.85, sz * (span / 2 - 0.35)]} rotation={[0, Math.PI / 4, 0]}>
                    <coneGeometry args={[0.38, 0.95, 4]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
                </mesh>
            ))}
        </group>
    );
};

const Structure: React.FC<StructureProps> = ({ data, tileSize, offset, onRightClick, onDoubleClick, onClick, menuOpen, onAction, hasMason, resources = 0, compute = 0, warheadStock, tier = 1, popUsed = 0, popCap = 0, upgrades = NO_UPGRADES, upgradesUnderway = NO_UPGRADES, income, refineryShare, doctrine, heroBlocked, ciwsAims, targetWorldOf }) => {
  // Advanced Research menu: a unit class, then a unit, then its upgrades.
  const [labClass, setLabClass] = React.useState<UnitClass | null>(null);
  // Disassemble asks twice.
  const [confirmTeardown, setConfirmTeardown] = React.useState(false);
  React.useEffect(() => { if (!menuOpen) setConfirmTeardown(false); }, [menuOpen]);
  const [labUnit, setLabUnit] = React.useState<UnitType | null>(null);
  useEffect(() => { if (!menuOpen) { setLabClass(null); setLabUnit(null); } }, [menuOpen]);
  const config = STRUCTURE_INFO[data.type];
  const teamColor = TEAM_COLORS[data.team];

  const position = useMemo(() => [
    (data.gridPos.x * tileSize) - offset,
    0,
    (data.gridPos.z * tileSize) - offset
  ] as [number, number, number], [data.gridPos, tileSize, offset]);

  const [inView, setInView] = React.useState(true);
  
  useFrame((state) => {
      // Distance culling to stop React rendering of heavy Html and elements if far
      // Note: we can mutate a ref's visible property, but for Html we might want conditional rendering
      // or just mutability. Mutability is faster!
  });

  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
      if (groupRef.current) {
          const isVisible = isObjectInFrustum(groupRef.current, 20);
          if (groupRef.current.visible !== isVisible) {
              groupRef.current.visible = isVisible;
          }
      }
  });

  const handleRightClick = (e: any) => {
    e.stopPropagation();
    if (onRightClick) onRightClick(data.gridPos.x, data.gridPos.z);
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(data.id);
  }

  const handleClick = (e: any) => {
      e.stopPropagation();
      if (onClick) onClick(data.id);
  }

  // Taking the building down (sim/dismantle.ts): a confirm step, then its progress and a Stop.
  const renderDisassemble = () => {
    const d = data.dismantle;
    const unfinished = isUnfinished(data);
    const back = unfinished ? builtCost(data) : dismantleRefund(data);
    if (d) {
        const pct = Math.min(100, Math.floor((1 - d.remainingMs / d.totalMs) * 100));
        return (
            <div className="flex flex-col gap-1 px-1 mt-2 pt-1 border-t border-slate-700 text-[10px] font-mono">
                <div className="text-amber-300 uppercase">Disassembling {pct}% · +{d.refund} cores when done</div>
                <div className="hud-meter w-full h-1.5"><div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, pct)}%` }} /></div>
                <button onClick={(e) => { e.stopPropagation(); onAction && onAction('DISASSEMBLE'); }}
                    className="px-2 py-1 text-left rounded text-slate-200 hover:bg-slate-700">Stop disassembling</button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1 px-1 mt-2 pt-1 border-t border-slate-700 text-[10px] font-mono">
            {!confirmTeardown ? (
                <button onClick={(e) => { e.stopPropagation(); setConfirmTeardown(true); }}
                    className="px-2 py-1 text-left rounded text-rose-300 hover:bg-rose-900/30">
                    {unfinished ? 'Cancel construction' : 'Disassemble'}
                </button>
            ) : (
                <div className="flex flex-col gap-1">
                    <span className="text-slate-400 leading-snug">{unfinished
                        ? `Cancel it and get all ${back} cores back?`
                        : `Take it down over ${DISMANTLE.ms / 1000}s and get ${back} cores back (${Math.round(DISMANTLE.refundShare * 100)}%)? It stops working now${data.queue?.length || data.research || data.production?.active || data.refineryUpgrade ? '; what it is doing is cancelled and refunded' : ''}.`}</span>
                    <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setConfirmTeardown(false); onAction && onAction('DISASSEMBLE'); }}
                            className="flex-1 px-2 py-1 rounded border border-rose-400/60 text-rose-200 hover:bg-rose-900/40">Confirm (+{back})</button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmTeardown(false); }}
                            className="flex-1 px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700">Keep</button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  // Core Refinery (sim/refinery.ts): what it and the side's refineries make, and its upgrade.
  const renderRefinery = () => {
    const level = data.refineryLevel === 2 ? 2 : 1;
    const constructing = (data.buildRemainingMs || 0) > 0;
    const up = data.refineryUpgrade;
    const blocked = level === 2 ? null
        : constructing ? 'Under construction'
        : data.dismantle ? 'Disassembling'
        : up ? null
        : tier < REFINERY.upgrade.tier ? `🔒 Tier ${REFINERY.upgrade.tier}`
        : resources < REFINERY.upgrade.cost ? `${REFINERY.upgrade.cost} cores` : null;
    const r = income?.refineries;
    // This refinery's share: from how near its base is to a core node (sim/refinery.ts).
    const mine = refineryShare ?? r?.each.find(e => e.id === data.id) ?? { multiplier: REFINERY.proximity.min, blocks: null };
    return (
        <div className="flex flex-col gap-1 px-1 mt-1 text-[10px] font-mono">
            <div className="flex justify-between"><span className="text-slate-400 uppercase">Level</span><span className="text-amber-300">{level}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">This refinery</span><span className="text-emerald-300">+{REFINERY.flat[level]} cores/s</span></div>
            {r && income && (
                <>
                    <div className="flex justify-between"><span className="text-slate-400">All refineries ({r.count})</span><span className="text-emerald-300">+{(r.flat + r.bonus).toFixed(1)}/s</span></div>
                    <div className="text-[9px] text-slate-500 leading-snug">+{Math.round(r.multiplier * 100)}% of node income ({income.nodes}/s){r.multiplier >= REFINERY.maxMultiplier ? ' · at the cap' : ''}. This one adds {Math.round(mine.multiplier * 100)}%{mine.blocks !== null ? `: its base is ${mine.blocks} city block${mine.blocks === 1 ? '' : 's'} from a core node` : ''} ({Math.round(REFINERY.proximity.best * 100)}% next to one, down to {Math.round(REFINERY.proximity.min * 100)}% far away). All together up to {Math.round(REFINERY.maxMultiplier * 100)}%.</div>
                </>
            )}
            {up && (
                <div className="mt-1">
                    <div className="text-[9px] text-yellow-300 uppercase">Upgrading to level 2 {Math.min(100, Math.floor((1 - up.remainingMs / up.totalMs) * 100))}%</div>
                    <div className="hud-meter w-full h-1.5 mt-1"><div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, Math.min(100, (1 - up.remainingMs / up.totalMs) * 100))}%` }} /></div>
                </div>
            )}
            {level === 1 && !up && (
                <button disabled={!!blocked}
                    onClick={(e) => { e.stopPropagation(); onAction && onAction('UPGRADE_REFINERY'); }}
                    className={`mt-1 flex items-center justify-between gap-2 px-2 py-2 text-left rounded border ${!blocked ? 'border-amber-400/60 hover:bg-amber-900/30 text-slate-200' : 'border-slate-700 text-slate-500 cursor-not-allowed'}`}>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold">Upgrade to level 2</span>
                        <span className="text-[9px] text-slate-400">+{REFINERY.flat[2]} cores/s from this refinery (from +{REFINERY.flat[1]}). Multiplier unchanged.</span>
                        <span className="text-[9px] text-slate-500">{blocked ?? `${REFINERY.upgrade.ms / 1000}s`}</span>
                    </div>
                    <span className={resources >= REFINERY.upgrade.cost ? 'text-cyan-400' : 'text-red-400'}>{REFINERY.upgrade.cost}</span>
                </button>
            )}
        </div>
    );
  };

  // Advanced Research: unit classes, then their units, then each unit's upgrades (sim/upgrades.ts).
  const renderResearch = () => {
    const constructing = (data.buildRemainingMs || 0) > 0;
    const done = (id: UpgradeId) => upgrades.includes(id);
    const tally = (list: readonly UpgradeDef[]) => `${list.filter(u => done(u.id)).length}/${list.length}`;
    const back = (to: () => void, label: string) => (
        <button onClick={(e) => { e.stopPropagation(); to(); }} className="px-2 py-1 text-left rounded text-[10px] font-mono uppercase text-cyan-300 hover:bg-slate-700">‹ {label}</button>
    );
    const row = (key: string, label: React.ReactNode, sub: string, right: string, onPick?: () => void) => (
        <button key={key} disabled={!onPick} onClick={(e) => { e.stopPropagation(); onPick?.(); }}
            className={`flex items-center justify-between px-3 py-2 text-left rounded text-xs font-mono ${onPick ? 'hover:bg-slate-700 text-slate-200' : 'text-slate-500 cursor-default'}`}>
            <div className="flex flex-col"><span>{label}</span><span className="text-[9px] text-slate-500">{sub}</span></div>
            <span className="text-[10px] text-cyan-300 pl-2">{right}</span>
        </button>
    );
    const running = data.research;
    const hero = heroOf(doctrine);
    return (
        <>
            <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1">{constructing ? 'Under construction' : 'Unit upgrades'}</div>
            {running && (
                <div className="px-1 mb-1">
                    <div className="text-[9px] text-teal-300 font-mono uppercase">
                        Researching {(d => d ? upgradeTitle(d) : running.upgrade)(upgradeDef(running.upgrade))} {Math.min(100, Math.floor((1 - running.remainingMs / running.totalMs) * 100))}%
                    </div>
                    <div className="hud-meter w-full h-1.5 mt-1">
                        <div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, Math.min(100, (1 - running.remainingMs / running.totalMs) * 100))}%` }} />
                    </div>
                </div>
            )}
            {!labClass && hero && row('hero',
                <span className="flex gap-2 items-center"><span>★</span>Doctrine Hero</span>,
                UNIT_STATS[hero.unit].label, tally(upgradesFor(hero.unit)),
                () => { setLabClass(UNIT_STATS[hero.unit].unitClass); setLabUnit(hero.unit); })}
            {!labClass && upgradeClasses().map(c => row(c.unitClass,
                <span className="flex gap-2 items-center"><span>{UNIT_CLASSES[c.unitClass].icon}</span>{UNIT_CLASSES[c.unitClass].label}</span>,
                c.units.map(u => UNIT_STATS[u].label).join(' · '),
                tally(c.units.flatMap(upgradesFor)),
                () => setLabClass(c.unitClass)))}
            {labClass && !labUnit && (
                <>
                    {back(() => setLabClass(null), 'Classes')}
                    {upgradeClasses().find(c => c.unitClass === labClass)?.units.map(u => row(u, UNIT_STATS[u].label,
                        upgradesFor(u).map(x => x.name).join(' · '), tally(upgradesFor(u)), () => setLabUnit(u)))}
                </>
            )}
            {labClass && labUnit && (
                <>
                    {isHeroType(labUnit)
                        ? back(() => { setLabUnit(null); setLabClass(null); }, 'Classes')
                        : back(() => setLabUnit(null), UNIT_CLASSES[labClass].label)}
                    <div className="text-[10px] text-slate-300 font-mono uppercase px-1">{UNIT_STATS[labUnit].label}</div>
                    {upgradesFor(labUnit).map(u => {
                        const blocked = done(u.id) ? 'Researched'
                            : upgradesUnderway.includes(u.id) ? 'Researching'
                            : tier < u.tier ? `🔒 Tier ${u.tier}`
                            : u.requires && !done(u.requires) ? `🔒 ${upgradeDef(u.requires)!.name} first`
                            : constructing ? 'Under construction'
                            : data.dismantle ? 'Disassembling'
                            : running ? 'Lab busy'
                            : resources < u.cost ? `${u.cost} cores`
                            : compute < u.compute ? `${u.compute} compute` : null;
                        return (
                            <button key={u.id} disabled={!!blocked} title={u.description}
                                onClick={(e) => { e.stopPropagation(); onAction && onAction('RESEARCH_UPGRADE', u.id); }}
                                className={`flex items-center justify-between gap-2 px-3 py-2 text-left rounded text-xs font-mono ${!blocked ? 'hover:bg-slate-700 text-slate-200' : 'text-slate-500 cursor-not-allowed'}`}>
                                <div className="flex flex-col">
                                    <span className={done(u.id) ? 'text-emerald-300' : ''}>{done(u.id) ? '✓ ' : ''}{u.name} <span className="text-amber-300">T{u.tier}</span></span>
                                    <span className="text-[9px] text-slate-400 max-w-[190px] whitespace-normal">{u.description}</span>
                                    {!u.unlock && <span className="text-[9px] text-emerald-300/80">+{UPGRADE_BONUS.health * 100}% health · +{UPGRADE_BONUS.damage * 100}% damage</span>}
                                    <span className="text-[9px] text-slate-500">{blocked ?? `${u.researchMs / 1000}s research`}</span>
                                </div>
                                {!done(u.id) && (
                                    <span className="flex flex-col items-end text-[10px] whitespace-nowrap">
                                        <span className={resources >= u.cost ? '' : 'text-red-400'}>{u.cost}</span>
                                        <span className={compute >= u.compute ? 'text-blue-300' : 'text-red-400'}>{u.compute} ⚡</span>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </>
            )}
        </>
    );
  };

  // Depot Menu Content
  const renderMenu = () => {
    if (!menuOpen) return null;
    
    // Advanced Research trains only its side's own doctrine hero.
    const buildableUnits = unitsProducedBy(data.type).filter(t => !isHeroType(t) || t === heroOf(doctrine)?.unit);
    const queue = data.queue || [];
    const constructing = (data.buildRemainingMs || 0) > 0;
    // Coming down: it trains and builds nothing more.
    const idle = constructing || !!data.dismantle;

    // Walls from the Depot; turrets go on the free turret corners round an HQ (components/BuildPads.tsx).
    const engineeringItems: StructureType[] = ['wall_tier1', 'wall_tier2'];
    const engineeringRole: Partial<Record<StructureType, string>> = {
        wall_tier1: 'Blocks a lane', wall_tier2: 'Heavy wall',
    };

    return (
        <Html position={[0, 15, 0]} center zIndexRange={[200, 0]}>
            <div className="hud-plate hud-corners hud-menu backdrop-blur min-w-[220px] overflow-hidden flex flex-col pointer-events-auto">
                <div className="px-3 py-2 border-b border-cyan-400/30 flex justify-between items-center">
                    <span className="text-yellow-400 font-mono font-bold text-xs uppercase">{config.label}</span>
                    <span className="text-[10px] text-white font-mono">{Math.floor(resources || 0)} Cores</span>
                </div>
                <div className="p-2 flex flex-col gap-1">
                    
                    {/* Unit Production Section */}
                    {buildableUnits.length > 0 && (
                        <>
                            <div className="flex justify-between text-[10px] text-slate-400 font-mono uppercase mb-1 px-1">
                                <span>{constructing ? 'Under construction' : data.dismantle ? 'Disassembling' : `Production · T${tier}`}</span>
                                <span className={popUsed >= popCap ? 'text-red-400' : ''}>Pop {popUsed}/{popCap === Infinity ? '∞' : popCap}</span>
                            </div>
                            {buildableUnits.map(uType => {
                                const stats = UNIT_STATS[uType];
                                const rules = UNIT_RULES[uType];
                                const cost = stats.cost || 0;
                                const locked = rules.tier > tier;
                                const full = queue.length >= MAX_QUEUE || popUsed + rules.pop > popCap;
                                const heroReason = isHeroType(uType) ? heroBlocked ?? null : null;
                                const ok = !idle && !locked && !full && !heroReason && (resources || 0) >= cost;
                                const queued = queue.filter(q => q.unitType === uType).length;
                                return (
                                    <button
                                        key={uType}
                                        disabled={!ok}
                                        title={locked ? TIER_REQUIREMENT[rules.tier] : rules.role}
                                        onClick={(e) => { e.stopPropagation(); onAction && onAction('BUILD_UNIT', uType); }}
                                        className={`
                                            flex items-center justify-between px-3 py-1.5 text-left transition-colors rounded text-xs font-mono
                                            ${ok ? 'hover:bg-slate-700 text-slate-200' : 'opacity-50 text-slate-500 cursor-not-allowed'}
                                        `}
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex gap-2 items-center">
                                                <span style={{ color: teamColor }}>{UNIT_CLASSES[stats.unitClass].icon}</span>
                                                {stats.label}
                                                {queued > 0 && <span className="text-cyan-300">×{queued}</span>}
                                            </div>
                                            <span className="text-[9px] text-slate-500 pl-5">
                                                {locked ? `🔒 ${TIER_REQUIREMENT[rules.tier]}` : heroReason ? `🔒 ${heroReason}` : `${rules.buildTimeMs / 1000}s · ${rules.pop} pop`}
                                            </span>
                                        </div>
                                        <span>{cost}</span>
                                    </button>
                                );
                            })}
                            <button
                                onClick={(e) => { e.stopPropagation(); onAction && onAction('SET_RALLY'); }}
                                className="mt-1 px-3 py-1 text-left rounded text-[10px] font-mono uppercase text-cyan-300 hover:bg-slate-700"
                            >
                                ⚑ Set rally point{data.rallyPoint ? ` (${data.rallyPoint.x},${data.rallyPoint.z})` : ''}
                            </button>
                        </>
                    )}

                    {data.type === 'ordnance_fab' && (
                        <>
                            <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1 mt-2 border-t border-slate-700 pt-1">Warheads</div>
                            <div className="text-[9px] text-slate-500 font-mono px-1 mb-1">
                                EMP {warheadStock?.emp ?? 0} · HE {warheadStock?.he ?? 0} · WP {warheadStock?.wp ?? 0}
                            </div>
                            {data.production?.active && (
                                <div className="px-1 mb-1">
                                    <div className="text-[9px] text-yellow-300 font-mono uppercase">
                                        Building {WARHEAD_LABEL[data.production.item]} {Math.min(100, Math.floor((data.production.progress / data.production.totalTime) * 100))}%
                                    </div>
                                    <div className="hud-meter w-full h-1.5 mt-1">
                                        <div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, Math.min(100, (data.production.progress / data.production.totalTime) * 100))}%` }} />
                                    </div>
                                </div>
                            )}
                            {([
                                { item: 'emp' as const, label: 'EMP Missile', cost: ABILITY_CONFIG.WARHEAD_COST_EMP, seconds: ABILITY_CONFIG.WARHEAD_BUILD_TIME_EMP / 1000 },
                                { item: 'he' as const, label: 'HE Missile (anti-armour)', cost: ABILITY_CONFIG.WARHEAD_COST_HE, seconds: ABILITY_CONFIG.WARHEAD_BUILD_TIME_HE / 1000 },
                                { item: 'wp' as const, label: 'White Phosphorus (anti-infantry)', cost: ABILITY_CONFIG.WARHEAD_COST_WP, seconds: ABILITY_CONFIG.WARHEAD_BUILD_TIME_WP / 1000 },
                            ]).map(missile => {
                                const busy = !!data.production?.active || !!data.dismantle;
                                const canAfford = resources >= missile.cost && !busy;
                                return (
                                    <button
                                        key={missile.item}
                                        disabled={!canAfford}
                                        onClick={(e) => { e.stopPropagation(); onAction && onAction('BUILD_WARHEAD', missile.item); }}
                                        className={`flex items-center justify-between px-3 py-2 text-left transition-colors rounded text-xs font-mono ${canAfford ? 'hover:bg-slate-700 text-slate-200' : 'opacity-50 text-slate-500 cursor-not-allowed'}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className={missile.item === 'emp' ? 'text-sky-300' : missile.item === 'wp' ? 'text-orange-200' : 'text-red-300'}>{missile.label}</span>
                                            <span className="text-[9px] text-slate-500">{missile.seconds}s</span>
                                        </div>
                                        <span>{missile.cost}</span>
                                    </button>
                                );
                            })}
                            {/* Missiles straight from the silo (sim/abilities.ts FAB_LAUNCH). */}
                            {(() => {
                                const readyIn = Math.max(0, (data.siloReadyAt ?? 0) - Date.now());
                                const blocked = tier < FAB_LAUNCH.tier ? `🔒 Tier ${FAB_LAUNCH.tier}`
                                    : constructing || data.dismantle ? 'Not working'
                                    : readyIn > 0 ? `Silo readying · ${Math.ceil(readyIn / 1000)}s` : null;
                                return (
                                    <>
                                        <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1 mt-2 border-t border-slate-700 pt-1">Launch from the silo</div>
                                        <div className="text-[9px] text-slate-500 font-mono px-1 mb-1">
                                            {blocked ?? `A stockpiled warhead, up to ${Math.floor(FAB_LAUNCH.range)} tiles away`}
                                        </div>
                                        {WARHEAD_LIST.map(item => {
                                            const stock = warheadStock?.[item] ?? 0;
                                            const ok = !blocked && stock > 0;
                                            return (
                                                <button
                                                    key={item}
                                                    disabled={!ok}
                                                    onClick={(e) => { e.stopPropagation(); onAction && onAction('FAB_LAUNCH', item); }}
                                                    className={`flex items-center justify-between px-3 py-1.5 text-left transition-colors rounded text-xs font-mono ${ok ? 'hover:bg-red-900/40 text-slate-200 border border-red-500/40' : 'opacity-50 text-slate-500 cursor-not-allowed'}`}
                                                >
                                                    <span className={item === 'emp' ? 'text-sky-300' : item === 'wp' ? 'text-orange-200' : 'text-red-300'}>Launch {WARHEAD_LABEL[item]}</span>
                                                    <span className="text-[10px]">{stock} in stock</span>
                                                </button>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </>
                    )}

                    {data.type === 'research_lab' && renderResearch()}
                    {data.type === 'refinery' && renderRefinery()}
                    {canDismantle(data.type) && renderDisassemble()}

                    {/* Engineering Section (Depot Only) */}
                    {data.type === 'builder' && (
                        <>
                            <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1 mt-2 border-t border-slate-700 pt-1">Defensive Structures</div>
                            {engineeringItems.map(type => {
                                const info = STRUCTURE_INFO[type];
                                const canAfford = (resources || 0) >= info.cost;
                                const trips = Math.max(1, Math.ceil(info.maxProgress / ABILITY_CONFIG.MASON_BUILD_AMOUNT));
                                return (
                                    <button
                                        key={type}
                                        disabled={!canAfford || !hasMason || !!data.dismantle}
                                        onClick={(e) => { e.stopPropagation(); onAction && onAction('SELECT_WALL', type); }}
                                        className={`
                                            flex items-center justify-between px-3 py-2 text-left transition-colors rounded text-xs font-mono
                                            ${(canAfford && hasMason)
                                                ? 'hover:bg-slate-700 text-slate-200' 
                                                : 'opacity-50 text-slate-500 cursor-not-allowed'}
                                        `}
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex gap-2 items-center">
                                                <span style={{ color: info.color }}>■</span>
                                                {info.label}
                                            </div>
                                            {engineeringRole[type] && <span className="text-[9px] text-cyan-300/80 pl-5">{engineeringRole[type]}</span>}
                                            <span className="text-[9px] text-slate-500 pl-5">{trips} {trips === 1 ? 'trip' : 'trips'} · {info.maxHealth} hp</span>
                                        </div>
                                        <span>{info.cost}</span>
                                    </button>
                                );
                            })}
                            {!hasMason && (
                                <div className="mt-1 text-[9px] text-red-400 px-2 italic">
                                    Requires Combat Engineer unit.
                                </div>
                            )}
                            <div className="mt-1 text-[9px] text-amber-300/80 px-2">Turrets: click a + on a free turret corner of a Command HQ.</div>
                        </>
                    )}
                </div>
            </div>
        </Html>
    );
  };

  const renderProgressBar = (heightOffset: number = 4) => {
    if (!data.isBlueprint || data.maxProgress <= 0) return null;
    const pct = Math.min(100, Math.floor((data.constructionProgress / data.maxProgress) * 100));
    const haulSize = ABILITY_CONFIG.MASON_BUILD_AMOUNT;
    const haulsDone = Math.min(Math.ceil(data.maxProgress / haulSize), Math.round(data.constructionProgress / haulSize));
    const haulsNeeded = Math.max(1, Math.ceil(data.maxProgress / haulSize));
    
    return (
        <Html position={[0, heightOffset, 0]} center zIndexRange={[100, 0]} distanceFactor={28}>
            <div className="flex flex-col items-center pointer-events-none select-none">
                 <div className="hud-plate hud-corners px-3 py-1.5">
                     <div className="text-[12px] font-mono text-yellow-300 font-bold whitespace-nowrap">
                         BUILDING {pct}%
                     </div>
                     <div className="text-[10px] font-mono text-white whitespace-nowrap">
                         Haul {haulsDone}/{haulsNeeded}
                     </div>
                     <div className="hud-meter w-24 h-2 mt-1">
                         <div 
                            className="hud-meter-cell h-full transition-all duration-300"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                         />
                     </div>
                 </div>
                 <div className="w-0.5 h-6 bg-yellow-400"></div>
            </div>
        </Html>
    );
  };

  const buildRatio = data.maxProgress > 0 ? Math.min(1, data.constructionProgress / data.maxProgress) : 1;

  // Determine which model to render
  const renderModel = () => {
    // The base walls and blast gates are drawn together by BaseCompound.tsx; only their health shows here.
    if (isCompoundPiece(data.type)) return null;
    // 1. Custom Models
    if (data.type === 'support') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><CommLinkModel teamColor={teamColor} /></group>;
    }
    if (data.type === 'infantry') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><BarracksModel teamColor={teamColor} /></group>;
    }
    if (data.type === 'armor') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><FactoryModel teamColor={teamColor} /></group>;
    }
    if (data.type === 'ordnance') {
        return <group scale={[1.9, 1.9, 1.9]}><MunitionsModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'air') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><AirpadModel teamColor={teamColor} /></group>;
    }
    if (data.type === 'builder') {
        // At work while it has a Mason in training.
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><DepotModel teamColor={teamColor} active={(data.queue?.length ?? 0) > 0} /></group>;
    }
    if (data.type === 'ordnance_fab') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><OrdnanceFabModel teamColor={teamColor} fabricating={data.production?.active ? data.production.item : null} siloReadyAt={data.siloReadyAt} /></group>;
    }
    if (data.type === 'refinery') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><RefineryModel teamColor={teamColor} level={data.refineryLevel === 2 ? 2 : 1} upgrading={!!data.refineryUpgrade} /></group>;
    }
    if (data.type === 'research_lab') {
        return <group rotation={[0, facingOwnerView(data.gridPos), 0]}><ResearchLabModel teamColor={teamColor} active={!!data.research} /></group>;
    }

    // 2. Specialized Existing Models
    if (data.type === 'wall_tier1') {
        const span = wallSpan(tileSize);
        const raised = Math.max(0.2, 2.4 * buildRatio);
        return (
            <group>
            {data.isBlueprint && (
                <group>
                    <mesh position={[0, 1.2, 0]}>
                        <boxGeometry args={[span, 2.4, span]} />
                        <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.4} />
                    </mesh>
                    <mesh position={[0, raised / 2, 0]}>
                        <boxGeometry args={[span * 0.92, raised, span * 0.92]} />
                        <meshStandardMaterial color="#94a3b8" emissive={teamColor} emissiveIntensity={0.35} />
                    </mesh>
                </group>
            )}
            
            {!data.isBlueprint && (
                <WallTier1Model color={config.color} teamColor={teamColor} tileSize={tileSize} />
            )}
            {renderProgressBar(4)}
            </group>
        );
    }

    if (data.type === 'wall_tier2') {
        const span = wallSpan(tileSize);
        const fullHeight = 3.6;
        const raised = Math.max(0.25, fullHeight * buildRatio);
        return (
            <group>
            {data.isBlueprint && (
                <group>
                    <mesh position={[0, fullHeight / 2, 0]}>
                        <boxGeometry args={[span, fullHeight, span]} />
                        <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.4} />
                    </mesh>
                    <mesh position={[0, raised / 2, 0]}>
                        <boxGeometry args={[span * 0.94, raised, span * 0.94]} />
                        <meshStandardMaterial color="#334155" emissive={teamColor} emissiveIntensity={0.25} />
                    </mesh>
                </group>
            )}
            
            {!data.isBlueprint && (
                <WallTier2Model color={config.color} teamColor={teamColor} tileSize={tileSize} />
            )}
            {renderProgressBar(fullHeight + 1.5)}
            </group>
        );
    }
    
    if (data.type === 'defense') {
        const turretHeight = Math.max(0.25, 2.2 * buildRatio);
        return (
            <group>
                {data.isBlueprint && (
                    <group>
                        <mesh position={[0, 0.2, 0]}>
                            <cylinderGeometry args={[tileSize * 0.4, tileSize * 0.5, 1, 8]} />
                            <meshStandardMaterial color="#1e293b" />
                            <Edges color={teamColor} />
                        </mesh>
                        <mesh position={[0, 1 + turretHeight / 2, 0]}>
                            <cylinderGeometry args={[0.35, 0.5, turretHeight, 8]} />
                            <meshStandardMaterial color="#ef4444" emissive={teamColor} emissiveIntensity={0.4} />
                        </mesh>
                    </group>
                )}
                {/* Facing out from the base, toward the map's centre, when it has nothing to shoot. */}
                {!data.isBlueprint && (
                    <group rotation={[0, facingOwnerView(data.gridPos) + Math.PI, 0]}>
                        <SentryTurretModel
                            teamColor={teamColor}
                            aimOf={() => data.combatTargetId ? targetWorldOf?.(data.combatTargetId) : undefined}
                            lastFiredAt={data.lastAttackTime}
                            cooldownMs={STRUCTURE_RULES.defense.weapon?.cooldownMs}
                        />
                    </group>
                )}
                {renderProgressBar(5)}
            </group>
        );
    }

    if (data.type === 'aa_turret') {
        const rise = Math.max(0.25, 3 * buildRatio);
        return (
            <group>
                {data.isBlueprint && (
                    <group>
                        <mesh position={[0, 0.2, 0]}>
                            <cylinderGeometry args={[tileSize * 0.4, tileSize * 0.5, 1, 10]} />
                            <meshStandardMaterial color="#1e293b" />
                            <Edges color={teamColor} />
                        </mesh>
                        <mesh position={[0, 1 + rise / 2, 0]}>
                            <cylinderGeometry args={[0.6, 0.8, rise, 10]} />
                            <meshStandardMaterial color="#38bdf8" emissive={teamColor} emissiveIntensity={0.4} />
                        </mesh>
                    </group>
                )}
                {!data.isBlueprint && (
                    <AaTurretModel teamColor={teamColor} firing={!!data.ciwsTargetId} aimOf={() => ciwsAims?.current.get(data.id)} />
                )}
                {renderProgressBar(5)}
            </group>
        );
    }

    // Fallback for any missed types (should be none now)
    return (
        <group>
            <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[tileSize * 0.9, 0.5, tileSize * 0.9]} />
                <meshStandardMaterial color="#1e293b" />
                <Edges color={teamColor} />
            </mesh>
            <mesh position={[0, config.height / 2, 0]}>
                <boxGeometry args={[tileSize * 0.6, config.height, tileSize * 0.6]} />
                <meshStandardMaterial color={config.color} metalness={0.6} roughness={0.2} />
                <Edges color="#ffffff" threshold={15} />
            </mesh>
            <group position={[0, config.height + 2, 0]}>
                <mesh rotation={[0, Math.PI / 4, 0]}>
                    <octahedronGeometry args={[1]} />
                    <meshBasicMaterial color={teamColor} wireframe />
                </mesh>
            </group>
        </group>
    );
  };

  return (
    <group ref={groupRef} position={position} onContextMenu={handleRightClick} onDoubleClick={handleDoubleClick} onClick={handleClick}>
      {renderMenu()}
      {renderModel()}
      {data.dismantle && <DismantleFrame height={config.height} tileSize={tileSize} />}
      <StructureStatus data={data} height={config.height} />
    </group>
  );
};

export default React.memo(Structure);
