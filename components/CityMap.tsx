
import React, { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { CITY_CONFIG, BUILDING_COLORS, TEAM_COLORS, BUILDING_VALUES, BUILDING_HEALTH, TEAM_BASES, UNIT_STATS, ABILITY_CONFIG, STRUCTURE_COST, BUILD_RADIUS, STRUCTURE_INFO, COMPUTE_GATES, DOCTRINE_CONFIG } from '../constants';
import { BuildingData, UnitData, BuildingBlock, GameStats, DoctrineType, RoadType, RoadTileData, StructureData, UnitClass, DecoyData, UnitType, StructureType, CloudData, Projectile, Explosion, DoctrineState, MinimapMissile } from '../types';
import Building from './Building';
import Structure from './Structure';
import Base from './Base';
import Unit from './Unit';
import BlockStatus from './BlockStatus';
import { InstancedRoads } from './RoadSystem';
import BuildingHitProxies from './BuildingHitProxies';
import * as THREE from 'three';
import { Edges, Html, Line, Float, Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Zap, Ban } from 'lucide-react';
import { freezeContainer } from '../perf';
import { ENERGY_GRID_COLOR, outerEnergyGridPolylines } from '../energyGrid';
import { MOVE_TICK_MS, Mover, MovementEnv, advanceMover, arriveAtNextTile } from '../sim/movement';
import { simClock } from './glide';
import { FlightEvent, FlightTickResult, LiveFlight, cloneProjectile, drawnShotPosition, sampleBallistic, stepProjectiles } from '../sim/projectiles';
import { Blast, applyDamage, autoAttacks, blastDamage, bombardBuildings, bombardUnitDamage, crawlerDetonations, heCloudDamage, isBombardStrike, sentinelFire } from '../sim/combat';
import { Economy, createEconomy, canAfford, spend, setCores, addWarheads, takeWarhead, payIncome, teamStats, productionStep, advanceWarheadProduction, unitCost, structureCost, warheadCost, warheadBuildTime, doctrinePowerCost, ECONOMY_TICK_MS } from '../sim/economy';

const isTetherableDrone = (u: UnitData) => u.type === 'drone' || u.type === 'helios';
const isBatteryLinkable = (u: UnitData) => u.health > 0 && u.maxBattery > 0 && u.unitClass !== 'infantry' && u.type !== 'sun_plate' && u.type !== 'defense_drone' && u.type !== 'crawler_drone';

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
// Renders discrete orange light fixtures along edges of street tiles
const StreetLights: React.FC<{ tiles: RoadTileData[], tileSize: number, offset: number }> = ({ tiles, tileSize, offset }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    // Count instances needed: 4 lights per edge per tile
    const lightsPerEdge = 4;
    
    const count = useMemo(() => {
        let c = 0;
        tiles.forEach(t => {
            if (t.type === 'street') {
                if (t.x % 6 === 0) c += 2 * lightsPerEdge; // Vertical road borders
                if (t.z % 6 === 0) c += 2 * lightsPerEdge; // Horizontal road borders
            }
        });
        return c;
    }, [tiles]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const dummy = new THREE.Object3D();
        let idx = 0;
        const halfSize = tileSize / 2;
        const margin = 0.3; // Offset from edge
        const spacing = tileSize / lightsPerEdge;
        const startOffset = -tileSize/2 + spacing/2; 

        tiles.forEach(t => {
            if (t.type !== 'street') return;
            const tx = (t.x * tileSize) - offset;
            const tz = (t.z * tileSize) - offset;

            // Vertical Road (Running along Z)
            if (t.x % 6 === 0) {
                // Left Strip
                for(let i=0; i<lightsPerEdge; i++) {
                    dummy.position.set(tx - halfSize + margin, 0.05, tz + startOffset + (i * spacing));
                    dummy.rotation.set(0, 0, 0); 
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(idx++, dummy.matrix);
                }
                // Right Strip
                for(let i=0; i<lightsPerEdge; i++) {
                    dummy.position.set(tx + halfSize - margin, 0.05, tz + startOffset + (i * spacing));
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(idx++, dummy.matrix);
                }
            }
            
            // Horizontal Road (Running along X)
            if (t.z % 6 === 0) {
                // Top Strip (Near -Z)
                for(let i=0; i<lightsPerEdge; i++) {
                    dummy.position.set(tx + startOffset + (i * spacing), 0.05, tz - halfSize + margin);
                    dummy.rotation.set(0, Math.PI / 2, 0); 
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(idx++, dummy.matrix);
                }
                // Bottom Strip (Near +Z)
                for(let i=0; i<lightsPerEdge; i++) {
                    dummy.position.set(tx + startOffset + (i * spacing), 0.05, tz + halfSize - margin);
                    dummy.rotation.set(0, Math.PI / 2, 0);
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(idx++, dummy.matrix);
                }
            }
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [tiles, tileSize, offset, count]);

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[0.2, 0.1, 1.5]} />
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
    } else if (cloud.type === 'he') {
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
// Draws each shot between game ticks along the path the flight step is following.
const ProjectileMesh: React.FC<{ projectile: Projectile; flightRef: React.MutableRefObject<Map<string, LiveFlight>> }> = ({ projectile, flightRef }) => {
    const meshRef = useRef<THREE.Group>(null);
    const orient = useRef(new THREE.Object3D());
    const lookTarget = useRef(new THREE.Vector3());
    const firedAt = useRef(performance.now());

    useLayoutEffect(() => {
        const pos = flightRef.current.get(projectile.id)?.shot.position ?? projectile.position;
        meshRef.current?.position.set(pos.x, pos.y, pos.z);
    }, [flightRef, projectile.id]);

    useFrame((_, delta) => {
        const group = meshRef.current;
        const live = flightRef.current.get(projectile.id);
        if (!group || !live) return;
        // The shot moves on the game tick; carry it forward to this frame so it flies smoothly.
        // A shot fired since the last tick has not moved yet, so count from whichever came later.
        const since = Math.max(simClock.lastTickAt, firedAt.current);
        const drawn = drawnShotPosition(live.shot, Date.now(), (performance.now() - since) / 1000);
        const { x, y, z } = drawn.position;
        const { x: vx, y: vy, z: vz } = drawn.heading;
        group.position.set(x, y, z);
        if (vx * vx + vy * vy + vz * vz < 1e-6) return;
        lookTarget.current.set(x + vx, y + vy, z + vz);
        orient.current.position.set(x, y, z);
        orient.current.lookAt(lookTarget.current);
        const turn = projectile.trajectory === 'swarm' ? 12 : (projectile.trajectory === 'ballistic' ? 10 : 18);
        group.quaternion.slerp(orient.current.quaternion, 1 - Math.exp(-Math.min(delta, 0.05) * turn));
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


const isInsideEnergyGrid = (
  pos: { x: number; z: number },
  team: UnitData['team'],
  buildings: BuildingData[],
  blueBase: { x: number; z: number },
  redBase: { x: number; z: number },
) => {
  if (team !== 'blue' && team !== 'red') return false;
  const baseRadiusSq = ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS * ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS;
  const buildingRadiusSq = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS * ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
  const base = team === 'blue' ? blueBase : redBase;
  const baseDx = pos.x - base.x;
  const baseDz = pos.z - base.z;
  if (baseDx * baseDx + baseDz * baseDz <= baseRadiusSq) return true;
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (building.destroyed || building.owner !== team || building.type === 'core_node') continue;
    const dx = pos.x - building.gridX;
    const dz = pos.z - building.gridZ;
    if (dx * dx + dz * dz <= buildingRadiusSq) return true;
  }
  return false;
};

const EnergyGridField: React.FC<{
  buildings: BuildingData[];
  playerTeam: 'blue' | 'red';
  tileSize: number;
  offset: number;
}> = ({ buildings, playerTeam, tileSize, offset }) => {
  const sources = useMemo(() => {
    const base = TEAM_BASES[playerTeam];
    const owned = buildings
      .filter(building => !building.destroyed && building.owner === playerTeam && building.type !== 'core_node')
      .map(building => ({ x: building.gridX, z: building.gridZ, radius: ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS }));
    return [{ x: base.x, z: base.z, radius: ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS }, ...owned];
  }, [buildings, playerTeam]);

  const arcs = useMemo(() => outerEnergyGridPolylines(sources), [sources]);

  return (
    <group>
      {arcs.map((points, index) => (
        <Line
          key={index}
          points={points.map(point => [(point.x * tileSize) - offset, 0.35, (point.z * tileSize) - offset])}
          color={ENERGY_GRID_COLOR}
          lineWidth={3}
          raycast={() => undefined}
        />
      ))}
    </group>
  );
};

interface CityMapProps {
  onStatsUpdate: (stats: GameStats) => void;
  onMapInit?: (data: { roadTiles: RoadTileData[], gridSize: number }) => void;
  onMinimapUpdate?: (data: { units: UnitData[], buildings: BuildingData[], structures: StructureData[], selectedUnitIds?: string[], missiles?: MinimapMissile[] }) => void;
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
  const baseA_Coord = TEAM_BASES.blue;
  const baseB_Coord = TEAM_BASES.red;

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

    // Roads sit on every 6th line, so the lot between them is a 5x5 city block.
    // The core stands on the center tile of that lot.
    const ROAD_STRIDE = 6;
    const blockIndexOf = (coord: number) => Math.floor(coord / ROAD_STRIDE);
    const blockCenter = (index: number) => index * ROAD_STRIDE + 3;
    const lastBlockIndex = Math.floor((gridSize - 1) / ROAD_STRIDE) - 1;
    const keepBlockEmpty = (ix: number, iz: number) => {
      if (ix < 0 || iz < 0 || ix > lastBlockIndex || iz > lastBlockIndex) return;
      for (let x = ix * ROAD_STRIDE + 1; x <= ix * ROAD_STRIDE + 5; x++) {
        for (let z = iz * ROAD_STRIDE + 1; z <= iz * ROAD_STRIDE + 5; z++) {
          occupied.add(`${x},${z}`);
        }
      }
      // One tile sits past the outer road. A building there would still reach a corner node.
      const edge = lastBlockIndex * ROAD_STRIDE + ROAD_STRIDE + 1;
      if (edge < gridSize && iz === lastBlockIndex) {
        for (let x = ix * ROAD_STRIDE + 1; x <= ix * ROAD_STRIDE + 5; x++) occupied.add(`${x},${edge}`);
      }
      if (edge < gridSize && ix === lastBlockIndex) {
        for (let z = iz * ROAD_STRIDE + 1; z <= iz * ROAD_STRIDE + 5; z++) occupied.add(`${edge},${z}`);
      }
    };
    const blueBlock = { ix: blockIndexOf(baseA_Coord.x), iz: blockIndexOf(baseA_Coord.z) };
    const redBlock = { ix: blockIndexOf(baseB_Coord.x), iz: blockIndexOf(baseB_Coord.z) };
    // Approach nodes sit two blocks in from each base. The empty corners are the
    // long edge sites. The last pair sits on the line equidistant from both bases,
    // outside the center server cluster, so taking one means meeting the other player.
    const corePlacements: { ix: number; iz: number; clearSurroundings: boolean }[] = [
      { ix: blueBlock.ix + 2, iz: blueBlock.iz + 2, clearSurroundings: false },
      { ix: redBlock.ix - 2, iz: redBlock.iz - 2, clearSurroundings: false },
      { ix: blueBlock.ix, iz: redBlock.iz, clearSurroundings: true },
      { ix: redBlock.ix, iz: blueBlock.iz, clearSurroundings: true },
      { ix: blueBlock.ix + 3, iz: redBlock.iz - 3, clearSurroundings: false },
      { ix: redBlock.ix - 3, iz: blueBlock.iz + 3, clearSurroundings: false },
    ];
    for (const node of corePlacements) {
      if (node.clearSurroundings) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            keepBlockEmpty(node.ix + dx, node.iz + dz);
          }
        }
      }
      keepBlockEmpty(node.ix, node.iz);
      const x = blockCenter(node.ix);
      const z = blockCenter(node.iz);
      const height = 6;
      const blockId = `core-${x}-${z}`;
      buildingMap.set(`${x},${z}`, blockId);
      _buildings.push({
        id: blockId,
        gridX: x,
        gridZ: z,
        position: [(x * tileSize) - offset, 0, (z * tileSize) - offset],
        scale: [3.4, height, 3.4],
        color: BUILDING_COLORS.core_node,
        type: 'core_node',
        height,
        blockId,
        owner: null,
        captureProgress: 0,
        capturingTeam: null,
        health: BUILDING_HEALTH.core_node,
        maxHealth: BUILDING_HEALTH.core_node,
      });
    }
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (occupied.has(`${x},${z}`)) continue;
        if (Math.random() < buildingDensity) {
          const blockSize = 3 + Math.floor(Math.random() * 4); 
          const blockId = `block-${blockCounter}`;
          const dist = Math.sqrt(Math.pow(x - gridSize/2, 2) + Math.pow(z - gridSize/2, 2));
          let type: BuildingData['type'] = 'residential';
          if (dist < ABILITY_CONFIG.CENTER_THREAT_RADIUS && Math.random() < 0.25) { type = 'server_node'; } 
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
              color: BUILDING_COLORS[type], type, height, blockId, owner: null, captureProgress: 0, capturingTeam: null, health: BUILDING_HEALTH[type], maxHealth: BUILDING_HEALTH[type]
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
    { id: 'u9', type: 'mule', unitClass: 'ordnance', team: 'blue', gridPos: { x: 6, z: 5 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100, ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { eclipse: 0, he: 0 } },
    { id: 'u10', type: 'mule', unitClass: 'ordnance', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100, ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { eclipse: 0, he: 0 } },
    { id: 'u11', type: 'wasp', unitClass: 'air', team: 'blue', gridPos: { x: 5, z: 7 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES }, battery: 100, maxBattery: 100 },
    { id: 'u12', type: 'mason', unitClass: 'builder', team: 'blue', gridPos: { x: 3, z: 6 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u13', type: 'helios', unitClass: 'support', team: 'blue', gridPos: { x: 2, z: 6 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u14', type: 'sun_plate', unitClass: 'armor', team: 'blue', gridPos: { x: 4, z: 5 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, isDeployed: false, batteryTetherIds: [] },
    { id: 'u15', type: 'ballista', unitClass: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { eclipse: 1, he: 1 }, loadingProgress: 0 },
    { id: 'u16', type: 'wasp', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 8 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES }, battery: 100, maxBattery: 100 },
    { id: 'u17', type: 'mason', unitClass: 'builder', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u18', type: 'helios', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u19', type: 'sun_plate', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, isDeployed: false, batteryTetherIds: [] },
    { id: 'u20', type: 'ballista', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { eclipse: 1, he: 1 }, loadingProgress: 0 },
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
  const [targetingAbility, setTargetingAbility] = useState<'TETHER' | 'BATTERY_TETHER' | 'CANNON' | 'SURVEILLANCE' | 'MISSILE' | 'DECOY' | 'SWARM' | 'BOMBARD' | null>(null);

  const [baseMenuOpen, setBaseMenuOpen] = useState<'blue' | 'red' | null>(null);
  const [placementMode, setPlacementMode] = useState<{type: StructureType, cost: number} | null>(null);
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;
  const pointerStartRef = useRef<THREE.Vector3 | null>(null);
  const [hoverGridPos, setHoverGridPosRaw] = useState<{x: number, z: number} | null>(null);

  // Pointer moves fire far faster than the hover highlight can change. Writing a
  // fresh object on every move re-renders the entire map for an identical result,
  // so only commit when the hovered tile actually changes.
  const hoverGridPosRef = useRef<{x: number, z: number} | null>(null);
  const setHoverGridPos = useCallback((pos: {x: number, z: number} | null) => {
    const prev = hoverGridPosRef.current;
    if (pos === null) {
      if (prev === null) return;
    } else if (prev && prev.x === pos.x && prev.z === pos.z) {
      return;
    }
    hoverGridPosRef.current = pos;
    setHoverGridPosRaw(pos);
  }, []);
  // Cores, warhead stockpiles and tier progress. Only change it through the sim/economy helpers.
  const [economy, setEconomy] = useState<Economy>(createEconomy);
  const economyRef = useRef(economy);
  economyRef.current = economy;
  const teamResources = useMemo(() => ({ blue: economy.blue.cores, red: economy.red.cores }), [economy]);
  const stockpile = useMemo(() => ({ blue: economy.blue.stockpile, red: economy.red.stockpile }), [economy]);
  const [teamCompute, setTeamCompute] = useState<{blue: number, red: number}>({ blue: 0, red: 0 });

  // Cheat State
  const [cheatCompute, setCheatCompute] = useState<{blue: number, red: number}>({ blue: 0, red: 0 });
  
  const [depotMenuOpenId, setDepotMenuOpenId] = useState<string | null>(null);

  // Interaction Refs
  const didDragRef = useRef(false);

  const unitsRef = useRef(units);
  const decoysRef = useRef(decoys);
  decoysRef.current = decoys;
  const blocksRef = useRef(blocks);
  const buildingsRef = useRef(buildings);
  const cloudsRef = useRef(clouds);
  const structuresRef = useRef(structuresState);
  const selectedUnitIdsRef = useRef(selectedUnitIds);
  const flightRef = useRef(new Map<string, LiveFlight>());
  const trophyReadyRef = useRef(new Map<string, number>());
  const detonatedCrawlersRef = useRef(new Set<string>());
  const struckBombardTargetsRef = useRef(new WeakSet<object>());
  const flightIds = new Set(projectiles.map(p => p.id));
  for (const id of flightRef.current.keys()) {
      if (!flightIds.has(id)) flightRef.current.delete(id);
  }
  for (const p of projectiles) {
      if (!flightRef.current.has(p.id)) flightRef.current.set(p.id, { shot: cloneProjectile(p), impacted: false });
  }

  // Applies one tick of projectile flight (sim/projectiles.ts): impacts, Trophy
  // interceptions, clouds, orbital drops and damage. Called from the logic tick.
  const resolveFlightTick = (result: FlightTickResult, now: number) => {
      const { trophyFired, impactedIds, events } = result;
      if (trophyFired.length > 0) {
          const cooldown = ABILITY_CONFIG.GUARDIAN_TROPHY_COOLDOWN;
          setUnits(prev => prev.map(u => trophyFired.includes(u.id)
              ? { ...u, cooldowns: { ...u.cooldowns, trophySystem: cooldown } }
              : u));
      }
      if (impactedIds.length === 0) return;

      const drop = new Set(impactedIds);
      setProjectiles(prev => prev.filter(p => !drop.has(p.id)));

      const explosions: Explosion[] = [];
      const damages: Extract<FlightEvent, { kind: 'damage' }>[] = [];
      const poppedDecoys: string[] = [];
      for (const event of events) {
          if (event.kind === 'explosion') {
              explosions.push({
                  id: `exp-${now}-${Math.random()}`,
                  position: event.position,
                  radius: event.radius,
                  duration: event.duration,
                  createdAt: now,
              });
          } else if (event.kind === 'damage') {
              damages.push(event);
          } else if (event.kind === 'decoy') {
              poppedDecoys.push(event.id);
          } else if (event.kind === 'cloud') {
              const radius = event.cloudType === 'nano' ? ABILITY_CONFIG.NANO_CLOUD_RADIUS : ABILITY_CONFIG.ECLIPSE_RADIUS;
              const duration = event.cloudType === 'nano' ? ABILITY_CONFIG.NANO_CLOUD_DURATION : ABILITY_CONFIG.ECLIPSE_DURATION;
              setClouds(prev => [...prev, {
                  id: `cloud-${now}-${Math.random()}`,
                  type: event.cloudType,
                  gridPos: {
                      x: Math.round((event.position.x + offset) / CITY_CONFIG.tileSize),
                      z: Math.round((event.position.z + offset) / CITY_CONFIG.tileSize),
                  },
                  radius,
                  duration,
                  createdAt: now,
                  team: event.team,
              }]);
          } else if (event.kind === 'titan') {
              const targetPos = event.position;
              const team = event.team;
              setTimeout(() => {
                  const gridX = Math.round((targetPos.x + offset) / tileSize);
                  const gridZ = Math.round((targetPos.z + offset) / tileSize);
                  setUnits(prev => [...prev, {
                      id: `titan-${Date.now()}`,
                      type: 'titan_dropped',
                      unitClass: 'armor',
                      team,
                      gridPos: { x: gridX, z: gridZ },
                      path: [],
                      visionRange: UNIT_STATS.tank.visionRange,
                      health: UNIT_STATS.tank.maxHealth * 1.5,
                      maxHealth: UNIT_STATS.tank.maxHealth * 1.5,
                      battery: 100,
                      maxBattery: 100,
                      cooldowns: {},
                      charges: { smoke: 3, aps: 2 },
                  }]);
              }, 200);
          }
      }
      if (explosions.length > 0) setExplosions(prev => [...prev, ...explosions]);
      if (poppedDecoys.length > 0) {
          const gone = new Set(poppedDecoys);
          setDecoys(prev => prev.filter(d => !gone.has(d.id)));
      }
      if (damages.length > 0) {
          // Shots never hurt a cloaked Ghost; the projections around it take the hit instead.
          setUnits(prev => applyDamage(prev, blastDamage(prev, damages, tileSize, offset, { hitsCloaked: false })));
      }
  };

  useEffect(() => { unitsRef.current = units; }, [units]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { cloudsRef.current = clouds; }, [clouds]);
  useEffect(() => { structuresRef.current = structuresState; }, [structuresState]);
  useEffect(() => { selectedUnitIdsRef.current = selectedUnitIds; }, [selectedUnitIds]);

  // Expose Cheats
  useEffect(() => {
    (window as any).GAME_CHEATS = {
      setResources: (team: 'blue' | 'red', amount: number) => {
        setEconomy(prev => setCores(prev, team, amount));
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
            const realUnits = unitsRef.current;
            
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

            const now = Date.now();
            const missiles: MinimapMissile[] = [];
            for (const live of flightRef.current.values()) {
                const shot = live.shot;
                if (live.impacted || shot.trajectory !== 'ballistic' || !shot.startPos || !shot.targetPos) continue;
                const pose = sampleBallistic(shot, now);
                missiles.push({
                    id: shot.id,
                    team: shot.team,
                    x: (pose.x + offset) / tileSize,
                    z: (pose.z + offset) / tileSize,
                    targetX: (shot.targetPos.x + offset) / tileSize,
                    targetZ: (shot.targetPos.z + offset) / tileSize,
                });
            }

            onMinimapUpdate({ 
                units: [...realUnits, ...fakeUnits], 
                buildings: buildingsRef.current,
                structures: [staticBaseBlue, staticBaseRed, ...structuresRef.current],
                selectedUnitIds: Array.from(selectedUnitIdsRef.current),
                missiles,
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
          pointerStartRef.current = e.point.clone();
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

      const button = e.button ?? e.nativeEvent?.button ?? 0;
      if (button === 0 && placementModeRef.current && e.point) {
          const start = pointerStartRef.current;
          const draggedFar = !!start && start.distanceTo(e.point) > tileSize;
          didDragRef.current = false;
          setDragSelection(prev => prev ? { ...prev, active: false } : prev);
          if (!draggedFar) {
              const gx = Math.round((e.point.x + offset) / tileSize);
              const gz = Math.round((e.point.z + offset) / tileSize);
              commitPlacement(gx, gz);
          }
          return;
      }

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

  // Guard positions stay hidden per team until one of that team's units walks into vision.
  const knownGuardsRef = useRef<{ blue: Set<string>; red: Set<string> }>({ blue: new Set(), red: new Set() });

  const visibleUnitIds = useMemo(() => {
    const visible = new Set<string>();
    const teamKey = playerTeam === 'blue' || playerTeam === 'red' ? playerTeam : null;
    units.forEach(u => {
        if (u.team === playerTeam) { visible.add(u.id); return; }
        // Phantom Decoy cloaks the real Ghost from the other team entirely.
        if (u.decoyActive) return;
        if (u.type === 'defense_drone' && teamKey && knownGuardsRef.current[teamKey].has(u.id)) {
            visible.add(u.id);
            return;
        }
        const friendlies = units.filter(f => f.team === playerTeam);
        const inHE = clouds.some(c => c.type === 'he' && Math.sqrt(Math.pow(u.gridPos.x - c.gridPos.x, 2) + Math.pow(u.gridPos.z - c.gridPos.z, 2)) <= c.radius);
        if (inHE) return; 
        if (u.smoke?.active) {
            const isAdjacent = friendlies.some(f => Math.abs(u.gridPos.x - f.gridPos.x) <= 1 && Math.abs(u.gridPos.z - f.gridPos.z) <= 1);
            if (!isAdjacent) return;
        }
        const isDetected = friendlies.some(f => {
            const fInHE = clouds.some(c => c.type === 'he' && Math.sqrt(Math.pow(f.gridPos.x - c.gridPos.x, 2) + Math.pow(f.gridPos.z - c.gridPos.z, 2)) <= c.radius);
            if (fInHE) return false;
            const dist = Math.sqrt(Math.pow(u.gridPos.x - f.gridPos.x, 2) + Math.pow(u.gridPos.z - f.gridPos.z, 2));
            return dist <= f.visionRange;
        });
        if (isDetected) {
            visible.add(u.id);
            if (u.type === 'defense_drone' && teamKey) knownGuardsRef.current[teamKey].add(u.id);
        }
    });
    return visible;
  }, [units, playerTeam, clouds]);


  const breachedTiles = useMemo(() => {
    const groups = new Map<string, { alive: number; tiles: number[] }>();
    buildings.forEach(b => {
      const key = `${Math.floor(b.gridX / 6)},${Math.floor(b.gridZ / 6)}`;
      const group = groups.get(key) || { alive: 0, tiles: [] };
      group.tiles.push((b.gridX << 16) | b.gridZ);
      if (!b.destroyed) group.alive += 1;
      groups.set(key, group);
    });
    const open = new Set<number>();
    groups.forEach(group => {
      if (group.alive === 0) group.tiles.forEach(tile => open.add(tile));
    });
    return open;
  }, [buildings]);

  const dynamicRoadTileSet = useMemo(() => {
    const set = new Set<number>();
    roadTiles.forEach(t => { set.add((t.x << 16) | t.z); });
    // A city block becomes a lane only after every building in that block is gone.
    breachedTiles.forEach(tile => set.add(tile));
    // A structure owns its whole tile. Walls, turrets, and sites under construction
    // are solid blocks: friendly and enemy pathing both have to go around them.
    structuresState.forEach(s => { set.delete((s.gridPos.x << 16) | s.gridPos.z); });
    set.delete((baseA_Coord.x << 16) | baseA_Coord.z);
    set.delete((baseB_Coord.x << 16) | baseB_Coord.z);
    return set;
  }, [roadTiles, structuresState, baseA_Coord, baseB_Coord, breachedTiles]);

  const structureTileSet = useMemo(() => {
    const set = new Set<string>();
    structuresState.forEach(s => set.add(`${s.gridPos.x},${s.gridPos.z}`));
    return set;
  }, [structuresState]);

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
                  if (dynamicRoadTileSet.has(nId) && !visited.has(nId)) {
                      visited.add(nId);
                      queue.push({ x: n.x, z: n.z, path: [...current.path, `${n.x},${n.z}`] });
                  }
              }
          }
      }
      return [];
  }, [gridSize, dynamicRoadTileSet]);

  const findAirPath = useCallback((start: {x: number, z: number}, end: {x: number, z: number}) => {
      const startId = (start.x << 16) | start.z;
      const endId = (end.x << 16) | end.z;
      const queue = [{x: start.x, z: start.z, path: [] as string[]}];
      const visited = new Set<number>();
      visited.add(startId);
      const MAX_SEARCH = 20000;
      let ops = 0;
      while (queue.length > 0 && ops < MAX_SEARCH) {
          ops++;
          const current = queue.shift()!;
          const currentId = (current.x << 16) | current.z;
          if (currentId === endId) return current.path;
          const neighbors = [{x: current.x+1, z: current.z}, {x: current.x-1, z: current.z}, {x: current.x, z: current.z+1}, {x: current.x, z: current.z-1}];
          for (const n of neighbors) {
              if (n.x < 0 || n.z < 0 || n.x >= gridSize || n.z >= gridSize) continue;
              const nId = (n.x << 16) | n.z;
              if (visited.has(nId)) continue;
              visited.add(nId);
              queue.push({ x: n.x, z: n.z, path: [...current.path, `${n.x},${n.z}`] });
          }
      }
      return [];
  }, [gridSize]);

  const isWalkable = useCallback((x: number, z: number) => (
      x >= 0 && x < gridSize && z >= 0 && z < gridSize && dynamicRoadTileSet.has((x << 16) | z)
  ), [gridSize, dynamicRoadTileSet]);

  // Nearest usable tile touching `center`, for drones emerging directly from a host.
  const findAdjacentSpawn = useCallback((center: {x: number, z: number}) => {
      const neighbors = [
          {x: center.x+1, z: center.z}, {x: center.x-1, z: center.z},
          {x: center.x, z: center.z+1}, {x: center.x, z: center.z-1},
          {x: center.x+1, z: center.z+1}, {x: center.x-1, z: center.z-1},
          {x: center.x+1, z: center.z-1}, {x: center.x-1, z: center.z+1}
      ];
      for (const n of neighbors) {
          if (isWalkable(n.x, n.z)) return n;
      }
      return { ...center };
  }, [isWalkable]);

  const rerouteAroundBlocks = useCallback((from: {x: number, z: number}, path: string[]) => {
      if (path.length === 0) return [] as string[];
      const [gx, gz] = path[path.length - 1].split(',').map(Number);
      if (!isWalkable(gx, gz)) return [] as string[];
      return findPath(from, { x: gx, z: gz });
  }, [findPath, isWalkable]);

  // Read by the logic tick, which only captures its closure once.
  const movementEnvRef = useRef<MovementEnv | null>(null);
  movementEnvRef.current = {
      tileSize,
      tileTypeOf: key => tileTypeMap[key],
      arrive: <T extends Mover>(u: T) => arriveAtNextTile(u, { isWalkable, reroute: rerouteAroundBlocks, now: Date.now() }),
  };

  // A wall placed on an existing route pulls that unit off the tile and sends them around it.
  useEffect(() => {
      const settle = <T extends { gridPos: { x: number, z: number }, path?: string[] }>(entity: T): T | null => {
          const path = entity.path ?? [];
          const onBlock = structureTileSet.has(`${entity.gridPos.x},${entity.gridPos.z}`);
          const pathBlocked = path.some(step => {
              const [x, z] = step.split(',').map(Number);
              return structureTileSet.has(step) || !isWalkable(x, z);
          });
          if (!onBlock && !pathBlocked) return null;
          let gridPos = entity.gridPos;
          if (onBlock) {
              const spot = findAdjacentSpawn(entity.gridPos);
              if (isWalkable(spot.x, spot.z)) gridPos = spot;
          }
          const nextPath = rerouteAroundBlocks(gridPos, path);
          return { ...entity, gridPos, path: nextPath };
      };
      setUnits(prev => {
          let changed = false;
          const next = prev.map(u => {
              // The bombardment drone hovers, so building tiles are a valid route.
              if (u.type === 'bombard') return u;
              const settled = settle(u);
              if (!settled) return u;
              changed = true;
              return settled;
          });
          return changed ? next : prev;
      });
      setDecoys(prev => {
          let changed = false;
          const next = prev.map(d => {
              const settled = settle(d);
              if (!settled) return d;
              changed = true;
              return settled;
          });
          return changed ? next : prev;
      });
  }, [dynamicRoadTileSet, structureTileSet, isWalkable, findAdjacentSpawn, rerouteAroundBlocks]);

  // Somewhere out in the host's detection radius, so periodically produced drones
  // fan out across the perimeter instead of piling up against the host.
  const findScatteredSpawn = useCallback((center: {x: number, z: number}) => {
      const radius = ABILITY_CONFIG.CRAWLER_RADIUS;
      const inner = ABILITY_CONFIG.CRAWLER_SPAWN_INNER;
      for (let attempt = 0; attempt < 40; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = radius * (inner + Math.random() * (1 - inner));
          const x = Math.round(center.x + Math.cos(angle) * dist);
          const z = Math.round(center.z + Math.sin(angle) * dist);
          if (isWalkable(x, z)) return { x, z };
      }
      return findAdjacentSpawn(center);
  }, [isWalkable, findAdjacentSpawn]);

  const createCrawler = useCallback((host: UnitData, gridPos: {x: number, z: number}, suffix: string | number): UnitData => ({
      id: `crawler-${host.id}-${Date.now()}-${suffix}`,
      type: 'crawler_drone',
      unitClass: 'ordnance',
      team: host.team,
      gridPos,
      path: [],
      visionRange: UNIT_STATS.crawler_drone.visionRange,
      health: UNIT_STATS.crawler_drone.maxHealth,
      maxHealth: UNIT_STATS.crawler_drone.maxHealth,
      battery: 100,
      maxBattery: 100,
      cooldowns: {},
      parentId: host.id,
      crawlerTargetId: null
  }), []);

  // The simulation tick below must NOT list these as effect dependencies. Several of
  // them (dynamicRoadTileSet, and therefore findPath) get a fresh identity on almost
  // every render, which used to tear down and rebuild the 1s interval ~4x a second so
  // its callback never once fired. Reading them through a ref keeps the interval alive.
  const aiHelpersRef = useRef({ findPath, findScatteredSpawn, isWalkable, doctrines });
  aiHelpersRef.current = { findPath, findScatteredSpawn, isWalkable, doctrines };

  // Doctrine Effects Processor
  useEffect(() => {
      if (pendingDoctrineAction) {
          const { type, target, team } = pendingDoctrineAction;

          // Pay here, against the live economy, so a power the team can no longer afford never fires.
          const power = /^(HEAVY_METAL|SHADOW_OPS|SKUNKWORKS)_TIER([23])$/.exec(type);
          const cost = power ? doctrinePowerCost(power[1].toLowerCase() as DoctrineType, Number(power[2]) as 2 | 3) : NaN;
          if (!canAfford(economyRef.current, team, cost)) {
              if (onActionComplete) onActionComplete();
              return;
          }
          setEconomy(prev => spend(prev, team, cost) ?? prev);

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
                  cooldowns: { spawnCrawler: 0 }
              }]);
          }

          if (onActionComplete) onActionComplete();
      }
  }, [pendingDoctrineAction, tileSize, offset, onActionComplete]);

  // Doctrine Passive Loop + Swarm AI
  useEffect(() => {
      const interval = setInterval(() => {
          const { findPath, findScatteredSpawn, isWalkable, doctrines } = aiHelpersRef.current;
          setUnits(prevUnits => {
              let unitsChanged = false;
              let nextUnits = [...prevUnits];

              // 1. Swarm Host Spawning Logic
              // An unanchored host is inert; anchoring releases its opening pair (handled
              // in TOGGLE_ANCHOR) and then tops the swarm up on an interval from here.
              const hosts = nextUnits.filter(u => u.type === 'swarm_host');
              const hostMap = new Map<string, UnitData>();

              hosts.forEach(host => {
                  hostMap.set(host.id, host);
                  if (!host.isAnchored) return;

                  const children = nextUnits.filter(u => u.type === 'crawler_drone' && u.parentId === host.id);
                  const spawnReady = !host.cooldowns.spawnCrawler || host.cooldowns.spawnCrawler <= 0;

                  if (children.length < ABILITY_CONFIG.SWARM_HOST_MAX_DRONES && spawnReady) {
                      nextUnits.push(createCrawler(host, findScatteredSpawn(host.gridPos), children.length));

                      const hIdx = nextUnits.findIndex(u => u.id === host.id);
                      if (hIdx !== -1) {
                          nextUnits[hIdx] = {
                              ...nextUnits[hIdx],
                              cooldowns: { ...nextUnits[hIdx].cooldowns, spawnCrawler: ABILITY_CONFIG.SWARM_HOST_SPAWN_INTERVAL }
                          };
                      }
                      unitsChanged = true;
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
                      const range = ABILITY_CONFIG.CRAWLER_RADIUS;

                      if (!parent) {
                          keepUnit = false; // Parent gone
                          uChanged = true;
                      } else if (!parent.isAnchored) {
                          // RECALL: the host has packed up, so fold the swarm back inside.
                          const dist = Math.hypot(u.gridPos.x - parent.gridPos.x, u.gridPos.z - parent.gridPos.z);
                          if (dist <= ABILITY_CONFIG.CRAWLER_RECALL_DISTANCE) {
                              keepUnit = false; // Absorbed back into the host
                              uChanged = true;
                          } else {
                              // Re-path whenever the host is no longer our destination, which
                              // also covers an unanchored host being driven somewhere else.
                              const targetKey = `${parent.gridPos.x},${parent.gridPos.z}`;
                              const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;

                              if (currentDest !== targetKey) {
                                  const path = findPath(u.gridPos, parent.gridPos);
                                  modifiedUnit = { ...u, path, crawlerTargetId: null };
                                  uChanged = true;
                              }
                          }
                      } else {
                          // HUNT / PATROL (host anchored).
                          //
                          // Target selection runs every tick rather than only when idle, so a
                          // crawler mid-patrol breaks off the instant something enters the
                          // host's radius. Every crawler measures range from the host and picks
                          // the same nearest enemy, so the whole swarm converges on one target.
                          let target: UnitData | null = null;
                          let bestDist = Infinity;
                          nextUnits.forEach(e => {
                              if (e.team === u.team || e.team === 'neutral') return;
                              if (e.health <= 0 || e.isStealthed) return;
                              const d = Math.hypot(e.gridPos.x - parent.gridPos.x, e.gridPos.z - parent.gridPos.z);
                              if (d <= range && d < bestDist) { bestDist = d; target = e; }
                          });

                          if (target) {
                              // Keep re-pathing while it lives so a fleeing enemy stays hunted.
                              const targetKey = `${target.gridPos.x},${target.gridPos.z}`;
                              const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;

                              if (currentDest !== targetKey) {
                                  const path = findPath(u.gridPos, target.gridPos);
                                  if (path.length > 0) {
                                      modifiedUnit = { ...u, path, crawlerTargetId: target.id };
                                      uChanged = true;
                                  }
                              } else if (u.crawlerTargetId !== target.id) {
                                  modifiedUnit = { ...u, crawlerTargetId: target.id };
                                  uChanged = true;
                              }
                          } else if (u.crawlerTargetId) {
                              // Prey died or left the radius: drop the chase and resume patrol.
                              modifiedUnit = { ...u, path: [], crawlerTargetId: null };
                              uChanged = true;
                          } else if (u.path.length === 0) {
                              // Idle patrol sweep somewhere inside the host's radius.
                              let patrolPos: {x: number, z: number} | null = null;
                              for (let i = 0; i < 15; i++) {
                                  const angle = Math.random() * Math.PI * 2;
                                  const d = range * (0.2 + Math.random() * 0.8);
                                  const rx = Math.round(parent.gridPos.x + Math.cos(angle) * d);
                                  const rz = Math.round(parent.gridPos.z + Math.sin(angle) * d);
                                  if (isWalkable(rx, rz)) { patrolPos = { x: rx, z: rz }; break; }
                              }

                              if (patrolPos) {
                                  const path = findPath(u.gridPos, patrolPos);
                                  if (path.length > 0) {
                                      modifiedUnit = { ...u, path };
                                      uChanged = true;
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
  }, []);

  const handleUnitSelect = (id: string) => {
      // If we just dragged, ignore click logic that might fire
      if (didDragRef.current) return;
      if (interactionMode === 'target') return; // Selection disabled in target mode

      if (targetingSourceId && targetingAbility === 'TETHER') {
          const source = unitsRef.current.find(u => u.id === targetingSourceId);
          const target = unitsRef.current.find(u => u.id === id);
          if (source && target && isTetherableDrone(target) && target.team === source.team && target.id !== source.id) {
              const dist = Math.hypot(source.gridPos.x - target.gridPos.x, source.gridPos.z - target.gridPos.z);
              if (dist <= ABILITY_CONFIG.BANSHEE_TETHER_RANGE) {
                  setUnits(prev => prev.map(u => {
                      if (u.id === targetingSourceId) return { ...u, tetherTargetId: id };
                      // One hardline per drone — drop any other Banshee already locked to it
                      if (u.tetherTargetId === id && u.id !== targetingSourceId) return { ...u, tetherTargetId: null };
                      return u;
                  }));
                  setTargetingSourceId(null);
                  setTargetingAbility(null);
              }
          }
          return;
      }
      if (targetingSourceId && targetingAbility === 'BATTERY_TETHER') {
          const source = unitsRef.current.find(u => u.id === targetingSourceId);
          const target = unitsRef.current.find(u => u.id === id);
          if (source && source.type === 'sun_plate' && source.isDeployed && target && isBatteryLinkable(target) && target.team === source.team) {
              const dist = Math.hypot(source.gridPos.x - target.gridPos.x, source.gridPos.z - target.gridPos.z);
              if (dist <= ABILITY_CONFIG.BATTERY_MULE_RANGE) {
                  setUnits(prev => {
                      const sourceLinks = prev.find(u => u.id === source.id)?.batteryTetherIds || [];
                      const removing = sourceLinks.includes(target.id);
                      const adding = !removing && sourceLinks.length < ABILITY_CONFIG.BATTERY_MULE_SLOTS;
                      return prev.map(u => {
                          if (u.id === source.id) {
                              if (removing) return { ...u, batteryTetherIds: sourceLinks.filter(linkId => linkId !== target.id) };
                              if (!adding) return u;
                              return { ...u, batteryTetherIds: [...sourceLinks, target.id] };
                          }
                          if (adding && u.batteryTetherIds?.includes(target.id)) {
                              return { ...u, batteryTetherIds: u.batteryTetherIds.filter(linkId => linkId !== target.id) };
                          }
                          return u;
                      });
                  });
              }
          }
          return;
      } else if (targetingSourceId && targetingAbility === 'CANNON') {
          const targetUnit = units.find(u => u.id === id);
          if(targetUnit) handleTileClick(targetUnit.gridPos.x, targetUnit.gridPos.z);
      } else {
          // Standard Single Selection - replaces existing group selection
          setSelectedUnitIds(new Set([id]));
      }
  };

  const checkIsValidPlacement = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= gridSize || z >= gridSize) return false;
      if (Math.abs(x - baseA_Coord.x) <= 1 && Math.abs(z - baseA_Coord.z) <= 1) return false;
      if (Math.abs(x - baseB_Coord.x) <= 1 && Math.abs(z - baseB_Coord.z) <= 1) return false;
      if (structuresState.some(s => s.gridPos.x === x && s.gridPos.z === z)) return false;
      if (buildings.some(b => b.gridX === x && b.gridZ === z)) return false;
      // The structure occupies its own tile, so the Mason needs a road beside it.
      const beside = [
          {x: x + 1, z}, {x: x - 1, z}, {x, z: z + 1}, {x, z: z - 1},
          {x: x + 1, z: z + 1}, {x: x - 1, z: z - 1}, {x: x + 1, z: z - 1}, {x: x - 1, z: z + 1},
      ];
      return beside.some(n => isWalkable(n.x, n.z));
  };

  const findPlacementSpot = (x: number, z: number) => {
      if (checkIsValidPlacement(x, z)) return { x, z };
      let best: { x: number, z: number } | null = null;
      let bestDist = 99;
      for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dz === 0) continue;
              const dist = Math.hypot(dx, dz);
              if (dist >= bestDist) continue;
              if (!checkIsValidPlacement(x + dx, z + dz)) continue;
              bestDist = dist;
              best = { x: x + dx, z: z + dz };
          }
      }
      return best;
  };

  const commitPlacement = (x: number, z: number) => {
      const mode = placementModeRef.current;
      if (!mode) return;
      const spot = findPlacementSpot(x, z);
      if (!spot || !canAfford(economyRef.current, playerTeam, mode.cost)) return;
      placementModeRef.current = null;
      setPlacementMode(null);
      setDepotMenuOpenId(null);
      setEconomy(prev => spend(prev, playerTeam, mode.cost) ?? prev);
      const isWallOrTurret = mode.type === 'wall_tier1' || mode.type === 'wall_tier2' || mode.type === 'defense';
      const blueprintId = `struct-${Date.now()}`;
      const blueprint: StructureData = {
          id: blueprintId,
          type: mode.type,
          team: playerTeam,
          gridPos: spot,
          isBlueprint: isWallOrTurret,
          constructionProgress: 0,
          maxProgress: STRUCTURE_INFO[mode.type].maxProgress || 100,
          health: STRUCTURE_INFO[mode.type].maxHealth,
          maxHealth: STRUCTURE_INFO[mode.type].maxHealth,
      };
      const depot = structuresRef.current.find(s => s.type === 'builder' && s.team === playerTeam && !s.isBlueprint);
      setStructuresState(prev => {
          const next = [...prev, blueprint];
          structuresRef.current = next;
          return next;
      });

      if (!isWallOrTurret || !depot) return;

      setUnits(prev => {
          let changed = false;
          const next = prev.map(u => {
              if (u.type !== 'mason' || u.team !== playerTeam || u.health <= 0) return u;
              let cargo = u.cargo || 0;
              let goal = spot;
              let constructionTargetId: string | null = blueprintId;
              if (cargo <= 0) {
                  const atDepot = Math.hypot(u.gridPos.x - depot.gridPos.x, u.gridPos.z - depot.gridPos.z) < ABILITY_CONFIG.MASON_SITE_RANGE;
                  if (atDepot) {
                      cargo = ABILITY_CONFIG.MASON_CARGO_CAPACITY;
                  } else {
                      goal = depot.gridPos;
                      constructionTargetId = null;
                  }
              }
              if (Math.hypot(u.gridPos.x - goal.x, u.gridPos.z - goal.z) < ABILITY_CONFIG.MASON_SITE_RANGE) {
                  if (cargo !== (u.cargo || 0) || u.constructionTargetId !== constructionTargetId) {
                      changed = true;
                      return { ...u, cargo, constructionTargetId, path: [] };
                  }
                  return u;
              }
              const beside = [
                  {x: goal.x + 1, z: goal.z}, {x: goal.x - 1, z: goal.z},
                  {x: goal.x, z: goal.z + 1}, {x: goal.x, z: goal.z - 1},
                  {x: goal.x + 1, z: goal.z + 1}, {x: goal.x - 1, z: goal.z - 1},
                  {x: goal.x + 1, z: goal.z - 1}, {x: goal.x - 1, z: goal.z + 1},
              ].filter(n => isWalkable(n.x, n.z) && !(n.x === spot.x && n.z === spot.z))
               .sort((a, b) => Math.hypot(u.gridPos.x - a.x, u.gridPos.z - a.z) - Math.hypot(u.gridPos.x - b.x, u.gridPos.z - b.z));
              for (const n of beside) {
                  const path = findPath(u.gridPos, n);
                  if (path.length > 0) {
                      changed = true;
                      return { ...u, cargo, path, constructionTargetId };
                  }
              }
              return u;
          });
          return changed ? next : prev;
      });
  };

  const handleTileClick = (x: number, z: number) => {
      if (placementModeRef.current) {
          commitPlacement(x, z);
          return;
      }
      // If we just dragged, ignore click events generated
      if (didDragRef.current) return;

      if (interactionMode === 'target' && onMapTarget) {
          onMapTarget({ x, z });
          return;
      }

      if (targetingSourceId && targetingAbility === 'SURVEILLANCE') {
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
      } else if (targetingSourceId && targetingAbility === 'BOMBARD') {
          const unit = unitsRef.current.find(u => u.id === targetingSourceId);
          if (unit && unit.type === 'bombard' && unit.health > 0) {
              const alreadyThere = unit.gridPos.x === x && unit.gridPos.z === z;
              const path = alreadyThere ? [] : findAirPath(unit.gridPos, { x, z });
              if (alreadyThere || path.length > 0) {
                  setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, path, bombardmentTarget: { x, z } } : u));
              }
          }
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (targetingSourceId && (targetingAbility === 'TETHER' || targetingAbility === 'BATTERY_TETHER')) {
          // Tethers target a unit, not a tile — keep targeting until a vehicle is clicked or cancelled.
          return;
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
          const unitsToMove = units.filter(u => selectedUnitIds.has(u.id) && u.team === playerTeam && !(u.type === 'sun_plate' && u.isDeployed));
          
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
                  if (u.type === 'bombard') {
                      if (x >= 0 && z >= 0 && x < gridSize && z < gridSize) {
                          assignments.set(u.id, { x, z });
                      }
                      return;
                  }
                  let dest = findFreeTile(x, z);
                  const tetherHost = unitsRef.current.find(src => src.tetherTargetId === u.id);
                  if (dest && tetherHost) {
                      const leash = Math.hypot(dest.x - tetherHost.gridPos.x, dest.z - tetherHost.gridPos.z);
                      if (leash > ABILITY_CONFIG.BANSHEE_TETHER_RANGE) {
                          const dx = dest.x - tetherHost.gridPos.x;
                          const dz = dest.z - tetherHost.gridPos.z;
                          const scale = ABILITY_CONFIG.BANSHEE_TETHER_RANGE / leash;
                          dest = findFreeTile(
                              Math.round(tetherHost.gridPos.x + dx * scale),
                              Math.round(tetherHost.gridPos.z + dz * scale)
                          );
                      }
                  }
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
                      if (u.type === 'bombard') {
                          const sameTile = u.gridPos.x === dest.x && u.gridPos.z === dest.z;
                          const path = sameTile ? [] : findAirPath(u.gridPos, dest);
                          if (sameTile || path.length > 0) return { ...u, path, bombardmentTarget: null };
                          return u;
                      }
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

  const handleBuild = (type: StructureType) => { const cost = structureCost(type); if (canAfford(economy, playerTeam, cost)) { setPlacementMode({ type, cost }); setBaseMenuOpen(null); } };
  
  const handleUnitAction = (unitId: string, action: string) => {
      console.log("handleUnitAction called", unitId, action);
      const unit = unitsRef.current.find(u => u.id === unitId);
      if (!unit) return;
      
      // Ballista Load Logic (Inventory -> Armed)
      if (action.startsWith('LOAD_AMMO_')) {
          const type = action.replace('LOAD_AMMO_', '').toLowerCase() as 'eclipse' | 'he';
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

      const besideOrdnanceFab = (at: UnitData) => structuresRef.current.some(s =>
          s.type === 'ordnance_fab' && s.team === at.team && !s.isBlueprint &&
          Math.hypot(s.gridPos.x - at.gridPos.x, s.gridPos.z - at.gridPos.z) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE
      );

      // Field Fabricator turns one onboard material charge into a missile of the chosen type.
      if (action === 'FABRICATE_ECLIPSE' || action === 'FABRICATE_HE') {
          if (unit.type !== 'mule' || unit.fabrication?.active) return;
          const item = action === 'FABRICATE_ECLIPSE' ? 'eclipse' : 'he';
          const material = unit.ordnanceMaterial || 0;
          const teamKey = unit.team === 'blue' || unit.team === 'red' ? unit.team : null;
          if (!teamKey || material <= 0) return;
          const cost = warheadCost(item);
          if (!canAfford(economy, teamKey, cost)) return;
          setEconomy(prev => spend(prev, teamKey, cost) ?? prev);
          setUnits(prev => prev.map(u => u.id === unit.id ? {
              ...u,
              fabrication: { active: true, item, progress: 0, totalTime: ABILITY_CONFIG.FABRICATOR_BUILD_TIME }
          } : u));
          return;
      }

      if (action === 'RESUPPLY_MATERIAL') {
          if (unit.type !== 'mule' || !besideOrdnanceFab(unit)) return;
          const held = (unit.missileInventory?.eclipse || 0) + (unit.missileInventory?.he || 0);
          const room = ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY - held;
          if (room <= 0 || (unit.ordnanceMaterial || 0) >= room) return;
          setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, ordnanceMaterial: room } : u));
          return;
      }

      if (action === 'TRANSFER_ECLIPSE' || action === 'TRANSFER_HE') {
          if (unit.type !== 'mule') return;
          const item = action === 'TRANSFER_ECLIPSE' ? 'eclipse' : 'he';
          const have = unit.missileInventory?.[item] || 0;
          if (have <= 0) return;
          let nearest: UnitData | null = null;
          let minD = ABILITY_CONFIG.FABRICATOR_DOCK_RANGE;
          unitsRef.current.forEach(b => {
              if (b.type !== 'ballista' || b.team !== unit.team || b.health <= 0) return;
              const d = Math.hypot(b.gridPos.x - unit.gridPos.x, b.gridPos.z - unit.gridPos.z);
              if (d < minD) { minD = d; nearest = b; }
          });
          if (!nearest) return;
          const target = nearest as UnitData;
          setUnits(prev => prev.map(u => {
              if (u.id === unit.id) {
                  const inv = { eclipse: u.missileInventory?.eclipse || 0, he: u.missileInventory?.he || 0 };
                  inv[item] -= 1;
                  return { ...u, missileInventory: inv };
              }
              if (u.id === target.id) {
                  const inv = { eclipse: u.missileInventory?.eclipse || 0, he: u.missileInventory?.he || 0 };
                  inv[item] += 1;
                  return { ...u, missileInventory: inv };
              }
              return u;
          }));
          return;
      }

      // Ballista parked beside its Ordnance Fab draws a finished missile from the stockpile.
      if (action === 'TAKE_ECLIPSE' || action === 'TAKE_HE') {
          if (unit.type !== 'ballista' || !besideOrdnanceFab(unit)) return;
          const item = action === 'TAKE_ECLIPSE' ? 'eclipse' : 'he';
          const teamKey = unit.team === 'blue' || unit.team === 'red' ? unit.team : null;
          if (!teamKey || !takeWarhead(economy, teamKey, item)) return;
          setEconomy(prev => takeWarhead(prev, teamKey, item) ?? prev);
          setUnits(prev => prev.map(u => {
              if (u.id !== unit.id) return u;
              const inv = { eclipse: u.missileInventory?.eclipse || 0, he: u.missileInventory?.he || 0 };
              inv[item] += 1;
              return { ...u, missileInventory: inv };
          }));
          return;
      }

      if (action === 'HARDLINE_TETHER') {
          if (targetingSourceId === unitId && targetingAbility === 'TETHER') {
              setTargetingSourceId(null);
              setTargetingAbility(null);
          } else {
              setTargetingSourceId(unitId);
              setTargetingAbility('TETHER');
          }
          return;
      }
      if (action === 'DISCONNECT_TETHER') {
          setUnits(prev => prev.map(u => u.id === unitId ? { ...u, tetherTargetId: null } : u));
          setTargetingSourceId(null);
          setTargetingAbility(null);
          return;
      }
      if (action === 'BATTERY_TETHER') {
          const mule = unitsRef.current.find(u => u.id === unitId);
          if (!mule || mule.type !== 'sun_plate' || !mule.isDeployed) return;
          if (targetingSourceId === unitId && targetingAbility === 'BATTERY_TETHER') {
              setTargetingSourceId(null);
              setTargetingAbility(null);
          } else {
              setTargetingSourceId(unitId);
              setTargetingAbility('BATTERY_TETHER');
          }
          return;
      }
      if (action === 'DISCONNECT_BATTERY') {
          setUnits(prev => prev.map(u => u.id === unitId ? { ...u, batteryTetherIds: [] } : u));
          setTargetingSourceId(null);
          setTargetingAbility(null);
          return;
      }
      if (action === 'CANNON ATTACK') {
          setTargetingSourceId(unitId);
          setTargetingAbility('CANNON');
          return;
      }
      if (action === 'LOITERING SURVEILLANCE') {
          setTargetingSourceId(unitId);
          setTargetingAbility('SURVEILLANCE');
          return;
      }
      // Replaces FIRE_BALLISTA direct execution with Targeting Mode
      if (action === 'FIRE_BALLISTA') {
          setTargetingSourceId(unitId);
          setTargetingAbility('MISSILE');
          return;
      }
      // Wasp Swarm Targeting
      if (action === 'FIRE_SWARM') {
          setTargetingSourceId(unitId);
          setTargetingAbility('SWARM');
          return;
      }
      if (action === 'BOMBARD' && unit.type === 'bombard') {
          setTargetingSourceId(unitId);
          setTargetingAbility('BOMBARD');
          return;
      }

      if (action === 'PHANTOM_DECOY_INIT' && unit.type === 'ghost') {
           if (unit.decoyActive) {
               setUnits(prev => prev.map(u => u.id === unitId ? { ...u, decoyActive: false, isStealthed: false } : u));
               setDecoys(prev => prev.filter(d => d.ownerId !== unitId));
               return;
           }
           if (unit.battery <= 1) return;

           const directions = [
               {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: 1}, {x: 0, z: -1},
               {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1},
           ];
           const now = Date.now();
           const origin = unit.gridPos;
           const claimed = new Set<string>([`${origin.x},${origin.z}`]);
           const spawned: DecoyData[] = [];
           for (const dir of directions) {
               if (spawned.length >= ABILITY_CONFIG.PHANTOM_DECOY_COUNT) break;
               const path: string[] = [];
               let x = origin.x;
               let z = origin.z;
               for (let step = 0; step < ABILITY_CONFIG.PHANTOM_DECOY_SCATTER; step++) {
                   const candidates = [
                       { x: x + dir.x, z: z + dir.z },
                       { x: x + Math.sign(dir.x), z },
                       { x, z: z + Math.sign(dir.z) },
                       { x: x + 1, z }, { x: x - 1, z }, { x, z: z + 1 }, { x, z: z - 1 },
                       { x: x + 1, z: z + 1 }, { x: x - 1, z: z - 1 }, { x: x + 1, z: z - 1 }, { x: x - 1, z: z + 1 },
                   ];
                   const next = candidates.find(n => {
                       const key = `${n.x},${n.z}`;
                       return !claimed.has(key) && isWalkable(n.x, n.z);
                   });
                   if (!next) break;
                   const key = `${next.x},${next.z}`;
                   claimed.add(key);
                   path.push(key);
                   x = next.x;
                   z = next.z;
               }
               if (path.length === 0) continue;
               spawned.push({
                   id: `decoy-${unitId}-${spawned.length}-${now}`,
                   team: unit.team as 'blue' | 'red',
                   gridPos: { x: origin.x, z: origin.z },
                   createdAt: now,
                   ownerId: unitId,
                   path,
               });
           }

           setDecoys(prev => [...prev.filter(d => d.ownerId !== unitId), ...spawned]);
           setUnits(prev => prev.map(u => u.id === unitId ? { ...u, decoyActive: true, decoyStartTime: now, isStealthed: true } : u));
           return;
      }

      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => {
          let newDrones: UnitData[] = [];
          const nextUnits = prev.map(u => {
              if (!selectedUnitIds.has(u.id) && u.id !== unitId) return u;
              
              if (action === 'TOGGLE_JAMMER' && u.type === 'banshee') return { ...u, jammerActive: !u.jammerActive };
              if (action === 'TOGGLE DAMPENER' && u.type === 'ghost') return { ...u, isDampenerActive: !u.isDampenerActive };
              if (action === 'TOGGLE_ANCHOR' && u.type === 'sun_plate') {
                  const anchoring = !u.isDeployed;
                  return { ...u, isDeployed: anchoring, path: [], batteryTetherIds: anchoring ? (u.batteryTetherIds || []) : [] };
              }
              if (action === 'TOGGLE_ANCHOR' && u.type === 'swarm_host') {
                  const anchoring = !u.isAnchored;
                  if (anchoring) {
                      // Opening pair emerges from the host itself; the interval spawner in the
                      // AI loop takes over from here and scatters the rest around the radius.
                      const rId = Math.floor(Math.random() * 100000);
                      for (let i = 0; i < ABILITY_CONFIG.SWARM_HOST_INITIAL_DRONES; i++) {
                          newDrones.push(createCrawler(u, findAdjacentSpawn(u.gridPos), `${rId}-${i}`));
                      }
                  }
                  return { 
                      ...u, 
                      isAnchored: anchoring, 
                      path: [],
                      anchorTime: anchoring ? Date.now() : undefined,
                      cooldowns: { ...u.cooldowns, spawnCrawler: anchoring ? ABILITY_CONFIG.SWARM_HOST_SPAWN_INTERVAL : 0 } 
                  };
              }
              if (action === 'SMOKE SCREEN' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN }, smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION } };
              if (action === 'ACTIVATE APS' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanAps: ABILITY_CONFIG.TITAN_APS_COOLDOWN }, aps: { active: true, remainingTime: ABILITY_CONFIG.TITAN_APS_DURATION } };
              return u;
          });
          return [...nextUnits, ...newDrones];
      });
  };

  // --- Depot / Mason Logic ---
  const handleStructureClick = (id: string) => {
      // If we just dragged, don't open menu
      if (didDragRef.current) return;

      const struct = structuresState.find(s => s.id === id);
      const validTypes = ['support', 'infantry', 'armor', 'ordnance', 'air', 'builder', 'ordnance_fab'];
      if (struct && validTypes.includes(struct.type) && struct.team === playerTeam && !struct.isBlueprint) {
          setDepotMenuOpenId(id);
      }
  };

  const handleStructureAction = (action: string, payload?: any) => {
      if (!depotMenuOpenId) return;
      const struct = structuresState.find(s => s.id === depotMenuOpenId);
      if (!struct) return;

      if (action === 'BUILD_WARHEAD' && struct.type === 'ordnance_fab' && !struct.isBlueprint) {
          const item = payload as 'eclipse' | 'he';
          if (item !== 'eclipse' && item !== 'he') return;
          if (struct.production?.active) return;
          const cost = warheadCost(item);
          const totalTime = warheadBuildTime(item);
          if (!canAfford(economy, playerTeam, cost)) return;
          setEconomy(prev => spend(prev, playerTeam, cost) ?? prev);
          setStructuresState(prev => prev.map(s => s.id === struct.id ? {
              ...s,
              production: { active: true, item, progress: 0, totalTime },
          } : s));
          return;
      }

      if (action === 'BUILD_UNIT') {
          const type = payload as UnitType;
          const stats = UNIT_STATS[type];
          const cost = unitCost(type);
          if (canAfford(economy, playerTeam, cost)) {
              setEconomy(prev => spend(prev, playerTeam, cost) ?? prev);
              
              // Find an adjacent valid tile for spawning
              let spawnPos = { ...struct.gridPos };
              const neighbors = [
                  {x: struct.gridPos.x + 1, z: struct.gridPos.z},
                  {x: struct.gridPos.x - 1, z: struct.gridPos.z},
                  {x: struct.gridPos.x, z: struct.gridPos.z + 1},
                  {x: struct.gridPos.x, z: struct.gridPos.z - 1}
              ];
              for (const n of neighbors) {
                  const nId = (n.x << 16) | n.z;
                  if (dynamicRoadTileSet.has(nId)) {
                      spawnPos = n;
                      break;
                  }
              }

              const newUnit: UnitData = {
                  id: `u-${Date.now()}`, type: type, unitClass: stats.unitClass, team: playerTeam as UnitData['team'], gridPos: spawnPos, path: [], visionRange: stats.visionRange, health: stats.maxHealth, maxHealth: stats.maxHealth, battery: 100, maxBattery: 100, cooldowns: {},
                  ...(type === 'mason' ? { cargo: 100 } : {}),
                  ...(type === 'banshee' ? { battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY } : {}),
                  ...(type === 'sun_plate' ? { battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, isDeployed: false, batteryTetherIds: [] as string[] } : {}),
                  ...(type === 'wasp' ? { charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES } } : {}),
                  ...(type === 'bombard' ? { battery: ABILITY_CONFIG.BOMBARD_BATTERY, maxBattery: ABILITY_CONFIG.BOMBARD_BATTERY } : {}),
                  ...(type === 'tank' ? { charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS } } : {}),
                  ...(type === 'ballista' ? { missileInventory: { eclipse: 1, he: 1 }, ammoState: 'empty' as const } : {}), // New Ballistas start with 1 of each
                  ...(type === 'mule' ? { ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { eclipse: 0, he: 0 } } : {}),
              };
              setUnits(prev => [...prev, newUnit]);
              setDepotMenuOpenId(null);
          }
      } else if (action === 'SELECT_WALL') {
          const type = payload as StructureType;
          const cost = structureCost(type);
          if (canAfford(economy, playerTeam, cost)) {
              setPlacementMode({ type, cost });
              setDepotMenuOpenId(null);
          }
      }
  };

  // Mason AI Loop — one haul per depot visit, then straight back for the next.
  useEffect(() => {
    const besideTiles = (goal: {x: number, z: number}, from: {x: number, z: number}) => ([
        {x: goal.x + 1, z: goal.z}, {x: goal.x - 1, z: goal.z},
        {x: goal.x, z: goal.z + 1}, {x: goal.x, z: goal.z - 1},
        {x: goal.x + 1, z: goal.z + 1}, {x: goal.x - 1, z: goal.z - 1},
        {x: goal.x + 1, z: goal.z - 1}, {x: goal.x - 1, z: goal.z + 1},
    ].filter(n => dynamicRoadTileSet.has((n.x << 16) | n.z))
      .sort((a, b) => Math.hypot(from.x - a.x, from.z - a.z) - Math.hypot(from.x - b.x, from.z - b.z)));

    const pathToGoal = (from: {x: number, z: number}, goal: {x: number, z: number}) => {
        if (Math.hypot(from.x - goal.x, from.z - goal.z) < ABILITY_CONFIG.MASON_SITE_RANGE) return [] as string[];
        for (const tile of besideTiles(goal, from)) {
            if (tile.x === from.x && tile.z === from.z) return [] as string[];
            const path = findPath(from, tile);
            if (path.length > 0) return path;
        }
        return [] as string[];
    };

    const droppedLoad = new Set<string>();
    const timer = setInterval(() => {
        const activeStructs = structuresRef.current;
        const deliveries: { id: string }[] = [];
        const patches = new Map<string, { cargo: number, path: string[], constructionTargetId: string | null, fromX: number, fromZ: number, pathLen: number }>();
        unitsRef.current.forEach(u => {
            if (u.type !== 'mason' || u.health <= 0) return;
            const blueprints = activeStructs.filter(s => s.isBlueprint && s.team === u.team && s.constructionProgress < s.maxProgress);
            const depot = activeStructs.find(s => s.type === 'builder' && s.team === u.team && !s.isBlueprint);
            if (!depot || blueprints.length === 0) {
                if (u.constructionTargetId) {
                    patches.set(u.id, { cargo: u.cargo || 0, path: u.path, constructionTargetId: null, fromX: u.gridPos.x, fromZ: u.gridPos.z, pathLen: u.path.length });
                }
                return;
            }
            let closest = blueprints[0];
            let minDst = Infinity;
            blueprints.forEach(bp => {
                const d = Math.hypot(u.gridPos.x - bp.gridPos.x, u.gridPos.z - bp.gridPos.z);
                if (d < minDst) { minDst = d; closest = bp; }
            });
            const carrying = (u.cargo || 0) > 0;
            const goal = carrying ? closest.gridPos : depot.gridPos;
            const atGoal = Math.hypot(u.gridPos.x - goal.x, u.gridPos.z - goal.z) < ABILITY_CONFIG.MASON_SITE_RANGE;
            let cargo = u.cargo || 0;
            let path = u.path;
            if ((u.cargo || 0) === 0) droppedLoad.delete(u.id);
            if (atGoal && carrying) {
                if (!droppedLoad.has(u.id)) {
                    droppedLoad.add(u.id);
                    deliveries.push({ id: closest.id });
                }
                cargo = 0;
                path = pathToGoal(u.gridPos, depot.gridPos);
            } else if (atGoal && !carrying) {
                cargo = ABILITY_CONFIG.MASON_CARGO_CAPACITY;
                path = pathToGoal(u.gridPos, closest.gridPos);
            } else if (path.length === 0) {
                path = pathToGoal(u.gridPos, goal);
            }
            if (cargo !== (u.cargo || 0) || path !== u.path || u.constructionTargetId !== closest.id) {
                patches.set(u.id, { cargo, path, constructionTargetId: closest.id, fromX: u.gridPos.x, fromZ: u.gridPos.z, pathLen: u.path.length });
            }
        });
        if (patches.size > 0) {
            setUnits(prev => {
                let changed = false;
                const next = prev.map(u => {
                    const patch = patches.get(u.id);
                    if (!patch) return u;
                    if (u.gridPos.x !== patch.fromX || u.gridPos.z !== patch.fromZ) return u;
                    if (u.path.length !== patch.pathLen) return u;
                    changed = true;
                    return { ...u, cargo: patch.cargo, path: patch.path, constructionTargetId: patch.constructionTargetId };
                });
                return changed ? next : prev;
            });
        }
        if (deliveries.length === 0) return;
        setStructuresState(prev => {
            let changed = false;
            const counts = new Map<string, number>();
            deliveries.forEach(d => counts.set(d.id, (counts.get(d.id) || 0) + 1));
            const next = prev.map(s => {
                const hauls = counts.get(s.id) || 0;
                if (!hauls || !s.isBlueprint) return s;
                const constructionProgress = Math.min(s.maxProgress, s.constructionProgress + hauls * ABILITY_CONFIG.MASON_BUILD_AMOUNT);
                if (constructionProgress === s.constructionProgress) return s;
                changed = true;
                return { ...s, constructionProgress, isBlueprint: constructionProgress < s.maxProgress };
            });
            if (!changed) return prev;
            structuresRef.current = next;
            return next;
        });
    }, 400);
    return () => clearInterval(timer);
  }, [findPath, dynamicRoadTileSet]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEconomy(prev => payIncome(prev, buildingsRef.current));
    }, ECONOMY_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Report to the HUD whenever the economy changes: every income tick, and right after a purchase.
  // Layout effect so the HUD hears about it in the same pass, not after the next rendered frame.
  useLayoutEffect(() => {
    const blue = teamStats(economy, 'blue', buildingsRef.current, unitsRef.current, cheatCompute.blue);
    const red = teamStats(economy, 'red', buildingsRef.current, unitsRef.current, cheatCompute.red);
    // Only set when it changed. Even a no-op set here re-runs this whole component.
    if (teamCompute.blue !== blue.compute || teamCompute.red !== red.compute) setTeamCompute({ blue: blue.compute, red: red.compute });
    onStatsUpdate({ blue, red });
  }, [economy, cheatCompute, onStatsUpdate, teamCompute]);

  useEffect(() => {
    const timer = setInterval(() => {
        const now = Date.now();
        setDecoys(prev => prev.filter(d => {
            if (d.ownerId) {
                const owner = unitsRef.current.find(u => u.id === d.ownerId);
                return !!owner && !!owner.decoyActive && owner.health > 0;
            }
            return now - d.createdAt < ABILITY_CONFIG.DECOY_DURATION;
        }));
        setExplosions(prev => prev.filter(e => now - e.createdAt < e.duration));

    }, 500); 
    return () => clearInterval(timer);
  }, []);

  // Main Game Loop (Combat, Movement logic that isn't smooth pathing, etc)
  useEffect(() => {
      const TICK_RATE = MOVE_TICK_MS; // 10 ticks per second for logic
      const timer = setInterval(() => {
          const now = Date.now();

          // Movement. Same task as the rest of the tick, so React renders it all in one pass.
          const moveEnv = movementEnvRef.current;
          if (moveEnv) {
              simClock.lastTickAt = performance.now();
              setUnits(prev => {
                  let moved = false;
                  const next = prev.map(u => {
                      const after = advanceMover(u, MOVE_TICK_MS, moveEnv);
                      if (after !== u) moved = true;
                      return after;
                  });
                  return moved ? next : prev;
              });
              setDecoys(prev => {
                  let moved = false;
                  const next = prev.map(d => {
                      if (!d.path || d.path.length === 0) return d;
                      // Projections move at Ghost speed and never run out of power.
                      const after = advanceMover({ ...d, path: d.path, type: 'ghost' as const, unitClass: 'infantry' as const, battery: 1 }, MOVE_TICK_MS, moveEnv);
                      moved = true;
                      return { ...d, gridPos: after.gridPos, path: after.path, moveProgress: after.moveProgress, moveTarget: after.moveTarget, moveSpeed: after.moveSpeed };
                  });
                  return moved ? next : prev;
              });
          }
          let newExplosions: Explosion[] = [];
          const currentUnitsRef = unitsRef.current;

          // Projectiles fly on the game tick (sim/projectiles.ts), not the animation frame.
          if (flightRef.current.size > 0) {
              resolveFlightTick(stepProjectiles(flightRef.current, TICK_RATE, now, {
                  offset, tileSize, gridSize,
                  units: currentUnitsRef,
                  buildings: buildingsRef.current,
                  structures: structuresRef.current,
                  decoys: decoysRef.current,
              }, trophyReadyRef.current), now);
          }

          // Crawler Drones blow up next to enemies. The ref can trail the last render by a
          // tick, so remember who already went off rather than detonating them twice.
          const detonations = crawlerDetonations(currentUnitsRef, tileSize, offset)
              .filter(d => !detonatedCrawlersRef.current.has(d.crawlerId));
          const explodedCrawlerIds = new Set(detonations.map(d => d.crawlerId));
          const damageEvents: Blast[] = detonations.map(d => d.blast);
          for (const d of detonations) {
              detonatedCrawlersRef.current.add(d.crawlerId);
              newExplosions.push({
                  id: `exp-crawler-${d.crawlerId}-${now}`,
                  position: d.blast.position,
                  radius: ABILITY_CONFIG.CRAWLER_EXPLOSION_RADIUS,
                  duration: 500,
                  createdAt: now,
              });
          }

          // Bombardment Drones over their target square. Each order strikes once, even if
          // the ref has not caught up with the tick that cleared it.
          const strikes = currentUnitsRef
              .filter(u => isBombardStrike(u) && !struckBombardTargetsRef.current.has(u.bombardmentTarget!))
              .map(u => {
                  struckBombardTargetsRef.current.add(u.bombardmentTarget!);
                  return { droneId: u.id, at: { ...u.gridPos } };
              });
          if (strikes.length > 0) {
              setBuildings(prev => bombardBuildings(prev, strikes.map(s => s.at)));
              const radius = ABILITY_CONFIG.BOMBARD_RADIUS;
              strikes.forEach(strike => {
                  const cx = (strike.at.x * CITY_CONFIG.tileSize) - offset;
                  const cz = (strike.at.z * CITY_CONFIG.tileSize) - offset;
                  for (let i = 0; i < 7; i++) {
                      newExplosions.push({
                          id: `bomb-${strike.droneId}-${now}-${i}`,
                          position: {
                              x: cx + (Math.random() * 2 - 1) * radius * CITY_CONFIG.tileSize,
                              y: 1.2,
                              z: cz + (Math.random() * 2 - 1) * radius * CITY_CONFIG.tileSize,
                          },
                          radius: 5,
                          duration: 700,
                          createdAt: now,
                      });
                  }
              });
          }

          if (newExplosions.length > 0) setExplosions(prev => [...prev, ...newExplosions]);

          setClouds(prev => {
              const active = prev.filter(c => now - c.createdAt < c.duration);
              return active.length === prev.length ? prev : active;
          });
          const burningClouds = cloudsRef.current.filter(c => c.type === 'he' && now - c.createdAt < c.duration);

          setBuildings(prevBuildings => {
              const currentUnits = unitsRef.current.filter(u => u.health > 0);
              let anyBuildingChanged = false;
              const nextBuildings = prevBuildings.map(b => {
                  if (b.destroyed) return b;
                  const adjacentUnits = currentUnits.filter(u => Math.abs(u.gridPos.x - b.gridX) <= 1.5 && Math.abs(u.gridPos.z - b.gridZ) <= 1.5);
                  let bluePower = 0; let redPower = 0;
                  adjacentUnits.forEach(u => {
                      if (u.team === 'neutral') return;
                      const stats = UNIT_STATS[u.type];
                      // Buildings and core nodes are captured by infantry only.
                      if (stats.unitClass !== 'infantry') return;
                      const power = stats.captureMultiplier || 0;
                      if (u.team === 'blue') bluePower += power; else if (u.team === 'red') redPower += power;
                  });
                  if (bluePower === 0 && redPower === 0) {
                      if (b.captureProgress > 0 && b.capturingTeam) {
                          const newProgress = Math.max(0, b.captureProgress - 4);
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

          // Computed once, outside any state updater, so React's double-invoked updaters
          // in development cannot add the same finished warhead twice.
          const fabTick = advanceWarheadProduction(structuresRef.current, team => aiHelpersRef.current.doctrines?.[team]?.selected);
          if (fabTick.updates.size > 0) {
              const applyFabTick = (list: StructureData[]) => list.map(s => {
                  const production = fabTick.updates.get(s.id);
                  return production ? { ...s, production } : s;
              });
              // Advance the ref now too. If the next tick read a ref that had not caught up
              // with this render, a fab that just finished would finish again.
              structuresRef.current = applyFabTick(structuresRef.current);
              setStructuresState(applyFabTick);
          }
          if (fabTick.finished.length > 0) {
              setEconomy(prev => fabTick.finished.reduce((acc, done) => addWarheads(acc, done.team, done.warhead), prev));
          }

          // This used to run inside a setStructuresState updater. React runs updaters twice in
          // development, so the whole unit tick (damage, battery, charging) ran twice per tick.
          setUnits(prevUnits => {
                  let unitsChanged = false;
                  const externalChargeMap = new Map<string, { amount: number, sourceId?: string }>();
                  const muleChargeMap = new Map<string, { amount: number, sourceId: string }>();
                  const muleDrain = new Map<string, number>();
                  const tetherSources = new Map<string, UnitData>();
                  
                  // Courier Delivery Events to be processed after map
                  const deliveries: { targetId: string, payload: 'eclipse' | 'he' }[] = [];

                  prevUnits.forEach(u => {
                      if (!u.tetherTargetId) return;
                      tetherSources.set(u.tetherTargetId, u);
                      if (u.type !== 'banshee' || !(u.secondaryBattery && u.secondaryBattery > 0)) return;
                      const tethered = prevUnits.find(t => t.id === u.tetherTargetId && t.health > 0);
                      if (!tethered || tethered.battery >= tethered.maxBattery) return;
                      const amount = Math.min(
                          ABILITY_CONFIG.BANSHEE_TETHER_CHARGE_RATE,
                          u.secondaryBattery,
                          tethered.maxBattery - tethered.battery
                      );
                      if (amount > 0) externalChargeMap.set(tethered.id, { amount, sourceId: u.id });
                  });

                  prevUnits.forEach(mule => {
                      if (mule.type !== 'sun_plate' || !mule.isDeployed || mule.health <= 0) return;
                      let remaining = mule.battery;
                      for (const linkId of mule.batteryTetherIds || []) {
                          const target = prevUnits.find(t => t.id === linkId && t.health > 0 && t.team === mule.team);
                          if (!target || target.battery >= target.maxBattery || muleChargeMap.has(target.id)) continue;
                          const dist = Math.hypot(target.gridPos.x - mule.gridPos.x, target.gridPos.z - mule.gridPos.z);
                          if (dist > ABILITY_CONFIG.BATTERY_MULE_RANGE) continue;
                          const amount = Math.min(ABILITY_CONFIG.BATTERY_MULE_CHARGE_RATE, remaining, target.maxBattery - target.battery);
                          if (amount <= 0) continue;
                          remaining -= amount;
                          muleChargeMap.set(target.id, { amount, sourceId: mule.id });
                          muleDrain.set(mule.id, (muleDrain.get(mule.id) || 0) + amount);
                      }
                  });

                  const sentinels = sentinelFire(prevUnits, buildingsRef.current);
                  const damageMap = blastDamage(prevUnits, damageEvents, tileSize, offset, { hitsCloaked: true });
                  sentinels.damage.forEach((amount, id) => damageMap.set(id, (damageMap.get(id) || 0) + amount));
                  heCloudDamage(prevUnits, burningClouds).forEach((amount, id) => damageMap.set(id, (damageMap.get(id) || 0) + amount));
                  const unitRetaliationMap = sentinels.retaliation;

                  let activeUnits = prevUnits.filter(u => u.health > 0);
                  if (prevUnits.length !== activeUnits.length) unitsChanged = true;

                  // Remove exploded crawlers
                  if (explodedCrawlerIds.size > 0) {
                      const beforeCount = activeUnits.length;
                      activeUnits = activeUnits.filter(u => !explodedCrawlerIds.has(u.id));
                      if (activeUnits.length !== beforeCount) unitsChanged = true;
                  }

                  const repairAssignments = new Map<string, string[]>();
                  const healByTarget = new Map<string, number>();
                  const healPerTick = ABILITY_CONFIG.GUARDIAN_REPAIR_RATE * (TICK_RATE / 1000);
                  for (const guardian of activeUnits) {
                      if (guardian.type !== 'guardian') continue;
                      const previous = guardian.repairTargetIds || [];
                      const wounded = (unit: UnitData) => unit.health > 0 && unit.health < unit.maxHealth && !unit.decoyActive;
                      const inRange = (unit: UnitData) => unit.team === guardian.team && unit.id !== guardian.id && wounded(unit)
                          && Math.hypot(unit.gridPos.x - guardian.gridPos.x, unit.gridPos.z - guardian.gridPos.z) <= ABILITY_CONFIG.GUARDIAN_REPAIR_RANGE;
                      const kept = previous.filter(id => {
                          const ally = activeUnits.find(unit => unit.id === id);
                          return !!ally && inRange(ally);
                      });
                      const openSlots = ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS - kept.length;
                      const newcomers = openSlots > 0
                          ? activeUnits
                              .filter(unit => inRange(unit) && !kept.includes(unit.id))
                              .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth)
                                  || Math.hypot(a.gridPos.x - guardian.gridPos.x, a.gridPos.z - guardian.gridPos.z) - Math.hypot(b.gridPos.x - guardian.gridPos.x, b.gridPos.z - guardian.gridPos.z))
                              .slice(0, openSlots)
                              .map(unit => unit.id)
                          : [];
                      const ids = [...kept, ...newcomers];
                      repairAssignments.set(guardian.id, ids);
                      for (const id of ids) healByTarget.set(id, (healByTarget.get(id) || 0) + healPerTick);
                  }

                  const chargers = activeUnits.filter(u => u.type === 'helios');
                  
                  // Clouds for visual obscuration logic (Charging & Targeting)
                  const activeClouds = cloudsRef.current.filter(c => c.type === 'nano');

                  const bombardDamage = bombardUnitDamage(activeUnits, strikes);
                  let nextUnits = activeUnits.map(u => {
                      let newUnit = { ...u };
                      let uChanged = false;

                      const bombardHit = bombardDamage.get(u.id) || 0;
                      if (bombardHit > 0) {
                          newUnit.health = u.health - bombardHit;
                          uChanged = true;
                      }
                      if (strikes.some(strike => strike.droneId === u.id)) {
                          newUnit.bombardmentTarget = null;
                          uChanged = true;
                      }

                      // Sentinel laser beam, drawn by Unit.tsx. Was computed but never set before.
                      if (u.type === 'defense_drone') {
                          const laserTarget = sentinels.targets.get(u.id) ?? null;
                          if ((u.firingLaserAt ?? null) !== laserTarget) {
                              newUnit.firingLaserAt = laserTarget;
                              uChanged = true;
                          }
                      }
                      
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
                          newUnit.health = Math.max(0, newUnit.health - dmg);
                          uChanged = true;
                      }

                      const repairHeal = healByTarget.get(u.id) || 0;
                      if (repairHeal > 0 && newUnit.health > 0 && newUnit.health < newUnit.maxHealth) {
                          newUnit.health = Math.min(newUnit.maxHealth, newUnit.health + repairHeal);
                          uChanged = true;
                      }

                      if (newUnit.type === 'guardian') {
                          const ids = repairAssignments.get(u.id) || [];
                          const prevIds = u.repairTargetIds || [];
                          if (ids.length !== prevIds.length || ids.some((id, index) => prevIds[index] !== id)) {
                              newUnit.repairTargetIds = ids;
                              newUnit.repairTargetId = ids[0] ?? null;
                              uChanged = true;
                          }
                      }

                      // If dead from damage, handled by filter later, but we update ref
                      if (newUnit.health <= 0) return newUnit;

                      const isMoving = u.path.length > 0;
                      const onEnergyGrid = isInsideEnergyGrid(u.gridPos, u.team, buildingsRef.current, baseA_Coord, baseB_Coord);
                      const isInfantry = u.unitClass === 'infantry';
                      
                      // Vehicles and drones spend battery to move outside the grid. Infantry walk for free; their abilities still cost power.
                      const locomotionDrain = (isInfantry || onEnergyGrid) ? 0 : (isMoving ? ABILITY_CONFIG.BATTERY_DRAIN_MOVE : ABILITY_CONFIG.BATTERY_DRAIN_IDLE);
                      let drain = locomotionDrain;
                      if (u.type === 'banshee' && u.jammerActive) drain += ABILITY_CONFIG.DRAIN_STATIC_JAMMER;
                      if (u.type === 'ghost' && u.isDampenerActive) drain += ABILITY_CONFIG.GHOST_SPEED_PENALTY;
                      if (u.type === 'ghost' && u.isDampenerActive) drain += ABILITY_CONFIG.DRAIN_STATIC_DOME;
                      if (u.type === 'ghost' && u.decoyActive) {
                          drain += ABILITY_CONFIG.PHANTOM_DECOY_DRAIN * (isMoving ? 1 : ABILITY_CONFIG.PHANTOM_DECOY_STILL_FACTOR);
                      }
                      if (u.type === 'sun_plate') {
                          const previousLinks = u.batteryTetherIds || [];
                          const keptLinks = u.isDeployed
                              ? previousLinks.filter(linkId => {
                                  const target = activeUnits.find(t => t.id === linkId);
                                  return !!target && target.team === u.team && target.health > 0
                                      && Math.hypot(target.gridPos.x - u.gridPos.x, target.gridPos.z - u.gridPos.z) <= ABILITY_CONFIG.BATTERY_MULE_RANGE;
                              })
                              : [];
                          if (keptLinks.length !== previousLinks.length || keptLinks.some((linkId, index) => previousLinks[index] !== linkId)) {
                              newUnit.batteryTetherIds = keptLinks;
                              uChanged = true;
                          }
                      }

                      // Banshee Tether: drain the hardline pack when a drone is siphoning
                      if (u.type === 'banshee' && u.tetherTargetId) {
                          const target = activeUnits.find(t => t.id === u.tetherTargetId);
                          if (!target) {
                              newUnit.tetherTargetId = null;
                              uChanged = true;
                          } else {
                              const siphon = externalChargeMap.get(u.tetherTargetId);
                              if (siphon && siphon.sourceId === u.id) {
                                  newUnit.secondaryBattery = Math.max(0, (u.secondaryBattery || 0) - siphon.amount);
                                  uChanged = true;
                              }
                          }
                      }

                      // Hard tether leash — if the Banshee pulls out of range, the drone follows
                      const tetherHost = tetherSources.get(u.id);
                      if (tetherHost) {
                          const leashDist = Math.hypot(u.gridPos.x - tetherHost.gridPos.x, u.gridPos.z - tetherHost.gridPos.z);
                          if (leashDist > ABILITY_CONFIG.BANSHEE_TETHER_RANGE) {
                              const destKey = `${tetherHost.gridPos.x},${tetherHost.gridPos.z}`;
                              const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;
                              if (currentDest !== destKey) {
                                  const followPath = findPath(u.gridPos, tetherHost.gridPos);
                                  if (followPath.length > 0) {
                                      newUnit.path = followPath;
                                      uChanged = true;
                                  }
                              }
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

                      // Field Fabricator finishes one missile from onboard material.
                      if (u.type === 'mule' && u.fabrication?.active) {
                          const progress = u.fabrication.progress + productionStep(aiHelpersRef.current.doctrines?.[u.team as 'blue' | 'red']?.selected);
                          if (progress >= u.fabrication.totalTime) {
                              const material = u.ordnanceMaterial || 0;
                              if (material > 0) {
                                  const inv = { eclipse: u.missileInventory?.eclipse || 0, he: u.missileInventory?.he || 0 };
                                  inv[u.fabrication.item] += 1;
                                  newUnit.ordnanceMaterial = material - 1;
                                  newUnit.missileInventory = inv;
                              }
                              newUnit.fabrication = { ...u.fabrication, active: false, progress: 0 };
                          } else {
                              newUnit.fabrication = { ...u.fabrication, progress };
                          }
                          uChanged = true;
                      }

                      // General Battery Drain
                      if (u.battery > 0 && u.type !== 'defense_drone') { 
                          let shouldDrain = true;
                          if (u.type === 'crawler_drone' && u.parentId) {
                              const parent = currentUnitsRef.find(p => p.id === u.parentId);
                              if (parent && parent.isAnchored) {
                                  const dist = Math.sqrt((u.gridPos.x - parent.gridPos.x)**2 + (u.gridPos.z - parent.gridPos.z)**2);
                                  if (dist <= (ABILITY_CONFIG.CRAWLER_RADIUS || 7)) {
                                      shouldDrain = false;
                                      newUnit.battery = u.maxBattery;
                                      if (newUnit.battery !== u.battery) uChanged = true;
                                  }
                              }
                          }
                          if (shouldDrain) {
                              newUnit.battery = Math.max(0, newUnit.battery - drain); 
                              if (newUnit.battery !== u.battery) uChanged = true; 
                          }
                      }
                      if (u.type === 'sun_plate' && u.isDeployed) {
                          const paid = muleDrain.get(u.id) || 0;
                          if (paid > 0) {
                              newUnit.battery = Math.max(0, newUnit.battery - paid);
                              uChanged = true;
                          }
                      }
                      if (u.unitClass === 'infantry' && newUnit.battery <= 0) {
                          if (u.decoyActive) {
                              newUnit.decoyActive = false;
                              newUnit.isStealthed = false;
                              uChanged = true;
                          }
                          if (u.isDampenerActive) {
                              newUnit.isDampenerActive = false;
                              uChanged = true;
                          }
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
                      if (muleChargeMap.has(u.id)) {
                          chargeAmount += muleChargeMap.get(u.id)!.amount;
                          status = 2;
                      }

                      // Friendly buildings and the command base feed the grid. Nano clouds block solar, not this link.
                      if (onEnergyGrid && newUnit.battery < newUnit.maxBattery) {
                          chargeAmount += ABILITY_CONFIG.ENERGY_GRID_CHARGE_RATE;
                          status = Math.max(status, 1);
                      }
                      
                      // Only process wireless charging if NOT obscured by Nano Cloud
                      if (!isInNano) {
                          chargers.forEach(charger => {
                              if (charger.team !== u.team) return;
                              const dist = Math.sqrt(Math.pow(u.gridPos.x - charger.gridPos.x, 2) + Math.pow(u.gridPos.z - charger.gridPos.z, 2));
                              if (charger.type === 'helios' && dist <= ABILITY_CONFIG.HELIOS_RADIUS) { 
                                  chargeAmount += ABILITY_CONFIG.HELIOS_CHARGE_RATE; 
                                  status = Math.max(status, 1); 
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
                  
                  const attacks = autoAttacks(nextUnits, now, pos => isPointInCloud(pos, activeClouds, 'nano'));
                  const finalUnits = applyDamage(
                      nextUnits.map(u => attacks.fired.has(u.id) ? { ...u, lastAttackTime: now } : u),
                      attacks.damage,
                  ).filter(u => u.health > 0);

                  // Identity check. Every changed unit is a new object, so there is no need to
                  // serialise the whole army to text twice a tick to find out.
                  if (unitsChanged || finalUnits.length !== prevUnits.length || finalUnits.some((u, i) => u !== prevUnits[i])) return finalUnits;
                  return prevUnits;
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
  const tetherTargetingSource = targetingAbility === 'TETHER' && targetingSourceId
      ? units.find(src => src.id === targetingSourceId)
      : undefined;
  const batteryTargetingSource = targetingAbility === 'BATTERY_TETHER' && targetingSourceId
      ? units.find(src => src.id === targetingSourceId && src.type === 'sun_plate' && src.isDeployed)
      : undefined;

  const callbacksRef = useRef({ handleTileClick, handleRightClick, setHoverGridPos, handleUnitSelect, handleUnitAction, handleStructureClick, handleStructureAction });
  callbacksRef.current = { handleTileClick, handleRightClick, setHoverGridPos, handleUnitSelect, handleUnitAction, handleStructureClick, handleStructureAction };
  
  const stableTileClick = useCallback((x: number, z: number) => callbacksRef.current.handleTileClick(x, z), []);
  const stableRightClick = useCallback((x: number, z: number) => callbacksRef.current.handleRightClick(x, z), []);
  const stableHover = useCallback((x: number, z: number) => callbacksRef.current.setHoverGridPos({x, z}), []);
  const stableUnitSelect = useCallback((id: string) => callbacksRef.current.handleUnitSelect(id), []);
  const stableUnitAction = useCallback((id: string, action: string) => callbacksRef.current.handleUnitAction(id, action), []);
  const stableDoubleClick = useCallback(() => {}, []);
  const stableStructureClick = useCallback((id: string) => callbacksRef.current.handleStructureClick(id), []);
  const stableStructureAction = useCallback((id: string, action: string) => callbacksRef.current.handleStructureAction(id, action), []);

  const stableEmptyArray = useMemo(() => [], []);
  const stableEmptyObject = useMemo(() => ({}), []);

  // This group holds the whole city and sits at the origin. Keeping it clean is
  // what lets the per-building matrix freezing below it actually take effect.
  const mapRootRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    freezeContainer(mapRootRef.current);
  }, []);

  return (
    <group
        ref={mapRootRef}
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
          onClick={(e) => {
              if (!placementMode) return;
              e.stopPropagation();
              const gx = Math.round((e.point.x + offset) / tileSize);
              const gz = Math.round((e.point.z + offset) / tileSize);
              handleTileClick(gx, gz);
          }}
        >
            <planeGeometry args={[gridSize * tileSize, gridSize * tileSize]} />
            <meshStandardMaterial color="#1e293b" roughness={1} metalness={0} />
        </mesh>

        {/* Instanced Roads with Procedural Textures */}
        <InstancedRoads 
            tiles={roadTiles} 
            tileSize={CITY_CONFIG.tileSize} 
            offset={offset} 
            onClick={handleTileClick} 
            onRightClick={handleRightClick} 
            onHover={stableHover}
            tileScale={0.95}
        />

        {/* Street Lights */}
        <StreetLights tiles={roadTiles} tileSize={CITY_CONFIG.tileSize} offset={offset} />

        {/* Selection Box Visual */}
        {dragSelection && dragSelection.active && (
            <SelectionBox start={dragSelection.start} current={dragSelection.current} />
        )}

        {/* One instanced collider stands in for every building's detail meshes. */}
        <BuildingHitProxies
            buildings={buildings}
            onClick={stableTileClick}
            onRightClick={stableRightClick}
            onHover={stableHover}
        />

        <EnergyGridField
            buildings={buildings}
            playerTeam={playerTeam}
            tileSize={tileSize}
            offset={offset}
        />
        {buildings.map(b => ( 
            <Building 
                key={b.id} 
                data={b} 
                hovered={!!hoverGridPos && hoverGridPos.x === b.gridX && hoverGridPos.z === b.gridZ}
            /> 
        ))}
        {structuresState.map(s => ( 
            <Structure 
                key={s.id} 
                data={s} 
                tileSize={CITY_CONFIG.tileSize} 
                offset={offset} 
                onRightClick={stableRightClick}
                onDoubleClick={stableStructureClick}
                onClick={stableStructureClick}
                menuOpen={depotMenuOpenId === s.id}
                onAction={stableStructureAction}
                hasMason={hasMason}
                resources={teamResources[playerTeam]}
                warheadStock={playerTeam === 'blue' || playerTeam === 'red' ? stockpile[playerTeam] : undefined}
            /> 
        ))}
        {blocks.map(block => (
            <BlockStatus key={block.id} block={block} buildings={buildings} />
        ))}
        {units.map(u => {
             const isVisible = visibleUnitIds.has(u.id);
             const atOrdnanceFab = structuresState.some(s => s.type === 'ordnance_fab' && s.team === u.team && !s.isBlueprint && Math.hypot(s.gridPos.x - u.gridPos.x, s.gridPos.z - u.gridPos.z) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE);
             const ballistaInRange = u.type === 'mule' && units.some(b => b.type === 'ballista' && b.team === u.team && b.health > 0 && Math.hypot(b.gridPos.x - u.gridPos.x, b.gridPos.z - u.gridPos.z) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE);
             return ( <Unit key={u.id} {...u} teamCompute={(u.team === 'blue' || u.team === 'red') ? teamCompute[u.team] : 0} isSelected={selectedUnitIds.has(u.id)} onSelect={stableUnitSelect} tileSize={CITY_CONFIG.tileSize} offset={offset} onDoubleClick={stableDoubleClick} visible={isVisible} actionMenuOpen={primarySelectionId === u.id && (!targetingSourceId || targetingSourceId === u.id)} onAction={stableUnitAction} isTargetingMode={!!targetingSourceId} showTetherRange={u.type === 'banshee' && (!!u.tetherTargetId || (targetingSourceId === u.id && targetingAbility === 'TETHER'))} showBatteryRange={u.type === 'sun_plate' && !!u.isDeployed && (selectedUnitIds.has(u.id) || (targetingSourceId === u.id && targetingAbility === 'BATTERY_TETHER'))} isTetherCandidate={targetingAbility === 'TETHER' && !!tetherTargetingSource && isTetherableDrone(u) && u.team === tetherTargetingSource.team && u.id !== tetherTargetingSource.id} isBatteryLinkCandidate={!!batteryTargetingSource && isBatteryLinkable(u) && u.team === batteryTargetingSource.team && Math.hypot(u.gridPos.x - batteryTargetingSource.gridPos.x, u.gridPos.z - batteryTargetingSource.gridPos.z) <= ABILITY_CONFIG.BATTERY_MULE_RANGE} warheadStock={u.team === playerTeam && (playerTeam === 'blue' || playerTeam === 'red') ? stockpile[playerTeam] : undefined} atOrdnanceFab={atOrdnanceFab} ballistaInRange={ballistaInRange} cores={(u.team === 'blue' || u.team === 'red') ? teamResources[u.team] : 0} /> );
        })}
        {decoys.map(d => {
            const seen = d.team === playerTeam || units.some(f => f.team === playerTeam && Math.hypot(f.gridPos.x - d.gridPos.x, f.gridPos.z - d.gridPos.z) <= (f.visionRange || 2));
            return (
            <Unit
                key={d.id}
                id={d.id}
                type="ghost"
                unitClass="infantry"
                team={d.team}
                gridPos={d.gridPos}
                isSelected={false}
                onSelect={stableUnitSelect} // Decoys not selectable
                tileSize={CITY_CONFIG.tileSize}
                offset={offset}
                path={d.path ?? stableEmptyArray}
                moveProgress={d.moveProgress}
                moveTarget={d.moveTarget}
                moveSpeed={d.moveSpeed}
                onDoubleClick={stableDoubleClick}
                visionRange={0}
                visible={seen}
                actionMenuOpen={false}
                onAction={stableUnitAction}
                health={100}
                maxHealth={100}
                battery={100}
                maxBattery={100}
                cooldowns={stableEmptyObject}
                teamCompute={0}
                isDecoy={true}
            />
            );
        })}
        
        {/* Projectiles */}
        {projectiles.map(p => <ProjectileMesh key={p.id} projectile={p} flightRef={flightRef} />)}
        
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
                {targetingAbility === 'BOMBARD' ? (
                    <group>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} raycast={() => null}>
                            <planeGeometry args={[(ABILITY_CONFIG.BOMBARD_RADIUS * 2 + 1) * tileSize, (ABILITY_CONFIG.BOMBARD_RADIUS * 2 + 1) * tileSize]} />
                            <meshBasicMaterial color="#f97316" transparent opacity={0.2} depthWrite={false} />
                        </mesh>
                        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                            <ringGeometry args={[tileSize * 0.35, tileSize * 0.48, 4]} />
                            <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                ) : targetingAbility === 'MISSILE' || (interactionMode === 'target' && targetingDoctrine?.type.includes('HEAVY_METAL')) ? (
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
                              <circleGeometry args={[ABILITY_CONFIG.HE_RADIUS * tileSize, 32]} />
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
                                color={targetingAbility === 'BATTERY_TETHER' ? '#facc15' : (targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'TETHER' ? "#38bdf8" : "#10b981")))} 
                                wireframe 
                            />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.05, 0]}>
                            <ringGeometry args={[tileSize * 0.3, tileSize * 0.35, 4]} />
                            <meshBasicMaterial 
                                color={targetingAbility === 'BATTERY_TETHER' ? '#facc15' : (targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'CANNON' ? "#ef4444" : (targetingAbility === 'TETHER' ? "#38bdf8" : "#10b981")))} 
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
           <group position={[(hoverGridPos.x * tileSize) - offset, 2, (hoverGridPos.z * tileSize) - offset]}>
               {checkIsValidPlacement(hoverGridPos.x, hoverGridPos.z) ? (
                   <mesh>
                       <boxGeometry args={[tileSize * 0.8, 2, tileSize * 0.8]} />
                       <meshBasicMaterial color={placementMode.type.includes('wall') ? '#ffffff' : TEAM_COLORS[playerTeam]} transparent opacity={0.5} wireframe />
                   </mesh>
               ) : (
                   <group>
                       <mesh>
                           <boxGeometry args={[tileSize * 0.8, 2, tileSize * 0.8]} />
                           <meshBasicMaterial color="#ef4444" transparent opacity={0.3} wireframe />
                       </mesh>
                       <mesh rotation={[0, Math.PI/4, 0]} position={[0, 1, 0]}>
                           <boxGeometry args={[tileSize * 0.8, 1, 1]} />
                           <meshBasicMaterial color="#ef4444" />
                       </mesh>
                       <mesh rotation={[0, -Math.PI/4, 0]} position={[0, 1, 0]}>
                           <boxGeometry args={[tileSize * 0.8, 1, 1]} />
                           <meshBasicMaterial color="#ef4444" />
                       </mesh>
                   </group>
               )}
           </group>
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

export default React.memo(CityMap);
