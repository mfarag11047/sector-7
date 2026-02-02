
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Edges, Float, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { TEAM_COLORS, UNIT_CLASSES, ABILITY_CONFIG, UNIT_STATS, COMPUTE_GATES } from '../constants';
import { UnitType, UnitClass } from '../types';

// Helper component for spinning rotors
const Rotor: React.FC = () => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 20;
  });
  return (
    <group ref={ref}>
      <mesh><boxGeometry args={[0.7, 0.01, 0.08]} /><meshBasicMaterial color="#cbd5e1" transparent opacity={0.5} /></mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.7, 0.01, 0.08]} /><meshBasicMaterial color="#cbd5e1" transparent opacity={0.5} /></mesh>
    </group>
  );
};

interface UnitProps {
  id: string;
  type: UnitType;
  unitClass: UnitClass;
  team: 'blue' | 'red' | 'neutral';
  gridPos: { x: number; z: number };
  isSelected: boolean;
  onSelect: (id: string) => void;
  tileSize: number;
  offset: number;
  path: string[];
  onMoveStep: (id: string) => void;
  tileTypeMap: Record<string, 'main' | 'street' | 'open'>;
  onDoubleClick: (e: any, id: string) => void;
  visionRange: number;
  visible?: boolean;
  surveillance?: {
    active: boolean;
    status: 'traveling' | 'active' | 'returning';
    center: { x: number, z: number };
    startTime?: number;
  };
  isDampenerActive?: boolean;
  isDeployed?: boolean; // Sun-Plate
  actionMenuOpen: boolean;
  onAction: (action: string) => void;
  isDecoy?: boolean;
  health: number;
  maxHealth: number;
  battery: number;
  maxBattery: number;
  secondaryBattery?: number;
  maxSecondaryBattery?: number;
  chargingStatus?: number; // 0, 1, or 2
  cooldowns: {
      trophySystem?: number;
      titanAps?: number;
      titanSmoke?: number;
      combatPrint?: number;
      swarmLaunch?: number;
      smogShell?: number;
      mainCannon?: number;
  };
  repairTargetId?: string | null; // Added for smooth visual lookup
  repairTargetPos?: THREE.Vector3;
  hackerPos?: THREE.Vector3;
  smoke?: {
      active: boolean;
      remainingTime: number;
  };
  aps?: {
      active: boolean;
      remainingTime: number;
  };
  charges?: {
      smoke?: number;
      aps?: number;
      swarm?: number;
  };
  cargo?: number;
  constructionTargetId?: string | null; // Mason target
  isTargetingMode?: boolean;
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'eclipse' | 'wp' | null;
  missileInventory?: { eclipse: number; wp: number }; // Added
  loadingProgress?: number;
  courierTargetId?: string;
  courierPayload?: 'eclipse' | 'wp';
  jammerActive?: boolean;
  tetherTargetId?: string | null;
  isJammed?: boolean;
  isHacked?: boolean;
  hackType?: 'recall' | 'drain' | null;
  teamCompute: number; // New Prop
  firingLaserAt?: string | null;
  lastAttackTime?: number;
}

