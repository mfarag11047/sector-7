
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GameStats, TeamStats, MinimapData, DoctrineType, DoctrineState } from '../types';
import { BUILDING_COLORS, TEAM_COLORS, UNIT_CLASSES, ABILITY_CONFIG, STRUCTURE_INFO, CITY_CONFIG, DOCTRINE_CONFIG } from '../constants';

interface ManualSection {
  title: string;
  items: { label: string; description: string }[];
}

const MANUAL_DATA: ManualSection[] = [
  {
    title: "Mission Objectives",
    items: [
      { label: "Sector Capture", description: "Position units adjacent to buildings to begin extraction of sector data. Once progress reaches 100%, the building is claimed." },
      { label: "Domination", description: "Neutralize enemy buildings by standing near them until their capture progress returns to zero." },
    ]
  },
  {
    title: "Building Blocks",
    items: [
      { label: "Clumping", description: "Buildings exist in organic clusters of 3-6. All buildings in a block share the same economic tier." },
      { label: "Fortification", description: "Capturing an entire block grants a Defense Bonus based on the number of buildings, slowing enemy capture." },
      { label: "Resource Bonus", description: "Fully controlled blocks generate +50% Energy Cores for your faction." },
    ]
  },
  {
    title: "Compute System",
    items: [
      { label: "Server Nodes", description: "Special blue buildings that provide Compute capability instead of income. Capture takes 3x longer." },
      { label: "Ability Gating", description: "Advanced abilities (Nuke, Hack, Decoy) require holding a specific number of Server Nodes to activate." },
      { label: "Thresholds", description: "1: Decoy | 2: APS/Trophy | 3: Hack | 4: WMD Launch" },
    ]
  }
];

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
    if (type === 'skunkworks') return <span className={`text-cyan-500 font-bold ${className}`}>⚡</span>;
    return null;
};

