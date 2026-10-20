
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GameStats, TeamStats, MinimapData, DoctrineType, DoctrineState } from '../types';
import { OperationsManual } from './OperationsManual';
import { ArmyControls, ArmyInfo, ArmyPanel, SelectionSummary } from './ArmyPanel';
import { ROLE_GLYPH, roleGlyphFilled, teamBadgeColor, UNIT_ROLE } from './unitIcons';
import { BUILDING_COLORS, TEAM_COLORS, ABILITY_CONFIG, STRUCTURE_INFO, CITY_CONFIG, DOCTRINE_CONFIG, TEAM_BASES } from '../constants';
import { ENERGY_GRID_COLOR, outerEnergyGridPolylines } from '../energyGrid';
import { GRID_TILES_PER_POP, POP_BASE, POP_MAX, POP_PER_CORE_NODE, TIER_REQUIREMENT, TIER_RESEARCH_COST } from '../sim/units';
import { DISTRICT_COLORS, districtBorders } from '../sim/districts';
import type { MatchConfig } from '../sim/match';
import type { MatchInfo } from './CityMap';
import type { Notice } from '../App';
import { dampenedUnits } from '../sim/ghost';

const EditableStat: React.FC<{
  value: number;
  icon?: React.ReactNode;
  label?: string;
  onSave: (val: number) => void;
  className?: string;
  baseColor?: string;
}> = ({ value, icon, label, onSave, className, baseColor }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
      if (!isEditing) setTempVal(value.toString());
  }, [value, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    const num = parseInt(tempVal);
    if (!isNaN(num)) {
      onSave(num);
    } else {
        setTempVal(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleCommit();
    if (e.key === 'Escape') {
        setIsEditing(false);
        setTempVal(value.toString());
    }
  };

  if (isEditing) {
    return (
      <div 
        className={`flex items-center gap-1 bg-slate-800 rounded p-1 ${className} pointer-events-auto border border-cyan-500/50 shadow-lg min-w-[80px]`}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && <span className="text-lg opacity-50">{icon}</span>}
        <input 
            ref={inputRef}
            type="number" 
            value={tempVal}
            onChange={(e) => setTempVal(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-white font-mono text-lg font-bold border-none outline-none focus:ring-0 p-0"
        />
      </div>
    );
  }

  return (
    <div 
        className={`flex items-center gap-1 cursor-pointer hover:bg-white/10 transition-all p-1 rounded border border-transparent hover:border-white/20 ${className} pointer-events-auto`}
        onClick={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            setIsEditing(true); 
        }}
        title="Click to Edit Value"
    >
        {icon && <span className="text-lg">{icon}</span>}
        <span className="text-white font-bold text-xl font-mono">{value}</span>
        {label && <span className={`${baseColor || 'text-slate-400'} text-[10px] font-mono`}>{label}</span>}
    </div>
  );
};

// Doctrine Icon Helper
const DoctrineIcon: React.FC<{ type: DoctrineType | null, className?: string }> = ({ type, className }) => {
    if (!type) return <span className={`text-slate-500 font-mono ${className}`}>-</span>;
    if (type === 'heavy_metal') return <span className={`text-orange-500 font-bold ${className}`}>⛨</span>;
    if (type === 'shadow_ops') return <span className={`text-purple-500 font-bold ${className}`}>👁</span>;
    if (type === 'netrunner') return <span className={`text-cyan-500 font-bold ${className}`}>⚡</span>;
    return null;
};

const TeamPanel: React.FC<{ team: 'blue' | 'red'; stats: TeamStats; align: 'left' | 'right'; isVisible: boolean; cheats: boolean; onResearch?: (tier: 2 | 3) => void }> = ({ team, stats, isVisible, cheats, onResearch }) => {
  const isBlue = team === 'blue';
  const baseColor = isBlue ? 'text-cyan-300' : 'text-rose-400';
  
  return (
    <div className={`
      hud-plate hud-corners backdrop-blur-md p-3 pointer-events-auto min-w-[300px] z-50
      flex flex-col gap-2 relative overflow-hidden transition-all duration-300
      ${!isVisible ? 'opacity-90' : 'opacity-100'}
    `}>

      <div className="flex justify-between items-baseline border-b border-cyan-400/25 pb-2 relative z-10">
        <div className="flex items-center gap-2">
            <h2 className={`text-xl font-bold font-mono uppercase tracking-widest ${baseColor} ${isBlue ? 'hud-glow-blue' : 'hud-glow-red'}`}>
            {team} TEAM
            </h2>
            {/* Doctrine Indicator */}
            {stats.doctrine?.selected && (
                <div className="bg-slate-800 rounded px-1.5 py-0.5 border border-slate-700 flex items-center" title={`Doctrine: ${DOCTRINE_CONFIG[stats.doctrine.selected].label}`}>
                    <DoctrineIcon type={stats.doctrine.selected} className="text-sm" />
                </div>
            )}
        </div>
        <div className="flex items-baseline gap-4 pointer-events-auto">
          {isVisible ? (
            <>
                {/* Compute and cores. Editable as a cheat in the sandbox only. */}
                {cheats ? (
                  <>
                    <EditableStat 
                        value={Math.floor(stats.compute || 0)}
                        icon={<span className="text-blue-400">⚡</span>}
                        onSave={(val) => (window as any).GAME_CHEATS?.setCompute(team, val)}
                    />
                    <EditableStat 
                        value={Math.floor(stats.resources)}
                        label={stats.income > 0 ? `CORES +${stats.income}/s` : 'CORES'}
                        baseColor="hud-glow-amber"
                        onSave={(val) => (window as any).GAME_CHEATS?.setResources(team, val)}
                    />
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1" title="Compute: produced by server nodes (and a trickle from your HQ), spent researching tiers.">
                      <span className="text-blue-300 font-bold text-xl font-mono">⚡{Math.floor(stats.compute || 0)}</span>
                      <span className="text-blue-400 text-[10px] font-mono">+{(stats.computeRate ?? 0).toFixed(2).replace(/\.?0+$/, '')}/s</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-white font-bold text-xl font-mono">{Math.floor(stats.resources)}</span>
                      <span className="hud-glow-amber text-[10px] font-mono">CORES +{stats.income}/s</span>
                    </div>
                  </>
                )}
            </>
          ) : (
             <span className="text-slate-500 font-mono text-sm animate-pulse">ENCRYPTED</span>
          )}
        </div>
      </div>

      {isVisible && onResearch && (stats.tier ?? 1) < 3 && (() => {
        const next = ((stats.tier ?? 1) + 1) as 2 | 3;
        const cost = TIER_RESEARCH_COST[next];
        const have = stats.compute || 0;
        const ready = have >= cost;
        const eta = !ready && (stats.computeRate ?? 0) > 0 ? Math.ceil((cost - have) / stats.computeRate!) : 0;
        return (
          <button
            disabled={!ready}
            onClick={(e) => { e.stopPropagation(); onResearch(next); }}
            title={next === 2 ? 'Tier 2: Ghosts, Lancers, Titans, Aegis, Wasps, Hornets, Banshees, Field Fabricators and T2 doctrine powers' : 'Tier 3: Bombardment Drones, Ballistas and T3 doctrine powers'}
            className={`relative z-10 w-full flex items-center justify-between px-2 py-1 rounded border font-mono text-[11px] pointer-events-auto transition-colors ${ready ? 'border-blue-300 bg-blue-500/20 text-white hover:bg-blue-500/40 animate-pulse' : 'border-slate-700 text-slate-400 cursor-not-allowed'}`}
          >
            <span>RESEARCH TIER {next}</span>
            <span>{ready ? `${cost} ⚡` : `${Math.floor(have)}/${cost} ⚡${eta ? ` · ${eta}s` : ''}`}</span>
          </button>
        );
      })()}

      <div className="flex justify-between items-center relative z-10">
        <div className="flex flex-col">
            {isVisible ? (
                <span className="text-cyan-300 font-mono text-sm font-bold" title="Captured buildings feeding your energy grid">
                  {Object.entries(stats.buildings).reduce((sum, [type, count]) => type === 'core_node' ? sum : sum + count, 0)}
                </span>
            ) : (
                <span className="text-slate-600 font-mono text-sm">--</span>
            )}
          <span className="hud-label text-[10px] uppercase">Grid</span>
        </div>
        
        <div className="flex flex-col items-center" title="Core nodes held. Each pays cores and raises your population cap.">
           {isVisible ? (
                <span className="text-amber-300 font-mono text-sm font-bold">{stats.buildings.core_node}/6</span>
           ) : (
                <span className="text-slate-600 font-mono text-sm">--</span>
           )}
           <span className="hud-label text-[10px] uppercase">Cores</span>
        </div>

        <div className="flex flex-col items-center" title={`Tech tier from server nodes held. ${stats.tier && stats.tier < 3 ? 'Next: ' + TIER_REQUIREMENT[(stats.tier + 1) as 2 | 3] : 'Maximum tier'}`}>
           {isVisible ? (
                <span className="text-blue-300 font-mono text-sm font-bold">T{stats.tier ?? 1}</span>
           ) : (
                <span className="text-slate-600 font-mono text-sm">--</span>
           )}
           <span className="hud-label text-[10px] uppercase">Tier</span>
        </div>

        <div className="flex flex-col items-end" title={stats.popCap === Infinity ? 'Population used / cap' : `Population used / cap. Cap: ${POP_BASE} base + ${POP_PER_CORE_NODE} × ${stats.buildings.core_node} core nodes + 1 per ${GRID_TILES_PER_POP} grid tiles (${stats.gridTiles ?? 0} held), up to ${POP_MAX}`}>
           {isVisible ? (
                <span className={`font-mono text-sm font-bold ${(stats.pop ?? 0) >= (stats.popCap ?? 1) ? 'text-red-400' : 'text-white'}`}>{stats.pop ?? stats.units}/{stats.popCap === Infinity ? '∞' : stats.popCap ?? '-'}</span>
           ) : (
                <span className="text-slate-600 font-mono text-sm">--</span>
           )}
           <span className="hud-label text-[10px] uppercase">Pop</span>
        </div>
      </div>
    </div>
  );
};

// --- Memoized Minimap Background ---
const MinimapBackground = React.memo(({ 
    roadTiles, 
    buildings, 
    structures,
    revealedServerIds,
    gridSize
}: { 
    roadTiles: any[], 
    buildings: any[], 
    structures: any[],
    revealedServerIds?: Set<string>,
    gridSize: number
}) => {
    const districtEdges = useMemo(() => districtBorders(gridSize), [gridSize]);
    // The road network and district outlines never change: drawn once.
    const roads = useMemo(() => roadTiles.map((t, i) => (
        <rect key={`road-${i}`} x={t.x} y={t.z} width={1} height={1} fill={t.type === 'main' ? '#1e293b' : '#0f172a'} />
    )), [roadTiles]);
    const districts = useMemo(() => districtEdges.map((e, i) => (
        <line key={`district-${i}`} x1={e.x1} y1={e.z1} x2={e.x2} y2={e.z2}
            stroke={DISTRICT_COLORS[e.district]} strokeWidth={1.25} vectorEffect="non-scaling-stroke"
            strokeLinecap="square" opacity={0.8} />
    )), [districtEdges]);
    // Thousands of building tiles, a few of which change most ticks while infantry capture: each
    // tile's element is kept with its building and remade only when that building changes, so
    // React skips the rest at once.
    const tileCache = useRef(new WeakMap<object, { revealed: boolean; el: React.ReactElement }>());
    const buildingTiles = buildings.map((b) => {
        const revealed = !!revealedServerIds?.has(b.id);
        const hit = tileCache.current.get(b);
        if (hit && hit.revealed === revealed) return hit.el;
        const el = (
            <rect
                key={b.id}
                x={b.gridX}
                y={b.gridZ}
                width={1}
                height={1}
                fill={b.owner ? TEAM_COLORS[b.owner] : (b.type === 'core_node' ? BUILDING_COLORS.core_node : (b.type === 'server_node' && revealed ? '#1e3a8a' : '#64748b'))}
                opacity={0.8}
            />
        );
        tileCache.current.set(b, { revealed, el });
        return el;
    });
    return (
        <g>
            {/* Road Network */}
            {roads}
            {/* Districts: a faint outline round each part of the city, in its colour. */}
            {districts}
            {/* Buildings Layer. Unscouted server nodes use the generic building color so
                their tiles don't give away the sentinel standing on them. */}
            {buildingTiles}
            {/* Structures Layer */}
            {structures?.map((s) => s.type === 'hq' ? (
                // Each Command HQ as a 3x3 block in its team's colour.
                <rect key={s.id} x={s.gridPos.x - 1} y={s.gridPos.z - 1} width={3} height={3}
                    fill={TEAM_COLORS[s.team as 'blue' | 'red']} stroke="#e0f2fe" strokeWidth={0.25} opacity={s.health > 0 ? 0.95 : 0.3} />
            ) : (
                <rect 
                    key={s.id}
                    x={s.gridPos.x}
                    y={s.gridPos.z}
                    width={1}
                    height={1}
                    fill={STRUCTURE_INFO[s.type]?.color || (s.type === 'support' ? '#8b5cf6' : '#ffffff')}
                    opacity={0.9}
                />
            ))}
        </g>
    );
});

// Component to render the viewfinder rectangle
const MinimapViewfinder: React.FC<{ 
    cameraStateRef?: React.MutableRefObject<{ x: number, y: number, z: number, yaw: number }>;
    gridSize: number;
    tileSize: number;
}> = ({ cameraStateRef, gridSize, tileSize }) => {
    const rectRef = useRef<SVGRectElement>(null);

    useEffect(() => {
        let animId: number;
        
        const update = () => {
            if (rectRef.current && cameraStateRef && cameraStateRef.current) {
                const { x, y, z, yaw } = cameraStateRef.current;
                const offset = (gridSize * tileSize) / 2;
                
                // Convert World Coords to Grid Coords (0 to gridSize)
                const gx = (x + offset) / tileSize;
                const gz = (z + offset) / tileSize;
                
                // Approximation of visible area based on Zoom Height (y)
                const viewScalar = 1.2; 
                const h = (y / tileSize) * viewScalar;
                const aspect = window.innerWidth / window.innerHeight;
                const w = h * aspect;

                rectRef.current.setAttribute('x', String(gx - w/2));
                rectRef.current.setAttribute('y', String(gz - h/2));
                rectRef.current.setAttribute('width', String(w));
                rectRef.current.setAttribute('height', String(h));
                
                const degrees = (yaw * 180) / Math.PI;
                rectRef.current.setAttribute('transform', `rotate(${-degrees}, ${gx}, ${gz})`);
            }
            animId = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(animId);
    }, [gridSize, tileSize, cameraStateRef]);

    return <rect ref={rectRef} fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.8" />;
};

// Internal Doctrine HUD for Quick Actions
const DoctrineHUD: React.FC<{
    type: DoctrineType;
    unlockedTiers: number;
    resources: number;
    cooldowns?: { tier2: number; tier3: number };
    onTrigger: (type: string, tier: 2 | 3, cost: number) => void;
}> = ({ type, unlockedTiers, resources, cooldowns, onTrigger }) => {
    const config = DOCTRINE_CONFIG[type];
    
    // Theme Colors
    const theme = {
        heavy_metal: 'border-amber-400 text-amber-300',
        shadow_ops: 'border-fuchsia-400 text-fuchsia-300',
        netrunner: 'border-cyan-300 text-cyan-200',
    }[type];

    const wait2 = Math.ceil((cooldowns?.tier2 || 0) / 1000);
    const wait3 = Math.ceil((cooldowns?.tier3 || 0) / 1000);
    const canAfford2 = resources >= config.tier2_cost && wait2 === 0;
    const canAfford3 = resources >= config.tier3_cost && wait3 === 0;
    const isUnlocked2 = unlockedTiers >= 2;
    const isUnlocked3 = unlockedTiers >= 3;

    return (
        <div className={`hud-plate hud-corners p-3 border-2 ${theme} backdrop-blur-md flex flex-col gap-2 min-w-[200px] animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto relative overflow-hidden`}>
            <div className="flex justify-between items-center border-b border-white/20 pb-1 mb-1 relative z-10">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">Active Protocols</span>
                <DoctrineIcon type={type} className="text-sm" />
            </div>
            
            <div className="flex gap-2 relative z-10">
                {/* Tier 2 Button */}
                <button
                    disabled={!isUnlocked2 || !canAfford2}
                    onClick={() => onTrigger(`${type}_tier2`, 2, config.tier2_cost)}
                    title={config.tier2_desc}
                    className={`
                        flex-1 flex flex-col p-2 rounded border transition-all text-left relative overflow-hidden group
                        ${isUnlocked2 
                            ? (canAfford2 ? 'bg-black/40 hover:bg-white/10 border-white/20 hover:border-white/60 cursor-pointer' : 'bg-black/40 border-red-900/50 opacity-70') 
                            : 'bg-black/20 border-transparent opacity-40 cursor-not-allowed grayscale'
                        }
                    `}
                >
                    <span className="text-[9px] uppercase font-bold opacity-60">T2: {config.tier2_name}</span>
                    <span className="text-xs font-bold font-mono">
                        {!isUnlocked2 ? "LOCKED · 1 SERVER" : wait2 > 0 ? `${wait2}s` : "ACTIVATE"}
                    </span>
                    <div className="mt-auto pt-1 flex justify-between items-end">
                        <span className={`text-[9px] font-mono ${!canAfford2 && isUnlocked2 ? 'text-red-400' : 'text-slate-400'}`}>
                            {config.tier2_cost}
                        </span>
                    </div>
                    {/* Hover Tooltip Effect */}
                    {isUnlocked2 && (
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    )}
                </button>

                {/* Tier 3 Button */}
                <button
                    disabled={!isUnlocked3 || !canAfford3}
                    onClick={() => onTrigger(`${type}_tier3`, 3, config.tier3_cost)}
                    title={config.tier3_desc}
                    className={`
                        flex-1 flex flex-col p-2 rounded border transition-all text-left relative overflow-hidden group
                        ${isUnlocked3
                            ? (canAfford3 ? 'bg-black/40 hover:bg-white/10 border-white/20 hover:border-white/60 cursor-pointer' : 'bg-black/40 border-red-900/50 opacity-70') 
                            : 'bg-black/20 border-transparent opacity-40 cursor-not-allowed grayscale'
                        }
                    `}
                >
                    <span className="text-[9px] uppercase font-bold opacity-60">T3: {config.tier3_name}</span>
                    <span className="text-xs font-bold font-mono">
                        {!isUnlocked3 ? "LOCKED · 2 SERVERS" : wait3 > 0 ? `${wait3}s` : "EXECUTE"}
                    </span>
                    <div className="mt-auto pt-1 flex justify-between items-end">
                        <span className={`text-[9px] font-mono ${!canAfford3 && isUnlocked3 ? 'text-red-400' : 'text-slate-400'}`}>
                            {config.tier3_cost}
                        </span>
                    </div>
                     {isUnlocked3 && (
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    )}
                </button>
            </div>
        </div>
    );
};

// Doctrine Card Component (Selection Menu)
const DoctrineCard: React.FC<{ 
    type: DoctrineType, 
    active: boolean, 
    locked: boolean,
    unlockedTiers: number,
    resources: number,
    onSelect: () => void,
    onTrigger?: (type: string, tier: 2 | 3, cost: number) => void
}> = ({ type, active, locked, unlockedTiers, resources, onSelect, onTrigger }) => {
    const config = DOCTRINE_CONFIG[type];
    
    // Theme Colors
    const colors = {
        heavy_metal: 'border-amber-400 text-amber-300',
        shadow_ops: 'border-fuchsia-400 text-fuchsia-300',
        netrunner: 'border-cyan-300 text-cyan-200',
    };
    const theme = colors[type];

    const canAfford2 = resources >= config.tier2_cost;
    const canAfford3 = resources >= config.tier3_cost;

    return (
        <div 
            className={`
                hud-plate hud-corners relative p-4 border transition-all duration-300 flex flex-col gap-4
                ${active ? `${theme} scale-105` : 
                  locked ? 'border-slate-700 text-slate-600 grayscale cursor-not-allowed' :
                  `hover:border-cyan-200 cursor-pointer hover:scale-105`
                }
            `}
            onClick={() => !locked && !active && onSelect()}
        >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded bg-black/40`}>
                        <DoctrineIcon type={type} className="text-xl" />
                    </div>
                    <h3 className={`font-mono font-bold uppercase tracking-wider ${active ? 'text-white' : ''}`}>
                        {config.label}
                    </h3>
                </div>
                {active && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold uppercase">Active</span>}
            </div>

            {/* Passive */}
            <div className="bg-black/20 p-2 rounded">
                <div className="text-[10px] uppercase font-bold opacity-70 mb-1">Tier 1: Passive Protocol</div>
                <p className="text-xs leading-relaxed opacity-90">{config.tier1_passive}</p>
            </div>

            {/* Tiers Preview */}
            <div className="flex gap-2 mt-auto">
                <div className={`flex-1 p-2 rounded text-left border bg-black/20 border-white/10 opacity-60`}>
                    <div className="text-[9px] uppercase font-bold opacity-50 mb-1">Tier 2: {config.tier2_name}</div>
                    <div className="text-[10px] font-mono mb-1 text-cyan-400">{config.tier2_cost} Cores</div>
                    <p className="text-[10px] leading-tight text-slate-300">{config.tier2_desc}</p>
                </div>
                <div className={`flex-1 p-2 rounded text-left border bg-black/20 border-white/10 opacity-60`}>
                    <div className="text-[9px] uppercase font-bold opacity-50 mb-1">Tier 3: {config.tier3_name}</div>
                    <div className="text-[10px] font-mono mb-1 text-cyan-400">{config.tier3_cost} Cores</div>
                    <p className="text-[10px] leading-tight text-slate-300">{config.tier3_desc}</p>
                </div>
            </div>

            {/* Selection Overlay */}
            {!active && !locked && (
                <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    <span className="bg-white text-black font-bold px-4 py-2 rounded uppercase tracking-widest text-sm transform scale-110 shadow-lg">
                        Confirm Doctrine
                    </span>
                </div>
            )}
        </div>
    );
};

interface UIOverlayProps {
    stats: GameStats;
    minimapData: MinimapData;
    playerTeam: 'blue' | 'red';
    setPlayerTeam: (t: 'blue' | 'red') => void;
    cameraStateRef?: React.MutableRefObject<{ x: number, y: number, z: number, yaw: number }>;
    onSelectDoctrine: (team: 'blue' | 'red', doctrine: DoctrineType) => void;
    onTriggerDoctrine?: (team: 'blue' | 'red', type: string, tier: 2 | 3, cost: number) => void;
    interactionMode?: 'select' | 'target';
    match?: MatchConfig | null;
    matchInfo?: MatchInfo | null;
    notices?: Notice[];
    onResearch?: (tier: 2 | 3) => void;
    armyState?: { selection: SelectionSummary; armies: ArmyInfo[] };
    armyControlsRef?: React.MutableRefObject<ArmyControls | null>;
    // Opens the pacing report (components/PacingReport.tsx).
    onPacing?: () => void;
}

// What the player should be doing next, from where they stand.
const objective = (s: TeamStats) => {
  if (s.buildings.core_node === 0) return 'Send infantry to capture the core node near your base for income.';
  if ((s.tier ?? 1) < 3 && (s.compute ?? 0) >= TIER_RESEARCH_COST[((s.tier ?? 1) + 1) as 2 | 3]) return `You have the compute: research Tier ${(s.tier ?? 1) + 1} in your team panel.`;
  if ((s.tier ?? 1) < 2 && s.buildings.server_node === 0) return 'Build a Barracks and Factory, then take the guarded server node in your half for compute.';
  if ((s.tier ?? 1) < 2) return 'Compute is building up. Research Tier 2 when you reach it.';
  if ((s.tier ?? 1) < 3) return 'Take the contested flank or centre server nodes to research Tier 3 sooner.';
  return 'Destroy every enemy Command HQ to win: bring Titans, Lancers or artillery.';
};

const clockText = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const UIOverlay: React.FC<UIOverlayProps> = ({ stats, minimapData, playerTeam, setPlayerTeam, cameraStateRef, onSelectDoctrine, onTriggerDoctrine, interactionMode, match, matchInfo, notices = [], onResearch, armyState, armyControlsRef, onPacing }) => {
  const sandbox = match?.mode === 'sandbox';
  // AI vs AI: the viewer sees the whole map.
  const spectate = match?.mode === 'spectate';
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [isDoctrineOpen, setIsDoctrineOpen] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(false);

  // Minimap Scale / Viewbox
  const gridSize = minimapData.gridSize || 40;

  // Toggle Admin Team
  const toggleTeam = () => {
    setPlayerTeam(playerTeam === 'blue' ? 'red' : 'blue');
  };

  const activeStats = stats[playerTeam];
  const activeDoctrine = activeStats.doctrine?.selected || null;
  const unlockedTiers = activeStats.doctrine?.unlockedTiers || 0;

  // Sentinel positions stay hidden per team until one of that team's units scouts them.
  const knownGuardsRef = useRef<{ blue: Set<string>; red: Set<string> }>({ blue: new Set(), red: new Set() });

  // Fog of War Logic for Minimap Units
  // 1. Always show own units
  // 2. Show an enemy unit only while a friendly unit is within vision range
  // 3. A scouted sentinel stays revealed for that team
  const { visibleUnits, revealedServerKey } = useMemo(() => {
    const friendlies = minimapData.units.filter(u => u.team === playerTeam);
    const teamKey = playerTeam === 'blue' || playerTeam === 'red' ? playerTeam : null;
    const known = teamKey ? knownGuardsRef.current[teamKey] : null;

    const inFriendlyVision = (x: number, z: number, rangeLimit?: number) => friendlies.some(friendly => {
        const dist = Math.hypot(friendly.gridPos.x - x, friendly.gridPos.z - z);
        const range = rangeLimit ?? (friendly.visionRange || 2);
        return dist <= range;
    });

    // Enemy units under a Ghost's Dampener never show on this minimap (sim/ghost.ts).
    const dampened = dampenedUnits(minimapData.units);
    const visible = minimapData.units.filter(targetUnit => {
        if (targetUnit.team === playerTeam || spectate) return true;
        if (targetUnit.decoyActive || targetUnit.fieldCloaked) return false;
        if (dampened.has(targetUnit.id)) return false;
        if (targetUnit.type === 'defense_drone' && known?.has(targetUnit.id)) return true;

        // Enemy Unit Check against ALL friendly units using the specific vision range of the friendly
        const isDetected = inFriendlyVision(targetUnit.gridPos.x, targetUnit.gridPos.z);

        if (isDetected && targetUnit.type === 'defense_drone' && known) known.add(targetUnit.id);
        return isDetected;
    });

    const revealed: string[] = [];
    minimapData.buildings.forEach(b => {
        if (b.type !== 'server_node') return;
        const guard = minimapData.units.find(u => u.type === 'defense_drone' && u.gridPos.x === b.gridX && u.gridPos.z === b.gridZ);
        if (spectate || (guard && known?.has(guard.id)) || inFriendlyVision(b.gridX, b.gridZ)) revealed.push(b.id);
    });

    return { visibleUnits: visible, revealedServerKey: revealed.sort().join('|') };
  }, [minimapData.units, minimapData.buildings, playerTeam, spectate]);

  const revealedServerIds = useMemo(
    () => new Set(revealedServerKey ? revealedServerKey.split('|') : []),
    [revealedServerKey]
  );

  // Selected Unit Path Visualization (First unit only for now)
  const selectedUnitPath = useMemo(() => {
    if (!minimapData.selectedUnitIds || minimapData.selectedUnitIds.length === 0) return null;
    // Visualize only the first selected unit's path to avoid clutter
    const primaryId = minimapData.selectedUnitIds[0];
    const unit = minimapData.units.find(u => u.id === primaryId);
    if (!unit || unit.path.length === 0) return null;

    const points = [`${unit.gridPos.x + 0.5},${unit.gridPos.z + 0.5}`];
    unit.path.forEach(p => {
        const [x, z] = p.split(',');
        points.push(`${parseFloat(x) + 0.5},${parseFloat(z) + 0.5}`);
    });

    const destination = unit.path[unit.path.length - 1].split(',').map(Number);

    return {
        points: points.join(' '),
        destination: { x: destination[0] + 0.5, z: destination[1] + 0.5 }
    };
  }, [minimapData.selectedUnitIds, minimapData.units]);

  const energyGridOutline = useMemo(() => {
    const base = TEAM_BASES[playerTeam];
    const circles = [
      { x: base.x + 0.5, z: base.z + 0.5, radius: ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS },
      ...minimapData.buildings
        .filter(building => building.owner === playerTeam && building.type !== 'core_node')
        .map(building => ({ x: building.gridX + 0.5, z: building.gridZ + 0.5, radius: ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS })),
    ];
    return outerEnergyGridPolylines(circles);
  }, [minimapData.buildings, playerTeam]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-50">
      {/* Targeting Overlay */}
      {interactionMode === 'target' && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 hud-alert hud-corners px-6 py-2 text-sm font-mono font-bold tracking-widest z-[60]">
              TARGETING ACTIVE - CLICK MAP
          </div>
      )}

      {/* Top HUD: Team Stats */}
      <div className="flex justify-between items-start w-full relative z-50">
        
        {/* Match clock; the team switch in the sandbox and AI vs AI. */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-2 pointer-events-auto z-50 flex flex-col items-center gap-1">
             {matchInfo && (
                <div className="hud-plate hud-corners px-3 py-1 text-[11px] text-cyan-100 font-mono tracking-widest">
                    {clockText(matchInfo.elapsedMs)}{spectate && <span className="text-amber-200"> · AI VS AI</span>}
                </div>
             )}

             {/* Spectating, the side whose view is shown: its move orders, grid, radar and jamming,
                 with every unit on the map still in sight. */}
             {(sandbox || spectate) && <button 
                onClick={toggleTeam}
                className="hud-plate hud-corners px-3 py-1 text-[10px] text-cyan-200 font-mono uppercase tracking-widest transition-colors hover:text-white"
                title={spectate ? "Switch whose view you watch from: their move orders, energy grid, radar and jamming" : "Admin: Switch Player Team"}
             >
                {spectate ? 'Viewing as' : 'Playing As'}: <span className={playerTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}>{playerTeam.toUpperCase()}</span>
             </button>}
        </div>

        <TeamPanel team="blue" stats={stats.blue} align="left" isVisible={spectate || playerTeam === 'blue'} cheats={sandbox} onResearch={!spectate && playerTeam === 'blue' ? onResearch : undefined} />
        
        <div className="mt-8 flex flex-col items-center gap-2 pointer-events-auto">
            <h1 className="hud-label font-mono text-[10px] uppercase mt-6">Sector 7 Conflict</h1>
            <div className="flex gap-2">
                <button 
                    onClick={() => setIsIntelOpen(!isIntelOpen)}
                    className={`w-8 h-8 flex items-center justify-center border transition-all pointer-events-auto hud-corners ${
                    isIntelOpen 
                        ? 'bg-cyan-400 text-slate-950 border-cyan-200' 
                        : 'hud-plate text-cyan-200 hover:text-white'
                    }`}
                    title="Manual / Intel"
                >
                    <span className="font-mono font-bold text-sm">?</span>
                </button>
                {onPacing && (
                    <button
                        onClick={onPacing}
                        className="h-8 px-2 flex items-center justify-center border transition-all pointer-events-auto hud-corners hud-plate text-cyan-200 hover:text-white font-mono text-[10px] uppercase tracking-widest"
                        title="Match pacing report: milestones, army sizes over time, and unit stats"
                    >
                        Pacing
                    </button>
                )}
                {!spectate && <button 
                    onClick={() => setIsDoctrineOpen(!isDoctrineOpen)}
                    className={`w-8 h-8 flex items-center justify-center border transition-all pointer-events-auto hud-corners ${
                    isDoctrineOpen 
                        ? 'bg-amber-400 text-slate-950 border-amber-200' 
                        : 'hud-plate text-amber-300 hover:text-white'
                    }`}
                    title="Doctrine Protocols"
                >
                    <span className="font-mono font-bold text-lg">★</span>
                </button>}
            </div>
        </div>

        <TeamPanel team="red" stats={stats.red} align="right" isVisible={spectate || playerTeam === 'red'} cheats={sandbox} onResearch={!spectate && playerTeam === 'red' ? onResearch : undefined} />
      </div>

      {/* Operations Manual */}
      {isIntelOpen && <OperationsManual team={playerTeam} onClose={() => setIsIntelOpen(false)} />}

      {/* Doctrine Selection Modal */}
      {isDoctrineOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100] bg-black/60 backdrop-blur-sm">
          <div className="hud-plate hud-corners w-full max-w-4xl p-8 pointer-events-auto relative overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="relative flex justify-between items-center mb-8 border-b border-slate-600/60 pb-4">
                <div>
                    <h2 className="text-3xl font-bold text-white font-mono tracking-widest uppercase mb-1">
                        Faction Doctrine
                    </h2>
                    <p className="text-slate-400 text-sm">Select a strategic specialization. Protocols are permanent once initialized.</p>
                </div>
                <button 
                    onClick={() => setIsDoctrineOpen(false)}
                    className="text-slate-500 hover:text-white transition-colors text-sm font-mono border border-slate-700 hover:border-white px-3 py-1 rounded"
                >
                    CLOSE TERMINAL
                </button>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
                {(Object.keys(DOCTRINE_CONFIG) as DoctrineType[]).map((key) => (
                    <DoctrineCard 
                        key={key} 
                        type={key} 
                        active={activeDoctrine === key}
                        locked={activeDoctrine !== null && activeDoctrine !== key}
                        unlockedTiers={unlockedTiers}
                        resources={activeStats.resources}
                        onSelect={() => {
                            onSelectDoctrine(playerTeam, key);
                            // Keep open to see tier status or close?
                            // setIsDoctrineOpen(false); 
                        }}
                    />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Interface */}
      <div className="flex justify-between items-end z-50">
        <div className="flex flex-col gap-2">
            <div className="hud-plate hud-corners backdrop-blur-md p-3 pointer-events-auto max-w-sm relative overflow-hidden">
              <h3 className="relative hud-label text-[10px] font-mono uppercase mb-2 border-b border-cyan-400/25 pb-1 flex justify-between">
                System Message
              </h3>
              <p className="relative text-xs text-cyan-200 font-mono leading-relaxed hud-glow-cyan">
                &gt; {spectate ? `Spectating: the computer plays both sides. You see every unit; move orders, grid, radar and jamming are shown from ${playerTeam === 'blue' ? 'Blue' : 'Red'}'s side (switch under the clock). The pacing report has the timeline.` : objective(activeStats)}
              </p>
              {notices.length > 0 && (
                <div className="relative mt-2 flex flex-col gap-0.5">
                  {notices.map(n => (
                    <p key={n.id} className={`text-xs font-mono leading-snug ${n.tone === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}>&gt; {n.text}</p>
                  ))}
                </div>
              )}
            </div>
            
            {/* Active Doctrine HUD */}
            {activeDoctrine && onTriggerDoctrine && (
                <DoctrineHUD 
                    type={activeDoctrine} 
                    unlockedTiers={unlockedTiers} 
                    cooldowns={activeStats.doctrine?.cooldowns}
                    resources={activeStats.resources}
                    onTrigger={(type, tier, cost) => onTriggerDoctrine(playerTeam, type, tier, cost)}
                />
            )}
        </div>

        {/* Selection and armies above the minimap */}
        <div className="flex flex-col items-end gap-2">
        {armyState && armyControlsRef && <ArmyPanel team={playerTeam} selection={armyState.selection} armies={armyState.armies} controls={armyControlsRef} />}
        {/* Live Mini Map */}
        <div className={`${minimapExpanded ? 'w-[28rem] h-[28rem]' : 'w-56 h-56'} hud-plate hud-corners backdrop-blur relative overflow-hidden pointer-events-auto group cursor-crosshair transition-[width,height] duration-200`}>
           <svg 
              className="w-full h-full" 
              viewBox={`0 0 ${gridSize} ${gridSize}`} 
              preserveAspectRatio="xMidYMid meet"
           >
              <MinimapBackground 
                  roadTiles={minimapData.roadTiles} 
                  buildings={minimapData.buildings} 
                  structures={minimapData.structures || []}
                  revealedServerIds={revealedServerIds}
                  gridSize={gridSize}
              />

              {/* Outer rim of the friendly energy grid. Interior overlaps stay blank. */}
              {energyGridOutline.map((points, index) => (
                  <polyline
                      key={`grid-edge-${index}`}
                      points={points.map(point => `${point.x},${point.z}`).join(' ')}
                      fill="none"
                      stroke={ENERGY_GRID_COLOR}
                      strokeWidth={1.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                  />
              ))}

              {/* Selected Unit Path Trail */}
              {selectedUnitPath && (
                  <>
                      <polyline 
                          points={selectedUnitPath.points} 
                          stroke="#22d3ee" 
                          strokeWidth="0.3" 
                          fill="none" 
                          strokeDasharray="0.5" 
                          opacity="0.7"
                      />
                      <circle 
                          cx={selectedUnitPath.destination.x} 
                          cy={selectedUnitPath.destination.z} 
                          r={0.4} 
                          fill="none" 
                          stroke="#22d3ee" 
                          strokeWidth="0.2"
                      />
                      <circle 
                          cx={selectedUnitPath.destination.x} 
                          cy={selectedUnitPath.destination.z} 
                          r={0.1} 
                          fill="#22d3ee" 
                      />
                  </>
              )}

              {/* Aegis radar coverage, faint green */}
              {(minimapData.radars || []).map((r, i) => (
                  <circle key={`radar-${i}`} cx={r.x + 0.5} cy={r.z + 0.5} r={r.range} fill="rgba(34,197,94,0.06)" stroke="#22c55e" strokeOpacity={0.5} strokeWidth={0.25} />
              ))}

              {/* Engagements: a green arrow from each of your units to what it is shooting, a red
                  one from each enemy to the unit of yours it is shooting at. Drawn under the unit
                  badges, starting and stopping just short of them. Red on top. */}
              {[...(minimapData.engagements || [])].sort((a, b) => Number(a.hostile) - Number(b.hostile)).map(e => {
                  const x1 = e.fromX + 0.5, z1 = e.fromZ + 0.5, x2 = e.toX + 0.5, z2 = e.toZ + 0.5;
                  const len = Math.hypot(x2 - x1, z2 - z1);
                  if (len < 0.5) return null;
                  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
                  // The arrowhead's tip stops at the edge of the target's badge; the shaft runs
                  // from the attacker's badge to the head.
                  const head = 2.4, half = 1.5;
                  const tip = Math.max(head, len - 0.6);
                  const tx = x1 + ux * tip, tz = z1 + uz * tip;
                  const bx = tx - ux * head, bz = tz - uz * head;
                  const color = e.hostile ? '#ef4444' : '#22c55e';
                  return (
                      <g key={`eng-${e.hostile ? 'h' : 'f'}-${e.id}`}>
                          <line x1={x1} y1={z1} x2={bx} y2={bz} stroke="#020617" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                          <line x1={x1} y1={z1} x2={bx} y2={bz} stroke={color} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                          <polygon
                              points={`${tx},${tz} ${bx - uz * half},${bz + ux * half} ${bx + uz * half},${bz - ux * half}`}
                              fill={color} stroke="#020617" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                          />
                      </g>
                  );
              })}

              {/* Units Layer - Uses visibleUnits (Filtered by Fog of War) */}
              {visibleUnits.map((u) => {
                  const role = UNIT_ROLE[u.type] ?? 'infantry';
                  const filled = roleGlyphFilled(role);
                  // A 1.6-tile team badge centred on the unit, with its role pictogram in white.
                  return (
                      <g key={u.id} transform={`translate(${u.gridPos.x - 0.3} ${u.gridPos.z - 0.3}) scale(${1.6 / 24})`}>
                          <rect x={0} y={0} width={24} height={24} rx={5} fill={teamBadgeColor(u.team)} stroke="#020617" strokeWidth={2} />
                          <path d={ROLE_GLYPH[role]} fill={filled ? '#fff' : 'none'} stroke={filled ? 'none' : '#fff'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                  );
              })}

              {/* Radar contacts: something is there, not what. Pulsing red dots. */}
              {(minimapData.radarContacts || []).map(c => (
                  <circle key={`contact-${c.id}`} cx={c.x + 0.5} cy={c.z + 0.5} r={0.7} fill="#ff5a46" stroke="#fff1ee" strokeWidth={0.2}>
                      <animate attributeName="r" values="0.55;0.9;0.55" dur="1s" repeatCount="indefinite" />
                  </circle>
              ))}

              {/* Viewfinder Overlay */}
              <MinimapViewfinder 
                  cameraStateRef={cameraStateRef} 
                  gridSize={gridSize} 
                  tileSize={CITY_CONFIG.tileSize} 
              />

              {/* Known danger band around the central server nodes. Drawn last so the
                  warning mark stays readable over the camera viewfinder. Exact guard
                  positions stay hidden until a unit scouts them. */}
              <g>
                  <circle
                      cx={gridSize / 2}
                      cy={gridSize / 2}
                      r={ABILITY_CONFIG.CENTER_THREAT_RADIUS}
                      fill="#ef4444"
                      fillOpacity={0.14}
                      stroke="#f97316"
                      strokeWidth={0.35}
                      strokeDasharray="1.4 0.9"
                  />
                  <g transform={`translate(${gridSize / 2}, ${gridSize / 2})`}>
                      <polygon points="0,-3.6 3.2,2.6 -3.2,2.6" fill="#f97316" stroke="#fff7ed" strokeWidth={0.2} />
                      <rect x={-0.28} y={-1.2} width={0.56} height={1.7} rx={0.1} fill="#1c1917" />
                      <rect x={-0.28} y={0.85} width={0.56} height={0.56} rx={0.1} fill="#1c1917" />
                  </g>
              </g>

              {/* Enemy missile launches: a warning triangle where it took off, then one blip at the
                  midpoint once it has passed halfway. Never its live position. */}
              {(minimapData.missileWarnings || []).map(w => (
                  <g key={`warn-${w.id}`}>
                      <g transform={`translate(${w.launchX}, ${w.launchZ})`}>
                          <circle r={1.6} fill="none" stroke="#f97316" strokeWidth={0.25}>
                              <animate attributeName="r" values="1;2.6;1" dur="1.2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
                          </circle>
                          <polygon points="0,-1.5 1.35,1.1 -1.35,1.1" fill="#f97316" stroke="#fff7ed" strokeWidth={0.15} />
                          <rect x={-0.13} y={-0.6} width={0.26} height={0.85} rx={0.05} fill="#1c1917" />
                          <rect x={-0.13} y={0.42} width={0.26} height={0.26} rx={0.05} fill="#1c1917" />
                      </g>
                      {w.midX !== undefined && w.midZ !== undefined && (
                          <g transform={`translate(${w.midX}, ${w.midZ})`}>
                              <circle r={1.2} fill="none" stroke="#ef4444" strokeWidth={0.2}>
                                  <animate attributeName="r" values="1.1;2.3;1.1" dur="0.9s" repeatCount="indefinite" />
                              </circle>
                              <circle r={0.85} fill="#ef4444" stroke="#fff1ee" strokeWidth={0.15} />
                          </g>
                      )}
                  </g>
              ))}

              {/* Your own missiles in flight, with the path to impact. */}
              {(minimapData.missiles || []).map((m) => {
                  const color = m.team === 'red' ? '#f87171' : (m.team === 'blue' ? '#38bdf8' : '#fbbf24');
                  const showTrajectory = m.team === playerTeam;
                  return (
                      <g key={`missile-${m.id}`}>
                          {showTrajectory && (
                              <>
                                  <line
                                      x1={m.x}
                                      y1={m.z}
                                      x2={m.targetX}
                                      y2={m.targetZ}
                                      stroke={color}
                                      strokeWidth={0.28}
                                      strokeDasharray="0.55 0.35"
                                      opacity={0.95}
                                  />
                                  <circle cx={m.targetX} cy={m.targetZ} r={0.45} fill="none" stroke={color} strokeWidth={0.18} />
                              </>
                          )}
                          <polygon
                              points={`${m.x},${m.z - 0.62} ${m.x + 0.42},${m.z} ${m.x},${m.z + 0.62} ${m.x - 0.42},${m.z}`}
                              fill={color}
                              stroke="#fff7ed"
                              strokeWidth={0.08}
                          />
                      </g>
                  );
              })}
           </svg>
           
           {(minimapData.missileWarnings?.length ?? 0) > 0 && (
             <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1 px-1.5 py-0.5 bg-orange-600/90 border border-orange-300 text-[10px] font-mono font-bold text-white uppercase tracking-wider animate-pulse pointer-events-none" data-testid="missile-alert">
               <span>⚠</span><span>Missile launch</span>
             </div>
           )}
           <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 pointer-events-none">
             <span className="text-cyan-400 text-[10px] font-mono tracking-tighter">TACTICAL VIEWPORT</span>
           </div>
           <button
             type="button"
             onClick={() => setMinimapExpanded((expanded) => !expanded)}
             className="absolute top-1.5 right-1.5 z-20 w-6 h-6 flex items-center justify-center hud-plate hud-corners text-cyan-200 hover:text-white cursor-pointer transition-colors"
             title={minimapExpanded ? 'Shrink minimap' : 'Expand minimap'}
             aria-label={minimapExpanded ? 'Shrink minimap' : 'Expand minimap'}
             aria-pressed={minimapExpanded}
           >
             {minimapExpanded ? (
               <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
               </svg>
             ) : (
               <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
               </svg>
             )}
           </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default UIOverlay;
