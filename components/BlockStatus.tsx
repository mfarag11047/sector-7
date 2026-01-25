import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { BuildingBlock, BuildingData } from '../types';
import { BLOCK_BONUS, TEAM_COLORS } from '../constants';
import * as THREE from 'three';

interface BlockStatusProps {
  block: BuildingBlock;
  buildings: BuildingData[];
}

const BlockStatus: React.FC<BlockStatusProps> = ({ block, buildings }) => {
  if (!block.owner) return null;

  const { position, defenseBonus, outputBonus } = useMemo(() => {
    // Filter buildings that belong to this block
    const blockBuildings = buildings.filter(b => block.buildingIds.includes(b.id));
    if (blockBuildings.length === 0) return { position: [0,0,0] as [number, number, number], defenseBonus: 0, outputBonus: 0 };

    // Calculate center
    let sumX = 0;
    let sumZ = 0;
    let maxY = 0;

    blockBuildings.forEach(b => {
      sumX += b.position[0];
      sumZ += b.position[2];
      if (b.scale[1] > maxY) maxY = b.scale[1];
    });

    const centerX = sumX / blockBuildings.length;
    const centerZ = sumZ / blockBuildings.length;
    
    // Stats calculation
    const count = blockBuildings.length;
    const def = Math.round((BLOCK_BONUS.BASE_DEFENSE + (count * BLOCK_BONUS.DEFENSE_PER_BUILDING)) * 100);
    const out = Math.round((BLOCK_BONUS.RESOURCE_MULTIPLIER - 1) * 100);

    return {
      position: [centerX, maxY + 5, centerZ] as [number, number, number],
      defenseBonus: def,
      outputBonus: out
    };
  }, [block, buildings]);

  const color = TEAM_COLORS[block.owner];

  return (
    <Html position={position} center zIndexRange={[100, 0]}>
      <div 
        className="flex flex-col items-center pointer-events-none select-none"
        style={{ color: color, textShadow: `0 0 10px ${color}` }}
      >
        <div className="bg-slate-900/90 backdrop-blur-md border border-current px-4 py-2 rounded-lg flex flex-col items-center gap-1 shadow-[0_0_15px_rgba(0,0,0,0.5)] min-w-[120px]">
          <div className="text-xs font-mono font-bold uppercase tracking-wider mb-1 whitespace-nowrap">
            BLOCK SECURED
          </div>
          <div className="flex gap-4 text-[11px] font-mono whitespace-nowrap">
            <div className="flex flex-col items-center">
              <span className="text-white font-bold text-sm">+{outputBonus}%</span>
              <span className="opacity-70 text-[9px]">OUTPUT</span>
            </div>
            <div className="w-px bg-white/20"></div>
            <div className="flex flex-col items-center">
              <span className="text-white font-bold text-sm">+{defenseBonus}%</span>
              <span className="opacity-70 text-[9px]">DEFENSE</span>
            </div>
          </div>
        </div>
        {/* Connector Line */}
        <div className="w-px h-8 bg-gradient-to-b from-current to-transparent opacity-80"></div>
        <div className="w-2 h-2 rounded-full bg-current shadow-[0_0_10px_currentColor]"></div>
      </div>
    </Html>
  );
};

export default BlockStatus;