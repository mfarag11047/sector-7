
import React, { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { CITY_CONFIG, BUILDING_COLORS, TEAM_COLORS, BUILDING_VALUES, BLOCK_BONUS, UNIT_STATS, ABILITY_CONFIG, STRUCTURE_COST, BUILD_RADIUS, STRUCTURE_INFO, COMPUTE_GATES, TIER_UNLOCK_COSTS, DOCTRINE_CONFIG } from '../constants';
import { BuildingData, UnitData, BuildingBlock, GameStats, TeamStats, RoadType, RoadTileData, StructureData, UnitClass, DecoyData, UnitType, StructureType, CloudData, Projectile, Explosion, DoctrineState } from '../types';
import Building from './Building';
import Structure from './Structure';
import Base from './Base';
import Unit from './Unit';
import BlockStatus from './BlockStatus';
import { InstancedRoads } from './RoadSystem';
import * as THREE from 'three';
import { Edges, Html, Line, Float, Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Zap, Ban } from 'lucide-react';

// Helper to check if a grid position is inside any cloud of a specific type (optional)
const isPointInCloud = (pos: {x: number, z: number}, clouds: CloudData[], type?: string): boolean => {
    return clouds.some(c => {
        if (type && c.type !== type) return false;
        // Use cloud's gridPos directly
        const dx = pos.x - c.gridPos.x;
        const dz = pos.z - c.gridPos.z;
        return Math.sqrt(dx * dx + dz * dz) <= c.radius;
    });
};

// New Component: StreetLights
// Renders emissive orange strips along edges of street tiles
const StreetLights: React.FC<{ tiles: RoadTileData[], tileSize: number, offset: number }> = ({ tiles, tileSize, offset }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    // Count instances needed
    const count = useMemo(() => {
        let c = 0;
        tiles.forEach(t => {
            if (t.type === 'street') {
                if (t.x % 6 === 0) c += 2; // Vertical road borders
                if (t.z % 6 === 0) c += 2; // Horizontal road borders
            }
        });
        return c;
    }, [tiles]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const dummy = new THREE.Object3D();
        let idx = 0;
        const halfSize = tileSize / 2;
        // Strip dimensions: thin strip of light
        const stripThickness = 0.15;
        const margin = 0.2; // Offset from edge

        tiles.forEach(t => {
            if (t.type !== 'street') return;
            const tx = (t.x * tileSize) - offset;
            const tz = (t.z * tileSize) - offset;

            // Vertical Road (Running along Z, constant X) -> Lights on Left/Right edges
            if (t.x % 6 === 0) {
                // Left Strip
                dummy.position.set(tx - halfSize + margin, 0.05, tz);
                dummy.rotation.set(0, 0, 0); // Aligned with Z
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(idx++, dummy.matrix);

                // Right Strip
                dummy.position.set(tx + halfSize - margin, 0.05, tz);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(idx++, dummy.matrix);
            }
            
            // Horizontal Road (Running along X, constant Z) -> Lights on Top/Bottom edges
            if (t.z % 6 === 0) {
                // Top Strip (Near -Z)
                dummy.position.set(tx, 0.05, tz - halfSize + margin);
                dummy.rotation.set(0, Math.PI / 2, 0); // Aligned with X
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(idx++, dummy.matrix);

                // Bottom Strip (Near +Z)
                dummy.position.set(tx, 0.05, tz + halfSize - margin);
                dummy.rotation.set(0, Math.PI / 2, 0);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(idx++, dummy.matrix);
            }
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [tiles, tileSize, offset, count]);

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            {/* BoxGeometry: width=thickness, height=0.1, depth=tileSize */}
            <boxGeometry args={[0.15, 0.1, tileSize]} />
            <meshBasicMaterial color="#f97316" toneMapped={false} />
        </instancedMesh>
    );
};

// New Component: Destination Marker
const DestinationMarker: React.FC<{ x: number, z: number, tileSize: number, offset: number }> = ({ x, z, tileSize, offset }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 2 * delta;
    }
  });

  const posX = (x * tileSize) - offset;
  const posZ = (z * tileSize) - offset;

  return (
    <group position={[posX, 0, posZ]}>
        {/* Beam */}
        <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 5, 8]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} depthWrite={false} />
        </mesh>

        {/* Rotating Rings */}
        <group ref={meshRef} position={[0, 0.5, 0]}>
            <mesh rotation={[-Math.PI/2, 0, 0]}>
                <ringGeometry args={[tileSize * 0.2, tileSize * 0.25, 32]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]}>
                <ringGeometry args={[tileSize * 0.35, tileSize * 0.4, 32]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
        </group>

        {/* Floor Highlight */}
        <mesh rotation={[-Math.PI/2, 0, 0]}>
            <circleGeometry args={[tileSize * 0.45, 32]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} depthWrite={false} />
        </mesh>
        
        <pointLight color="#22d3ee" distance={8} intensity={2} position={[0, 2, 0]} />
    </group>
  );
};

// Detailed Missile Model
const DetailedMissileModel = ({ color }: { color: string }) => {
    const lightRef = useRef<THREE.PointLight>(null);
    useFrame(({clock}) => {
        if (lightRef.current) {
            // Blinking effect
            lightRef.current.intensity = Math.sin(clock.elapsedTime * 15) > 0 ? 3 : 0;
        }
    });

    return (
        <group rotation={[-Math.PI/2, 0, 0]}>
             {/* Fuselage */}
             <mesh position={[0, 1.5, 0]}>
                 <cylinderGeometry args={[0.3, 0.3, 3, 16]} />
                 <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
             </mesh>
             {/* Warhead */}
             <mesh position={[0, 3.4, 0]}>
                 <coneGeometry args={[0.31, 0.8, 16]} />
                 <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
             </mesh>
             {/* Collar Ring */}
             <mesh position={[0, 3.0, 0]}>
                 <cylinderGeometry args={[0.32, 0.32, 0.1, 16]} />
                 <meshBasicMaterial color="#f97316" />
             </mesh>
             {/* Fins */}
             {[0, Math.PI/2, Math.PI, -Math.PI/2].map((r, i) => (
                 <mesh key={i} position={[0, 0.5, 0]} rotation={[0, r, 0]}>
                     <boxGeometry args={[0.05, 1.0, 0.8]} />
                     <meshStandardMaterial color="#475569" metalness={0.5} />
                 </mesh>
             ))}
             {/* Engine Nozzle */}
             <mesh position={[0, -0.2, 0]}>
                 <cylinderGeometry args={[0.2, 0.15, 0.4, 16]} />
                 <meshStandardMaterial color="#334155" />
             </mesh>
             {/* Engine Glow */}
             <mesh position={[0, -0.5, 0]} rotation={[Math.PI, 0, 0]}>
                 <coneGeometry args={[0.15, 0.6, 8, 1, true]} />
                 <meshBasicMaterial color="#f97316" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
             </mesh>
             <pointLight position={[0, -1.0, 0]} color="#f97316" intensity={3} distance={8} />

             {/* Navigation/Strobe Light - Blinking */}
             <mesh position={[0, 2.0, 0.32]}>
                 <sphereGeometry args={[0.08]} />
                 <meshBasicMaterial color="#ff0000" />
             </mesh>
             <pointLight ref={lightRef} position={[0, 2.0, 0.4]} color="#ff0000" distance={2} decay={1} />
        </group>
    );
};

// CloudMesh Component
const CloudMesh: React.FC<{ cloud: CloudData; tileSize: number; offset: number; playerTeam: 'blue' | 'red' }> = ({ cloud, tileSize, offset, playerTeam }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame((state) => {
        if (meshRef.current) {
            const time = state.clock.elapsedTime;
            // Pulsating effect
            const scaleBase = 1.0;
            const scaleVar = 0.05 * Math.sin(time * 1.5);
            meshRef.current.scale.setScalar(scaleBase + scaleVar);
            
            // Gentle rotation
            meshRef.current.rotation.y = time * 0.1;
            meshRef.current.rotation.z = time * 0.05;
        }
    });

    const pos = new THREE.Vector3(
        (cloud.gridPos.x * tileSize) - offset,
        3, // slightly elevated
        (cloud.gridPos.z * tileSize) - offset
    );

    let color = "#ffffff";
    let opacity = 0.4;

    if (cloud.type === 'nano') {
        const isFriendly = cloud.team === playerTeam;
        color = isFriendly ? "#10b981" : "#ef4444"; // Green if friendly, Red if enemy
        opacity = 0.3;
    } else if (cloud.type === 'eclipse') {
        color = "#c084fc"; // Purple
        opacity = 0.5;
    } else if (cloud.type === 'wp') {
        color = "#fdba74"; // Orange/White
        opacity = 0.4;
    }

    return (
        <group position={pos}>
            <mesh ref={meshRef}>
                <sphereGeometry args={[cloud.radius * tileSize, 32, 32]} />
                <meshBasicMaterial 
                    color={color} 
                    transparent 
                    opacity={opacity} 
                    depthWrite={false} 
                    side={THREE.DoubleSide} 
                />
            </mesh>
            {/* Inner core for Nano */}
            {cloud.type === 'nano' && (
                <>
                    <mesh>
                        <dodecahedronGeometry args={[cloud.radius * tileSize * 0.6, 0]} />
                        <meshBasicMaterial color={cloud.team === playerTeam ? "#059669" : "#b91c1c"} wireframe transparent opacity={0.2} />
                    </mesh>
                    <Html position={[0, cloud.radius * tileSize * 0.5, 0]} center distanceFactor={25} occlude>
                        <div className="relative flex items-center justify-center animate-pulse drop-shadow-md">
                            <Zap className="text-yellow-400 w-8 h-8 fill-current" />
                            <Ban className="text-red-500 w-10 h-10 absolute opacity-80" />
                        </div>
                    </Html>
                </>
            )}
        </group>
    );
};

// Projectile Component
const ProjectileMesh: React.FC<{ projectile: Projectile }> = ({ projectile }) => {
    const meshRef = useRef<THREE.Group>(null);

    useFrame((state, delta) => {
        if (meshRef.current) {
            // Update position directly
            meshRef.current.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
            
            if ((projectile.trajectory === 'ballistic' || projectile.trajectory === 'swarm' || projectile.payload === 'titan_drop') && projectile.velocity) {
                 // Calculate forward vector based on velocity for proper orientation
                 if (Math.abs(projectile.velocity.x) > 0.001 || Math.abs(projectile.velocity.y) > 0.001 || Math.abs(projectile.velocity.z) > 0.001) {
                     const velocityVec = new THREE.Vector3(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
                     const lookTarget = new THREE.Vector3().copy(meshRef.current.position).add(velocityVec);
                     
                     // Smooth rotation using slerp for ballistics, instant for swarm to avoid jitters
                     const dummy = new THREE.Object3D();
                     dummy.position.copy(meshRef.current.position);
                     dummy.lookAt(lookTarget);
                     
                     if (projectile.trajectory === 'ballistic') {
                         meshRef.current.quaternion.slerp(dummy.quaternion, delta * 8);
                     } else {
                         meshRef.current.quaternion.copy(dummy.quaternion);
                     }
                 }
            } else {
                 // Standard Direct Projectile
                 if (Math.abs(projectile.velocity.x) > 0.01 || Math.abs(projectile.velocity.y) > 0.01 || Math.abs(projectile.velocity.z) > 0.01) {
                    const target = new THREE.Vector3(
                        projectile.position.x + projectile.velocity.x,
                        projectile.position.y + projectile.velocity.y,
                        projectile.position.z + projectile.velocity.z
                    );
                    meshRef.current.lookAt(target);
                }
            }
        }
    });

    if (projectile.payload === 'titan_drop') {
        return (
            <group ref={meshRef}>
                <mesh rotation={[Math.PI, 0, 0]}>
                    <coneGeometry args={[1, 3, 8]} />
                    <meshStandardMaterial color="#334155" metalness={0.8} />
                </mesh>
                <mesh position={[0, 1.5, 0]}>
                    <coneGeometry args={[0.5, 2, 8, 1, true]} />
                    <meshBasicMaterial color="#f97316" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
            </group>
        );
    }

    if (projectile.payload === 'nano_canister' || projectile.payload === 'nano_cloud_master') {
        return (
            <group ref={meshRef}>
                <group rotation={[Math.PI/2, 0, 0]}>
                    <mesh>
                        <cylinderGeometry args={[0.3, 0.3, 1, 8]} />
                        <meshStandardMaterial color="#10b981" />
                    </mesh>
                    <mesh position={[0, 0.6, 0]}>
                        <coneGeometry args={[0.3, 0.4, 8]} />
                        <meshStandardMaterial color="#34d399" />
                    </mesh>
                </group>
            </group>
        );
    }

    if (projectile.trajectory === 'ballistic') {
        const payloadColor = projectile.payload === 'eclipse' ? '#c084fc' : (projectile.payload === 'nuke' ? '#f59e0b' : '#ef4444');
        return (
            <group ref={meshRef}>
                 <DetailedMissileModel color={payloadColor} />
            </group>
        );
    }

    if (projectile.trajectory === 'swarm') {
        return (
            <group ref={meshRef}>
                <mesh rotation={[-Math.PI/2, 0, 0]}>
                    <coneGeometry args={[0.15, 0.6, 8]} />
                    <meshBasicMaterial color="#facc15" />
                </mesh>
                {/* Trail */}
                <mesh position={[0, 0, 0.4]} rotation={[-Math.PI/2, 0, 0]}>
                    <coneGeometry args={[0.1, 0.8, 8, 1, true]} />
                    <meshBasicMaterial color="#fbbf24" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
            </group>
        );
    }

    return (
        <group ref={meshRef}>
             {/* The projectile body - oriented along Z axis natively, so rotate X to align with LookAt forward (-Z) */}
             <mesh rotation={[-Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.2, 0.2, 1.5, 8]} />
                 <meshBasicMaterial color="#fca5a5" />
             </mesh>
             <pointLight color="#ef4444" intensity={3} distance={5} />
        </group>
    );
};

// Explosion Component
const ExplosionMesh: React.FC<{ explosion: Explosion }> = ({ explosion }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if(meshRef.current) {
            const age = Date.now() - explosion.createdAt;
            const progress = age / explosion.duration;
            const scale = 1 + (progress * 5); // Expansion
            meshRef.current.scale.set(scale, scale, scale);
            if (Array.isArray(meshRef.current.material)) {
                // not an array
            } else {
                (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
            }
        }
    });

    return (
        <mesh ref={meshRef} position={[explosion.position.x, explosion.position.y, explosion.position.z]}>
             <sphereGeometry args={[explosion.radius, 16, 16]} />
             <meshBasicMaterial color="#fb923c" transparent opacity={0.8} />
             <pointLight color="#f97316" intensity={5} distance={15} decay={2} />
        </mesh>
    );
};

// Selection Box Component
const SelectionBox: React.FC<{ start: THREE.Vector3, current: THREE.Vector3 }> = ({ start, current }) => {
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minZ = Math.min(start.z, current.z);
    const maxZ = Math.max(start.z, current.z);
    
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const centerX = minX + width / 2;
    const centerZ = minZ + depth / 2;

    return (
        <group position={[centerX, 0.2, centerZ]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[width, depth]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} side={THREE.DoubleSide} />
            </mesh>
            <Line 
                points={[
                    [-width/2, 0, -depth/2],
                    [width/2, 0, -depth/2],
                    [width/2, 0, depth/2],
                    [-width/2, 0, depth/2],
                    [-width/2, 0, -depth/2]
                ]}
                color="#22d3ee"
                lineWidth={2}
            />
        </group>
    );
};


interface CityMapProps {
  onStatsUpdate: (stats: GameStats) => void;
  onMapInit?: (data: { roadTiles: RoadTileData[], gridSize: number }) => void;
  onMinimapUpdate?: (data: { units: UnitData[], buildings: BuildingData[], structures: StructureData[], selectedUnitIds?: string[] }) => void;
  playerTeam?: 'blue' | 'red';
  interactionMode?: 'select' | 'target';
  onMapTarget?: (location: {x: number, z: number}) => void;
  pendingDoctrineAction?: { type: string, target: {x: number, z: number}, team: 'blue'|'red' } | null;
  onActionComplete?: () => void;
  doctrines?: { blue: DoctrineState, red: DoctrineState };
  targetingDoctrine?: { type: string, team: 'blue'|'red', cost: number } | null;
}

