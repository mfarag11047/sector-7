
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { StructureType, UnitClass } from '../types';
import { STRUCTURE_INFO, UNIT_CLASSES } from '../constants';

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
  onBuild?: (type: StructureType) => void;
}

const Base: React.FC<BaseProps> = ({ 
  position, gridPos, teamColor, label, onMoveCommand, onRightClick, onDoubleClick, menuOpen, resources = 0, onBuild 
}) => {
  const radarRef = useRef<THREE.Group>(null);
  
  // Animation for radar rotation
  useFrame((state, delta) => {
    if (radarRef.current) {
      radarRef.current.rotation.y += 0.5 * delta;
      // Slight tilt bobbing for "active" look
      radarRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
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

  // Filter out walls and defense turrets from the Base menu
  const buildableStructures = (Object.keys(STRUCTURE_INFO) as StructureType[]).filter(type => 
    type !== 'wall_tier1' && type !== 'wall_tier2' && type !== 'defense'
  );

  // Reusable Materials
  const materials = useMemo(() => ({
      hull: new THREE.MeshStandardMaterial({ color: "#1e293b", metalness: 0.8, roughness: 0.2 }),
      darkHull: new THREE.MeshStandardMaterial({ color: "#0f172a", metalness: 0.9, roughness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({ color: teamColor }),
      accent: new THREE.MeshBasicMaterial({ color: "#f97316" }), // Industrial Orange
      pad: new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.5, roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.9, roughness: 0.1 }),
  }), [teamColor]);

  return (
    <group 
      position={position} 
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={() => (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {/* --- LEVEL 1: BASE PLATFORM (Octagonal/Chamfered look) --- */}
      <group position={[0, 0.5, 0]}>
          {/* Main Central Slab */}
          <mesh castShadow receiveShadow material={materials.hull}>
              <boxGeometry args={[8, 1, 8]} />
          </mesh>
          
          {/* Glowing Neon Lines (Edges) */}
          <mesh position={[0, 0.51, 3.9]} material={materials.glow}>
              <boxGeometry args={[7, 0.05, 0.1]} />
          </mesh>
          <mesh position={[0, 0.51, -3.9]} material={materials.glow}>
              <boxGeometry args={[7, 0.05, 0.1]} />
          </mesh>
          <mesh position={[3.9, 0.51, 0]} rotation={[0, Math.PI/2, 0]} material={materials.glow}>
              <boxGeometry args={[7, 0.05, 0.1]} />
          </mesh>
          <mesh position={[-3.9, 0.51, 0]} rotation={[0, Math.PI/2, 0]} material={materials.glow}>
              <boxGeometry args={[7, 0.05, 0.1]} />
          </mesh>

          {/* Corner Landing Pads (The "H" pads) */}
          {[
              {x: 4, z: 4}, {x: -4, z: 4}, {x: 4, z: -4}, {x: -4, z: -4}
          ].map((pos, i) => (
              <group key={i} position={[pos.x, 0, pos.z]}>
                  {/* Pad Base */}
                  <mesh castShadow receiveShadow material={materials.pad}>
                      <boxGeometry args={[3, 1, 3]} />
                  </mesh>
                  {/* Outer Bumper/Armor */}
                  <mesh position={[0, 0.2, 0]} material={materials.darkHull}>
                      <boxGeometry args={[3.2, 0.8, 3.2]} />
                  </mesh>
                  {/* Orange Hazard Lights on Corners */}
                  <mesh position={[1.6 * (pos.x > 0 ? 1 : -1), 0.4, 1.6 * (pos.z > 0 ? 1 : -1)]} material={materials.accent}>
                      <boxGeometry args={[0.3, 0.4, 0.3]} />
                  </mesh>
                  {/* H Marking (Glowing) */}
                  <group position={[0, 0.51, 0]} rotation={[0, 0, 0]}> 
                      <mesh material={materials.glow} position={[0.8, 0, 0]}>
                          <boxGeometry args={[0.2, 0.01, 1.8]} />
                      </mesh>
                      <mesh material={materials.glow} position={[-0.8, 0, 0]}>
                          <boxGeometry args={[0.2, 0.01, 1.8]} />
                      </mesh>
                      <mesh material={materials.glow} position={[0, 0, 0]}>
                          <boxGeometry args={[1.6, 0.01, 0.2]} />
                      </mesh>
                  </group>
              </group>
          ))}
          
          {/* Pipes connecting corners to center */}
          {[
              {pos: [3, 0.2, 3], rot: Math.PI/4}, 
              {pos: [-3, 0.2, 3], rot: -Math.PI/4},
              {pos: [3, 0.2, -3], rot: -Math.PI/4},
              {pos: [-3, 0.2, -3], rot: Math.PI/4}
          ].map((cfg, i) => (
              <group key={`pipe-${i}`} position={cfg.pos as any} rotation={[0, cfg.rot, 0]}>
                  <mesh rotation={[0, 0, Math.PI/2]} material={materials.darkHull}>
                      <cylinderGeometry args={[0.3, 0.3, 4]} />
                  </mesh>
                  {/* Glowing fluid inside pipe segment */}
                  <mesh rotation={[0, 0, Math.PI/2]}>
                       <cylinderGeometry args={[0.15, 0.15, 3.8]} />
                       <meshBasicMaterial color="#f97316" transparent opacity={0.8} />
                  </mesh>
              </group>
          ))}
      </group>

      {/* --- LEVEL 2: CENTRAL BUNKER --- */}
      <group position={[0, 2, 0]}>
          {/* Main Octagon Body */}
          <mesh castShadow receiveShadow material={materials.hull} rotation={[0, Math.PI/8, 0]}>
              <cylinderGeometry args={[3.5, 4, 2, 8]} />
          </mesh>
          
          {/* Glowing horizontal strips around bunker */}
          {[0.5, -0.5].map((y, i) => (
              <mesh key={i} position={[0, y, 0]} rotation={[0, Math.PI/8, 0]}>
                  <cylinderGeometry args={[3.55, 3.6, 0.1, 8]} />
                  <meshBasicMaterial color={teamColor} />
              </mesh>
          ))}
          
          {/* Reinforced Vertical Struts */}
          {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, i) => (
              <mesh key={i} rotation={[0, rot, 0]} position={[3.6, 0, 0]} material={materials.darkHull}>
                  <boxGeometry args={[0.5, 2.2, 1]} />
              </mesh>
          ))}

          {/* Doorway / Vent */}
          <group position={[0, 0, 3.5]}>
              <mesh material={materials.darkHull}>
                  <boxGeometry args={[2, 1.5, 1]} />
              </mesh>
              <mesh position={[0, 0, 0.51]} material={materials.glow}>
                  <planeGeometry args={[1.5, 1.2]} />
              </mesh>
          </group>
      </group>

      {/* --- LEVEL 3: RADAR MOUNT --- */}
      <group position={[0, 3.5, 0]}>
          <mesh castShadow receiveShadow material={materials.darkHull}>
              <cylinderGeometry args={[2, 3, 1, 8]} />
          </mesh>
          {/* Rotating bearing ring */}
          <mesh position={[0, 0.5, 0]} material={materials.hull}>
              <cylinderGeometry args={[1.8, 1.8, 0.2, 16]} />
          </mesh>
      </group>

      {/* --- RADAR DISH (Rotating) --- */}
      <group ref={radarRef} position={[0, 4.5, 0]}>
          {/* Yoke/Pivot Base */}
          <mesh position={[0, 0.5, 0]} material={materials.darkHull}>
              <boxGeometry args={[1.5, 1.5, 1.5]} />
          </mesh>
          
          {/* The Dish Assembly - Tilted up */}
          <group position={[0, 1.5, 0]} rotation={[-Math.PI/4, 0, 0]}>
              {/* Back of Dish Structure */}
              <mesh material={materials.hull} position={[0, -0.2, 0]}>
                  <cylinderGeometry args={[3.2, 1, 1, 8]} />
              </mesh>
              
              {/* Main Dish Surface */}
              <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0]}>
                  <cylinderGeometry args={[3, 0.5, 0.2, 32]} />
                  <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
              </mesh>
              
              {/* Grid Texture on Dish (simulated with torus rings) */}
              <mesh position={[0, 0.41, 0]} rotation={[Math.PI/2, 0, 0]}>
                  <torusGeometry args={[1, 0.03, 16, 64]} />
                  <meshBasicMaterial color="#94a3b8" />
              </mesh>
              <mesh position={[0, 0.41, 0]} rotation={[Math.PI/2, 0, 0]}>
                  <torusGeometry args={[2, 0.03, 16, 64]} />
                  <meshBasicMaterial color="#94a3b8" />
              </mesh>
              {/* Crossbars */}
              <mesh position={[0, 0.42, 0]} rotation={[0, 0, 0]} material={materials.darkHull}>
                   <boxGeometry args={[5.5, 0.05, 0.05]} />
              </mesh>
              <mesh position={[0, 0.42, 0]} rotation={[0, Math.PI/2, 0]} material={materials.darkHull}>
                   <boxGeometry args={[5.5, 0.05, 0.05]} />
              </mesh>
              
              {/* Center Spike / Receiver */}
              <group position={[0, 0.5, 0]}>
                  <mesh position={[0, 1, 0]}>
                      <cylinderGeometry args={[0.1, 0.3, 2]} />
                      <meshStandardMaterial color="#cbd5e1" metalness={1} />
                  </mesh>
                  <mesh position={[0, 2, 0]}>
                      <sphereGeometry args={[0.4]} />
                      <meshBasicMaterial color={teamColor} />
                      <pointLight color={teamColor} intensity={2} distance={8} />
                  </mesh>
              </group>
          </group>
      </group>

      {/* Floating Team Beacon (Keep for visibility) */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh position={[4, 8, 4]}>
          <octahedronGeometry args={[0.8]} />
          <meshBasicMaterial color={teamColor} />
          <pointLight color={teamColor} intensity={3} distance={15} />
        </mesh>
      </Float>

      {/* Construction Menu Overlay */}
      {menuOpen && (
        <Html position={[0, 10, 0]} center zIndexRange={[200, 0]}>
          <div className="bg-slate-900/95 border border-cyan-500 rounded-lg shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur min-w-[220px] overflow-hidden flex flex-col pointer-events-auto">
             <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                <span className="text-cyan-400 font-mono font-bold text-xs uppercase">Base Construction</span>
                <span className={`text-[10px] font-mono ${resources > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {resources} Cores
                </span>
             </div>
             
             <div className="flex flex-col gap-1 p-1">
                {buildableStructures.map((type) => {
                    const info = STRUCTURE_INFO[type];
                    const canAfford = resources >= info.cost;
                    
                    const getIcon = (t: StructureType) => {
                        if (t in UNIT_CLASSES) return UNIT_CLASSES[t as UnitClass].icon;
                        return '?';
                    };

                    return (
                        <button
                            key={type}
                            disabled={!canAfford}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onBuild && canAfford) onBuild(type);
                            }}
                            className={`
                                flex items-center justify-between px-3 py-2 text-left transition-colors rounded
                                ${canAfford 
                                    ? 'hover:bg-cyan-900/40 text-slate-200 cursor-pointer' 
                                    : 'opacity-50 text-slate-500 cursor-not-allowed'}
                            `}
                        >
                            <div className="flex items-center gap-2">
                                <span style={{ color: info.color }} className="text-sm">{getIcon(type)}</span>
                                <span className="text-xs font-mono font-bold">{info.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-cyan-600">
                                {info.cost}
                            </span>
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
