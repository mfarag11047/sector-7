
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
  id, type, unitClass, team, gridPos, isSelected, onSelect, tileSize, offset, path, onMoveStep, tileTypeMap, onDoubleClick, visionRange, visible = true, surveillance, isDampenerActive, isDeployed, actionMenuOpen, onAction, isDecoy, health, maxHealth, battery, maxBattery, secondaryBattery, maxSecondaryBattery, chargingStatus, cooldowns, repairTargetId, repairTargetPos, hackerPos, smoke, aps, charges, cargo, constructionTargetId, isTargetingMode, ammoState, loadedAmmo, loadingProgress, courierPayload, jammerActive, tetherTargetId, isJammed, isHacked, hackType, teamCompute, firingLaserAt, lastAttackTime
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Group>(null);
  const tetherLineRef = useRef<THREE.BufferGeometry>(null);
  const laserRef = useRef<THREE.BufferGeometry>(null);
  const constructionLineRef = useRef<THREE.BufferGeometry>(null);
  const scene = useThree((state) => state.scene); // Access scene for lookups
  const flashRef = useRef<THREE.PointLight>(null);

  const teamColor = TEAM_COLORS[team];
  const isTank = type === 'tank';
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

  const renderModel = () => {
    if (isDefenseDrone) {
        // Model based on the provided image: Spherical, metallic, red glowing eyes, spikes.
        const bodyColor = "#334155"; // Dark Slate / Blue-Grey
        const glowColor = firingLaserAt ? "#ff0000" : "#ef4444"; // Red (Brightens when firing)
        const detailColor = "#1e293b"; // Dark Slate
        
        return (
            <group scale={[3, 3, 3]}>
                {/* Main Sphere Body */}
                <mesh>
                    <sphereGeometry args={[0.6, 32, 32]} />
                    <meshStandardMaterial color={bodyColor} metalness={0.8} roughness={0.3} />
                </mesh>

                {/* Glowing Seams - Equator */}
                <mesh rotation={[Math.PI/2, 0, 0]}>
                    <torusGeometry args={[0.605, 0.015, 8, 48]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                </mesh>
                
                {/* Glowing Seam - Upper Lat */}
                <mesh position={[0, 0.35, 0]} rotation={[Math.PI/2, 0, 0]}>
                    <torusGeometry args={[0.48, 0.015, 8, 48]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                </mesh>

                 {/* Glowing Seam - Lower Lat */}
                 <mesh position={[0, -0.35, 0]} rotation={[Math.PI/2, 0, 0]}>
                    <torusGeometry args={[0.48, 0.015, 8, 48]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                </mesh>

                {/* --- MAIN EYE (Front) --- */}
                <group position={[0, 0, 0.52]} rotation={[Math.PI/2, 0, 0]}>
                    {/* Socket Housing */}
                    <mesh>
                        <cylinderGeometry args={[0.22, 0.25, 0.15, 16]} />
                        <meshStandardMaterial color={detailColor} metalness={0.9} />
                    </mesh>
                    {/* Inner Eye Glow */}
                    <mesh position={[0, 0.08, 0]}>
                         <sphereGeometry args={[0.15, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                         <meshBasicMaterial color={glowColor} toneMapped={false} />
                    </mesh>
                    {/* Lens/Pupil */}
                    <mesh position={[0, 0.2, 0]} rotation={[Math.PI/2, 0, 0]}>
                         <ringGeometry args={[0.06, 0.12, 16]} />
                         <meshBasicMaterial color="#ffffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
                    </mesh>
                </group>

                {/* --- AUX SENSORS (Sides/Back) --- */}
                {[90, 180, 270].map((deg) => {
                    const rad = deg * Math.PI / 180;
                    return (
                        <group key={deg} rotation={[0, rad, 0]}>
                            <group position={[0, 0, 0.55]} rotation={[Math.PI/2, 0, 0]}>
                                <mesh>
                                    <cylinderGeometry args={[0.1, 0.12, 0.1, 8]} />
                                    <meshStandardMaterial color={detailColor} />
                                </mesh>
                                <mesh position={[0, 0.06, 0]}>
                                    <sphereGeometry args={[0.06, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                                    <meshBasicMaterial color={glowColor} />
                                </mesh>
                            </group>
                        </group>
                    );
                })}

                {/* --- SPIKES --- */}
                {[
                    [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
                    [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]
                ].map((vec, i) => {
                    const dir = new THREE.Vector3(...vec).normalize();
                    const pos = dir.clone().multiplyScalar(0.58);
                    // Orient spike to face outward
                    const quaternion = new THREE.Quaternion();
                    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

                    return (
                        <group key={i} position={pos} quaternion={quaternion}>
                             {/* Mount */}
                            <mesh position={[0, 0.05, 0]}>
                                <cylinderGeometry args={[0.06, 0.08, 0.1, 6]} />
                                <meshStandardMaterial color={detailColor} />
                            </mesh>
                            {/* Spike */}
                            <mesh position={[0, 0.25, 0]}>
                                <coneGeometry args={[0.03, 0.4, 8]} />
                                <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} />
                            </mesh>
                        </group>
                    );
                })}

                {/* --- ANTENNAE --- */}
                <group position={[0.2, 0.55, -0.2]} rotation={[0, 0, -0.2]}>
                    <mesh position={[0, 0.2, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.6]} />
                        <meshStandardMaterial color="#94a3b8" metalness={1} />
                    </mesh>
                    <mesh position={[0, 0.5, 0]}>
                        <sphereGeometry args={[0.03]} />
                        <meshBasicMaterial color={glowColor} />
                    </mesh>
                </group>
                
                <group position={[-0.2, 0.55, -0.1]} rotation={[0.1, 0, 0.2]}>
                     <mesh position={[0, 0.15, 0]}>
                        <cylinderGeometry args={[0.015, 0.015, 0.4]} />
                        <meshStandardMaterial color="#94a3b8" metalness={1} />
                    </mesh>
                </group>

                {/* --- BASE EMITTER (Bottom) --- */}
                <group position={[0, -0.6, 0]}>
                    <mesh rotation={[Math.PI, 0, 0]}>
                         <cylinderGeometry args={[0.2, 0.3, 0.15, 6]} />
                         <meshStandardMaterial color={detailColor} />
                    </mesh>
                    <mesh position={[0, -0.1, 0]}>
                         <cylinderGeometry args={[0.1, 0.1, 0.1, 8]} />
                         <meshBasicMaterial color={glowColor} transparent opacity={0.8} />
                    </mesh>
                </group>
            </group>
        );
    }
    
    if (isTank) {
        const treadLength = 2.2;
        const treadWidth = 0.5;
        const treadHeight = 0.6;
        const treadX = 0.85;
        const wheelCount = 5;
        const wheelRadius = 0.15;
        
        return (
            <group scale={[2.6, 2.6, 2.6]}>
                {/* --- LEFT TREAD --- */}
                <group position={[-treadX, 0.3, 0]}>
                    <mesh>
                        <boxGeometry args={[treadWidth, treadHeight, treadLength]} />
                        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
                        <Edges color="#1e293b" threshold={15} />
                    </mesh>
                    {/* Glowing Wheels */}
                    {Array.from({length: wheelCount}).map((_, i) => (
                        <mesh key={i} position={[treadWidth/2 + 0.02, -0.15, (i - (wheelCount-1)/2) * (treadLength/wheelCount) * 0.8]} rotation={[0, Math.PI/2, 0]}>
                            <ringGeometry args={[wheelRadius * 0.6, wheelRadius, 16]} />
                            <meshBasicMaterial color={teamColor} toneMapped={false} side={THREE.DoubleSide} />
                        </mesh>
                    ))}
                     {/* Outer Armor Plate on Tread */}
                     <mesh position={[-0.1, 0.1, 0]}>
                         <boxGeometry args={[0.1, 0.4, treadLength * 0.8]} />
                         <meshStandardMaterial color="#475569" />
                     </mesh>
                </group>

                {/* --- RIGHT TREAD --- */}
                <group position={[treadX, 0.3, 0]}>
                    <mesh>
                        <boxGeometry args={[treadWidth, treadHeight, treadLength]} />
                        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
                        <Edges color="#1e293b" threshold={15} />
                    </mesh>
                     {/* Glowing Wheels */}
                     {Array.from({length: wheelCount}).map((_, i) => (
                        <mesh key={i} position={[-treadWidth/2 - 0.02, -0.15, (i - (wheelCount-1)/2) * (treadLength/wheelCount) * 0.8]} rotation={[0, Math.PI/2, 0]}>
                            <ringGeometry args={[wheelRadius * 0.6, wheelRadius, 16]} />
                            <meshBasicMaterial color={teamColor} toneMapped={false} side={THREE.DoubleSide} />
                        </mesh>
                    ))}
                     {/* Outer Armor Plate on Tread */}
                     <mesh position={[0.1, 0.1, 0]}>
                         <boxGeometry args={[0.1, 0.4, treadLength * 0.8]} />
                         <meshStandardMaterial color="#475569" />
                     </mesh>
                </group>

                {/* --- MAIN HULL --- */}
                <group position={[0, 0.5, 0]}>
                    {/* Center Block */}
                    <mesh>
                        <boxGeometry args={[1.2, 0.5, 2.0]} />
                        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
                        <Edges color="#000000" />
                    </mesh>
                    {/* Front Slope */}
                    <mesh position={[0, -0.1, 1.2]}>
                        <boxGeometry args={[1.0, 0.3, 0.4]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                     {/* Rear Vents (Orange) */}
                    <mesh position={[0, 0, -1.01]}>
                        <planeGeometry args={[0.8, 0.3]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                     {/* Rear Engine Block */}
                     <mesh position={[0, 0.1, -0.8]}>
                         <boxGeometry args={[1.0, 0.4, 0.6]} />
                         <meshStandardMaterial color="#334155" />
                     </mesh>
                </group>

                {/* --- TURRET --- */}
                <group position={[0, 0.95, -0.1]}>
                     {/* Turret Base */}
                     <mesh>
                         <boxGeometry args={[0.9, 0.4, 1.2]} />
                         <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.5} />
                         <Edges color={teamColor} />
                     </mesh>
                     {/* Side Armor on Turret */}
                     <mesh position={[0.5, 0, -0.1]}>
                          <boxGeometry args={[0.2, 0.3, 1.0]} />
                          <meshStandardMaterial color="#475569" />
                     </mesh>
                     <mesh position={[-0.5, 0, -0.1]}>
                          <boxGeometry args={[0.2, 0.3, 1.0]} />
                          <meshStandardMaterial color="#475569" />
                     </mesh>
                     
                     {/* Top Hatch/Sensor */}
                     <mesh position={[0.2, 0.25, -0.3]}>
                         <cylinderGeometry args={[0.15, 0.2, 0.1, 6]} />
                         <meshStandardMaterial color="#1e293b" />
                     </mesh>
                </group>

                {/* --- BARREL (Railgun Style) --- */}
                <group position={[0, 0.95, 0.5]}> 
                    {/* Pivot Point */}
                    <group rotation={[-0.05, 0, 0]}> {/* Slight Upward Angle */}
                         {/* Left Rail */}
                         <mesh position={[-0.15, 0, 1.0]}>
                             <boxGeometry args={[0.1, 0.15, 2.0]} />
                             <meshStandardMaterial color="#94a3b8" />
                         </mesh>
                         {/* Right Rail */}
                         <mesh position={[0.15, 0, 1.0]}>
                             <boxGeometry args={[0.1, 0.15, 2.0]} />
                             <meshStandardMaterial color="#94a3b8" />
                         </mesh>
                         {/* Center Grip/Base */}
                         <mesh position={[0, 0, 0.2]}>
                             <boxGeometry args={[0.5, 0.2, 0.6]} />
                             <meshStandardMaterial color="#475569" />
                         </mesh>
                         {/* Muzzle Connection */}
                         <mesh position={[0, 0, 2.0]}>
                             <boxGeometry args={[0.42, 0.18, 0.2]} />
                             <meshStandardMaterial color="#334155" />
                             {/* Glow Tip */}
                             <mesh position={[0, 0, 0.11]}>
                                 <planeGeometry args={[0.3, 0.1]} />
                                 <meshBasicMaterial color={teamColor} />
                             </mesh>
                         </mesh>
                    </group>
                    <pointLight ref={flashRef} position={[0, 0, 2.5]} color="#fbbf24" distance={6} decay={2} visible={false} />
                </group>
                 
                 {isDecoy && (<mesh position={[0,0.5,0]}><boxGeometry args={[2.5, 2, 3.5]} /><meshBasicMaterial color={teamColor} wireframe transparent opacity={0.2} /></mesh>)}
            </group>
        );
    }

    if (isBanshee) {
        return (
            <group scale={[2.8, 2.8, 2.8]}>
                {/* --- CHASSIS & WHEELS --- */}
                {/* 6 Wheels */}
                {[0.9, 0, -1.1].map((z, i) => (
                    <group key={i}>
                        {/* Left Wheel */}
                        <mesh position={[-0.65, 0.35, z]} rotation={[0, 0, Math.PI/2]}>
                             <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
                             <meshStandardMaterial color="#0f172a" roughness={0.9} />
                        </mesh>
                        <mesh position={[-0.81, 0.35, z]} rotation={[0, 0, Math.PI/2]}>
                             <cylinderGeometry args={[0.2, 0.2, 0.05, 8]} />
                             <meshStandardMaterial color="#334155" />
                        </mesh>
                        {/* Right Wheel */}
                        <mesh position={[0.65, 0.35, z]} rotation={[0, 0, Math.PI/2]}>
                             <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
                             <meshStandardMaterial color="#0f172a" roughness={0.9} />
                        </mesh>
                        <mesh position={[0.81, 0.35, z]} rotation={[0, 0, Math.PI/2]}>
                             <cylinderGeometry args={[0.2, 0.2, 0.05, 8]} />
                             <meshStandardMaterial color="#334155" />
                        </mesh>
                    </group>
                ))}

                {/* Main Chassis Frame */}
                <mesh position={[0, 0.5, -0.1]}>
                    <boxGeometry args={[1.0, 0.4, 2.8]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>

                {/* --- CABIN (Front) --- */}
                <group position={[0, 0.9, 1.0]}>
                    {/* Main Cab Body */}
                    <mesh>
                        <boxGeometry args={[1.1, 0.8, 0.9]} />
                        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
                        <Edges color="#475569" />
                    </mesh>
                    {/* Windshield */}
                    <mesh position={[0, 0.15, 0.46]}>
                        <planeGeometry args={[1.0, 0.35]} />
                        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
                    </mesh>
                    {/* Roof Lights (Orange) */}
                    <mesh position={[0.3, 0.41, 0.2]}>
                        <boxGeometry args={[0.15, 0.05, 0.05]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                    <mesh position={[-0.3, 0.41, 0.2]}>
                        <boxGeometry args={[0.15, 0.05, 0.05]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                    {/* Headlights (Cyan Neon) */}
                    <mesh position={[0.4, -0.1, 0.46]}>
                        <boxGeometry args={[0.15, 0.1, 0.02]} />
                        <meshBasicMaterial color="#06b6d4" toneMapped={false} />
                    </mesh>
                    <mesh position={[-0.4, -0.1, 0.46]}>
                        <boxGeometry args={[0.15, 0.1, 0.02]} />
                        <meshBasicMaterial color="#06b6d4" toneMapped={false} />
                    </mesh>
                    {/* Bumper */}
                    <mesh position={[0, -0.3, 0.5]}>
                        <boxGeometry args={[1.15, 0.3, 0.2]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                </group>

                {/* --- ELECTRONICS MODULE (Rear) --- */}
                <group position={[0, 1.1, -0.5]}>
                    {/* Main Module Box */}
                    <mesh>
                        <boxGeometry args={[1.2, 1.2, 1.6]} />
                        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
                        <Edges color="#1e293b" />
                    </mesh>
                    
                    {/* Server Racks (Side Detail) */}
                    {[-1, 1].map((side) => (
                        <group key={side} position={[side * 0.61, 0, 0]} rotation={[0, side * Math.PI/2, 0]}>
                            {/* Rack Frame */}
                            <mesh>
                                <planeGeometry args={[1.0, 0.8]} />
                                <meshStandardMaterial color="#0f172a" />
                            </mesh>
                            {/* Glowing Bits */}
                            {[0.2, 0, -0.2].map((y, i) => (
                                <group key={i} position={[0, y, 0.01]}>
                                    <mesh position={[-0.2, 0, 0]}>
                                        <planeGeometry args={[0.3, 0.05]} />
                                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                                    </mesh>
                                    <mesh position={[0.2, 0, 0]}>
                                        <planeGeometry args={[0.3, 0.05]} />
                                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                                    </mesh>
                                </group>
                            ))}
                        </group>
                    ))}
                    
                    {/* Ladder (Left Side) */}
                    <group position={[-0.65, 0, 0.6]}>
                        <mesh position={[0, 0, 0]}>
                            <cylinderGeometry args={[0.02, 0.02, 1.2]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        {/* Rungs */}
                        {[-0.4, -0.2, 0, 0.2, 0.4].map((y, i) => (
                             <mesh key={i} position={[0.05, y, 0]} rotation={[0, 0, Math.PI/2]}>
                                 <cylinderGeometry args={[0.01, 0.01, 0.1]} />
                                 <meshStandardMaterial color="#94a3b8" />
                             </mesh>
                        ))}
                    </group>

                    {/* AC Units / Vents on Top */}
                    <mesh position={[0.3, 0.61, -0.4]}>
                        <boxGeometry args={[0.4, 0.1, 0.4]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                </group>

                {/* --- RADAR & ANTENNAS (Roof) --- */}
                {/* Rotating Radar Group */}
                <group position={[0, 1.7, -0.5]} ref={radarRef}>
                    {/* Pedestal */}
                    <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[0.3, 0.4, 0.3]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                    
                    {/* Large Rectangular Dish */}
                    <group position={[0, 0.6, 0]} rotation={[0.2, 0, 0]}> {/* Tilted slightly back */}
                        {/* Dish Backing */}
                        <mesh>
                            <boxGeometry args={[1.4, 0.9, 0.2]} />
                            <meshStandardMaterial color="#334155" metalness={0.6} />
                            <Edges color="#475569" />
                        </mesh>
                        {/* Dish Face (Grid Pattern Mock) */}
                        <mesh position={[0, 0, 0.11]}>
                            <planeGeometry args={[1.3, 0.8]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                        {/* Grid Lines */}
                        <mesh position={[0, 0, 0.12]}>
                             <boxGeometry args={[1.3, 0.02, 0.01]} />
                             <meshBasicMaterial color="#475569" />
                        </mesh>
                        <mesh position={[0, 0, 0.12]} rotation={[0, 0, Math.PI/2]}>
                             <boxGeometry args={[0.8, 0.02, 0.01]} />
                             <meshBasicMaterial color="#475569" />
                        </mesh>
                        
                        {/* Emitter Horn (Center) */}
                        <mesh position={[0, 0, 0.3]}>
                            <boxGeometry args={[0.2, 0.2, 0.2]} />
                            <meshStandardMaterial color="#0f172a" />
                        </mesh>
                        
                        {/* Warning Lights on Dish Corners */}
                        {[-0.6, 0.6].map(x => (
                            <mesh key={x} position={[x, 0.4, 0.1]}>
                                <boxGeometry args={[0.05, 0.05, 0.02]} />
                                <meshBasicMaterial color="#f97316" toneMapped={false} />
                            </mesh>
                        ))}
                    </group>
                </group>

                {/* Satellite Dish (Secondary) */}
                <group position={[0.4, 1.7, 0.4]} rotation={[0, -Math.PI/4, -Math.PI/6]}>
                     <mesh>
                         <cylinderGeometry args={[0.3, 0.1, 0.1, 16]} />
                         <meshStandardMaterial color="#475569" />
                     </mesh>
                     <mesh position={[0, 0.05, 0]}>
                         <circleGeometry args={[0.28, 16]} />
                         <meshStandardMaterial color="#1e293b" />
                     </mesh>
                </group>

                {/* Antennas (Fixed on Cab or Module) */}
                <group position={[-0.5, 1.7, 0.5]}>
                    <mesh position={[0, 0.4, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.8]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                    <mesh position={[0, 0.8, 0]}>
                        <sphereGeometry args={[0.03]} />
                        <meshBasicMaterial color={teamColor} />
                    </mesh>
                </group>
                <group position={[-0.5, 1.7, 0.3]}>
                    <mesh position={[0, 0.3, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.6]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                </group>
            </group>
        );
    }

    if (isCourier) {
        const payloadColor = courierPayload === 'eclipse' ? '#c084fc' : '#ffffff';
        return (
            <group scale={[2.2, 2.2, 2.2]}>
                <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.9, 0.4, 1.8]} /><meshStandardMaterial color="#475569" metalness={0.6} /><Edges color={teamColor} /></mesh>
                {[[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6]].map((pos, i) => (<mesh key={i} position={[pos[0], 0.2, pos[1]]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.2, 0.2, 0.2, 12]} /><meshStandardMaterial color="#1e293b" /></mesh>))}
                <mesh position={[0, 0.6, 0.5]}><boxGeometry args={[0.8, 0.4, 0.6]} /><meshStandardMaterial color="#334155" /><Edges color="#000000" /></mesh>
                {courierPayload && (<mesh position={[0, 0.5, -0.4]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.8, 8]} /><meshStandardMaterial color={payloadColor} emissive={payloadColor} emissiveIntensity={0.5} /><Edges color="#000000" /></mesh>)}
                <mesh position={[0, 0.9, 0.5]}><sphereGeometry args={[0.1, 6, 6]} /><meshBasicMaterial color="#f59e0b" /></mesh>
            </group>
        );
    }

    if (isHelios) {
        return (
            <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
                <group scale={[2.6, 2.6, 2.6]}>
                    {/* --- CHASSIS --- */}
                    <group position={[0, 0, 0]}>
                        {/* Central Block */}
                        <mesh>
                            <boxGeometry args={[0.9, 0.5, 0.9]} />
                            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
                            <Edges color="#000000" />
                        </mesh>
                        
                        {/* Side Armor Blocks */}
                        <mesh position={[0.5, 0, 0]}>
                            <boxGeometry args={[0.15, 0.3, 0.6]} />
                            <meshStandardMaterial color="#1e293b" />
                            <Edges color="#475569" />
                        </mesh>
                        <mesh position={[-0.5, 0, 0]}>
                            <boxGeometry args={[0.15, 0.3, 0.6]} />
                            <meshStandardMaterial color="#1e293b" />
                            <Edges color="#475569" />
                        </mesh>

                        {/* Caution Stripes (Yellow/Black) */}
                        <mesh position={[0.53, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                             <planeGeometry args={[0.2, 0.5]} />
                             <meshBasicMaterial color="#facc15" /> 
                        </mesh>
                         <mesh position={[-0.53, 0, 0]} rotation={[0, 0, -Math.PI/2]}>
                             <planeGeometry args={[0.2, 0.5]} />
                             <meshBasicMaterial color="#facc15" /> 
                        </mesh>
                        
                        {/* Team Color Strip on Front */}
                        <mesh position={[0, 0.26, 0.46]}>
                            <boxGeometry args={[0.6, 0.05, 0.05]} />
                            <meshBasicMaterial color={teamColor} toneMapped={false} />
                        </mesh>
                    </group>

                    {/* --- SOLAR ARRAY (Top) --- */}
                    <group position={[0, 0.3, 0]}>
                        {/* Central Hub */}
                        <mesh position={[0, -0.05, 0]}>
                            <cylinderGeometry args={[0.1, 0.1, 0.1, 8]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                        {/* 4 Panels */}
                        {[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].map((pos, i) => (
                            <group key={i} position={[pos[0], 0, pos[1]]}>
                                <mesh>
                                    <boxGeometry args={[0.45, 0.05, 0.45]} />
                                    <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
                                    <Edges color="#38bdf8" linewidth={1} />
                                </mesh>
                                <mesh position={[0, 0.03, 0]} rotation={[-Math.PI/2, 0, 0]}>
                                    <planeGeometry args={[0.4, 0.4]} />
                                    <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.2} />
                                </mesh>
                            </group>
                        ))}
                    </group>

                    {/* --- MICROWAVE EMITTER (Dish) --- */}
                    <group position={[0, -0.15, 0.55]} rotation={[0, 0, 0]}>
                        {/* Dish Housing */}
                        <mesh rotation={[Math.PI/2, 0, 0]}>
                             <cylinderGeometry args={[0.4, 0.2, 0.3, 32]} />
                             <meshStandardMaterial color="#1e293b" />
                             <Edges color="#334155" />
                        </mesh>
                        {/* Glowing Face */}
                        <mesh position={[0, 0, 0.16]} rotation={[Math.PI/2, 0, 0]}>
                            <circleGeometry args={[0.35, 32]} />
                            <meshBasicMaterial color="#ffedd5" />
                        </mesh>
                        <mesh position={[0, 0, 0.17]} rotation={[Math.PI/2, 0, 0]}>
                            <ringGeometry args={[0.1, 0.35, 32]} />
                            <meshBasicMaterial color="#f97316" transparent opacity={0.8} />
                        </mesh>
                        {/* Center Spike */}
                        <mesh position={[0, 0, 0.3]} rotation={[Math.PI/2, 0, 0]}>
                            <coneGeometry args={[0.05, 0.4, 16]} />
                            <meshStandardMaterial color="#c2410c" />
                        </mesh>
                        
                        {/* Wave Rings */}
                        <group position={[0, 0, 0]}> 
                             <mesh position={[0, 0, 0.25]} rotation={[0, 0, Math.PI/4]}>
                                 <ringGeometry args={[0.4, 0.45, 4]} />
                                 <meshBasicMaterial color="#fdba74" transparent opacity={0.3} side={THREE.DoubleSide} />
                             </mesh>
                             <mesh position={[0, 0, 0.45]} scale={[1.3, 1.3, 1]} rotation={[0, 0, 0]}>
                                 <ringGeometry args={[0.4, 0.42, 32]} />
                                 <meshBasicMaterial color="#fdba74" transparent opacity={0.15} side={THREE.DoubleSide} />
                             </mesh>
                        </group>
                    </group>

                    {/* --- THRUSTERS --- */}
                    {[
                        [-0.35, -0.35], [0.35, -0.35], 
                        [-0.35, 0.35], [0.35, 0.35]
                    ].map((pos, i) => (
                        <group key={i} position={[pos[0], -0.25, pos[1]]}>
                            <mesh>
                                <cylinderGeometry args={[0.1, 0.08, 0.2]} />
                                <meshStandardMaterial color="#0f172a" />
                            </mesh>
                            <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
                                <coneGeometry args={[0.08, 0.5, 8, 1, true]} />
                                <meshBasicMaterial color="#0ea5e9" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
                            </mesh>
                        </group>
                    ))}
                </group>
            </Float>
        );
    }

    if (isSunPlate) {
        const chargeRadius = ABILITY_CONFIG.SUNPLATE_RADIUS * tileSize;
        
        // Helper for a single solar panel wing
        // position is relative to center
        // deployedAngle is how much it opens up
        const Panel = ({ offset, rotation }: { offset: [number, number, number], rotation: [number, number, number] }) => (
            <group position={offset} rotation={rotation}>
                {/* Hinge/Arm */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[0.1, 0.1, 0.4]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
                {/* The Panel Itself */}
                {/* Centered on the hinge? No, offset so it folds out */}
                <group position={[0, 0.05, 0.6]}> 
                    <mesh>
                         <boxGeometry args={[0.9, 0.05, 1.2]} />
                         <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
                         <Edges color="#475569" />
                    </mesh>
                    {/* Solar Face (Blue Grid) */}
                    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI/2, 0, 0]}>
                         <planeGeometry args={[0.8, 1.1]} />
                         <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    <mesh position={[0, 0.04, 0]} rotation={[-Math.PI/2, 0, 0]}>
                         <planeGeometry args={[0.8, 1.1, 3, 4]} />
                         <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.4} />
                    </mesh>
                </group>
            </group>
        );

        return (
            <group scale={[2.8, 2.8, 2.8]}>
                {/* --- CHASSIS --- */}
                {/* Central Body */}
                <mesh position={[0, 0.4, 0]}>
                    <boxGeometry args={[1.6, 0.6, 1.6]} />
                    <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
                    <Edges color={teamColor} />
                </mesh>
                
                {/* 4 Tread Pods (Corner heavy look) */}
                {[[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].map((pos, i) => (
                    <group key={i} position={[pos[0], 0.3, pos[1]]}>
                        <mesh>
                            <boxGeometry args={[0.5, 0.6, 0.8]} />
                            <meshStandardMaterial color="#1e293b" />
                            <Edges color="#334155" />
                        </mesh>
                        {/* Neon Wheel Ring */}
                        <mesh position={[pos[0] > 0 ? 0.26 : -0.26, -0.1, 0]} rotation={[0, Math.PI/2, 0]}>
                            <ringGeometry args={[0.15, 0.2, 16]} />
                            <meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} />
                        </mesh>
                    </group>
                ))}

                {/* --- DEPLOYABLE LEGS --- */}
                {/* Extend out when deployed */}
                {[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map((pos, i) => {
                     // Angle legs outward
                     const rotY = Math.atan2(pos[0], pos[1]);
                     
                     // Animation: Move down and out
                     const yPos = isDeployed ? 0.1 : 0.4;
                     
                     return (
                         <group key={`leg-${i}`} position={[pos[0] * (isDeployed ? 0.9 : 0.6), yPos, pos[1] * (isDeployed ? 0.9 : 0.6)]} rotation={[0, rotY, 0]}>
                              {/* Leg Strut */}
                              <mesh rotation={[isDeployed ? -Math.PI/4 : 0, 0, 0]}>
                                  <boxGeometry args={[0.2, 0.6, 0.2]} />
                                  <meshStandardMaterial color="#475569" />
                              </mesh>
                              {/* Foot */}
                              <mesh position={[0, -0.3, 0]}>
                                  <cylinderGeometry args={[0.2, 0.3, 0.1, 6]} />
                                  <meshStandardMaterial color="#1e293b" />
                              </mesh>
                         </group>
                     )
                })}

                {/* --- SOLAR ARRAY (Flower unfold) --- */}
                <group position={[0, 0.8, 0]}>
                    {/* Center Core */}
                    <mesh>
                        <cylinderGeometry args={[0.5, 0.6, 0.4, 8]} />
                        <meshStandardMaterial color="#1e293b" />
                        <Edges color="#38bdf8" />
                    </mesh>
                    {/* Glowing Core Top */}
                    <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <circleGeometry args={[0.3, 16]} />
                        <meshBasicMaterial color="#38bdf8" />
                    </mesh>

                    {/* 4 Panels */}
                    {/* North (Z-) */}
                    <Panel offset={[0, 0, -0.5]} rotation={[isDeployed ? -Math.PI/4 : -Math.PI/1.8, 0, 0]} />
                    {/* South (Z+) */}
                    <Panel offset={[0, 0, 0.5]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, Math.PI, 0]} />
                    {/* East (X+) */}
                    <Panel offset={[0.5, 0, 0]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, -Math.PI/2, 0]} />
                    {/* West (X-) */}
                    <Panel offset={[-0.5, 0, 0]} rotation={[isDeployed ? Math.PI/4 : Math.PI/1.8, Math.PI/2, 0]} />
                </group>

                {/* --- EFFECTS --- */}
                {isDeployed && (
                    <group>
                        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
                            <circleGeometry args={[chargeRadius / 1.4, 64]} />
                            <meshBasicMaterial color="#facc15" transparent opacity={0.1} depthWrite={false} />
                        </mesh>
                        <mesh position={[0, 0.15, 0]} rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
                            <ringGeometry args={[(chargeRadius / 1.4) - 0.5, (chargeRadius / 1.4), 64]} />
                            <meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} />
                        </mesh>
                        {/* Rotating ring above */}
                        <mesh position={[0, 1.2, 0]} rotation={[Math.PI/2, 0, Date.now() * 0.001]}>
                             <ringGeometry args={[0.8, 0.9, 32]} />
                             <meshBasicMaterial color="#fbbf24" transparent opacity={0.6} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                )}
            </group>
        );
    }

    if (isBallista) {
        return (
            <group scale={[2.8, 2.8, 2.8]}>
                {/* --- CHASSIS --- */}
                <group position={[0, 0.5, 0]}>
                    {/* Central Hull Body */}
                    <mesh>
                         <boxGeometry args={[1.1, 0.6, 2.0]} />
                         <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
                         <Edges color="#0f172a" />
                    </mesh>
                    
                    {/* Front Armor Slope */}
                    <mesh position={[0, -0.1, 1.1]} rotation={[Math.PI/6, 0, 0]}>
                         <boxGeometry args={[1.1, 0.4, 0.5]} />
                         <meshStandardMaterial color="#334155" metalness={0.6} />
                    </mesh>

                    {/* Rear Engine Vents */}
                    <mesh position={[0, 0, -1.01]}>
                         <boxGeometry args={[0.8, 0.4, 0.1]} />
                         <meshStandardMaterial color="#1e293b" />
                    </mesh>
                    <mesh position={[0, 0, -1.02]}>
                         <planeGeometry args={[0.6, 0.2]} />
                         <meshBasicMaterial color="#f97316" />
                    </mesh>
                </group>

                {/* --- TREAD PODS --- */}
                {/* Left */}
                <group position={[-0.9, 0.4, 0]}>
                    {/* Main Tread Block */}
                    <mesh>
                        <boxGeometry args={[0.6, 0.7, 2.4]} />
                        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} />
                        <Edges color="#475569" />
                    </mesh>
                    {/* Glowing Wheel Rings */}
                    {[0.6, 0.2, -0.2, -0.6].map((z, i) => (
                         <mesh key={i} position={[-0.31, -0.1, z]} rotation={[0, Math.PI/2, 0]}>
                             <ringGeometry args={[0.12, 0.18, 16]} />
                             <meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} />
                         </mesh>
                    ))}
                    {/* Armor Plating on top of tread */}
                    <mesh position={[0, 0.36, 0]}>
                         <boxGeometry args={[0.5, 0.1, 2.0]} />
                         <meshStandardMaterial color="#475569" />
                    </mesh>
                </group>

                {/* Right */}
                <group position={[0.9, 0.4, 0]}>
                    {/* Main Tread Block */}
                    <mesh>
                        <boxGeometry args={[0.6, 0.7, 2.4]} />
                        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} />
                        <Edges color="#475569" />
                    </mesh>
                    {/* Glowing Wheel Rings */}
                    {[0.6, 0.2, -0.2, -0.6].map((z, i) => (
                         <mesh key={i} position={[0.31, -0.1, z]} rotation={[0, Math.PI/2, 0]}>
                             <ringGeometry args={[0.12, 0.18, 16]} />
                             <meshBasicMaterial color={teamColor} side={THREE.DoubleSide} toneMapped={false} />
                         </mesh>
                    ))}
                     {/* Armor Plating on top of tread */}
                    <mesh position={[0, 0.36, 0]}>
                         <boxGeometry args={[0.5, 0.1, 2.0]} />
                         <meshStandardMaterial color="#475569" />
                    </mesh>
                </group>

                {/* --- LAUNCHER TURRET --- */}
                {/* Pivots from the back, angled up */}
                <group position={[0, 0.9, 0.5]} rotation={[ammoState === 'armed' ? -Math.PI / 4 : -Math.PI/6, 0, 0]}>
                    
                    {/* Hydraulic Pistons (Visual anchor) */}
                    <group position={[0, -0.4, 0.5]} rotation={[Math.PI/2, 0, 0]}>
                        <mesh position={[-0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.8]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
                        <mesh position={[0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.8]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} /></mesh>
                         {/* Glowing bits on pistons */}
                        <mesh position={[-0.4, 0.2, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1]} /><meshBasicMaterial color="#f97316" /></mesh>
                        <mesh position={[0.4, 0.2, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1]} /><meshBasicMaterial color="#f97316" /></mesh>
                    </group>

                    {/* Main Launch Rail Assembly */}
                    <group position={[0, 0.2, -1.0]}>
                         {/* Bottom Plate */}
                         <mesh position={[0, -0.2, 0]}>
                             <boxGeometry args={[1.2, 0.2, 3.0]} />
                             <meshStandardMaterial color="#334155" metalness={0.6} />
                             <Edges color="#0f172a" />
                         </mesh>
                         
                         {/* Side Rails */}
                         <mesh position={[-0.5, 0.3, 0]}>
                             <boxGeometry args={[0.2, 0.8, 3.0]} />
                             <meshStandardMaterial color="#475569" metalness={0.5} />
                             {/* Detail vents */}
                             <mesh position={[-0.11, 0, 0.8]}><boxGeometry args={[0.05, 0.4, 0.8]} /><meshBasicMaterial color="#0f172a" /></mesh>
                         </mesh>
                         <mesh position={[0.5, 0.3, 0]}>
                             <boxGeometry args={[0.2, 0.8, 3.0]} />
                             <meshStandardMaterial color="#475569" metalness={0.5} />
                             {/* Detail vents */}
                             <mesh position={[0.11, 0, 0.8]}><boxGeometry args={[0.05, 0.4, 0.8]} /><meshBasicMaterial color="#0f172a" /></mesh>
                         </mesh>

                         {/* Top Bridge / Brace */}
                         <mesh position={[0, 0.75, -0.5]}>
                             <boxGeometry args={[1.2, 0.1, 0.6]} />
                             <meshStandardMaterial color="#1e293b" />
                         </mesh>

                         {/* --- MISSILE --- */}
                         {(ammoState === 'armed' || ammoState === 'loading') && (
                             <group position={[0, 0.2, 0.2]} scale={ammoState === 'loading' ? [0.9, 0.9, 0.9] : [1,1,1]}>
                                 {/* Body */}
                                 <mesh rotation={[Math.PI/2, 0, 0]}>
                                     <cylinderGeometry args={[0.3, 0.3, 2.4, 16]} />
                                     <meshStandardMaterial 
                                        color="#e2e8f0" 
                                        metalness={0.4} 
                                        transparent={ammoState === 'loading'}
                                        opacity={ammoState === 'loading' ? 0.5 : 1.0}
                                     />
                                 </mesh>
                                 {/* Warhead Tip */}
                                 <mesh position={[0, 0, -1.4]} rotation={[Math.PI/2, 0, 0]}>
                                     <coneGeometry args={[0.3, 0.6, 16]} />
                                     <meshStandardMaterial 
                                        color={loadedAmmo === 'eclipse' ? '#a855f7' : '#ef4444'} 
                                        emissive={loadedAmmo === 'eclipse' ? '#a855f7' : '#ef4444'}
                                        emissiveIntensity={0.5}
                                        transparent={ammoState === 'loading'}
                                        opacity={ammoState === 'loading' ? 0.5 : 1.0}
                                     />
                                 </mesh>
                                 {/* Glowing Ring */}
                                 <mesh position={[0, 0, -1.0]} rotation={[Math.PI/2, 0, 0]}>
                                     <cylinderGeometry args={[0.31, 0.31, 0.2, 16]} />
                                     <meshBasicMaterial 
                                        color="#f97316" 
                                        transparent={ammoState === 'loading'}
                                        opacity={ammoState === 'loading' ? 0.5 : 1.0}
                                     />
                                 </mesh>
                                 {/* Rear Fins */}
                                 {[0, Math.PI/2, Math.PI, -Math.PI/2].map((r, i) => (
                                     <mesh key={i} position={[0, 0, 0.8]} rotation={[0, 0, r]}>
                                         <boxGeometry args={[0.05, 0.8, 0.6]} />
                                         <meshStandardMaterial color="#475569" />
                                     </mesh>
                                 ))}
                             </group>
                         )}
                    </group>
                </group>
            </group>
        );
    }

    if (isMason) {
        const wheelRadius = 0.25;
        const wheelWidth = 0.2;
        const wheelZ = [0.6, 0, -0.6];
        
        return (
            <group scale={[2.8, 2.8, 2.8]}>
                {/* --- CHASSIS --- */}
                <group position={[0, 0.45, 0]}>
                    {/* Main Body Block */}
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[1.0, 0.5, 2.0]} />
                        <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.3} /> {/* Industrial Orange */}
                        <Edges color="#7c2d12" />
                    </mesh>
                    
                    {/* Side Fenders / Running Boards */}
                    <mesh position={[0.55, -0.15, 0]}>
                        <boxGeometry args={[0.2, 0.3, 1.8]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    <mesh position={[-0.55, -0.15, 0]}>
                        <boxGeometry args={[0.2, 0.3, 1.8]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>

                    {/* Cab (Front) */}
                    <group position={[0, 0.35, 0.5]}>
                        <mesh>
                            <boxGeometry args={[0.9, 0.5, 0.8]} />
                            <meshStandardMaterial color="#f97316" />
                        </mesh>
                        {/* Windshield */}
                        <mesh position={[0, 0.1, 0.41]}>
                            <planeGeometry args={[0.7, 0.25]} />
                            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
                        </mesh>
                        {/* Roof Lights / Sensors */}
                        <mesh position={[0.3, 0.26, 0.2]}>
                            <boxGeometry args={[0.15, 0.05, 0.1]} />
                            <meshBasicMaterial color="#fbbf24" />
                        </mesh>
                        <mesh position={[-0.3, 0.26, 0.2]}>
                            <boxGeometry args={[0.15, 0.05, 0.1]} />
                            <meshBasicMaterial color="#fbbf24" />
                        </mesh>
                    </group>

                    {/* Glowing Engine Vent on Hood */}
                    <mesh position={[0, 0.26, 0.6]} rotation={[-Math.PI/2, 0, 0]}>
                        <circleGeometry args={[0.15, 16]} />
                        <meshBasicMaterial color="#fbbf24" transparent opacity={0.8} />
                    </mesh>

                    {/* Rear Deck (Flatbed) */}
                    <group position={[0, 0.1, -0.6]}>
                        <mesh>
                            <boxGeometry args={[0.9, 0.1, 0.8]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                        {/* Side Rails */}
                        <mesh position={[0.4, 0.15, 0]}>
                            <boxGeometry args={[0.05, 0.2, 0.8]} />
                            <meshStandardMaterial color="#64748b" />
                        </mesh>
                        <mesh position={[-0.4, 0.15, 0]}>
                            <boxGeometry args={[0.05, 0.2, 0.8]} />
                            <meshStandardMaterial color="#64748b" />
                        </mesh>
                        
                        {/* Cargo (Crates) */}
                        {cargo && cargo > 0 && (
                            <group>
                                <mesh position={[0.2, 0.2, 0.2]}>
                                    <boxGeometry args={[0.3, 0.3, 0.3]} />
                                    <meshStandardMaterial color="#78350f" /> {/* Wood */}
                                    <Edges color="#000000" />
                                </mesh>
                                <mesh position={[-0.15, 0.2, -0.1]}>
                                    <boxGeometry args={[0.4, 0.3, 0.4]} />
                                    <meshStandardMaterial color="#334155" /> {/* Metal crate */}
                                    <Edges color="#ffffff" />
                                </mesh>
                            </group>
                        )}
                    </group>

                    {/* Front Bumper & Blue Lights */}
                    <group position={[0, -0.1, 1.05]}>
                        <mesh>
                            <boxGeometry args={[1.0, 0.3, 0.2]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                        {/* Blue Neon Lights */}
                        <mesh position={[0.35, 0, 0.11]}>
                            <planeGeometry args={[0.1, 0.15]} />
                            <meshBasicMaterial color="#3b82f6" toneMapped={false} />
                        </mesh>
                        <mesh position={[-0.35, 0, 0.11]}>
                            <planeGeometry args={[0.1, 0.15]} />
                            <meshBasicMaterial color="#3b82f6" toneMapped={false} />
                        </mesh>
                    </group>
                </group>

                {/* --- WHEELS --- */}
                {[-1, 1].map((side) => (
                    <group key={`wheels-${side}`}>
                        {wheelZ.map((z, i) => (
                            <group key={i} position={[side * 0.65, 0.25, z]}>
                                <mesh rotation={[0, 0, Math.PI/2]}>
                                    <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
                                    <meshStandardMaterial color="#0f172a" roughness={0.8} />
                                </mesh>
                                {/* Hubcap */}
                                <mesh rotation={[0, 0, side * Math.PI/2]} position={[side * 0.11, 0, 0]}>
                                    <cylinderGeometry args={[wheelRadius * 0.5, wheelRadius * 0.5, 0.05, 8]} />
                                    <meshStandardMaterial color="#f97316" />
                                    <mesh position={[0, 0.03, 0]}>
                                        <cylinderGeometry args={[wheelRadius * 0.2, wheelRadius * 0.2, 0.02, 6]} />
                                        <meshStandardMaterial color="#1e293b" />
                                    </mesh>
                                </mesh>
                            </group>
                        ))}
                    </group>
                ))}

                {/* --- CRANE (Over-the-cab style) --- */}
                <group position={[0, 0.8, -0.4]}> 
                    {/* Base Swivel */}
                    <mesh>
                        <cylinderGeometry args={[0.3, 0.35, 0.3, 16]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    
                    {/* Main Lower Arm - Angled UP and Forward */}
                    <group position={[0, 0.1, 0]} rotation={[Math.PI/6, 0, 0]}> 
                        <mesh position={[0, 0.6, 0]}>
                            <boxGeometry args={[0.25, 1.2, 0.25]} />
                            <meshStandardMaterial color="#f97316" />
                            <Edges color="#7c2d12" />
                        </mesh>
                        {/* Hydraulic Piston */}
                        <mesh position={[0, 0.4, -0.2]}>
                             <cylinderGeometry args={[0.06, 0.06, 0.8]} />
                             <meshStandardMaterial color="#cbd5e1" />
                        </mesh>

                        {/* Elbow Joint */}
                        <group position={[0, 1.1, 0]} rotation={[-Math.PI/1.8, 0, 0]}> {/* Angled Down/Forward */}
                             <mesh rotation={[0, 0, Math.PI/2]}>
                                 <cylinderGeometry args={[0.18, 0.18, 0.3]} />
                                 <meshStandardMaterial color="#334155" />
                             </mesh>
                             
                             {/* Upper Arm (Forearm) */}
                             <mesh position={[0, 0.5, 0]}>
                                 <boxGeometry args={[0.2, 1.0, 0.2]} />
                                 <meshStandardMaterial color="#f97316" />
                                 <Edges color="#7c2d12" />
                             </mesh>

                             {/* Tool Head */}
                             <group position={[0, 1.0, 0]} rotation={[Math.PI/2, 0, 0]}> {/* Pointing Down */}
                                 <mesh>
                                     <boxGeometry args={[0.25, 0.3, 0.25]} />
                                     <meshStandardMaterial color="#1e293b" />
                                 </mesh>
                                 {/* Glowing Tip */}
                                 <mesh position={[0, 0.25, 0]}>
                                     <coneGeometry args={[0.02, 0.3, 8]} />
                                     <meshBasicMaterial color={constructionTargetId ? "#facc15" : "#ffffff"} />
                                 </mesh>
                                 {constructionTargetId && (
                                     <pointLight color="#facc15" distance={2} intensity={2} decay={2} />
                                 )}
                             </group>
                        </group>
                    </group>
                </group>
            </group>
        );
    }

    if (isMule) {
        return (
            <group scale={[2.6, 2.6, 2.6]}>
                {/* --- CHASSIS --- */}
                <group position={[0, 0.5, 0]}>
                    <mesh>
                        <boxGeometry args={[1.0, 0.25, 2.4]} />
                        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
                    </mesh>
                    
                    {/* Fuel Tanks / Side Steps */}
                    <mesh position={[0.6, -0.1, 0]}>
                        <boxGeometry args={[0.2, 0.3, 1.0]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    <mesh position={[-0.6, -0.1, 0]}>
                        <boxGeometry args={[0.2, 0.3, 1.0]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                </group>

                {/* --- WHEELS --- */}
                {[
                    { x: 0.65, z: 0.8 }, { x: -0.65, z: 0.8 }, // Front
                    { x: 0.65, z: -0.8 }, { x: -0.65, z: -0.8 } // Rear
                ].map((pos, i) => (
                    <group key={i} position={[pos.x, 0.35, pos.z]}>
                        <mesh rotation={[0, 0, Math.PI/2]}>
                            <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
                            <meshStandardMaterial color="#0f172a" roughness={0.9} />
                        </mesh>
                        {/* Rim */}
                        <mesh rotation={[0, 0, pos.x > 0 ? Math.PI/2 : -Math.PI/2]} position={[pos.x > 0 ? 0.16 : -0.16, 0, 0]}>
                            <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
                            <meshStandardMaterial color="#475569" metalness={0.6} />
                        </mesh>
                    </group>
                ))}

                {/* --- CAB --- */}
                <group position={[0, 0.9, 0.7]}>
                    <mesh>
                        <boxGeometry args={[1.0, 0.8, 0.9]} />
                        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
                        <Edges color="#64748b" threshold={15} />
                    </mesh>
                    
                    {/* Windshield */}
                    <mesh position={[0, 0.1, 0.46]}>
                        <planeGeometry args={[0.9, 0.35]} />
                        <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.1} />
                    </mesh>

                    {/* Roof Antennas */}
                    <mesh position={[0.4, 0.4, -0.3]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.8]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                    <mesh position={[0.3, 0.4, -0.3]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.5]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>

                    {/* Headlights */}
                    <mesh position={[0.35, -0.2, 0.46]}>
                        <planeGeometry args={[0.15, 0.1]} />
                        <meshBasicMaterial color="#22d3ee" toneMapped={false} />
                    </mesh>
                    <mesh position={[-0.35, -0.2, 0.46]}>
                        <planeGeometry args={[0.15, 0.1]} />
                        <meshBasicMaterial color="#22d3ee" toneMapped={false} />
                    </mesh>
                    
                    {/* Roof Marker Lights */}
                    <mesh position={[0.4, 0.41, 0.3]}>
                        <boxGeometry args={[0.1, 0.05, 0.1]} />
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </mesh>
                    <mesh position={[-0.4, 0.41, 0.3]}>
                        <boxGeometry args={[0.1, 0.05, 0.1]} />
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </mesh>
                </group>

                {/* --- FABRICATOR MODULE (Rear) --- */}
                <group position={[0, 1.0, -0.6]}>
                    <mesh>
                        <boxGeometry args={[1.0, 0.9, 1.3]} />
                        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
                        <Edges color="#1e293b" />
                    </mesh>

                    {/* Side Vents with Glow */}
                    {[-1, 1].map((dir) => (
                        <group key={dir} position={[dir * 0.51, 0, 0]} rotation={[0, dir * Math.PI/2, 0]}>
                            {/* Vent Frame */}
                            <mesh>
                                <planeGeometry args={[0.8, 0.5]} />
                                <meshStandardMaterial color="#1e293b" />
                            </mesh>
                            {/* Glowing Slits */}
                            {[0.1, 0, -0.1].map((y, i) => (
                                <mesh key={i} position={[0, y, 0.01]}>
                                    <planeGeometry args={[0.6, 0.05]} />
                                    <meshBasicMaterial color="#f97316" toneMapped={false} />
                                </mesh>
                            ))}
                        </group>
                    ))}

                    {/* Top Pipes */}
                    <mesh position={[0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 1.3]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                    <mesh position={[-0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 1.3]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                    
                    {/* Team Color Stripe/Status Light on Back */}
                    <mesh position={[0, 0, -0.66]}>
                        <boxGeometry args={[0.6, 0.1, 0.05]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>
                </group>
                
                {/* Connector between Cab and Module */}
                <mesh position={[0, 0.7, 0.1]}>
                    <boxGeometry args={[0.8, 0.6, 0.4]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>
            </group>
        );
    }

    if (isGuardian) {
        const glowColor = "#4ade80"; // Bright Green
        const bodyColor = "#475569"; // Slate 600
        const darkColor = "#1e293b"; // Slate 800

        return (
            <group scale={[2.6, 2.6, 2.6]}>
                {/* --- CHASSIS --- */}
                <group position={[0, 0.6, 0]}>
                     {/* Lower Hull */}
                     <mesh>
                         <boxGeometry args={[1.1, 0.5, 2.4]} />
                         <meshStandardMaterial color={bodyColor} metalness={0.6} roughness={0.3} />
                         <Edges color={darkColor} />
                     </mesh>
                     
                     {/* Upper Rear Cabin (Medical Bay) */}
                     <mesh position={[0, 0.5, -0.4]}>
                         <boxGeometry args={[1.1, 0.7, 1.6]} />
                         <meshStandardMaterial color={bodyColor} metalness={0.6} roughness={0.3} />
                         <Edges color={darkColor} />
                     </mesh>

                     {/* Front Cab */}
                     <group position={[0, 0.35, 0.7]}>
                         <mesh>
                             <boxGeometry args={[1.0, 0.6, 0.9]} />
                             <meshStandardMaterial color={bodyColor} />
                         </mesh>
                         {/* Windshield */}
                         <mesh position={[0, 0.1, 0.46]}>
                             <planeGeometry args={[0.9, 0.3]} />
                             <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
                         </mesh>
                         {/* Headlights (Green Glow) */}
                         <mesh position={[0.35, -0.1, 0.46]}>
                             <boxGeometry args={[0.2, 0.1, 0.05]} />
                             <meshBasicMaterial color={glowColor} toneMapped={false} />
                         </mesh>
                         <mesh position={[-0.35, -0.1, 0.46]}>
                             <boxGeometry args={[0.2, 0.1, 0.05]} />
                             <meshBasicMaterial color={glowColor} toneMapped={false} />
                         </mesh>
                         {/* Grill */}
                         <mesh position={[0, -0.1, 0.46]}>
                             <boxGeometry args={[0.4, 0.15, 0.02]} />
                             <meshStandardMaterial color="#1e293b" />
                         </mesh>
                     </group>

                     {/* Side Medical Crosses (Green Glow) */}
                     {[-1, 1].map((side) => (
                         <group key={side} position={[side * 0.56, 0.5, -0.4]} rotation={[0, side * Math.PI/2, 0]}>
                             {/* Horizontal Bar */}
                             <mesh position={[0, 0, 0]}>
                                 <planeGeometry args={[0.4, 0.15]} />
                                 <meshBasicMaterial color={glowColor} toneMapped={false} side={THREE.DoubleSide} />
                             </mesh>
                             {/* Vertical Bar */}
                             <mesh position={[0, 0, 0]}>
                                 <planeGeometry args={[0.15, 0.4]} />
                                 <meshBasicMaterial color={glowColor} toneMapped={false} side={THREE.DoubleSide} />
                             </mesh>
                         </group>
                     ))}

                     {/* Side Running Lights */}
                     <mesh position={[0.56, -0.1, 0]}>
                         <boxGeometry args={[0.05, 0.05, 1.8]} />
                         <meshBasicMaterial color={glowColor} toneMapped={false} />
                     </mesh>
                     <mesh position={[-0.56, -0.1, 0]}>
                         <boxGeometry args={[0.05, 0.05, 1.8]} />
                         <meshBasicMaterial color={glowColor} toneMapped={false} />
                     </mesh>
                </group>

                {/* --- WHEELS --- */}
                {[
                    { x: 0.65, z: 0.7 }, { x: -0.65, z: 0.7 }, // Front
                    { x: 0.65, z: -0.7 }, { x: -0.65, z: -0.7 } // Rear
                ].map((pos, i) => (
                    <group key={i} position={[pos.x, 0.35, pos.z]}>
                        <mesh rotation={[0, 0, Math.PI/2]}>
                            <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
                            <meshStandardMaterial color="#0f172a" roughness={0.9} />
                        </mesh>
                        {/* Hubcap */}
                        <mesh rotation={[0, 0, pos.x > 0 ? Math.PI/2 : -Math.PI/2]} position={[pos.x > 0 ? 0.16 : -0.16, 0, 0]}>
                            <cylinderGeometry args={[0.18, 0.18, 0.05, 8]} />
                            <meshStandardMaterial color="#64748b" metalness={0.5} />
                            <mesh position={[0, 0.03, 0]}>
                                <cylinderGeometry args={[0.08, 0.08, 0.02, 6]} />
                                <meshStandardMaterial color="#334155" />
                            </mesh>
                        </mesh>
                    </group>
                ))}

                {/* --- ROOF EQUIPMENT --- */}
                <group position={[0, 1.45, -0.4]}>
                    
                    {/* The Healing Coil Tower (Center Rear) */}
                    <group position={[0, 0, 0]}>
                        {/* Base Socket */}
                        <mesh position={[0, 0, 0]}>
                            <cylinderGeometry args={[0.35, 0.45, 0.2, 8]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        
                        {/* Main Glowing Core */}
                        <mesh position={[0, 0.6, 0]}>
                            <cylinderGeometry args={[0.22, 0.22, 1.2, 12]} />
                            <meshBasicMaterial color={glowColor} transparent opacity={0.9} />
                        </mesh>
                        
                        {/* Containment Rings (Stacked) */}
                        {[0.2, 0.5, 0.8, 1.1].map((y, i) => (
                            <group key={i} position={[0, y, 0]}>
                                {/* Outer Metal Ring */}
                                <mesh>
                                    <torusGeometry args={[0.28, 0.06, 6, 16]} />
                                    <meshStandardMaterial color="#475569" metalness={0.8} />
                                </mesh>
                                {/* Connector Struts to Core */}
                                {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, j) => (
                                    <mesh key={j} rotation={[0, rot, 0]}>
                                        <boxGeometry args={[0.6, 0.08, 0.08]} />
                                        <meshStandardMaterial color="#1e293b" />
                                    </mesh>
                                ))}
                                {/* Glowing Nubs on Ends */}
                                {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, j) => (
                                    <mesh key={j} rotation={[0, rot, 0]} position={[0.3, 0, 0]}>
                                        <boxGeometry args={[0.05, 0.12, 0.15]} />
                                        <meshBasicMaterial color={glowColor} />
                                    </mesh>
                                ))}
                            </group>
                        ))}

                        {/* Top Cap */}
                        <mesh position={[0, 1.25, 0]}>
                            <cylinderGeometry args={[0.35, 0.35, 0.15, 8]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                         {/* Top Sensor Light */}
                        <mesh position={[0, 1.35, 0]}>
                            <sphereGeometry args={[0.18]} />
                            <meshBasicMaterial color={glowColor} />
                        </mesh>
                    </group>

                    {/* Radar Dish (Rotating via ref) */}
                    <group ref={radarRef} position={[0.6, 0.2, 0.2]} rotation={[0, 0, 0]}>
                         <mesh position={[0, 0.3, 0]}>
                            <cylinderGeometry args={[0.05, 0.08, 0.6]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                        <group position={[0, 0.6, 0]} rotation={[0.4, 0, 0]}>
                            <mesh>
                                <cylinderGeometry args={[0.35, 0.05, 0.15, 16]} />
                                <meshStandardMaterial color="#334155" metalness={0.7} />
                            </mesh>
                            <mesh position={[0, 0.08, 0]}>
                                <cylinderGeometry args={[0.05, 0.05, 0.2]} />
                                <meshStandardMaterial color="#94a3b8" />
                            </mesh>
                        </group>
                    </group>

                     {/* Missile/Tool Box (Other side) */}
                     <group position={[-0.6, 0.1, 0]}>
                         <mesh>
                             <boxGeometry args={[0.4, 0.3, 0.5]} />
                             <meshStandardMaterial color="#334155" />
                             <Edges color="#000000" />
                         </mesh>
                         <mesh position={[0, 0.16, 0]}>
                             <boxGeometry args={[0.3, 0.05, 0.4]} />
                             <meshStandardMaterial color="#475569" />
                         </mesh>
                     </group>

                </group>

                {/* Trophy System / Repair Active Effect */}
                {cooldowns.trophySystem !== undefined && cooldowns.trophySystem > 0 && (
                     <mesh position={[0, 2.5, -0.4]}>
                         <sphereGeometry args={[0.2]} />
                         <meshBasicMaterial color="#ef4444" wireframe />
                     </mesh>
                )}
            </group>
        );
    }

    if (isGhost) {
        return (
            <group scale={[2.4, 2.4, 2.4]}>
                {/* --- LEGS --- */}
                {/* Left Leg */}
                <group position={[-0.2, 0.4, 0]}>
                    {/* Thigh */}
                    <mesh position={[0, 0.2, 0]}>
                        <boxGeometry args={[0.22, 0.45, 0.25]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    {/* Knee Pad */}
                    <mesh position={[0, -0.05, 0.13]}>
                        <boxGeometry args={[0.18, 0.15, 0.05]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    {/* Shin */}
                    <mesh position={[0, -0.35, 0]}>
                        <boxGeometry args={[0.2, 0.45, 0.22]} />
                        <meshStandardMaterial color="#475569" />
                        {/* Glow Line */}
                        <mesh position={[0, 0, 0.115]}>
                            <planeGeometry args={[0.05, 0.3]} />
                            <meshBasicMaterial color={teamColor} toneMapped={false} />
                        </mesh>
                    </mesh>
                    {/* Boot */}
                    <mesh position={[0, -0.6, 0.05]}>
                        <boxGeometry args={[0.22, 0.15, 0.35]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                </group>

                {/* Right Leg */}
                <group position={[0.2, 0.4, 0]}>
                     {/* Thigh */}
                    <mesh position={[0, 0.2, 0]}>
                        <boxGeometry args={[0.22, 0.45, 0.25]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    {/* Knee Pad */}
                    <mesh position={[0, -0.05, 0.13]}>
                        <boxGeometry args={[0.18, 0.15, 0.05]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    {/* Shin */}
                    <mesh position={[0, -0.35, 0]}>
                        <boxGeometry args={[0.2, 0.45, 0.22]} />
                        <meshStandardMaterial color="#475569" />
                        {/* Glow Line */}
                        <mesh position={[0, 0, 0.115]}>
                            <planeGeometry args={[0.05, 0.3]} />
                            <meshBasicMaterial color={teamColor} toneMapped={false} />
                        </mesh>
                    </mesh>
                    {/* Boot */}
                    <mesh position={[0, -0.6, 0.05]}>
                        <boxGeometry args={[0.22, 0.15, 0.35]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                </group>

                {/* --- TORSO --- */}
                <group position={[0, 1.05, 0]}>
                    {/* Waist/Abdomen */}
                    <mesh position={[0, -0.2, 0]}>
                        <boxGeometry args={[0.4, 0.3, 0.3]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    {/* Chest Armor */}
                    <mesh position={[0, 0.15, 0.05]}>
                        <boxGeometry args={[0.55, 0.45, 0.35]} />
                        <meshStandardMaterial color="#475569" />
                        <Edges color="#1e293b" />
                    </mesh>
                    {/* Chest Glow */}
                    <mesh position={[0, 0.15, 0.23]}>
                        <planeGeometry args={[0.2, 0.05]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>
                    {/* Orange Accents (Waist/Side) */}
                    <mesh position={[0.21, -0.2, 0]}>
                        <boxGeometry args={[0.05, 0.1, 0.2]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                    <mesh position={[-0.21, -0.2, 0]}>
                        <boxGeometry args={[0.05, 0.1, 0.2]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                </group>

                {/* --- HEAD --- */}
                <group position={[0, 1.55, 0]}>
                    {/* Helmet Main */}
                    <mesh>
                        <boxGeometry args={[0.3, 0.35, 0.35]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    {/* Visor Area */}
                    <mesh position={[0, 0.02, 0.18]}>
                        <boxGeometry args={[0.22, 0.1, 0.05]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    {/* Visor Slit Glow */}
                    <mesh position={[0, 0.02, 0.21]}>
                        <planeGeometry args={[0.15, 0.02]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>
                </group>

                {/* --- ARMS --- */}
                {/* Left Arm (Supporting Gun) */}
                <group position={[-0.35, 1.25, 0.1]} rotation={[0, 0.5, 0]}>
                    {/* Shoulder */}
                    <mesh position={[0, 0.1, 0]}>
                        <boxGeometry args={[0.25, 0.25, 0.25]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    {/* Arm extending forward */}
                    <mesh position={[0, -0.2, 0.2]} rotation={[0.5, 0, 0]}>
                        <boxGeometry args={[0.15, 0.4, 0.15]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                </group>

                {/* Right Arm (Holding Grip) */}
                <group position={[0.35, 1.25, 0.1]} rotation={[0, -0.5, 0]}>
                    {/* Shoulder */}
                    <mesh position={[0, 0.1, 0]}>
                        <boxGeometry args={[0.25, 0.25, 0.25]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    {/* Arm extending forward */}
                    <mesh position={[0, -0.2, 0.2]} rotation={[0.5, 0, 0]}>
                        <boxGeometry args={[0.15, 0.4, 0.15]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                </group>

                {/* --- BACKPACK (EW Suite) --- */}
                <group position={[0, 1.15, -0.25]}>
                    {/* Main Pack */}
                    <mesh>
                        <boxGeometry args={[0.5, 0.6, 0.3]} />
                        <meshStandardMaterial color="#475569" />
                        <Edges color="#1e293b" />
                    </mesh>
                    {/* Vents/Detail */}
                    <mesh position={[0, 0, -0.16]}>
                        <boxGeometry args={[0.3, 0.4, 0.05]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    {/* Antenna 1 (Large angled) */}
                    <mesh position={[0.15, 0.4, -0.1]} rotation={[0, 0, -0.2]}>
                        <boxGeometry args={[0.1, 0.8, 0.1]} />
                        <meshStandardMaterial color="#64748b" />
                    </mesh>
                    {/* Antenna 2 (Smaller angled) */}
                    <mesh position={[-0.15, 0.35, -0.1]} rotation={[0, 0, 0.4]}>
                        <boxGeometry args={[0.08, 0.5, 0.08]} />
                        <meshStandardMaterial color="#64748b" />
                    </mesh>
                    {/* Glow Lights */}
                    <mesh position={[0.26, 0.1, 0]}>
                        <boxGeometry args={[0.05, 0.05, 0.05]} />
                        <meshBasicMaterial color="#f97316" />
                    </mesh>
                </group>

                {/* --- WEAPON (Rifle) --- */}
                <group position={[0, 1.05, 0.5]}>
                    {/* Main Body */}
                    <mesh>
                        <boxGeometry args={[0.1, 0.2, 0.6]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                    {/* Barrel */}
                    <mesh position={[0, 0.05, 0.4]}>
                        <cylinderGeometry args={[0.03, 0.03, 0.4]} rotation={[Math.PI/2, 0, 0]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                    {/* Silencer */}
                    <mesh position={[0, 0.05, 0.7]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.3]} rotation={[Math.PI/2, 0, 0]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    {/* Scope */}
                    <mesh position={[0, 0.15, 0.1]}>
                        <boxGeometry args={[0.06, 0.06, 0.2]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    {/* Stock */}
                    <mesh position={[0, -0.05, -0.4]}>
                        <boxGeometry args={[0.08, 0.15, 0.3]} />
                        <meshStandardMaterial color="#334155" />
                    </mesh>
                </group>

                {isDampenerActive && (
                    <group>
                        <mesh rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}>
                            <sphereGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 16, 16]} />
                            <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.1} />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
                            <ringGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize - 0.5, ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 64]} />
                            <meshBasicMaterial color={teamColor} transparent opacity={0.3} />
                        </mesh>
                    </group>
                )}
                <pointLight ref={flashRef} position={[0, 1.05, 1.0]} color="#fbbf24" distance={3} decay={2} visible={false} />
            </group>
        );
    }

    if (isWasp) {
        return (
            <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}>
                <group scale={[2.4, 2.4, 2.4]}>
                    {/* --- MAIN HULL --- */}
                    {/* Central Body */}
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[0.5, 0.4, 1.0]} />
                        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
                        <Edges color="#1e293b" />
                    </mesh>
                    
                    {/* Front Face / Sensor Block */}
                    <mesh position={[0, 0, 0.55]}>
                        <boxGeometry args={[0.4, 0.3, 0.2]} />
                        <meshStandardMaterial color="#334155" metalness={0.8} />
                    </mesh>

                    {/* Glowing Eyes/Sensors on Front */}
                    <mesh position={[-0.1, 0.05, 0.66]}>
                        <planeGeometry args={[0.1, 0.05]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>
                    <mesh position={[0.1, 0.05, 0.66]}>
                        <planeGeometry args={[0.1, 0.05]} />
                        <meshBasicMaterial color={teamColor} toneMapped={false} />
                    </mesh>

                    {/* Rear Engine Block */}
                    <mesh position={[0, 0.1, -0.55]}>
                        <boxGeometry args={[0.4, 0.2, 0.2]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>

                    {/* Vertical Stabilizer Fin */}
                    <mesh position={[0, 0.4, -0.3]}>
                        <boxGeometry args={[0.05, 0.4, 0.6]} />
                        <meshStandardMaterial color="#64748b" />
                        <Edges color="#334155" />
                    </mesh>

                    {/* --- SIDE PODS (LAUNCHERS) --- */}
                    {[-1, 1].map((dir) => (
                        <group key={dir} position={[dir * 0.6, 0, 0.1]}>
                            {/* Connector Wing */}
                            <mesh position={[dir * -0.2, 0, 0]}>
                                <boxGeometry args={[0.4, 0.1, 0.4]} />
                                <meshStandardMaterial color="#475569" />
                            </mesh>

                            {/* Pod Body (Hexagonal) */}
                            <mesh rotation={[Math.PI/2, 0, Math.PI/2]}>
                                <cylinderGeometry args={[0.3, 0.3, 1.2, 6]} />
                                <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
                                <Edges color="#1e293b" threshold={15} />
                            </mesh>

                            {/* Pod Front Cap */}
                            <mesh position={[0, 0, 0.61]} rotation={[Math.PI/2, 0, 0]}>
                                <cylinderGeometry args={[0.25, 0.25, 0.05, 6]} />
                                <meshStandardMaterial color="#1e293b" />
                            </mesh>

                            {/* Missile Warheads (Visible in tubes) */}
                            {/* 6 Missiles per pod arranged in hex/circle */}
                            {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                                const rad = (angle * Math.PI) / 180;
                                const r = 0.15;
                                const x = Math.cos(rad) * r;
                                const y = Math.sin(rad) * r;
                                return (
                                    <mesh key={i} position={[x, y, 0.65]} rotation={[Math.PI/2, 0, 0]}>
                                        <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} />
                                        <meshStandardMaterial color="#b91c1c" /> {/* Dark Red Body */}
                                        <mesh position={[0, 0.06, 0]}>
                                            <sphereGeometry args={[0.04]} />
                                            <meshBasicMaterial color="#ef4444" /> {/* Bright Red Tip */}
                                        </mesh>
                                    </mesh>
                                )
                            })}

                            {/* Team Color Glow Strip on Top */}
                            <mesh position={[0, 0.31, 0]} rotation={[-Math.PI/2, 0, 0]}>
                                <planeGeometry args={[0.4, 0.8]} />
                                <meshBasicMaterial color={teamColor} transparent opacity={0.5} />
                            </mesh>

                            {/* Rear Thruster Glow */}
                            <mesh position={[0, 0, -0.61]} rotation={[Math.PI/2, 0, 0]}>
                                <circleGeometry args={[0.2, 16]} />
                                <meshBasicMaterial color={teamColor} transparent opacity={0.8} />
                            </mesh>
                        </group>
                    ))}
                    
                    {/* Underbelly Thrusters (VTOL style) */}
                    {[0.3, -0.3].map((x, i) => (
                        <group key={`vtol-${i}`} position={[x, -0.25, 0]}>
                            <mesh rotation={[Math.PI, 0, 0]}>
                                <coneGeometry args={[0.1, 0.4, 8, 1, true]} />
                                <meshBasicMaterial color={teamColor} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
                            </mesh>
                        </group>
                    ))}

                    <pointLight ref={flashRef} position={[0, 0, 0.8]} color="#fbbf24" distance={3} decay={2} visible={false} />
                </group>
            </Float>
        );
    }

    if (isDrone) {
        return (
             <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}>
                 <group scale={[2.2, 2.2, 2.2]}>
                    {/* Main Fuselage */}
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[0.5, 0.25, 1.0]} />
                        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
                        <Edges color={teamColor} />
                    </mesh>
                    
                    {/* Top Shell */}
                    <mesh position={[0, 0.15, -0.1]}>
                         <boxGeometry args={[0.4, 0.15, 0.6]} />
                         <meshStandardMaterial color="#475569" />
                    </mesh>

                    {/* Sensor Array (Front) */}
                    <group position={[0, 0, 0.55]}>
                        <mesh rotation={[Math.PI/2, 0, 0]}>
                            <cylinderGeometry args={[0.15, 0.15, 0.2, 16]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                        <mesh position={[0, 0, 0.11]} rotation={[Math.PI/2, 0, 0]}>
                            <circleGeometry args={[0.08, 16]} />
                            <meshBasicMaterial color="#0ea5e9" toneMapped={false} /> 
                        </mesh>
                        <pointLight color="#0ea5e9" distance={2} intensity={2} decay={2} />
                    </group>

                    {/* Arms & Rotors */}
                    {[
                        { x: 0.6, z: 0.6 },
                        { x: -0.6, z: 0.6 },
                        { x: 0.6, z: -0.6 },
                        { x: -0.6, z: -0.6 }
                    ].map((pos, i) => (
                        <group key={i} position={[pos.x, 0, pos.z]}>
                            {/* Arm */}
                            <mesh 
                                position={[-pos.x/2, 0, -pos.z/2]} 
                                rotation={[0, Math.atan2(pos.x, pos.z), 0]}
                            >
                                <boxGeometry args={[0.1, 0.05, Math.hypot(pos.x, pos.z)]} />
                                <meshStandardMaterial color="#64748b" />
                            </mesh>

                            {/* Motor */}
                            <mesh position={[0, -0.05, 0]}>
                                <cylinderGeometry args={[0.08, 0.08, 0.15]} />
                                <meshStandardMaterial color="#0f172a" />
                            </mesh>

                            {/* Guard Ring */}
                            <mesh rotation={[Math.PI/2, 0, 0]}>
                                <ringGeometry args={[0.35, 0.38, 24]} />
                                <meshStandardMaterial color="#334155" side={THREE.DoubleSide} />
                            </mesh>

                            {/* Rotor */}
                            <group position={[0, 0.05, 0]}>
                                <Rotor />
                            </group>
                            
                            {/* Nav Light */}
                            <mesh position={[0, -0.15, 0]}>
                                <sphereGeometry args={[0.05]} />
                                <meshBasicMaterial color={teamColor} toneMapped={false} />
                            </mesh>
                        </group>
                    ))}

                    {/* Rear Antenna */}
                    <mesh position={[0, 0.2, -0.4]} rotation={[-0.3, 0, 0]}>
                         <cylinderGeometry args={[0.02, 0.02, 0.6]} />
                         <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                    <mesh position={[0, 0.5, -0.5]}>
                        <sphereGeometry args={[0.04]} />
                        <meshBasicMaterial color={teamColor} />
                    </mesh>
                 </group>
             </Float>
        )
    }

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
  // Updated: User requested uniform 2-block radius for drones (Helios/Wasp/Standard) unless surveillance is active
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
                      <ringGeometry args={[visualVisionRadius - 0.5, visualVisionRadius, 64]} />
                      <meshBasicMaterial color={teamColor} transparent opacity={0.6} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
                      <ringGeometry args={[visualVisionRadius * 0.85, visualVisionRadius - 1, 64]} />
                      <meshBasicMaterial color={teamColor} transparent opacity={0.1} side={THREE.DoubleSide} />
                  </mesh>
                  <pointLight color={teamColor} intensity={1.5} distance={visualVisionRadius} decay={2} />
              </group>
          </group>
      )}

      {isHelios && (<group position={[0, -hoverHeight + 0.3, 0]}> <mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><ringGeometry args={[ABILITY_CONFIG.HELIOS_RADIUS * tileSize - 0.5, ABILITY_CONFIG.HELIOS_RADIUS * tileSize, 64]} /><meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} /></mesh><mesh rotation={[-Math.PI/2, 0, 0]} raycast={() => null}><circleGeometry args={[ABILITY_CONFIG.HELIOS_RADIUS * tileSize, 64]} /><meshBasicMaterial color="#facc15" transparent opacity={0.05} depthWrite={false} /></mesh></group>)}
      {isBanshee && jammerActive && (<group><mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}><ringGeometry args={[ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize, ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize + 0.2, 64]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} /></mesh><mesh rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}><sphereGeometry args={[ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize, 32, 32]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.05} /></mesh></group>)}
      {isHacked && hackerPos && (<group><Line points={[[0, 1, 0],[hackerPos.x - meshRef.current!.position.x, hackerPos.y - meshRef.current!.position.y, hackerPos.z - meshRef.current!.position.z]]} color="#c084fc" lineWidth={1} transparent opacity={0.5}/><mesh position={[0, 1.5, 0]} raycast={() => null}><octahedronGeometry args={[0.5]} /><meshBasicMaterial color="#c084fc" wireframe /></mesh></group>)}
      {isJammed && (<mesh position={[0, 2, 0]} raycast={() => null}><sphereGeometry args={[1]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.3} /></mesh>)}
      {isHacked && hackType === 'drain' && (<group><mesh position={[0, 1, 0]} rotation={[Math.random(), Math.random(), Math.random()]} raycast={() => null}><planeGeometry args={[0.5, 0.5]} /><meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} /></mesh><pointLight color="#3b82f6" intensity={2} distance={3} /></group>)}
      {isTank && smoke?.active && (<group><mesh position={[0, 2, 0]} rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}><sphereGeometry args={[tileSize * 0.8, 16, 16]} /><meshStandardMaterial color="#64748b" transparent opacity={0.8} depthWrite={false} /></mesh><mesh position={[0, 1.5, 0]} rotation={[0, -Date.now() * 0.0005, 0]} raycast={() => null}><cylinderGeometry args={[tileSize * 1.5, tileSize * 1.2, 2.5, 8]} /><meshStandardMaterial color="#94a3b8" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} /></mesh></group>)}
      {isTank && aps?.active && (<group><mesh raycast={() => null}><sphereGeometry args={[tileSize * 0.8, 32, 32]} /><meshBasicMaterial color={teamColor} transparent opacity={0.2} wireframe={false} side={THREE.DoubleSide} depthWrite={false} /></mesh><mesh rotation={[0, Date.now() * 0.005, 0]} raycast={() => null}><sphereGeometry args={[tileSize * 0.85, 16, 16]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} /></mesh></group>)}
      {isGuardian && repairTargetPos && (<mesh position={[0, 1, 0]}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color="#10b981" /></mesh>)}
      
      {!isTank && !isGhost && !isGuardian && !isMule && !isMason && !isAir && !isSunPlate && !isBallista && !isCourier && !isBanshee && !isDefenseDrone && <pointLight position={[0, -1, 0]} distance={8} intensity={2} color={teamColor} />}

      <Html position={[0, (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee) ? 5.5 : (isDefenseDrone ? 4.5 : (isWasp || isHelios ? 5.5 : 6.5)), 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center select-none">
          {chargingStatus && chargingStatus > 0 ? (<div className="flex gap-0.5 animate-bounce mb-1"><span className="text-yellow-400 text-sm drop-shadow-[0_0_2px_rgba(0,0,0,1)]">⚡</span>{chargingStatus > 1 && <span className="text-yellow-400 text-sm drop-shadow-[0_0_2px_rgba(0,0,0,1)]">⚡</span>}</div>) : null}
          {isJammed && (<div className="text-sm font-bold text-white bg-black/50 px-1 rounded animate-pulse border border-white mb-1">NO SIGNAL</div>)}
          {isHacked && (<div className="text-xs font-bold text-purple-400 bg-purple-900/80 px-1 rounded animate-pulse border border-purple-500 mb-1 uppercase">{hackType === 'recall' ? 'OVERRIDE: RTB' : 'SHORT CIRCUIT'}</div>)}
          {isBallista && ammoState === 'loading' && (<div className="w-16 h-2 bg-slate-900 rounded mb-1 overflow-hidden border border-yellow-500"><div className="h-full bg-yellow-400" style={{ width: `${loadingProgress}%` }}></div></div>)}
          {isSelected && !isDefenseDrone && (<div className="flex flex-col items-center gap-0.5 mb-0.5"><div className="text-[10px] font-mono font-bold text-yellow-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-yellow-500/50 shadow-lg backdrop-blur-sm whitespace-nowrap">BAT: {Math.floor(battery)}%</div>{secondaryBattery !== undefined && (<div className="text-[10px] font-mono font-bold text-cyan-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-cyan-500/50 shadow-lg backdrop-blur-sm whitespace-nowrap">SEC: {Math.floor(secondaryBattery)}%</div>)}</div>)}
          <div className="w-12 h-1 bg-slate-800 rounded mb-0.5 overflow-hidden border border-slate-600"><div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(health / maxHealth) * 100}%` }}></div></div>
          {!isDefenseDrone && (<div className="w-10 h-1.5 bg-slate-800 rounded mb-0.5 overflow-hidden border border-slate-600"><div className={`h-full transition-all duration-300 ${isDisabled ? 'bg-red-500' : 'bg-yellow-400'}`} style={{ width: `${(battery / maxBattery) * 100}%` }}></div></div>)}
          {secondaryBattery !== undefined && maxSecondaryBattery && (<div className="w-10 h-1.5 bg-slate-800 rounded mb-1 overflow-hidden border border-slate-600"><div className="h-full transition-all duration-300 bg-cyan-400" style={{ width: `${(secondaryBattery / maxSecondaryBattery) * 100}%` }}></div></div>)}
          {isDisabled && !isHacked && !isDefenseDrone && (<div className="text-[8px] bg-red-900/80 text-red-200 px-1 rounded font-mono font-bold border border-red-500 mb-1 animate-pulse">IMMOBILIZED</div>)}
          {isDecoy ? (<div className="text-xs font-mono font-bold text-slate-400 bg-black/50 px-1 border border-slate-600 rounded">HOLO-DECOY</div>) : (<><div className="mb-1 text-lg drop-shadow-[0_0_8px_rgba(0,0,0,1)]" style={{ color: teamColor, textShadow: `0 0 10px ${teamColor}, 0 0 20px ${teamColor}` }}>{classConfig.icon}</div>{!isDefenseDrone && isSelected && (<div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap border flex flex-col items-center bg-slate-900/80 ${team === 'blue' ? 'border-blue-400 text-blue-200' : 'border-red-400 text-red-200'}`}><span>{unitStats.label}</span></div>)}</>)}
          {cargo !== undefined && cargo > 0 && (<div className="mt-1 px-2 py-0.5 rounded text-[9px] bg-yellow-900/80 border border-yellow-500 text-yellow-400 font-bold uppercase animate-pulse">CARGO LOADED</div>)}
          {isBallista && ammoState === 'armed' && (<div className="mt-1 px-2 py-0.5 rounded text-[9px] bg-red-900/80 border border-red-500 text-red-400 font-bold uppercase animate-pulse">{loadedAmmo === 'eclipse' ? 'ECLIPSE ARMED' : 'WP ARMED'}</div>)}
          {isBallista && ammoState === 'awaiting_delivery' && (<div className="mt-1 px-2 py-0.5 rounded text-[9px] bg-cyan-900/80 border border-cyan-500 text-cyan-400 font-bold uppercase animate-pulse">INBOUND</div>)}
        </div>
      </Html>

      {/* Action Menu - Updated with Cannon logic */}
      {actionMenuOpen && (
          <Html position={[2, (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee) ? 1 : 2, 0]} zIndexRange={[100, 0]}>
             <div className="flex flex-col gap-1 min-w-[160px] pointer-events-auto">
                 <div className="bg-slate-900/95 border border-cyan-500 rounded overflow-hidden shadow-[0_0_20px_rgba(0,255,255,0.3)] backdrop-blur">
                    <div className="px-3 py-1 bg-slate-800 border-b border-slate-700 text-xs text-cyan-400 font-mono font-bold uppercase flex justify-between">
                        <span>Combat Systems</span>
                        <span className="text-[10px] text-white">CPU: {teamCompute}</span>
                    </div>
                    
                    {/* ... Other units omitted for brevity, keeping structure ... */}
                    {isTank && (
                        <>
                            <button 
                                className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.mainCannon || cooldowns.mainCannon === 0) ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`}
                                onClick={() => handleMenuAction('CANNON ATTACK')}
                                disabled={!!(cooldowns.mainCannon && cooldowns.mainCannon > 0)}
                            >
                                <span className={`w-1.5 h-1.5 bg-red-500 rounded-full ${(!cooldowns.mainCannon || cooldowns.mainCannon === 0) ? 'animate-pulse' : ''}`}></span>
                                {cooldowns.mainCannon && cooldowns.mainCannon > 0 ? `Cannon (${Math.ceil(cooldowns.mainCannon/1000)}s)` : `120mm Cannon (15 NRG)`}
                            </button>
                            <button 
                                className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.titanSmoke || cooldowns.titanSmoke === 0) ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed'}`}
                                onClick={() => handleMenuAction('SMOG SCREEN')}
                                disabled={!!(cooldowns.titanSmoke && cooldowns.titanSmoke > 0)}
                            >
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                {cooldowns.titanSmoke && cooldowns.titanSmoke > 0 ? `Smoke (${Math.ceil(cooldowns.titanSmoke/1000)}s)` : `Smoke (10 NRG)`}
                            </button>
                            <button 
                                className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.titanAps || cooldowns.titanAps === 0) && teamCompute >= COMPUTE_GATES.TROPHY_SYSTEM ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`}
                                onClick={() => handleMenuAction('ACTIVATE APS')}
                                disabled={!!(cooldowns.titanAps && cooldowns.titanAps > 0) || teamCompute < COMPUTE_GATES.TROPHY_SYSTEM}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.TROPHY_SYSTEM ? 'bg-orange-500' : 'bg-slate-500'}`}></span>
                                {teamCompute < COMPUTE_GATES.TROPHY_SYSTEM ? `Requires ${COMPUTE_GATES.TROPHY_SYSTEM} Compute` : (cooldowns.titanAps && cooldowns.titanAps > 0 ? `APS (${Math.ceil(cooldowns.titanAps/1000)}s)` : `APS (10 NRG)`)}
                            </button>
                        </>
                    )}
                    
                    {/* ... Rest of units as is ... */}
                    {isGhost && (<><button className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan-900/50 hover:text-cyan-200 transition-colors font-mono flex items-center gap-2" onClick={() => handleMenuAction('TOGGLE DAMPENER')}><span className={`w-1.5 h-1.5 rounded-full ${isDampenerActive ? 'bg-indigo-500' : 'bg-slate-500'}`}></span>{isDampenerActive ? 'Disable Dampener' : 'Enable Dampener'}</button><button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${teamCompute >= COMPUTE_GATES.PHANTOM_DECOY ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`} onClick={() => handleMenuAction('PHANTOM DECOY')} disabled={teamCompute < COMPUTE_GATES.PHANTOM_DECOY}><span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.PHANTOM_DECOY ? 'bg-fuchsia-500' : 'bg-slate-500'}`}></span>{teamCompute >= COMPUTE_GATES.PHANTOM_DECOY ? 'Phantom Decoy (15 NRG)' : `Requires ${COMPUTE_GATES.PHANTOM_DECOY} Compute`}</button></>)}
                    {isGuardian && (<button className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan-900/50 hover:text-cyan-200 transition-colors font-mono flex items-center gap-2" onClick={() => handleMenuAction('REPAIR UNIT')}><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Repair Tether (15 NRG)</button>)}
                    {isMule && (<><button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.combatPrint || cooldowns.combatPrint === 0) ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed'}`} onClick={() => handleMenuAction('COMBAT PRINT')} disabled={!!(cooldowns.combatPrint && cooldowns.combatPrint > 0)}><span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>{cooldowns.combatPrint && cooldowns.combatPrint > 0 ? `Printing... (${Math.ceil(cooldowns.combatPrint/1000)}s)` : 'Combat Print (25 NRG)'}</button><button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.smogShell || cooldowns.smogShell === 0) ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed'}`} onClick={() => handleMenuAction('SMOG SHELL')} disabled={!!(cooldowns.smogShell && cooldowns.smogShell > 0)}><span className="w-1.5 h-1.5 bg-gray-500 rounded-full"></span>{cooldowns.smogShell && cooldowns.smogShell > 0 ? `Smog... (${Math.ceil(cooldowns.smogShell/1000)}s)` : 'Smog Shell (10 NRG)'}</button></>)}
                    {isWasp && (<button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${(!cooldowns.swarmLaunch || cooldowns.swarmLaunch === 0) ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed'}`} onClick={() => handleMenuAction('SATURATION STRIKE')} disabled={!!(cooldowns.swarmLaunch && cooldowns.swarmLaunch > 0)}><span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>{cooldowns.swarmLaunch && cooldowns.swarmLaunch > 0 ? `Swarm (${Math.ceil(cooldowns.swarmLaunch/1000)}s)` : `Swarm (25 NRG)`}</button>)}
                    {type === 'drone' && (<button className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan-900/50 hover:text-cyan-200 transition-colors font-mono flex items-center gap-2" onClick={() => handleMenuAction('LOITERING SURVEILLANCE')}><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Loitering Surveillance</button>)}
                    {isSunPlate && (<button className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan-900/50 hover:text-cyan-200 transition-colors font-mono flex items-center gap-2" onClick={() => handleMenuAction('TOGGLE ARRAY')}><span className={`w-1.5 h-1.5 rounded-full ${isDeployed ? 'bg-orange-500' : 'bg-slate-500'}`}></span>{isDeployed ? 'Retract Array' : 'Deploy Array'}</button>)}
                    {isBanshee && (<><button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${battery > 0 ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed'}`} onClick={() => handleMenuAction('TOGGLE_JAMMER')} disabled={battery <= 0}><span className={`w-1.5 h-1.5 rounded-full ${jammerActive ? 'bg-orange-500' : 'bg-slate-500'}`}></span>{jammerActive ? 'Stop Jammer' : 'Start Jammer'}</button><button className="w-full text-left px-3 py-2 text-sm text-white hover:bg-cyan-900/50 hover:text-cyan-200 transition-colors font-mono flex items-center gap-2" onClick={() => handleMenuAction('HARDLINE_TETHER')}><span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>Hardline Tether</button><button className={`w-full text-left px-3 py-2 text-sm transition-colors font-mono flex items-center gap-2 ${teamCompute >= COMPUTE_GATES.SYSTEM_OVERRIDE ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`} onClick={() => handleMenuAction('SYSTEM_OVERRIDE')} disabled={teamCompute < COMPUTE_GATES.SYSTEM_OVERRIDE}><span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.SYSTEM_OVERRIDE ? 'bg-purple-500' : 'bg-slate-500'}`}></span>{teamCompute >= COMPUTE_GATES.SYSTEM_OVERRIDE ? 'System Override (25 NRG)' : `Requires ${COMPUTE_GATES.SYSTEM_OVERRIDE} Compute`}</button></>)}
                    {isBallista && (
                        <>
                            {ammoState === 'empty' ? (
                                <>
                                    <button 
                                        className={`w-full text-left px-3 py-2 text-sm font-mono flex items-center gap-2 transition-colors ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`}
                                        onClick={() => handleMenuAction('REQUEST_DELIVERY_ECLIPSE')}
                                        disabled={teamCompute < COMPUTE_GATES.LAUNCH_ORDNANCE}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'bg-purple-500' : 'bg-slate-500'}`}></span>
                                        {teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? `Order Eclipse ($${ABILITY_CONFIG.WARHEAD_COST_ECLIPSE})` : `Requires ${COMPUTE_GATES.LAUNCH_ORDNANCE} Compute`}
                                    </button>
                                    <button 
                                        className={`w-full text-left px-3 py-2 text-sm font-mono flex items-center gap-2 transition-colors ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'text-white hover:bg-cyan-900/50 hover:text-cyan-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`}
                                        onClick={() => handleMenuAction('REQUEST_DELIVERY_WP')}
                                        disabled={teamCompute < COMPUTE_GATES.LAUNCH_ORDNANCE}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'bg-white' : 'bg-slate-500'}`}></span>
                                        {teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? `Order WP ($${ABILITY_CONFIG.WARHEAD_COST_WP})` : `Requires ${COMPUTE_GATES.LAUNCH_ORDNANCE} Compute`}
                                    </button>
                                </>
                            ) : ammoState === 'loading' ? (
                                <div className="px-3 py-2 text-sm text-yellow-400 font-mono italic">
                                    Loading...
                                </div>
                            ) : ammoState === 'awaiting_delivery' ? (
                                <div className="px-3 py-2 text-sm text-cyan-400 font-mono italic animate-pulse">
                                    Courier En Route...
                                </div>
                            ) : (
                                <button 
                                    className={`w-full text-left px-3 py-2 text-sm font-mono flex items-center gap-2 font-bold transition-colors ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'text-red-400 bg-red-900/20 hover:bg-red-900/50 hover:text-red-200' : 'text-slate-500 cursor-not-allowed bg-slate-800/50'}`}
                                    onClick={() => handleMenuAction('FIRE_BALLISTA')}
                                    disabled={teamCompute < COMPUTE_GATES.LAUNCH_ORDNANCE}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? 'bg-red-500 animate-ping' : 'bg-slate-500'}`}></span>
                                    {teamCompute >= COMPUTE_GATES.LAUNCH_ORDNANCE ? `FIRE ${loadedAmmo?.toUpperCase()}` : `Requires ${COMPUTE_GATES.LAUNCH_ORDNANCE} Compute`}
                                </button>
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