const CityMap: React.FC<CityMapProps> = ({ onStatsUpdate, onMapInit, onMinimapUpdate, playerTeam = 'blue', interactionMode = 'select', onMapTarget, pendingDoctrineAction, onActionComplete, doctrines, targetingDoctrine }) => {
  const { gridSize, tileSize, buildingDensity } = CITY_CONFIG;
  const offset = (gridSize * tileSize) / 2;
  const baseA_Coord = useMemo(() => ({ x: 4, z: 4 }), []);
  const baseB_Coord = useMemo(() => ({ x: gridSize - 5, z: gridSize - 5 }), [gridSize]);

  // Map Generation State
  const { initialBuildings, initialBlocks, roadTiles, roadTileSet, tileTypeMap, initialDrones } = useMemo(() => {
    const reservedSet = new Set<string>();
    const reservedTypeMap = new Map<string, RoadType>();
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const isMainBoulevard = x === Math.floor(gridSize / 2) || z === Math.floor(gridSize / 2);
        const isConnector = x % 6 === 0 || z % 6 === 0;
        const isBaseArea = (Math.abs(x - baseA_Coord.x) < 4 && Math.abs(z - baseA_Coord.z) < 4) || (Math.abs(x - baseB_Coord.x) < 4 && Math.abs(z - baseB_Coord.z) < 4);
        if (isMainBoulevard) { const key = `${x},${z}`; reservedSet.add(key); reservedTypeMap.set(key, 'main'); } 
        else if (isConnector || isBaseArea) { const key = `${x},${z}`; reservedSet.add(key); reservedTypeMap.set(key, 'street'); }
      }
    }
    const _buildings: BuildingData[] = [];
    const _blocks: BuildingBlock[] = [];
    const _drones: UnitData[] = [];
    const buildingMap = new Map<string, string>(); 
    const occupied = new Set([...reservedSet]);
    let blockCounter = 0;
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (occupied.has(`${x},${z}`)) continue;
        if (Math.random() < buildingDensity) {
          const blockSize = 3 + Math.floor(Math.random() * 4); 
          const blockId = `block-${blockCounter}`;
          const dist = Math.sqrt(Math.pow(x - gridSize/2, 2) + Math.pow(z - gridSize/2, 2));
          let type: BuildingData['type'] = 'residential';
          if (dist < 12 && Math.random() < 0.25) { type = 'server_node'; } 
          else { if (dist < 10) type = 'commercial'; else if (dist < 20) type = 'hightech'; else if (Math.random() > 0.5) type = 'industrial'; }

          const tentativeBuildings: BuildingData[] = [];
          const tentativeKeys = new Set<string>();
          const stack = [[x, z]];
          
          while (stack.length > 0 && tentativeBuildings.length < blockSize) {
            const removeIdx = Math.floor(Math.random() * stack.length);
            const [cx, cz] = stack.splice(removeIdx, 1)[0];
            const key = `${cx},${cz}`;
            if (occupied.has(key) || tentativeKeys.has(key)) continue;
            if (cx < 0 || cx >= gridSize || cz < 0 || cz >= gridSize) continue;
            let touchesOtherBlock = false;
            const neighbors = [[cx+1, cz], [cx-1, cz], [cx, cz+1], [cx, cz-1]];
            for (const [nx, nz] of neighbors) { if (buildingMap.has(`${nx},${nz}`)) { touchesOtherBlock = true; break; } }
            if (touchesOtherBlock) continue;
            tentativeKeys.add(key);
            const height = type === 'server_node' ? 6 + Math.random() * 4 : 10 + Math.random() * (type === 'commercial' ? 50 : 20);
            tentativeBuildings.push({
              id: `b-${cx}-${cz}`, gridX: cx, gridZ: cz,
              position: [(cx * tileSize) - offset, 0, (cz * tileSize) - offset],
              scale: [tileSize * 0.7, height, tileSize * 0.7],
              color: BUILDING_COLORS[type], type, height, blockId, owner: null, captureProgress: 0, capturingTeam: null
            });
            stack.push(...neighbors);
          }

          if (tentativeBuildings.length >= (type === 'server_node' ? 1 : 3)) {
            tentativeBuildings.forEach(b => {
                const k = `${b.gridX},${b.gridZ}`;
                occupied.add(k);
                buildingMap.set(k, blockId);
                _buildings.push(b);
                if (b.type === 'server_node') {
                    _drones.push({
                        id: `drone-${b.id}`, type: 'defense_drone', unitClass: 'defense', team: 'neutral',
                        gridPos: { x: b.gridX, z: b.gridZ }, path: [], visionRange: UNIT_STATS.defense_drone.visionRange,
                        health: UNIT_STATS.defense_drone.maxHealth, maxHealth: UNIT_STATS.defense_drone.maxHealth,
                        battery: 100, maxBattery: 100, cooldowns: {}
                    });
                }
            });
            _blocks.push({ id: blockId, type, buildingIds: tentativeBuildings.map(b => b.id), owner: null });
            blockCounter++;
          }
        }
      }
    }
    const _roadTilesList: RoadTileData[] = [];
    const _navigableSet = new Set<string>();
    const buildingSet = new Set(buildingMap.keys());
    const _tileTypeMap: Record<string, RoadType> = {};
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const key = `${x},${z}`;
        if (buildingSet.has(key)) continue; 
        _navigableSet.add(key);
        let type: RoadType = 'open';
        if (reservedTypeMap.has(key)) { type = reservedTypeMap.get(key)!; }
        _tileTypeMap[key] = type;
        _roadTilesList.push({ x, z, type });
      }
    }
    return { initialBuildings: _buildings, initialBlocks: _blocks, roadTiles: _roadTilesList, roadTileSet: _navigableSet, tileTypeMap: _tileTypeMap, initialDrones: _drones };
  }, [gridSize, tileSize, buildingDensity, offset, baseA_Coord, baseB_Coord]);

  useEffect(() => { if (onMapInit) onMapInit({ roadTiles, gridSize }); }, [roadTiles, gridSize, onMapInit]);

  // Unit State
  const [buildings, setBuildings] = useState<BuildingData[]>(initialBuildings);
  const [blocks, setBlocks] = useState<BuildingBlock[]>(initialBlocks);
  const [units, setUnits] = useState<UnitData[]>([
    { id: 'u1', type: 'drone', unitClass: 'air', team: 'blue', gridPos: { x: 3, z: 4 }, path: [], visionRange: UNIT_STATS.drone.visionRange, health: UNIT_STATS.drone.maxHealth, maxHealth: UNIT_STATS.drone.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u2', type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 5, z: 4 }, path: [], visionRange: UNIT_STATS.tank.visionRange, health: UNIT_STATS.tank.maxHealth, maxHealth: UNIT_STATS.tank.maxHealth, cooldowns: {}, charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS }, battery: 100, maxBattery: 100 },
    { id: 'u3', type: 'drone', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 5 }, path: [], visionRange: UNIT_STATS.drone.visionRange, health: UNIT_STATS.drone.maxHealth, maxHealth: UNIT_STATS.drone.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u4', type: 'tank', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 5 }, path: [], visionRange: UNIT_STATS.tank.visionRange, health: UNIT_STATS.tank.maxHealth, maxHealth: UNIT_STATS.tank.maxHealth, cooldowns: {}, charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS }, battery: 100, maxBattery: 100 },
    { id: 'u5', type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 2, z: 5 }, path: [], visionRange: UNIT_STATS.ghost.visionRange, isDampenerActive: false, health: UNIT_STATS.ghost.maxHealth, maxHealth: UNIT_STATS.ghost.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u6', type: 'ghost', unitClass: 'infantry', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ghost.visionRange, isDampenerActive: true, health: UNIT_STATS.ghost.maxHealth, maxHealth: UNIT_STATS.ghost.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u7', type: 'guardian', unitClass: 'support', team: 'blue', gridPos: { x: 4, z: 6 }, path: [], visionRange: UNIT_STATS.guardian.visionRange, health: UNIT_STATS.guardian.maxHealth, maxHealth: UNIT_STATS.guardian.maxHealth, cooldowns: { trophySystem: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u8', type: 'guardian', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 4 }, path: [], visionRange: UNIT_STATS.guardian.visionRange, health: UNIT_STATS.guardian.maxHealth, maxHealth: UNIT_STATS.guardian.maxHealth, cooldowns: { trophySystem: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u9', type: 'mule', unitClass: 'ordnance', team: 'blue', gridPos: { x: 6, z: 5 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u10', type: 'mule', unitClass: 'ordnance', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u11', type: 'wasp', unitClass: 'air', team: 'blue', gridPos: { x: 5, z: 7 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES }, battery: 100, maxBattery: 100 },
    { id: 'u12', type: 'mason', unitClass: 'builder', team: 'blue', gridPos: { x: 3, z: 6 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u13', type: 'helios', unitClass: 'support', team: 'blue', gridPos: { x: 2, z: 6 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u14', type: 'sun_plate', unitClass: 'armor', team: 'blue', gridPos: { x: 4, z: 5 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, isDeployed: false },
    { id: 'u15', type: 'ballista', unitClass: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { eclipse: 1, wp: 1 }, loadingProgress: 0 },
    { id: 'u16', type: 'wasp', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 8 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES }, battery: 100, maxBattery: 100 },
    { id: 'u17', type: 'mason', unitClass: 'builder', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u18', type: 'helios', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u19', type: 'sun_plate', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, isDeployed: false },
    { id: 'u20', type: 'ballista', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { eclipse: 1, wp: 1 }, loadingProgress: 0 },
    { id: 'u21', type: 'banshee', unitClass: 'support', team: 'blue', gridPos: { x: 6, z: 6 }, path: [], visionRange: UNIT_STATS.banshee.visionRange, health: UNIT_STATS.banshee.maxHealth, maxHealth: UNIT_STATS.banshee.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, jammerActive: false },
    { id: 'u22', type: 'banshee', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 7, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.banshee.visionRange, health: UNIT_STATS.banshee.maxHealth, maxHealth: UNIT_STATS.banshee.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, jammerActive: false },
    ...initialDrones
  ]);
  
  const [structuresState, setStructuresState] = useState<StructureData[]>([]);
  const [decoys, setDecoys] = useState<DecoyData[]>([]);
  const [clouds, setClouds] = useState<CloudData[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  
  // Refactored Selection State
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [dragSelection, setDragSelection] = useState<{start: THREE.Vector3, current: THREE.Vector3, active: boolean} | null>(null);
  
  const [targetingSourceId, setTargetingSourceId] = useState<string | null>(null);
  const [targetingAbility, setTargetingAbility] = useState<'TETHER' | 'CANNON' | 'SURVEILLANCE' | 'MISSILE' | 'DECOY' | 'SWARM' | null>(null);

  const [baseMenuOpen, setBaseMenuOpen] = useState<'blue' | 'red' | null>(null);
  const [placementMode, setPlacementMode] = useState<{type: StructureType, cost: number} | null>(null);
  const [hoverGridPos, setHoverGridPos] = useState<{x: number, z: number} | null>(null);
  const [teamResources, setTeamResources] = useState<{blue: number, red: number}>({ blue: 1000, red: 1000 });
  const [teamCompute, setTeamCompute] = useState<{blue: number, red: number}>({ blue: 0, red: 0 });
  const [stockpile, setStockpile] = useState<{blue: {eclipse: number, wp: number}, red: {eclipse: number, wp: number}}>({ blue: { eclipse: 0, wp: 0 }, red: { eclipse: 0, wp: 0 } });
  
  // CP Accumulator for Doctrine Unlocks (Automatic progression simulation)
  const cpAccumulator = useRef<{blue: number, red: number}>({ blue: 0, red: 0 });

  // Cheat State
  const [cheatCompute, setCheatCompute] = useState<{blue: number, red: number}>({ blue: 0, red: 0 });
  
  const [depotMenuOpenId, setDepotMenuOpenId] = useState<string | null>(null);

  // Interaction Refs
  const didDragRef = useRef(false);

  const unitsRef = useRef(units);
  const blocksRef = useRef(blocks);
  const buildingsRef = useRef(buildings);
  const cloudsRef = useRef(clouds);
  const structuresRef = useRef(structuresState);
  const selectedUnitIdsRef = useRef(selectedUnitIds);
  const projectilesRef = useRef(projectiles);

  useEffect(() => { unitsRef.current = units; }, [units]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { cloudsRef.current = clouds; }, [clouds]);
  useEffect(() => { structuresRef.current = structuresState; }, [structuresState]);
  useEffect(() => { selectedUnitIdsRef.current = selectedUnitIds; }, [selectedUnitIds]);
  useEffect(() => { projectilesRef.current = projectiles; }, [projectiles]);

  // Expose Cheats
  useEffect(() => {
    (window as any).GAME_CHEATS = {
      setResources: (team: 'blue' | 'red', amount: number) => {
        setTeamResources(prev => ({ ...prev, [team]: amount }));
      },
      setCompute: (team: 'blue' | 'red', amount: number) => {
        setCheatCompute(prev => ({ ...prev, [team]: amount }));
      }
    };
    return () => { (window as any).GAME_CHEATS = undefined; };
  }, []);

  // Minimap Update Loop
  useEffect(() => {
    if (onMinimapUpdate) {
        // Include static base in the structures list for minimap visibility
        const staticBaseBlue: StructureData = {
            id: 'base-hq-blue',
            type: 'support',
            team: 'blue',
            gridPos: { x: 4, z: 4 },
            isBlueprint: false,
            constructionProgress: 100,
            maxProgress: 100,
            health: 1000,
            maxHealth: 1000
        };
        const staticBaseRed: StructureData = {
            id: 'base-hq-red',
            type: 'support',
            team: 'red',
            gridPos: { x: gridSize - 5, z: gridSize - 5 },
            isBlueprint: false,
            constructionProgress: 100,
            maxProgress: 100,
            health: 1000,
            maxHealth: 1000
        };

        const interval = setInterval(() => {
            // Filter real units (hide active decoys source)
            const realUnits = unitsRef.current.filter(u => !u.decoyActive);
            
            // Create fake units from decoys
            const fakeUnits: UnitData[] = decoys.map(d => ({
                id: d.id,
                type: 'ghost',
                unitClass: 'infantry',
                team: d.team,
                gridPos: d.gridPos,
                path: [],
                visionRange: 0,
                health: 100,
                maxHealth: 100,
                battery: 100,
                maxBattery: 100,
                cooldowns: {}
            }));

            onMinimapUpdate({ 
                units: [...realUnits, ...fakeUnits], 
                buildings: buildingsRef.current,
                structures: [staticBaseBlue, staticBaseRed, ...structuresRef.current],
                selectedUnitIds: Array.from(selectedUnitIdsRef.current)
            });
        }, 100); 
        
        return () => clearInterval(interval);
    }
  }, [onMinimapUpdate, gridSize, decoys]);

  // Pointer Handlers for Drag Select
  const handlePointerDown = (e: any) => {
      // e.stopPropagation(); // Bubbling allowed
      // Only handle Left Click (0) for drag select
      if (e.button === 0) {
          if (interactionMode === 'target' && onMapTarget) {
              const gx = Math.round((e.point.x + offset) / tileSize);
              const gz = Math.round((e.point.z + offset) / tileSize);
              onMapTarget({ x: gx, z: gz });
              return; 
          }

          didDragRef.current = false;
          setDragSelection({ start: e.point.clone(), current: e.point.clone(), active: true });
      }
  };

  const handlePointerMove = (e: any) => {
      if (dragSelection && dragSelection.active) {
          const dist = dragSelection.start.distanceTo(e.point);
          if (dist > 1.0) didDragRef.current = true;
          setDragSelection(prev => ({ ...prev!, current: e.point.clone() }));
      }
      const gx = Math.round((e.point.x + offset) / tileSize);
      const gz = Math.round((e.point.z + offset) / tileSize);
      setHoverGridPos({x: gx, z: gz});
  };

  const handlePointerUp = (e: any) => {
      if (interactionMode === 'target') return;

      if (dragSelection && dragSelection.active) {
          if (didDragRef.current) {
               // Performed a Drag - Box Select
               const minX = Math.min(dragSelection.start.x, dragSelection.current.x);
               const maxX = Math.max(dragSelection.start.x, dragSelection.current.x);
               const minZ = Math.min(dragSelection.start.z, dragSelection.current.z);
               const maxZ = Math.max(dragSelection.start.z, dragSelection.current.z);

               const newSelection = new Set<string>();
               units.forEach(u => {
                   // Unit world pos
                   const ux = (u.gridPos.x * tileSize) - offset;
                   const uz = (u.gridPos.z * tileSize) - offset;
                   
                   // Check if within bounds
                   if (ux >= minX && ux <= maxX && uz >= minZ && uz <= maxZ) {
                       // Only select friendly units
                       if (u.team === playerTeam) {
                           newSelection.add(u.id);
                       }
                   }
               });
               
               if (newSelection.size > 0) {
                   setSelectedUnitIds(newSelection);
               } else {
                   // Optional: clear selection if empty box
                   setSelectedUnitIds(newSelection);
               }
          } 
          setDragSelection({ ...dragSelection, active: false });
      }
  };

  const visibleUnitIds = useMemo(() => {
    const visible = new Set<string>();
    units.forEach(u => {
        // Always show friendly units AND defense drones (they are map features)
        if (u.team === playerTeam || u.type === 'defense_drone') { visible.add(u.id); return; }
        const friendlies = units.filter(f => f.team === playerTeam);
        const inWP = clouds.some(c => c.type === 'wp' && Math.sqrt(Math.pow(u.gridPos.x - c.gridPos.x, 2) + Math.pow(u.gridPos.z - c.gridPos.z, 2)) <= c.radius);
        if (inWP) return; 
        if (u.smoke?.active) {
            const isAdjacent = friendlies.some(f => Math.abs(u.gridPos.x - f.gridPos.x) <= 1 && Math.abs(u.gridPos.z - f.gridPos.z) <= 1);
            if (!isAdjacent) return;
        }
        const isDetected = friendlies.some(f => {
            const fInWP = clouds.some(c => c.type === 'wp' && Math.sqrt(Math.pow(f.gridPos.x - c.gridPos.x, 2) + Math.pow(f.gridPos.z - c.gridPos.z, 2)) <= c.radius);
            if (fInWP) return false;
            const dist = Math.sqrt(Math.pow(u.gridPos.x - f.gridPos.x, 2) + Math.pow(u.gridPos.z - f.gridPos.z, 2));
            return dist <= f.visionRange;
        });
        if (isDetected) visible.add(u.id);
    });
    return visible;
  }, [units, playerTeam, clouds]);

  const calculateStats = useCallback((
    currentBuildings: BuildingData[], currentUnits: UnitData[], currentBlocks: BuildingBlock[], currentResources: {blue: number, red: number}, currentStockpile: {blue: {eclipse: number, wp: number}, red: {eclipse: number, wp: number}}
  ): GameStats => {
    const teams: ('blue' | 'red')[] = ['blue', 'red'];
    const result = { blue: {} as TeamStats, red: {} as TeamStats };
    
    teams.forEach(team => {
      let income = 0;
      const teamBuildings = { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0 };
      currentBuildings.filter(b => b.owner === team).forEach(b => {
        teamBuildings[b.type]++;
        const config = BUILDING_VALUES[b.type];
        const block = currentBlocks.find(blk => blk.id === b.blockId);
        const isBlockOwned = block && block.owner === team;
        income += config.income * (isBlockOwned ? BLOCK_BONUS.RESOURCE_MULTIPLIER : 1);
      });

      // Update CP Accumulator based on income
      cpAccumulator.current[team] += income;

      // Determine Doctrine Tier Unlocks
      const lifetimeCP = cpAccumulator.current[team];
      let tiers = 1; // Default Tier 1 unlocked
      if (lifetimeCP >= TIER_UNLOCK_COSTS.TIER2) tiers = 2;
      if (lifetimeCP >= TIER_UNLOCK_COSTS.TIER3) tiers = 3;

      result[team] = { 
          resources: currentResources[team], 
          income, 
          compute: teamBuildings.server_node, 
          units: currentUnits.filter(u => u.team === team).length, 
          buildings: teamBuildings, 
          stockpile: currentStockpile[team],
          doctrine: { selected: null, unlockedTiers: tiers, cooldowns: { tier2: 0, tier3: 0 } } // Selected is managed by App, but tiers are calculated here
      };
    });
    return result as GameStats;
  }, []);

  const dynamicRoadTileSet = useMemo(() => {
    const set = new Set<number>();
    roadTiles.forEach(t => { set.add((t.x << 16) | t.z); });
    structuresState.forEach(s => { set.delete((s.gridPos.x << 16) | s.gridPos.z); });
    set.delete((baseA_Coord.x << 16) | baseA_Coord.z);
    set.delete((baseB_Coord.x << 16) | baseB_Coord.z);
    return set;
  }, [roadTiles, structuresState, baseA_Coord, baseB_Coord]);

  const findPath = useCallback((start: {x: number, z: number}, end: {x: number, z: number}) => {
      const startId = (start.x << 16) | start.z;
      const endId = (end.x << 16) | end.z;
      const queue = [{x: start.x, z: start.z, path: [] as string[]}];
      const visited = new Set<number>();
      visited.add(startId);
      const MAX_SEARCH = 20000; 
      let ops = 0;
      while(queue.length > 0 && ops < MAX_SEARCH) {
          ops++;
          const current = queue.shift()!;
          const currentId = (current.x << 16) | current.z;
          if (currentId === endId) return current.path;
          const neighbors = [{x: current.x+1, z: current.z}, {x: current.x-1, z: current.z}, {x: current.x, z: current.z+1}, {x: current.x, z: current.z-1}];
          for (const n of neighbors) {
              const nId = (n.x << 16) | n.z;
              if (n.x >= 0 && n.x < gridSize && n.z >= 0 && n.z < gridSize) {
                  if ((dynamicRoadTileSet.has(nId) || nId === endId) && !visited.has(nId)) {
                      visited.add(nId);
                      queue.push({ x: n.x, z: n.z, path: [...current.path, `${n.x},${n.z}`] });
                  }
              }
          }
      }
      return [];
  }, [gridSize, dynamicRoadTileSet]);

  // Doctrine Effects Processor
  useEffect(() => {
      if (pendingDoctrineAction) {
          const { type, target, team } = pendingDoctrineAction;
          
          if (type === 'HEAVY_METAL_TIER2') {
              // Spawn Orbital Drop Titan
              const dropPos = { x: (target.x * tileSize) - offset, y: 100, z: (target.z * tileSize) - offset };
              const impactPos = { x: (target.x * tileSize) - offset, y: 0.5, z: (target.z * tileSize) - offset };
              
              setProjectiles(prev => [...prev, {
                  id: `drop-${Date.now()}`,
                  ownerId: 'orbital',
                  team: team,
                  position: dropPos,
                  velocity: { x: 0, y: -65.6, z: 0 }, 
                  damage: 50, // Impact damage
                  radius: 2,
                  maxDistance: 200,
                  distanceTraveled: 0,
                  targetPos: impactPos,
                  trajectory: 'direct', 
                  payload: 'titan_drop', // Special payload to trigger spawn
                  startPos: dropPos,
                  startTime: Date.now()
              }]);
          }
          else if (type === 'HEAVY_METAL_TIER3') {
              // Tactical Nuke
              const startPos = { x: (target.x * tileSize) - offset, y: 120, z: (target.z * tileSize) - offset };
              const targetPos = { x: (target.x * tileSize) - offset, y: 1.0, z: (target.z * tileSize) - offset };
              
              setProjectiles(prev => [...prev, { 
                  id: `nuke-${Date.now()}`, 
                  ownerId: 'command', 
                  team: team as 'blue' | 'red', 
                  position: startPos, 
                  velocity: { x: 0, y: -40, z: 0 }, 
                  damage: 500, // Massive damage handled in explosion logic
                  radius: 8, 
                  maxDistance: 200,
                  distanceTraveled: 0, 
                  targetPos: targetPos,
                  trajectory: 'ballistic',
                  payload: 'nuke',
                  startPos: startPos,
                  startTime: Date.now()
              }]);
          }
          else if (type === 'SHADOW_OPS_TIER2') {
              // Spawn Decoys
              const newDecoys: DecoyData[] = [];
              const offsets = [{x:0, z:0}, {x:1, z:1}, {x:-1, z:-1}];
              offsets.forEach((off, i) => {
                  newDecoys.push({
                      id: `decoy-doc-${Date.now()}-${i}`,
                      team: team as 'blue' | 'red',
                      gridPos: { x: target.x + off.x, z: target.z + off.z },
                      createdAt: Date.now()
                  });
              });
              setDecoys(prev => [...prev, ...newDecoys]);
          }
          else if (type === 'SHADOW_OPS_TIER3') {
              // Global/Area Stun
              setUnits(prev => prev.map(u => {
                  if (u.team !== team && u.team !== 'neutral') {
                      return { ...u, isStunned: true, stunDuration: 10000 }; // 10s Stun
                  }
                  return u;
              }));
          }
          else if (type === 'SKUNKWORKS_TIER2') {
              // Nano Cloud Projectile Volley
              const count = 3;
              for (let i = 0; i < count; i++) {
                  const isMaster = i === 0;
                  const angle = (i / count) * Math.PI * 2;
                  const radius = isMaster ? 0 : 2;
                  const offsetX = Math.cos(angle) * radius;
                  const offsetZ = Math.sin(angle) * radius;
                  
                  const startPos = { 
                      x: (target.x * tileSize) - offset + (Math.random() * 5 - 2.5), 
                      y: 80, 
                      z: (target.z * tileSize) - offset + (Math.random() * 5 - 2.5) 
                  };
                  const targetPos = { 
                      x: ((target.x + offsetX) * tileSize) - offset, 
                      y: 0.5, 
                      z: ((target.z + offsetZ) * tileSize) - offset 
                  };

                  const dx = targetPos.x - startPos.x;
                  const dy = targetPos.y - startPos.y;
                  const dz = targetPos.z - startPos.z;
                  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                  const speed = 40;

                  setProjectiles(prev => [...prev, {
                      id: `nano-canister-${Date.now()}-${i}`,
                      ownerId: 'command',
                      team: team as 'blue'|'red',
                      position: startPos,
                      velocity: { x: (dx/dist)*speed, y: (dy/dist)*speed, z: (dz/dist)*speed }, 
                      damage: 20,
                      radius: ABILITY_CONFIG.NANO_CLOUD_RADIUS, 
                      maxDistance: 200,
                      distanceTraveled: 0,
                      targetPos: targetPos,
                      trajectory: 'direct',
                      payload: isMaster ? 'nano_cloud_master' : 'nano_canister', // Only master spawns actual cloud
                      startPos: startPos,
                      startTime: Date.now()
                  }]);
              }
          }
          else if (type === 'SKUNKWORKS_TIER3') {
              // Spawn Swarm Host
              setUnits(prev => [...prev, {
                  id: `host-${Date.now()}`,
                  type: 'swarm_host',
                  unitClass: 'ordnance',
                  team: team as 'blue' | 'red',
                  gridPos: { x: target.x, z: target.z },
                  path: [],
                  visionRange: 4,
                  health: 200,
                  maxHealth: 200,
                  battery: 100,
                  maxBattery: 100,
                  cooldowns: { spawnWasp: 0 }
              }]);
          }

          if (onActionComplete) onActionComplete();
      }
  }, [pendingDoctrineAction, tileSize, offset, onActionComplete]);

  // Doctrine Passive Loop + Swarm AI
  useEffect(() => {
      const interval = setInterval(() => {
          setUnits(prevUnits => {
              let unitsChanged = false;
              let nextUnits = [...prevUnits];

              // 1. Swarm Host Spawning Logic
              const hosts = nextUnits.filter(u => u.type === 'swarm_host');
              const hostMap = new Map<string, UnitData>();

              hosts.forEach(host => {
                  hostMap.set(host.id, host);
                  
                  // Only spawn if anchored
                  if (host.isAnchored) {
                      const children = nextUnits.filter(u => u.type === 'crawler_drone' && u.parentId === host.id);
                      const maxCrawlers = ABILITY_CONFIG.SWARM_HOST_MAX_UNITS || 10;
                      
                      // Check spawn cooldown
                      const spawnReady = !host.cooldowns.spawnWasp || host.cooldowns.spawnWasp <= 0;

                      if (children.length < maxCrawlers && spawnReady) {
                          const newCrawler: UnitData = {
                              id: `crawler-${host.id}-${Date.now()}-${children.length}`,
                              type: 'crawler_drone',
                              unitClass: 'ordnance',
                              team: host.team,
                              gridPos: { ...host.gridPos }, // Spawn at host location
                              path: [],
                              visionRange: UNIT_STATS.crawler_drone.visionRange,
                              health: UNIT_STATS.crawler_drone.maxHealth,
                              maxHealth: UNIT_STATS.crawler_drone.maxHealth,
                              battery: 100,
                              maxBattery: 100,
                              cooldowns: {},
                              parentId: host.id
                          };
                          nextUnits.push(newCrawler);
                          
                          // Set cooldown on host
                          const hIdx = nextUnits.findIndex(u => u.id === host.id);
                          if (hIdx !== -1) {
                              nextUnits[hIdx] = {
                                  ...nextUnits[hIdx],
                                  cooldowns: { ...nextUnits[hIdx].cooldowns, spawnWasp: 7000 }
                              };
                          }
                          unitsChanged = true;
                      }
                  }
              });

              // 2. Unit Passive Effects & AI (Crawler AI included)
              const survivingUnits: UnitData[] = [];
              
              nextUnits.forEach(u => {
                  let modifiedUnit = u;
                  let keepUnit = true;
                  let uChanged = false;

                  // Crawler AI
                  if (u.type === 'crawler_drone' && u.parentId) {
                      const parent = hostMap.get(u.parentId);
                      if (!parent) {
                          keepUnit = false; // Parent gone
                          uChanged = true;
                      } else {
                          if (!parent.isAnchored) {
                              // RECALL
                              const dist = Math.sqrt(Math.pow(u.gridPos.x - parent.gridPos.x, 2) + Math.pow(u.gridPos.z - parent.gridPos.z, 2));
                              if (dist < 1.5) {
                                  keepUnit = false; // Recalled
                                  uChanged = true;
                              } else {
                                  // Path to parent if not already
                                  const targetKey = `${parent.gridPos.x},${parent.gridPos.z}`;
                                  const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;
                                  
                                  if (currentDest !== targetKey) {
                                      const path = findPath(u.gridPos, parent.gridPos);
                                      if (path.length > 0) {
                                          modifiedUnit = { ...u, path };
                                          uChanged = true;
                                      }
                                  }
                              }
                          } else {
                              // PATROL / ATTACK (Parent Anchored)
                              if (u.path.length === 0) {
                                  // Scan enemies relative to PARENT
                                  const range = ABILITY_CONFIG.CRAWLER_RADIUS || 7;
                                  const enemies = nextUnits.filter(e => 
                                      e.team !== u.team && e.team !== 'neutral' && e.health > 0 && !e.isStealthed &&
                                      Math.sqrt(Math.pow(e.gridPos.x - parent.gridPos.x, 2) + Math.pow(e.gridPos.z - parent.gridPos.z, 2)) <= range
                                  );

                                  let targetPos = null;
                                  if (enemies.length > 0) {
                                      // Closest enemy
                                      let minDist = 9999;
                                      enemies.forEach(e => {
                                          const d = Math.sqrt(Math.pow(e.gridPos.x - parent.gridPos.x, 2) + Math.pow(e.gridPos.z - parent.gridPos.z, 2));
                                          if (d < minDist) { minDist = d; targetPos = e.gridPos; }
                                      });
                                  } else {
                                      // Patrol near parent
                                      const rx = parent.gridPos.x + Math.floor(Math.random() * 10 - 5);
                                      const rz = parent.gridPos.z + Math.floor(Math.random() * 10 - 5);
                                      const d = Math.sqrt(Math.pow(rx - parent.gridPos.x, 2) + Math.pow(rz - parent.gridPos.z, 2));
                                      if (d <= range && rx >= 0 && rx < CITY_CONFIG.gridSize && rz >= 0 && rz < CITY_CONFIG.gridSize) {
                                          targetPos = { x: rx, z: rz };
                                      }
                                  }

                                  if (targetPos) {
                                      const path = findPath(u.gridPos, targetPos);
                                      if (path.length > 0) {
                                          modifiedUnit = { ...u, path };
                                          uChanged = true;
                                      }
                                  }
                              }
                          }
                      }
                  }

                  // Doctrine Passives
                  const teamDoctrine = doctrines?.[modifiedUnit.team as 'blue' | 'red'];
                  
                  // Heavy Metal: Regen
                  if (teamDoctrine?.selected === 'heavy_metal' && modifiedUnit.unitClass === 'armor') {
                      if (!modifiedUnit.lastAttackTime || Date.now() - modifiedUnit.lastAttackTime > 5000) {
                          if (modifiedUnit.health < modifiedUnit.maxHealth) {
                              modifiedUnit = { ...modifiedUnit, health: Math.min(modifiedUnit.maxHealth, modifiedUnit.health + 5) };
                              uChanged = true;
                          }
                      }
                  }

                  // Shadow Ops: Speed
                  if (teamDoctrine?.selected === 'shadow_ops' && (modifiedUnit.type === 'ghost' || modifiedUnit.isStealthed)) {
                      if (!modifiedUnit.activeBuffs?.includes('speed')) {
                          modifiedUnit = { ...modifiedUnit, activeBuffs: [...(modifiedUnit.activeBuffs || []), 'speed'] };
                          uChanged = true;
                      }
                  }

                  // Stun Timer
                  if (modifiedUnit.isStunned && modifiedUnit.stunDuration) {
                      if (modifiedUnit.stunDuration <= 0) {
                          modifiedUnit = { ...modifiedUnit, isStunned: false, stunDuration: 0 };
                          uChanged = true;
                      } else {
                          modifiedUnit = { ...modifiedUnit, stunDuration: modifiedUnit.stunDuration - 1000 };
                          uChanged = true;
                      }
                  }

                  // Cooldown Management
                  if (modifiedUnit.cooldowns) {
                      const nextCds = { ...modifiedUnit.cooldowns };
                      let cdsChanged = false;
                      for (const k in nextCds) {
                          const key = k as keyof typeof nextCds;
                          if (typeof nextCds[key] === 'number' && nextCds[key]! > 0) {
                              nextCds[key] = Math.max(0, nextCds[key]! - 1000);
                              cdsChanged = true;
                          }
                      }
                      if (cdsChanged) {
                          modifiedUnit = { ...modifiedUnit, cooldowns: nextCds };
                          uChanged = true;
                      }
                  }

                  if (uChanged) unitsChanged = true;
                  if (keepUnit) survivingUnits.push(modifiedUnit);
              });

              return unitsChanged ? survivingUnits : prevUnits;
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [doctrines, findPath]);

  const handleUnitSelect = (id: string) => {
      // If we just dragged, ignore click logic that might fire
      if (didDragRef.current) return;
      if (interactionMode === 'target') return; // Selection disabled in target mode

      if (targetingSourceId && targetingAbility === 'TETHER') {
          setUnits(prev => prev.map(u => {
              if (u.id === targetingSourceId) return { ...u, tetherTargetId: id };
              return u;
          }));
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId && targetingAbility === 'CANNON') {
          const targetUnit = units.find(u => u.id === id);
          if(targetUnit) handleTileClick(targetUnit.gridPos.x, targetUnit.gridPos.z);
      } else {
          // Standard Single Selection - replaces existing group selection
          setSelectedUnitIds(new Set([id]));
      }
  };

  const handleMoveStep = (id: string) => {
      setUnits(prev => prev.map(u => {
          if (u.id !== id) return u;
          if (u.path.length === 0) return u;
          const nextKey = u.path[0];
          const [nx, nz] = nextKey.split(',').map(Number);
          
          let newSurveillance = u.surveillance;
          
          // Check if arrived at surveillance center (Transition traveling -> active)
          if (u.surveillance && u.surveillance.status === 'traveling') {
              if (nx === u.surveillance.center.x && nz === u.surveillance.center.z) {
                  newSurveillance = { ...u.surveillance, status: 'active', startTime: Date.now() };
              }
          }
          
          // Check if returned to base (Transition returning -> done)
          if (u.surveillance && u.surveillance.status === 'returning') {
              if (u.surveillance.returnPos && nx === u.surveillance.returnPos.x && nz === u.surveillance.returnPos.z) {
                  newSurveillance = undefined;
              }
          }

          return { ...u, gridPos: { x: nx, z: nz }, path: u.path.slice(1), surveillance: newSurveillance };
      }));
  };

  const handleTileClick = (x: number, z: number) => {
      // If we just dragged, ignore click events generated
      if (didDragRef.current) return;

      if (interactionMode === 'target' && onMapTarget) {
          onMapTarget({ x, z });
          return;
      }

      if (placementMode) {
          if (teamResources[playerTeam] >= placementMode.cost) {
              setTeamResources(prev => ({...prev, [playerTeam]: prev[playerTeam] - placementMode.cost}));
              const isWallOrTurret = placementMode.type === 'wall_tier1' || placementMode.type === 'wall_tier2' || placementMode.type === 'defense';
              setStructuresState(prev => [...prev, { id: `struct-${Date.now()}`, type: placementMode.type, team: playerTeam, gridPos: {x, z}, isBlueprint: isWallOrTurret, constructionProgress: 0, maxProgress: STRUCTURE_INFO[placementMode.type].maxProgress || 100, health: STRUCTURE_INFO[placementMode.type].maxHealth, maxHealth: STRUCTURE_INFO[placementMode.type].maxHealth }]);
              setPlacementMode(null);
          }
      } else if (targetingSourceId && targetingAbility === 'SURVEILLANCE') {
          const unit = units.find(u => u.id === targetingSourceId);
          if (unit) {
              const path = findPath(unit.gridPos, { x, z });
              // Allow activating surveillance if path found OR if already at target location
              if (path.length > 0 || (unit.gridPos.x === x && unit.gridPos.z === z)) {
                  setUnits(prev => prev.map(u => {
                      if (u.id === unit.id) {
                          const isAlreadyThere = unit.gridPos.x === x && unit.gridPos.z === z;
                          return { 
                              ...u, 
                              path, 
                              surveillance: { 
                                  active: true, 
                                  status: isAlreadyThere ? 'active' : 'traveling', 
                                  center: { x, z }, 
                                  returnPos: { x: unit.gridPos.x, z: unit.gridPos.z }, 
                                  startTime: isAlreadyThere ? Date.now() : 0 
                              } 
                          };
                      }
                      return u;
                  }));
              }
          }
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId && targetingAbility === 'CANNON') {
           const sourceUnit = unitsRef.current.find(u => u.id === targetingSourceId);
           if (sourceUnit) {
                const startPos = { x: (sourceUnit.gridPos.x * CITY_CONFIG.tileSize) - offset, y: 1.5, z: (sourceUnit.gridPos.z * CITY_CONFIG.tileSize) - offset };
                const targetPos = { x: (x * CITY_CONFIG.tileSize) - offset, y: 1.0, z: (z * CITY_CONFIG.tileSize) - offset };
                const dx = targetPos.x - startPos.x;
                const dz = targetPos.z - startPos.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                const speed = ABILITY_CONFIG.TITAN_CANNON_SPEED;
                if (dist > 0) {
                    const vx = (dx / dist) * speed;
                    const vz = (dz / dist) * speed;
                    setUnits(prev => prev.map(u => {
                        if (u.id === sourceUnit.id) {
                            return { ...u, battery: Math.max(0, u.battery - ABILITY_CONFIG.TITAN_CANNON_COST), cooldowns: { ...u.cooldowns, mainCannon: ABILITY_CONFIG.TITAN_CANNON_COOLDOWN } };
                        }
                        return u;
                    }));
                    setProjectiles(prev => [...prev, { id: `proj-${Date.now()}`, ownerId: sourceUnit.id, team: sourceUnit.team, position: startPos, velocity: { x: vx, y: 0, z: vz }, damage: ABILITY_CONFIG.TITAN_CANNON_DAMAGE, radius: 0.5, maxDistance: ABILITY_CONFIG.TITAN_CANNON_PROJECTILE_RANGE * CITY_CONFIG.tileSize, distanceTraveled: 0, targetPos: targetPos, trajectory: 'direct' }]);
                }
           }
           setTargetingSourceId(null);
           setTargetingAbility(null);
      } else if (targetingSourceId && targetingAbility === 'MISSILE') {
          // Ballistic Missile Logic (Launch -> Parabolic Arc -> Impact)
          const sourceUnit = unitsRef.current.find(u => u.id === targetingSourceId);
          if (sourceUnit && sourceUnit.ammoState === 'armed' && sourceUnit.loadedAmmo) {
              const startPos = { x: (sourceUnit.gridPos.x * CITY_CONFIG.tileSize) - offset, y: 2.0, z: (sourceUnit.gridPos.z * CITY_CONFIG.tileSize) - offset };
              const targetPos = { x: (x * CITY_CONFIG.tileSize) - offset, y: 1.0, z: (z * CITY_CONFIG.tileSize) - offset };
              
              const distance = Math.sqrt(Math.pow(targetPos.x - startPos.x, 2) + Math.pow(targetPos.z - startPos.z, 2));
              const duration = (distance / ABILITY_CONFIG.MISSILE_CRUISE_SPEED) * 1000; // ms

              const payload = sourceUnit.loadedAmmo;

              // Consume Ammo
              setUnits(prev => prev.map(u => {
                  if (u.id === sourceUnit.id) {
                      return { ...u, ammoState: 'empty', loadedAmmo: null };
                  }
                  return u;
              }));

              // Spawn Projectile in Parabolic Ballistic Mode
              setProjectiles(prev => [...prev, { 
                  id: `missile-${Date.now()}`, 
                  ownerId: sourceUnit.id, 
                  team: sourceUnit.team, 
                  position: startPos, 
                  velocity: { x: 0, y: 0, z: 0 }, // Calculated dynamically in frame loop
                  damage: 0, 
                  radius: 1.0, 
                  maxDistance: distance,
                  distanceTraveled: 0, 
                  targetPos: targetPos,
                  trajectory: 'ballistic',
                  payload: payload,
                  startPos: startPos,
                  startTime: Date.now()
              }]);
          }
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId && targetingAbility === 'SWARM') {
          // Wasp Swarm Logic
          const sourceUnit = unitsRef.current.find(u => u.id === targetingSourceId);
          if (sourceUnit && sourceUnit.charges?.swarm && sourceUnit.charges.swarm > 0) {
              // Wasp visual is an air unit hovering at height 75.0
              const startPos = { x: (sourceUnit.gridPos.x * CITY_CONFIG.tileSize) - offset, y: 75.0, z: (sourceUnit.gridPos.z * CITY_CONFIG.tileSize) - offset };
              // Target is the ground (y=0.5) to ensure impact, unless guided later
              const targetPos = { x: (x * CITY_CONFIG.tileSize) - offset, y: 0.5, z: (z * CITY_CONFIG.tileSize) - offset };
              
              // Calculate Base Angle to Target
              const dx = targetPos.x - startPos.x;
              const dz = targetPos.z - startPos.z;
              const baseAngle = Math.atan2(dz, dx);
              
              const newSwarm: Projectile[] = [];
              const speed = ABILITY_CONFIG.WASP_MISSILE_SPEED;

              // Deduct charge and set cooldown
              setUnits(prev => prev.map(u => {
                  if (u.id === sourceUnit.id) {
                      return { 
                          ...u, 
                          charges: { ...u.charges, swarm: (u.charges?.swarm || 1) - 1 },
                          cooldowns: { ...u.cooldowns, swarmLaunch: ABILITY_CONFIG.WASP_SWARM_COOLDOWN } 
                      };
                  }
                  return u;
              }));

              // Spawn Microdrones
              for (let i = 0; i < ABILITY_CONFIG.WASP_MISSILES_PER_VOLLEY; i++) {
                  // Cone Spread: Wider for area denial (approx +/- 80 degrees)
                  const spread = (Math.random() - 0.5) * 2.8; 
                  const angle = baseAngle + spread;
                  
                  const vx = Math.cos(angle) * speed;
                  const vz = Math.sin(angle) * speed;
                  // Higher upward trajectory for wider arc
                  const vy = Math.random() * 3 + 2; 

                  newSwarm.push({
                      id: `microdrone-${Date.now()}-${i}`,
                      ownerId: sourceUnit.id,
                      team: sourceUnit.team,
                      position: { ...startPos },
                      velocity: { x: vx, y: vy, z: vz },
                      damage: ABILITY_CONFIG.WASP_DAMAGE_PER_MISSILE,
                      radius: 0.5,
                      maxDistance: 200, // Safety limit
                      distanceTraveled: 0,
                      targetPos: targetPos, // Fallback target if no enemy
                      trajectory: 'swarm',
                      startPos: startPos,
                      startTime: Date.now(),
                      phase: 'ascent' // Used to spread out initially
                  });
              }
              setProjectiles(prev => [...prev, ...newSwarm]);
          }
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId && targetingAbility === 'DECOY') {
          // Phantom Decoy Logic
          const sourceUnit = unitsRef.current.find(u => u.id === targetingSourceId);
          if (sourceUnit) {
              const dist = Math.sqrt(Math.pow(sourceUnit.gridPos.x - x, 2) + Math.pow(sourceUnit.gridPos.z - z, 2));
              if (dist <= ABILITY_CONFIG.GHOST_DECOY_RANGE) {
                  const now = Date.now();
                  setDecoys(prev => [...prev, { 
                      id: `decoy-${now}`, 
                      team: sourceUnit.team as 'blue'|'red', 
                      gridPos: { x, z }, 
                      createdAt: now 
                  }]);
                  
                  // Hide Source Unit
                  setUnits(prev => prev.map(u => {
                      if (u.id === sourceUnit.id) {
                          return { ...u, decoyActive: true, decoyStartTime: now };
                      }
                      return u;
                  }));
              }
          }
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId) {
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (selectedUnitIds.size > 0) {
          // MOVEMENT LOGIC for Multiple Units
          const unitsToMove = units.filter(u => selectedUnitIds.has(u.id) && u.team === playerTeam);
          
          if (unitsToMove.length > 0) {
              // 1. Identify Occupied Tiles (by units NOT in selection, and destination of moving units)
              const occupied = new Set<string>();
              unitsRef.current.forEach(u => {
                  if (!selectedUnitIds.has(u.id)) {
                      if (u.path.length > 0) {
                          occupied.add(u.path[u.path.length - 1]);
                      } else {
                          occupied.add(`${u.gridPos.x},${u.gridPos.z}`);
                      }
                  }
              });

              // 2. Assign Destinations
              const assignments = new Map<string, {x: number, z: number}>(); // unitId -> dest
              const reserved = new Set<string>(); // "x,z" reserved by this group

              // Helper to find nearest free tile using BFS
              const findFreeTile = (centerX: number, centerZ: number): {x: number, z: number} | null => {
                  const queue = [{x: centerX, z: centerZ}];
                  const visited = new Set<string>();
                  visited.add(`${centerX},${centerZ}`);
                  
                  let i = 0;
                  // Limit search to prevent hangs if map is full
                  while(i < queue.length && i < 300) {
                      const curr = queue[i++];
                      const key = `${curr.x},${curr.z}`;
                      const validRoad = dynamicRoadTileSet.has((curr.x << 16) | curr.z);
                      
                      // Valid if it's a road, not occupied by others, and not reserved by group member
                      if (validRoad && !occupied.has(key) && !reserved.has(key)) {
                          return curr;
                      }

                      const neighbors = [
                          {x: curr.x+1, z: curr.z}, {x: curr.x-1, z: curr.z}, 
                          {x: curr.x, z: curr.z+1}, {x: curr.x, z: curr.z-1},
                          {x: curr.x+1, z: curr.z+1}, {x: curr.x-1, z: curr.z-1},
                          {x: curr.x+1, z: curr.z-1}, {x: curr.x-1, z: curr.z+1}
                      ];

                      for (const n of neighbors) {
                          const nKey = `${n.x},${n.z}`;
                          if (!visited.has(nKey)) {
                              if (n.x >= 0 && n.x < gridSize && n.z >= 0 && n.z < gridSize) {
                                  visited.add(nKey);
                                  queue.push(n);
                              }
                          }
                      }
                  }
                  return null;
              };

              // Assign destinations for each unit
              unitsToMove.forEach(u => {
                  const dest = findFreeTile(x, z);
                  if (dest) {
                      const key = `${dest.x},${dest.z}`;
                      reserved.add(key);
                      assignments.set(u.id, dest);
                  }
              });

              // 3. Apply Paths based on assignments
              setUnits(prev => prev.map(u => {
                  if (assignments.has(u.id)) {
                      const dest = assignments.get(u.id)!;
                      const path = findPath(u.gridPos, dest);
                      if (path.length > 0) {
                          return {...u, path};
                      }
                  }
                  return u;
              }));
          }
      } else {
          // Clicked on ground with no selection -> Deselect all (if any) or Close Menus
          setSelectedUnitIds(new Set());
          setDepotMenuOpenId(null); 
          setBaseMenuOpen(null);
      }
  };

  const handleRightClick = useCallback((x: number, z: number) => {
      setSelectedUnitIds(new Set());
      setTargetingSourceId(null);
      setTargetingAbility(null);
      setPlacementMode(null);
      setDepotMenuOpenId(null);
      setBaseMenuOpen(null);
  }, []);

  const handleBgRightClick = useCallback((e: any) => {
      e.stopPropagation();
      handleRightClick(0, 0); 
  }, [handleRightClick]);

  const handleBuild = (type: StructureType) => { const info = STRUCTURE_INFO[type]; if (teamResources[playerTeam] >= info.cost) { setPlacementMode({ type, cost: info.cost }); setBaseMenuOpen(null); } };
  
  const handleUnitAction = (action: string) => {
      if (selectedUnitIds.size === 0) return;
      
      const primaryUnitId = Array.from(selectedUnitIds)[0];
      const unit = unitsRef.current.find(u => u.id === primaryUnitId);
      if (!unit) return;
      
      const compute = teamCompute[unit.team as 'blue' | 'red'];
      
      // Ballista Load Logic (Inventory -> Armed)
      if (action.startsWith('LOAD_AMMO_')) {
          const type = action.replace('LOAD_AMMO_', '').toLowerCase() as 'eclipse' | 'wp';
          if (unit.missileInventory && unit.missileInventory[type] > 0) {
              setUnits(prev => prev.map(u => {
                  if (u.id === unit.id) {
                      return { 
                          ...u, 
                          missileInventory: { ...u.missileInventory!, [type]: u.missileInventory![type] - 1 },
                          ammoState: 'loading',
                          loadedAmmo: type,
                          loadingProgress: 0
                      };
                  }
                  return u;
              }));
              // Simulate load time
              setTimeout(() => {
                  setUnits(prev => prev.map(u => {
                      if (u.id === unit.id) return { ...u, ammoState: 'armed', loadingProgress: 100 };
                      return u;
                  }));
              }, ABILITY_CONFIG.BALLISTA_LOAD_TIME);
          }
          return;
      }

      // Ballista Order Logic (Spawn Courier)
      if (action.startsWith('REQUEST_DELIVERY_')) {
          const type = action.replace('REQUEST_DELIVERY_', '').toLowerCase() as 'eclipse' | 'wp';
          const cost = type === 'eclipse' ? ABILITY_CONFIG.WARHEAD_COST_ECLIPSE : ABILITY_CONFIG.WARHEAD_COST_WP;
          
          if (teamResources[unit.team as 'blue' | 'red'] >= cost) {
              // Find nearest Ordnance Fab
              const fabs = structuresRef.current.filter(s => s.type === 'ordnance_fab' && s.team === unit.team && !s.isBlueprint);
              if (fabs.length > 0) {
                  let nearestFab = fabs[0];
                  let minD = 9999;
                  fabs.forEach(f => {
                      const d = Math.sqrt(Math.pow(f.gridPos.x - unit.gridPos.x, 2) + Math.pow(f.gridPos.z - unit.gridPos.z, 2));
                      if (d < minD) { minD = d; nearestFab = f; }
                  });

                  // Pay Cost
                  setTeamResources(prev => ({...prev, [unit.team]: prev[unit.team as 'blue' | 'red'] - cost}));

                  // Spawn Courier
                  const newCourier: UnitData = {
                      id: `courier-${Date.now()}`,
                      type: 'courier',
                      unitClass: 'support',
                      team: unit.team,
                      gridPos: { ...nearestFab.gridPos },
                      path: [], // Will set below
                      visionRange: UNIT_STATS.courier.visionRange,
                      health: UNIT_STATS.courier.maxHealth,
                      maxHealth: UNIT_STATS.courier.maxHealth,
                      battery: 100,
                      maxBattery: 100,
                      cooldowns: {},
                      courierTargetId: unit.id,
                      courierPayload: type
                  };

                  // Calculate path to Ballista
                  const path = findPath(newCourier.gridPos, unit.gridPos);
                  newCourier.path = path;

                  setUnits(prev => [...prev, newCourier]);
                  
                  // Update Ballista State to indicate inbound
                  setUnits(prev => prev.map(u => {
                      if (u.id === unit.id && u.ammoState === 'empty') return { ...u, ammoState: 'awaiting_delivery' };
                      return u;
                  }));

              } else {
                  console.warn("No Ordnance Fab available!");
              }
          }
          return;
      }

      if (action === 'HARDLINE_TETHER') {
          setTargetingSourceId(primaryUnitId);
          setTargetingAbility('TETHER');
          return;
      }
      if (action === 'CANNON ATTACK') {
          setTargetingSourceId(primaryUnitId);
          setTargetingAbility('CANNON');
          return;
      }
      if (action === 'LOITERING SURVEILLANCE') {
          setTargetingSourceId(primaryUnitId);
          setTargetingAbility('SURVEILLANCE');
          return;
      }
      // Replaces FIRE_BALLISTA direct execution with Targeting Mode
      if (action === 'FIRE_BALLISTA') {
          setTargetingSourceId(primaryUnitId);
          setTargetingAbility('MISSILE');
          return;
      }
      // Wasp Swarm Targeting
      if (action === 'FIRE_SWARM') {
          setTargetingSourceId(primaryUnitId);
          setTargetingAbility('SWARM');
          return;
      }

      if (action === 'PHANTOM_DECOY_INIT' && compute >= COMPUTE_GATES.PHANTOM_DECOY) {
           setTargetingSourceId(primaryUnitId);
           setTargetingAbility('DECOY');
           return;
      }

      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => prev.map(u => {
          if (!selectedUnitIds.has(u.id)) return u;
          
          if (action === 'TOGGLE_JAMMER' && u.type === 'banshee') return { ...u, jammerActive: !u.jammerActive };
          if (action === 'TOGGLE DAMPENER' && u.type === 'ghost') return { ...u, isDampenerActive: !u.isDampenerActive };
          if (action === 'TOGGLE ARRAY' && u.type === 'sun_plate') return { ...u, isDeployed: !u.isDeployed };
          if (action === 'TOGGLE_ANCHOR' && u.type === 'swarm_host') {
              const anchoring = !u.isAnchored;
              return { 
                  ...u, 
                  isAnchored: anchoring, 
                  path: [],
                  cooldowns: { ...u.cooldowns, spawnWasp: anchoring ? 3000 : 0 } 
              };
          }
          if (action === 'SMOKE SCREEN' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN }, smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION } };
          if (action === 'ACTIVATE APS' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanAps: ABILITY_CONFIG.TITAN_APS_COOLDOWN }, aps: { active: true, remainingTime: ABILITY_CONFIG.TITAN_APS_DURATION } };
          return u;
      }));
  };

  // --- Depot / Mason Logic ---
  const handleStructureClick = (id: string) => {
      // If we just dragged, don't open menu
      if (didDragRef.current) return;

      const struct = structuresState.find(s => s.id === id);
      const validTypes = ['support', 'infantry', 'armor', 'ordnance', 'air', 'builder'];
      if (struct && validTypes.includes(struct.type) && struct.team === playerTeam && !struct.isBlueprint) {
          setDepotMenuOpenId(id);
      }
  };

  const handleStructureAction = (action: string, payload?: any) => {
      if (!depotMenuOpenId) return;
      const struct = structuresState.find(s => s.id === depotMenuOpenId);
      if (!struct) return;

      if (action === 'BUILD_UNIT') {
          const type = payload as UnitType;
          const stats = UNIT_STATS[type];
          const cost = stats.cost || 0;
          if (teamResources[playerTeam] >= cost) {
              setTeamResources(prev => ({...prev, [playerTeam]: prev[playerTeam] - cost}));
              const newUnit: UnitData = {
                  id: `u-${Date.now()}`, type: type, unitClass: stats.unitClass, team: playerTeam as UnitData['team'], gridPos: { ...struct.gridPos }, path: [], visionRange: stats.visionRange, health: stats.maxHealth, maxHealth: stats.maxHealth, battery: 100, maxBattery: 100, cooldowns: {},
                  ...(type === 'mason' ? { cargo: 100 } : {}),
                  ...(type === 'banshee' ? { battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY } : {}),
                  ...(type === 'wasp' ? { charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES } } : {}),
                  ...(type === 'tank' ? { charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS } } : {}),
                  ...(type === 'ballista' ? { missileInventory: { eclipse: 1, wp: 1 }, ammoState: 'empty' as const } : {}), // New Ballistas start with 1 of each
              };
              setUnits(prev => [...prev, newUnit]);
              setDepotMenuOpenId(null);
          }
      } else if (action === 'SELECT_WALL') {
          const type = payload as StructureType;
          const info = STRUCTURE_INFO[type];
          if (teamResources[playerTeam] >= info.cost) {
              setPlacementMode({ type, cost: info.cost });
              setDepotMenuOpenId(null);
          }
      }
  };

  // Mason AI Loop
  useEffect(() => {
    const timer = setInterval(() => {
        setUnits(prevUnits => {
            let unitsChanged = false;
            const nextUnits = prevUnits.map(u => {
                if (u.type !== 'mason') return u;
                const activeStructs = structuresRef.current;
                const blueprints = activeStructs.filter(s => s.isBlueprint && s.team === u.team && s.constructionProgress < s.maxProgress);
                const depot = activeStructs.find(s => s.type === 'builder' && s.team === u.team);
                if (!depot) return u;
                let uChanged = false;
                let newUnit = { ...u };
                let constructionTarget = null;
                let targetPos: {x: number, z: number} | null = null;
                let actionType: 'build' | 'load' = 'load';
                if (newUnit.cargo && newUnit.cargo > 0) {
                    if (blueprints.length > 0) {
                        let closest = blueprints[0];
                        let minDst = 9999;
                        blueprints.forEach(bp => {
                            const d = Math.sqrt(Math.pow(u.gridPos.x - bp.gridPos.x, 2) + Math.pow(u.gridPos.z - bp.gridPos.z, 2));
                            if (d < minDst) { minDst = d; closest = bp; }
                        });
                        targetPos = closest.gridPos;
                        constructionTarget = closest.id;
                        actionType = 'build';
                    }
                } else if (depot) {
                    targetPos = depot.gridPos;
                    actionType = 'load';
                }
                if (targetPos) {
                     const dist = Math.sqrt(Math.pow(u.gridPos.x - targetPos.x, 2) + Math.pow(u.gridPos.z - targetPos.z, 2));
                     if (dist === 0) {
                         if (actionType === 'build') { newUnit.cargo = Math.max(0, newUnit.cargo - ABILITY_CONFIG.MASON_BUILD_AMOUNT); } 
                         else { newUnit.cargo = 100; }
                         newUnit.path = []; 
                         uChanged = true;
                     } else {
                         if (newUnit.path.length === 0) {
                             let path = findPath(newUnit.gridPos, targetPos);
                             if (path.length === 0) {
                                  const neighbors = [{x: targetPos.x+1, z: targetPos.z}, {x: targetPos.x-1, z: targetPos.z}, {x: targetPos.x, z: targetPos.z+1}, {x: targetPos.x, z: targetPos.z-1}].filter(n => {
                                      const nId = (n.x << 16) | n.z;
                                      return dynamicRoadTileSet.has(nId);
                                  }).sort((a, b) => {
                                      const da = Math.sqrt(Math.pow(u.gridPos.x - a.x, 2) + Math.pow(u.gridPos.z - a.z, 2));
                                      const db = Math.sqrt(Math.pow(u.gridPos.x - b.x, 2) + Math.pow(u.gridPos.z - b.z, 2));
                                      return da - db;
                                  });
                                  for (const n of neighbors) { const p = findPath(newUnit.gridPos, n); if (p.length > 0) { path = p; break; } }
                             }
                             if (path.length > 0) { newUnit.path = path; uChanged = true; }
                         }
                     }
                }
                if (newUnit.constructionTargetId !== constructionTarget) { newUnit.constructionTargetId = constructionTarget; uChanged = true; }
                if (uChanged) { unitsChanged = true; return newUnit; }
                return u;
            });
            return unitsChanged ? nextUnits : prevUnits;
        });
        setStructuresState(prevStructs => {
             const activeUnits = unitsRef.current; 
             const masons = activeUnits.filter(u => u.type === 'mason' && u.cargo && u.cargo > 0);
             if (masons.length === 0) return prevStructs;
             let structChanged = false;
             const nextStructs = prevStructs.map(s => {
                 if (!s.isBlueprint) return s;
                 const builders = masons.filter(m => Math.sqrt(Math.pow(m.gridPos.x - s.gridPos.x, 2) + Math.pow(m.gridPos.z - s.gridPos.z, 2)) === 0);
                 if (builders.length > 0) {
                     const progressAdded = builders.length * ABILITY_CONFIG.MASON_BUILD_AMOUNT;
                     const newProgress = Math.min(s.maxProgress, s.constructionProgress + progressAdded);
                     if (newProgress !== s.constructionProgress) {
                         structChanged = true;
                         const finished = newProgress >= s.maxProgress;
                         return { ...s, constructionProgress: newProgress, isBlueprint: !finished };
                     }
                 }
                 return s;
             });
             return structChanged ? nextStructs : prevStructs;
        });
    }, 500); 
    return () => clearInterval(timer);
  }, [findPath, dynamicRoadTileSet]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTeamResources(prev => {
        const stats = calculateStats(buildingsRef.current, unitsRef.current, blocksRef.current, prev, stockpile);
        
        // Apply Cheat Bonuses to Compute
        // This makes "Computed Value" = "Real Value" + "Cheat Value"
        stats.blue.compute += cheatCompute.blue;
        stats.red.compute += cheatCompute.red;

        const newResources = { blue: prev.blue + stats.blue.income, red: prev.red + stats.red.income };
        setTeamCompute({blue: stats.blue.compute, red: stats.red.compute});
        onStatsUpdate({ blue: { ...stats.blue, resources: newResources.blue }, red: { ...stats.red, resources: newResources.red } });
        return newResources;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateStats, onStatsUpdate, stockpile, cheatCompute]);

  useEffect(() => {
    const timer = setInterval(() => {
        const now = Date.now();
        setDecoys(prev => prev.filter(d => now - d.createdAt < ABILITY_CONFIG.DECOY_DURATION));
        setExplosions(prev => prev.filter(e => now - e.createdAt < e.duration));
        
        // Restore units whose decoy time has expired
        setUnits(prev => {
            let changed = false;
            const next = prev.map(u => {
                if (u.decoyActive && u.decoyStartTime && (now - u.decoyStartTime >= ABILITY_CONFIG.DECOY_DURATION)) {
                    changed = true;
                    return { ...u, decoyActive: false, decoyStartTime: undefined };
                }
                return u;
            });
            return changed ? next : prev;
        });

    }, 500); 
    return () => clearInterval(timer);
  }, []);

  // Main Game Loop (Combat, Movement logic that isn't smooth pathing, etc)
  useEffect(() => {
      const TICK_RATE = 100; // 10 ticks per second for logic
      const timer = setInterval(() => {
          const now = Date.now();
          const dT = TICK_RATE / 1000;
          const activeProjs = projectilesRef.current;
          let newExplosions: Explosion[] = [];
          let damageEvents: {id: string, damage: number, position: {x: number, y: number, z: number}, radius: number, team: UnitData['team'] }[] = [];
          const nextProjs: Projectile[] = [];
          let projsChanged = false;
          const currentBuildings = buildingsRef.current;
          const currentStructures = structuresRef.current;
          const currentUnitsRef = unitsRef.current; 
          const explodedCrawlerIds = new Set<string>();

          // Crawler Drone Detonation Logic
          currentUnitsRef.forEach(u => {
              if (u.type === 'crawler_drone' && u.health > 0) {
                  // Check distance to enemies
                  const ux = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                  const uz = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                  
                  const hasEnemy = currentUnitsRef.some(e => {
                      if (e.team === u.team || e.team === 'neutral' || e.health <= 0) return false;
                      const ex = (e.gridPos.x * CITY_CONFIG.tileSize) - offset;
                      const ez = (e.gridPos.z * CITY_CONFIG.tileSize) - offset;
                      const dist = Math.sqrt((ux - ex)**2 + (uz - ez)**2);
                      return dist < 1.5 * CITY_CONFIG.tileSize; // 1.5 block trigger
                  });

                  if (hasEnemy) {
                      explodedCrawlerIds.add(u.id);
                      const pos = { x: ux, y: 1.0, z: uz };
                      newExplosions.push({ 
                          id: `exp-crawler-${u.id}-${now}`, 
                          position: pos, 
                          radius: ABILITY_CONFIG.CRAWLER_EXPLOSION_RADIUS, 
                          duration: 500, 
                          createdAt: now 
                      });
                      damageEvents.push({ 
                          id: `dmg-crawler-${u.id}-${now}`, 
                          damage: ABILITY_CONFIG.CRAWLER_EXPLOSION_DAMAGE, 
                          position: pos, 
                          radius: ABILITY_CONFIG.CRAWLER_EXPLOSION_RADIUS * CITY_CONFIG.tileSize, 
                          team: u.team 
                      });
                  }
              }
          });

          // Helper to get unit target height
          const getTargetY = (u: UnitData) => {
              if (['wasp', 'drone', 'helios'].includes(u.type)) return 75.0;
              if (u.type === 'defense_drone') return 12.0;
              return 1.5;
          };

          activeProjs.forEach(p => {
              let nextP: Projectile = { ...p, position: { ...p.position } }; 
              
              // Handle Ballistic Missile Logic
              if (p.trajectory === 'ballistic' && p.startPos && p.startTime && p.targetPos) {
                  const duration = ABILITY_CONFIG.MISSILE_CRUISE_SPEED * 100; // Simplified travel time base for math consistency
                  const elapsed = now - p.startTime;
                  const totalDuration = (p.maxDistance / ABILITY_CONFIG.MISSILE_CRUISE_SPEED) * 1000;
                  const t = Math.min(1, elapsed / totalDuration);
                  
                  if (t >= 1) {
                      // Impact
                       projsChanged = true;
                       
                       const isNuke = p.payload === 'nuke';
                       // Reduce impact explosion size for nano canisters to avoid clutter
                       const explosionRadius = isNuke ? 12 : (p.payload === 'nano_canister' ? 2 : 8);
                       const explosionDuration = isNuke ? 2000 : (p.payload === 'nano_canister' ? 500 : 1200);
                       
                       newExplosions.push({ id: `exp-${now}-${Math.random()}`, position: p.targetPos, radius: explosionRadius, duration: explosionDuration, createdAt: now });
                       
                       // Nuke Damage Event
                       if (isNuke) {
                           damageEvents.push({ id: `nuke-dmg-${now}`, damage: 500, position: p.targetPos, radius: 8 * tileSize, team: p.team as UnitData['team'] });
                       }

                       // Create Cloud (if applicable)
                       const cloudType = p.payload || 'wp';
                       if (cloudType !== 'nuke' && cloudType !== 'titan_drop') {
                           if (cloudType === 'nano_cloud_master') {
                               setClouds(prev => [...prev, {
                                   id: `cloud-${Date.now()}-${Math.random()}`,
                                   type: 'nano',
                                   gridPos: { x: Math.round((p.targetPos!.x + offset) / CITY_CONFIG.tileSize), z: Math.round((p.targetPos!.z + offset) / CITY_CONFIG.tileSize) },
                                   radius: ABILITY_CONFIG.NANO_CLOUD_RADIUS,
                                   duration: ABILITY_CONFIG.NANO_CLOUD_DURATION,
                                   createdAt: Date.now(),
                                   team: p.team as CloudData['team']
                               }]);
                           } else if (cloudType === 'eclipse' || cloudType === 'wp') {
                               setClouds(prev => [...prev, {
                                   id: `cloud-${Date.now()}`,
                                   type: cloudType as 'eclipse'|'wp',
                                   gridPos: { x: Math.round((p.targetPos!.x + offset) / CITY_CONFIG.tileSize), z: Math.round((p.targetPos!.z + offset) / CITY_CONFIG.tileSize) },
                                   radius: cloudType === 'eclipse' ? ABILITY_CONFIG.ECLIPSE_RADIUS : ABILITY_CONFIG.WP_RADIUS,
                                   duration: cloudType === 'eclipse' ? ABILITY_CONFIG.ECLIPSE_DURATION : ABILITY_CONFIG.WP_DURATION,
                                   createdAt: Date.now(),
                                   team: p.team as CloudData['team']
                               }]);
                           }
                           // 'nano_canister' payloads just explode without spawning a cloud, effectively "dummy" rounds
                       }
                  } else {
                      // Calculate Parabolic Position
                      // Linear X/Z
                      const lx = p.startPos.x + (p.targetPos.x - p.startPos.x) * t;
                      const lz = p.startPos.z + (p.targetPos.z - p.startPos.z) * t;
                      
                      // Parabolic Y
                      // Peak height relative to distance, but capped
                      const peakHeight = Math.min(120, p.maxDistance * 0.5); 
                      // Parabola eq: y(t) = -4 * (peak - midpoint_height) * (t - 0.5)^2 + peak
                      // Simplified: 4 * peak * t * (1 - t) + startY * (1-t) + endY * t
                      // This gives a nice arc from startY to endY peaking in middle
                      const py = 4 * peakHeight * t * (1 - t) + p.startPos.y * (1 - t) + p.targetPos.y * t;

                      // Calculate Velocity for rotation (derivative approximation)
                      const dt = 0.01;
                      const tNext = t + dt;
                      const lxNext = p.startPos.x + (p.targetPos.x - p.startPos.x) * tNext;
                      const lzNext = p.startPos.z + (p.targetPos.z - p.startPos.z) * tNext;
                      const pyNext = 4 * peakHeight * tNext * (1 - tNext) + p.startPos.y * (1 - tNext) + p.targetPos.y * tNext;
                      
                      nextP.velocity = { 
                          x: lxNext - lx, 
                          y: pyNext - py, 
                          z: lzNext - lz 
                      };

                      nextP.position = { x: lx, y: py, z: lz };
                      nextProjs.push(nextP);
                      projsChanged = true;
                  }
              } else if (p.trajectory === 'swarm' && p.targetPos) {
                  // === WASP SWARM MICRODRONE BEHAVIOR ===
                  
                  // 1. Determine Target (Locked Unit OR Ground Location)
                  let targetLocation = p.targetPos;
                  let hasUnitTarget = false;

                  // If we already locked onto a unit, check if it's still alive/visible
                  if (p.lockedTargetId) {
                      const lockedUnit = currentUnitsRef.find(u => u.id === p.lockedTargetId && u.health > 0);
                      if (lockedUnit) {
                          targetLocation = { 
                              x: (lockedUnit.gridPos.x * CITY_CONFIG.tileSize) - offset, 
                              y: getTargetY(lockedUnit), 
                              z: (lockedUnit.gridPos.z * CITY_CONFIG.tileSize) - offset 
                          };
                          hasUnitTarget = true;
                      } else {
                          // Target lost, revert to ground target
                          nextP.lockedTargetId = null;
                      }
                  } 
                  
                  // If no lock, scan for closest enemy within wider range (6 tiles)
                  if (!hasUnitTarget) {
                      let closestDist = 6 * CITY_CONFIG.tileSize; // Scan range
                      let bestCandidateId = null;
                      
                      for (const u of currentUnitsRef) {
                          if (u.team === p.team || u.team === 'neutral' || u.health <= 0) continue;
                          
                          const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                          const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                          const dist = Math.sqrt((p.position.x - uX)**2 + (p.position.z - uZ)**2);
                          
                          if (dist < closestDist) {
                              closestDist = dist;
                              bestCandidateId = u.id;
                          }
                      }
                      
                      if (bestCandidateId) {
                          nextP.lockedTargetId = bestCandidateId;
                          hasUnitTarget = true;
                          // Don't update targetLocation yet, momentum carries it this frame, steers next frame
                      }
                  }

                  // 2. Movement Logic (Steering)
                  // Phase check: First 0.5s is 'ascent' (dumb fire direction), then 'cruise' (homing)
                  const timeAlive = now - (p.startTime || 0);
                  const isHomingPhase = timeAlive > 500;

                  if (isHomingPhase) {
                      // Desired Velocity Vector towards target
                      const dx = targetLocation.x - p.position.x;
                      const dy = targetLocation.y - p.position.y;
                      const dz = targetLocation.z - p.position.z;
                      const distToTarget = Math.sqrt(dx*dx + dy*dy + dz*dz);
                      
                      // Normalize desired
                      const speed = ABILITY_CONFIG.WASP_MISSILE_SPEED;
                      const desiredVx = (dx / distToTarget) * speed;
                      const desiredVy = (dy / distToTarget) * speed;
                      const desiredVz = (dz / distToTarget) * speed;

                      // Steering Force (Desired - Current)
                      const turnRate = hasUnitTarget ? 8.0 : 2.0; // Turn faster if locked
                      const steerX = (desiredVx - p.velocity.x) * turnRate * dT;
                      const steerY = (desiredVy - p.velocity.y) * turnRate * dT;
                      const steerZ = (desiredVz - p.velocity.z) * turnRate * dT;

                      nextP.velocity.x += steerX;
                      nextP.velocity.y += steerY;
                      nextP.velocity.z += steerZ;
                  } else {
                      // Apply slight gravity/arc during ascent
                      nextP.velocity.y -= 5 * dT;
                  }

                  // Update Position
                  nextP.position.x += nextP.velocity.x * dT;
                  nextP.position.y += nextP.velocity.y * dT;
                  nextP.position.z += nextP.velocity.z * dT;

                  // 3. Collision Detection
                  let hit = false;
                  
                  // Proximity Detonation Check (Fixes infinite circling)
                  const distToTarget = Math.sqrt((nextP.position.x - targetLocation.x)**2 + (nextP.position.y - targetLocation.y)**2 + (nextP.position.z - targetLocation.z)**2);
                  if (distToTarget < 2.0) hit = true;

                  // Ground/Building Collision
                  const gx = Math.round((nextP.position.x + offset) / CITY_CONFIG.tileSize);
                  const gz = Math.round((nextP.position.z + offset) / CITY_CONFIG.tileSize);
                  if (nextP.position.y <= 0.5) hit = true; // Hit floor
                  
                  // Unit Collision
                  if (!hit) {
                      for (const u of currentUnitsRef) {
                          if (u.team === p.team) continue;
                          if (u.health <= 0) continue;
                          const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                          const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                          const uY = getTargetY(u);
                          // 3D Distance check
                          const dist = Math.sqrt((nextP.position.x - uX)**2 + (nextP.position.y - uY)**2 + (nextP.position.z - uZ)**2);
                          if (dist < 1.5) { hit = true; break; }
                      }
                  }

                  // Distance limit
                  const dTraveled = Math.sqrt((nextP.position.x - p.startPos!.x)**2 + (nextP.position.z - p.startPos!.z)**2);
                  if (dTraveled > 100) hit = true;

                  if (hit) {
                      projsChanged = true;
                      newExplosions.push({ id: `exp-${now}-${Math.random()}`, position: nextP.position, radius: 1.5, duration: 300, createdAt: now });
                      // Deal Area Damage (small)
                      damageEvents.push({ id: `dmg-${now}-${Math.random()}`, damage: p.damage, position: nextP.position, radius: 1.5, team: p.team as UnitData['team'] });
                  } else {
                      projsChanged = true;
                      nextProjs.push(nextP);
                  }

              } else {
                  // Standard Direct Fire Logic
                  const moveAmount = Math.sqrt(p.velocity.x**2 + p.velocity.y**2 + p.velocity.z**2) * dT;
                  const stepSize = CITY_CONFIG.tileSize * 0.4;
                  const steps = Math.ceil(moveAmount / stepSize);
                  const stepX = (p.velocity.x * dT) / steps;
                  const stepY = (p.velocity.y * dT) / steps;
                  const stepZ = (p.velocity.z * dT) / steps;
                  let hit = false;
                  
                  for(let i=0; i<steps; i++) {
                      nextP.position.x += stepX;
                      nextP.position.y += stepY;
                      nextP.position.z += stepZ;
                      nextP.distanceTraveled += Math.sqrt(stepX**2 + stepY**2 + stepZ**2);
                      
                      // Explicit ground check
                      if (nextP.position.y <= 0.5) { hit = true; break; }

                      // Special Handling for Orbital Drop (Titan Drop)
                      if (p.payload === 'titan_drop') {
                          // Impact ground check
                          if (nextP.position.y <= 0.5) {
                              hit = true;
                              // Spawn Logic: Delay actual unit spawn slightly for visual effect
                              setTimeout(() => {
                                  if (p.targetPos) {
                                      const gridX = Math.round((p.targetPos.x + offset) / tileSize);
                                      const gridZ = Math.round((p.targetPos.z + offset) / tileSize);
                                      setUnits(prev => [...prev, {
                                          id: `titan-${Date.now()}`,
                                          type: 'titan_dropped', 
                                          unitClass: 'armor',
                                          team: p.team as 'blue' | 'red',
                                          gridPos: { x: gridX, z: gridZ },
                                          path: [],
                                          visionRange: UNIT_STATS.tank.visionRange,
                                          health: UNIT_STATS.tank.maxHealth * 1.5,
                                          maxHealth: UNIT_STATS.tank.maxHealth * 1.5,
                                          battery: 100,
                                          maxBattery: 100,
                                          cooldowns: {},
                                          charges: { smoke: 3, aps: 2 }
                                      }]);
                                  }
                              }, 200);
                              break;
                          }
                      } else {
                          // Standard Projectile Max Distance Check
                          if (nextP.distanceTraveled >= nextP.maxDistance) { hit = true; break; }
                          
                          // Building Collision Check
                          const gx = Math.round((nextP.position.x + offset) / CITY_CONFIG.tileSize);
                          const gz = Math.round((nextP.position.z + offset) / CITY_CONFIG.tileSize);
                          if (gx >= 0 && gx < gridSize && gz >= 0 && gz < gridSize) {
                               const b = currentBuildings.find(b => b.gridX === gx && b.gridZ === gz);
                               if (b && nextP.position.y > 0 && nextP.position.y < b.scale[1]) { hit = true; break; }
                               const s = currentStructures.find(s => s.gridPos.x === gx && s.gridPos.z === gz && !s.isBlueprint);
                               if (s) {
                                   const info = STRUCTURE_INFO[s.type];
                                   if (nextP.position.y > 0 && nextP.position.y < info.height) { hit = true; break; }
                               }
                          }
                          
                          // Unit Collision Check
                          for (const u of currentUnitsRef) {
                              if (u.team === nextP.team) continue;
                              if (u.health <= 0) continue;
                              const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                              const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                              const dist = Math.sqrt((nextP.position.x - uX)**2 + (nextP.position.z - uZ)**2);
                              if (dist < CITY_CONFIG.tileSize * 0.8) { hit = true; break; }
                          }
                      }
                      if (hit) break;
                  }
                  if (hit) {
                      projsChanged = true;
                      newExplosions.push({ id: `exp-${now}-${Math.random()}`, position: nextP.position, radius: 3, duration: 500, createdAt: now });
                      
                      if (p.payload === 'nano_cloud_master') {
                           setClouds(prev => [...prev, {
                               id: `cloud-${Date.now()}-${Math.random()}`,
                               type: 'nano',
                               gridPos: { x: Math.round((nextP.position.x + offset) / CITY_CONFIG.tileSize), z: Math.round((nextP.position.z + offset) / CITY_CONFIG.tileSize) },
                               radius: ABILITY_CONFIG.NANO_CLOUD_RADIUS,
                               duration: ABILITY_CONFIG.NANO_CLOUD_DURATION,
                               createdAt: Date.now(),
                               team: p.team as CloudData['team']
                           }]);
                      } else if (p.payload !== 'titan_drop') {
                          damageEvents.push({ id: `dmg-${now}-${Math.random()}`, damage: nextP.damage, position: nextP.position, radius: 3, team: nextP.team as UnitData['team'] });
                      }
                  } else {
                      if (steps > 0) projsChanged = true;
                      nextProjs.push(nextP);
                  }
              }
          });
          if (projsChanged) setProjectiles(nextProjs);
          if (newExplosions.length > 0) setExplosions(prev => [...prev, ...newExplosions]);

          setClouds(prev => {
              const active = prev.filter(c => now - c.createdAt < c.duration);
              active.filter(c => c.type === 'wp').forEach(cloud => {
                   setUnits(prevUnits => prevUnits.map(u => {
                       const dx = u.gridPos.x - cloud.gridPos.x;
                       const dz = u.gridPos.z - cloud.gridPos.z;
                       if (Math.sqrt(dx*dx + dz*dz) <= cloud.radius) {
                           const isSoft = ['infantry', 'air'].includes(u.unitClass) || u.type === 'drone' || u.type === 'helios';
                           if (isSoft) return { ...u, health: u.health - ABILITY_CONFIG.WP_DAMAGE_PER_TICK };
                       }
                       return u;
                   }));
              });
              return active;
          });

          setBuildings(prevBuildings => {
              const currentUnits = unitsRef.current.filter(u => u.health > 0);
              let anyBuildingChanged = false;
              const nextBuildings = prevBuildings.map(b => {
                  const adjacentUnits = currentUnits.filter(u => Math.abs(u.gridPos.x - b.gridX) <= 1.5 && Math.abs(u.gridPos.z - b.gridZ) <= 1.5);
                  let bluePower = 0; let redPower = 0;
                  adjacentUnits.forEach(u => {
                      if (u.team === 'neutral') return;
                      const power = UNIT_STATS[u.type].captureMultiplier || 0;
                      if (u.team === 'blue') bluePower += power; else if (u.team === 'red') redPower += power;
                  });
                  if (bluePower === 0 && redPower === 0) {
                      if (b.captureProgress > 0 && b.capturingTeam) {
                          const newProgress = Math.max(0, b.captureProgress - 10);
                          if (newProgress !== b.captureProgress) { anyBuildingChanged = true; return { ...b, captureProgress: newProgress, capturingTeam: newProgress === 0 ? null : b.capturingTeam }; }
                      }
                      return b;
                  }
                  let netPower = 0; let domTeam: 'blue' | 'red' | null = null;
                  if (bluePower > redPower) { netPower = bluePower - redPower; domTeam = 'blue'; } 
                  else if (redPower > bluePower) { netPower = redPower - bluePower; domTeam = 'red'; }
                  if (!domTeam) return b;
                  const config = BUILDING_VALUES[b.type];
                  let changed = false; let newB = { ...b };
                  if (b.owner !== domTeam) {
                      if (!b.capturingTeam || b.capturingTeam === domTeam) {
                          const newProgress = Math.min(100, b.captureProgress + (netPower * config.captureSpeed));
                          newB.capturingTeam = domTeam; newB.captureProgress = newProgress;
                          if (newProgress >= 100) { newB.owner = domTeam; newB.captureProgress = 0; newB.capturingTeam = null; }
                          changed = true;
                      } else {
                           const newProgress = Math.max(0, b.captureProgress - (netPower * config.captureSpeed));
                           newB.captureProgress = newProgress;
                           if (newProgress === 0) { newB.capturingTeam = null; }
                           changed = true;
                      }
                  } else {
                      if (b.captureProgress > 0) {
                          const newProgress = Math.max(0, b.captureProgress - (netPower * config.captureSpeed));
                          newB.captureProgress = newProgress;
                          if (newProgress === 0) { newB.capturingTeam = null; }
                          changed = true;
                      }
                  }
                  if (changed) { anyBuildingChanged = true; return newB; }
                  return b;
              });
              return anyBuildingChanged ? nextBuildings : prevBuildings;
          });

          setStructuresState(prev => prev.map(s => {
              if (s.type === 'ordnance_fab' && s.production?.active) {
                   const p = s.production;
                   // Apply Skunkworks production bonus (10%)
                   const teamDoctrine = doctrines?.[s.team];
                   const speedMult = (teamDoctrine?.selected === 'skunkworks') ? 1.1 : 1.0;
                   
                   const newProgress = p.progress + (100 * speedMult); 
                   if (newProgress >= p.totalTime) {
                       setStockpile(sp => ({ ...sp, [s.team]: { ...sp[s.team], [p.item]: sp[s.team][p.item] + 1 } }));
                       return { ...s, production: { ...p, active: false, progress: 0 } };
                   } else return { ...s, production: { ...p, progress: newProgress } };
              }
              return s;
          }));

          setStructuresState(prevStructs => {
              const structs = [...prevStructs];
              setUnits(prevUnits => {
                  let unitsChanged = false;
                  const damageMap = new Map<string, number>();
                  const unitRetaliationMap = new Map<string, number>();
                  const droneTargets = new Map<string, string>();
                  const externalChargeMap = new Map<string, { amount: number, sourceId?: string }>();
                  const tetherSources = new Map<string, UnitData>();
                  
                  // Courier Delivery Events to be processed after map
                  const deliveries: { targetId: string, payload: 'eclipse' | 'wp' }[] = [];

                  prevUnits.forEach(u => { if (u.tetherTargetId) tetherSources.set(u.tetherTargetId, u); });

                  damageEvents.forEach(evt => {
                      prevUnits.forEach(u => {
                          if (u.team === evt.team) return; 
                          const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                          const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                          const dist = Math.sqrt((evt.position.x - uX)**2 + (evt.position.z - uZ)**2);
                          
                          // Radius check is now dynamic based on event
                          const damageRadius = evt.radius || (CITY_CONFIG.tileSize * 1.5);
                          if (dist <= damageRadius) {
                              const dmg = evt.damage * (1 - (dist / damageRadius)); 
                              damageMap.set(u.id, (damageMap.get(u.id) || 0) + dmg);
                          }
                      });
                  });

                  const drones = prevUnits.filter(u => u.type === 'defense_drone' && u.health > 0);
                  const activeBuildings = buildingsRef.current; 

                  drones.forEach(drone => {
                      const building = activeBuildings.find(b => b.gridX === drone.gridPos.x && b.gridZ === drone.gridPos.z);
                      if (building && building.captureProgress > 0 && building.capturingTeam) {
                          const enemies = prevUnits.filter(u => u.team === building.capturingTeam && u.health > 0 && Math.abs(u.gridPos.x - drone.gridPos.x) <= ABILITY_CONFIG.DEFENSE_DRONE_RANGE && Math.abs(u.gridPos.z - drone.gridPos.z) <= ABILITY_CONFIG.DEFENSE_DRONE_RANGE);
                          if (enemies.length > 0) {
                              const target = enemies[0];
                              damageMap.set(target.id, (damageMap.get(target.id) || 0) + ABILITY_CONFIG.DEFENSE_DRONE_DAMAGE);
                              droneTargets.set(drone.id, target.id);
                              if (['tank', 'ghost', 'ballista', 'mech', 'infantry', 'armor'].includes(target.type) || target.unitClass === 'armor' || target.unitClass === 'infantry') {
                                  unitRetaliationMap.set(drone.id, (unitRetaliationMap.get(drone.id) || 0) + ABILITY_CONFIG.UNIT_RETALIATION_DAMAGE);
                              }
                          }
                      }
                  });
                  
                  let activeUnits = prevUnits.filter(u => u.health > 0);
                  if (prevUnits.length !== activeUnits.length) unitsChanged = true;

                  // Remove exploded crawlers
                  if (explodedCrawlerIds.size > 0) {
                      const beforeCount = activeUnits.length;
                      activeUnits = activeUnits.filter(u => !explodedCrawlerIds.has(u.id));
                      if (activeUnits.length !== beforeCount) unitsChanged = true;
                  }

                  const chargers = activeUnits.filter(u => (u.type === 'helios') || (u.type === 'sun_plate' && u.isDeployed));
                  
                  // Clouds for visual obscuration logic (Charging & Targeting)
                  const activeClouds = cloudsRef.current.filter(c => c.type === 'nano');

                  let nextUnits = activeUnits.map(u => {
                      let newUnit = { ...u };
                      let uChanged = false;
                      
                      // --- COURIER LOGIC ---
                      if (u.type === 'courier') {
                          // Delivery Phase
                          if (u.courierTargetId && u.courierPayload) {
                              const target = activeUnits.find(t => t.id === u.courierTargetId);
                              if (target) {
                                  const dist = Math.sqrt(Math.pow(u.gridPos.x - target.gridPos.x, 2) + Math.pow(u.gridPos.z - target.gridPos.z, 2));
                                  // Arrived adjacent
                                  if (dist < 1.5) {
                                      // Trigger Delivery
                                      deliveries.push({ targetId: target.id, payload: u.courierPayload });
                                      
                                      // Reset Courier to Return Phase
                                      newUnit.courierTargetId = undefined;
                                      newUnit.courierPayload = undefined;
                                      
                                      // Find Nearest Fab to return to
                                      const fabs = structuresRef.current.filter(s => s.type === 'ordnance_fab' && s.team === u.team);
                                      if (fabs.length > 0) {
                                          let nearestFab = fabs[0];
                                          let minD = 9999;
                                          fabs.forEach(f => {
                                              const d = Math.sqrt(Math.pow(f.gridPos.x - u.gridPos.x, 2) + Math.pow(f.gridPos.z - u.gridPos.z, 2));
                                              if (d < minD) { minD = d; nearestFab = f; }
                                          });
                                          newUnit.path = findPath(u.gridPos, nearestFab.gridPos);
                                      } else {
                                          // No fab? Just die.
                                          newUnit.health = 0;
                                      }
                                      uChanged = true;
                                  } else if (u.path.length === 0) {
                                      // Recalculate path if stuck
                                      newUnit.path = findPath(u.gridPos, target.gridPos);
                                      uChanged = true;
                                  }
                              } else {
                                  // Target dead? Return to fab logic or idle.
                                  // Simplified: Just die if target lost.
                                  newUnit.health = 0;
                                  uChanged = true;
                              }
                          } 
                          // Return Phase
                          else if (!u.courierPayload && u.path.length === 0) {
                              // Arrived back at fab (path exhausted)
                              newUnit.health = 0; // Despawn
                              uChanged = true;
                          }
                      }

                      // Surveillance Expiry Logic
                      if (newUnit.surveillance && newUnit.surveillance.status === 'active') {
                          if (newUnit.surveillance.startTime && (Date.now() - newUnit.surveillance.startTime > ABILITY_CONFIG.SURVEILLANCE_DURATION)) {
                               const returnPath = findPath(newUnit.gridPos, newUnit.surveillance.returnPos);
                               if (returnPath.length > 0) {
                                   newUnit.surveillance = { ...newUnit.surveillance, status: 'returning' };
                                   newUnit.path = returnPath;
                               } else {
                                   newUnit.surveillance = undefined;
                               }
                               uChanged = true;
                          }
                      }

                      // Apply accumulated damage
                      const dmg = (damageMap.get(u.id) || 0) + (unitRetaliationMap.get(u.id) || 0);
                      if (dmg > 0) {
                          newUnit.health = Math.max(0, u.health - dmg);
                          uChanged = true;
                      }

                      // If dead from damage, handled by filter later, but we update ref
                      if (newUnit.health <= 0) return newUnit;

                      const isMoving = u.path.length > 0;
                      
                      // Battery Drain Calculation
                      let drain = isMoving ? ABILITY_CONFIG.BATTERY_DRAIN_MOVE : ABILITY_CONFIG.BATTERY_DRAIN_IDLE;
                      if (u.type === 'banshee' && u.jammerActive) drain += ABILITY_CONFIG.DRAIN_STATIC_JAMMER;
                      if (u.type === 'ghost' && u.isDampenerActive) drain += ABILITY_CONFIG.GHOST_SPEED_PENALTY; // Assuming dampener consumes power or just slows? using drain var.
                      // Note: Constants for drain might be missing, using closest or 0
                      if (u.type === 'ghost' && u.isDampenerActive) drain += ABILITY_CONFIG.DRAIN_STATIC_DOME;
                      if (u.type === 'sun_plate' && u.isDeployed) drain += ABILITY_CONFIG.DRAIN_STATIC_DOME;

                      // Banshee Tether Logic
                      if (u.type === 'banshee' && u.tetherTargetId && u.secondaryBattery && u.secondaryBattery > 0) {
                          const target = activeUnits.find(t => t.id === u.tetherTargetId);
                          if (target) {
                              const dist = Math.sqrt(Math.pow(u.gridPos.x - target.gridPos.x, 2) + Math.pow(u.gridPos.z - target.gridPos.z, 2));
                              if (dist <= 8) { 
                                  newUnit.secondaryBattery = Math.max(0, (u.secondaryBattery || 0) - ABILITY_CONFIG.BANSHEE_TETHER_CHARGE_RATE); 
                                  uChanged = true;
                              } else { 
                                  newUnit.tetherTargetId = null; 
                                  uChanged = true;
                              }
                          } else { 
                              newUnit.tetherTargetId = null; 
                              uChanged = true;
                          }
                      }
                      
                      // Banshee Internal Charge
                      if (u.type === 'banshee' && !isMoving && u.battery > 10 && (!u.secondaryBattery || u.secondaryBattery < (u.maxSecondaryBattery || 0))) {
                          const transfer = ABILITY_CONFIG.BANSHEE_INTERNAL_CHARGE_RATE;
                          if (newUnit.battery >= transfer) {
                              newUnit.battery -= transfer;
                              newUnit.secondaryBattery = Math.min(u.maxSecondaryBattery || 0, (u.secondaryBattery || 0) + transfer);
                              uChanged = true;
                          }
                      }

                      // General Battery Drain
                      if (u.battery > 0 && u.type !== 'defense_drone') { 
                          newUnit.battery = Math.max(0, newUnit.battery - drain); 
                          if (newUnit.battery !== u.battery) uChanged = true; 
                      }

                      // External Charging (Helios/Sunplate/Tether)
                      // Nano-Cloud Check: Obscures solar charging
                      const isInNano = isPointInCloud(u.gridPos, activeClouds, 'nano');
                      
                      let chargeAmount = 0;
                      let status = 0;
                      if (externalChargeMap.has(u.id)) { 
                          chargeAmount += externalChargeMap.get(u.id)!.amount; 
                          status = 1; 
                      }
                      
                      // Only process wireless charging if NOT obscured by Nano Cloud
                      if (!isInNano) {
                          chargers.forEach(charger => {
                              if (charger.team !== u.team) return;
                              const dist = Math.sqrt(Math.pow(u.gridPos.x - charger.gridPos.x, 2) + Math.pow(u.gridPos.z - charger.gridPos.z, 2));
                              if (charger.type === 'helios' && dist <= ABILITY_CONFIG.HELIOS_RADIUS) { 
                                  chargeAmount += ABILITY_CONFIG.HELIOS_CHARGE_RATE; 
                                  status = Math.max(status, 1); 
                              } else if (charger.type === 'sun_plate' && charger.isDeployed && dist <= ABILITY_CONFIG.SUNPLATE_RADIUS) { 
                                  chargeAmount += ABILITY_CONFIG.SUNPLATE_CHARGE_RATE; 
                                  status = 2; 
                              }
                          });
                      }

                      if (chargeAmount > 0 && newUnit.battery < newUnit.maxBattery) { 
                          newUnit.battery = Math.min(newUnit.maxBattery, newUnit.battery + chargeAmount); 
                          uChanged = true; 
                      }
                      if (newUnit.chargingStatus !== status) { 
                          newUnit.chargingStatus = status; 
                          uChanged = true; 
                      }
                      
                      // Update Nano Cloud state for visuals
                      if (!!newUnit.isInNanoCloud !== isInNano) {
                          newUnit.isInNanoCloud = isInNano;
                          uChanged = true;
                      }

                      if (uChanged) {
                           unitsChanged = true;
                           return newUnit;
                      }
                      return u;
                  });

                  // Process Deliveries to update inventory
                  if (deliveries.length > 0) {
                      nextUnits = nextUnits.map(u => {
                          const delivery = deliveries.find(d => d.targetId === u.id);
                          if (delivery && u.missileInventory) {
                              const newInv = { ...u.missileInventory };
                              newInv[delivery.payload] = (newInv[delivery.payload] || 0) + 1;
                              unitsChanged = true;
                              return { ...u, missileInventory: newInv, ammoState: u.ammoState === 'awaiting_delivery' ? 'empty' : u.ammoState };
                          }
                          return u;
                      });
                  }
                  
                  const autoAttackDamage = new Map<string, number>();
                  const finalUnitsWithAttacks = nextUnits.map(attacker => {
                       const stats = UNIT_STATS[attacker.type];
                       
                       // Check if attacker is blinded by Nano Cloud
                       const attackerObscured = isPointInCloud(attacker.gridPos, activeClouds, 'nano');
                       if (attackerObscured) return attacker;

                       if (stats.attackDamage && stats.attackDamage > 0) {
                           const lastAttack = attacker.lastAttackTime || 0;
                           const cooldown = stats.attackCooldown || 1000;
                           if (now - lastAttack >= cooldown) {
                               let targetId: string | null = null;
                               let minDist = 999;
                               for (const enemy of nextUnits) {
                                   if (enemy.team === attacker.team || enemy.team === 'neutral') continue;
                                   
                                   // Check if target is obscured by Nano Cloud
                                   const targetObscured = isPointInCloud(enemy.gridPos, activeClouds, 'nano');
                                   if (targetObscured) continue;

                                   const d = Math.sqrt(Math.pow(attacker.gridPos.x - enemy.gridPos.x, 2) + Math.pow(attacker.gridPos.z - enemy.gridPos.z, 2));
                                   if (d <= 2 && d < minDist) { minDist = d; targetId = enemy.id; }
                               }
                               if (targetId) { autoAttackDamage.set(targetId, (autoAttackDamage.get(targetId) || 0) + stats.attackDamage); return { ...attacker, lastAttackTime: now }; }
                           }
                       }
                       return attacker;
                  });

                  const finalUnits = finalUnitsWithAttacks.map(u => {
                      if (autoAttackDamage.has(u.id)) { return { ...u, health: u.health - autoAttackDamage.get(u.id)! }; }
                      return u;
                  }).filter(u => u.health > 0);

                  if (unitsChanged || JSON.stringify(finalUnits) !== JSON.stringify(prevUnits)) return finalUnits;
                  return prevUnits;
              });
              return structs;
          });
      }, TICK_RATE);
      return () => clearInterval(timer);
  }, [findPath]);

  const hasMason = useMemo(() => units.some(u => u.type === 'mason' && u.team === playerTeam), [units, playerTeam]);

  const movingUnitsData = useMemo(() => {
    return units
        .filter(u => u.team === playerTeam && u.path.length > 0)
        .map(u => {
             const destKey = u.path[u.path.length - 1];
             const [dx, dz] = destKey.split(',').map(Number);
             const points: THREE.Vector3[] = [];
             points.push(new THREE.Vector3((u.gridPos.x * tileSize) - offset, 2, (u.gridPos.z * tileSize) - offset));
             u.path.forEach(p => { const [px, pz] = p.split(',').map(Number); points.push(new THREE.Vector3((px * tileSize) - offset, 2, (pz * tileSize) - offset)); });
             return { id: u.id, destination: { x: dx, z: dz }, pathPoints: points };
        });
  }, [units, playerTeam, tileSize, offset]);

  // Primary Action Menu Visibility
  // If multiple units are selected, only show menu for the first one for now (or improve to group commands later)
  const primarySelectionId = selectedUnitIds.size > 0 ? Array.from(selectedUnitIds)[0] : null;

  return (
    <group
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onContextMenu={handleBgRightClick}
    >
        {/* Solid Ground Plane */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.1, 0]} 
          receiveShadow 
        >
            <planeGeometry args={[gridSize * tileSize, gridSize * tileSize]} />
            <meshStandardMaterial color="#020617" roughness={1} metalness={0} />
        </mesh>

        {/* Instanced Roads with Procedural Textures */}
        <InstancedRoads 
            tiles={roadTiles} 
            tileSize={CITY_CONFIG.tileSize} 
            offset={offset} 
            onClick={handleTileClick} 
            onRightClick={handleRightClick} 
            onHover={(x, z) => setHoverGridPos({x, z})}
            tileScale={0.95}
        />

        {/* Street Lights */}
        <StreetLights tiles={roadTiles} tileSize={CITY_CONFIG.tileSize} offset={offset} />

        {/* Selection Box Visual */}
        {dragSelection && dragSelection.active && (
            <SelectionBox start={dragSelection.start} current={dragSelection.current} />
        )}

        {buildings.map(b => ( 
            <Building 
                key={b.id} 
                data={b} 
                onClick={handleTileClick} 
                onRightClick={handleRightClick} 
                onHover={(x, z) => setHoverGridPos({x, z})}
            /> 
        ))}
        {structuresState.map(s => ( 
            <Structure 
                key={s.id} 
                data={s} 
                tileSize={CITY_CONFIG.tileSize} 
                offset={offset} 
                onRightClick={handleRightClick}
                onDoubleClick={(id) => handleStructureClick(id)}
                onClick={handleStructureClick}
                menuOpen={depotMenuOpenId === s.id}
                onAction={handleStructureAction}
                hasMason={hasMason}
                resources={teamResources[playerTeam]}
            /> 
        ))}
        {blocks.map(block => (
            <BlockStatus key={block.id} block={block} buildings={buildings} />
        ))}
        {units.map(u => {
             const isVisible = visibleUnitIds.has(u.id);
             return ( <Unit key={u.id} {...u} teamCompute={(u.team === 'blue' || u.team === 'red') ? teamCompute[u.team] : 0} isSelected={selectedUnitIds.has(u.id)} onSelect={handleUnitSelect} tileSize={CITY_CONFIG.tileSize} offset={offset} onMoveStep={handleMoveStep} tileTypeMap={tileTypeMap} onDoubleClick={() => {}} visible={isVisible} actionMenuOpen={primarySelectionId === u.id} onAction={handleUnitAction} isTargetingMode={!!targetingSourceId} /> );
        })}
        {decoys.map(d => (
            <Unit
                key={d.id}
                id={d.id}
                type="ghost"
                unitClass="infantry"
                team={d.team}
                gridPos={d.gridPos}
                isSelected={false}
                onSelect={() => {}} // Decoys not selectable
                tileSize={CITY_CONFIG.tileSize}
                offset={offset}
                path={[]}
                onMoveStep={() => {}}
                tileTypeMap={tileTypeMap}
                onDoubleClick={() => {}}
                visionRange={0}
                visible={true} // Decoys always visible (they are meant to be seen)
                actionMenuOpen={false}
                onAction={() => {}}
                health={100}
                maxHealth={100}
                battery={100}
                maxBattery={100}
                cooldowns={{}}
                teamCompute={0}
                isDecoy={true}
            />
        ))}
        
        {/* Projectiles */}
        {projectiles.map(p => <ProjectileMesh key={p.id} projectile={p} />)}
        
        {/* Explosions */}
        {explosions.map(e => <ExplosionMesh key={e.id} explosion={e} />)}
        
        {/* Cloud Effects */}
        {clouds.map(c => <CloudMesh key={c.id} cloud={c} tileSize={CITY_CONFIG.tileSize} offset={offset} playerTeam={playerTeam} />)}

        <Base 
            position={[(baseA_Coord.x * CITY_CONFIG.tileSize) - offset, 0, (baseA_Coord.z * CITY_CONFIG.tileSize) - offset]} 
            gridPos={baseA_Coord} 
            teamColor={TEAM_COLORS.blue} 
            label="BLUE CMD" 
            onMoveCommand={handleTileClick} 
            onDoubleClick={() => setBaseMenuOpen('blue')} 
            menuOpen={baseMenuOpen === 'blue'} 
            resources={teamResources.blue} 
            onBuild={handleBuild} 
            onRightClick={handleRightClick}
        />
        
        <Base 
            position={[(baseB_Coord.x * CITY_CONFIG.tileSize) - offset, 0, (baseB_Coord.z * CITY_CONFIG.tileSize) - offset]} 
            gridPos={baseB_Coord} 
            teamColor={TEAM_COLORS.red} 
            label="RED CMD" 
            onMoveCommand={handleTileClick} 
            onDoubleClick={() => { if(playerTeam === 'red') setBaseMenuOpen('red'); }} 
            menuOpen={baseMenuOpen === 'red'} 
            resources={teamResources.red} 
            onBuild={handleBuild} 
            onRightClick={handleRightClick}
        />

        {/* Movement Visualization for Friendly Moving Units */}
        {movingUnitsData.map((data) => (
            <group key={`move-viz-${data.id}`}>
                <DestinationMarker x={data.destination.x} z={data.destination.z} tileSize={tileSize} offset={offset} />
                {data.pathPoints.length > 1 && (
                    <Line 
                        points={data.pathPoints} 
                        color="#22d3ee" 
                        lineWidth={2} 
                        dashed 
                        dashScale={2} 
                        gapSize={1}
                        opacity={0.5}
                        transparent
                    />
                )}
            </group>
        ))}

        {/* Targeting Cursor (Red for Cannon, Green for Surveillance, Orange for Missile, Cyan for Doctrine) */}
        {hoverGridPos && (targetingAbility || interactionMode === 'target') && (
            <group position={[(hoverGridPos.x * tileSize) - offset, 0.5, (hoverGridPos.z * tileSize) - offset]}>
                {targetingAbility === 'MISSILE' || (interactionMode === 'target' && targetingDoctrine?.type.includes('HEAVY_METAL')) ? (
                     // Nuke / Missile Targeting Reticle
                     <group>
                         {/* Spinning Ring Outer */}
                         <mesh rotation={[-Math.PI/2, 0, Date.now() * 0.005]}>
                             <ringGeometry args={[tileSize * 0.8, tileSize * 0.9, 32]} />
                             <meshBasicMaterial color="#ef4444" transparent opacity={0.6} side={THREE.DoubleSide} />
                         </mesh>
                         {/* Spinning Ring Inner */}
                         <mesh rotation={[-Math.PI/2, 0, -Date.now() * 0.005]}>
                             <ringGeometry args={[tileSize * 0.4, tileSize * 0.5, 32]} />
                             <meshBasicMaterial color="#f97316" transparent opacity={0.8} side={THREE.DoubleSide} />
                         </mesh>
                         {/* Crosshair Lines */}
                         <mesh rotation={[-Math.PI/2, 0, 0]}>
                             <planeGeometry args={[tileSize * 2.2, 0.1]} />
                             <meshBasicMaterial color="#ef4444" />
                         </mesh>
                         <mesh rotation={[-Math.PI/2, 0, Math.PI/2]}>
                             <planeGeometry args={[tileSize * 2.2, 0.1]} />
                             <meshBasicMaterial color="#ef4444" />
                         </mesh>
                         {/* Central Dot */}
                         <mesh>
                             <sphereGeometry args={[0.3]} />
                             <meshBasicMaterial color="#ef4444" />
                         </mesh>
                         {/* Impact Radius Warning */}
                         <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.4, 0]}>
                              <circleGeometry args={[ABILITY_CONFIG.WP_RADIUS * tileSize, 32]} />
                              <meshBasicMaterial color="#fca5a5" transparent opacity={0.15} depthWrite={false} />
                         </mesh>
                         <pointLight color="#ef4444" intensity={2} distance={10} animate-pulse />
                     </group>
                ) : (targetingAbility === 'SWARM' || (interactionMode === 'target' && targetingDoctrine?.type.includes('SKUNKWORKS'))) ? (
                    (interactionMode === 'target' && targetingDoctrine?.type === 'SKUNKWORKS_TIER2') ? (
                        // Nano Cloud Reticle (Green, 5 radius) - Crosshair + Ring
                        <group>
                            {/* Outer Ring */}
                            <mesh rotation={[-Math.PI/2, 0, Date.now() * 0.005]}>
                                <ringGeometry args={[ABILITY_CONFIG.NANO_CLOUD_RADIUS * tileSize - 0.5, ABILITY_CONFIG.NANO_CLOUD_RADIUS * tileSize, 64]} />
                                <meshBasicMaterial color="#10b981" transparent opacity={0.6} side={THREE.DoubleSide} />
                            </mesh>
                            {/* Inner Faint Fill */}
                            <mesh rotation={[-Math.PI/2, 0, 0]}>
                                <circleGeometry args={[ABILITY_CONFIG.NANO_CLOUD_RADIUS * tileSize, 64]} />
                                <meshBasicMaterial color="#10b981" transparent opacity={0.15} depthWrite={false} />
                            </mesh>
                            {/* Crosshair */}
                            <mesh position={[0, 1, 0]}>
                                <boxGeometry args={[0.5, 0.5, ABILITY_CONFIG.NANO_CLOUD_RADIUS * tileSize * 2]} />
                                <meshBasicMaterial color="#10b981" transparent opacity={0.5} />
                            </mesh>
                            <mesh position={[0, 1, 0]} rotation={[0, Math.PI/2, 0]}>
                                <boxGeometry args={[0.5, 0.5, ABILITY_CONFIG.NANO_CLOUD_RADIUS * tileSize * 2]} />
                                <meshBasicMaterial color="#10b981" transparent opacity={0.5} />
                            </mesh>
                            <mesh position={[0, 1, 0]}>
                                <cylinderGeometry args={[0.5, 0.5, 2]} />
                                <meshBasicMaterial color="#10b981" wireframe />
                            </mesh>
                        </group>
                    ) : (
                    // Wasp Swarm Reticle (Orange, 2 radius)
                    <group>
                        {/* Outer Ring */}
                        <mesh rotation={[-Math.PI/2, 0, Date.now() * 0.005]}>
                            <ringGeometry args={[ABILITY_CONFIG.WASP_SWARM_RADIUS * tileSize, ABILITY_CONFIG.WASP_SWARM_RADIUS * tileSize + 0.5, 32]} />
                            <meshBasicMaterial color="#f97316" transparent opacity={0.6} side={THREE.DoubleSide} />
                        </mesh>
                        {/* Inner Spinner */}
                        <mesh rotation={[-Math.PI/2, 0, -Date.now() * 0.01]}>
                            <ringGeometry args={[tileSize * 0.5, tileSize * 0.6, 8]} />
                            <meshBasicMaterial color="#facc15" transparent opacity={0.8} side={THREE.DoubleSide} />
                        </mesh>
                        {/* Area Highlight */}
                        <mesh rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[ABILITY_CONFIG.WASP_SWARM_RADIUS * tileSize, 32]} />
                            <meshBasicMaterial color="#f97316" transparent opacity={0.1} depthWrite={false} />
                        </mesh>
                        {/* Target Marker */}
                        <mesh position={[0, 1, 0]} rotation={[Math.PI, 0, 0]}>
                            <coneGeometry args={[0.5, 1, 4]} />
                            <meshBasicMaterial color="#facc15" wireframe />
                        </mesh>
                    </group>
                    )
                ) : (
                    // Standard Reticle
                    <group>
                        <mesh>
                            <boxGeometry args={[tileSize, 1, tileSize]} />
                            <meshBasicMaterial 
                                color={targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'CANNON' ? "#ef4444" : "#10b981")} 
                                wireframe 
                            />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.05, 0]}>
                            <ringGeometry args={[tileSize * 0.3, tileSize * 0.35, 4]} />
                            <meshBasicMaterial 
                                color={targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'CANNON' ? "#ef4444" : "#10b981")} 
                                side={THREE.DoubleSide} 
                            />
                        </mesh>
                        {targetingAbility === 'DECOY' && (
                            <mesh position={[0, 1, 0]}>
                                <boxGeometry args={[1, 1, 1]} />
                                <meshBasicMaterial color="#c084fc" wireframe transparent opacity={0.5} />
                            </mesh>
                        )}
                        {/* Interaction Mode Indicator */}
                        {interactionMode === 'target' && (
                            <mesh position={[0, 2, 0]} rotation={[Math.PI, 0, 0]}>
                                <coneGeometry args={[0.5, 1, 4]} />
                                <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
                            </mesh>
                        )}
                    </group>
                )}
            </group>
        )}

        {/* Placement Preview */}
        {placementMode && hoverGridPos && (
           <mesh position={[(hoverGridPos.x * tileSize) - offset, 2, (hoverGridPos.z * tileSize) - offset]}>
               <boxGeometry args={[tileSize * 0.8, 2, tileSize * 0.8]} />
               <meshBasicMaterial color={placementMode.type.includes('wall') ? '#ffffff' : TEAM_COLORS[playerTeam]} transparent opacity={0.5} wireframe />
           </mesh>
        )}

        {/* Active Projectile Target Markers (Dark Red until impact) */}
        {projectiles.map(p => p.targetPos && p.trajectory === 'ballistic' && (
            <group key={`target-${p.id}`} position={[p.targetPos.x, 0.5, p.targetPos.z]}>
                <mesh rotation={[0, Date.now() * 0.01, 0]}>
                    <ringGeometry args={[tileSize * 0.5, tileSize * 0.6, 16]} />
                    <meshBasicMaterial color="#7f1d1d" transparent opacity={0.8} side={THREE.DoubleSide} />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]}>
                     <circleGeometry args={[tileSize * 0.4, 32]} />
                     <meshBasicMaterial color="#ef4444" transparent opacity={0.3} />
                </mesh>
                <pointLight color="#ef4444" intensity={3} distance={5} decay={2} />
            </group>
        ))}

    </group>
  );
};

export default CityMap;