const TeamPanel: React.FC<{ team: 'blue' | 'red'; stats: TeamStats; align: 'left' | 'right'; isVisible: boolean }> = ({ team, stats, align, isVisible }) => {
  const isBlue = team === 'blue';
  const baseColor = isBlue ? 'text-blue-400' : 'text-red-400';
  const borderColor = isBlue ? 'border-blue-500' : 'border-red-500';
  const bgGradient = isBlue ? 'from-blue-500/10' : 'from-red-500/10';
  
  return (
    <div className={`
      bg-slate-900/90 backdrop-blur-md border-t-2 ${borderColor} p-3 rounded-b-lg shadow-xl pointer-events-auto min-w-[300px] z-50
      flex flex-col gap-2 relative overflow-hidden transition-all duration-300
      ${!isVisible ? 'opacity-80 grayscale-[0.8]' : 'opacity-100'}
    `}>
      {/* Background decoration */}
      <div className={`absolute top-0 ${align === 'left' ? 'left-0' : 'right-0'} w-full h-full bg-gradient-to-b ${bgGradient} to-transparent opacity-30 pointer-events-none`}></div>

      <div className="flex justify-between items-baseline border-b border-slate-700/50 pb-2 relative z-10">
        <div className="flex items-center gap-2">
            <h2 className={`text-xl font-bold font-mono uppercase tracking-widest ${baseColor}`}>
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
                {/* Compute Stat */}
                <EditableStat 
                    value={stats.compute || 0}
                    icon={<span className="text-blue-400">📶</span>}
                    onSave={(val) => (window as any).GAME_CHEATS?.setCompute(team, val)}
                />
                
                {/* Resource Stat */}
                <EditableStat 
                    value={Math.floor(stats.resources)}
                    label="CORES"
                    baseColor={baseColor}
                    onSave={(val) => (window as any).GAME_CHEATS?.setResources(team, val)}
                />
            </>
          ) : (
             <span className="text-slate-500 font-mono text-sm animate-pulse">ENCRYPTED</span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center relative z-10">
        <div className="flex flex-col">
            {isVisible ? (
                <span className="text-emerald-400 font-mono text-sm font-bold">+{stats.income}/s</span>
            ) : (
                <span className="text-slate-600 font-mono text-sm">--/s</span>
            )}
          <span className="text-slate-500 text-[10px] uppercase">Income</span>
        </div>
        
        <div className="flex flex-col items-end">
           {isVisible ? (
                <span className="text-white font-mono text-sm font-bold">{stats.units}</span>
           ) : (
                <span className="text-slate-600 font-mono text-sm">--</span>
           )}
           <span className="text-slate-500 text-[10px] uppercase">Units</span>
        </div>
      </div>

      <div className="flex gap-1 mt-1 relative z-10">
        {Object.entries(stats.buildings).map(([type, count]) => {
           // Skip rendering Server Node count in the generic buildings bar since it has a dedicated spot
           if (type === 'server_node') return null;

           return (
               <div key={type} className="flex-1 bg-slate-800/50 rounded flex flex-col items-center py-1 border border-slate-700/50" title={type}>
                  <div 
                    className="w-2 h-2 rounded-full mb-1" 
                    style={{ backgroundColor: BUILDING_COLORS[type as keyof typeof BUILDING_COLORS] }}
                  ></div>
                  <span className="text-xs text-slate-300 font-mono leading-none">
                      {isVisible ? count : '-'}
                  </span>
               </div>
           );
        })}
      </div>
    </div>
  );
};

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
    onTrigger: (type: string, tier: 2 | 3, cost: number) => void;
}> = ({ type, unlockedTiers, resources, onTrigger }) => {
    const config = DOCTRINE_CONFIG[type];
    
    // Theme Colors
    const theme = {
        heavy_metal: 'border-orange-500 text-orange-400 bg-orange-900/40',
        shadow_ops: 'border-purple-500 text-purple-400 bg-purple-900/40',
        skunkworks: 'border-cyan-500 text-cyan-400 bg-cyan-900/40',
    }[type];

    const canAfford2 = resources >= config.tier2_cost;
    const canAfford3 = resources >= config.tier3_cost;
    const isUnlocked2 = unlockedTiers >= 2;
    const isUnlocked3 = unlockedTiers >= 3;

    return (
        <div className={`p-3 rounded-lg border-2 ${theme} backdrop-blur-md shadow-lg flex flex-col gap-2 min-w-[200px] animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto`}>
            <div className="flex justify-between items-center border-b border-white/20 pb-1 mb-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">Active Protocols</span>
                <DoctrineIcon type={type} className="text-sm" />
            </div>
            
            <div className="flex gap-2">
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
                        {isUnlocked2 ? "ACTIVATE" : "LOCKED"}
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
                        {isUnlocked3 ? "EXECUTE" : "LOCKED"}
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
        heavy_metal: 'border-orange-500 text-orange-400 bg-orange-900/20',
        shadow_ops: 'border-purple-500 text-purple-400 bg-purple-900/20',
        skunkworks: 'border-cyan-500 text-cyan-400 bg-cyan-900/20',
    };
    const theme = colors[type];

    const canAfford2 = resources >= config.tier2_cost;
    const canAfford3 = resources >= config.tier3_cost;

    return (
        <div 
            className={`
                relative p-4 rounded-xl border-2 transition-all duration-300 flex flex-col gap-4
                ${active ? `${theme} bg-opacity-40 shadow-[0_0_30px_rgba(0,0,0,0.5)] scale-105` : 
                  locked ? 'border-slate-800 bg-slate-900/50 text-slate-600 grayscale cursor-not-allowed' :
                  `border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-white/50 cursor-pointer hover:scale-105`
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
}

const UIOverlay: React.FC<UIOverlayProps> = ({ stats, minimapData, playerTeam, setPlayerTeam, cameraStateRef, onSelectDoctrine, onTriggerDoctrine, interactionMode }) => {
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [isDoctrineOpen, setIsDoctrineOpen] = useState(false);

  // Minimap Scale / Viewbox
  const gridSize = minimapData.gridSize || 40;

  // Toggle Admin Team
  const toggleTeam = () => {
    setPlayerTeam(playerTeam === 'blue' ? 'red' : 'blue');
  };

  const activeStats = stats[playerTeam];
  const activeDoctrine = activeStats.doctrine?.selected || null;
  const unlockedTiers = activeStats.doctrine?.unlockedTiers || 0;

  // Fog of War Logic for Minimap Units
  // 1. Always show own units
  // 2. Show enemy unit ONLY if distance to any friendly unit is < friendly.visionRange
  const visibleUnits = useMemo(() => {
    const friendlies = minimapData.units.filter(u => u.team === playerTeam);
    
    return minimapData.units.filter(targetUnit => {
        if (targetUnit.team === playerTeam || targetUnit.type === 'defense_drone') return true;

        // Check for Ghost protection on targetUnit
        const protectingGhosts = minimapData.units.filter(g => 
            g.team === targetUnit.team && 
            g.type === 'ghost' && 
            g.isDampenerActive
        );
        
        const isProtected = protectingGhosts.some(g => {
            const dx = g.gridPos.x - targetUnit.gridPos.x;
            const dz = g.gridPos.z - targetUnit.gridPos.z;
            return Math.hypot(dx, dz) <= ABILITY_CONFIG.GHOST_DAMPENER_RADIUS;
        });

        // Enemy Unit Check against ALL friendly units using the specific vision range of the friendly
        const isDetected = friendlies.some(friendly => {
            const dx = friendly.gridPos.x - targetUnit.gridPos.x;
            const dz = friendly.gridPos.z - targetUnit.gridPos.z;
            const dist = Math.hypot(dx, dz);

            // Dampener Rule: Limit detection to 2 blocks if protected (Visual line of sight), otherwise use full range
            const detectionRange = isProtected ? 2 : (friendly.visionRange || 2);
            return dist <= detectionRange; 
        });

        return isDetected;
    });
  }, [minimapData.units, playerTeam]);

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

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-50">
      {/* Targeting Overlay */}
      {interactionMode === 'target' && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-900/80 border border-red-500 px-6 py-2 rounded-lg text-white font-mono font-bold animate-pulse z-[60] shadow-[0_0_20px_rgba(239,68,68,0.6)]">
              TARGETING ACTIVE - CLICK MAP
          </div>
      )}

      {/* Top HUD: Team Stats */}
      <div className="flex justify-between items-start w-full relative z-50">
        
        {/* Admin Toggle (Hidden-ish) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-2 pointer-events-auto z-50">
             <button 
                onClick={toggleTeam}
                className="bg-slate-900 border border-slate-700 hover:border-white px-3 py-1 rounded text-[10px] text-slate-400 font-mono uppercase tracking-widest transition-colors"
                title="Admin: Switch Player Team"
             >
                Playing As: <span className={playerTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}>{playerTeam.toUpperCase()}</span>
             </button>
        </div>

        <TeamPanel team="blue" stats={stats.blue} align="left" isVisible={playerTeam === 'blue'} />
        
        <div className="mt-8 flex flex-col items-center gap-2 pointer-events-auto">
            <h1 className="text-slate-500 font-mono text-[10px] tracking-[0.3em] uppercase opacity-50">Sector 7 Conflict</h1>
            <div className="flex gap-2">
                <button 
                    onClick={() => setIsIntelOpen(!isIntelOpen)}
                    className={`w-8 h-8 flex items-center justify-center rounded border transition-all pointer-events-auto ${
                    isIntelOpen 
                        ? 'bg-cyan-500 text-slate-900 border-cyan-400' 
                        : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:text-cyan-400 hover:border-cyan-500'
                    }`}
                    title="Manual / Intel"
                >
                    <span className="font-mono font-bold text-sm">?</span>
                </button>
                <button 
                    onClick={() => setIsDoctrineOpen(!isDoctrineOpen)}
                    className={`w-8 h-8 flex items-center justify-center rounded border transition-all pointer-events-auto ${
                    isDoctrineOpen 
                        ? 'bg-orange-500 text-slate-900 border-orange-400' 
                        : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:text-orange-400 hover:border-orange-500'
                    }`}
                    title="Doctrine Protocols"
                >
                    <span className="font-mono font-bold text-lg">★</span>
                </button>
            </div>
        </div>

        <TeamPanel team="red" stats={stats.red} align="right" isVisible={playerTeam === 'red'} />
      </div>

      {/* Manual / Intel Modal */}
      {isIntelOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100]">
          <div className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-cyan-500/50 p-8 rounded-2xl pointer-events-auto shadow-[0_0_50px_rgba(6,182,212,0.2)] animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-cyan-500/20 pb-4">
              <h2 className="text-2xl font-bold text-cyan-400 font-mono tracking-widest uppercase flex items-center gap-3">
                <span className="w-4 h-4 bg-cyan-500 rounded-sm"></span>
                Operations Manual
              </h2>
              <button 
                onClick={() => setIsIntelOpen(false)}
                className="text-slate-500 hover:text-cyan-400 transition-colors"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[60vh] overflow-y-auto pr-4">
              {MANUAL_DATA.map((section, idx) => (
                <div key={idx} className="space-y-4">
                  <h3 className="text-fuchsia-400 font-mono text-sm uppercase tracking-widest border-l-2 border-fuchsia-500 pl-3">
                    {section.title}
                  </h3>
                  <div className="space-y-3">
                    {section.items.map((item, i) => (
                      <div key={i} className="group">
                        <div className="text-cyan-200 font-bold text-xs uppercase mb-1">{item.label}</div>
                        <p className="text-slate-400 text-xs leading-relaxed group-hover:text-slate-200 transition-colors">
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Doctrine Selection Modal */}
      {isDoctrineOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100] bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-slate-950/95 border border-slate-700 p-8 rounded-2xl pointer-events-auto shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-lg pointer-events-auto max-w-sm shadow-2xl">
              <h3 className="text-slate-400 text-[10px] font-mono uppercase mb-2 border-b border-slate-700 pb-1 flex justify-between">
                System Message
              </h3>
              <p className="text-xs text-cyan-500 font-mono leading-relaxed">
                > COMMAND: Select unit to initiate movement.<br/>
                > ALERT: Capture Server Nodes to unlock abilities.
              </p>
            </div>
            
            {/* Active Doctrine HUD */}
            {activeDoctrine && onTriggerDoctrine && (
                <DoctrineHUD 
                    type={activeDoctrine} 
                    unlockedTiers={unlockedTiers} 
                    resources={activeStats.resources}
                    onTrigger={(type, tier, cost) => onTriggerDoctrine(playerTeam, type, tier, cost)}
                />
            )}
        </div>

        {/* Live Mini Map */}
        <div className="w-56 h-56 bg-slate-950/95 backdrop-blur border-2 border-slate-800 rounded-xl relative overflow-hidden pointer-events-auto shadow-2xl group cursor-crosshair">
           <svg 
              className="w-full h-full" 
              viewBox={`0 0 ${gridSize} ${gridSize}`} 
              preserveAspectRatio="xMidYMid meet"
           >
              {/* Roads Layer */}
              {minimapData.roadTiles.map((tile, i) => (
                  <rect 
                      key={`r-${i}`} 
                      x={tile.x} 
                      y={tile.z} 
                      width={1} 
                      height={1} 
                      fill={tile.type === 'main' ? '#334155' : '#1e293b'} 
                  />
              ))}

              {/* Buildings Layer */}
              {minimapData.buildings.map((b) => (
                  <rect 
                      key={b.id}
                      x={b.gridX}
                      y={b.gridZ}
                      width={1}
                      height={1}
                      fill={b.owner ? TEAM_COLORS[b.owner] : (b.type === 'server_node' ? '#1e3a8a' : '#64748b')}
                      opacity={0.8}
                  />
              ))}

              {/* Structures Layer */}
              {minimapData.structures?.map((s) => (
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

              {/* Units Layer - Uses visibleUnits (Filtered by Fog of War) */}
              {visibleUnits.map((u) => (
                  <text 
                      key={u.id}
                      x={u.gridPos.x + 0.5}
                      y={u.gridPos.z + 0.9}
                      textAnchor="middle"
                      fill={u.team === 'blue' ? '#bfdbfe' : (u.team === 'red' ? '#fecaca' : '#d8b4fe')}
                      fontSize="1"
                      fontWeight="bold"
                      style={{ 
                          textShadow: `0 0 0.1px ${u.team === 'blue' ? TEAM_COLORS.blue : TEAM_COLORS.red}`
                      }}
                  >
                      {UNIT_CLASSES[u.unitClass].icon}
                  </text>
              ))}

              {/* Viewfinder Overlay */}
              <MinimapViewfinder 
                  cameraStateRef={cameraStateRef} 
                  gridSize={gridSize} 
                  tileSize={CITY_CONFIG.tileSize} 
              />
           </svg>
           
           <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 pointer-events-none">
             <span className="text-cyan-400 text-[10px] font-mono tracking-tighter">TACTICAL VIEWPORT</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default UIOverlay;
