
import React, { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { CITY_CONFIG, BUILDING_COLORS, TEAM_COLORS, BUILDING_VALUES, BLOCK_BONUS, UNIT_STATS, ABILITY_CONFIG, STRUCTURE_COST, BUILD_RADIUS, STRUCTURE_INFO, COMPUTE_GATES } from '../constants';
import { BuildingData, UnitData, BuildingBlock, GameStats, TeamStats, RoadType, RoadTileData, StructureData, UnitClass, DecoyData, UnitType, StructureType, CloudData, Projectile, Explosion } from '../types';
import Building from './Building';
import Structure from './Structure';
import Base from './Base';
import Unit from './Unit';
import BlockStatus from './BlockStatus';
import * as THREE from 'three';
import { Edges, Html, Line, Float, Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

// --- OPTIMIZED RENDERING: Instanced Roads ---
// Replaces thousands of <RoadTile> components with a single draw call
const InstancedRoads: React.FC<{ 
    tiles: RoadTileData[]; 
    tileSize: number; 
    offset: number; 
    onClick: (x: number, z: number) => void; 
    onRightClick: (x: number, z: number) => void; 
    onHover?: (x: number, z: number) => void;
    onPointerDown?: (e: any) => void;
    onPointerUp?: (e: any) => void;
    onPointerMove?: (e: any) => void;
}> = ({ tiles, tileSize, offset, onClick, onRightClick, onHover, onPointerDown, onPointerUp, onPointerMove }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);

    // Colors
    const colorMain = useMemo(() => new THREE.Color("#1e293b"), []);
    const colorStreet = useMemo(() => new THREE.Color("#0f172a"), []);
    const colorOpen = useMemo(() => new THREE.Color("#020617"), []); // Darker for open
    const colorHover = useMemo(() => new THREE.Color("#0ea5e9"), []);
    const tempObject = useMemo(() => new THREE.Object3D(), []);

    // Initial Setup of Matrices and Colors
    useLayoutEffect(() => {
        if (!meshRef.current) return;

        tiles.forEach((tile, i) => {
            const x = (tile.x * tileSize) - offset;
            const z = (tile.z * tileSize) - offset;
            
            tempObject.position.set(x, 0.01, z);
            tempObject.rotation.set(-Math.PI / 2, 0, 0);
            tempObject.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObject.matrix);

            // Set base color
            if (tile.type === 'main') meshRef.current!.setColorAt(i, colorMain);
            else if (tile.type === 'street') meshRef.current!.setColorAt(i, colorStreet);
            else meshRef.current!.setColorAt(i, colorOpen);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    }, [tiles, tileSize, offset]);

    // Handle Hover Effect efficiently
    useFrame(() => {
        if (!meshRef.current) return;
        // Optimization: Hover colors are handled in useEffect below to avoid per-frame loops
    });

    // Update Colors when hover changes
    useEffect(() => {
        if (!meshRef.current) return;

        // Set specific color for hovered
        if (hoveredId !== null && hoveredId < tiles.length) {
            meshRef.current.setColorAt(hoveredId, colorHover);
            meshRef.current.instanceColor!.needsUpdate = true;
        }

        return () => {
            if (meshRef.current && hoveredId !== null && hoveredId < tiles.length) {
                const tile = tiles[hoveredId];
                if (tile.type === 'main') meshRef.current.setColorAt(hoveredId, colorMain);
                else if (tile.type === 'street') meshRef.current.setColorAt(hoveredId, colorStreet);
                else meshRef.current.setColorAt(hoveredId, colorOpen);
                meshRef.current.instanceColor!.needsUpdate = true;
            }
        }
    }, [hoveredId, tiles]);

    const handlePointerMove = (e: any) => {
        e.stopPropagation();
        if (onPointerMove) onPointerMove(e);
        if (e.instanceId !== undefined) {
            setHoveredId(e.instanceId);
            const tile = tiles[e.instanceId];
            if (onHover) onHover(tile.x, tile.z);
        }
    };

    const handlePointerOut = (e: any) => {
        setHoveredId(null);
    };

    const handleClick = (e: any) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            const tile = tiles[e.instanceId];
            onClick(tile.x, tile.z);
        }
    };

    const handleContextMenu = (e: any) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            const tile = tiles[e.instanceId];
            onRightClick(tile.x, tile.z);
        }
    };

    return (
        <group>
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, tiles.length]}
                onPointerMove={handlePointerMove}
                onPointerOut={handlePointerOut}
                onPointerDown={(e) => { e.stopPropagation(); if (onPointerDown) onPointerDown(e); }}
                onPointerUp={(e) => { e.stopPropagation(); if (onPointerUp) onPointerUp(e); }}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {/* Slightly smaller plane to create grid lines naturally via background gap */}
                <planeGeometry args={[tileSize * 0.95, tileSize * 0.95]} />
                <meshStandardMaterial roughness={0.8} metalness={0.4} />
            </instancedMesh>
        </group>
    );
}

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

