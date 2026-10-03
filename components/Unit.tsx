
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Edges, Float, Html, Line, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TEAM_COLORS, UNIT_CLASSES, ABILITY_CONFIG, UNIT_STATS } from '../constants';
import { UnitType, UnitClass } from '../types';
import { isObjectInFrustum, isPointInFrustum } from '../frustum';

// Helper component for spinning rotors
const Rotor: React.FC = () => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (ref.current) {
        if (isObjectInFrustum(ref.current, 5)) {
             ref.current.rotation.y += delta * 20;
        }
    }
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
  isDeployed?: boolean; // Battery Mule anchor
  actionMenuOpen: boolean;
  onAction: (id: string, action: string) => void;
  isDecoy?: boolean;
  decoyActive?: boolean;
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
  repairTargetIds?: string[];
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
  showTetherRange?: boolean;
  showBatteryRange?: boolean;
  isTetherCandidate?: boolean;
  isBatteryLinkCandidate?: boolean;
  batteryTetherIds?: string[];
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'eclipse' | 'he' | null;
  missileInventory?: { eclipse: number; he: number }; // Added
  ordnanceMaterial?: number;
  fabrication?: { active: boolean; item: 'eclipse' | 'he'; progress: number; totalTime: number };
  atOrdnanceFab?: boolean;
  ballistaInRange?: boolean;
  cores?: number;
  warheadStock?: { eclipse: number; he: number };
  loadingProgress?: number;
  courierTargetId?: string;
  courierPayload?: 'eclipse' | 'he';
  bombardmentTarget?: { x: number; z: number } | null;
  jammerActive?: boolean;
  tetherTargetId?: string | null;
  isJammed?: boolean;
  isHacked?: boolean;
  hackType?: 'recall' | 'drain' | null;
  teamCompute: number; // New Prop
  firingLaserAt?: string | null;
  lastAttackTime?: number;
  // Step 3 Updates
  isStunned?: boolean;
  globalSpeedModifier?: number;
  activeBuffs?: ('speed' | 'damage' | 'regen')[];
  // Swarm Host Anchoring
  isAnchored?: boolean;
  // Step 2 Update: Nano Cloud
  isInNanoCloud?: boolean;
}

const GHOST_MODEL_URL = '/models/ghost.glb';

// The Tripo export has no UVs, so the reference paint lives in the mesh's own
// space: y up, face and rifle toward +Z. Lines are sized to read at RTS scale.
const GHOST_MARKINGS = `
float gBand(float value, float center, float width) {
  return 1.0 - smoothstep(width * 0.35, width, abs(value - center));
}
float gSpan(float value, float lo, float hi) {
  return smoothstep(lo - 0.012, lo + 0.004, value) * (1.0 - smoothstep(hi - 0.004, hi + 0.012, value));
}
vec3 ghostMarkings(vec3 p, vec3 n) {
  vec3 cyan = vec3(0.05, 0.75, 1.0);
  vec3 orange = vec3(1.0, 0.32, 0.02);
  float front = smoothstep(0.05, 0.45, n.z);
  float back = smoothstep(0.05, 0.45, -n.z);
  float body = 1.0 - smoothstep(0.11, 0.16, p.z);
  vec3 glow = vec3(0.0);

  float visor = gBand(p.y - abs(p.x) * 0.4, 0.858, 0.016);
  visor *= gSpan(abs(p.x), 0.0, 0.065);
  visor *= gSpan(p.z, -0.14, -0.03);
  glow += cyan * visor * 1.1;

  float chest = gBand(p.x, -0.012, 0.011) * gSpan(p.y, 0.60, 0.78) * gSpan(p.z, -0.09, 0.07);
  glow += cyan * chest * body * 0.9;

  float slashR = gBand(p.y - (p.x - 0.02) * 1.1, 0.70, 0.011) * gSpan(p.x, 0.015, 0.08) * gSpan(p.y, 0.66, 0.76);
  float slashL = gBand(p.y + (p.x + 0.04) * 1.1, 0.70, 0.011) * gSpan(-p.x, 0.0, 0.09) * gSpan(p.y, 0.66, 0.76);
  glow += orange * (slashR + slashL) * body * gSpan(p.z, -0.09, 0.08) * 0.85;

  float thighL = gBand(p.x, -0.082, 0.008) * gSpan(p.y, 0.22, 0.46) * gSpan(p.z, -0.20, -0.08);
  float thighR = gBand(p.x, 0.066, 0.008) * gSpan(p.y, 0.22, 0.46) * gSpan(p.z, -0.14, 0.0);
  glow += cyan * (thighL + thighR) * front * 0.65;

  float hipL = gBand(p.y + (p.x + 0.08) * 0.7, 0.46, 0.007) * gSpan(p.x, -0.11, -0.045) * gSpan(p.y, 0.43, 0.50);
  float hipR = gBand(p.y - (p.x - 0.06) * 0.7, 0.46, 0.007) * gSpan(p.x, 0.035, 0.10) * gSpan(p.y, 0.43, 0.50);
  glow += orange * (hipL + hipR) * front * 0.65;

  float shinL = gBand(p.x, -0.074, 0.007) * gSpan(p.y, 0.06, 0.26) * gSpan(p.z, -0.23, -0.12);
  float shinR = gBand(p.x, 0.070, 0.007) * gSpan(p.y, 0.06, 0.26) * gSpan(p.z, -0.08, 0.0);
  glow += cyan * (shinL + shinR) * front * 0.65;

  float arm = gBand(abs(p.x), 0.118, 0.007) * gSpan(p.y, 0.60, 0.66) * gSpan(p.z, -0.05, 0.05);
  glow += orange * arm * 0.55;

  float packA = 1.0 - smoothstep(0.006, 0.012, length(vec2(p.x - 0.02, p.y - 0.70)));
  float packB = 1.0 - smoothstep(0.006, 0.012, length(vec2(p.x + 0.03, p.y - 0.60)));
  glow += orange * (packA + packB) * back * gSpan(p.z, -0.34, -0.14) * 0.8;

  return glow;
}
`;