const Unit: React.FC<UnitProps> = ({ 
  id, type, unitClass, team, gridPos, isSelected, onSelect, tileSize, offset, path, onMoveStep, tileTypeMap, onDoubleClick, visionRange, visible = true, surveillance, isDampenerActive, isDeployed, actionMenuOpen, onAction, isDecoy, health, maxHealth, battery, maxBattery, secondaryBattery, maxSecondaryBattery, chargingStatus, cooldowns, repairTargetId, repairTargetPos, hackerPos, smoke, aps, charges, cargo, constructionTargetId, isTargetingMode, ammoState, loadedAmmo, missileInventory, loadingProgress, courierPayload, jammerActive, tetherTargetId, isJammed, isHacked, hackType, teamCompute, firingLaserAt, lastAttackTime
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Group>(null);
  const tetherLineRef = useRef<THREE.BufferGeometry>(null);
  const laserRef = useRef<THREE.BufferGeometry>(null);
  const constructionLineRef = useRef<THREE.BufferGeometry>(null);
  const scene = useThree((state) => state.scene); // Access scene for lookups
  const flashRef = useRef<THREE.PointLight>(null);
  const smokeRef = useRef<THREE.Group>(null);
  const apsRef = useRef<THREE.Group>(null);

  const teamColor = TEAM_COLORS[team];
  const isTank = type === 'tank' || type === 'titan_dropped';
  const isGhost = type === 'ghost';
  const isGuardian = type === 'guardian';
  const isMule = type === 'mule';
  const isMason = type === 'mason';
  const isWasp = type === 'wasp';
  const isHelios = type === 'helios';
  const isSunPlate = type === 'sun_plate';
  const isBallista = type === 'ballista';
  const isCourier = type === 'courier';
  const isBanshee = type === 'banshee';
  const isDrone = type === 'drone';
  const isDefenseDrone = type === 'defense_drone';
  const isAir = isWasp || isDrone || isHelios;
  
  const classConfig = UNIT_CLASSES[unitClass];
  const unitStats = UNIT_STATS[type];

  const isDisabled = battery <= 0 || (isHacked && hackType === 'drain');

  // Floating height difference
  // Raised ground units to 1.2 to clear the Base platform (height 1.0)
  const hoverHeight = isDefenseDrone ? 12.0 : (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee) ? 1.2 : (isAir ? 75.0 : 2.0);
  
  // Logical World Position
  const logicalWorldPos = useMemo(() => new THREE.Vector3(
      (gridPos.x * tileSize) - offset,
      hoverHeight,
      (gridPos.z * tileSize) - offset
  ), [gridPos, tileSize, offset, hoverHeight]);

  useLayoutEffect(() => {
    if (meshRef.current) {
        meshRef.current.position.copy(logicalWorldPos);
    }
  }, []);

  const lastProcessedTargetRef = useRef<string | null>(null);

  const BASE_SPEED = 12; // Units per second

  // Calculate target based on path (Next Tile Center)
  const targetWorldPos = useMemo(() => {
    const targetKey = path.length > 0 ? path[0] : `${gridPos.x},${gridPos.z}`;
    const [tx, tz] = targetKey.split(',').map(Number);
    
    return new THREE.Vector3(
      (tx * tileSize) - offset,
      hoverHeight,
      (tz * tileSize) - offset
    );
  }, [gridPos, path, tileSize, offset, hoverHeight]);

  // Calculate Flight Target (Next Destination in Path) for Air Units
  const flightTargetPos = useMemo(() => {
    if (!isAir || path.length === 0) return null;
    const nextKey = path[0];
    const [fx, fz] = nextKey.split(',').map(Number);
    return new THREE.Vector3(
        (fx * tileSize) - offset,
        hoverHeight,
        (fz * tileSize) - offset
    );
  }, [path, isAir, tileSize, offset, hoverHeight]);

  // Determine Speed multiplier
  const speedMultiplier = useMemo(() => {
    if (path.length === 0) return 0;
    if (isDisabled) return 0; // No speed if no battery or disabled
    if (isBallista && ammoState === 'loading') return 0; // Immobilized while loading
    if (isJammed) return 0.5; 
    
    if (isAir) {
         return 1.2 * (unitStats.speedMod || 1.0);
    }

    const targetKey = path[0];
    const tileType = tileTypeMap[targetKey];
    
    let speed = 1.0;
    if (tileType === 'main') speed = 2.0;    
    if (tileType === 'open') speed = 0.5;    

    speed *= unitStats.speedMod || 1.0;

    if (isGhost && isDampenerActive) {
        speed *= ABILITY_CONFIG.GHOST_SPEED_PENALTY;
    }
    
    return speed;
  }, [path, tileTypeMap, isGhost, isDampenerActive, unitStats, isAir, isDisabled, isBallista, ammoState, isJammed]);

  useFrame((state, delta) => {
    // Muzzle Flash Logic
    if (flashRef.current) {
        if (lastAttackTime && Date.now() - lastAttackTime < 100) {
            flashRef.current.intensity = 5;
            flashRef.current.visible = true;
        } else {
            flashRef.current.intensity = 0;
            flashRef.current.visible = false;
        }
    }

    // Ability Animations
    if (smokeRef.current) {
        smokeRef.current.rotation.y += delta * 0.2;
    }
    if (apsRef.current) {
        apsRef.current.rotation.y -= delta * 1.5;
        apsRef.current.rotation.z += delta * 0.5;
    }

    // Rotation for Banshee/Guardian Radar
    if (radarRef.current && jammerActive) {
        radarRef.current.rotation.y += 5 * delta;
    } else if (radarRef.current) {
        radarRef.current.rotation.y += 1 * delta; // Slow idle spin
    }

    // Imperative Line Updates (Construction, Laser, Tether) ...
    if (constructionLineRef.current && meshRef.current && isMason) {
        if (constructionTargetId) {
            const start = new THREE.Vector3(0, 2.5, 1.0); 
            const end = new THREE.Vector3(0, -1, 2); 
            end.x += Math.random() * 0.2 - 0.1;
            end.z += Math.random() * 0.2 - 0.1;
            constructionLineRef.current.setFromPoints([start, end]);
            constructionLineRef.current.attributes.position.needsUpdate = true;
        } else {
            constructionLineRef.current.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
            constructionLineRef.current.attributes.position.needsUpdate = true;
        }
    }

    if (laserRef.current && meshRef.current && isDefenseDrone) {
        if (firingLaserAt) {
            const targetObj = scene.getObjectByName(`unit-${firingLaserAt}`);
            if (targetObj) {
                const start = new THREE.Vector3(0, 0, 0); 
                const targetWorld = new THREE.Vector3();
                targetObj.getWorldPosition(targetWorld);
                const sourceWorld = new THREE.Vector3();
                meshRef.current.getWorldPosition(sourceWorld);
                const diffWorld = new THREE.Vector3().subVectors(targetWorld, sourceWorld);
                diffWorld.x += Math.random() * 0.2 - 0.1;
                diffWorld.z += Math.random() * 0.2 - 0.1;
                const localEnd = diffWorld.applyQuaternion(meshRef.current.quaternion.clone().invert());
                laserRef.current.setFromPoints([start, localEnd]);
                laserRef.current.attributes.position.needsUpdate = true;
            } else {
                laserRef.current.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
                laserRef.current.attributes.position.needsUpdate = true;
            }
        } else {
            laserRef.current.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
            laserRef.current.attributes.position.needsUpdate = true;
        }
    }

    if (tetherLineRef.current && meshRef.current) {
        const targetId = tetherTargetId || repairTargetId;
        if (targetId) {
            const targetObj = scene.getObjectByName(`unit-${targetId}`);
            if (targetObj) {
                const start = new THREE.Vector3(0, 1.5, 0); 
                const targetWorld = new THREE.Vector3();
                targetObj.getWorldPosition(targetWorld);
                const sourceWorld = new THREE.Vector3();
                meshRef.current.getWorldPosition(sourceWorld);
                const diffWorld = new THREE.Vector3().subVectors(targetWorld, sourceWorld);
                diffWorld.y += 0.5; 
                const localEnd = diffWorld.applyQuaternion(meshRef.current.quaternion.clone().invert());
                tetherLineRef.current.setFromPoints([start, localEnd]);
                tetherLineRef.current.attributes.position.needsUpdate = true;
            } else if (repairTargetPos) {
                const start = new THREE.Vector3(0, 1.5, 0);
                const end = new THREE.Vector3().subVectors(repairTargetPos, meshRef.current.position);
                end.y = 0.5; 
                tetherLineRef.current.setFromPoints([start, end.applyQuaternion(meshRef.current.quaternion.clone().invert())]);
                tetherLineRef.current.attributes.position.needsUpdate = true;
            }
        } else {
            tetherLineRef.current.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
            tetherLineRef.current.attributes.position.needsUpdate = true;
        }
    }

    if (meshRef.current) {
        if (isDefenseDrone) {
            meshRef.current.rotation.y += delta * 0.5;
            meshRef.current.position.y = logicalWorldPos.y + Math.sin(state.clock.elapsedTime * 2) * 0.5;
            return;
        }

        if (surveillance && surveillance.status === 'active' && !isTank && !isGhost && !isGuardian && !isMule && !isMason && !isSunPlate && !isBallista && !isCourier && !isBanshee) {
             const time = state.clock.getElapsedTime();
             const radiusWorld = ABILITY_CONFIG.SURVEILLANCE_RADIUS * tileSize; 
             const cx = (surveillance.center.x * tileSize) - offset;
             const cz = (surveillance.center.z * tileSize) - offset;
             const speed = 0.5;
             const circleX = cx + Math.cos(time * speed) * radiusWorld;
             const circleZ = cz + Math.sin(time * speed) * radiusWorld;
             const circleTarget = new THREE.Vector3(circleX, hoverHeight, circleZ);
             meshRef.current.position.lerp(circleTarget, delta * 1.5);
             const nextX = cx + Math.cos((time + 0.1) * speed) * radiusWorld;
             const nextZ = cz + Math.sin((time + 0.1) * speed) * radiusWorld;
             meshRef.current.lookAt(new THREE.Vector3(nextX, hoverHeight, nextZ));
             return;
        }

        if (path.length > 0 && !isDisabled && !isDeployed && !(isBallista && ammoState === 'loading')) {
             const meshPos = meshRef.current.position;
             const moveDist = BASE_SPEED * speedMultiplier * delta;

             if (isAir && flightTargetPos) {
                 const distToTarget = meshPos.distanceTo(flightTargetPos);

                 if (distToTarget <= moveDist) {
                     meshPos.copy(flightTargetPos);
                 } else {
                     const dir = new THREE.Vector3().subVectors(flightTargetPos, meshPos).normalize();
                     meshPos.add(dir.multiplyScalar(moveDist));
                     const lookTarget = flightTargetPos.clone();
                     lookTarget.y = meshPos.y; 
                     meshRef.current.lookAt(lookTarget);
                 }

                 const cx = Math.round((meshPos.x + offset) / tileSize);
                 const cz = Math.round((meshPos.z + offset) / tileSize);
                 const nextKey = path[0];
                 const [nx, nz] = nextKey.split(',').map(Number);
                 if (cx === nx && cz === nz) {
                      if (lastProcessedTargetRef.current !== nextKey) {
                            lastProcessedTargetRef.current = nextKey;
                            onMoveStep(id);
                      }
                 }
             } else {
                 const lookTarget = targetWorldPos.clone();
                 lookTarget.y = meshRef.current.position.y;
                 meshRef.current.lookAt(lookTarget);

                 const dist = meshPos.distanceTo(targetWorldPos);

                 if (dist <= moveDist) {
                    const currentTargetKey = path[0];

                    if (lastProcessedTargetRef.current !== currentTargetKey) {
                        meshPos.copy(targetWorldPos);
                        lastProcessedTargetRef.current = currentTargetKey;
                        onMoveStep(id);
                    }
                } else {
                    const dir = new THREE.Vector3().subVectors(targetWorldPos, meshPos).normalize();
                    meshPos.add(dir.multiplyScalar(moveDist));
                }
             }
        } else {
            meshRef.current.position.lerp(targetWorldPos, 0.1);
        }
    }
  });

  const handleClick = (e: any) => {
      e.stopPropagation();
      onSelect(id);
  };

  const handleDoubleClick = (e: any) => {
      e.stopPropagation();
      onDoubleClick(e.nativeEvent, id);
  };

  const handleMenuAction = (action: string) => {
    onAction(action);
  };

  const handlePointerOver = () => {
    document.body.style.cursor = isTargetingMode ? 'crosshair' : 'pointer';
  };

  const handlePointerOut = () => {
    document.body.style.cursor = isTargetingMode ? 'crosshair' : 'auto';
  };

  // Model rendering based on unit type
  const renderModel = () => {
     if (isDefenseDrone) {
        const bodyColor = "#334155"; const glowColor = firingLaserAt ? "#ff0000" : "#ef4444"; const detailColor = "#1e293b";
        return ( <group scale={[3, 3, 3]}> <mesh><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color={bodyColor} metalness={0.8} roughness={0.3} /></mesh> <mesh rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.605, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, 0.35, 0]} rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.48, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, -0.35, 0]} rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.48, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <group position={[0, 0, 0.52]} rotation={[Math.PI/2, 0, 0]}> <mesh><cylinderGeometry args={[0.22, 0.25, 0.15, 8]} /><meshStandardMaterial color={detailColor} metalness={0.9} /></mesh> <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.15, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, 0.2, 0]} rotation={[Math.PI/2, 0, 0]}><ringGeometry args={[0.06, 0.12, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} /></mesh> </group> {[90, 180, 270].map((deg) => { const rad = deg * Math.PI / 180; return ( <group key={deg} rotation={[0, rad, 0]}> <group position={[0, 0, 0.55]} rotation={[Math.PI/2, 0, 0]}> <mesh><cylinderGeometry args={[0.1, 0.12, 0.1, 8]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, 0.06, 0]}><sphereGeometry args={[0.06, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshBasicMaterial color={glowColor} /></mesh> </group> </group> ); })} {[ [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1] ].map((vec, i) => { const dir = new THREE.Vector3(...vec).normalize(); const pos = dir.clone().multiplyScalar(0.58); const quaternion = new THREE.Quaternion(); quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); return ( <group key={i} position={pos} quaternion={quaternion}> <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.06, 0.08, 0.1, 6]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, 0.25, 0]}><coneGeometry args={[0.03, 0.4, 8]} /><meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} /></mesh> </group> ); })} <group position={[0.2, 0.55, -0.2]} rotation={[0, 0, -0.2]}> <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.02, 0.02, 0.6]} /><meshStandardMaterial color="#94a3b8" metalness={1} /></mesh> <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.03]} /><meshBasicMaterial color={glowColor} /></mesh> </group> <group position={[-0.2, 0.55, -0.1]} rotation={[0.1, 0, 0.2]}> <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.015, 0.015, 0.4]} /><meshStandardMaterial color="#94a3b8" metalness={1} /></mesh> </group> <group position={[0, -0.6, 0]}> <mesh rotation={[Math.PI, 0, 0]}><cylinderGeometry args={[0.2, 0.3, 0.15, 6]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, -0.1, 0]}><cylinderGeometry args={[0.1, 0.1, 0.1, 8]} /><meshBasicMaterial color={glowColor} transparent opacity={0.8} /></mesh> </group> </group> );
    }

    if (isTank) {
        const treadLength = 2.2; const treadWidth = 0.5; const treadHeight = 0.6; const treadX = 0.85; const wheelCount = 5; const wheelRadius = 0.15;
        return ( <group scale={[2.6, 2.6, 2.6]}> <group position={[-treadX, 0.3, 0]}> <mesh><boxGeometry args={[treadWidth, treadHeight, treadLength]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" threshold={15} /></mesh> {Array.from({length: wheelCount}).map((_, i) => ( <mesh key={i} position={[treadWidth/2 + 0.02, -0.15, (i - (wheelCount-1)/2) * (treadLength/wheelCount) * 0.8]} rotation={[0, Math.PI/2, 0]}><ringGeometry args={[wheelRadius * 0.6, wheelRadius, 8]} /><meshBasicMaterial color={teamColor} toneMapped={false} side={THREE.DoubleSide} /></mesh> ))} <mesh position={[-0.1, 0.1, 0]}><boxGeometry args={[0.1, 0.4, treadLength * 0.8]} /><meshStandardMaterial color="#475569" /></mesh> </group> <group position={[treadX, 0.3, 0]}> <mesh><boxGeometry args={[treadWidth, treadHeight, treadLength]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" threshold={15} /></mesh> {Array.from({length: wheelCount}).map((_, i) => ( <mesh key={i} position={[-treadWidth/2 - 0.02, -0.15, (i - (wheelCount-1)/2) * (treadLength/wheelCount) * 0.8]} rotation={[0, Math.PI/2, 0]}><ringGeometry args={[wheelRadius * 0.6, wheelRadius, 8]} /><meshBasicMaterial color={teamColor} toneMapped={false} side={THREE.DoubleSide} /></mesh> ))} <mesh position={[0.1, 0.1, 0]}><boxGeometry args={[0.1, 0.4, treadLength * 0.8]} /><meshStandardMaterial color="#475569" /></mesh> </group> <group position={[0, 0.5, 0]}> <mesh><boxGeometry args={[1.2, 0.5, 2.0]} /><meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} /><Edges color="#000000" /></mesh> <mesh position={[0, -0.1, 1.2]}><boxGeometry args={[1.0, 0.3, 0.4]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, 0, -1.01]}><planeGeometry args={[0.8, 0.3]} /><meshBasicMaterial color="#f97316" /></mesh> <mesh position={[0, 0.1, -0.8]}><boxGeometry args={[1.0, 0.4, 0.6]} /><meshStandardMaterial color="#334155" /></mesh> </group> <group position={[0, 0.95, -0.1]}> <mesh><boxGeometry args={[0.9, 0.4, 1.2]} /><meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.5} /><Edges color={teamColor} /></mesh> <mesh position={[0.5, 0, -0.1]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[-0.5, 0, -0.1]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0.2, 0.25, -0.3]}><cylinderGeometry args={[0.15, 0.2, 0.1, 6]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> <group position={[0, 0.95, 0.5]}> <group rotation={[-0.05, 0, 0]}> <mesh position={[-0.15, 0, 1.0]}><boxGeometry args={[0.1, 0.15, 2.0]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0.15, 0, 1.0]}><boxGeometry args={[0.1, 0.15, 2.0]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0, 0.2]}><boxGeometry args={[0.5, 0.2, 0.6]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, 0, 2.0]}><boxGeometry args={[0.42, 0.18, 0.2]} /><meshStandardMaterial color="#334155" /> <mesh position={[0, 0, 0.11]}><planeGeometry args={[0.3, 0.1]} /><meshBasicMaterial color={teamColor} /></mesh> </mesh> </group> <pointLight ref={flashRef} position={[0, 0, 2.5]} color="#fbbf24" distance={6} decay={2} visible={false} /> </group> {isDecoy && (<mesh position={[0,0.5,0]}><boxGeometry args={[2.5, 2, 3.5]} /><meshBasicMaterial color={teamColor} wireframe transparent opacity={0.2} /></mesh>)} </group> );
    }

    if (isBanshee) return (<group scale={[2.8, 2.8, 2.8]}> {[0.9, 0, -1.1].map((z, i) => ( <group key={i}> <mesh position={[-0.65, 0.35, z]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.35, 0.35, 0.3, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh> <mesh position={[-0.81, 0.35, z]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.2, 0.2, 0.05, 8]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0.65, 0.35, z]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.35, 0.35, 0.3, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh> <mesh position={[0.81, 0.35, z]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.2, 0.2, 0.05, 8]} /><meshStandardMaterial color="#334155" /></mesh> </group> ))} <mesh position={[0, 0.5, -0.1]}><boxGeometry args={[1.0, 0.4, 2.8]} /><meshStandardMaterial color="#1e293b" /></mesh> <group position={[0, 0.9, 1.0]}> <mesh><boxGeometry args={[1.1, 0.8, 0.9]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#475569" /></mesh> <mesh position={[0, 0.15, 0.46]}><planeGeometry args={[1.0, 0.35]} /><meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} /></mesh> <mesh position={[0.3, 0.41, 0.2]}><boxGeometry args={[0.15, 0.05, 0.05]} /><meshBasicMaterial color="#f97316" /></mesh> <mesh position={[-0.3, 0.41, 0.2]}><boxGeometry args={[0.15, 0.05, 0.05]} /><meshBasicMaterial color="#f97316" /></mesh> <mesh position={[0.4, -0.1, 0.46]}><boxGeometry args={[0.15, 0.1, 0.02]} /><meshBasicMaterial color="#06b6d4" toneMapped={false} /></mesh> <mesh position={[-0.4, -0.1, 0.46]}><boxGeometry args={[0.15, 0.1, 0.02]} /><meshBasicMaterial color="#06b6d4" toneMapped={false} /></mesh> <mesh position={[0, -0.3, 0.5]}><boxGeometry args={[1.15, 0.3, 0.2]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> <group position={[0, 1.1, -0.5]}> <mesh><boxGeometry args={[1.2, 1.2, 1.6]} /><meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} /><Edges color="#1e293b" /></mesh> {[-1, 1].map((side) => ( <group key={side} position={[side * 0.61, 0, 0]} rotation={[0, side * Math.PI/2, 0]}> <mesh><planeGeometry args={[1.0, 0.8]} /><meshStandardMaterial color="#0f172a" /></mesh> {[0.2, 0, -0.2].map((y, i) => ( <group key={i} position={[0, y, 0.01]}> <mesh position={[-0.2, 0, 0]}><planeGeometry args={[0.3, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0.2, 0, 0]}><planeGeometry args={[0.3, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> ))} </group> ))} <group position={[-0.65, 0, 0.6]}> <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 1.2]} /><meshStandardMaterial color="#94a3b8" /></mesh> {[-0.4, -0.2, 0, 0.2, 0.4].map((y, i) => ( <mesh key={i} position={[0.05, y, 0]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.01, 0.01, 0.1]} /><meshStandardMaterial color="#94a3b8" /></mesh> ))} </group> <mesh position={[0.3, 0.61, -0.4]}><boxGeometry args={[0.4, 0.1, 0.4]} /><meshStandardMaterial color="#475569" /></mesh> </group> <group position={[0, 1.7, -0.5]} ref={radarRef}> <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.3, 0.4, 0.3]} /><meshStandardMaterial color="#1e293b" /></mesh> <group position={[0, 0.6, 0]} rotation={[0.2, 0, 0]}> <mesh><boxGeometry args={[1.4, 0.9, 0.2]} /><meshStandardMaterial color="#334155" metalness={0.6} /><Edges color="#475569" /></mesh> <mesh position={[0, 0, 0.11]}><planeGeometry args={[1.3, 0.8]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0, 0.12]}><boxGeometry args={[1.3, 0.02, 0.01]} /><meshBasicMaterial color="#475569" /></mesh> <mesh position={[0, 0, 0.12]} rotation={[0, 0, Math.PI/2]}><boxGeometry args={[0.8, 0.02, 0.01]} /><meshBasicMaterial color="#475569" /></mesh> <mesh position={[0, 0, 0.3]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#0f172a" /></mesh> {[-0.6, 0.6].map(x => ( <mesh key={x} position={[x, 0.4, 0.1]}><boxGeometry args={[0.05, 0.05, 0.02]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> ))} </group> </group> <group position={[0.4, 1.7, 0.4]} rotation={[0, -Math.PI/4, -Math.PI/6]}> <mesh><cylinderGeometry args={[0.3, 0.1, 0.1, 8]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, 0.05, 0]}><circleGeometry args={[0.28, 8]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> <group position={[-0.5, 1.7, 0.5]}> <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.02, 0.02, 0.8]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.03]} /><meshBasicMaterial color={teamColor} /></mesh> </group> <group position={[-0.5, 1.7, 0.3]}> <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.02, 0.02, 0.6]} /><meshStandardMaterial color="#94a3b8" /></mesh> </group> </group>);
    if (isCourier) { const payloadColor = courierPayload === 'eclipse' ? '#c084fc' : '#ffffff'; return ( <group scale={[2.2, 2.2, 2.2]}> <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.9, 0.4, 1.8]} /><meshStandardMaterial color="#475569" metalness={0.6} /><Edges color={teamColor} /></mesh> {[[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6]].map((pos, i) => (<mesh key={i} position={[pos[0], 0.2, pos[1]]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.2, 0.2, 0.2, 12]} /><meshStandardMaterial color="#1e293b" /></mesh>))} <mesh position={[0, 0.6, 0.5]}><boxGeometry args={[0.8, 0.4, 0.6]} /><meshStandardMaterial color="#334155" /><Edges color="#000000" /></mesh> {courierPayload && (<mesh position={[0, 0.5, -0.4]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.8, 8]} /><meshStandardMaterial color={payloadColor} emissive={payloadColor} emissiveIntensity={0.5} /><Edges color="#000000" /></mesh>)} <mesh position={[0, 0.9, 0.5]}><sphereGeometry args={[0.1, 6, 6]} /><meshBasicMaterial color="#f59e0b" /></mesh> </group> ); }
    if (isHelios) return (<Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}> <group scale={[2.6, 2.6, 2.6]}> <group position={[0, 0, 0]}> <mesh><boxGeometry args={[0.9, 0.5, 0.9]} /><meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} /><Edges color="#000000" /></mesh> <mesh position={[0.5, 0, 0]}><boxGeometry args={[0.15, 0.3, 0.6]} /><meshStandardMaterial color="#1e293b" /><Edges color="#475569" /></mesh> <mesh position={[-0.5, 0, 0]}><boxGeometry args={[0.15, 0.3, 0.6]} /><meshStandardMaterial color="#1e293b" /><Edges color="#475569" /></mesh> <mesh position={[0.53, 0, 0]} rotation={[0, 0, Math.PI/2]}><planeGeometry args={[0.2, 0.5]} /><meshBasicMaterial color="#facc15" /> </mesh> <mesh position={[-0.53, 0, 0]} rotation={[0, 0, -Math.PI/2]}><planeGeometry args={[0.2, 0.5]} /><meshBasicMaterial color="#facc15" /> </mesh> <mesh position={[0, 0.26, 0.46]}><boxGeometry args={[0.6, 0.05, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> <group position={[0, 0.3, 0]}> <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.1, 0.1, 0.1, 8]} /><meshStandardMaterial color="#475569" /></mesh> {[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].map((pos, i) => ( <group key={i} position={[pos[0], 0, pos[1]]}> <mesh><boxGeometry args={[0.45, 0.05, 0.45]} /><meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} /><Edges color="#38bdf8" linewidth={1} /></mesh> <mesh position={[0, 0.03, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[0.4, 0.4]} /><meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.2} /></mesh> </group> ))} </group> <group position={[0, -0.15, 0.55]} rotation={[0, 0, 0]}> <mesh rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.4, 0.2, 0.3, 16]} /><meshStandardMaterial color="#1e293b" /><Edges color="#334155" /></mesh> <mesh position={[0, 0, 0.16]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.35, 16]} /><meshBasicMaterial color="#ffedd5" /></mesh> <mesh position={[0, 0, 0.17]} rotation={[Math.PI/2, 0, 0]}><ringGeometry args={[0.1, 0.35, 16]} /><meshBasicMaterial color="#f97316" transparent opacity={0.8} /></mesh> <mesh position={[0, 0, 0.3]} rotation={[Math.PI/2, 0, 0]}><coneGeometry args={[0.05, 0.4, 16]} /><meshStandardMaterial color="#c2410c" /></mesh> <group position={[0, 0, 0]}> <mesh position={[0, 0, 0.25]} rotation={[0, 0, Math.PI/4]}><ringGeometry args={[0.4, 0.45, 4]} /><meshBasicMaterial color="#fdba74" transparent opacity={0.3} side={THREE.DoubleSide} /></mesh> <mesh position={[0, 0, 0.45]} scale={[1.3, 1.3, 1]} rotation={[0, 0, 0]}><ringGeometry args={[0.4, 0.42, 16]} /><meshBasicMaterial color="#fdba74" transparent opacity={0.15} side={THREE.DoubleSide} /></mesh> </group> </group> {[[ -0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35] ].map((pos, i) => ( <group key={i} position={[pos[0], -0.25, pos[1]]}> <mesh><cylinderGeometry args={[0.1, 0.08, 0.2]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.08, 0.5, 8, 1, true]} /><meshBasicMaterial color="#0ea5e9" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh> </group> ))} </group> </Float>);
    if (isSunPlate) { const chargeRadius = ABILITY_CONFIG.SUNPLATE_RADIUS * tileSize; const Panel = ({ offset, rotation }: { offset: [number, number, number], rotation: [number, number, number] }) => ( <group position={offset} rotation={rotation}> <mesh position={[0, 0, 0]}><boxGeometry args={[0.1, 0.1, 0.4]} /><meshStandardMaterial color="#64748b" /></mesh> <group position={[0, 0.05, 0.6]}> <mesh><boxGeometry args={[0.9, 0.05, 1.2]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /><Edges color="#475569" /></mesh> <mesh position={[0, 0.03, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[0.8, 1.1]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh position={[0, 0.04, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[0.8, 1.1, 3, 4]} /><meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.4} /></mesh> </group> </group> ); return ( <group scale={[2.8, 2.8, 2.8]}> <mesh position={[0, 0.4, 0]}><boxGeometry args={[1.6, 0.6, 1.6]} /><meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} /><Edges color={teamColor} /></mesh> {[[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].map((pos, i) => ( <group key={i} position={[pos[0], 0.3, pos[1]]}> <mesh><boxGeometry args={[0.5, 0.6, 0.8]} /><meshStandardMaterial color="#1e293b" /><Edges color="#334155" /></mesh> <mesh position={[pos[0] > 0 ? 0.26 : -0.26, -0.1, 0]} rotation={[0, Math.PI/2, 0]}><ringGeometry args={[0.15, 0.2, 8]} /><meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} /></mesh> </group> ))} {[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map((pos, i) => { const rotY = Math.atan2(pos[0], pos[1]); const yPos = isDeployed ? 0.1 : 0.4; return ( <group key={`leg-${i}`} position={[pos[0] * (isDeployed ? 0.9 : 0.6), yPos, pos[1] * (isDeployed ? 0.9 : 0.6)]} rotation={[0, rotY, 0]}> <mesh rotation={[isDeployed ? -Math.PI/4 : 0, 0, 0]}><boxGeometry args={[0.2, 0.6, 0.2]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.2, 0.3, 0.1, 6]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> ) })} <group position={[0, 0.8, 0]}> <mesh><cylinderGeometry args={[0.5, 0.6, 0.4, 8]} /><meshStandardMaterial color="#1e293b" /><Edges color="#38bdf8" /></mesh> <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[0.3, 16]} /><meshBasicMaterial color="#38bdf8" /></mesh> <Panel offset={[0, 0, -0.5]} rotation={[isDeployed ? -Math.PI/4 : -Math.PI/1.8, 0, 0]} /> <Panel offset={[0, 0, 0.5]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, Math.PI, 0]} /> <Panel offset={[0.5, 0, 0]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, -Math.PI/2, 0]} /> <Panel offset={[-0.5, 0, 0]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, Math.PI/2, 0]} /> </group> {isDeployed && ( <group> <mesh position={[0, 0.1, 0]} rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><circleGeometry args={[chargeRadius / 1.4, 16]} /><meshBasicMaterial color="#facc15" transparent opacity={0.1} depthWrite={false} /></mesh> <mesh position={[0, 0.15, 0]} rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><ringGeometry args={[(chargeRadius / 1.4) - 0.5, (chargeRadius / 1.4), 16]} /><meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} /></mesh> <mesh position={[0, 1.2, 0]} rotation={[Math.PI/2, 0, Date.now() * 0.001]}><ringGeometry args={[0.8, 0.9, 16]} /><meshBasicMaterial color="#fbbf24" transparent opacity={0.6} side={THREE.DoubleSide} /></mesh> </group> )} </group> ); }
    if (isBallista) {
        return (
            <group scale={[2.8, 2.8, 2.8]}>
                <group position={[0, 0.5, 0]}>
                    <mesh><boxGeometry args={[1.1, 0.6, 2.0]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#0f172a" /></mesh>
                    <mesh position={[0, -0.1, 1.1]} rotation={[Math.PI/6, 0, 0]}><boxGeometry args={[1.1, 0.4, 0.5]} /><meshStandardMaterial color="#334155" metalness={0.6} /></mesh>
                    <mesh position={[0, 0, -1.01]}><boxGeometry args={[0.8, 0.4, 0.1]} /><meshStandardMaterial color="#1e293b" /></mesh>
                    <mesh position={[0, 0, -1.02]}><planeGeometry args={[0.6, 0.2]} /><meshBasicMaterial color="#f97316" /></mesh>
                </group>
                <group position={[-0.9, 0.4, 0]}>
                    <mesh><boxGeometry args={[0.6, 0.7, 2.4]} /><meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} /><Edges color="#475569" /></mesh>
                    {[0.6, 0.2, -0.2, -0.6].map((z, i) => ( <mesh key={i} position={[-0.31, -0.1, z]} rotation={[0, Math.PI/2, 0]}><ringGeometry args={[0.12, 0.18, 8]} /><meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} /></mesh> ))}
                    <mesh position={[0, 0.36, 0]}><boxGeometry args={[0.5, 0.1, 2.0]} /><meshStandardMaterial color="#475569" /></mesh>
                </group>
                <group position={[0.9, 0.4, 0]}>
                    <mesh><boxGeometry args={[0.6, 0.7, 2.4]} /><meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} /><Edges color="#475569" /></mesh>
                    {[0.6, 0.2, -0.2, -0.6].map((z, i) => ( <mesh key={i} position={[0.31, -0.1, z]} rotation={[0, Math.PI/2, 0]}><ringGeometry args={[0.12, 0.18, 8]} /><meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} /></mesh> ))}
                    <mesh position={[0, 0.36, 0]}><boxGeometry args={[0.5, 0.1, 2.0]} /><meshStandardMaterial color="#475569" /></mesh>
                </group>
                <group position={[0, 0.9, 0.5]} rotation={[ammoState === 'armed' ? -Math.PI / 4 : -Math.PI/6, 0, 0]}>
                    <group position={[0, -0.4, 0.5]} rotation={[Math.PI/2, 0, 0]}>
                        <mesh position={[-0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.8]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
                        <mesh position={[0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.8]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
                        <mesh position={[-0.4, 0.2, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1]} /><meshBasicMaterial color="#f97316" /></mesh>
                        <mesh position={[0.4, 0.2, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1]} /><meshBasicMaterial color="#f97316" /></mesh>
                    </group>
                    <group position={[0, 0.2, -1.0]}>
                         <mesh position={[0, -0.2, 0]}><boxGeometry args={[1.2, 0.2, 3.0]} /><meshStandardMaterial color="#334155" metalness={0.6} /><Edges color="#0f172a" /></mesh>
                         <mesh position={[-0.5, 0.3, 0]}><boxGeometry args={[0.2, 0.8, 3.0]} /><meshStandardMaterial color="#475569" metalness={0.5} /><mesh position={[-0.11, 0, 0.8]}><boxGeometry args={[0.05, 0.4, 0.8]} /><meshBasicMaterial color="#0f172a" /></mesh></mesh>
                         <mesh position={[0.5, 0.3, 0]}><boxGeometry args={[0.2, 0.8, 3.0]} /><meshStandardMaterial color="#475569" metalness={0.5} /><mesh position={[0.11, 0, 0.8]}><boxGeometry args={[0.05, 0.4, 0.8]} /><meshBasicMaterial color="#0f172a" /></mesh></mesh>
                         <mesh position={[0, 0.75, -0.5]}><boxGeometry args={[1.2, 0.1, 0.6]} /><meshStandardMaterial color="#1e293b" /></mesh>
                         {(ammoState === 'armed' || ammoState === 'loading') && (
                             <group position={[0, 0.2, 0.2]} scale={ammoState === 'loading' ? [0.9, 0.9, 0.9] : [1,1,1]}>
                                 <mesh rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.3, 0.3, 2.4, 8]} /><meshStandardMaterial color="#e2e8f0" metalness={0.4} transparent={ammoState === 'loading'} opacity={ammoState === 'loading' ? 0.5 : 1.0} /></mesh>
                                 <mesh position={[0, 0, -1.4]} rotation={[Math.PI/2, 0, 0]}><coneGeometry args={[0.3, 0.6, 8]} /><meshStandardMaterial color={loadedAmmo === 'eclipse' ? '#a855f7' : '#ef4444'} emissive={loadedAmmo === 'eclipse' ? '#a855f7' : '#ef4444'} emissiveIntensity={0.5} transparent={ammoState === 'loading'} opacity={ammoState === 'loading' ? 0.5 : 1.0} /></mesh>
                                 <mesh position={[0, 0, -1.0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.31, 0.31, 0.2, 8]} /><meshBasicMaterial color="#f97316" transparent={ammoState === 'loading'} opacity={ammoState === 'loading' ? 0.5 : 1.0} /></mesh>
                                 {[0, Math.PI/2, Math.PI, -Math.PI/2].map((r, i) => ( <mesh key={i} position={[0, 0, 0.8]} rotation={[0, 0, r]}><boxGeometry args={[0.05, 0.8, 0.6]} /><meshStandardMaterial color="#475569" /></mesh> ))}
                             </group>
                         )}
                    </group>
                </group>
            </group>
        );
    }
    if (isMason) { const wheelRadius = 0.25; const wheelWidth = 0.2; const wheelZ = [0.6, 0, -0.6]; return ( <group scale={[2.8, 2.8, 2.8]}> <group position={[0, 0.45, 0]}> <mesh position={[0, 0, 0]}><boxGeometry args={[1.0, 0.5, 2.0]} /><meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.3} /> <Edges color="#7c2d12" /></mesh> <mesh position={[0.55, -0.15, 0]}><boxGeometry args={[0.2, 0.3, 1.8]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[-0.55, -0.15, 0]}><boxGeometry args={[0.2, 0.3, 1.8]} /><meshStandardMaterial color="#334155" /></mesh> <group position={[0, 0.35, 0.5]}> <mesh><boxGeometry args={[0.9, 0.5, 0.8]} /><meshStandardMaterial color="#f97316" /></mesh> <mesh position={[0, 0.1, 0.41]}><planeGeometry args={[0.7, 0.25]} /><meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} /></mesh> <mesh position={[0.3, 0.26, 0.2]}><boxGeometry args={[0.15, 0.05, 0.1]} /><meshBasicMaterial color="#fbbf24" /></mesh> <mesh position={[-0.3, 0.26, 0.2]}><boxGeometry args={[0.15, 0.05, 0.1]} /><meshBasicMaterial color="#fbbf24" /></mesh> </group> <mesh position={[0, 0.26, 0.6]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[0.15, 8]} /><meshBasicMaterial color="#fbbf24" transparent opacity={0.8} /></mesh> <group position={[0, 0.1, -0.6]}> <mesh><boxGeometry args={[0.9, 0.1, 0.8]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0.4, 0.15, 0]}><boxGeometry args={[0.05, 0.2, 0.8]} /><meshStandardMaterial color="#64748b" /></mesh> <mesh position={[-0.4, 0.15, 0]}><boxGeometry args={[0.05, 0.2, 0.8]} /><meshStandardMaterial color="#64748b" /></mesh> {cargo && cargo > 0 && ( <group> <mesh position={[0.2, 0.2, 0.2]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color="#78350f" /> <Edges color="#000000" /></mesh> <mesh position={[-0.15, 0.2, -0.1]}><boxGeometry args={[0.4, 0.3, 0.4]} /><meshStandardMaterial color="#334155" /> <Edges color="#ffffff" /></mesh> </group> )} </group> <group position={[0, -0.1, 1.05]}> <mesh><boxGeometry args={[1.0, 0.3, 0.2]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0.35, 0, 0.11]}><planeGeometry args={[0.1, 0.15]} /><meshBasicMaterial color="#3b82f6" toneMapped={false} /></mesh> <mesh position={[-0.35, 0, 0.11]}><planeGeometry args={[0.1, 0.15]} /><meshBasicMaterial color="#3b82f6" toneMapped={false} /></mesh> </group> </group> {[-1, 1].map((side) => ( <group key={`wheels-${side}`}> {wheelZ.map((z, i) => ( <group key={i} position={[side * 0.65, 0.25, z]}> <mesh rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.8} /></mesh> <mesh rotation={[0, 0, side * Math.PI/2]} position={[side * 0.11, 0, 0]}><cylinderGeometry args={[wheelRadius * 0.5, wheelRadius * 0.5, 0.05, 8]} /><meshStandardMaterial color="#f97316" /><mesh position={[0, 0.03, 0]}><cylinderGeometry args={[wheelRadius * 0.2, wheelRadius * 0.2, 0.02, 6]} /><meshStandardMaterial color="#1e293b" /></mesh></mesh> </group> ))} </group> ))} <group position={[0, 0.8, -0.4]}> <mesh><cylinderGeometry args={[0.3, 0.35, 0.3, 8]} /><meshStandardMaterial color="#334155" /></mesh> <group position={[0, 0.1, 0]} rotation={[Math.PI/6, 0, 0]}> <mesh position={[0, 0.6, 0]}><boxGeometry args={[0.25, 1.2, 0.25]} /><meshStandardMaterial color="#f97316" /><Edges color="#7c2d12" /></mesh> <mesh position={[0, 0.4, -0.2]}><cylinderGeometry args={[0.06, 0.06, 0.8]} /><meshStandardMaterial color="#cbd5e1" /></mesh> <group position={[0, 1.1, 0]} rotation={[-Math.PI/1.8, 0, 0]}> <mesh rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.18, 0.18, 0.3]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.2, 1.0, 0.2]} /><meshStandardMaterial color="#f97316" /><Edges color="#7c2d12" /></mesh> <group position={[0, 1.0, 0]} rotation={[Math.PI/2, 0, 0]}> <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0.25, 0]}><coneGeometry args={[0.02, 0.3, 8]} /><meshBasicMaterial color={constructionTargetId ? "#facc15" : "#ffffff"} /></mesh> {constructionTargetId && ( <pointLight color="#facc15" distance={2} intensity={2} decay={2} /> )} </group> </group> </group> </group> </group> ); }
    if (isMule) { return ( <group scale={[2.6, 2.6, 2.6]}> <group position={[0, 0.5, 0]}> <mesh><boxGeometry args={[1.0, 0.25, 2.4]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /></mesh> <mesh position={[0.6, -0.1, 0]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[-0.6, -0.1, 0]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#334155" /></mesh> </group> {[ { x: 0.65, z: 0.8 }, { x: -0.65, z: 0.8 }, { x: 0.65, z: -0.8 }, { x: -0.65, z: -0.8 } ].map((pos, i) => ( <group key={i} position={[pos.x, 0.35, pos.z]}> <mesh rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.35, 0.35, 0.3, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh> <mesh rotation={[0, 0, pos.x > 0 ? Math.PI/2 : -Math.PI/2]} position={[pos.x > 0 ? 0.16 : -0.16, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.05, 8]} /><meshStandardMaterial color="#475569" metalness={0.6} /></mesh> </group> ))} <group position={[0, 0.9, 0.7]}> <mesh><boxGeometry args={[1.0, 0.8, 0.9]} /><meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} /><Edges color="#64748b" threshold={15} /></mesh> <mesh position={[0, 0.1, 0.46]}><planeGeometry args={[0.9, 0.35]} /><meshStandardMaterial color="#020617" metalness={0.9} roughness={0.1} /></mesh> <mesh position={[0.4, 0.4, -0.3]}><cylinderGeometry args={[0.02, 0.02, 0.8]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0.3, 0.4, -0.3]}><cylinderGeometry args={[0.02, 0.02, 0.5]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0.35, -0.2, 0.46]}><planeGeometry args={[0.15, 0.1]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh> <mesh position={[-0.35, -0.2, 0.46]}><planeGeometry args={[0.15, 0.1]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh> <mesh position={[0.4, 0.41, 0.3]}><boxGeometry args={[0.1, 0.05, 0.1]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> <mesh position={[-0.4, 0.41, 0.3]}><boxGeometry args={[0.1, 0.05, 0.1]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> </group> <group position={[0, 1.0, -0.6]}> <mesh><boxGeometry args={[1.0, 0.9, 1.3]} /><meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" /></mesh> {[-1, 1].map((dir) => ( <group key={dir} position={[dir * 0.51, 0, 0]} rotation={[0, dir * Math.PI/2, 0]}> <mesh><planeGeometry args={[0.8, 0.5]} /><meshStandardMaterial color="#1e293b" /></mesh> {[0.1, 0, -0.1].map((y, i) => ( <mesh key={i} position={[0, y, 0.01]}><planeGeometry args={[0.6, 0.05]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> ))} </group> ))} <mesh position={[0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 1.3]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[-0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 1.3]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0, -0.66]}><boxGeometry args={[0.6, 0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> <mesh position={[0, 0.7, 0.1]}><boxGeometry args={[0.8, 0.6, 0.4]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> ); }
    if (isGuardian) return (<group scale={[2.6, 2.6, 2.6]}> <group position={[0, 0.6, 0]}> <mesh><boxGeometry args={[1.1, 0.5, 2.4]} /><meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" /></mesh> <mesh position={[0, 0.5, -0.4]}><boxGeometry args={[1.1, 0.7, 1.6]} /><meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" /></mesh> <group position={[0, 0.35, 0.7]}> <mesh><boxGeometry args={[1.0, 0.6, 0.9]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, 0.1, 0.46]}><planeGeometry args={[0.9, 0.3]} /><meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} /></mesh> <mesh position={[0.35, -0.1, 0.46]}><boxGeometry args={[0.2, 0.1, 0.05]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh> <mesh position={[-0.35, -0.1, 0.46]}><boxGeometry args={[0.2, 0.1, 0.05]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh> <mesh position={[0, -0.1, 0.46]}><boxGeometry args={[0.4, 0.15, 0.02]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> {[-1, 1].map((side) => ( <group key={side} position={[side * 0.56, 0.5, -0.4]} rotation={[0, side * Math.PI/2, 0]}> <mesh position={[0, 0, 0]}><planeGeometry args={[0.4, 0.15]} /><meshBasicMaterial color="#4ade80" toneMapped={false} side={THREE.DoubleSide} /></mesh> <mesh position={[0, 0, 0]}><planeGeometry args={[0.15, 0.4]} /><meshBasicMaterial color="#4ade80" toneMapped={false} side={THREE.DoubleSide} /></mesh> </group> ))} <mesh position={[0.56, -0.1, 0]}><boxGeometry args={[0.05, 0.05, 1.8]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh> <mesh position={[-0.56, -0.1, 0]}><boxGeometry args={[0.05, 0.05, 1.8]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh> </group> {[ { x: 0.65, z: 0.7 }, { x: -0.65, z: 0.7 }, { x: 0.65, z: -0.7 }, { x: -0.65, z: -0.7 } ].map((pos, i) => ( <group key={i} position={[pos.x, 0.35, pos.z]}> <mesh rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.35, 0.35, 0.3, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh> <mesh rotation={[0, 0, pos.x > 0 ? Math.PI/2 : -Math.PI/2]} position={[pos.x > 0 ? 0.16 : -0.16, 0, 0]}><cylinderGeometry args={[0.18, 0.18, 0.05, 8]} /><meshStandardMaterial color="#64748b" metalness={0.5} /><mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.08, 0.08, 0.02, 6]} /><meshStandardMaterial color="#334155" /></mesh></mesh> </group> ))} <group position={[0, 1.45, -0.4]}> <group position={[0, 0, 0]}> <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.35, 0.45, 0.2, 8]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.22, 0.22, 1.2, 8]} /><meshBasicMaterial color="#4ade80" transparent opacity={0.9} /></mesh> {[0.2, 0.5, 0.8, 1.1].map((y, i) => ( <group key={i} position={[0, y, 0]}> <mesh><torusGeometry args={[0.28, 0.06, 6, 8]} /><meshStandardMaterial color="#475569" metalness={0.8} /></mesh> {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, j) => ( <mesh key={j} rotation={[0, rot, 0]}><boxGeometry args={[0.6, 0.08, 0.08]} /><meshStandardMaterial color="#1e293b" /></mesh> ))} {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, j) => ( <mesh key={j} rotation={[0, rot, 0]} position={[0.3, 0, 0]}><boxGeometry args={[0.05, 0.12, 0.15]} /><meshBasicMaterial color="#4ade80" /></mesh> ))} </group> ))} <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[0.35, 0.35, 0.15, 8]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, 1.35, 0]}><sphereGeometry args={[0.18]} /><meshBasicMaterial color="#4ade80" /></mesh> </group> <group ref={radarRef} position={[0.6, 0.2, 0.2]} rotation={[0, 0, 0]}> <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.05, 0.08, 0.6]} /><meshStandardMaterial color="#475569" /></mesh> <group position={[0, 0.6, 0]} rotation={[0.4, 0, 0]}> <mesh><cylinderGeometry args={[0.35, 0.05, 0.15, 8]} /><meshStandardMaterial color="#334155" metalness={0.7} /></mesh> <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.05, 0.05, 0.2]} /><meshStandardMaterial color="#94a3b8" /></mesh> </group> </group> <group position={[-0.6, 0.1, 0]}> <mesh><boxGeometry args={[0.4, 0.3, 0.5]} /><meshStandardMaterial color="#334155" /><Edges color="#000000" /></mesh> <mesh position={[0, 0.16, 0]}><boxGeometry args={[0.3, 0.05, 0.4]} /><meshStandardMaterial color="#475569" /></mesh> </group> </group> {cooldowns.trophySystem !== undefined && cooldowns.trophySystem > 0 && ( <mesh position={[0, 2.5, -0.4]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="#ef4444" wireframe /></mesh> )} </group>);
    if (isGhost) return (<group scale={[2.4, 2.4, 2.4]}> <group position={[-0.2, 0.4, 0]}> <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.22, 0.45, 0.25]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, -0.05, 0.13]}><boxGeometry args={[0.18, 0.15, 0.05]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.45, 0.22]} /><meshStandardMaterial color="#475569" /> <mesh position={[0, 0, 0.115]}><planeGeometry args={[0.05, 0.3]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </mesh> <mesh position={[0, -0.6, 0.05]}><boxGeometry args={[0.22, 0.15, 0.35]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> <group position={[0.2, 0.4, 0]}> <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.22, 0.45, 0.25]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, -0.05, 0.13]}><boxGeometry args={[0.18, 0.15, 0.05]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.45, 0.22]} /><meshStandardMaterial color="#475569" /> <mesh position={[0, 0, 0.115]}><planeGeometry args={[0.05, 0.3]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </mesh> <mesh position={[0, -0.6, 0.05]}><boxGeometry args={[0.22, 0.15, 0.35]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> <group position={[0, 1.05, 0]}> <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.4, 0.3, 0.3]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, 0.15, 0.05]}><boxGeometry args={[0.55, 0.45, 0.35]} /><meshStandardMaterial color="#475569" /><Edges color="#1e293b" /></mesh> <mesh position={[0, 0.15, 0.23]}><planeGeometry args={[0.2, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0.21, -0.2, 0]}><boxGeometry args={[0.05, 0.1, 0.2]} /><meshBasicMaterial color="#f97316" /></mesh> <mesh position={[-0.21, -0.2, 0]}><boxGeometry args={[0.05, 0.1, 0.2]} /><meshBasicMaterial color="#f97316" /></mesh> </group> <group position={[0, 1.55, 0]}> <mesh><boxGeometry args={[0.3, 0.35, 0.35]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, 0.02, 0.18]}><boxGeometry args={[0.22, 0.1, 0.05]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh position={[0, 0.02, 0.21]}><planeGeometry args={[0.15, 0.02]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> <group position={[-0.35, 1.25, 0.1]} rotation={[0, 0.5, 0]}> <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, -0.2, 0.2]} rotation={[0.5, 0, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color="#334155" /></mesh> </group> <group position={[0.35, 1.25, 0.1]} rotation={[0, -0.5, 0]}> <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color="#475569" /></mesh> <mesh position={[0, -0.2, 0.2]} rotation={[0.5, 0, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color="#334155" /></mesh> </group> <group position={[0, 1.15, -0.25]}> <mesh><boxGeometry args={[0.5, 0.6, 0.3]} /><meshStandardMaterial color="#475569" /><Edges color="#1e293b" /></mesh> <mesh position={[0, 0, -0.16]}><boxGeometry args={[0.3, 0.4, 0.05]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0.15, 0.4, -0.1]} rotation={[0, 0, -0.2]}><boxGeometry args={[0.1, 0.8, 0.1]} /><meshStandardMaterial color="#64748b" /></mesh> <mesh position={[-0.15, 0.35, -0.1]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.08, 0.5, 0.08]} /><meshStandardMaterial color="#64748b" /></mesh> <mesh position={[0.26, 0.1, 0]}><boxGeometry args={[0.05, 0.05, 0.05]} /><meshBasicMaterial color="#f97316" /></mesh> </group> <group position={[0, 1.05, 0.5]}> <mesh><boxGeometry args={[0.1, 0.2, 0.6]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0.05, 0.4]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.4]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[0, 0.05, 0.7]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.3]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh position={[0, 0.15, 0.1]}><boxGeometry args={[0.06, 0.06, 0.2]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh position={[0, -0.05, -0.4]}><boxGeometry args={[0.08, 0.15, 0.3]} /><meshStandardMaterial color="#334155" /></mesh> </group> {isDampenerActive && ( <group> <mesh rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}><sphereGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 12, 12]} /><meshBasicMaterial color={teamColor} wireframe transparent opacity={0.1} /></mesh> <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}><ringGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize - 0.5, ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 16]} /><meshBasicMaterial color={teamColor} transparent opacity={0.3} /></mesh> </group> )} <pointLight ref={flashRef} position={[0, 1.05, 1.0]} color="#fbbf24" distance={3} decay={2} visible={false} /> </group>);
    if (isWasp) return (<Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}> <group scale={[2.4, 2.4, 2.4]}> <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 0.4, 1.0]} /><meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} /><Edges color="#1e293b" /></mesh> <mesh position={[0, 0, 0.55]}><boxGeometry args={[0.4, 0.3, 0.2]} /><meshStandardMaterial color="#334155" metalness={0.8} /></mesh> <mesh position={[-0.1, 0.05, 0.66]}><planeGeometry args={[0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0.1, 0.05, 0.66]}><planeGeometry args={[0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0, 0.1, -0.55]}><boxGeometry args={[0.4, 0.2, 0.2]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0.4, -0.3]}><boxGeometry args={[0.05, 0.4, 0.6]} /><meshStandardMaterial color="#64748b" /><Edges color="#334155" /></mesh> {[-1, 1].map((dir) => ( <group key={dir} position={[dir * 0.6, 0, 0.1]}> <mesh position={[dir * -0.2, 0, 0]}><boxGeometry args={[0.4, 0.1, 0.4]} /><meshStandardMaterial color="#475569" /></mesh> <mesh rotation={[Math.PI/2, 0, Math.PI/2]}><cylinderGeometry args={[0.3, 0.3, 1.2, 6]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" threshold={15} /></mesh> <mesh position={[0, 0, 0.61]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.05, 6]} /><meshStandardMaterial color="#1e293b" /></mesh> {[0, 60, 120, 180, 240, 300].map((angle, i) => { const rad = (angle * Math.PI) / 180; const r = 0.15; const x = Math.cos(rad) * r; const y = Math.sin(rad) * r; return ( <mesh key={i} position={[x, y, 0.65]} rotation={[Math.PI/2, 0, 0]}> <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} /><meshStandardMaterial color="#b91c1c" /> <mesh position={[0, 0.06, 0]}><sphereGeometry args={[0.04]} /><meshBasicMaterial color="#ef4444" /> </mesh> </mesh> ) })} <mesh position={[0, 0.31, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[0.4, 0.8]} /><meshBasicMaterial color={teamColor} transparent opacity={0.5} /></mesh> <mesh position={[0, 0, -0.61]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.2, 8]} /><meshBasicMaterial color={teamColor} transparent opacity={0.8} /></mesh> </group> ))} {[0.3, -0.3].map((x, i) => ( <group key={`vtol-${i}`} position={[x, -0.25, 0]}> <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.1, 0.4, 8, 1, true]} /><meshBasicMaterial color={teamColor} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh> </group> ))} <pointLight ref={flashRef} position={[0, 0, 0.8]} color="#fbbf24" distance={3} decay={2} visible={false} /> </group> </Float>);
    if (isDrone) return (<Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}> <group scale={[2.2, 2.2, 2.2]}> <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 0.25, 1.0]} /><meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} /><Edges color={teamColor} /></mesh> <mesh position={[0, 0.15, -0.1]}><boxGeometry args={[0.4, 0.15, 0.6]} /><meshStandardMaterial color="#475569" /></mesh> <group position={[0, 0, 0.55]}> <mesh rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.2, 8]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0, 0.11]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.08, 8]} /><meshBasicMaterial color="#0ea5e9" toneMapped={false} /> </mesh> <pointLight color="#0ea5e9" distance={2} intensity={2} decay={2} /> </group> {[{ x: 0.6, z: 0.6 }, { x: -0.6, z: 0.6 }, { x: 0.6, z: -0.6 }, { x: -0.6, z: -0.6 }].map((pos, i) => ( <group key={i} position={[pos.x, 0, pos.z]}> <mesh position={[-pos.x/2, 0, -pos.z/2]} rotation={[0, Math.atan2(pos.x, pos.z), 0]}><boxGeometry args={[0.1, 0.05, Math.hypot(pos.x, pos.z)]} /><meshStandardMaterial color="#64748b" /></mesh> <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.08, 0.08, 0.15]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh rotation={[Math.PI/2, 0, 0]}><ringGeometry args={[0.35, 0.38, 12]} /><meshStandardMaterial color="#334155" side={THREE.DoubleSide} /></mesh> <group position={[0, 0.05, 0]}><Rotor /></group> <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> ))} <mesh position={[0, 0.2, -0.4]} rotation={[-0.3, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 0.6]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0.5, -0.5]}><sphereGeometry args={[0.04]} /><meshBasicMaterial color={teamColor} /></mesh> </group> </Float>);

    return (
        <Float speed={4} rotationIntensity={0.5} floatIntensity={0.5} floatingRange={[0, 0.5]}>
             <group scale={[2.8, 2.8, 2.8]}>
                 <mesh><octahedronGeometry args={[1.5]} /><meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={isSelected ? 2 : 0.5} metalness={1} roughness={0} /><Edges color="#ffffff" /></mesh>
                <mesh position={[0, -0.9, 0]}><boxGeometry args={[0.6, 0.15, 2.4]} /><meshStandardMaterial color="#1e293b" /></mesh>
                <mesh position={[0, -0.9, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.6, 0.15, 2.4]} /><meshStandardMaterial color="#1e293b" /></mesh>
                <pointLight ref={flashRef} position={[0, 0, 1]} color="#fbbf24" distance={3} decay={2} visible={false} />
            </group>
        </Float>
    );
  };

  if (!visible) return null;

  // Calculate visual vision radius based on visionRange prop
  // Updated: User requested uniform 2-block radius for Drones (Helios/Wasp/Standard) unless surveillance is active
  const isSurveillanceActive = surveillance && surveillance.status === 'active';
  const effectiveVision = isSurveillanceActive ? ABILITY_CONFIG.SURVEILLANCE_RADIUS : 2;
  const visualVisionRadius = effectiveVision * tileSize;

  return (
    <group 
      ref={meshRef}
      name={`unit-${id}`}
      position={logicalWorldPos} 
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* ... previous selection ring ... */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee) ? 0.1 : -1.2, 0]}>
          <ringGeometry args={[tileSize * 0.5, tileSize * 0.55, 32]} />
          <meshBasicMaterial color={teamColor} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Hitbox */}
      <mesh position={[0, 0, 0]} visible={true}>
          <boxGeometry args={[3.5, 3.5, 3.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {renderModel()}

      {/* Lines, Effects, Html overlays */}
      {(tetherTargetId || isGuardian) && (<line><bufferGeometry ref={tetherLineRef} /><lineBasicMaterial color="#38bdf8" linewidth={2} transparent opacity={0.6} /></line>)}
      {isMason && constructionTargetId && (<line><bufferGeometry ref={constructionLineRef} /><lineBasicMaterial color="#f97316" linewidth={4} transparent opacity={0.8} /></line>)}
      {isDefenseDrone && (<line><bufferGeometry ref={laserRef} /><lineBasicMaterial color="#ef4444" linewidth={3} transparent opacity={0.8} /></line>)}
      
      {/* Updated Spotting Ring for Drones (Air & Ground Defense Drones) */}
      {(isAir || isDefenseDrone) && (
          <group>
              {/* Vertical Beam */}
              <mesh position={[0, -hoverHeight / 2, 0]} raycast={() => null}>
                  <cylinderGeometry args={[0.05, 0.05, hoverHeight, 8, 1, true]} />
                  <meshBasicMaterial color={teamColor} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false}/>
              </mesh>
              {/* Ground Ring - Explicit 2-Block Perimeter Visual */}
              <group position={[0, -hoverHeight + 0.2, 0]}>
                  <mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
                      <ringGeometry args={[visualVisionRadius - 0.5, visualVisionRadius, 16]} />
                      <meshBasicMaterial color={teamColor} transparent opacity={0.6} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
                      <ringGeometry args={[visualVisionRadius * 0.85, visualVisionRadius - 1, 16]} />
                      <meshBasicMaterial color={teamColor} transparent opacity={0.1} side={THREE.DoubleSide} />
                  </mesh>
                  <pointLight color={teamColor} intensity={1.5} distance={visualVisionRadius} decay={2} />
              </group>
          </group>
      )}

      {isHelios && (<group position={[0, -hoverHeight + 0.3, 0]}> <mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><ringGeometry args={[ABILITY_CONFIG.HELIOS_RADIUS * tileSize - 0.5, ABILITY_CONFIG.HELIOS_RADIUS * tileSize, 16]} /><meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} /></mesh><mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><circleGeometry args={[ABILITY_CONFIG.HELIOS_RADIUS * tileSize, 16]} /><meshBasicMaterial color="#facc15" transparent opacity={0.05} depthWrite={false} /></mesh></group>)}
      {isBanshee && jammerActive && (<group><mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}><ringGeometry args={[ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize, ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize + 0.2, 16]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} /></mesh><mesh rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}><sphereGeometry args={[ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize, 16, 16]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.05} /></mesh></group>)}
      {isHacked && hackerPos && (<group><Line points={[[0, 1, 0],[hackerPos.x - meshRef.current!.position.x, hackerPos.y - meshRef.current!.position.y, hackerPos.z - meshRef.current!.position.z]]} color="#c084fc" lineWidth={1} transparent opacity={0.5}/><mesh position={[0, 1.5, 0]} raycast={() => null}><octahedronGeometry args={[0.5]} /><meshBasicMaterial color="#c084fc" wireframe /></mesh></group>)}
      {isJammed && (<mesh position={[0, 2, 0]} raycast={() => null}><sphereGeometry args={[1]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.3} /></mesh>)}
      {isHacked && hackType === 'drain' && (<group><mesh position={[0, 1, 0]} rotation={[Math.random(), Math.random(), Math.random()]} raycast={() => null}><planeGeometry args={[0.5, 0.5]} /><meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} /></mesh><pointLight color="#3b82f6" intensity={2} distance={3} /></group>)}
      
      {/* Smoke Screen Effect */}
      {isTank && smoke?.active && (
          <group position={[0, 1.5, 0]} ref={smokeRef}>
                {/* Core Cloud */}
                <mesh rotation={[0, Date.now() * 0.001, 0]}>
                    <dodecahedronGeometry args={[tileSize * 0.8, 0]} />
                    <meshStandardMaterial color="#475569" transparent opacity={0.9} depthWrite={false} />
                </mesh>
                {/* Outer Puffs */}
                {[0, 2, 4].map(i => (
                    <mesh key={i} position={[Math.sin(i)*1.5, 0.5, Math.cos(i)*1.5]} scale={[0.6, 0.6, 0.6]}>
                        <dodecahedronGeometry args={[tileSize * 0.5, 0]} />
                        <meshStandardMaterial color="#64748b" transparent opacity={0.6} depthWrite={false} />
                    </mesh>
                ))}
          </group>
      )}

      {/* APS Shield Effect */}
      {isTank && aps?.active && (
          <group position={[0, 1, 0]} ref={apsRef}>
               <mesh rotation={[0, Date.now()*0.005, 0]}>
                   <sphereGeometry args={[tileSize * 0.9, 16, 16]} />
                   <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.3} />
               </mesh>
               <mesh rotation={[0, -Date.now()*0.005, Math.PI/4]}>
                   <sphereGeometry args={[tileSize * 0.8, 4, 8]} /> 
                   <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} />
               </mesh>
          </group>
      )}

      {/* Guardian Repair Beam */}
      {isGuardian && repairTargetPos && (
          <group>
            <Line
                points={[[0, 1.5, 0], [repairTargetPos.x - logicalWorldPos.x, repairTargetPos.y - logicalWorldPos.y + 0.5, repairTargetPos.z - logicalWorldPos.z]]}
                color="#4ade80"
                lineWidth={2}
                dashed
                dashScale={2}
            />
            {/* Target marker */}
            <mesh position={[repairTargetPos.x - logicalWorldPos.x, repairTargetPos.y - logicalWorldPos.y, repairTargetPos.z - logicalWorldPos.z]}>
                <octahedronGeometry args={[0.5]} />
                <meshBasicMaterial color="#4ade80" wireframe />
            </mesh>
          </group>
      )}

      {/* Stats Overlay - Always visible if damaged or selected or charging */}
      {(health < maxHealth || battery < maxBattery || isSelected || (chargingStatus && chargingStatus > 0)) && (
        <Html position={[0, 4, 0]} center zIndexRange={[50, 0]}>
            <div className="flex flex-col items-center pointer-events-none" style={{ width: '32px' }}>
                {/* Health */}
                <div className="w-full h-1 bg-slate-900 rounded-sm border border-slate-800 overflow-hidden mb-0.5">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(health / maxHealth) * 100}%` }} />
                </div>
                {/* Battery */}
                {maxBattery > 0 && (
                    <div className="w-full h-1 bg-slate-900 rounded-sm border border-slate-800 overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(battery / maxBattery) * 100}%` }} />
                    </div>
                )}
                {/* Secondary Battery (Banshee) */}
                {secondaryBattery !== undefined && maxSecondaryBattery !== undefined && (
                    <div className="w-full h-1 bg-slate-900 rounded-sm border border-slate-800 overflow-hidden mt-0.5">
                        <div className="h-full bg-fuchsia-500 transition-all duration-300" style={{ width: `${(secondaryBattery / maxSecondaryBattery) * 100}%` }} />
                    </div>
                )}
                {/* Charging Icon */}
                {chargingStatus !== undefined && chargingStatus > 0 && (
                    <div className="absolute -right-3 -top-2 text-yellow-400 text-[10px] animate-pulse font-bold shadow-black drop-shadow-md">
                        ⚡
                    </div>
                )}
            </div>
        </Html>
      )}

      {/* Action Menu (Over unit) */}
      {actionMenuOpen && (
        <Html position={[0, 4, 0]} center zIndexRange={[100, 0]}>
           <div className="flex flex-col gap-1 pointer-events-none">
              <div className="bg-slate-900/80 backdrop-blur border border-cyan-500/50 p-2 rounded flex flex-col gap-1 pointer-events-auto min-w-[120px]">
                  
                  {/* Unit Label Header */}
                  <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider border-b border-cyan-500/30 pb-1 mb-1 text-center whitespace-nowrap">
                      {unitStats.label}
                  </div>

                  {/* Actions based on unit type */}
                  {isTank && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('CANNON ATTACK'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Main Cannon</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('SMOKE SCREEN'); }} disabled={charges?.smoke === 0} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left flex justify-between"><span>Smoke</span><span>{charges?.smoke}</span></button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('ACTIVATE APS'); }} disabled={charges?.aps === 0} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left flex justify-between"><span>APS</span><span>{charges?.aps}</span></button>
                      </>
                  )}
                  {isGhost && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE DAMPENER'); }} className={`text-[10px] ${isDampenerActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Dampener</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('PHANTOM_DECOY_INIT'); }} disabled={teamCompute < COMPUTE_GATES.PHANTOM_DECOY} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Phantom Decoy</button>
                      </>
                  )}
                  {isBanshee && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_JAMMER'); }} className={`text-[10px] ${jammerActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Jammer</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('HARDLINE_TETHER'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Tether</button>
                      </>
                  )}
                  {isSunPlate && (
                      <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE ARRAY'); }} className={`text-[10px] ${isDeployed ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Array</button>
                  )}
                  {isDrone && (
                      <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOITERING SURVEILLANCE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Surveillance</button>
                  )}
                  {isBallista && (
                      <>
                          <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Missile Bay</div>
                          {ammoState === 'empty' && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); handleMenuAction('REQUEST_DELIVERY_ECLIPSE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-400 px-2 py-1 rounded text-left">Req Eclipse</button>
                                <button onClick={(e) => { e.stopPropagation(); handleMenuAction('REQUEST_DELIVERY_WP'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left">Req WP</button>
                                {missileInventory && missileInventory.eclipse > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_ECLIPSE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-400 px-2 py-1 rounded text-left">Load Eclipse ({missileInventory.eclipse})</button>
                                )}
                                {missileInventory && missileInventory.wp > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_WP'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left">Load WP ({missileInventory.wp})</button>
                                )}
                              </>
                          )}
                          {ammoState === 'loading' && (
                              <div className="text-[10px] text-yellow-500 animate-pulse px-2 py-1">Loading...</div>
                          )}
                          {ammoState === 'awaiting_delivery' && (
                              <div className="text-[10px] text-cyan-500 animate-pulse px-2 py-1">Awaiting Courier...</div>
                          )}
                          {ammoState === 'armed' && (
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FIRE_BALLISTA'); }} className="text-[10px] bg-red-900/80 hover:bg-red-800 text-white border border-red-500 px-2 py-1 rounded text-left font-bold animate-pulse">LAUNCH</button>
                          )}
                      </>
                  )}
                   {isWasp && (
                       <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FIRE_SWARM'); }} disabled={charges?.swarm === 0} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left flex justify-between"><span>Swarm</span><span>{charges?.swarm}</span></button>
                   )}
                   
                   {/* Restored Menu for Guardian */}
                   {isGuardian && (
                       <>
                           <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Status</div>
                           <div className="text-[10px] text-emerald-400 px-2 py-1 bg-slate-900/50 rounded mb-1">Auto-Repair Active</div>
                           <div className="text-[10px] text-blue-400 px-2 py-1 bg-slate-900/50 rounded">Trophy System Online</div>
                       </>
                   )}

                   {/* Restored Menu for Mason */}
                   {isMason && (
                       <>
                           <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Combat Engineer</div>
                           <div className="text-[10px] text-orange-400 px-2 py-1 bg-slate-900/50 rounded font-bold">Cargo: {cargo || 0} / 100</div>
                           {constructionTargetId ? (
                               <div className="text-[10px] text-yellow-400 px-2 py-1 animate-pulse">Building...</div>
                           ) : (
                               <div className="text-[10px] text-slate-500 px-2 py-1 italic">Idle</div>
                           )}
                       </>
                   )}
              </div>
           </div>
        </Html>
      )}

    </group>
  );
};

export default Unit;