// Projectile Component
const ProjectileMesh: React.FC<{ projectile: Projectile }> = ({ projectile }) => {
    const meshRef = useRef<THREE.Group>(null);

    useFrame(() => {
        if (meshRef.current) {
            // Update position
            meshRef.current.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
            
            // Look at direction of travel (velocity)
            if (Math.abs(projectile.velocity.x) > 0.01 || Math.abs(projectile.velocity.y) > 0.01 || Math.abs(projectile.velocity.z) > 0.01) {
                // LookAt requires a target position, so add velocity to current pos
                const target = new THREE.Vector3(
                    projectile.position.x + projectile.velocity.x,
                    projectile.position.y + projectile.velocity.y,
                    projectile.position.z + projectile.velocity.z
                );
                meshRef.current.lookAt(target);
            }
        }
    });

    return (
        <group ref={meshRef}>
             {/* The projectile body - oriented along Z axis natively, so rotate X to align with LookAt forward (-Z) if needed, 
                 but cylinder is usually Y-up. Let's make it Z-forward. 
                 Cylinder geometry is Y-up. We rotate it 90deg on X to make it Z-forward.
             */}
             <mesh rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.2, 0.2, 1.5, 8]} />
                 <meshBasicMaterial color={projectile.trajectory === 'ballistic' ? "#a855f7" : "#fca5a5"} />
             </mesh>
             <pointLight color={projectile.trajectory === 'ballistic' ? "#d8b4fe" : "#ef4444"} intensity={3} distance={5} />
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
}