const paintGhostMaterial = (mat: THREE.MeshStandardMaterial) => {
  mat.color.set('#7c868f');
  mat.emissive.set('#000000');
  mat.emissiveIntensity = 1;
  mat.roughness = 0.62;
  mat.metalness = 0.18;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGhostPos;\nvarying vec3 vGhostN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGhostPos = position;\nvGhostN = normalize(normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGhostPos;\nvarying vec3 vGhostN;\n${GHOST_MARKINGS}`)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += ghostMarkings(vGhostPos, vGhostN) * smoothstep(0.4, 0.9, opacity);'
      );
  };
  mat.customProgramCacheKey = () => 'ghost-markings-v3';
};

// Tripo export is 1 unit tall, feet on y=0, face along +Z.
// Unit lookAt aims local -Z at the next waypoint, so the mesh is turned 180°.
const GhostModel: React.FC = () => {
  const { scene } = useGLTF(GHOST_MODEL_URL);
  const clone = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clonedMats = mats.map(mat => {
        const copy = mat.clone() as THREE.MeshStandardMaterial;
        if (copy.color) paintGhostMaterial(copy);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    return () => {
      clone.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mat => mat.dispose());
      });
    };
  }, [clone]);

  return <primitive object={clone} />;
};

useGLTF.preload(GHOST_MODEL_URL);

const Unit: React.FC<UnitProps> = ({ 
  id, type, unitClass, team, gridPos, isSelected, onSelect, tileSize, offset, path, onMoveStep, tileTypeMap, onDoubleClick, visionRange, visible = true, surveillance, isDampenerActive, isDeployed, actionMenuOpen, onAction, isDecoy, decoyActive, health, maxHealth, battery, maxBattery, secondaryBattery, maxSecondaryBattery, chargingStatus, cooldowns, repairTargetId, repairTargetIds, repairTargetPos, hackerPos, smoke, aps, charges, cargo, constructionTargetId, isTargetingMode, showTetherRange, showBatteryRange, isTetherCandidate, isBatteryLinkCandidate, ammoState, loadedAmmo, missileInventory, ordnanceMaterial, fabrication, atOrdnanceFab, ballistaInRange, cores, warheadStock, loadingProgress, courierPayload, bombardmentTarget, jammerActive, tetherTargetId, batteryTetherIds, isJammed, isHacked, hackType, firingLaserAt, lastAttackTime,
  isStunned, globalSpeedModifier = 1.0, activeBuffs, isAnchored, isInNanoCloud
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const moveScratch = useRef({
    waypoint: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    look: new THREE.Vector3(),
    orient: new THREE.Object3D(),
  });
  const radarRef = useRef<THREE.Group>(null);
  const tetherLineRef = useRef<THREE.BufferGeometry>(null);
  const batteryLineRefs = useRef<(THREE.BufferGeometry | null)[]>([]);
  const repairBeamRefs = useRef<(THREE.Mesh | null)[]>([]);
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
  const isSwarmHost = type === 'swarm_host';
  const isCrawler = type === 'crawler_drone';
  const isBombard = type === 'bombard';
  const isAir = isWasp || isDrone || isHelios || isBombard;
  
  const classConfig = UNIT_CLASSES[unitClass];
  const unitStats = UNIT_STATS[type];

  // Safety check to prevent crash if unit type is unknown
  if (!unitStats) return null;

  // Vehicles and drones stop when their battery is empty. Infantry keep moving; their battery only powers abilities.
  const needsLocomotionPower = unitClass !== 'infantry';
  const isDisabled = (needsLocomotionPower && battery <= 0) || (isHacked && hackType === 'drain') || isStunned;

  // Floating height difference
  // Raised ground units to 1.2 to clear the Base platform (height 1.0)
  const hoverHeight = isBombard ? 42 : isDefenseDrone ? 12.0 : (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee || isSwarmHost || isCrawler) ? 1.2 : (isAir ? 75.0 : 2.0);
  
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

  const bodyRef = useRef<THREE.Group>(null);

  // Owner-only cloak. Tinting is limited to the body group, which is remounted
  // when the cloak ends so the Ghost's materials come back solid.
  useLayoutEffect(() => {
    const root = bodyRef.current;
    if (!root || !decoyActive) return;
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const tinted = mat as THREE.MeshStandardMaterial;
        if (tinted.opacity === 0) continue;
        tinted.transparent = true;
        tinted.opacity = 0.32;
        tinted.depthWrite = false;
        if (tinted.color) tinted.color.set('#7dd3fc');
        if (tinted.emissive) {
          tinted.emissive.set('#38bdf8');
          tinted.emissiveIntensity = 0.85;
        }
      }
    });
  });

  const lastProcessedTargetRef = useRef<string | null>(null);
  // Fog of war unmounts the model, but the unit still has to finish its path.
  const simPos = useRef(new THREE.Vector3());
  const simReady = useRef(false);

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

  // Determine Speed multiplier
  const speedMultiplier = useMemo(() => {
    if (path.length === 0) return 0;
    if (isDisabled) return 0; // No speed if no battery or disabled/stunned
    if (isBallista && ammoState === 'loading') return 0; // Immobilized while loading
    if (isSwarmHost && isAnchored) return 0; // Anchored Swarm Host cannot move
    if (isJammed) return 0.5; 
    
    let speed = 1.0;

    if (isAir) {
         speed = 1.2;
    } else {
        const targetKey = path[0];
        const tileType = tileTypeMap[targetKey];
        if (tileType === 'main') speed = 2.0;    
        if (tileType === 'open') speed = 0.5;    
    }

    // Apply Unit Stats Mod
    speed *= unitStats.speedMod || 1.0;

    // Apply Ghost Dampener Penalty
    if (isGhost && isDampenerActive) {
        speed *= ABILITY_CONFIG.GHOST_SPEED_PENALTY;
    }

    // Apply Global Modifiers
    speed *= globalSpeedModifier;

    // Apply Active Buffs (e.g. Shadow Ops Passive)
    if (activeBuffs?.includes('speed')) {
        speed *= 1.2;
    }
    
    return speed;
  }, [path, tileTypeMap, isGhost, isDampenerActive, unitStats, isAir, isDisabled, isBallista, ammoState, isJammed, globalSpeedModifier, activeBuffs, isSwarmHost, isAnchored]);

  useFrame((state, delta) => {
    let isVisible = true;
    if (meshRef.current) {
        isVisible = isObjectInFrustum(meshRef.current, 15);
        if (meshRef.current.visible !== isVisible) {
            meshRef.current.visible = isVisible;
        }
    }

    if (isVisible) {
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
        
        if (meshRef.current && isDefenseDrone) {
            meshRef.current.rotation.y += delta * 0.5;
        }
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
        if (tetherTargetId) {
            const targetObj = scene.getObjectByName(`unit-${tetherTargetId}`);
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
            }
        } else {
            tetherLineRef.current.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
            tetherLineRef.current.attributes.position.needsUpdate = true;
        }
    }

    if (isSunPlate && meshRef.current) {
        const ids = batteryTetherIds || [];
        for (let i = 0; i < ABILITY_CONFIG.BATTERY_MULE_SLOTS; i++) {
            const geom = batteryLineRefs.current[i];
            if (!geom) continue;
            const targetObj = ids[i] ? scene.getObjectByName(`unit-${ids[i]}`) : null;
            if (!targetObj) {
                geom.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
            } else {
                const start = new THREE.Vector3(0, 1.2, 0);
                const targetWorld = new THREE.Vector3();
                targetObj.getWorldPosition(targetWorld);
                const sourceWorld = new THREE.Vector3();
                meshRef.current.getWorldPosition(sourceWorld);
                const diffWorld = new THREE.Vector3().subVectors(targetWorld, sourceWorld);
                diffWorld.y += 0.6;
                const localEnd = diffWorld.applyQuaternion(meshRef.current.quaternion.clone().invert());
                geom.setFromPoints([start, localEnd]);
            }
            geom.attributes.position.needsUpdate = true;
        }
    }

    if (isGuardian && meshRef.current) {
        const ids = repairTargetIds && repairTargetIds.length > 0 ? repairTargetIds : (repairTargetId ? [repairTargetId] : []);
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS; i++) {
            const beam = repairBeamRefs.current[i];
            if (!beam) continue;
            const targetObj = ids[i] ? scene.getObjectByName(`unit-${ids[i]}`) : null;
            if (!targetObj) {
                beam.visible = false;
                continue;
            }
            const start = new THREE.Vector3(0, 1.6, 0);
            const targetWorld = new THREE.Vector3();
            targetObj.getWorldPosition(targetWorld);
            const sourceWorld = new THREE.Vector3();
            meshRef.current.getWorldPosition(sourceWorld);
            const localEnd = new THREE.Vector3().subVectors(targetWorld, sourceWorld);
            localEnd.y += 0.6;
            localEnd.applyQuaternion(meshRef.current.quaternion.clone().invert());
            const span = new THREE.Vector3().subVectors(localEnd, start);
            const length = span.length();
            if (length < 0.05) {
                beam.visible = false;
                continue;
            }
            beam.visible = true;
            beam.position.copy(start).add(localEnd).multiplyScalar(0.5);
            beam.scale.set(1, length, 1);
            beam.quaternion.setFromUnitVectors(up, span.multiplyScalar(1 / length));
        }
    }

    if (!meshRef.current) {
        const gx = (gridPos.x * tileSize) - offset;
        const gz = (gridPos.z * tileSize) - offset;
        if (!simReady.current) {
            simPos.current.set(gx, hoverHeight, gz);
            simReady.current = true;
        }
        if (path.length > 0 && speedMultiplier > 0 && !isDeployed && !isAnchored && !(isBallista && ammoState === 'loading')) {
            const moveDist = BASE_SPEED * speedMultiplier * Math.min(delta, 0.05);
            const scratch = moveScratch.current;
            let waypointKey = path[0];
            if (lastProcessedTargetRef.current === waypointKey && path.length > 1) waypointKey = path[1];
            const [wx, wz] = waypointKey.split(',').map(Number);
            const waypoint = scratch.waypoint.set((wx * tileSize) - offset, hoverHeight, (wz * tileSize) - offset);
            const dist = simPos.current.distanceTo(waypoint);
            if (moveDist > 0 && dist > moveDist) {
                scratch.dir.subVectors(waypoint, simPos.current).normalize();
                simPos.current.add(scratch.dir.multiplyScalar(moveDist));
            } else if (dist <= moveDist) {
                simPos.current.copy(waypoint);
            }
            if (isAir) {
                const cx = Math.round((simPos.current.x + offset) / tileSize);
                const cz = Math.round((simPos.current.z + offset) / tileSize);
                const stepKey = `${cx},${cz}`;
                if (stepKey === path[0] && lastProcessedTargetRef.current !== path[0]) {
                    lastProcessedTargetRef.current = path[0];
                    onMoveStep(id);
                }
            } else if (dist <= moveDist && waypointKey === path[0] && lastProcessedTargetRef.current !== path[0]) {
                lastProcessedTargetRef.current = path[0];
                onMoveStep(id);
            }
        }
        return;
    }

    simReady.current = false;

    if (meshRef.current) {
        if (isDefenseDrone) {
            meshRef.current.rotation.y += delta * 0.5;
            meshRef.current.position.y = logicalWorldPos.y + Math.sin(state.clock.elapsedTime * 2) * 0.5;
            return;
        }

        if (surveillance && surveillance.status === 'active' && !isTank && !isGhost && !isGuardian && !isMule && !isMason && !isSunPlate && !isBallista && !isCourier && !isBanshee && !isSwarmHost && !isCrawler) {
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

        if (path.length > 0 && !isDisabled && !isDeployed && !isAnchored && !(isBallista && ammoState === 'loading')) {
             const meshPos = meshRef.current.position;
             const moveDist = BASE_SPEED * speedMultiplier * Math.min(delta, 0.05);
             const scratch = moveScratch.current;

             // path[0] is the next logical tile. Once that step is already
             // reported, keep walking toward path[1] so the model doesn't
             // sit on the tile center waiting for React to drop path[0].
             let waypointKey = path[0];
             if (lastProcessedTargetRef.current === waypointKey && path.length > 1) {
                 waypointKey = path[1];
             }
             const [wx, wz] = waypointKey.split(',').map(Number);
             const waypoint = scratch.waypoint.set(
                 (wx * tileSize) - offset,
                 hoverHeight,
                 (wz * tileSize) - offset
             );

             const dist = meshPos.distanceTo(waypoint);
             if (moveDist > 0 && dist > moveDist) {
                 scratch.dir.subVectors(waypoint, meshPos).normalize();
                 meshPos.add(scratch.dir.multiplyScalar(moveDist));
             } else if (dist <= moveDist) {
                 meshPos.copy(waypoint);
             }

             if (dist > 0.05) {
                 scratch.look.set(waypoint.x, meshPos.y, waypoint.z);
                 scratch.orient.position.copy(meshPos);
                 scratch.orient.lookAt(scratch.look);
                 meshRef.current.quaternion.slerp(scratch.orient.quaternion, 1 - Math.exp(-delta * 14));
             }

             if (isAir) {
                 const cx = Math.round((meshPos.x + offset) / tileSize);
                 const cz = Math.round((meshPos.z + offset) / tileSize);
                 const stepKey = `${cx},${cz}`;
                 if (stepKey === path[0] && lastProcessedTargetRef.current !== path[0]) {
                     lastProcessedTargetRef.current = path[0];
                     onMoveStep(id);
                 }
             } else if (dist <= moveDist && waypointKey === path[0] && lastProcessedTargetRef.current !== path[0]) {
                 lastProcessedTargetRef.current = path[0];
                 onMoveStep(id);
             }
        } else {
            meshRef.current.position.lerp(targetWorldPos, 1 - Math.exp(-delta * 10));
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
    onAction(id, action);
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
    if (isSunPlate) {
        const planted = !!isDeployed;
        return (
            <group scale={[2.6, 2.6, 2.6]}>
                {[-0.9, 0.9].map((x) => (
                    <mesh key={x} position={[x, 0.28, 0]}>
                        <boxGeometry args={[0.46, 0.42, 2.5]} />
                        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.55} />
                        <Edges color="#0f172a" />
                    </mesh>
                ))}
                <mesh position={[0, planted ? 0.48 : 0.62, -0.05]}>
                    <boxGeometry args={[1.4, 0.5, 2.3]} />
                    <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.35} />
                    <Edges color={teamColor} />
                </mesh>
                {[-0.4, 0, 0.4].map((x, cell) => (
                    <mesh key={cell} position={[x, planted ? 0.9 : 1.05, -0.2]}>
                        <boxGeometry args={[0.32, 0.46, 1.2]} />
                        <meshStandardMaterial color="#422006" emissive="#facc15" emissiveIntensity={planted ? 0.9 : 0.28} />
                        <Edges color="#facc15" />
                    </mesh>
                ))}
                <mesh position={[0, planted ? 0.88 : 1.02, 0.82]}>
                    <boxGeometry args={[1.1, 0.46, 0.62]} />
                    <meshStandardMaterial color="#475569" metalness={0.45} roughness={0.4} />
                    <Edges color="#0f172a" />
                </mesh>
                <mesh position={[0, planted ? 0.95 : 1.1, 1.14]}>
                    <planeGeometry args={[0.7, 0.18]} />
                    <meshBasicMaterial color={teamColor} />
                </mesh>
                {planted && [[-0.75, -1.0], [0.75, -1.0], [-0.75, 1.0], [0.75, 1.0]].map(([x, z], pad) => (
                    <mesh key={pad} position={[x, 0.06, z]}>
                        <cylinderGeometry args={[0.16, 0.22, 0.08, 6]} />
                        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.45} />
                    </mesh>
                ))}
            </group>
        );
    }
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
    if (isGhost) return (
        <group>
            <group scale={4.2} rotation={[0, Math.PI, 0]}>
                <GhostModel />
            </group>
            {isDampenerActive && (
                <group>
                    <mesh rotation={[0, Date.now() * 0.001, 0]} raycast={() => null}>
                        <sphereGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 12, 12]} />
                        <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.1} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
                        <ringGeometry args={[ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize - 0.5, ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize, 16]} />
                        <meshBasicMaterial color={teamColor} transparent opacity={0.3} />
                    </mesh>
                </group>
            )}
            <pointLight ref={flashRef} position={[0, 2.2, 0]} color="#fbbf24" distance={3} decay={2} visible={false} />
        </group>
    );
    if (isBombard) return (
        <group scale={[3.4, 3.4, 3.4]}>
            <mesh position={[0, 0.15, 0]}>
                <boxGeometry args={[0.7, 0.28, 2.4]} />
                <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.4} />
                <Edges color="#0f172a" />
            </mesh>
            <mesh position={[0, 0.05, 0.15]}>
                <boxGeometry args={[0.5, 0.16, 1.2]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>
            {[-0.35, 0.35].map(x => (
                <mesh key={x} position={[x, -0.02, 0]}>
                    <boxGeometry args={[0.08, 0.06, 0.9]} />
                    <meshBasicMaterial color="#f97316" />
                </mesh>
            ))}
            <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[3.4, 0.08, 0.7]} />
                <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.5} />
                <Edges color={teamColor} />
            </mesh>
            {[[-1.55, 0.34], [1.55, 0.34], [-1.55, -0.34], [1.55, -0.34]].map((pos, i) => (
                <group key={i} position={[pos[0], 0.34, pos[1]]}>
                    <mesh><cylinderGeometry args={[0.16, 0.16, 0.08, 8]} /><meshStandardMaterial color="#0f172a" /></mesh>
                    <mesh rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[0.42, 0.02, 0.06]} /><meshStandardMaterial color="#94a3b8" /></mesh>
                </group>
            ))}
            <mesh position={[0, 0.32, 0.95]}>
                <boxGeometry args={[0.28, 0.16, 0.4]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>
            <mesh position={[0, 0.32, 1.16]}>
                <planeGeometry args={[0.18, 0.08]} />
                <meshBasicMaterial color={teamColor} />
            </mesh>
        </group>
    );
    if (isWasp) return (<Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}> <group scale={[2.4, 2.4, 2.4]}> <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 0.4, 1.0]} /><meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} /><Edges color="#1e293b" /></mesh> <mesh position={[0, 0, 0.55]}><boxGeometry args={[0.4, 0.3, 0.2]} /><meshStandardMaterial color="#334155" metalness={0.8} /></mesh> <mesh position={[-0.1, 0.05, 0.66]}><planeGeometry args={[0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0.1, 0.05, 0.66]}><planeGeometry args={[0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> <mesh position={[0, 0.1, -0.55]}><boxGeometry args={[0.4, 0.2, 0.2]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0.4, -0.3]}><boxGeometry args={[0.05, 0.4, 0.6]} /><meshStandardMaterial color="#64748b" /><Edges color="#334155" /></mesh> {[-1, 1].map((dir) => ( <group key={dir} position={[dir * 0.6, 0, 0.1]}> <mesh position={[dir * -0.2, 0, 0]}><boxGeometry args={[0.4, 0.1, 0.4]} /><meshStandardMaterial color="#475569" /></mesh> <mesh rotation={[Math.PI/2, 0, Math.PI/2]}><cylinderGeometry args={[0.3, 0.3, 1.2, 6]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" threshold={15} /></mesh> <mesh position={[0, 0, 0.61]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.05, 6]} /><meshStandardMaterial color="#1e293b" /></mesh> {[0, 60, 120, 180, 240, 300].map((angle, i) => { const rad = (angle * Math.PI) / 180; const r = 0.15; const x = Math.cos(rad) * r; const y = Math.sin(rad) * r; return ( <mesh key={i} position={[x, y, 0.65]} rotation={[Math.PI/2, 0, 0]}> <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} /><meshStandardMaterial color="#b91c1c" /> <mesh position={[0, 0.06, 0]}><sphereGeometry args={[0.04]} /><meshBasicMaterial color="#ef4444" /> </mesh> </mesh> ) })} <mesh position={[0, 0.31, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[0.4, 0.8]} /><meshBasicMaterial color={teamColor} transparent opacity={0.5} /></mesh> <mesh position={[0, 0, -0.61]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.2, 8]} /><meshBasicMaterial color={teamColor} transparent opacity={0.8} /></mesh> </group> ))} {[0.3, -0.3].map((x, i) => ( <group key={`vtol-${i}`} position={[x, -0.25, 0]}> <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.1, 0.4, 8, 1, true]} /><meshBasicMaterial color={teamColor} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh> </group> ))} <pointLight ref={flashRef} position={[0, 0, 0.8]} color="#fbbf24" distance={3} decay={2} visible={false} /> </group> </Float>);
    if (isDrone) return (<Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[0, 0.5]}> <group scale={[2.2, 2.2, 2.2]}> <mesh position={[0, 0, 0]}><boxGeometry args={[0.5, 0.25, 1.0]} /><meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} /><Edges color={teamColor} /></mesh> <mesh position={[0, 0.15, -0.1]}><boxGeometry args={[0.4, 0.15, 0.6]} /><meshStandardMaterial color="#475569" /></mesh> <group position={[0, 0, 0.55]}> <mesh rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.2, 8]} /><meshStandardMaterial color="#1e293b" /></mesh> <mesh position={[0, 0, 0.11]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.08, 8]} /><meshBasicMaterial color="#0ea5e9" toneMapped={false} /> </mesh> <pointLight color="#0ea5e9" distance={2} intensity={2} decay={2} /> </group> {[{ x: 0.6, z: 0.6 }, { x: -0.6, z: 0.6 }, { x: 0.6, z: -0.6 }, { x: -0.6, z: -0.6 }].map((pos, i) => ( <group key={i} position={[pos.x, 0, pos.z]}> <mesh position={[-pos.x/2, 0, -pos.z/2]} rotation={[0, Math.atan2(pos.x, pos.z), 0]}><boxGeometry args={[0.1, 0.05, Math.hypot(pos.x, pos.z)]} /><meshStandardMaterial color="#64748b" /></mesh> <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.08, 0.08, 0.15]} /><meshStandardMaterial color="#0f172a" /></mesh> <mesh rotation={[Math.PI/2, 0, 0]}><ringGeometry args={[0.35, 0.38, 12]} /><meshStandardMaterial color="#334155" side={THREE.DoubleSide} /></mesh> <group position={[0, 0.05, 0]}><Rotor /></group> <mesh position={[0, -0.15, 0]}><sphereGeometry args={[0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> ))} <mesh position={[0, 0.2, -0.4]} rotation={[-0.3, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 0.6]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0.5, -0.5]}><sphereGeometry args={[0.04]} /><meshBasicMaterial color={teamColor} /></mesh> </group> </Float>);
    
    if (isSwarmHost) {
        return (
            <group scale={[2.8, 2.8, 2.8]}>
                {/* Main Bunker Body */}
                <group position={[0, 1.2, 0]}>
                    <mesh><boxGeometry args={[1.4, 1.0, 1.6]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /><Edges color="#38bdf8" threshold={15} /></mesh>
                    
                    {/* Top Hatch / Vents */}
                    <mesh position={[0, 0.51, 0]}><boxGeometry args={[1.0, 0.1, 1.0]} /><meshStandardMaterial color="#334155" /></mesh>
                    <mesh position={[0, 0.52, 0]}><planeGeometry args={[0.8, 0.8]} /><meshBasicMaterial color={teamColor} transparent opacity={0.3} /></mesh>
                    
                    {/* Glowing Side Panels (Orange/Team Color) */}
                    <mesh position={[0.71, 0, 0]} rotation={[0, Math.PI/2, 0]}><planeGeometry args={[1.2, 0.4]} /><meshBasicMaterial color="#f97316" /></mesh>
                    <mesh position={[-0.71, 0, 0]} rotation={[0, -Math.PI/2, 0]}><planeGeometry args={[1.2, 0.4]} /><meshBasicMaterial color="#f97316" /></mesh>

                    {/* Front Ramp (Open) */}
                    <group position={[0, -0.4, 0.8]} rotation={[Math.PI/6, 0, 0]}>
                        <mesh position={[0, 0, 0.4]}><boxGeometry args={[1.0, 0.1, 0.8]} /><meshStandardMaterial color="#0f172a" /></mesh>
                        {/* Interior Glow emitting from ramp */}
                        <pointLight position={[0, 0.2, 0]} color="#f97316" distance={2} intensity={2} />
                    </group>
                </group>

                {/* Heavy Legs */}
                {[45, 135, 225, 315].map((angle, i) => {
                    const rad = angle * Math.PI / 180;
                    // Use isAnchored to determine leg spread/rotation
                    const legRotationZ = isAnchored ? -Math.PI / 6 : 0; 
                    const legPosY = isAnchored ? 0.2 : 0.5;
                    const legPosOffset = isAnchored ? 0.8 : 0.6; // Spread out more

                    return (
                        <group key={i} rotation={[0, rad, 0]}>
                            <group position={[legPosOffset, legPosY, legPosOffset]} rotation={[0, 0, legRotationZ]}>
                                {/* Upper Leg */}
                                <mesh rotation={[0, 0, -Math.PI/4]} position={[0.2, 0.4, 0]}><boxGeometry args={[0.6, 0.25, 0.3]} /><meshStandardMaterial color="#334155" /></mesh>
                                {/* Lower Leg */}
                                <mesh position={[0.5, -0.4, 0]}><boxGeometry args={[0.25, 1.0, 0.25]} /><meshStandardMaterial color="#1e293b" /></mesh>
                                {/* Foot */}
                                <mesh position={[0.5, -0.9, 0]}><boxGeometry args={[0.35, 0.15, 0.35]} /><meshStandardMaterial color="#475569" /></mesh>
                                {/* Leg Joint Glow */}
                                <mesh position={[0.5, 0.1, 0.13]}><planeGeometry args={[0.1, 0.3]} /><meshBasicMaterial color="#38bdf8" /></mesh>
                            </group>
                        </group>
                    )
                })}
            </group>
        );
    }

    if (isCrawler) {
        return (
            <group scale={[1.2, 1.2, 1.2]}>
                {/* Central Core */}
                <mesh position={[0, 0.3, 0]}><octahedronGeometry args={[0.25]} /><meshStandardMaterial color="#334155" metalness={0.9} /></mesh>
                {/* Glowing Eye */}
                <mesh position={[0, 0.35, 0.15]}><sphereGeometry args={[0.1]} /><meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={2} /></mesh>
                
                {/* Spider Legs */}
                {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                    const rad = angle * Math.PI / 180;
                    return (
                        <group key={i} rotation={[0, rad, 0]}>
                            <group position={[0.2, 0.2, 0]}>
                                <mesh rotation={[0, 0, -Math.PI/6]}><boxGeometry args={[0.3, 0.05, 0.05]} /><meshStandardMaterial color="#475569" /></mesh>
                                <mesh position={[0.25, -0.15, 0]} rotation={[0, 0, Math.PI/3]}><boxGeometry args={[0.3, 0.04, 0.04]} /><meshStandardMaterial color="#1e293b" /></mesh>
                            </group>
                        </group>
                    )
                })}
                {/* Antenna */}
                <mesh position={[0, 0.5, -0.1]} rotation={[-0.2, 0, 0]}><cylinderGeometry args={[0.01, 0.01, 0.3]} /><meshBasicMaterial color="#94a3b8" /></mesh>
            </group>
        );
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee || isSwarmHost || isCrawler) ? 0.1 : -1.2, 0]}>
          <ringGeometry args={[tileSize * 0.5, tileSize * 0.55, 32]} />
          <meshBasicMaterial color={teamColor} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Hitbox */}
      <mesh position={[0, 0, 0]} visible={true}>
          <boxGeometry args={[3.5, 3.5, 3.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={bodyRef} key={decoyActive ? 'cloaked' : 'solid'}>
        {renderModel()}
      </group>

      {decoyActive && (
        <group>
          <mesh position={[0, 0.8, 0]} userData={{ cloakShell: true }} raycast={() => null}>
            <capsuleGeometry args={[0.7, 1.2, 4, 10]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight color="#38bdf8" intensity={1.4} distance={8} decay={2} />
        </group>
      )}

      {/* Swarm Host Anchor Range */}
      {isSwarmHost && isAnchored && (
          <group position={[0, 0.2, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[ABILITY_CONFIG.CRAWLER_RADIUS * tileSize - 0.2, ABILITY_CONFIG.CRAWLER_RADIUS * tileSize, 64]} />
                  <meshBasicMaterial color={teamColor} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[ABILITY_CONFIG.CRAWLER_RADIUS * tileSize - 0.3, ABILITY_CONFIG.CRAWLER_RADIUS * tileSize - 0.25, 64]} />
                  <meshBasicMaterial color={teamColor} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
          </group>
      )}

      {/* Stunned Effect Overlay */}
      {isStunned && (
          <group position={[0, 3, 0]}>
              <Float speed={10} rotationIntensity={0} floatIntensity={0.5}>
                  <Html center>
                      <div className="text-yellow-400 font-bold text-2xl animate-pulse shadow-black drop-shadow-md">
                          ⚡
                      </div>
                  </Html>
              </Float>
              <mesh position={[0, -1, 0]}>
                  <cylinderGeometry args={[1.5, 1.5, 3, 8, 1, true]} />
                  <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.3} />
              </mesh>
          </group>
      )}

      {/* Lines, Effects, Html overlays */}
      {tetherTargetId && (<line><bufferGeometry ref={tetherLineRef} /><lineBasicMaterial color="#38bdf8" linewidth={2} transparent opacity={0.6} /></line>)}
      {isSunPlate && Array.from({ length: ABILITY_CONFIG.BATTERY_MULE_SLOTS }, (_, i) => (
          <line key={`battery-link-${i}`}>
              <bufferGeometry ref={(node) => { batteryLineRefs.current[i] = node as THREE.BufferGeometry | null; }} />
              <lineBasicMaterial color="#facc15" transparent opacity={0.9} />
          </line>
      ))}
      {isGuardian && Array.from({ length: ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS }, (_, i) => (
          <mesh key={`repair-${i}`} ref={(node) => { repairBeamRefs.current[i] = node; }} visible={false} raycast={() => null}>
              <cylinderGeometry args={[0.08, 0.08, 1, 6]} />
              <meshBasicMaterial color="#4ade80" transparent opacity={0.85} depthWrite={false} />
          </mesh>
      ))}
      {isGuardian && isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
              <ringGeometry args={[ABILITY_CONFIG.GUARDIAN_REPAIR_RANGE * tileSize - 0.35, ABILITY_CONFIG.GUARDIAN_REPAIR_RANGE * tileSize, 48]} />
              <meshBasicMaterial color="#4ade80" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
      )}
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
      {showTetherRange && (
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
          <ringGeometry args={[ABILITY_CONFIG.BANSHEE_TETHER_RANGE * tileSize, ABILITY_CONFIG.BANSHEE_TETHER_RANGE * tileSize + 0.35, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {showBatteryRange && (
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.15, 0]} raycast={() => null}>
          <ringGeometry args={[ABILITY_CONFIG.BATTERY_MULE_RANGE * tileSize, ABILITY_CONFIG.BATTERY_MULE_RANGE * tileSize + 0.45, 64]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {isTetherCandidate && (
        <group>
          <mesh position={[0, -hoverHeight / 2, 0]}>
            <cylinderGeometry args={[tileSize * 0.55, tileSize * 0.55, Math.max(hoverHeight + 2, 4), 12]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -hoverHeight + 0.25, 0]}>
            <ringGeometry args={[tileSize * 0.45, tileSize * 0.6, 24]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {isBatteryLinkCandidate && (
        <group>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[tileSize * 0.5, tileSize * 0.5, 2.2, 12]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.14} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.3, 0]}>
            <ringGeometry args={[tileSize * 0.4, tileSize * 0.55, 24]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.75} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
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

      {/* Guardian Repair Beam fallback when only a world position is known */}
      {isGuardian && !repairTargetIds?.length && repairTargetPos && (
          <Line
              points={[[0, 1.5, 0], [repairTargetPos.x - logicalWorldPos.x, repairTargetPos.y - logicalWorldPos.y + 0.5, repairTargetPos.z - logicalWorldPos.z]]}
              color="#4ade80"
              lineWidth={2}
          />
      )}

      {/* Bars stay hidden until the unit is selected, or that meter drops below full.
          The action menu occupies this same anchor, so its own copy of the bars is shown instead. */}
      {!isDecoy && !actionMenuOpen && (isSelected || health < maxHealth || (maxBattery > 0 && battery < maxBattery) || (secondaryBattery !== undefined && maxSecondaryBattery !== undefined && secondaryBattery < maxSecondaryBattery) || (chargingStatus !== undefined && chargingStatus > 0 && !isInNanoCloud)) && (
        <Html position={[0, 4, 0]} center zIndexRange={[50, 0]}>
            <div className="flex flex-col items-center pointer-events-none" style={{ width: '32px' }}>
                {/* Health */}
                {(isSelected || health < maxHealth) && (
                <div className="hud-meter w-full h-1 mb-0.5">
                    <div className="hud-meter-hp h-full transition-all duration-300" style={{ width: `${(health / maxHealth) * 100}%` }} />
                </div>
                )}
                {/* Battery */}
                {maxBattery > 0 && (isSelected || battery < maxBattery) && (
                    <div className="hud-meter w-full h-1">
                        <div className="hud-meter-cell h-full transition-all duration-300" style={{ width: `${(battery / maxBattery) * 100}%` }} />
                    </div>
                )}
                {/* Secondary Battery (Banshee) */}
                {secondaryBattery !== undefined && maxSecondaryBattery !== undefined && (isSelected || secondaryBattery < maxSecondaryBattery) && (
                    <div className="hud-meter w-full h-1 mt-0.5">
                        <div className="hud-meter-sec h-full transition-all duration-300" style={{ width: `${(secondaryBattery / maxSecondaryBattery) * 100}%` }} />
                    </div>
                )}
                {/* Charging Icon */}
                {chargingStatus !== undefined && chargingStatus > 0 && !isInNanoCloud && (
                    <div className="absolute -right-3 -top-2 text-yellow-400 text-[10px] animate-pulse font-bold shadow-black drop-shadow-md">
                        ⚡
                    </div>
                )}
            </div>
        </Html>
      )}

      {/* Action Menu (Over unit) */}
      {actionMenuOpen && (
        <Html position={[0, 4, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
           <div className="flex flex-col gap-1 pointer-events-auto" onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <div className="hud-plate hud-corners hud-menu backdrop-blur p-2 flex flex-col gap-1 pointer-events-auto min-w-[120px]">
                  
                  {/* Unit Label Header */}
                  <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider border-b border-cyan-500/30 pb-1 mb-1 text-center whitespace-nowrap">
                      {unitStats.label}
                  </div>
                  <div className="relative z-10 flex flex-col gap-1 mb-1">
                      <div className="flex items-center gap-1">
                          <span className="text-[8px] font-mono text-cyan-300 w-5 leading-none">HP</span>
                          <div className="hud-meter flex-1 h-2">
                              <div className="hud-meter-hp h-full" style={{ width: `${(health / maxHealth) * 100}%` }} />
                          </div>
                      </div>
                      {maxBattery > 0 && (
                          <div className="flex items-center gap-1">
                              <span className="text-[8px] font-mono text-amber-300 w-5 leading-none">EN</span>
                              <div className="hud-meter flex-1 h-2">
                                  <div className="hud-meter-cell h-full" style={{ width: `${(battery / maxBattery) * 100}%` }} />
                              </div>
                          </div>
                      )}
                      {secondaryBattery !== undefined && maxSecondaryBattery !== undefined && (
                          <div className="flex items-center gap-1">
                              <span className="text-[8px] font-mono text-fuchsia-300 w-5 leading-none">SEC</span>
                              <div className="hud-meter flex-1 h-2">
                                  <div className="hud-meter-sec h-full" style={{ width: `${(secondaryBattery / maxSecondaryBattery) * 100}%` }} />
                              </div>
                          </div>
                      )}
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
                        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleMenuAction('PHANTOM_DECOY_INIT'); }} className={`text-[10px] ${decoyActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>{decoyActive ? 'Phantom Decoy (On)' : 'Phantom Decoy'}</button>
                      </>
                  )}
                  {isBanshee && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_JAMMER'); }} className={`text-[10px] ${jammerActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Jammer</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('HARDLINE_TETHER'); }} className={`text-[10px] ${tetherTargetId || isTargetingMode ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>{tetherTargetId ? 'Retether' : 'Tether'}</button>
                        {tetherTargetId && (
                          <button onClick={(e) => { e.stopPropagation(); handleMenuAction('DISCONNECT_TETHER'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Disconnect</button>
                        )}
                      </>
                  )}
                  {isSunPlate && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_ANCHOR'); }} className={`text-[10px] ${isDeployed ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>{isDeployed ? 'Unanchor' : 'Anchor Down'}</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('BATTERY_TETHER'); }} disabled={!isDeployed} className={`text-[10px] ${isDeployed ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-900 text-slate-500'} px-2 py-1 rounded text-left flex justify-between`}><span>{isTargetingMode ? 'Select Vehicle' : 'Tether'}</span><span>{(batteryTetherIds || []).length}/{ABILITY_CONFIG.BATTERY_MULE_SLOTS}</span></button>
                        {(batteryTetherIds || []).length > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); handleMenuAction('DISCONNECT_BATTERY'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Disconnect</button>
                        )}
                      </>
                  )}
                  {isDrone && (
                      <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOITERING SURVEILLANCE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Surveillance</button>
                  )}
                  {isBombard && (
                      <>
                        <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Bombardment</div>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('BOMBARD'); }} className={`text-[10px] ${bombardmentTarget ? 'bg-orange-900 text-orange-200' : 'bg-slate-800 text-orange-300'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Bombard</button>
                        <div className="text-[9px] text-slate-500 px-1">{bombardmentTarget ? 'On approach' : '2-square cluster strike'}</div>
                      </>
                  )}
                  {isMule && (() => {
                      const material = ordnanceMaterial ?? 0;
                      const eclipseReady = missileInventory?.eclipse ?? 0;
                      const heReady = missileInventory?.he ?? 0;
                      const held = eclipseReady + heReady;
                      const room = ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY - held;
                      const busy = !!fabrication?.active;
                      const canFabricateEclipse = material > 0 && !busy && (cores ?? 0) >= ABILITY_CONFIG.WARHEAD_COST_ECLIPSE;
                      const canFabricateHe = material > 0 && !busy && (cores ?? 0) >= ABILITY_CONFIG.WARHEAD_COST_HE;
                      const canLoad = !!atOrdnanceFab && material < room;
                      return (
                          <>
                              <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Field Fabricator</div>
                              <div className="text-[10px] text-amber-300 px-2 py-1 bg-slate-900/50 rounded">Material {material}/{ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY}</div>
                              <div className="text-[9px] text-slate-500 font-mono px-1">Eclipse {eclipseReady} · HE {heReady}</div>
                              {busy && fabrication && (
                                  <div className="px-1">
                                      <div className="text-[9px] text-yellow-300 font-mono uppercase">
                                          Fabricating {fabrication.item === 'eclipse' ? 'Eclipse' : 'HE'} {Math.min(100, Math.floor((fabrication.progress / fabrication.totalTime) * 100))}%
                                      </div>
                                      <div className="hud-meter w-full h-1.5 mt-1">
                                          <div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, Math.min(100, (fabrication.progress / fabrication.totalTime) * 100))}%` }} />
                                      </div>
                                  </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FABRICATE_ECLIPSE'); }} disabled={!canFabricateEclipse} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-400 px-2 py-1 rounded text-left flex justify-between disabled:opacity-40"><span>Fabricate Eclipse</span><span>{ABILITY_CONFIG.WARHEAD_COST_ECLIPSE}</span></button>
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FABRICATE_HE'); }} disabled={!canFabricateHe} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left flex justify-between disabled:opacity-40"><span>Fabricate HE</span><span>{ABILITY_CONFIG.WARHEAD_COST_HE}</span></button>
                              {canLoad && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('RESUPPLY_MATERIAL'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded text-left">Load Material</button>
                              )}
                              {room <= 0 && (
                                  <div className="text-[9px] text-slate-500 px-1">Bay full — hand missiles to a Ballista</div>
                              )}
                              {room > 0 && material < room && !atOrdnanceFab && (
                                  <div className="text-[9px] text-slate-500 px-1">Drive to an Ordnance Fab to load material</div>
                              )}
                              {eclipseReady > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TRANSFER_ECLIPSE'); }} disabled={!ballistaInRange} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-300 px-2 py-1 rounded text-left disabled:opacity-40">Transfer Eclipse ({eclipseReady})</button>
                              )}
                              {heReady > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TRANSFER_HE'); }} disabled={!ballistaInRange} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-300 px-2 py-1 rounded text-left disabled:opacity-40">Transfer HE ({heReady})</button>
                              )}
                              {held > 0 && !ballistaInRange && (
                                  <div className="text-[9px] text-slate-500 px-1">Drive to a Ballista to hand off missiles</div>
                              )}
                          </>
                      );
                  })()}
                  {isBallista && (
                      <>
                          <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Missile Bay</div>
                          {ammoState === 'empty' && (
                              <>
                                {atOrdnanceFab ? (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TAKE_ECLIPSE'); }} disabled={!warheadStock?.eclipse} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-400 px-2 py-1 rounded text-left disabled:opacity-40">Take Eclipse ({warheadStock?.eclipse ?? 0})</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TAKE_HE'); }} disabled={!warheadStock?.he} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left disabled:opacity-40">Take HE ({warheadStock?.he ?? 0})</button>
                                  </>
                                ) : (
                                  <div className="text-[9px] text-slate-500 px-1">Drive to an Ordnance Fab to resupply</div>
                                )}
                                {missileInventory && missileInventory.eclipse > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_ECLIPSE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-fuchsia-400 px-2 py-1 rounded text-left">Load Eclipse ({missileInventory.eclipse})</button>
                                )}
                                {missileInventory && missileInventory.he > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_HE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left">Load HE ({missileInventory.he})</button>
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
                   {/* Swarm Host Anchoring */}
                   {isSwarmHost && (
                       <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_ANCHOR'); }} className={`text-[10px] ${isAnchored ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>
                          {isAnchored ? "Unanchor" : "Anchor Down"}
                       </button>
                   )}
                   
                   {/* Restored Menu for Guardian */}
                   {isGuardian && (
                       <>
                           <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Status</div>
                           <div className="text-[10px] text-emerald-400 px-2 py-1 bg-slate-900/50 rounded mb-1">Repair {(repairTargetIds?.length || 0)}/{ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS}</div>
                           <div className={`text-[10px] px-2 py-1 bg-slate-900/50 rounded ${(cooldowns?.trophySystem || 0) > 0 ? 'text-amber-300' : 'text-sky-300'}`}>
                               {(cooldowns?.trophySystem || 0) > 0 ? `Trophy ${Math.ceil((cooldowns?.trophySystem || 0) / 1000)}s` : 'Trophy Ready'}
                           </div>
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

export default React.memo(Unit);