const CityMap: React.FC<CityMapProps> = ({ onStatsUpdate, onMapInit, onMinimapUpdate, playerTeam = 'blue' }) => {
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
    { id: 'u15', type: 'ballista', unitClass: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, loadingProgress: 0 },
    { id: 'u16', type: 'wasp', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 8 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES }, battery: 100, maxBattery: 100 },
    { id: 'u17', type: 'mason', unitClass: 'builder', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u18', type: 'helios', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u19', type: 'sun_plate', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, isDeployed: false },
    { id: 'u20', type: 'ballista', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, loadingProgress: 0 },
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
  const [targetingAbility, setTargetingAbility] = useState<'TETHER' | 'CANNON' | 'SURVEILLANCE' | 'MISSILE' | null>(null);

  const [baseMenuOpen, setBaseMenuOpen] = useState<'blue' | 'red' | null>(null);
  const [placementMode, setPlacementMode] = useState<{type: StructureType, cost: number} | null>(null);
  const [hoverGridPos, setHoverGridPos] = useState<{x: number, z: number} | null>(null);
  const [teamResources, setTeamResources] = useState<{blue: number, red: number}>({ blue: 1000, red: 1000 });
  const [teamCompute, setTeamCompute] = useState<{blue: number, red: number}>({ blue: 0, red: 0 });
  const [stockpile, setStockpile] = useState<{blue: {eclipse: number, wp: number}, red: {eclipse: number, wp: number}}>({ blue: { eclipse: 0, wp: 0 }, red: { eclipse: 0, wp: 0 } });
  
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
            onMinimapUpdate({ 
                units: unitsRef.current, 
                buildings: buildingsRef.current,
                structures: [staticBaseBlue, staticBaseRed, ...structuresRef.current],
                selectedUnitIds: Array.from(selectedUnitIdsRef.current)
            });
        }, 100); 
        
        return () => clearInterval(interval);
    }
  }, [onMinimapUpdate, gridSize]);

  // Pointer Handlers for Drag Select
  const handlePointerDown = (e: any) => {
      // e.stopPropagation(); // Avoid stopping if other elements need it?
      // Only handle Left Click (0) for drag select
      if (e.button === 0) {
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
               }
               // Don't clear selection if empty box? Standard RTS: Empty box clears selection.
               // Let's stick to standard.
               else {
                   // setSelectedUnitIds(new Set()); 
                   // Actually, if I drag a box and select nothing, usually I deselect. 
                   // But let's check if the prompt implied it. 
                   // "Once I release... unit should all stay selected"
                   // Safe to clear if box is valid but empty.
                   setSelectedUnitIds(newSelection);
               }
          } else {
               // Was a Click (Short Drag)
               // Handled by handleTileClick below if we don't stop it.
               // Since we use onClick separately, we let that fire.
               // However, `onClick` might fire even if we dragged if we don't block it.
               // But `onClick` relies on raycasting which might be specific.
               // The logic for `handleTileClick` is:
               // If clicking ground -> Move.
               // If clicking unit -> Select.
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
      result[team] = { resources: currentResources[team], income, compute: teamBuildings.server_node, units: currentUnits.filter(u => u.team === team).length, buildings: teamBuildings, stockpile: currentStockpile[team] };
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

  const handleUnitSelect = (id: string) => {
      // If we just dragged, ignore click logic that might fire
      if (didDragRef.current) return;

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
          return { ...u, gridPos: { x: nx, z: nz }, path: u.path.slice(1) };
      }));
  };

  const handleTileClick = (x: number, z: number) => {
      // If we just dragged, ignore any click events generated
      if (didDragRef.current) return;

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
              if (path.length > 0) {
                  setUnits(prev => prev.map(u => {
                      if (u.id === unit.id) {
                          return { ...u, path, surveillance: { active: true, status: 'traveling', center: { x, z }, returnPos: { x: unit.gridPos.x, z: unit.gridPos.z }, startTime: 0 } };
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
          // Ballistic Missile Logic (Launch -> Cruise -> Terminal)
          const sourceUnit = unitsRef.current.find(u => u.id === targetingSourceId);
          if (sourceUnit && sourceUnit.ammoState === 'armed' && sourceUnit.loadedAmmo) {
              const startPos = { x: (sourceUnit.gridPos.x * CITY_CONFIG.tileSize) - offset, y: 2.0, z: (sourceUnit.gridPos.z * CITY_CONFIG.tileSize) - offset };
              const targetPos = { x: (x * CITY_CONFIG.tileSize) - offset, y: 1.0, z: (z * CITY_CONFIG.tileSize) - offset };
              
              // Consume Ammo
              setUnits(prev => prev.map(u => {
                  if (u.id === sourceUnit.id) {
                      return { ...u, ammoState: 'empty', loadedAmmo: null };
                  }
                  return u;
              }));

              // Spawn Projectile in Ascent Phase (Moving straight UP)
              setProjectiles(prev => [...prev, { 
                  id: `missile-${Date.now()}`, 
                  ownerId: sourceUnit.id, 
                  team: sourceUnit.team, 
                  position: startPos, 
                  velocity: { x: 0, y: ABILITY_CONFIG.MISSILE_ASCENT_SPEED, z: 0 }, 
                  damage: 0, // Damage dealt by cloud creation upon impact
                  radius: 1.0, 
                  maxDistance: 9999, // Distance handled by phase logic
                  distanceTraveled: 0, 
                  targetPos: targetPos,
                  trajectory: 'ballistic',
                  phase: 'ascent'
              }]);
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

      if (action === 'PHANTOM DECOY' && compute >= COMPUTE_GATES.PHANTOM_DECOY) {
           setDecoys(prev => [...prev, { id: `decoy-${Date.now()}`, team: unit.team as 'blue'|'red', gridPos: { ...unit.gridPos }, createdAt: Date.now() }]);
           return;
      }

      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => prev.map(u => {
          if (!selectedUnitIds.has(u.id)) return u;
          
          if (action === 'TOGGLE_JAMMER' && u.type === 'banshee') return { ...u, jammerActive: !u.jammerActive };
          if (action === 'TOGGLE DAMPENER' && u.type === 'ghost') return { ...u, isDampenerActive: !u.isDampenerActive };
          if (action === 'TOGGLE ARRAY' && u.type === 'sun_plate') return { ...u, isDeployed: !u.isDeployed };
          if (action === 'SMOKE SCREEN' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN }, smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION } };
          if (action === 'ACTIVATE APS' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanAps: ABILITY_CONFIG.TITAN_APS_COOLDOWN }, aps: { active: true, remainingTime: ABILITY_CONFIG.TITAN_APS_DURATION } };
          return u;
      }));
  };

  // --- Depot / Mason Logic ---
  const handleStructureClick = (id: string) => {
      // If we dragged, don't open menu
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
                  id: `u-${Date.now()}`, type: type, unitClass: stats.unitClass, team: playerTeam, gridPos: { ...struct.gridPos }, path: [], visionRange: stats.visionRange, health: stats.maxHealth, maxHealth: stats.maxHealth, battery: 100, maxBattery: 100, cooldowns: {},
                  ...(type === 'mason' ? { cargo: 100 } : {}),
                  ...(type === 'banshee' ? { battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY } : {}),
                  ...(type === 'wasp' ? { charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES } } : {}),
                  ...(type === 'tank' ? { charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS } } : {}),
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
          let damageEvents: {id: string, damage: number, position: {x: number, y: number, z: number}, team: 'blue' | 'red' | 'neutral' }[] = [];
          const nextProjs: Projectile[] = [];
          let projsChanged = false;
          const currentBuildings = buildingsRef.current;
          const currentStructures = structuresRef.current;
          const currentUnitsRef = unitsRef.current; 

          activeProjs.forEach(p => {
              let nextP: Projectile = { ...p, position: { ...p.position } }; 
              
              // Handle Ballistic Missile Logic
              if (p.trajectory === 'ballistic' && p.phase && p.targetPos) {
                  const { phase } = p;
                  let hit = false;

                  if (phase === 'ascent') {
                      nextP.position.y += p.velocity.y * dT;
                      // Ensure velocity vector points UP for correct orientation
                      nextP.velocity = { x: 0, y: ABILITY_CONFIG.MISSILE_ASCENT_SPEED, z: 0 };
                      if (nextP.position.y >= ABILITY_CONFIG.MISSILE_LAUNCH_HEIGHT) {
                          nextP.phase = 'cruise';
                          nextP.position.y = ABILITY_CONFIG.MISSILE_LAUNCH_HEIGHT;
                      }
                  } else if (phase === 'cruise') {
                      // Calculate vector to target X/Z
                      const dx = p.targetPos.x - p.position.x;
                      const dz = p.targetPos.z - p.position.z;
                      const dist = Math.sqrt(dx*dx + dz*dz);
                      const speed = ABILITY_CONFIG.MISSILE_CRUISE_SPEED;
                      
                      // Check if within 'drop' distance (e.g., 2 frames worth of movement)
                      if (dist < speed * dT * 1.5) {
                          // Reached drop zone
                          nextP.phase = 'terminal';
                          // Snap to exact X/Z target to ensure straight down drop
                          nextP.position.x = p.targetPos.x;
                          nextP.position.z = p.targetPos.z;
                          nextP.velocity = { x: 0, y: -ABILITY_CONFIG.MISSILE_TERMINAL_SPEED, z: 0 };
                      } else {
                          // Move towards target
                          const vx = (dx / dist) * speed;
                          const vz = (dz / dist) * speed;
                          nextP.velocity = { x: vx, y: 0, z: vz };
                          nextP.position.x += vx * dT;
                          nextP.position.z += vz * dT;
                      }
                  } else if (phase === 'terminal') {
                      const speed = ABILITY_CONFIG.MISSILE_TERMINAL_SPEED;
                      nextP.velocity = { x: 0, y: -speed, z: 0 };
                      nextP.position.y -= speed * dT;
                      
                      // Check impact with ground/target height
                      if (nextP.position.y <= p.targetPos.y) {
                          hit = true;
                          // Handle Cloud Generation based on Unit Type (Assuming cloud logic exists elsewhere or we simplify)
                          const cloudType = 'wp'; // Default or based on unit metadata
                          setClouds(prev => [...prev, {
                              id: `cloud-${Date.now()}`,
                              type: cloudType,
                              gridPos: { x: Math.round((p.targetPos!.x + offset) / CITY_CONFIG.tileSize), z: Math.round((p.targetPos!.z + offset) / CITY_CONFIG.tileSize) },
                              radius: ABILITY_CONFIG.WP_RADIUS,
                              duration: ABILITY_CONFIG.WP_DURATION,
                              createdAt: Date.now(),
                              team: p.team as 'blue' | 'red'
                          }]);
                      }
                  }

                  if (hit) {
                      projsChanged = true;
                      newExplosions.push({ id: `exp-${now}-${Math.random()}`, position: nextP.position, radius: 5, duration: 800, createdAt: now });
                      damageEvents.push({ id: `dmg-${now}-${Math.random()}`, damage: 50, position: nextP.position, team: nextP.team as 'blue' | 'red' | 'neutral' }); // Impact damage
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
                      if (nextP.distanceTraveled >= nextP.maxDistance) { hit = true; break; }
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
                      for (const u of currentUnitsRef) {
                          if (u.team === nextP.team) continue;
                          if (u.health <= 0) continue;
                          const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                          const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                          const dist = Math.sqrt((nextP.position.x - uX)**2 + (nextP.position.z - uZ)**2);
                          if (dist < CITY_CONFIG.tileSize * 0.8) { hit = true; break; }
                      }
                      if (hit) break;
                  }
                  if (hit) {
                      projsChanged = true;
                      newExplosions.push({ id: `exp-${now}-${Math.random()}`, position: nextP.position, radius: 3, duration: 500, createdAt: now });
                      damageEvents.push({ id: `dmg-${now}-${Math.random()}`, damage: nextP.damage, position: nextP.position, team: nextP.team as 'blue' | 'red' | 'neutral' });
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
                   const newProgress = p.progress + 100; 
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
                  prevUnits.forEach(u => { if (u.tetherTargetId) tetherSources.set(u.tetherTargetId, u); });

                  damageEvents.forEach(evt => {
                      prevUnits.forEach(u => {
                          if (u.team === evt.team) return; 
                          const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                          const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                          const dist = Math.sqrt((evt.position.x - uX)**2 + (evt.position.z - uZ)**2);
                          if (dist <= CITY_CONFIG.tileSize * 1.5) {
                              const dmg = evt.damage * (1 - (dist / (CITY_CONFIG.tileSize * 1.5))); 
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

                  const chargers = activeUnits.filter(u => (u.type === 'helios') || (u.type === 'sun_plate' && u.isDeployed));

                  const nextUnits = activeUnits.map(u => {
                      let newUnit = { ...u };
                      let uChanged = false;

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
                      let chargeAmount = 0;
                      let status = 0;
                      if (externalChargeMap.has(u.id)) { 
                          chargeAmount += externalChargeMap.get(u.id)!.amount; 
                          status = 1; 
                      }
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

                      if (chargeAmount > 0 && newUnit.battery < newUnit.maxBattery) { 
                          newUnit.battery = Math.min(newUnit.maxBattery, newUnit.battery + chargeAmount); 
                          uChanged = true; 
                      }
                      if (newUnit.chargingStatus !== status) { 
                          newUnit.chargingStatus = status; 
                          uChanged = true; 
                      }

                      if (uChanged) {
                           unitsChanged = true;
                           return newUnit;
                      }
                      return u;
                  });
                  
                  const autoAttackDamage = new Map<string, number>();
                  const finalUnitsWithAttacks = nextUnits.map(attacker => {
                       const stats = UNIT_STATS[attacker.type];
                       if (stats.attackDamage && stats.attackDamage > 0) {
                           const lastAttack = attacker.lastAttackTime || 0;
                           const cooldown = stats.attackCooldown || 1000;
                           if (now - lastAttack >= cooldown) {
                               let targetId: string | null = null;
                               let minDist = 999;
                               for (const enemy of nextUnits) {
                                   if (enemy.team === attacker.team || enemy.team === 'neutral') continue;
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
    <group>
        {/* Solid Ground Plane */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.1, 0]} 
          receiveShadow 
          onContextMenu={handleBgRightClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
        >
            <planeGeometry args={[gridSize * tileSize, gridSize * tileSize]} />
            <meshStandardMaterial color="#0f172a" roughness={1} metalness={0} />
        </mesh>

        {/* Instanced Roads */}
        <InstancedRoads 
            tiles={roadTiles} 
            tileSize={CITY_CONFIG.tileSize} 
            offset={offset} 
            onClick={handleTileClick} 
            onRightClick={handleRightClick} 
            onHover={(x, z) => setHoverGridPos({x, z})}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
        />

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
        {units.map(u => {
             const isVisible = visibleUnitIds.has(u.id);
             return ( <Unit key={u.id} {...u} teamCompute={(u.team === 'blue' || u.team === 'red') ? teamCompute[u.team] : 0} isSelected={selectedUnitIds.has(u.id)} onSelect={handleUnitSelect} tileSize={CITY_CONFIG.tileSize} offset={offset} onMoveStep={handleMoveStep} tileTypeMap={tileTypeMap} onDoubleClick={() => {}} visible={isVisible} actionMenuOpen={primarySelectionId === u.id} onAction={handleUnitAction} isTargetingMode={!!targetingSourceId} /> );
        })}
        
        {/* Projectiles */}
        {projectiles.map(p => <ProjectileMesh key={p.id} projectile={p} />)}
        
        {/* Explosions */}
        {explosions.map(e => <ExplosionMesh key={e.id} explosion={e} />)}

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

        {/* Targeting Cursor (Red for Cannon, Green for Surveillance, Orange for Missile) */}
        {hoverGridPos && (targetingAbility === 'CANNON' || targetingAbility === 'SURVEILLANCE' || targetingAbility === 'MISSILE') && (
            <group position={[(hoverGridPos.x * tileSize) - offset, 0.5, (hoverGridPos.z * tileSize) - offset]}>
                <mesh>
                    <boxGeometry args={[tileSize, 1, tileSize]} />
                    <meshBasicMaterial 
                        color={targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'MISSILE' ? "#f97316" : "#10b981")} 
                        wireframe 
                    />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.05, 0]}>
                    <ringGeometry args={[tileSize * 0.3, tileSize * 0.35, 4]} rotation={[0,0,Math.PI/4]} />
                    <meshBasicMaterial 
                        color={targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'MISSILE' ? "#f97316" : "#10b981")} 
                        side={THREE.DoubleSide} 
                    />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]}>
                     <planeGeometry args={[tileSize * 0.9, 0.2]} />
                     <meshBasicMaterial 
                        color={targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'MISSILE' ? "#f97316" : "#10b981")} 
                     />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, Math.PI/2]}>
                     <planeGeometry args={[tileSize * 0.9, 0.2]} />
                     <meshBasicMaterial 
                        color={targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'MISSILE' ? "#f97316" : "#10b981")} 
                     />
                </mesh>
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
        {projectiles.map(p => p.targetPos && (
            <group key={`target-${p.id}`} position={[p.targetPos.x, 0.5, p.targetPos.z]}>
                <mesh>
                    <boxGeometry args={[tileSize, 1, tileSize]} />
                    <meshBasicMaterial color="#7f1d1d" transparent opacity={0.6} />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.6, 0]}>
                     <ringGeometry args={[tileSize * 0.4, tileSize * 0.45, 32]} />
                     <meshBasicMaterial color="#ef4444" />
                </mesh>
            </group>
        ))}

    </group>
  );
};

export default CityMap;
