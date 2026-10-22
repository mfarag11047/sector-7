
import React, { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect, useSyncExternalStore } from 'react';
import { CITY_CONFIG, BUILDING_COLORS, TEAM_COLORS, BUILDING_VALUES, BUILDING_HEALTH, TEAM_BASES, UNIT_STATS, ABILITY_CONFIG, STRUCTURE_COST, BUILD_RADIUS, STRUCTURE_INFO, COMPUTE_GATES, DOCTRINE_CONFIG } from '../constants';
import { BuildingData, UnitData, BuildingBlock, GameStats, DoctrineType, RoadType, RoadTileData, StructureData, UnitClass, DecoyData, UnitType, StructureType, CloudData, Projectile, Explosion, DoctrineState, MinimapMissile, MinimapData } from '../types';
import Building from './Building';
import Landmarks from './Landmarks';
import CorpoPlaza from './CorpoPlaza';
import Structure from './Structure';
import Base from './Base';
import BlackWall from './BlackWall';
import Unit from './Unit';
import BlockStatus from './BlockStatus';
import { InstancedRoads } from './RoadSystem';
import BuildingHitProxies from './BuildingHitProxies';
import * as THREE from 'three';
import { Edges, Html, Line, Float, Instance, Instances } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Zap, Ban, Building2 } from 'lucide-react';
import { freezeContainer } from '../perf';
import { ENERGY_GRID_COLOR, outerEnergyGridPolylines } from '../energyGrid';
import { MOVE_TICK_MS, Mover, MovementEnv, advanceMover, arriveAtNextTile } from '../sim/movement';
import { positionKey, publishMotion, simClock, stampPosition } from './glide';
import { ArmyControls, ArmyInfo, MAX_ARMIES, SelectionSummary } from './ArmyPanel';
import { cameraFocus } from './DroneCamera';
import { AbilityCommand, abilityEffects, applyUnitEffects, isBatteryLinkable, isTetherableDrone } from '../sim/abilities';
import { Warhead } from '../sim/commands';
import { FlightEvent, FlightTickResult, LiveFlight, cloneProjectile, drawnShotPosition, ballisticProgress, flightUnitY, isHeavyOrdnance, sampleBallistic, stepProjectiles } from '../sim/projectiles';
import { onRadar, radarRangeOf, radarSources, radarUnits, searchRadarSources } from '../sim/radar';
import { Blackout, chargeSources, isInsideEnergyGrid, powerTick } from '../sim/energy';
import { captureTick } from '../sim/capture';
import { Delivery, SLOW_TICK_MS, ballistaLoadStep, courierStep, fabricationStep, leashStep, repairTick, slowTick, surveillanceStep } from '../sim/support';
import { ARTILLERY, ArtilleryShell, artilleryRange, fireArtillery, landShells, shellGroundPos } from '../sim/artillery';
import { afterRailShot, fireRailguns, RailShot } from '../sim/railgun';
import { fireHornetRockets, landSalvo, MiniRocket } from '../sim/hornet';
import { BASE_SITE, BaseSite, baseSites, clearedBlocks, commandPosts, rubbleCleared } from '../sim/bases';
import { BLACKWALL, blackwallImpact, blackwallTick } from '../sim/blackwall';
import { FORCE_FIELD, ForceField, absorbingField, activeFields, addShieldHit, generatorsOf, impactAbsorbed, shieldTick, shockDamage, shockedBy, shotBlocked, shotBlockedBy } from '../sim/forcefield';
import { BlackwallBomb, BlackwallBurst } from './BlackwallFx';
import { ForceFieldDome, ShieldImpact } from './ForceFieldFx';
import { ShotFx, ShotFxData, ShotKind, shotFxLifeMs } from './ShotFx';
import { EmpRocket, EMP_ROCKET, empRocketImpact, empRocketTick, isEmpTarget, mergeUnitUpdates, topAttackHeight } from '../sim/empRocket';
import { AirThreat, applyCiwsState, CIWS, CiwsLink, ciwsTick, ORDNANCE_INTEGRITY } from '../sim/ciws';
import { Blast, CombatStructure, applyDamage, applyStructureCombat, blastDamage, bombardBuildings, bombardUnitDamage, crawlerDetonations, heCloudDamage, resolveAttacks } from '../sim/combat';
import { bombardTick } from '../sim/bombard';
import { generateCity } from '../sim/mapgen';
import { MatchConfig, STARTING_CORES, aiTeamsOf, doctrineOf, incomeMultipliers, sandboxStructures, startingRoster } from '../sim/match';
import { AI_PROFILES, aiThink, freshAiMemory, nextThinkDelay, thinkOffsets } from '../sim/ai';
import { OrderCommand, applyOrderToStructures, applyOrderToUnits, isOperational, orderEffects, popUsed, coreNodesHeld, serverNodesHeld, teamPopCap, teamTier } from '../sim/orders';
import { advanceProduction, applyProduction, createUnit } from '../sim/production';
import { UNIT_RULES, isAirType } from '../sim/units';
import { airPath, fastestPath, sentinelHazardOf } from '../sim/pathfinding';
import { fireFlechettes, regenerateShield, shieldedHit } from '../sim/kestrel';
import { markScreened, pruneSmoke, SMOKE, SmokeScreen } from '../sim/titan';
import { armMules, countdownOf, dueCharges, VOLT, VoltCharge, voltBlasts } from '../sim/voltCore';
import { canisterSpots, HE, WARHEAD_LIST, WP, wpGasDamage } from '../sim/warheads';
import { addUpgrades, advanceResearch, applyResearch, applyUpgradeBonuses, artilleryTierOf, hasUpgrade, upgradeDef, upgradeTitle, type UpgradeId } from '../sim/upgrades';
import { teamPads } from '../sim/baseLayout';
import BuildPads, { FreePad } from './BuildPads';
import { advanceRefineryUpgrades, baseProximity, REFINERY, refineriesOf, refineryLimit, refineryMultiplier } from '../sim/refinery';
import { advanceDismantling } from '../sim/dismantle';
import { abilitiesFor, abilityDef, addBuff, empVictims, hasBuff, pruneBuffs, visionOf } from '../sim/unitAbilities';
import { applyFieldCloak, CLOAK_FIELD, fieldCloakedIds, generatorsReplacedBy, isCloakFieldUp, isHidden } from '../sim/cloak';
import { Victory, checkVictory } from '../sim/victory';
import type { MatchSummary } from './MatchScreens';
import { Economy, createEconomy, incomeBreakdown, refund, canAfford, spend, setCores, setCompute, researchCost, addWarheads, takeWarhead, payIncome, teamStats, productionStep, advanceWarheadProduction, unitCost, structureCost, warheadCost, warheadBuildTime, doctrinePowerCost, ECONOMY_TICK_MS } from '../sim/economy';
import { jammingUpdates, MAX_TETHERS } from '../sim/jamming';
import { dampenedUnits } from '../sim/ghost';
import { heliosBeams, microwaveDamage } from '../sim/helios';
import { freshPacing, pacingTick, PacingRecord, recordArea, recordStrategies, recordVictory, recordWeaponHits } from '../sim/pacing';


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
        
    </group>
  );
};

// Detailed Missile Model
const DetailedMissileModel = ({ color }: { color: string }) => {

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

             {/* Navigation/Strobe Light - Blinking */}
             <mesh position={[0, 2.0, 0.32]}>
                 <sphereGeometry args={[0.08]} />
                 <meshBasicMaterial color="#ff0000" />
             </mesh>
        </group>
    );
};

// CloudMesh Component
const CloudMesh: React.FC<{ cloud: CloudData; tileSize: number; offset: number; playerTeam: 'blue' | 'red' }> = (props) =>
    props.cloud.type === 'emp' ? <EmpFieldMesh cloud={props.cloud} tileSize={props.tileSize} offset={props.offset} />
    : props.cloud.type === 'wp' ? <WpGasMesh cloud={props.cloud} tileSize={props.tileSize} offset={props.offset} />
    : <SmokeCloudMesh {...props} />;
const SmokeCloudMesh: React.FC<{ cloud: CloudData; tileSize: number; offset: number; playerTeam: 'blue' | 'red' }> = ({ cloud, tileSize, offset, playerTeam }) => {
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

    if (projectile.payload === 'titan_drop' || projectile.payload === 'cloak_drop' || projectile.payload === 'field_drop') {
        const cloak = projectile.payload === 'cloak_drop';
        const field = projectile.payload === 'field_drop';
        return (
            <group ref={meshRef}>
                <mesh rotation={[Math.PI, 0, 0]}>
                    <coneGeometry args={[1, 3, 8]} />
                    <meshStandardMaterial color="#334155" metalness={0.8} />
                </mesh>
                <mesh position={[0, 1.5, 0]}>
                    <coneGeometry args={[0.5, 2, 8, 1, true]} />
                    <meshBasicMaterial color={cloak ? "#c084fc" : field ? "#38bdf8" : "#f97316"} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
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
        const payloadColor = projectile.payload === 'emp' ? EMP_BLUE : projectile.payload === 'wp' ? WP_WHITE : '#ef4444';
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
        </group>
    );
};

// Lancer EMP Tandem Rockets (sim/empRocket.ts): a small rocket with a blue exhaust trail on a
// top-attack arc. The sim moves it a step each tick over the ground; drawing eases after it and,
// once a locked rocket is diving in, homes on where its target is drawn so it strikes the unit.
const EMP_TRAIL = 10;
const EmpRocketMesh: React.FC<{ id: string; rocketsRef: React.MutableRefObject<EmpRocket[]>; unitsRef: React.MutableRefObject<UnitData[]>; tileSize: number; offset: number }> = ({ id, rocketsRef, unitsRef, tileSize, offset }) => {
    const groupRef = useRef<THREE.Group>(null);
    const trailRef = useRef<THREE.InstancedMesh>(null);
    const placed = useRef(false);
    const history = useRef<THREE.Vector3[]>([]);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    useFrame((_, delta) => {
        const group = groupRef.current;
        const r = rocketsRef.current.find(x => x.id === id);
        if (!group || !r) return;
        const target = r.targetUnitId ? unitsRef.current.find(u => u.id === r.targetUnitId && u.health > 0) : undefined;
        const total = Math.max(0.01, Math.hypot(r.aim.x - r.from.x, r.aim.z - r.from.z));
        const left = Math.hypot(r.aim.x - r.at.x, r.aim.z - r.at.z);
        const progress = Math.min(1, Math.max(0, 1 - left / Math.max(total, left)));
        // Javelin-style top attack: up high, then straight down on the target. Short shots
        // still loft, so it always comes in from above.
        const targetY = target ? flightUnitY(target) : 1.5;
        const apex = Math.max(targetY + 25, Math.min(70, 18 + total * 4));
        let goal = new THREE.Vector3(r.at.x * tileSize - offset, topAttackHeight(progress, apex, 2.5, targetY), r.at.z * tileSize - offset);
        if (target && left < 0.6) {
            const w = unitWorld(target, tileSize, offset, targetY);
            goal = new THREE.Vector3(w.x, w.y, w.z);
        }
        if (!placed.current) { group.position.copy(goal); placed.current = true; }
        const before = group.position.clone();
        group.position.lerp(goal, 1 - Math.exp(-delta * 14));
        if (before.distanceToSquared(group.position) > 1e-4) group.lookAt(group.position.clone().add(group.position.clone().sub(before)));
        // Exhaust trail: the last few positions, shrinking and fading back along the path.
        const h = history.current;
        h.unshift(group.position.clone());
        if (h.length > EMP_TRAIL) h.pop();
        const trail = trailRef.current;
        if (trail) {
            for (let i = 0; i < EMP_TRAIL; i++) {
                const p = h[Math.min(i, h.length - 1)];
                dummy.position.copy(p);
                dummy.scale.setScalar(Math.max(0.05, 1 - i / EMP_TRAIL) * 0.55);
                dummy.updateMatrix();
                trail.setMatrixAt(i, dummy.matrix);
            }
            trail.instanceMatrix.needsUpdate = true;
        }
    });
    return (
        <>
            <group ref={groupRef}>
                <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                    <cylinderGeometry args={[0.18, 0.18, 1.4, 8]} />
                    <meshBasicMaterial color="#e2e8f0" />
                </mesh>
                <mesh position={[0, 0, 0.85]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                    <coneGeometry args={[0.18, 0.4, 8]} />
                    <meshBasicMaterial color={EMP_BLUE} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0, -0.8]} raycast={() => null}>
                    <sphereGeometry args={[0.35, 8, 6]} />
                    <meshBasicMaterial color="#bae6fd" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </mesh>
            </group>
            <instancedMesh ref={trailRef} args={[undefined, undefined, EMP_TRAIL]} raycast={() => null} frustumCulled={false}>
                <sphereGeometry args={[1, 6, 4]} />
                <meshBasicMaterial color={EMP_BLUE} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </instancedMesh>
        </>
    );
};

// Tank rail gun shots (sim/railgun.ts): an instant hypervelocity slug, drawn as a white-hot
// core inside a cyan glow from muzzle to target with a flash where it strikes, fading fast.
// The Hornet's Tier 3 anti-vehicle rocket (sim/hornet.ts) uses the same streak in fire orange,
// from the gunship's altitude.
type RailBeamData = RailShot & { id: string; createdAt: number; kind?: 'rail' | 'rocket'; fromY?: number };
const BEAM_COLORS = {
    rail: { glow: '#22d3ee', core: '#f0fdff', flash: '#a5f3fc' },
    rocket: { glow: '#f97316', core: '#fef3c7', flash: '#fdba74' },
    // A Piercing Rail Round (sim/titan.ts): magenta, thicker, down the whole lane.
    pierce: { glow: '#e879f9', core: '#fdf4ff', flash: '#f0abfc' },
};
const RAIL_BEAM_MS = 450;
const RailBeam: React.FC<{ beam: RailBeamData; tileSize: number; offset: number }> = ({ beam, tileSize, offset }) => {
    const glowRef = useRef<any>(null);
    const coreRef = useRef<any>(null);
    const flashRef = useRef<THREE.Mesh>(null);
    const points = useMemo(() => [
        [(beam.from.x * tileSize) - offset, beam.fromY ?? 3.4, (beam.from.z * tileSize) - offset],
        [(beam.to.x * tileSize) - offset, beam.structure ? 4 : 2, (beam.to.z * tileSize) - offset],
    ] as [number, number, number][], [beam, tileSize, offset]);
    useFrame(() => {
        const t = Math.min(1, (Date.now() - beam.createdAt) / RAIL_BEAM_MS);
        const fade = (1 - t) * (1 - t);
        if (glowRef.current?.material) glowRef.current.material.opacity = 0.7 * fade;
        if (coreRef.current?.material) coreRef.current.material.opacity = fade;
        const flash = flashRef.current;
        if (flash) {
            flash.scale.setScalar(0.6 + t * 2.4);
            (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
        }
    });
    const colors = BEAM_COLORS[beam.pierced ? 'pierce' : beam.kind ?? 'rail'];
    return (
        <group>
            <Line ref={glowRef} points={points} color={colors.glow} lineWidth={beam.pierced ? 12 : 7} transparent opacity={0.7} toneMapped={false} />
            <Line ref={coreRef} points={points} color={colors.core} lineWidth={beam.pierced ? 3.5 : 2} transparent opacity={1} toneMapped={false} />
            <mesh ref={flashRef} position={points[1]} raycast={() => null}>
                <sphereGeometry args={[1, 12, 10]} />
                <meshBasicMaterial color={colors.flash} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
};

// A Battery Mule's Volt Core gone critical (sim/voltCore.ts): its core sparks where it fell, a red
// ring marks the blast radius, and a flashing red warning sign counts down the seconds to the blast.
const VoltWarning: React.FC<{ charge: VoltCharge; tileSize: number; offset: number }> = ({ charge, tileSize, offset }) => {
    const core = useRef<THREE.Mesh>(null);
    const ring = useRef<THREE.Mesh>(null);
    const [count, setCount] = useState(() => countdownOf(charge, Date.now()));
    useFrame(() => {
        const now = Date.now();
        // Flashes faster as the blast nears.
        const left = Math.max(0, charge.blowsAt - now) / VOLT.fuseMs;
        const on = Math.sin(now / (60 + 140 * left)) > 0;
        if (core.current) {
            core.current.scale.setScalar(on ? 1.25 : 0.85);
            ((core.current.material as THREE.MeshBasicMaterial)).color.set(on ? '#ff2d2d' : '#7dd3fc');
        }
        if (ring.current) ((ring.current.material as THREE.MeshBasicMaterial)).opacity = on ? 0.55 : 0.2;
        const c = countdownOf(charge, now);
        if (c !== count) setCount(c);
    });
    const r = VOLT.radius * tileSize;
    return (
        <group position={[charge.at.x * tileSize - offset, 0, charge.at.z * tileSize - offset]}>
            <mesh ref={core} position={[0, 2.5, 0]} raycast={() => null}>
                <icosahedronGeometry args={[2.2, 0]} />
                <meshBasicMaterial color="#ff2d2d" toneMapped={false} />
            </mesh>
            <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.8, 0]} raycast={() => null}>
                <ringGeometry args={[r - 1.2, r, 64]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
            </mesh>
            <Html position={[0, 24, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
                <div className="flex flex-col items-center select-none animate-pulse">
                    <svg width="38" height="34" viewBox="0 0 38 34">
                        <polygon points="19,2 36,32 2,32" fill="#dc2626" stroke="#fecaca" strokeWidth="2" />
                        <text x="19" y="28" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#fff">!</text>
                    </svg>
                    <div className="font-mono font-bold text-red-400 text-lg leading-none" style={{ textShadow: '0 0 6px #000' }}>{count}</div>
                </div>
            </Html>
        </group>
    );
};

// A tank's Smoke Screen (sim/titan.ts): canisters arc out from the tank in a ring, burst, and a
// grey cloud billows over the circle, thinning out as it ends.
const SMOKE_PUFFS = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
    const r = i < 8 ? 0.75 : 0.35;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, size: 0.55 + ((i * 37) % 10) / 25, rise: (i % 3) * 0.4 };
});
const SmokeCloud: React.FC<{ screen: SmokeScreen; tileSize: number; offset: number }> = ({ screen, tileSize, offset }) => {
    const canisters = useRef<THREE.Group>(null);
    const cloud = useRef<THREE.Group>(null);
    const radius = SMOKE.radius * tileSize;
    useFrame(() => {
        const now = Date.now();
        const launch = (now - screen.laidAt) / SMOKE.launchMs;
        if (canisters.current) {
            canisters.current.visible = launch < 1;
            canisters.current.children.forEach((c, i) => {
                const a = (i / 8) * Math.PI * 2;
                const t = Math.min(1, Math.max(0, launch));
                c.position.set(Math.cos(a) * radius * t, 3 + Math.sin(Math.PI * t) * 9, Math.sin(a) * radius * t);
            });
        }
        if (cloud.current) {
            const life = screen.until - screen.laidAt - SMOKE.launchMs;
            const t = (now - screen.laidAt - SMOKE.launchMs) / life;
            const grow = Math.min(1, Math.max(0, t * 6));
            const fade = t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
            cloud.current.visible = t > 0 && t < 1;
            cloud.current.scale.setScalar(0.4 + 0.6 * grow);
            cloud.current.rotation.y = now * 0.00015;
            cloud.current.children.forEach((m, i) => {
                ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.62 * fade;
                m.position.y = 2.5 + SMOKE_PUFFS[i].rise + t * 2;
            });
        }
    });
    return (
        <group position={[screen.at.x * tileSize - offset, 0, screen.at.z * tileSize - offset]}>
            <group ref={canisters}>
                {Array.from({ length: 8 }, (_, i) => (
                    <mesh key={i} raycast={() => null}>
                        <cylinderGeometry args={[0.35, 0.35, 1.2, 6]} />
                        <meshStandardMaterial color="#64748b" emissive="#94a3b8" emissiveIntensity={0.3} />
                    </mesh>
                ))}
            </group>
            <group ref={cloud} visible={false}>
                {SMOKE_PUFFS.map((p, i) => (
                    <mesh key={i} position={[p.x * radius, 2.5, p.z * radius]} raycast={() => null}>
                        <dodecahedronGeometry args={[tileSize * p.size, 1]} />
                        <meshStandardMaterial color="#9ca3af" transparent opacity={0.62} depthWrite={false} roughness={1} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

// Hellfire Salvo mini-rockets (sim/hornet.ts): small streaks dropping from the gunship's pods to
// where each comes down.
const MiniRocketMesh: React.FC<{ rocket: MiniRocket; fromY: number; tileSize: number; offset: number }> = ({ rocket, fromY, tileSize, offset }) => {
    const ref = useRef<THREE.Group>(null);
    const from = useMemo(() => new THREE.Vector3(rocket.from.x * tileSize - offset, fromY - 2, rocket.from.z * tileSize - offset), [rocket, fromY, tileSize, offset]);
    const to = useMemo(() => new THREE.Vector3(rocket.at.x * tileSize - offset, 0.8, rocket.at.z * tileSize - offset), [rocket, tileSize, offset]);
    useFrame(() => {
        const g = ref.current;
        if (!g) return;
        const t = (Date.now() - rocket.firedAt) / (rocket.landsAt - rocket.firedAt);
        g.visible = t >= 0 && t <= 1;
        if (!g.visible) return;
        g.position.lerpVectors(from, to, t);
        g.lookAt(to);
    });
    return (
        <group ref={ref} visible={false}>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                <cylinderGeometry args={[0.12, 0.12, 1.1, 6]} />
                <meshBasicMaterial color="#e2e8f0" />
            </mesh>
            <mesh position={[0, 0, -1.6]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                <coneGeometry args={[0.28, 2.2, 6, 1, true]} />
                <meshBasicMaterial color="#fb923c" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
};

// How long after its last shot (or last aiming at a target) an attacker still shows as engaging
// on the minimap. Longer than the slowest reload (the rail gun's 5 s), so arrows hold steady.
const ENGAGEMENT_MS = 6000;

// Weapons fire as seen in the 3D view (components/ShotFx.tsx): a muzzle flash for every shot,
// and for heavier weapons the projectile flying to the target. Who shot whom is kept for the
// minimap's engagement arrows.
type TracerData = ShotFxData & { attackerId: string; targetId: string };

// Thunderhead shells (sim/artillery.ts): a glowing round on a high arc from the gun to where it
// lands. Enemy shells show only on the way down, so they warn of a barrage without giving the
// battery away.
const SHELL_PEAK = 90;
const ShellMesh: React.FC<{ shell: ArtilleryShell; tileSize: number; offset: number; enemy: boolean }> = ({ shell, tileSize, offset, enemy }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = Math.min(1, Math.max(0, (Date.now() - shell.firedAt) / (shell.landsAt - shell.firedAt)));
        mesh.visible = !enemy || t > 0.5;
        mesh.position.set(
            ((shell.from.x + (shell.at.x - shell.from.x) * t) * tileSize) - offset,
            2.5 + 4 * SHELL_PEAK * t * (1 - t),
            ((shell.from.z + (shell.at.z - shell.from.z) * t) * tileSize) - offset,
        );
    });
    return (
        <mesh ref={meshRef} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.9, 8, 6]} />
            <meshBasicMaterial color="#fdba74" toneMapped={false} />
        </mesh>
    );
};

// --- Aegis radar contacts ---

// A radar blip: a red dot with a soft halo. It says something is there, not what it is.
let blipTexture: THREE.CanvasTexture | null = null;
const radarBlipTexture = () => {
    if (blipTexture) return blipTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const halo = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    halo.addColorStop(0, 'rgba(255,90,70,0.9)');
    halo.addColorStop(0.35, 'rgba(255,60,50,0.45)');
    halo.addColorStop(1, 'rgba(255,40,40,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff1ee';
    g.beginPath(); g.arc(32, 32, 7, 0, Math.PI * 2); g.fill();
    blipTexture = new THREE.CanvasTexture(c);
    blipTexture.colorSpace = THREE.SRGBColorSpace;
    return blipTexture;
};

// Large ordnance radar can track: missiles, drop pods, heavy shells. Not small arms or swarm darts.
const isRadarOrdnance = (p: Projectile) => p.trajectory === 'ballistic' || p.payload === 'titan_drop' || p.payload === 'cloak_drop' || p.payload === 'field_drop' || isHeavyOrdnance(p);

// Where enemy things on radar are right now, in world units: hidden aircraft, field-cloaked units
// and ordnance in flight under an Aegis, ground units and large aircraft under an Infiltrator. Shared by the map blips and the minimap.
type RadarContact = { id: string; x: number; y: number; z: number; ordnance: boolean };
function radarContactsFor(
    team: 'blue' | 'red', units: readonly UnitData[], visible: ReadonlySet<string>,
    flights: Map<string, LiveFlight>, shells: readonly ArtilleryShell[], tileSize: number, offset: number, now: number,
): RadarContact[] {
    const sources = radarSources(units, team);
    const search = searchRadarSources(units, team);
    if (sources.length === 0 && search.length === 0) return [];
    const toGrid = (w: number) => (w + offset) / tileSize;
    const contacts: RadarContact[] = [];
    for (const u of radarUnits(units, team, sources, a => visible.has(a.id), search)) {
        // Partway along its current step, so the dot glides rather than hops tile to tile.
        let gx = u.gridPos.x, gz = u.gridPos.z;
        if (u.moveTarget) {
            const [tx, tz] = u.moveTarget.split(',').map(Number);
            const t = u.moveProgress ?? 0;
            gx += (tx - gx) * t; gz += (tz - gz) * t;
        }
        contacts.push({ id: u.id, x: gx * tileSize - offset, y: flightUnitY(u), z: gz * tileSize - offset, ordnance: false });
    }
    for (const live of flights.values()) {
        const p = live.shot;
        if (live.impacted || p.team === team || !isRadarOrdnance(p)) continue;
        const pos = p.trajectory === 'ballistic' && p.startPos && p.targetPos ? sampleBallistic(p, now) : p.position;
        if (onRadar({ x: toGrid(pos.x), z: toGrid(pos.z) }, sources)) contacts.push({ id: p.id, x: pos.x, y: pos.y, z: pos.z, ordnance: true });
    }
    for (const s of shells) {
        if (s.team === team) continue;
        const t = Math.min(1, Math.max(0, (now - s.firedAt) / (s.landsAt - s.firedAt)));
        const gx = s.from.x + (s.at.x - s.from.x) * t;
        const gz = s.from.z + (s.at.z - s.from.z) * t;
        if (onRadar({ x: gx, z: gz }, sources)) contacts.push({ id: s.id, x: gx * tileSize - offset, y: 2.5 + 4 * SHELL_PEAK * t * (1 - t), z: gz * tileSize - offset, ordnance: true });
    }
    return contacts;
}

// --- Aegis CIWS tracer stream ---

// Where a unit is right now in world units, partway along its current step.
function unitWorld(u: UnitData, tileSize: number, offset: number, y: number) {
    let gx = u.gridPos.x, gz = u.gridPos.z;
    if (u.moveTarget) {
        const [tx, tz] = u.moveTarget.split(',').map(Number);
        const t = u.moveProgress ?? 0;
        gx += (tx - gx) * t; gz += (tz - gz) * t;
    }
    return { x: gx * tileSize - offset, y, z: gz * tileSize - offset };
}

// Where something the cannon can shoot at is: an aircraft, a missile or pod, or a shell.
function airThreatWorld(id: string, units: readonly UnitData[], flights: Map<string, LiveFlight>, shells: readonly ArtilleryShell[], tileSize: number, offset: number, now: number) {
    const live = flights.get(id);
    if (live) {
        const p = live.shot;
        const pos = p.trajectory === 'ballistic' && p.startPos && p.targetPos ? sampleBallistic(p, now) : p.position;
        return { x: pos.x, y: pos.y, z: pos.z };
    }
    const shell = shells.find(s => s.id === id);
    if (shell) {
        const g = shellGroundPos(shell, now);
        const t = Math.min(1, Math.max(0, (now - shell.firedAt) / (shell.landsAt - shell.firedAt)));
        return { x: g.x * tileSize - offset, y: 2.5 + 4 * SHELL_PEAK * t * (1 - t), z: g.z * tileSize - offset };
    }
    const u = units.find(x => x.id === id);
    return u ? unitWorld(u, tileSize, offset, flightUnitY(u)) : null;
}

// The stream of a rotary cannon: dozens of glowing rounds a second racing from the Aegis' gun
// to its target with a little spread, drawn as one instanced mesh so a sky full of fire costs a
// single draw call.
const CIWS_POOL = 900;
const CIWS_ROUND_SPEED = 320; // World units a second: slow enough that the stream reads as a hose of fire
const CiwsTracers: React.FC<{
    linksRef: React.MutableRefObject<CiwsLink[]>;
    unitsRef: React.MutableRefObject<UnitData[]>;
    flightRef: React.MutableRefObject<Map<string, LiveFlight>>;
    shellsRef: React.MutableRefObject<ArtilleryShell[]>;
    structuresRef: React.MutableRefObject<StructureData[]>;
    // Fire from an enemy Aegis you can't see isn't drawn, so it doesn't give the gun away.
    canSee: (aegis: UnitData) => boolean;
    tileSize: number;
    offset: number;
}> = ({ linksRef, unitsRef, flightRef, shellsRef, structuresRef, canSee, tileSize, offset }) => {
    // Where a gun's muzzle is: on an Aegis' turret, or atop a CIWS turret (always in plain view).
    const muzzleOf = (link: CiwsLink) => {
        if (link.fromStructure) {
            const s = structuresRef.current.find(x => x.id === link.gunId);
            return s ? { x: s.gridPos.x * tileSize - offset, y: 11, z: s.gridPos.z * tileSize - offset } : null;
        }
        const gun = unitsRef.current.find(u => u.id === link.gunId);
        return gun && canSee(gun) ? unitWorld(gun, tileSize, offset, 6.5) : null;
    };
    const mesh = useRef<THREE.InstancedMesh>(null);
    const rounds = useRef<{ from: THREE.Vector3; to: THREE.Vector3; born: number; life: number }[]>([]);
    const owed = useRef(new Map<string, number>());
    const flashRef = useRef<THREE.Group>(null);
    const scratch = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), dir: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1) }), []);
    useFrame((state, delta) => {
        const im = mesh.current;
        if (!im) return;
        const now = Date.now();
        const t = state.clock.elapsedTime;
        // New rounds for every gun firing this tick.
        for (const link of linksRef.current) {
            const muzzle = muzzleOf(link);
            const target = airThreatWorld(link.targetId, unitsRef.current, flightRef.current, shellsRef.current, tileSize, offset, now);
            if (!muzzle || !target) continue;
            const n = (owed.current.get(link.gunId) || 0) + CIWS.roundsPerSecond * Math.min(delta, 0.5);
            const whole = Math.floor(n);
            owed.current.set(link.gunId, n - whole);
            for (let i = 0; i < whole && rounds.current.length < CIWS_POOL; i++) {
                const from = new THREE.Vector3(muzzle.x + (Math.random() - 0.5) * 1.2, muzzle.y, muzzle.z + (Math.random() - 0.5) * 1.2);
                const spread = 5;
                const to = new THREE.Vector3(target.x + (Math.random() - 0.5) * spread, target.y + (Math.random() - 0.5) * spread, target.z + (Math.random() - 0.5) * spread);
                const life = Math.max(0.05, from.distanceTo(to) / CIWS_ROUND_SPEED);
                // Fired at some moment during the frame just gone, so at any frame rate the rounds
                // are spread along the whole path rather than bunched at the muzzle.
                rounds.current.push({ from, to, born: t - Math.random() * Math.min(Math.min(delta, 0.25), life), life });
            }
        }
        // Fly them; drop the ones that arrived.
        rounds.current = rounds.current.filter(r => t - r.born < r.life);
        const { m, q, p, s, dir, fwd } = scratch;
        rounds.current.forEach((r, i) => {
            const k = (t - r.born) / r.life;
            p.lerpVectors(r.from, r.to, k);
            dir.subVectors(r.to, r.from).normalize();
            q.setFromUnitVectors(fwd, dir);
            s.set(1, 1, 1);
            m.compose(p, q, s);
            im.setMatrixAt(i, m);
        });
        im.count = rounds.current.length;
        im.instanceMatrix.needsUpdate = true;
        // Muzzle flashes: a flickering glow on each gun that is firing.
        const flashes = flashRef.current;
        if (flashes) {
            let n = 0;
            for (const link of linksRef.current) {
                const w = muzzleOf(link);
                if (!w || n >= flashes.children.length) continue;
                const f = flashes.children[n++];
                f.visible = true;
                f.position.set(w.x, w.y, w.z);
                f.scale.setScalar(0.7 + Math.random() * 0.8);
            }
            for (; n < flashes.children.length; n++) flashes.children[n].visible = false;
        }
    });
    return (
        <group>
            <instancedMesh ref={mesh} args={[undefined, undefined, CIWS_POOL]} frustumCulled={false} raycast={() => null}>
                <boxGeometry args={[0.7, 0.7, 9]} />
                <meshBasicMaterial color="#ffd27a" toneMapped={false} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
            </instancedMesh>
            <group ref={flashRef}>
                {Array.from({ length: 12 }, (_, i) => (
                    <mesh key={i} visible={false} raycast={() => null}>
                        <sphereGeometry args={[2.2, 10, 8]} />
                        <meshBasicMaterial color="#fff1c2" toneMapped={false} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

// Radar blips on the map. A fixed pool of dots placed every frame, so contacts that come and go
// never cause a re-render. Pulsing, the same size on screen at any zoom, drawn over buildings.
const BLIP_POOL = 48;
// Memoised: everything it shows moves through refs, so the map re-rendering needs no re-render here.
const RadarBlips = React.memo<{
    team: 'blue' | 'red';
    unitsRef: React.MutableRefObject<UnitData[]>;
    visibleRef: React.MutableRefObject<Set<string>>;
    flightRef: React.MutableRefObject<Map<string, LiveFlight>>;
    shellsRef: React.MutableRefObject<ArtilleryShell[]>;
    tileSize: number;
    offset: number;
}>(({ team, unitsRef, visibleRef, flightRef, shellsRef, tileSize, offset }) => {
    const group = useRef<THREE.Group>(null);
    useFrame(state => {
        const g = group.current;
        if (!g) return;
        const contacts = radarContactsFor(team, unitsRef.current, visibleRef.current, flightRef.current, shellsRef.current, tileSize, offset, Date.now());
        const pulse = 1 + 0.25 * Math.sin(state.clock.elapsedTime * 6);
        g.children.forEach((child, i) => {
            const c = contacts[i];
            child.visible = !!c;
            if (!c) return;
            child.position.set(c.x, c.y, c.z);
            const size = (c.ordnance ? 0.026 : 0.036) * pulse;
            child.scale.set(size, size, 1);
        });
    });
    const map = useMemo(radarBlipTexture, []);
    return (
        <group ref={group}>
            {Array.from({ length: BLIP_POOL }, (_, i) => (
                <sprite key={i} visible={false} renderOrder={25} raycast={() => null}>
                    <spriteMaterial map={map} sizeAttenuation={false} depthTest={false} depthWrite={false} transparent toneMapped={false} />
                </sprite>
            ))}
        </group>
    );
});

// Where a selected battery's fire mission is landing: a red reticle on the ground.
const FireMissionMarker: React.FC<{ at: { x: number; z: number }; tileSize: number; offset: number }> = ({ at, tileSize, offset }) => (
    <group position={[(at.x * tileSize) - offset, 0.4, (at.z * tileSize) - offset]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh raycast={() => null}>
            <ringGeometry args={[ARTILLERY.splash * tileSize - 1.2, ARTILLERY.splash * tileSize, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh raycast={() => null}>
            <ringGeometry args={[1.2, 2.2, 16]} />
            <meshBasicMaterial color="#ef4444" toneMapped={false} depthWrite={false} />
        </mesh>
    </group>
);

// --- EMP visuals: blue energy discharge rather than fire ---

// Jagged lightning from the centre outward, as flat point lists for drei's Line.
function lightningBolts(count: number, reach: number, seed: number): [number, number, number][][] {
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return Array.from({ length: count }, () => {
        const angle = rnd() * Math.PI * 2;
        const length = reach * (0.45 + rnd() * 0.55);
        const steps = 6;
        const pts: [number, number, number][] = [[0, 2, 0]];
        for (let i = 1; i <= steps; i++) {
            const d = (length * i) / steps;
            const jitter = (rnd() - 0.5) * reach * 0.18;
            pts.push([Math.cos(angle) * d - Math.sin(angle) * jitter, 1 + rnd() * 4, Math.sin(angle) * d + Math.cos(angle) * jitter]);
        }
        return pts;
    });
}

const EMP_CORE = '#e0f2fe';
const EMP_BLUE = '#38bdf8';
const EMP_INDIGO = '#818cf8';

// An EMP going off: a white-blue flash, two shockwave rings racing out to the blast radius and
// lightning crackling across it, flickering between three sets of bolts.
const EmpDischargeMesh: React.FC<{ explosion: Explosion }> = ({ explosion }) => {
    const R = explosion.radius;
    const flash = useRef<THREE.Mesh>(null);
    const ring1 = useRef<THREE.Mesh>(null);
    const ring2 = useRef<THREE.Mesh>(null);
    const bolts = useRef<THREE.Group>(null);
    const sets = useMemo(() => [0, 1, 2].map(i => lightningBolts(R > 40 ? 10 : 6, R, explosion.createdAt % 100000 + i * 7919 + 1)), [R, explosion.createdAt]);
    useFrame(() => {
        const t = Math.min(1, Math.max(0, (Date.now() - explosion.createdAt) / explosion.duration));
        const fade = 1 - t;
        if (flash.current) {
            flash.current.scale.setScalar(0.3 + t * 1.2);
            (flash.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 2.2);
        }
        const ease = 1 - Math.pow(1 - t, 3);
        if (ring1.current) {
            ring1.current.scale.setScalar(Math.max(0.01, ease));
            (ring1.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
        }
        if (ring2.current) {
            const t2 = Math.max(0, (t - 0.15) / 0.85);
            ring2.current.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - t2, 3)) * 0.8);
            (ring2.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
        }
        if (bolts.current) {
            const pick = Math.floor(Date.now() / 70) % 3;
            bolts.current.children.forEach((c, i) => { c.visible = i === pick && t < 0.85 && Math.random() > 0.15; });
        }
    });
    return (
        <group position={[explosion.position.x, 0.6, explosion.position.z]}>
            <mesh ref={flash} position={[0, 2, 0]} raycast={() => null}>
                <sphereGeometry args={[Math.max(3, R * 0.22), 20, 14]} />
                <meshBasicMaterial color={EMP_CORE} transparent opacity={0.9} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh ref={ring1} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <ringGeometry args={[R * 0.9, R, 64]} />
                <meshBasicMaterial color={EMP_BLUE} transparent opacity={0.9} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh ref={ring2} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <ringGeometry args={[R * 0.93, R, 64]} />
                <meshBasicMaterial color={EMP_INDIGO} transparent opacity={0.7} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <group ref={bolts}>
                {sets.map((set, i) => (
                    <group key={i} visible={false}>
                        {set.map((pts, j) => <Line key={j} points={pts} color={j % 2 ? EMP_CORE : EMP_BLUE} lineWidth={2} transparent opacity={0.95} toneMapped={false} />)}
                    </group>
                ))}
            </group>
        </group>
    );
};

// A grid blacked out by an EMP missile: a faint blue disc with a bright, flickering edge and
// sparks of static, fading out over the last few seconds.
const EmpFieldMesh: React.FC<{ cloud: CloudData; tileSize: number; offset: number }> = ({ cloud, tileSize, offset }) => {
    const R = cloud.radius * tileSize;
    const disc = useRef<THREE.Mesh>(null);
    const edge = useRef<THREE.Mesh>(null);
    const sparks = useRef<THREE.Group>(null);
    const sets = useMemo(() => [0, 1, 2, 3].map(i => lightningBolts(3, R * 0.6, cloud.createdAt % 100000 + i * 104729 + 3)), [R, cloud.createdAt]);
    useFrame(state => {
        const left = cloud.duration - (Date.now() - cloud.createdAt);
        const fade = Math.max(0, Math.min(1, left / 3000));
        const flicker = 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 23) * Math.sin(state.clock.elapsedTime * 7.3);
        if (disc.current) (disc.current.material as THREE.MeshBasicMaterial).opacity = 0.13 * fade;
        if (edge.current) (edge.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade * flicker;
        if (sparks.current) {
            const pick = Math.floor(state.clock.elapsedTime * 6) % 4;
            sparks.current.children.forEach((c, i) => { c.visible = i === pick && fade > 0.2 && Math.random() > 0.5; });
            sparks.current.rotation.y = state.clock.elapsedTime * 0.4;
        }
    });
    return (
        <group position={[(cloud.gridPos.x * tileSize) - offset, 0.5, (cloud.gridPos.z * tileSize) - offset]}>
            <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <circleGeometry args={[R, 64]} />
                <meshBasicMaterial color={EMP_BLUE} transparent opacity={0.13} toneMapped={false} depthWrite={false} />
            </mesh>
            <mesh ref={edge} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} raycast={() => null}>
                <ringGeometry args={[R - 1.2, R, 96]} />
                <meshBasicMaterial color={EMP_BLUE} transparent opacity={0.85} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <group ref={sparks}>
                {sets.map((set, i) => (
                    <group key={i} visible={false}>
                        {set.map((pts, j) => <Line key={j} points={pts} color={EMP_CORE} lineWidth={1.5} transparent opacity={0.8} toneMapped={false} />)}
                    </group>
                ))}
            </group>
        </group>
    );
};

// White Phosphorus: the canisters arc down from the airburst on white smoke trails, then each lays
// a burning white cloud with embers in it. The cloud fades out over its last few seconds.
const WP_WHITE = '#f8fafc';
const WP_EMBER = '#fb923c';
const WpGasMesh: React.FC<{ cloud: CloudData; tileSize: number; offset: number }> = ({ cloud, tileSize, offset }) => {
    const spots = useMemo(() => canisterSpots(cloud.id, WP.canisters, cloud.radius).map(s => new THREE.Vector3(s.x * tileSize, 0, s.z * tileSize)), [cloud.id, cloud.radius, tileSize]);
    const burst = useMemo(() => new THREE.Vector3(0, WP.burstHeight, 0), []);
    // Each canister's fall: out from the burst and down, bowing outward a little.
    const arc = (to: THREE.Vector3, t: number) => new THREE.Vector3(
        burst.x + (to.x - burst.x) * Math.sqrt(t),
        burst.y + (to.y - burst.y) * t * t + 2 * t * (1 - t),
        burst.z + (to.z - burst.z) * Math.sqrt(t),
    );
    const trails = useMemo(() => spots.map(to => Array.from({ length: 13 }, (_, i) => arc(to, i / 12))), [spots]);
    const canisters = useRef<THREE.Group>(null);
    const trailGroup = useRef<THREE.Group>(null);
    const puffs = useRef<THREE.Group>(null);
    const embers = useRef<THREE.Group>(null);
    const area = useRef<THREE.Mesh>(null);
    const puffSize = tileSize * 1.25;
    useFrame(state => {
        const age = Date.now() - cloud.createdAt;
        const fall = Math.min(1, age / WP.fallMs);
        const fade = Math.max(0, Math.min(1, (cloud.duration - age) / 3000));
        const time = state.clock.elapsedTime;
        canisters.current?.children.forEach((c, i) => {
            c.visible = fall < 1;
            if (fall < 1) c.position.copy(arc(spots[i], fall));
        });
        if (trailGroup.current) {
            const trailFade = Math.max(0, 1 - age / 4000);
            trailGroup.current.visible = trailFade > 0;
            trailGroup.current.children.forEach(l => {
                const m = (l as unknown as { material: THREE.Material & { opacity: number } }).material;
                if (m) m.opacity = 0.7 * trailFade;
            });
        }
        // The gas billows up where each canister lands, then drifts and breathes.
        const grow = Math.max(0, Math.min(1, (age - WP.fallMs * 0.8) / 1800));
        puffs.current?.children.forEach((p, i) => {
            const k = (i % 3) * 0.13;
            const s = Math.max(0.001, grow * (0.75 + k + 0.06 * Math.sin(time * 0.9 + i)));
            // Low, flattened billows that hug the ground.
            p.scale.set(s, s * 0.55, s);
            p.position.y = puffSize * (0.15 + 0.2 * (i % 3) / 2) + 0.2 * Math.sin(time * 0.6 + i * 1.7);
            ((p as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (i % 3 === 0 ? 0.3 : 0.2) * fade;
        });
        embers.current?.children.forEach((e, i) => {
            e.visible = grow > 0.2 && fade > 0.1 && Math.sin(time * (5 + i % 4) + i * 2.3) > 0.1;
            e.position.y = 0.4 + ((time * 0.8 + i * 0.37) % 1.6);
        });
        if (area.current) (area.current.material as THREE.MeshBasicMaterial).opacity = 0.12 * grow * fade;
    });
    return (
        <group position={[(cloud.gridPos.x * tileSize) - offset, 0.7, (cloud.gridPos.z * tileSize) - offset]}>
            <mesh ref={area} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <circleGeometry args={[cloud.radius * tileSize, 48]} />
                <meshBasicMaterial color={WP_EMBER} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            <group ref={trailGroup}>
                {trails.map((pts, i) => <Line key={i} points={pts} color={WP_WHITE} lineWidth={2.5} transparent opacity={0.7} depthWrite={false} />)}
            </group>
            <group ref={canisters}>
                {spots.map((_, i) => (
                    <mesh key={i} raycast={() => null}>
                        <sphereGeometry args={[0.28, 8, 8]} />
                        <meshBasicMaterial color="#fff7ed" toneMapped={false} />
                    </mesh>
                ))}
            </group>
            <group ref={puffs}>
                {spots.flatMap((at, i) => [[-0.5, 0.3], [0.6, -0.4], [0.1, 0.9]].map(([dx, dz], j) => (
                    <mesh key={`${i}-${j}`} position={[at.x + dx * tileSize, 0, at.z + dz * tileSize]} scale={0.001} raycast={() => null}>
                        <sphereGeometry args={[puffSize, 14, 10]} />
                        <meshBasicMaterial color={j === 1 ? '#e2e8f0' : WP_WHITE} transparent opacity={0} depthWrite={false} />
                    </mesh>
                )))}
            </group>
            <group ref={embers}>
                {spots.flatMap((at, i) => [0, 1].map(j => (
                    <mesh key={`${i}-${j}`} position={[at.x + (j - 0.5) * tileSize * 0.8, 0.5, at.z + (0.5 - j) * tileSize * 0.6]} visible={false} raycast={() => null}>
                        <sphereGeometry args={[0.16, 6, 6]} />
                        <meshBasicMaterial color={WP_EMBER} toneMapped={false} />
                    </mesh>
                )))}
            </group>
        </group>
    );
};

// The White Phosphorus missile bursting over its target: a white flash high in the air.
const AirburstMesh: React.FC<{ explosion: Explosion }> = ({ explosion }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (!meshRef.current) return;
        const progress = Math.min(1, (Date.now() - explosion.createdAt) / explosion.duration);
        meshRef.current.scale.setScalar(0.4 + progress * 1.8);
        (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - progress);
    });
    return (
        <mesh ref={meshRef} position={[explosion.position.x, explosion.position.y, explosion.position.z]} raycast={() => null}>
            <sphereGeometry args={[explosion.radius, 16, 16]} />
            <meshBasicMaterial color="#fffbeb" transparent opacity={0.95} toneMapped={false} depthWrite={false} />
        </mesh>
    );
};

// Explosion Component
const ExplosionMesh: React.FC<{ explosion: Explosion }> = ({ explosion }) => {
    if (explosion.style === 'emp') return <EmpDischargeMesh explosion={explosion} />;
    if (explosion.style === 'airburst') return <AirburstMesh explosion={explosion} />;
    if (explosion.style === 'shield') return <ShieldImpact position={explosion.position} radius={explosion.radius} createdAt={explosion.createdAt} duration={explosion.duration} />;
    if (explosion.style === 'blackwall') return <BlackwallBurst position={explosion.position} radius={explosion.radius} createdAt={explosion.createdAt} duration={explosion.duration} />;
    return <FireballMesh explosion={explosion} />;
};
const FireballMesh: React.FC<{ explosion: Explosion }> = ({ explosion }) => {
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
        </mesh>
    );
};

// --- Hovered tile ---

type Tile = { x: number; z: number };
function createHoverStore() {
    let value: Tile | null = null;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set: (pos: Tile | null) => {
            if (pos === value || (pos && value && pos.x === value.x && pos.z === value.z)) return;
            value = pos;
            listeners.forEach(l => l());
        },
        subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    };
}
type HoverStore = ReturnType<typeof createHoverStore>;

// Renders its child function with the hovered tile, re-rendering only itself when it changes.
const HoverTile: React.FC<{ store: HoverStore; children: (tile: Tile | null) => React.ReactNode }> = ({ store, children }) => {
    const tile = useSyncExternalStore(store.subscribe, store.get);
    return <>{children(tile)}</>;
};

// A building that outlines itself while hovered. Only the buildings entering or leaving the
// hover re-render.
// Whether two versions of a unit look the same on screen: every field equal, apart from those the
// unit model reads each frame itself (its motion, components/glide.ts) and battery decimals.
const MOTION_KEYS: ReadonlySet<string> = new Set(['moveProgress', 'moveTarget', 'moveSpeed', 'battery']);
function sameUnitForRender(a: UnitData, b: UnitData): boolean {
    if (a === b) return true;
    if (Math.round(a.battery) !== Math.round(b.battery)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) if (!MOTION_KEYS.has(k) && (a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
    return true;
}

// A moving unit's route on the ground: a dashed line and a marker where it ends. Memoised so a line
// whose route is unchanged keeps its geometry between ticks.
type MovePathData = { id: string; destination: { x: number; z: number }; pathPoints: THREE.Vector3[] };
const MovePath: React.FC<{ data: MovePathData; tileSize: number; offset: number }> = React.memo(({ data, tileSize, offset }) => (
    <group>
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
));

const HoverBuilding: React.FC<{ data: BuildingData; store: HoverStore }> = React.memo(({ data, store }) => {
    const hovered = useSyncExternalStore(store.subscribe, () => {
        const t = store.get();
        return !!t && t.x === data.gridX && t.z === data.gridZ;
    });
    return <Building data={data} hovered={hovered} />;
});

// Box-select dragging and the hover tile, from plain DOM pointer events.
//
// These used to be pointer handlers on the map's root group. react-three-fiber ray-tests every
// object under a handler on every mouse move, so a handler on the root tested the whole city:
// about 30,000 meshes per move. Here the ground point under the cursor comes from meeting the
// mouse ray with the ground plane (y = 0), which is a few multiplications.
//
// The selection rectangle is a plain screen-space box drawn over the canvas, moved directly
// by these handlers, so dragging never re-renders the map. Units are picked by where they
// appear on screen, so the box matches what you see however the camera is turned.
type ScreenPoint = { x: number; y: number };
type GroundEvent = { point: THREE.Vector3; button: number; screen: ScreenPoint; toScreen: (world: THREE.Vector3) => ScreenPoint };
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const DRAG_THRESHOLD_PX = 6;
const GroundPointer: React.FC<{ handlersRef: React.MutableRefObject<{ down: (e: GroundEvent) => void; move: (e: GroundEvent) => void; up: (e: GroundEvent) => void }> }> = ({ handlersRef }) => {
    const { camera, gl } = useThree();
    useEffect(() => {
        const el = gl.domElement;
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const projected = new THREE.Vector3();
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;display:none;pointer-events:none;border:1px solid #22d3ee;background:rgba(34,211,238,0.15);z-index:10;';
        el.parentElement?.appendChild(box);
        let dragFrom: ScreenPoint | null = null;

        const toScreen = (world: THREE.Vector3): ScreenPoint => {
            const rect = el.getBoundingClientRect();
            projected.copy(world).project(camera);
            return { x: (projected.x + 1) / 2 * rect.width, y: (1 - projected.y) / 2 * rect.height };
        };
        const event = (e: PointerEvent, button: number): GroundEvent | null => {
            const rect = el.getBoundingClientRect();
            const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            ndc.set((screen.x / rect.width) * 2 - 1, -(screen.y / rect.height) * 2 + 1);
            raycaster.setFromCamera(ndc, camera);
            const point = raycaster.ray.intersectPlane(GROUND_PLANE, new THREE.Vector3());
            return point ? { point, button, screen, toScreen } : null;
        };
        const drawBox = (to: ScreenPoint | null) => {
            if (!dragFrom || !to || Math.hypot(to.x - dragFrom.x, to.y - dragFrom.y) < DRAG_THRESHOLD_PX) { box.style.display = 'none'; return; }
            box.style.display = 'block';
            box.style.left = `${Math.min(dragFrom.x, to.x)}px`;
            box.style.top = `${Math.min(dragFrom.y, to.y)}px`;
            box.style.width = `${Math.abs(to.x - dragFrom.x)}px`;
            box.style.height = `${Math.abs(to.y - dragFrom.y)}px`;
        };
        const down = (e: PointerEvent) => {
            const ge = event(e, e.button);
            if (!ge) return;
            if (e.button === 0) dragFrom = ge.screen;
            handlersRef.current.down(ge);
        };
        const move = (e: PointerEvent) => {
            const ge = event(e, -1);
            if (!ge) return;
            if (dragFrom) drawBox(ge.screen);
            handlersRef.current.move(ge);
        };
        // Released anywhere, even over the HUD, ends the drag.
        const up = (e: PointerEvent) => {
            if (e.button === 0 && !dragFrom) return;
            if (e.button === 0) { dragFrom = null; drawBox(null); }
            const ge = event(e, e.button);
            if (ge) handlersRef.current.up(ge);
        };
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            box.remove();
        };
    }, [camera, gl, handlersRef]);
    return null;
};

// A levelled city block where a new Command HQ can go (sim/bases.ts): a glowing pad on the
// ground and a button over it that opens the build menu.
const BaseSiteMarker: React.FC<{
  site: BaseSite; tileSize: number; offset: number; open: boolean; cores: number; compute: number;
  // What each Core Refinery at a base here would add (sim/refinery.ts).
  refinery: { multiplier: number; blocks: number | null };
  onToggle: () => void; onBuild: () => void;
}> = ({ site, tileSize, offset, open, cores, compute, refinery, onToggle, onBuild }) => {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.rotation.z = clock.elapsedTime * 0.4;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(clock.elapsedTime * 2);
  });
  const x = site.at.x * tileSize - offset;
  const z = site.at.z * tileSize - offset;
  const afford = cores >= BASE_SITE.cores && compute >= BASE_SITE.compute;
  return (
    <group position={[x, 0.3, z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[tileSize * 1.6, tileSize * 1.85, 6]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[tileSize * 1.6, 6]} />
        <meshBasicMaterial color="#0e7490" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <Html position={[0, 6, 0]} center zIndexRange={[150, 0]}>
        <div className="flex flex-col items-center pointer-events-auto" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title="Cleared city block: build a new Command HQ here"
            className={`w-9 h-9 rounded-md border-2 flex items-center justify-center shadow-lg ${open ? 'bg-cyan-500/40 border-cyan-200' : 'bg-slate-900/80 border-cyan-400/80 hover:bg-cyan-900/70'}`}
          >
            <Building2 className="w-5 h-5 text-cyan-200" />
          </button>
          {open && (
            <div className="hud-plate hud-corners hud-menu backdrop-blur mt-2 min-w-[230px] p-2 flex flex-col gap-1.5 text-left">
              <span className="text-cyan-400 font-mono font-bold text-xs uppercase">Base site</span>
              <span className="text-[10px] text-slate-300 leading-snug">A levelled city block. Build a new Command HQ: it extends your energy grid, repairs units in its block and has the HQ menu. Needs one of your units within {BASE_SITE.reach} tiles.</span>
              <button
                disabled={!afford}
                onClick={(e) => { e.stopPropagation(); onBuild(); }}
                className={`flex items-center justify-between px-3 py-2 rounded border ${afford ? 'border-cyan-300 bg-cyan-500/20 text-white hover:bg-cyan-500/40' : 'border-slate-700 opacity-60 text-slate-400 cursor-not-allowed'}`}
              >
                <span className="text-xs font-mono font-bold">Build Command HQ</span>
                <span className="text-[10px] font-mono text-right">
                  <span className={cores >= BASE_SITE.cores ? 'text-emerald-300' : 'text-red-400'}>{BASE_SITE.cores} cores</span><br />
                  <span className={compute >= BASE_SITE.compute ? 'text-blue-300' : 'text-red-400'}>{BASE_SITE.compute} ⚡</span>
                </span>
              </button>
              <span className="text-[9px] font-mono text-slate-500">Takes {BASE_SITE.buildMs / 1000}s to go up.</span>
              <span className="text-[9px] font-mono text-emerald-300/90 leading-snug">Core Refineries here: +{Math.round(refinery.multiplier * 100)}% of node income each{refinery.blocks !== null ? ` (core node ${refinery.blocks} block${refinery.blocks === 1 ? '' : 's'} away)` : ''}.</span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
};

const EnergyGridField: React.FC<{
  buildings: BuildingData[];
  playerTeam: 'blue' | 'red';
  // The player's command bases: the starting HQ and any built since (sim/bases.ts).
  bases: readonly { x: number; z: number }[];
  tileSize: number;
  offset: number;
}> = ({ buildings, playerTeam, bases, tileSize, offset }) => {
  const sources = useMemo(() => {
    const owned = buildings
      .filter(building => !building.destroyed && building.owner === playerTeam && building.type !== 'core_node')
      .map(building => ({ x: building.gridX, z: building.gridZ, radius: ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS }));
    return [...bases.map(b => ({ x: b.x, z: b.z, radius: ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS })), ...owned];
  }, [buildings, playerTeam, bases]);

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
  match: MatchConfig;
  onStatsUpdate: (stats: GameStats) => void;
  onMapInit?: (data: { roadTiles: RoadTileData[], gridSize: number }) => void;
  onMinimapUpdate?: (data: { units: UnitData[], buildings: BuildingData[], structures: StructureData[], selectedUnitIds?: string[], missiles?: MinimapMissile[], radarContacts?: MinimapData['radarContacts'], radars?: MinimapData['radars'], missileWarnings?: MinimapData['missileWarnings'], engagements?: MinimapData['engagements'] }) => void;
  playerTeam?: 'blue' | 'red';
  interactionMode?: 'select' | 'target';
  onMapTarget?: (location: {x: number, z: number}) => void;
  pendingDoctrineAction?: { type: string, target: {x: number, z: number}, team: 'blue'|'red' } | null;
  onActionComplete?: () => void;
  doctrines?: { blue: DoctrineState, red: DoctrineState };
  targetingDoctrine?: { type: string, team: 'blue'|'red', cost: number } | null;
  // Short messages for the player: refused orders, finished buildings, trained units.
  onNotice?: (text: string, tone?: 'info' | 'warn') => void;
  // Called once when a side wins.
  onMatchEnd?: (victory: Victory, summary: MatchSummary) => void;
  // Called every second with the match clock and objective state, for the HUD.
  onMatchInfo?: (info: MatchInfo) => void;
  // Filled in with a way for the HUD to give orders (research) through the same checks.
  commandRef?: React.MutableRefObject<((command: OrderCommand) => boolean) | null>;
  // The selection and army panel (components/ArmyPanel.tsx): what is selected and the saved
  // armies go out through onArmyUpdate; the panel's buttons come in through armyControlsRef.
  onArmyUpdate?: (selection: SelectionSummary, armies: ArmyInfo[]) => void;
  armyControlsRef?: React.MutableRefObject<ArmyControls | null>;
  // Filled in with this match's pacing report (sim/pacing.ts), for the HUD to show.
  pacingRef?: React.MutableRefObject<PacingRecord | null>;
}

export interface MatchInfo {
  elapsedMs: number;
}

const CityMap: React.FC<CityMapProps> = ({ match, onStatsUpdate, onMapInit, onMinimapUpdate, playerTeam = 'blue', interactionMode = 'select', onMapTarget, pendingDoctrineAction, onActionComplete, doctrines, targetingDoctrine, onNotice, onMatchEnd, onMatchInfo, commandRef, onArmyUpdate, armyControlsRef, pacingRef: pacingOut }) => {
  const { gridSize, tileSize, buildingDensity } = CITY_CONFIG;
  const { gl, scene, camera } = useThree();
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const glRef = useRef(gl);
  glRef.current = gl;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  // The pacing report: milestones and unit stats, recorded in every match but the sandbox.
  const pacingRef = useRef<PacingRecord | null>(match.mode === 'sandbox' ? null : freshPacing());
  if (pacingOut) pacingOut.current = pacingRef.current;
  // AI vs AI: the computer plays both sides and the viewer only watches.
  const spectating = match.mode === 'spectate';
  // Set while a computer player (or a test cheat) is giving orders, which spectating allows.
  const aiActingRef = useRef(false);
  const offset = (gridSize * tileSize) / 2;
  const baseA_Coord = TEAM_BASES.blue;
  const baseB_Coord = TEAM_BASES.red;

  // Map Generation State
  // Seeded, mirrored city (sim/mapgen.ts): both sides get the same map.
  const { initialBuildings, initialBlocks, roadTiles, roadTileSet, tileTypeMap, initialDrones, landmarks } = useMemo(() => {
    const city = generateCity({ seed: match.seed, gridSize, tileSize, buildingDensity, blueBase: baseA_Coord, redBase: baseB_Coord });
    return { initialBuildings: city.buildings, initialBlocks: city.blocks, roadTiles: city.roadTiles, roadTileSet: city.roadTileSet, tileTypeMap: city.tileTypeMap, initialDrones: city.sentinels, landmarks: city.landmarks };
  }, [match.seed, gridSize, tileSize, buildingDensity, baseA_Coord, baseB_Coord]);

  useEffect(() => { if (onMapInit) onMapInit({ roadTiles, gridSize }); }, [roadTiles, gridSize, onMapInit]);

  // Unit State
  const [buildings, setBuildings] = useState<BuildingData[]>(initialBuildings);
  const [blocks, setBlocks] = useState<BuildingBlock[]>(initialBlocks);
  const [units, setUnits] = useState<UnitData[]>(() => [...startingRoster(match, gridSize, baseA_Coord), ...initialDrones]);
  // Every unit's movement fields, for the unit models to read each frame (components/glide.ts).
  useLayoutEffect(() => publishMotion(units), [units]);
  
  // Each side's Command HQ is a structure with health: it can be attacked, fires back, and
  // losing it loses the match. Base.tsx draws it.
  const [structuresState, setStructuresState] = useState<StructureData[]>(() => [
    ...(['blue', 'red'] as const).map(team => ({
      id: `hq-${team}`, type: 'hq' as const, team, gridPos: team === 'blue' ? { ...baseA_Coord } : { ...baseB_Coord },
      isBlueprint: false, constructionProgress: 0, maxProgress: 0,
      health: STRUCTURE_INFO.hq.maxHealth, maxHealth: STRUCTURE_INFO.hq.maxHealth,
    })),
    // Sandbox: both sides start with every base building already up, for quick play testing.
    ...(match.mode === 'sandbox' ? sandboxStructures(gridSize) : []),
  ]);
  const [decoys, setDecoys] = useState<DecoyData[]>([]);
  const [clouds, setClouds] = useState<CloudData[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  // Brief weapon tracers from sim/combat.ts shots, cleared after TRACER_MS.
  const [tracers, setTracers] = useState<TracerData[]>([]);
  // Tank rail gun shots in the air for a moment, and when each gun last fired (ahead of state).
  const [railBeams, setRailBeams] = useState<RailBeamData[]>([]);
  const railShotRef = useRef(new Map<string, number>());
  // Who last shot at whom, and when: the minimap draws an arrow for each fresh one.
  const engagementsRef = useRef(new Map<string, { targetId: string; at: number }>());
  // When each Bombardment Drone last dropped, ahead of state (sim/bombard.ts).
  const bombardStrikeRef = useRef(new Map<string, number>());
  // Hornet Hunter-Killer rockets: when each fired (ahead of state), and Hellfire Salvo rockets in flight.
  const hornetShotRef = useRef(new Map<string, number>());
  // When each Kestrel last fired its Flechette Burst (sim/kestrel.ts), the same way.
  const flechetteShotRef = useRef(new Map<string, number>());
  const [miniRockets, setMiniRockets] = useState<MiniRocket[]>([]);
  // Tank Smoke Screens on the ground (sim/titan.ts), ahead of state for the tick.
  const smokeRef = useRef<SmokeScreen[]>([]);
  // Battery Mule Volt Cores counting down, by mule (sim/voltCore.ts), and the warnings drawn.
  const voltRef = useRef(new Map<string, VoltCharge>());
  const voltCharges = useRef<VoltCharge[]>([]);
  const [voltWarnings, setVoltWarnings] = useState<VoltCharge[]>([]);
  const [smokeScreens, setSmokeScreens] = useState<SmokeScreen[]>([]);
  const miniRocketsRef = useRef<MiniRocket[]>([]);
  // Thunderhead shells in flight. The ref is the authority; the state is for drawing them.
  const [shells, setShells] = useState<ArtilleryShell[]>([]);
  const shellsRef = useRef<ArtilleryShell[]>([]);
  // Lancer EMP rockets in flight, the same way.
  const [rockets, setRockets] = useState<EmpRocket[]>([]);
  // Black Wall virus bombs on their way down (Netrunner Tier 3, sim/blackwall.ts).
  type VirusBomb = { id: string; team: 'blue' | 'red'; at: { x: number; z: number }; firedAt: number; landAt: number };
  const [virusBombs, setVirusBombs] = useState<VirusBomb[]>([]);
  const virusBombsRef = useRef<VirusBomb[]>([]);
  // Force fields up as of the last game tick (sim/forcefield.ts).
  const fieldsRef = useRef<ForceField[]>([]);
  // Shield damage the domes have taken since the last game tick, by generator id.
  const shieldHitsRef = useRef(new Map<string, number>());
  const rocketsRef = useRef<EmpRocket[]>([]);
  // Aegis cannon fire this tick (for the tracer stream), and fire each piece of ordnance has taken.
  const ciwsLinksRef = useRef<CiwsLink[]>([]);
  const ordnanceHitsRef = useRef(new Map<string, number>());
  
  // Refactored Selection State
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  // The drag in progress, in screen pixels. A ref, not state: see GroundPointer.
  const dragRef = useRef<{ active: boolean; start: ScreenPoint; current: ScreenPoint } | null>(null);
  
  const [targetingSourceId, setTargetingSourceId] = useState<string | null>(null);
  // 'UNIT:<ability id>' while aiming a new unit's ability (sim/unitAbilities.ts).
  const [targetingAbility, setTargetingAbility] = useState<'TETHER' | 'BATTERY_TETHER' | 'SURVEILLANCE' | 'MISSILE' | 'DECOY' | 'SWARM' | 'BOMBARD' | 'ARTILLERY' | `UNIT:${string}` | null>(null);

  // The open HQ menu: 'blue' or 'red' for a starting HQ, or a built HQ's id.
  const [baseMenuOpen, setBaseMenuOpen] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<{type: StructureType, cost: number} | null>(null);
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;
  // Attack-move: armed with F for the next click, or hold Ctrl while clicking.
  const [attackMoveArmed, setAttackMoveArmed] = useState(false);
  const attackMoveArmedRef = useRef(false);
  const ctrlHeldRef = useRef(false);
  useEffect(() => {
      const down = (e: KeyboardEvent) => {
          ctrlHeldRef.current = e.ctrlKey || e.metaKey;
          if (e.code === 'KeyF' && !e.repeat && selectedUnitIdsRef.current.size > 0) {
              attackMoveArmedRef.current = !attackMoveArmedRef.current;
              setAttackMoveArmed(attackMoveArmedRef.current);
          }
      };
      const up = (e: KeyboardEvent) => { ctrlHeldRef.current = e.ctrlKey || e.metaKey; };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  // The latest dispatchOrder, for timers and the AI, which capture their closure once.
  // Spectating: refuses the viewer's own orders.
  const spectatorLocked = (quiet: boolean) => {
      if (!spectating || aiActingRef.current) return false;
      if (!quiet) onNotice?.('Spectating: the computer is playing both sides', 'warn');
      return true;
  };
  const asComputer = <T,>(fn: () => T): T => {
      const was = aiActingRef.current;
      aiActingRef.current = true;
      try { return fn(); } finally { aiActingRef.current = was; }
  };
  const dispatchOrderRef = useRef<(command: OrderCommand, team?: 'blue' | 'red', quiet?: boolean) => boolean>(() => false);
  const pointerStartRef = useRef<THREE.Vector3 | null>(null);
  // The tile under the cursor lives in a small store, not in this component's state: moving
  // the mouse across tiles used to re-render the whole map each time the tile changed. Only
  // what shows it (the hovered building's outline, the targeting cursor, the placement
  // preview) subscribes, through HoverTile and HoverBuilding.
  const hoverStore = useMemo(createHoverStore, []);
  const setHoverGridPos = hoverStore.set;
  // Cores, warhead stockpiles and tier progress. Only change it through the sim/economy helpers.
  const [economy, setEconomy] = useState<Economy>(() => createEconomy(STARTING_CORES[match.mode]));
  const economyRef = useRef(economy);
  economyRef.current = economy;
  const teamResources = useMemo(() => ({ blue: economy.blue.cores, red: economy.red.cores }), [economy]);
  const stockpile = useMemo(() => ({ blue: economy.blue.stockpile, red: economy.red.stockpile }), [economy]);
  // The player's tech tier and population, for menus.
  const supply = useMemo(() => ({
      tier: teamTier(economy, playerTeam),
      used: popUsed(units, structuresState, playerTeam),
      // No population cap in the sandbox: it is for play-testing.
      cap: match.mode === 'sandbox' ? Infinity : teamPopCap(buildings, playerTeam),
  }), [buildings, units, structuresState, playerTeam, economy, match.mode]);
  // The player's researched upgrades and those under way, for Advanced Research (sim/upgrades.ts).
  const playerUpgrades = playerTeam === 'blue' || playerTeam === 'red' ? economy[playerTeam].upgrades : undefined;
  const underwayKey = structuresState.filter(s => s.team === playerTeam && s.research).map(s => s.research!.upgrade).join(',');
  const upgradesUnderway = useMemo(() => (underwayKey ? underwayKey.split(',') as UpgradeId[] : []), [underwayKey]);

  // Cheat State

  
  const [depotMenuOpenId, setDepotMenuOpenId] = useState<string | null>(null);
  // Set by a production menu's "Set rally point": the next map click places it.
  const rallyForRef = useRef<string | null>(null);

  // Interaction Refs
  const didDragRef = useRef(false);

  const unitsRef = useRef(units);
  const decoysRef = useRef(decoys);
  decoysRef.current = decoys;
  const blocksRef = useRef(blocks);
  const buildingsRef = useRef(buildings);
  const cloudsRef = useRef(clouds);
  const structuresRef = useRef(structuresState);
  // The roundabout between the corporate towers sits on the central server node.
  const plazaCenter = useMemo(() => ({ x: Math.floor(gridSize / 2), z: Math.floor(gridSize / 2) }), [gridSize]);
  const getUnitsForScenery = useCallback(() => unitsRef.current, []);
  const selectedUnitIdsRef = useRef(selectedUnitIds);
  const flightRef = useRef(new Map<string, LiveFlight>());
  const trophyReadyRef = useRef(new Map<string, number>());
  const detonatedCrawlersRef = useRef(new Set<string>());
  const lastShotRef = useRef(new Map<string, number>());
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
                  style: event.style,
                  createdAt: now,
              });
          } else if (event.kind === 'damage') {
              damages.push(event);
              if (pacingRef.current && event.ownerId) {
                  const at = { x: (event.position.x + offset) / tileSize, z: (event.position.z + offset) / tileSize };
                  recordArea(pacingRef.current, event.ownerId, event.team, at, Math.max(0.75, event.radius / tileSize), unitsRef.current, structuresRef.current);
              }
          } else if (event.kind === 'shieldHit') {
              addShieldHit(shieldHitsRef.current, event.fieldId, event.damage);
          } else if (event.kind === 'decoy') {
              poppedDecoys.push(event.id);
          } else if (event.kind === 'cloud') {
              const radius = event.cloudType === 'nano' ? ABILITY_CONFIG.NANO_CLOUD_RADIUS : event.cloudType === 'wp' ? WP.radius : ABILITY_CONFIG.EMP_RADIUS;
              const duration = event.cloudType === 'nano' ? ABILITY_CONFIG.NANO_CLOUD_DURATION : event.cloudType === 'wp' ? WP.durationMs : ABILITY_CONFIG.EMP_DURATION;
              const gridPos = {
                  x: Math.round((event.position.x + offset) / CITY_CONFIG.tileSize),
                  z: Math.round((event.position.z + offset) / CITY_CONFIG.tileSize),
              };
              const cloud: CloudData = { id: `cloud-${now}-${Math.random()}`, type: event.cloudType, gridPos, radius, duration, createdAt: now, team: event.team };
              // Refs too, so this same tick's charging already sees the blackout.
              cloudsRef.current = [...cloudsRef.current, cloud];
              setClouds(prev => [...prev, cloud]);
              if (event.cloudType === 'emp') {
                  // EMP missile: the enemy grid goes dark inside the blast (the cloud is the
                  // blackout), and every enemy vehicle and aircraft caught in it shuts down.
                  const victims = new Set(empVictims(unitsRef.current, gridPos, radius, event.team).map(u => u.id));
                  if (victims.size > 0) {
                      const shutDown = (list: UnitData[]) => list.map(u => victims.has(u.id) ? addBuff(u, 'emp', now + duration) : u);
                      unitsRef.current = shutDown(unitsRef.current);
                      setUnits(shutDown);
                  }
                  onNoticeRef.current?.(event.team === playerTeam
                      ? `EMP hit: enemy grid down and ${victims.size} machine${victims.size === 1 ? '' : 's'} disabled for ${duration / 1000}s`
                      : `Enemy EMP: your grid is down in the blast for ${duration / 1000}s`, event.team === playerTeam ? undefined : 'warn');
              }
          } else if (event.kind === 'cloak') {
              // One generator per side: the old one blows as the new one lands.
              const team = event.team;
              const at = { x: Math.round((event.position.x + offset) / tileSize), z: Math.round((event.position.z + offset) / tileSize) };
              const old = new Set(generatorsReplacedBy(unitsRef.current, team));
              const gen = createUnit('cloak_generator', team, `cloakgen-${team}-${now}-${spawnCounterRef.current++}`, at);
              const land = (list: UnitData[]) => [...list.filter(u => !old.has(u.id)), gen];
              const gone = unitsRef.current.filter(u => old.has(u.id));
              unitsRef.current = land(unitsRef.current);
              setUnits(land);
              if (gone.length > 0) {
                  explosions.push(...gone.map(u => ({ id: `cloakgen-exp-${u.id}`, position: { x: u.gridPos.x * tileSize - offset, y: 1.5, z: u.gridPos.z * tileSize - offset }, radius: 3, duration: 600, createdAt: now })));
                  if (team === playerTeam) onNoticeRef.current?.('New Cloaking Field up: the old generator was destroyed');
              }
          } else if (event.kind === 'field') {
              // The Bulwark generator lands and its dome goes up. One per side: the old one goes.
              const team = event.team;
              const at = { x: Math.round((event.position.x + offset) / tileSize), z: Math.round((event.position.z + offset) / tileSize) };
              const old = new Set(generatorsOf(unitsRef.current, team));
              const gen = createUnit('field_generator', team, `fieldgen-${team}-${now}-${spawnCounterRef.current++}`, at);
              const land = (list: UnitData[]) => [...list.filter(u => !old.has(u.id)), gen];
              unitsRef.current = land(unitsRef.current);
              setUnits(land);
              if (team === playerTeam) onNoticeRef.current?.(old.size > 0 ? 'New force field up: the old generator was removed' : 'Force field up');
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
                      health: UNIT_STATS.titan_dropped.maxHealth * 1.5,
                      maxHealth: UNIT_STATS.titan_dropped.maxHealth * 1.5,
                      battery: 100,
                      maxBattery: 100,
                      cooldowns: {},
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
          setUnits(prev => applyDamage(prev, blastDamage(prev, damages, tileSize, offset, { hitsCloaked: false }, fieldsRef.current)));
      }
  };

  useEffect(() => { unitsRef.current = units; }, [units]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { cloudsRef.current = clouds; }, [clouds]);
  // EMP missile blackouts still in effect: the enemy grid is down inside each (sim/energy.ts).
  const activeBlackouts = (): Blackout[] => cloudsRef.current.filter(c => c.type === 'emp' && Date.now() - c.createdAt < c.duration);
  useEffect(() => { structuresRef.current = structuresState; }, [structuresState]);
  useEffect(() => { selectedUnitIdsRef.current = selectedUnitIds; }, [selectedUnitIds]);

  // Expose Cheats
  useEffect(() => {
    (window as any).GAME_CHEATS = {
      setResources: (team: 'blue' | 'red', amount: number) => {
        setEconomy(prev => setCores(prev, team, amount));
      },
      setCompute: (team: 'blue' | 'red', amount: number) => {
        setEconomy(prev => setCompute(prev, team, amount));
      },
      // For tests and debugging: issue a checked order for either side, and read the state.
      order: (command: OrderCommand, team: 'blue' | 'red') => asComputer(() => dispatchOrderRef.current(command, team)),
      ability: (command: AbilityCommand, team: 'blue' | 'red') => asComputer(() => aiCallsRef.current.dispatchAbility(command, team)),
      // The pacing report so far (sim/pacing.ts).
      pacing: () => pacingRef.current,
      // What the last frame cost the GPU: draw calls, triangles, and live geometries and textures.
      renderStats: () => ({ ...glRef.current.info.render, ...glRef.current.info.memory }),
      // Where a unit's model is drawn, in tiles (to check the smoothing against the game's position).
      drawnAt: (id: string) => {
          const obj = sceneRef.current.getObjectByName(`unit-${id}`);
          if (!obj) return null;
          const p = new THREE.Vector3();
          obj.getWorldPosition(p);
          return { x: (p.x + offset) / tileSize, z: (p.z + offset) / tileSize };
      },
      spawn: (type: UnitType, team: 'blue' | 'red', at: { x: number; z: number }) => {
          const unit = createUnit(type, team, `cheat-${type}-${Date.now()}-${++spawnCounterRef.current}`, at);
          unitsRef.current = [...unitsRef.current, unit];
          setUnits(prev => [...prev, unit]);
          return unit.id;
      },
      select: (ids: string[]) => setSelectedUnitIds(new Set(ids)),
      // Level every building in the city block (5x5 lot) holding a tile, for testing base sites.
      levelBlock: (at: { x: number; z: number }) => {
          const ix = Math.floor(at.x / 6), iz = Math.floor(at.z / 6);
          const level = (list: BuildingData[]) => list.map(b => Math.floor(b.gridX / 6) === ix && Math.floor(b.gridZ / 6) === iz && !b.destroyed ? { ...b, destroyed: true, health: 0 } : b);
          buildingsRef.current = level(buildingsRef.current);
          setBuildings(level);
          return { x: ix * 6 + 3, z: iz * 6 + 3 };
      },
      // A doctrine power, e.g. power('SHADOW_OPS_TIER3', { x, z }, 'blue'), with the usual checks.
      power: (type: string, target: { x: number; z: number }, team: 'blue' | 'red') => runDoctrinePowerRef.current({ type, target, team }),
      resetPowerCooldowns: () => { doctrineReadyAtRef.current = { blue: { tier2: 0, tier3: 0 }, red: { tier2: 0, tier3: 0 } }; },
      // Where a tile's centre (at height y) is on screen, in page pixels, for tests that click the map.
      screenOf: (at: { x: number; z: number }, y = 0.6) => {
          const v = new THREE.Vector3(at.x * tileSize - offset, y, at.z * tileSize - offset).project(cameraRef.current);
          const r = glRef.current.domElement.getBoundingClientRect();
          return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      // Glide the camera over a tile.
      focus: (at: { x: number; z: number }) => { cameraFocus.target = { x: at.x * tileSize - offset, z: at.z * tileSize - offset }; },
      // A finished structure, for testing turrets and the like.
      spawnStructure: (type: StructureType, team: 'blue' | 'red', at: { x: number; z: number }) => {
          const info = STRUCTURE_INFO[type];
          const s: StructureData = { id: `cheat-${type}-${Date.now()}-${++spawnCounterRef.current}`, type, team, gridPos: { ...at }, isBlueprint: false, constructionProgress: info.maxProgress || 100, maxProgress: info.maxProgress || 100, health: info.maxHealth, maxHealth: info.maxHealth };
          structuresRef.current = [...structuresRef.current, s];
          setStructuresState(prev => [...prev, s]);
          return s.id;
      },
      state: () => ({ units: unitsRef.current, structures: structuresRef.current, buildings: buildingsRef.current, economy: economyRef.current, selected: [...selectedUnitIdsRef.current], smoke: smokeRef.current }),
    };
    return () => { (window as any).GAME_CHEATS = undefined; };
  }, []);

  // Minimap Update Loop
  useEffect(() => {
    if (onMinimapUpdate) {
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
            // Radar (Aegis and Infiltrator): contacts in coverage show as plain dots.
            const team = playerTeam === 'red' ? 'red' : 'blue';
            const contacts = radarContactsFor(team, unitsRef.current, visibleUnitIdsRef.current, flightRef.current, shellsRef.current, tileSize, offset, now);
            const radarContacts = contacts.map(c => ({ id: c.id, x: (c.x + offset) / tileSize, z: (c.z + offset) / tileSize }));
            const radars = unitsRef.current.filter(u => u.team === team && radarRangeOf(u) > 0).map(u => ({ x: u.gridPos.x, z: u.gridPos.z, range: radarRangeOf(u) }));
            const missiles: MinimapMissile[] = [];
            const missileWarnings: NonNullable<MinimapData['missileWarnings']> = [];
            for (const live of flightRef.current.values()) {
                const shot = live.shot;
                if (live.impacted || shot.trajectory !== 'ballistic' || !shot.startPos || !shot.targetPos) continue;
                // Enemy missiles: a launch warning and a midcourse blip, never the live position
                // (radar coverage adds a live contact dot on top).
                if (shot.team !== team) {
                    const toGrid = (w: number) => (w + offset) / tileSize;
                    const half = ballisticProgress(shot, now) >= 0.5;
                    missileWarnings.push({
                        id: shot.id,
                        launchX: toGrid(shot.startPos.x), launchZ: toGrid(shot.startPos.z),
                        ...(half ? { midX: toGrid((shot.startPos.x + shot.targetPos.x) / 2), midZ: toGrid((shot.startPos.z + shot.targetPos.z) / 2) } : {}),
                    });
                    continue;
                }
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

            // Engagements involving the player: green arrows from their units to what they are
            // shooting, red ones from enemies to the player's units under fire.
            const engagements: NonNullable<MinimapData['engagements']> = [];
            const posOf = (id: string) => {
                const u = unitsRef.current.find(x => x.id === id && x.health > 0);
                if (u) return { team: u.team, x: u.gridPos.x, z: u.gridPos.z };
                const s = structuresRef.current.find(x => x.id === id && x.health > 0);
                return s ? { team: s.team as UnitData['team'], x: s.gridPos.x, z: s.gridPos.z } : null;
            };
            const nowMs = Date.now();
            const dampened = dampenedUnits(unitsRef.current);
            engagementsRef.current.forEach((e, attackerId) => {
                if (nowMs - e.at > ENGAGEMENT_MS) { engagementsRef.current.delete(attackerId); return; }
                const a = posOf(attackerId);
                const t = posOf(e.targetId);
                if (!a || !t || a.team === t.team) return;
                if (a.team === playerTeam) engagements.push({ id: attackerId, fromX: a.x, fromZ: a.z, toX: t.x, toZ: t.z, hostile: false });
                // An attacker hidden by a Ghost's Dampener doesn't give itself away on the minimap.
                else if (t.team === playerTeam && !dampened.has(attackerId)) engagements.push({ id: attackerId, fromX: a.x, fromZ: a.z, toX: t.x, toZ: t.z, hostile: true });
            });

            onMinimapUpdate({ 
                engagements,
                units: [...realUnits, ...fakeUnits], 
                buildings: buildingsRef.current,
                structures: structuresRef.current,
                selectedUnitIds: Array.from(selectedUnitIdsRef.current),
                missiles,
                radarContacts,
                radars,
                missileWarnings,
            });
        // Four times a second is plenty for the minimap, and each update re-renders the HUD.
        }, 250); 
        
        return () => clearInterval(interval);
    }
  }, [onMinimapUpdate, gridSize, decoys, playerTeam]);

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
          dragRef.current = { start: e.screen, current: e.screen, active: true };
      }
  };

  const handlePointerMove = (e: any) => {
      const drag = dragRef.current;
      if (drag && drag.active) {
          drag.current = e.screen;
          if (Math.hypot(e.screen.x - drag.start.x, e.screen.y - drag.start.y) >= DRAG_THRESHOLD_PX) didDragRef.current = true;
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
          if (dragRef.current) dragRef.current.active = false;
          if (!draggedFar) {
              const gx = Math.round((e.point.x + offset) / tileSize);
              const gz = Math.round((e.point.z + offset) / tileSize);
              commitPlacement(gx, gz);
          }
          return;
      }

      const drag = dragRef.current;
      if (drag && drag.active) {
          drag.current = e.screen;
          if (didDragRef.current) {
               // Performed a Drag - Box Select, in screen space
               const minX = Math.min(drag.start.x, drag.current.x);
               const maxX = Math.max(drag.start.x, drag.current.x);
               const minY = Math.min(drag.start.y, drag.current.y);
               const maxY = Math.max(drag.start.y, drag.current.y);

               const newSelection = new Set<string>();
               const world = new THREE.Vector3();
               unitsRef.current.forEach(u => {
                   world.set((u.gridPos.x * tileSize) - offset, 1, (u.gridPos.z * tileSize) - offset);
                   const at = e.toScreen(world);
                   if (at.x >= minX && at.x <= maxX && at.y >= minY && at.y <= maxY) {
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
          drag.active = false;
      }
  };

  // The drag and hover handlers above take their ground point from GroundPointer, which works
  // it out from the mouse ray without testing it against the scene.
  const groundHandlersRef = useRef({ down: handlePointerDown, move: handlePointerMove, up: handlePointerUp });
  groundHandlersRef.current = { down: handlePointerDown, move: handlePointerMove, up: handlePointerUp };

  // Guard positions stay hidden per team until one of that team's units walks into vision.
  const knownGuardsRef = useRef<{ blue: Set<string>; red: Set<string> }>({ blue: new Set(), red: new Set() });

  const visibleUnitIds = useMemo(() => {
    const visible = new Set<string>();
    const teamKey = playerTeam === 'blue' || playerTeam === 'red' ? playerTeam : null;
    const friendlies = units.filter(f => f.team === playerTeam);
    units.forEach(u => {
        if (u.team === playerTeam || spectating) { visible.add(u.id); return; }
        // Phantom Decoy cloaks the real Ghost from the other team entirely, and a Cloaking
        // Field anything inside it (sim/cloak.ts).
        if (isHidden(u)) return;
        if (u.type === 'defense_drone' && teamKey && knownGuardsRef.current[teamKey].has(u.id)) {
            visible.add(u.id);
            return;
        }
        const inHE = clouds.some(c => c.type === 'he' && Math.sqrt(Math.pow(u.gridPos.x - c.gridPos.x, 2) + Math.pow(u.gridPos.z - c.gridPos.z, 2)) <= c.radius);
        if (inHE) return; 
        const isDetected = friendlies.some(f => {
            const fInHE = clouds.some(c => c.type === 'he' && Math.sqrt(Math.pow(f.gridPos.x - c.gridPos.x, 2) + Math.pow(f.gridPos.z - c.gridPos.z, 2)) <= c.radius);
            if (fInHE) return false;
            const dist = Math.sqrt(Math.pow(u.gridPos.x - f.gridPos.x, 2) + Math.pow(u.gridPos.z - f.gridPos.z, 2));
            // Sky-Net Radar Sweep widens an Aegis' vision.
            return dist <= visionOf(f);
        });
        if (isDetected) {
            visible.add(u.id);
            if (u.type === 'defense_drone' && teamKey) knownGuardsRef.current[teamKey].add(u.id);
        }
    });
    return visible;
  }, [units, playerTeam, clouds, spectating]);
  const visibleUnitIdsRef = useRef(visibleUnitIds);
  visibleUnitIdsRef.current = visibleUnitIds;
  const canSeeGun = useCallback((u: UnitData) => u.team === playerTeam || visibleUnitIdsRef.current.has(u.id), [playerTeam]);


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

  // Command bases (sim/bases.ts): each side's HQs that are up, the city blocks levelled to the
  // ground (their rubble is cleared away), and the sites on them free to build a new base on.
  const teamBases = useMemo(() => ({
      blue: commandPosts(structuresState, 'blue', baseA_Coord),
      red: commandPosts(structuresState, 'red', baseB_Coord),
  }), [structuresState, baseA_Coord, baseB_Coord]);
  const teamBasesRef = useRef(teamBases);
  teamBasesRef.current = teamBases;
  const clearedLots = useMemo(() => clearedBlocks(buildings), [buildings]);
  const clearedLotsRef = useRef(clearedLots);
  clearedLotsRef.current = clearedLots;
  const sites = useMemo(() => baseSites(buildings, structuresState), [buildings, structuresState]);
  // The city's thousands of building elements. CityMap renders on every game tick while units
  // move, and capturing changes a few buildings most ticks, so each element is kept with the
  // building it shows and only remade when that building changes. Given the same element object,
  // React skips an unchanged building at once instead of comparing its props.
  const buildingElementCache = useRef(new WeakMap<BuildingData, React.ReactElement>());
  const buildingElements = useMemo(() => buildings.filter(b => !rubbleCleared(b, clearedLots)).map(b => {
      let el = buildingElementCache.current.get(b);
      if (!el) {
          el = <HoverBuilding key={b.id} data={b} store={hoverStore} />;
          buildingElementCache.current.set(b, el);
      }
      return el;
  }), [buildings, clearedLots, hoverStore]);
  const [siteMenuId, setSiteMenuId] = useState<string | null>(null);
  // The free base pad whose build menu is open (components/BuildPads.tsx).
  const [padMenuKey, setPadMenuKey] = useState<string | null>(null);
  // On an HQ's pad (the starting ones or any built since): nothing else goes there.
  const onHqPad = (x: number, z: number, structures: readonly StructureData[]) =>
      structures.some(s => s.type === 'hq' && Math.abs(x - s.gridPos.x) <= 1 && Math.abs(z - s.gridPos.z) <= 1);

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

  // Ground units take the quickest route by travel time, preferring main roads and steering clear
  // of the Sentinels still guarding server nodes (sim/pathfinding.ts).
  const findPath = useCallback((start: {x: number, z: number}, end: {x: number, z: number}) =>
      fastestPath(start, end, gridSize, (x, z) => dynamicRoadTileSet.has((x << 16) | z), (x, z) => tileTypeMap[`${x},${z}`], sentinelHazardOf(unitsRef.current)),
      [gridSize, dynamicRoadTileSet, tileTypeMap]);

  // Aircraft fly straight over everything.
  const findAirPath = useCallback((start: {x: number, z: number}, end: {x: number, z: number}) => airPath(start, end), []);

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
              if (isAirType(u.type)) return u;
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
  const aiHelpersRef = useRef({ findPath, findAirPath, findScatteredSpawn, isWalkable, doctrines, createCrawler });
  aiHelpersRef.current = { findPath, findAirPath, findScatteredSpawn, isWalkable, doctrines, createCrawler };
  const runDoctrinePowerRef = useRef<(action: { type: string, target: { x: number, z: number }, team: 'blue' | 'red' }) => boolean>(() => false);
  const matchRef = useRef(match);
  matchRef.current = match;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const onMatchEndRef = useRef(onMatchEnd);
  onMatchEndRef.current = onMatchEnd;
  const onMatchInfoRef = useRef(onMatchInfo);
  onMatchInfoRef.current = onMatchInfo;

  // Doctrine powers. The player's (from App) and the AI's both come through here, which checks
  // the team chose that doctrine, holds the tier (server nodes), is off cooldown and can pay.
  const doctrineReadyAtRef = useRef<Record<'blue' | 'red', { tier2: number, tier3: number }>>({ blue: { tier2: 0, tier3: 0 }, red: { tier2: 0, tier3: 0 } });
  const runDoctrinePower = (action: { type: string, target: { x: number, z: number }, team: 'blue' | 'red' }): boolean => {
          const { type, target, team } = action;
          const power = /^(HEAVY_METAL|SHADOW_OPS|NETRUNNER)_TIER([23])$/.exec(type);
          if (!power) return false;
          const doctrine = power[1].toLowerCase() as DoctrineType;
          const tier = Number(power[2]) as 2 | 3;
          const refuse = (reason: string) => {
              if (team === playerTeam) onNoticeRef.current?.(`Can't do that: ${reason}`, 'warn');
              return false;
          };
          if (aiHelpersRef.current.doctrines?.[team]?.selected !== doctrine) return refuse('that is not your doctrine');
          if (economyRef.current[team].tier < tier) return refuse(`needs Tier ${tier}: research it at your HQ`);
          const key = tier === 2 ? 'tier2' : 'tier3';
          const now = Date.now();
          if (doctrineReadyAtRef.current[team][key] > now) return refuse(`recharging (${Math.ceil((doctrineReadyAtRef.current[team][key] - now) / 1000)}s)`);
          // Pay against the live economy, so a power the team can no longer afford never fires.
          const cost = doctrinePowerCost(doctrine, tier);
          const paid = spend(economyRef.current, team, cost);
          if (!paid) return refuse('not enough cores');
          economyRef.current = paid;
          setEconomy(prev => spend(prev, team, cost) ?? prev);
          doctrineReadyAtRef.current[team][key] = now + (tier === 2 ? DOCTRINE_CONFIG[doctrine].tier2_cooldown : DOCTRINE_CONFIG[doctrine].tier3_cooldown);

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
              // Bulwark Force Field: the generator comes down in a drop pod (sim/forcefield.ts) and
              // lands through the 'field' flight event.
              const dropPos = { x: (target.x * tileSize) - offset, y: 100, z: (target.z * tileSize) - offset };
              const impactPos = { x: (target.x * tileSize) - offset, y: 0.5, z: (target.z * tileSize) - offset };
              setProjectiles(prev => [...prev, {
                  id: `field-drop-${Date.now()}`,
                  ownerId: 'orbital',
                  team,
                  position: dropPos,
                  velocity: { x: 0, y: -65.6, z: 0 },
                  damage: 0,
                  radius: 2,
                  maxDistance: 200,
                  distanceTraveled: 0,
                  targetPos: impactPos,
                  trajectory: 'direct',
                  payload: 'field_drop',
                  startPos: dropPos,
                  startTime: Date.now(),
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
              // Cloaking Field: a generator comes down in a drop pod (sim/cloak.ts). It lands
              // through the 'cloak' flight event below, which also retires the side's old one.
              const dropPos = { x: (target.x * tileSize) - offset, y: 100, z: (target.z * tileSize) - offset };
              const impactPos = { x: (target.x * tileSize) - offset, y: 0.5, z: (target.z * tileSize) - offset };
              setProjectiles(prev => [...prev, {
                  id: `cloak-drop-${Date.now()}`,
                  ownerId: 'orbital',
                  team,
                  position: dropPos,
                  velocity: { x: 0, y: -65.6, z: 0 },
                  damage: 0,
                  radius: 2,
                  maxDistance: 200,
                  distanceTraveled: 0,
                  targetPos: impactPos,
                  trajectory: 'direct',
                  payload: 'cloak_drop',
                  startPos: dropPos,
                  startTime: Date.now()
              }]);
          }
          else if (type === 'NETRUNNER_TIER2') {
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
          else if (type === 'NETRUNNER_TIER3') {
              // Black Wall Infect: a virus bomb falls on the target and goes off when it lands.
              const firedAt = Date.now();
              const bomb = { id: `virus-${team}-${firedAt}`, team, at: { ...target }, firedAt, landAt: firedAt + BLACKWALL.fallMs };
              virusBombsRef.current = [...virusBombsRef.current, bomb];
              setVirusBombs(virusBombsRef.current);
          }
          return true;
  };
  runDoctrinePowerRef.current = runDoctrinePower;

  useEffect(() => {
      if (pendingDoctrineAction) {
          // Spectating, the viewer has no doctrine powers to call in.
          if (!spectating) runDoctrinePower(pendingDoctrineAction);

          if (onActionComplete) onActionComplete();
      }
  }, [pendingDoctrineAction, tileSize, offset, onActionComplete]);

  // Doctrine Passive Loop + Swarm AI
  useEffect(() => {
      const interval = setInterval(() => {
          const { findPath, findScatteredSpawn, isWalkable, doctrines, createCrawler } = aiHelpersRef.current;
          const now = Date.now();
          // Swarm Host, Crawlers, doctrine passives and ability timers (sim/support.ts).
          setUnits(prevUnits => slowTick(prevUnits, {
              findPath, findScatteredSpawn, isWalkable, createCrawler, now, random: Math.random,
              doctrineOf: team => (team === 'blue' || team === 'red') ? doctrines?.[team]?.selected : null,
          }));
      }, SLOW_TICK_MS);
      return () => clearInterval(interval);
  }, []);

  // EMP rocket lock-on: every selected Lancer in range fires at the chosen enemy and the rockets
  // chase it. Only an enemy vehicle or aircraft your side can see can be locked.
  const LOCK_ON = 'UNIT:emp_rocket:lock';
  const fireLockOn = (target: UnitData) => {
      const source = unitsRef.current.find(u => u.id === targetingSourceId);
      const ids = unitsRef.current.filter(u => u.type === source?.type && (u.id === targetingSourceId || selectedUnitIds.has(u.id))).map(u => u.id);
      if (dispatchAbility({ type: 'UNIT_ABILITY', unitIds: ids, ability: 'emp_rocket', targetUnitId: target.id })) clearTargeting();
  };
  const lockable = (u: UnitData) => u.team !== playerTeam && isEmpTarget(u) && visibleUnitIdsRef.current.has(u.id);

  const handleUnitSelect = (id: string) => {
      // If we just dragged, ignore click logic that might fire
      if (didDragRef.current) return;
      if (interactionMode === 'target') return; // Selection disabled in target mode

      if (targetingSourceId && targetingAbility === LOCK_ON) {
          const target = unitsRef.current.find(u => u.id === id);
          if (target && lockable(target)) fireLockOn(target);
          else onNotice?.('Lock on to an enemy vehicle or aircraft in sight', 'warn');
          return;
      }

      // Stays in tethering mode so up to three drones can be hooked up (or let go) in a row;
      // it ends once the hardline is full.
      if (targetingSourceId && targetingAbility === 'TETHER') {
          dispatchAbility({ type: 'HARDLINE_TETHER', unitId: targetingSourceId, targetUnitId: id });
          const host = unitsRef.current.find(u => u.id === targetingSourceId);
          if ((host?.tetherTargetIds?.length ?? 0) >= MAX_TETHERS) clearTargeting();
          return;
      }
      // Stays in linking mode so several vehicles can be linked or unlinked in a row.
      if (targetingSourceId && targetingAbility === 'BATTERY_TETHER') {
          dispatchAbility({ type: 'BATTERY_LINK', unitId: targetingSourceId, targetUnitId: id });
          return;
      } else {
          // Standard Single Selection - replaces existing group selection
          setSelectedUnitIds(new Set([id]));
      }
  };

  const checkIsValidPlacement = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= gridSize || z >= gridSize) return false;
      if (Math.abs(x - baseA_Coord.x) <= 1 && Math.abs(z - baseA_Coord.z) <= 1) return false;
      if (Math.abs(x - baseB_Coord.x) <= 1 && Math.abs(z - baseB_Coord.z) <= 1) return false;
      if (onHqPad(x, z, structuresState)) return false;
      if (structuresState.some(s => s.gridPos.x === x && s.gridPos.z === z)) return false;
      if (buildings.some(b => b.gridX === x && b.gridZ === z && !rubbleCleared(b, clearedLots))) return false;
      // You can only build where you hold power: around your HQs and captured buildings.
      if (!isInsideEnergyGrid({ x, z }, playerTeam, buildings, teamBases.blue, teamBases.red, activeBlackouts())) return false;
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
      if (!spot) {
          onNotice?.('Cannot build there: it must be open ground inside your energy grid', 'warn');
          return;
      }
      if (!dispatchOrder({ type: 'PLACE_STRUCTURE', structureType: mode.type, at: spot })) return;
      // Masons pick up new blueprints on their own (the Mason loop below).
      placementModeRef.current = null;
      setPlacementMode(null);
      setDepotMenuOpenId(null);
  };

  const handleTileClick = (x: number, z: number) => {
      if (placementModeRef.current) {
          commitPlacement(x, z);
          return;
      }
      if (rallyForRef.current) {
          dispatchOrder({ type: 'SET_RALLY', structureId: rallyForRef.current, at: { x, z } });
          rallyForRef.current = null;
          onNotice?.('Rally point set');
          return;
      }
      // If we just dragged, ignore click events generated
      if (didDragRef.current) return;

      if (interactionMode === 'target' && onMapTarget) {
          onMapTarget({ x, z });
          return;
      }

      const tileOrders: Record<string, 'SURVEILLANCE' | 'FIRE_BALLISTA' | 'FIRE_SWARM' | 'BOMBARD'> = {
          SURVEILLANCE: 'SURVEILLANCE', MISSILE: 'FIRE_BALLISTA', SWARM: 'FIRE_SWARM', BOMBARD: 'BOMBARD',
      };
      if (targetingSourceId && targetingAbility === 'ARTILLERY') {
          // Every selected Thunderhead joins the fire mission; ones out of reach are refused.
          const ids = unitsRef.current.filter(u => u.type === 'howitzer' && (u.id === targetingSourceId || selectedUnitIds.has(u.id))).map(u => u.id);
          dispatchAbility({ type: 'ARTILLERY_FIRE', unitIds: ids, target: { x, z } });
          clearTargeting();
      } else if (targetingSourceId && targetingAbility === LOCK_ON) {
          // A click on the ground near a lockable enemy counts as clicking it: units are small.
          let best: UnitData | null = null;
          let bestD = 1.5;
          for (const u of unitsRef.current) {
              const d = Math.hypot(u.gridPos.x - x, u.gridPos.z - z);
              if (d <= bestD && lockable(u)) { best = u; bestD = d; }
          }
          if (best) fireLockOn(best);
          else onNotice?.('No lock: click an enemy vehicle or aircraft in sight, or use Fire at Location', 'warn');
      } else if (targetingSourceId && targetingAbility?.startsWith('UNIT:')) {
          // Every selected unit of the same type that is in range joins the strike.
          const ability = targetingAbility.slice(5);
          const source = unitsRef.current.find(u => u.id === targetingSourceId);
          const ids = unitsRef.current.filter(u => u.type === source?.type && (u.id === targetingSourceId || selectedUnitIds.has(u.id))).map(u => u.id);
          dispatchAbility({ type: 'UNIT_ABILITY', unitIds: ids, ability, target: { x, z } });
          clearTargeting();
      } else if (targetingSourceId && targetingAbility && tileOrders[targetingAbility as keyof typeof tileOrders]) {
          // Every selected unit of the same type strikes the same tile together: a synchronised
          // volley from a group of Ballistas, Titans or Wasps.
          const type = tileOrders[targetingAbility as keyof typeof tileOrders];
          const source = unitsRef.current.find(u => u.id === targetingSourceId);
          const ids = unitsRef.current
              .filter(u => u.type === source?.type && u.team === playerTeam && (u.id === targetingSourceId || selectedUnitIds.has(u.id)))
              .map(u => u.id);
          if (ids.length <= 1) {
              dispatchAbility({ type, unitId: targetingSourceId, target: { x, z } });
          } else {
              const fired = ids.filter(id => dispatchAbility({ type, unitId: id, target: { x, z } }, playerTeam, true)).length;
              if (fired === 0) onNotice?.(`Can't do that: ${lastAbilityRefusalRef.current}`, 'warn');
              else onNotice?.(`${fired} of ${ids.length} ${UNIT_STATS[source!.type].label} units fired together`);
          }
          clearTargeting();
      } else if (targetingSourceId && (targetingAbility === 'TETHER' || targetingAbility === 'BATTERY_TETHER')) {
          // Tethers target a unit, not a tile — keep targeting until a vehicle is clicked or cancelled.
          return;
      } else if (targetingSourceId) {
          setTargetingSourceId(null);
          setTargetingAbility(null);
      } else if (selectedUnitIds.size > 0) {
          // Ctrl-click (or F, then click) is an attack-move: stop to fight anything met on the way.
          const attackMove = attackMoveArmedRef.current || ctrlHeldRef.current;
          if (attackMoveArmedRef.current) { attackMoveArmedRef.current = false; setAttackMoveArmed(false); }
          dispatchOrder({ type: 'MOVE', unitIds: Array.from(selectedUnitIds), target: { x, z }, attackMove }, playerTeam, true);
          // Say so when jammed units in the selection didn't hear it (sim/jamming.ts).
          const mine = unitsRef.current.filter(u => selectedUnitIds.has(u.id) && u.team === playerTeam && u.health > 0);
          const jammedCount = mine.filter(u => u.isJammed).length;
          if (jammedCount > 0) {
              onNotice?.(jammedCount === mine.length ? 'Signal jammed: no new orders get through' : `${jammedCount} jammed unit${jammedCount > 1 ? 's' : ''} didn't receive the order`, 'warn');
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
      setPadMenuKey(null);
  }, []);

  const handleBgRightClick = useCallback((e: any) => {
      e.stopPropagation();
      handleRightClick(0, 0); 
  }, [handleRightClick]);

  // The player's base pads, the free ones marked with a + to build on (components/BuildPads.tsx).
  const coreNodeTiles = useMemo(() => buildings.filter(b => b.type === 'core_node' && !b.destroyed).map(b => ({ x: b.gridX, z: b.gridZ })), [buildings]);
  const freePads = useMemo<FreePad[]>(() => {
      if (playerTeam !== 'blue' && playerTeam !== 'red') return [];
      // A refinery's share of node income depends on its base's distance to a core node.
      const share = new Map(structuresState.filter(s => s.type === 'hq').map(h => [h.id, baseProximity(h.gridPos, coreNodeTiles)]));
      return (['building', 'turret'] as const).flatMap(kind => teamPads(structuresState, playerTeam, kind, gridSize)
          .map(p => ({ at: p.at, kind, taken: p.taken, refinery: kind === 'building' ? share.get(p.hqId) : undefined })));
  }, [structuresState, playerTeam, gridSize, coreNodeTiles]);
  // Free base pads per side, for the HQ build menu.
  const freePadsOf = (team: 'blue' | 'red') => ({
      building: teamPads(structuresState, team, 'building', gridSize).filter(p => !p.taken).length,
      turret: teamPads(structuresState, team, 'turret', gridSize).filter(p => !p.taken).length,
  });
  
  // Every unit ability goes through sim/abilities.ts as a command: it is checked for the
  // current team (ownership, unit type, cooldowns, charges, range) and only then applied.
  const spawnCounterRef = useRef(0);
  // Why the last ability order was refused, for a single notice after a group order.
  const lastAbilityRefusalRef = useRef('');
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${++spawnCounterRef.current}`;

  // Moving, training and building go through sim/orders.ts the same way, for the player and
  // the computer opponent alike: checked for the team (ownership, tier, population, cores,
  // energy grid), then applied. Quiet orders (plain moves) don't report a refusal.
  // Free to build on: no building, structure or HQ pad, with a road beside it for access.
  const canBuildOnTile = (bx: number, bz: number) => {
      if (Math.abs(bx - baseA_Coord.x) <= 1 && Math.abs(bz - baseA_Coord.z) <= 1) return false;
      if (Math.abs(bx - baseB_Coord.x) <= 1 && Math.abs(bz - baseB_Coord.z) <= 1) return false;
      if (onHqPad(bx, bz, structuresRef.current)) return false;
      if (structuresRef.current.some(st => st.gridPos.x === bx && st.gridPos.z === bz)) return false;
      // Rubble on a cleared block is gone: a new base's pads are free ground.
      if (buildingsRef.current.some(b => b.gridX === bx && b.gridZ === bz && !rubbleCleared(b, clearedLotsRef.current))) return false;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWalkable(bx + dx, bz + dz));
  };

  const dispatchOrder = (command: OrderCommand, team: 'blue' | 'red' = playerTeam, quiet = false): boolean => {
      if (spectatorLocked(quiet)) return false;
      const outcome = orderEffects(
          { units: unitsRef.current, structures: structuresRef.current, buildings: buildingsRef.current, economy: economyRef.current, blackouts: activeBlackouts(), unlimitedPop: matchRef.current.mode === 'sandbox' },
          team,
          command,
          {
              gridSize, bases: teamBasesRef.current,
              isWalkable, findPath, findAirPath, newId,
              canBuildOn: canBuildOnTile,
          },
      );
      if ('reason' in outcome) {
          if (team === playerTeam && !quiet) onNotice?.(`Can't do that: ${outcome.reason}`, 'warn');
          return false;
      }
      const fx = outcome.effects;
      const charge = fx.economy;
      // Refs first, so a second order in the same frame sees this one (see dispatchAbility).
      unitsRef.current = applyOrderToUnits(unitsRef.current, fx);
      structuresRef.current = applyOrderToStructures(structuresRef.current, fx);
      if (charge) {
          economyRef.current = charge(economyRef.current) ?? economyRef.current;
          setEconomy(prev => charge(prev) ?? prev);
      }
      if (command.type === 'RESEARCH_TIER') {
          onNotice?.(team === playerTeam ? `Tier ${command.tier} researched: new units and doctrine powers unlocked; research their upgrades at Advanced Research` : `The enemy has reached Tier ${command.tier}`, team === playerTeam ? 'info' : 'warn');
      }
      if (fx.unitUpdates.size > 0) setUnits(prev => applyOrderToUnits(prev, fx));
      if (fx.structureUpdates.size > 0 || fx.newStructures.length > 0 || fx.removeStructures?.length) setStructuresState(prev => applyOrderToStructures(prev, fx));
      return true;
  };
  dispatchOrderRef.current = dispatchOrder;
  if (commandRef) commandRef.current = command => dispatchOrder(command);

  const dispatchAbility = (command: AbilityCommand, team: 'blue' | 'red' = playerTeam, quiet = false): boolean => {
      if (spectatorLocked(quiet)) return false;
      const outcome = abilityEffects(
          { units: unitsRef.current, structures: structuresRef.current, economy: economyRef.current },
          team,
          command,
          {
              now: Date.now(), offset, tileSize, isWalkable, findPath, findAirPath, findAdjacentSpawn, createCrawler,
              random: Math.random,
              newId: prefix => `${prefix}-${Date.now()}-${++spawnCounterRef.current}`,
          },
      );
      if ('reason' in outcome) {
          if (team === playerTeam && !quiet) onNotice?.(`Can't do that: ${outcome.reason}`, 'warn');
          lastAbilityRefusalRef.current = outcome.reason;
          return false;
      }
      const fx = outcome.effects;
      const charge = fx.economy;
      // Apply to the refs straight away as well. They otherwise only catch up after the next
      // render, so a second click in the same frame was checked against the old state and a
      // double-click on Smoke spent both charges.
      unitsRef.current = applyUnitEffects(unitsRef.current, fx);
      if (charge) economyRef.current = charge(economyRef.current) ?? economyRef.current;
      if (charge) setEconomy(prev => charge(prev) ?? prev);
      if (fx.updates.size > 0 || fx.spawnUnits.length > 0) setUnits(prev => applyUnitEffects(prev, fx));
      if (fx.clearDecoysOf.length > 0 || fx.spawnDecoys.length > 0) {
          setDecoys(prev => [...prev.filter(d => !d.ownerId || !fx.clearDecoysOf.includes(d.ownerId)), ...fx.spawnDecoys]);
      }
      if (fx.spawnProjectiles.length > 0) setProjectiles(prev => [...prev, ...fx.spawnProjectiles]);
      if (fx.salvo && fx.salvo.length > 0) {
          miniRocketsRef.current = [...miniRocketsRef.current, ...fx.salvo];
          setMiniRockets(miniRocketsRef.current);
      }
      if (fx.smoke && fx.smoke.length > 0) {
          smokeRef.current = [...smokeRef.current, ...fx.smoke];
          setSmokeScreens(smokeRef.current);
      }
      if (fx.rockets && fx.rockets.length > 0) {
          rocketsRef.current = [...rocketsRef.current, ...fx.rockets];
          setRockets(rocketsRef.current);
      }
      // An aimed EMP rocket or Hellfire salvo: a burst at the target.
      if (fx.strike) {
          const at = { x: fx.strike.at.x * tileSize - offset, y: 1.5, z: fx.strike.at.z * tileSize - offset };
          const now = Date.now();
          const emp = fx.strike.kind === 'emp';
          setExplosions(prev => [...prev, { id: `strike-${now}-${spawnCounterRef.current++}`, position: at, radius: fx.strike!.radius * tileSize * (emp ? 1 : 0.6), duration: emp ? 1100 : 700, createdAt: now, style: emp ? 'emp' : undefined }]);
      }
      return true;
  };

  // The computer opponent (sim/ai.ts). It thinks every few seconds and sends its commands
  // through dispatchOrder, dispatchAbility and runDoctrinePower, the same checks as yours.
  // --- Selection panel and saved armies (components/ArmyPanel.tsx) ---
  const [armies, setArmies] = useState<{ name: string; unitIds: string[] }[]>([]);
  const armyNumberRef = useRef(0);
  const ownSelected = (ids: Iterable<string>) => {
      const set = new Set(ids);
      return unitsRef.current.filter(u => set.has(u.id) && u.team === playerTeam && u.health > 0);
  };
  const centreOn = (list: readonly UnitData[]) => {
      if (list.length === 0) return;
      const x = list.reduce((s, u) => s + u.gridPos.x, 0) / list.length;
      const z = list.reduce((s, u) => s + u.gridPos.z, 0) / list.length;
      cameraFocus.target = { x: x * tileSize - offset, z: z * tileSize - offset };
  };
  const sameSet = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every(id => a.has(id));
  if (armyControlsRef) armyControlsRef.current = {
      // Put one unit of this type first in the selection: its action menu opens there, and aimed
      // orders from that menu are carried out by every selected unit of the type.
      focusType: type => {
          const selected = ownSelected(selectedUnitIds);
          const lead = selected.find(u => u.type === type);
          if (!lead) return;
          setTargetingSourceId(null);
          setTargetingAbility(null);
          setSelectedUnitIds(new Set([lead.id, ...selected.filter(u => u.id !== lead.id).map(u => u.id)]));
          centreOn([lead]);
      },
      groupArmy: () => {
          const ids = ownSelected(selectedUnitIds).map(u => u.id);
          if (ids.length === 0) return;
          if (armies.length >= MAX_ARMIES) { onNotice?.(`At most ${MAX_ARMIES} armies; disband one first`, 'warn'); return; }
          const name = `Army ${++armyNumberRef.current}`;
          setArmies(prev => [...prev, { name, unitIds: ids }]);
          onNotice?.(`${name} grouped: ${ids.length} unit${ids.length === 1 ? '' : 's'} (key ${armies.length + 1})`);
      },
      // Selects the army; if it is already selected, centres the camera on it.
      selectArmy: index => {
          const army = armies[index];
          if (!army) return;
          const living = ownSelected(army.unitIds);
          if (living.length === 0) return;
          if (sameSet(selectedUnitIds, living.map(u => u.id))) { centreOn(living); return; }
          setTargetingSourceId(null);
          setTargetingAbility(null);
          setSelectedUnitIds(new Set(living.map(u => u.id)));
      },
      removeArmy: index => setArmies(prev => prev.filter((_, i) => i !== index)),
  };
  // Tell the panel what is selected and how the armies stand. Sent only when something the
  // panel shows changed, not every tick.
  const lastArmyReportRef = useRef('');
  useEffect(() => {
      if (!onArmyUpdate) return;
      const selected = ownSelected(selectedUnitIds);
      const counts = new Map<UnitType, number>();
      for (const u of selected) counts.set(u.type, (counts.get(u.type) || 0) + 1);
      const first = selected.find(u => u.id === Array.from(selectedUnitIds)[0]);
      const selection: SelectionSummary = {
          types: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || UNIT_STATS[a.type].label.localeCompare(UNIT_STATS[b.type].label)),
          focused: first?.type ?? null,
          total: selected.length,
      };
      const info: ArmyInfo[] = armies.map(a => {
          const living = ownSelected(a.unitIds).map(u => u.id);
          return { name: a.name, alive: living.length, selected: living.length > 0 && sameSet(selectedUnitIds, living) };
      });
      const report = JSON.stringify([selection, info]);
      if (report === lastArmyReportRef.current) return;
      lastArmyReportRef.current = report;
      onArmyUpdate(selection, info);
  });
  // Armies whose every unit is gone disband themselves.
  useEffect(() => {
      if (armies.some(a => ownSelected(a.unitIds).length === 0)) setArmies(prev => prev.filter(a => ownSelected(a.unitIds).length > 0));
  }, [units, armies]);
  // Number keys 1-9 select the matching army.
  useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          if (e.ctrlKey || e.metaKey || e.altKey || !/^Digit[1-9]$/.test(e.code)) return;
          armyControlsRef?.current?.selectArmy(Number(e.code.slice(5)) - 1);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
  }, [armyControlsRef]);

  // Each computer player's memory (two of them in AI vs AI).
  const aiRef = useRef({ memory: { blue: freshAiMemory(), red: freshAiMemory() } });
  // How much of each computer player's strategy log is in the pacing report.
  const strategiesLoggedRef = useRef({ blue: 0, red: 0 });
  const aiCallsRef = useRef({ dispatchOrder, dispatchAbility, canBuildOnTile });
  aiCallsRef.current = { dispatchOrder, dispatchAbility, canBuildOnTile };
  useEffect(() => {
      const aiTeams = aiTeamsOf(match);
      if (aiTeams.length === 0) return;
      const profile = AI_PROFILES[match.difficulty];
      // Each computer player thinks on its own timer. With two, they're staggered half a think
      // apart, which goes first is a coin flip, and every interval varies a little
      // (nextThinkDelay), so the timers cross back and forth and neither colour stays first.
      const offsets = thinkOffsets(Math.random() < 0.5 ? 'blue' : 'red', profile.thinkMs);
      const think = (aiTeam: 'blue' | 'red') => {
          const now = Date.now();
          const doctrine = doctrineOf(match, aiTeam);
          const { isWalkable } = aiHelpersRef.current;
          const ready = doctrineReadyAtRef.current[aiTeam];
          const { actions, memory } = aiThink(
              { units: unitsRef.current, structures: structuresRef.current, buildings: buildingsRef.current, economy: economyRef.current, elapsedMs: now - matchStartRef.current },
              aiTeam,
              aiRef.current.memory[aiTeam],
              {
                  gridSize, bases: { blue: baseA_Coord, red: baseB_Coord },
                  difficulty: match.difficulty, doctrine,
                  canBuildOn: aiCallsRef.current.canBuildOnTile,
                  isOpenGround: (x, z) => tileTypeMap[`${x},${z}`] === 'open',
                  isWalkable,
                  doctrineCooldowns: { tier2: Math.max(0, ready.tier2 - now), tier3: Math.max(0, ready.tier3 - now) },
                  random: Math.random,
              },
          );
          aiRef.current.memory[aiTeam] = memory;
          if (pacingRef.current) strategiesLoggedRef.current[aiTeam] = recordStrategies(pacingRef.current, aiTeam, memory.plan.log, strategiesLoggedRef.current[aiTeam]);
          aiActingRef.current = true;
          try {
              for (const action of actions) {
                  if (action.kind === 'order') aiCallsRef.current.dispatchOrder(action.command, aiTeam, true);
                  else if (action.kind === 'ability') aiCallsRef.current.dispatchAbility(action.command, aiTeam);
                  else if (doctrine) runDoctrinePowerRef.current({ type: `${doctrine.toUpperCase()}_TIER${action.tier}`, target: action.target, team: aiTeam });
              }
          } finally {
              aiActingRef.current = false;
          }
      };
      const timers: Partial<Record<'blue' | 'red', ReturnType<typeof setTimeout>>> = {};
      const loop = (aiTeam: 'blue' | 'red') => {
          think(aiTeam);
          timers[aiTeam] = setTimeout(() => loop(aiTeam), nextThinkDelay(profile.thinkMs, Math.random));
      };
      for (const aiTeam of aiTeams) timers[aiTeam] = setTimeout(() => loop(aiTeam), aiTeams.length > 1 ? offsets[aiTeam] : 0);
      return () => Object.values(timers).forEach(t => clearTimeout(t));
  }, [match, gridSize, baseA_Coord, baseB_Coord, tileTypeMap]);

  const clearTargeting = () => {
      setTargetingSourceId(null);
      setTargetingAbility(null);
  };

  // Toggles act on the whole selection, plus the unit whose menu was clicked.
  const TOGGLE_COMMANDS: Record<string, 'TOGGLE_JAMMER' | 'TOGGLE_DAMPENER' | 'TOGGLE_ANCHOR' | 'TOGGLE_CLOAK_FIELD'> = {
      'TOGGLE_JAMMER': 'TOGGLE_JAMMER',
      'TOGGLE DAMPENER': 'TOGGLE_DAMPENER',
      'TOGGLE_ANCHOR': 'TOGGLE_ANCHOR',
      'TOGGLE_CLOAK_FIELD': 'TOGGLE_CLOAK_FIELD',
  };
  // Abilities that need a target pick it on the next map or unit click.
  const TARGETED_ABILITIES: Record<string, 'SURVEILLANCE' | 'MISSILE' | 'SWARM' | 'BOMBARD'> = {
      'LOITERING SURVEILLANCE': 'SURVEILLANCE',
      'FIRE_BALLISTA': 'MISSILE',
      'FIRE_SWARM': 'SWARM',
      'BOMBARD': 'BOMBARD',
  };
  const warheadIn = (action: string): Warhead => action.endsWith('EMP') ? 'emp' : action.endsWith('WP') ? 'wp' : 'he';

  const handleUnitAction = (unitId: string, action: string) => {
      const unit = unitsRef.current.find(u => u.id === unitId);
      if (!unit) return;

      if (action.startsWith('LOAD_AMMO_')) { dispatchAbility({ type: 'LOAD_AMMO', unitId, warhead: warheadIn(action) }); return; }
      if (action.startsWith('FABRICATE_')) { dispatchAbility({ type: 'FABRICATE', unitId, warhead: warheadIn(action) }); return; }
      if (action.startsWith('TRANSFER_')) { dispatchAbility({ type: 'TRANSFER_WARHEAD', unitId, warhead: warheadIn(action) }); return; }
      if (action.startsWith('TAKE_')) { dispatchAbility({ type: 'TAKE_WARHEAD', unitId, warhead: warheadIn(action) }); return; }
      if (action === 'RESUPPLY_MATERIAL') { dispatchAbility({ type: 'RESUPPLY_MATERIAL', unitId }); return; }
      if (action.startsWith('UNIT_ABILITY:')) {
          const [ability, mode] = action.slice('UNIT_ABILITY:'.length).split(':');
          const def = abilityDef(ability);
          if (!def) return;
          if (mode === 'lock') {
              // Lock on with the next click on an enemy vehicle or aircraft in sight.
              setTargetingSourceId(unitId);
              setTargetingAbility(`UNIT:${ability}:lock`);
              onNotice?.(`${def.name}: click an enemy vehicle or aircraft in sight within ${def.targeted?.range} tiles to lock on`);
              return;
          }
          if (def.targeted) {
              // Aim with the next map click.
              setTargetingSourceId(unitId);
              setTargetingAbility(`UNIT:${ability}`);
              onNotice?.(`${def.name}: click a spot within ${def.targeted.range} tiles`);
              return;
          }
          // Acts on every selected unit of this type, plus the one whose menu was clicked.
          const ids = unitsRef.current.filter(u => u.type === unit.type && (u.id === unitId || selectedUnitIds.has(u.id))).map(u => u.id);
          dispatchAbility({ type: 'UNIT_ABILITY', unitIds: ids, ability });
          return;
      }
      if (action === 'FIRE_MISSION') {
          if (targetingSourceId === unitId && targetingAbility === 'ARTILLERY') { clearTargeting(); return; }
          setTargetingSourceId(unitId);
          setTargetingAbility('ARTILLERY');
          onNotice?.('Fire mission: click a tile inside the orange ring');
          return;
      }
      if (action === 'CEASE_BOMBARD') {
          // Every selected Bombardment Drone, plus the one whose menu was clicked.
          unitsRef.current
              .filter(u => u.type === 'bombard' && u.bombardmentTarget && (u.id === unitId || selectedUnitIds.has(u.id)))
              .forEach(u => dispatchAbility({ type: 'BOMBARD', unitId: u.id }));
          return;
      }
      if (action === 'CEASE_FIRE') {
          const ids = unitsRef.current.filter(u => u.type === 'howitzer' && (u.id === unitId || selectedUnitIds.has(u.id))).map(u => u.id);
          dispatchAbility({ type: 'ARTILLERY_FIRE', unitIds: ids });
          return;
      }
      if (action === 'PHANTOM_DECOY_INIT') { dispatchAbility({ type: 'PHANTOM_DECOY', unitId }); return; }
      // Helios mode, for every selected Helios as well as this one (sim/helios.ts).
      if (action === 'HELIOS_CHARGE' || action === 'HELIOS_BURN') {
          const ids = unitsRef.current.filter(u => u.type === 'helios' && (u.id === unitId || selectedUnitIds.has(u.id))).map(u => u.id);
          dispatchAbility({ type: 'SET_HELIOS_MODE', unitIds: ids, mode: action === 'HELIOS_BURN' ? 'burn' : 'charge' });
          return;
      }

      if (action === 'DISCONNECT_TETHER') { dispatchAbility({ type: 'DISCONNECT_TETHER', unitId }); clearTargeting(); return; }
      if (action === 'DISCONNECT_BATTERY') { dispatchAbility({ type: 'DISCONNECT_BATTERY', unitId }); clearTargeting(); return; }

      // Tethers aim at a unit; clicking the button again cancels.
      if (action === 'HARDLINE_TETHER' || action === 'BATTERY_TETHER') {
          const mode = action === 'HARDLINE_TETHER' ? 'TETHER' : 'BATTERY_TETHER';
          if (mode === 'BATTERY_TETHER' && (unit.type !== 'sun_plate' || !unit.isDeployed)) return;
          if (targetingSourceId === unitId && targetingAbility === mode) {
              clearTargeting();
          } else {
              setTargetingSourceId(unitId);
              setTargetingAbility(mode);
          }
          return;
      }

      const targeted = TARGETED_ABILITIES[action];
      if (targeted) {
          setTargetingSourceId(unitId);
          setTargetingAbility(targeted);
          return;
      }

      const toggle = TOGGLE_COMMANDS[action];
      if (toggle) {
          dispatchAbility({ type: toggle, unitIds: Array.from(new Set([...selectedUnitIds, unitId])) });
      }
  };

  // --- Depot / Mason Logic ---
  const handleStructureClick = (id: string) => {
      // If we just dragged, don't open menu
      if (didDragRef.current) return;

      const struct = structuresState.find(s => s.id === id);
      const validTypes = ['support', 'infantry', 'armor', 'ordnance', 'air', 'builder', 'ordnance_fab', 'research_lab', 'refinery', 'defense', 'aa_turret'];
      if (struct && validTypes.includes(struct.type) && struct.team === playerTeam) {
          setDepotMenuOpenId(id);
      }
  };

  const handleStructureAction = (action: string, payload?: any) => {
      if (!depotMenuOpenId) return;
      const struct = structuresState.find(s => s.id === depotMenuOpenId);
      if (!struct) return;

      if (action === 'DISASSEMBLE') {
          const wasDismantling = !!struct.dismantle;
          const unfinished = struct.isBlueprint || (struct.buildRemainingMs || 0) > 0;
          if (dispatchOrder({ type: 'DISASSEMBLE_STRUCTURE', structureId: struct.id })) {
              if (wasDismantling) onNotice?.(`Stopped disassembling the ${STRUCTURE_INFO[struct.type].label}`);
              else if (unfinished) { onNotice?.(`${STRUCTURE_INFO[struct.type].label} cancelled: cores refunded`); setDepotMenuOpenId(null); }
              else onNotice?.(`Disassembling the ${STRUCTURE_INFO[struct.type].label}`);
          }
          return;
      }
      if (action === 'UPGRADE_REFINERY' && struct.type === 'refinery') {
          if (dispatchOrder({ type: 'UPGRADE_REFINERY', structureId: struct.id })) onNotice?.(`Core Refinery upgrading: level 2 in ${REFINERY.upgrade.ms / 1000}s`);
          return;
      }
      if (action === 'BUILD_WARHEAD' && struct.type === 'ordnance_fab' && !struct.isBlueprint) {
          const item = payload as Warhead;
          if (!WARHEAD_LIST.includes(item)) return;
          // Checked and paid for in sim/orders.ts, like the computer's.
          dispatchOrder({ type: 'BUILD_WARHEAD', structureId: struct.id, warhead: item });
          return;
      }

      if (action === 'RESEARCH_UPGRADE' && struct.type === 'research_lab') {
          // Checked and paid for in sim/orders.ts, like the computer's.
          dispatchOrder({ type: 'RESEARCH_UPGRADE', structureId: struct.id, upgrade: payload as UpgradeId });
          return;
      }

      if (action === 'SET_RALLY') {
          rallyForRef.current = struct.id;
          setDepotMenuOpenId(null);
          onNotice?.('Click the map to set the rally point');
          return;
      }
      if (action === 'BUILD_UNIT') {
          // Stays open so several can be queued.
          dispatchOrder({ type: 'TRAIN_UNIT', structureId: struct.id, unitType: payload as UnitType });
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
      setEconomy(prev => payIncome(prev, buildingsRef.current, incomeMultipliers(matchRef.current), structuresRef.current));
    }, ECONOMY_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Match clock, losses and victory, once a second.
  const matchStartRef = useRef(Date.now());
  const matchOverRef = useRef(false);
  const tallyRef = useRef({ blue: { trained: 0, lost: 0 }, red: { trained: 0, lost: 0 } });
  const aliveRef = useRef(new Map<string, 'blue' | 'red'>());
  const alertAtRef = useRef(new Map<string, number>());
  const nodeOwnerRef = useRef(new Map<string, BuildingData['owner']>());
  const playerTeamRef = useRef(playerTeam);
  playerTeamRef.current = playerTeam;
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      // A unit that was alive last second and is gone now was lost. Crawlers are ammunition.
      const alive = new Map<string, 'blue' | 'red'>();
      for (const u of unitsRef.current) {
          if ((u.team === 'blue' || u.team === 'red') && u.health > 0 && u.type !== 'crawler_drone') alive.set(u.id, u.team);
      }
      aliveRef.current.forEach((team, id) => { if (!alive.has(id)) tallyRef.current[team].lost++; });
      aliveRef.current = alive;

      // Alerts for the player: their base under attack, their nodes being taken, nodes changing hands.
      const me = playerTeamRef.current;
      const say = (key: string, text: string, tone: 'info' | 'warn', everyMs: number) => {
          if ((alertAtRef.current.get(key) || 0) + everyMs > now) return;
          alertAtRef.current.set(key, now);
          onNoticeRef.current?.(text, tone);
      };
      const myEconomy = economyRef.current[me];
      if (myEconomy.tier < 3) {
          const next = (myEconomy.tier + 1) as 2 | 3;
          if (myEconomy.compute >= researchCost(next)) say(`research-${next}`, `Enough compute for Tier ${next}: research it in your team panel or HQ menu`, 'info', 60000);
      }
      const myHq = me === 'blue' ? baseA_Coord : baseB_Coord;
      if (unitsRef.current.some(u => u.team !== me && u.team !== 'neutral' && u.health > 0 && Math.hypot(u.gridPos.x - myHq.x, u.gridPos.z - myHq.z) <= 10)) {
          say('base', 'Enemy forces at your base!', 'warn', 30000);
      }
      for (const b of buildingsRef.current) {
          if (b.type !== 'core_node' && b.type !== 'server_node') continue;
          const label = b.type === 'core_node' ? 'core node' : 'server node';
          const before = nodeOwnerRef.current.get(b.id);
          if (before !== undefined && before !== b.owner) {
              if (b.owner === me) say(`own-${b.id}`, `${label[0].toUpperCase()}${label.slice(1)} captured`, 'info', 0);
              else if (before === me) say(`lost-${b.id}`, `You lost a ${label}`, 'warn', 0);
          }
          nodeOwnerRef.current.set(b.id, b.owner);
          if (b.owner === me && b.capturingTeam && b.capturingTeam !== me && b.captureProgress > 0) {
              say(`taking-${b.id}`, `The enemy is taking your ${label}`, 'warn', 20000);
          }
      }

      const victory = checkVictory(structuresRef.current);
      const elapsedMs = now - matchStartRef.current;
      onMatchInfoRef.current?.({ elapsedMs });
      if (!victory || matchOverRef.current || matchRef.current.mode === 'sandbox') return;
      matchOverRef.current = true;
      if (pacingRef.current) recordVictory(pacingRef.current, victory.winner);
      const side = (team: 'blue' | 'red') => ({
          ...tallyRef.current[team],
          earned: economyRef.current[team].lifetimeIncome,
          coreNodes: coreNodesHeld(buildingsRef.current, team),
          serverNodes: serverNodesHeld(buildingsRef.current, team),
      });
      onMatchEndRef.current?.(victory, { durationMs: elapsedMs, teams: { blue: side('blue'), red: side('red') } });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Report to the HUD whenever the economy changes: every income tick, and right after a purchase.
  // Layout effect so the HUD hears about it in the same pass, not after the next rendered frame.
  useLayoutEffect(() => {
    const blue = teamStats(economy, 'blue', buildingsRef.current, unitsRef.current, structuresRef.current);
    const red = teamStats(economy, 'red', buildingsRef.current, unitsRef.current, structuresRef.current);
    if (matchRef.current.mode === 'sandbox') { blue.popCap = Infinity; red.popCap = Infinity; }
    // Seconds until each doctrine power is ready again.
    const now = Date.now();
    for (const [team, s] of [['blue', blue], ['red', red]] as const) {
        const ready = doctrineReadyAtRef.current[team];
        s.doctrine = { ...s.doctrine!, cooldowns: { tier2: Math.max(0, ready.tier2 - now), tier3: Math.max(0, ready.tier3 - now) } };
    }
    onStatsUpdate({ blue, red });
  }, [economy, onStatsUpdate]);

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
        setTracers(prev => prev.length === 0 ? prev : prev.filter(t => now - t.createdAt < shotFxLifeMs(t)));
        setRailBeams(prev => prev.length === 0 ? prev : prev.filter(b => now - b.createdAt < RAIL_BEAM_MS));

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
              const tickAt = performance.now();
              simClock.lastTickAt = tickAt;
              setUnits(prev => {
                  let moved = false;
                  const next = prev.map(u => {
                      const after = advanceMover(u, MOVE_TICK_MS, moveEnv);
                      if (after !== u) {
                          moved = true;
                          // When this tick put the unit here, for smooth drawing (components/glide.ts).
                          stampPosition(after.id, positionKey(after), tickAt);
                      }
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
          // Volt Cores counting down (sim/voltCore.ts): the warnings follow the ref, which the unit
          // updater arms as mules die.
          if (voltRef.current.size !== voltCharges.current.length) {
              voltCharges.current = [...voltRef.current.values()];
              setVoltWarnings(voltCharges.current);
          }
          // Units in a friendly Smoke Screen are screened this tick (sim/titan.ts): enemy ground
          // fire can't pick them out, and aircraft do half damage.
          if (smokeRef.current.some(s => s.until <= now)) {
              smokeRef.current = pruneSmoke(smokeRef.current, now);
              setSmokeScreens(smokeRef.current);
          }
          const currentUnitsRef = markScreened(unitsRef.current, smokeRef.current, now);
          // The pacing report's bookkeeping (sim/pacing.ts): what changed since the last tick.
          const pacing = pacingRef.current;
          if (pacing) {
              pacingTick(pacing, now - matchStartRef.current, { units: currentUnitsRef, structures: structuresRef.current, buildings: buildingsRef.current, economy: economyRef.current });
          }
          const toGrid = (p: { x: number; z: number }) => ({ x: (p.x + offset) / tileSize, z: (p.z + offset) / tileSize });
          // Heavy Metal force fields up this tick (sim/forcefield.ts): every weapon below checks them.
          const fields = activeFields(currentUnitsRef, now);
          fieldsRef.current = fields;
          // Where a shot is stopped by an enemy dome, for the guns (the dome takes the hit).
          const shieldOf = (team: UnitData['team'], from: { x: number; z: number }, to: { x: number; z: number }) => {
              const b = shotBlockedBy(fields, team, from, to);
              return b ? { fieldId: b.field.id, at: b.at } : null;
          };
          // Everything the domes stop this tick wears down their shields (sim/forcefield.ts).
          const shieldHits = shieldHitsRef.current;
          const absorbHit = (team: UnitData['team'], at: { x: number; z: number }, damage: number, from?: { x: number; z: number }) => {
              const f = absorbingField(fields, team, at, from);
              if (f) addShieldHit(shieldHits, f.id, damage);
          };
          // A ripple on the dome where something was stopped, at a tile position.
          const shieldFlash = (id: string, at: { x: number; z: number }, y = 4) => ({
              id: `shield-${id}`, position: { x: at.x * tileSize - offset, y, z: at.z * tileSize - offset },
              radius: 3, duration: 600, createdAt: now, style: 'shield' as const,
          });

          // Projectiles fly on the game tick (sim/projectiles.ts), not the animation frame.
          if (flightRef.current.size > 0) {
              resolveFlightTick(stepProjectiles(flightRef.current, TICK_RATE, now, {
                  offset, tileSize, gridSize,
                  units: currentUnitsRef,
                  buildings: buildingsRef.current,
                  structures: structuresRef.current,
                  decoys: decoysRef.current,
                  fields,
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
              if (pacing) recordArea(pacing, d.crawlerId, d.blast.team, toGrid(d.blast.position), d.blast.radius / tileSize, currentUnitsRef, structuresRef.current);
              newExplosions.push({
                  id: `exp-crawler-${d.crawlerId}-${now}`,
                  position: d.blast.position,
                  radius: ABILITY_CONFIG.CRAWLER_EXPLOSION_RADIUS,
                  duration: 500,
                  createdAt: now,
              });
          }

          // Bombardment Drones over their target keep dropping until stopped or empty, then fly
          // home to rearm (sim/bombard.ts).
          const bombard = bombardTick(
              currentUnitsRef, now,
              team => (team === 'blue' || team === 'red') ? teamBasesRef.current[team] : [],
              aiHelpersRef.current.findAirPath,
              id => bombardStrikeRef.current.get(id),
          );
          // A drop over an enemy force field is absorbed by its dome.
          const teamOfDrone = (id: string) => currentUnitsRef.find(u => u.id === id)?.team ?? 'neutral';
          bombard.strikes.forEach(s => bombardStrikeRef.current.set(s.droneId, now));
          const strikes = bombard.strikes.map(s => ({ ...s, team: teamOfDrone(s.droneId) })).filter(s => {
              if (!impactAbsorbed(fields, s.team, s.at)) return true;
              absorbHit(s.team, s.at, FORCE_FIELD.absorb.bombard);
              newExplosions.push(shieldFlash(`bomb-${s.droneId}-${now}`, s.at, 20));
              return false;
          });
          if (strikes.length > 0) {
              if (pacing) for (const s of strikes) recordArea(pacing, s.droneId, s.team, s.at, ABILITY_CONFIG.BOMBARD_RADIUS, currentUnitsRef, structuresRef.current);
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
          const wpClouds = cloudsRef.current.filter(c => c.type === 'wp' && now - c.createdAt < c.duration);
          const blackouts = activeBlackouts();

          // Weapons fire for every armed unit, HQ and Sentry Turret (sim/combat.ts). Worked out
          // once here, outside any state updater. lastShotRef is the authority on reloads, since
          // the refs can trail the last render and would otherwise let a unit fire twice.
          const nanoClouds = cloudsRef.current.filter(c => c.type === 'nano' && now - c.createdAt < c.duration);
          const reloaded = <T extends { id: string; lastAttackTime?: number }>(x: T): T => {
              const shot = lastShotRef.current.get(x.id);
              return shot && shot > (x.lastAttackTime || 0) ? { ...x, lastAttackTime: shot } : x;
          };
          const attacks = resolveAttacks(
              currentUnitsRef.map(reloaded),
              structuresRef.current.map(reloaded) as CombatStructure[],
              now,
              pos => isPointInCloud(pos, nanoClouds, 'nano'),
              shieldOf,
          );
          attacks.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
          attacks.fired.forEach((_, id) => lastShotRef.current.set(id, now));

          // Thunderhead batteries (sim/artillery.ts): ready guns fire, and shells whose flight is
          // over come down. Their damage joins this tick's weapons fire.
          const volley = fireArtillery(
              currentUnitsRef.map(reloaded), structuresRef.current, now,
              t => (t === 'blue' || t === 'red') ? artilleryTierOf(economyRef.current[t]) : 1,
              Math.random, () => `shell-${now}-${Math.random().toString(36).slice(2, 8)}`,
          );
          volley.fired.forEach((_, id) => { lastShotRef.current.set(id, now); attacks.fired.set(id, ''); });

          // Tank rail guns (sim/railgun.ts): long-range shots at anything the side can see.
          const railReady = (u: UnitData) => {
              const t = railShotRef.current.get(u.id);
              return t && t > (u.railgunFiredAt ?? -Infinity) ? { ...u, railgunFiredAt: t } : u;
          };
          const rail = fireRailguns(currentUnitsRef.map(railReady), structuresRef.current, now, pos => isPointInCloud(pos, nanoClouds, 'nano'), shieldOf, aiHelpersRef.current.isWalkable);
          if (pacing && rail.pierceHits.length > 0) recordWeaponHits(pacing, { shots: rail.pierceHits }, currentUnitsRef, structuresRef.current);
          rail.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
          const railFired = new Set(rail.shots.map(s => s.attackerId));
          railFired.forEach(id => railShotRef.current.set(id, now));
          rail.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
          rail.structureDamage.forEach((n, id) => attacks.structureDamage.set(id, (attacks.structureDamage.get(id) || 0) + n));
          if (rail.shots.length > 0) setRailBeams(prev => [...prev, ...rail.shots.map((s, i) => ({ ...s, id: `rail-${now}-${i}`, createdAt: now }))]);

          // Hornet anti-vehicle rockets at Tier 3, and Hellfire Salvo rockets coming down (sim/hornet.ts).
          const hornetReady = (u: UnitData) => {
              const t = hornetShotRef.current.get(u.id);
              return t && t > (u.hornetRocketAt ?? -Infinity) ? { ...u, hornetRocketAt: t } : u;
          };
          const hornetVolley = fireHornetRockets(currentUnitsRef.map(hornetReady), structuresRef.current, now, t => (t === 'blue' || t === 'red') && hasUpgrade(economyRef.current[t], 'hunter_rockets'), fields);
          const hornetFired = new Set(hornetVolley.shots.map(s => s.attackerId));
          hornetFired.forEach(id => hornetShotRef.current.set(id, now));
          hornetVolley.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
          hornetVolley.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
          hornetVolley.structureDamage.forEach((n, id) => attacks.structureDamage.set(id, (attacks.structureDamage.get(id) || 0) + n));
          // Kestrel Flechette Bursts alongside their machine guns (sim/kestrel.ts), drawn as a spray of fast rounds.
          const flechetteReady = (u: UnitData) => {
              const t = flechetteShotRef.current.get(u.id);
              return t && t > (u.flechetteAt ?? -Infinity) ? { ...u, flechetteAt: t } : u;
          };
          const flechettes = fireFlechettes(currentUnitsRef.map(flechetteReady), now, team => (team === 'blue' || team === 'red') && hasUpgrade(economyRef.current[team], 'flechette_burst'), fields);
          const flechetteFired = new Set(flechettes.shots.map(s => s.attackerId));
          flechetteFired.forEach(id => flechetteShotRef.current.set(id, now));
          flechettes.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
          flechettes.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
          if (pacing && flechettes.shots.length > 0) recordWeaponHits(pacing, { shots: flechettes.shots }, currentUnitsRef, structuresRef.current);
          // Volt Cores whose countdown is over detonate: a big blue discharge (sim/voltCore.ts).
          const voltDue = dueCharges([...voltRef.current.values()], now);
          if (voltDue.length > 0) {
              const volt = voltBlasts(currentUnitsRef, voltDue);
              volt.damage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
              if (pacing) recordWeaponHits(pacing, { shots: volt.hits }, currentUnitsRef, structuresRef.current);
              for (const c of voltDue) voltRef.current.delete(c.muleId);
              voltCharges.current = [...voltRef.current.values()];
              setVoltWarnings(voltCharges.current);
              setExplosions(prev => [...prev, ...voltDue.map(c => ({
                  id: `volt-${c.muleId}`, style: 'emp' as const, radius: VOLT.radius * tileSize, duration: 900, createdAt: now,
                  position: { x: c.at.x * tileSize - offset, y: 1.5, z: c.at.z * tileSize - offset },
              }))]);
          }
          if (flechettes.shots.length > 0) {
              setTracers(prev => [...prev, ...flechettes.shots.flatMap((s, i) => [-0.35, 0, 0.35].map((spread, j): TracerData => ({
                  id: `flechette-${now}-${i}-${j}`, kind: 'round', createdAt: now, attackerId: s.attackerId, targetId: s.targetId, flashSize: 2.2,
                  from: { x: s.from.x * tileSize - offset, y: 74, z: s.from.z * tileSize - offset },
                  to: { x: (s.to.x + spread) * tileSize - offset, y: 1.4, z: (s.to.z - spread) * tileSize - offset },
              })))]);
          }
          if (hornetVolley.shots.length > 0) setRailBeams(prev => [...prev, ...hornetVolley.shots.map((s, i) => ({ ...s, id: `hrocket-${now}-${i}`, createdAt: now, kind: 'rocket' as const, fromY: 74 }))]);
          if (miniRocketsRef.current.length > 0) {
              const salvo = landSalvo(miniRocketsRef.current, now, currentUnitsRef, structuresRef.current, fields);
              salvo.absorbed.forEach(r => absorbHit(r.team, r.at, FORCE_FIELD.absorb.mini, r.from));
              if (salvo.absorbed.length > 0) setExplosions(prev => [...prev, ...salvo.absorbed.map(r => shieldFlash(`mini-${r.id}`, r.at))]);
              salvo.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
              if (pacing) recordWeaponHits(pacing, { blasts: salvo.landed.map(r => ({ attackerId: r.attackerId, team: r.team, at: r.at, radius: 2 })) }, currentUnitsRef, structuresRef.current);
              salvo.structureDamage.forEach((n, id) => attacks.structureDamage.set(id, (attacks.structureDamage.get(id) || 0) + n));
              if (salvo.landed.length > 0 || salvo.absorbed.length > 0) {
                  miniRocketsRef.current = salvo.flying;
                  setMiniRockets(salvo.flying);
                  setExplosions(prev => [...prev, ...salvo.landed.map(r => ({
                      id: `mini-exp-${r.id}`,
                      position: { x: r.at.x * tileSize - offset, y: 1, z: r.at.z * tileSize - offset },
                      radius: 1.8, duration: 450, createdAt: now,
                  }))]);
              }
          }

          // Aegis rotary cannons (sim/ciws.ts): hose down aircraft, and missiles, shells and drop
          // pods in flight. Ordnance that has taken enough fire is knocked out of the sky.
          const ordnance: AirThreat[] = [];
          for (const live of flightRef.current.values()) {
              const p = live.shot;
              if (live.impacted) continue;
              const kind = p.payload === 'titan_drop' || p.payload === 'cloak_drop' || p.payload === 'field_drop' ? 'pod' : p.trajectory !== 'ballistic' ? null : 'missile';
              if (!kind) continue;
              const pos = p.startPos && p.targetPos && p.trajectory === 'ballistic' ? sampleBallistic(p, now) : p.position;
              ordnance.push({ id: p.id, team: p.team, at: { x: (pos.x + offset) / tileSize, z: (pos.z + offset) / tileSize }, kind });
          }
          for (const s of shellsRef.current) ordnance.push({ id: s.id, team: s.team, at: shellGroundPos(s, now), kind: 'shell' });
          const ciws = ciwsTick(currentUnitsRef, ordnance, now, TICK_RATE, structuresRef.current, fields);
          if (ciws.structureUpdates.size > 0) {
              structuresRef.current = applyCiwsState(structuresRef.current, ciws.structureUpdates);
              setStructuresState(prev => applyCiwsState(prev, ciws.structureUpdates));
          }
          ciwsLinksRef.current = ciws.links;
          if (pacing) {
              recordWeaponHits(pacing, {
                  fired: attacks.fired, shots: [...(attacks.splashed ?? []), ...rail.shots, ...hornetVolley.shots], ciws: ciws.links,
                  beams: heliosBeams(currentUnitsRef),
              }, currentUnitsRef, structuresRef.current);
          }
          // Who is fighting whom, for the minimap's engagement arrows: every direct-fire shot this
          // tick, rail guns, Hornet rockets and the CIWS guns.
          const engage = (attackerId: string, targetId: string) => engagementsRef.current.set(attackerId, { targetId, at: now });
          attacks.shots.forEach(s => engage(s.attackerId, s.targetId));
          attacks.aiming.forEach((targetId, attackerId) => { if (targetId) engage(attackerId, targetId); });
          rail.shots.forEach(s => engage(s.attackerId, s.targetId));
          hornetVolley.shots.forEach(s => engage(s.attackerId, s.targetId));
          ciws.links.forEach(l => { if (!l.ordnance) engage(l.gunId, l.targetId); });
          ciws.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
          if (ciws.ordnanceDamage.size > 0) {
              const downed: AirThreat[] = [];
              ciws.ordnanceDamage.forEach((n, id) => {
                  const taken = (ordnanceHitsRef.current.get(id) || 0) + n;
                  ordnanceHitsRef.current.set(id, taken);
                  const o = ordnance.find(x => x.id === id)!;
                  if (taken >= ORDNANCE_INTEGRITY[o.kind]) downed.push(o);
              });
              if (downed.length > 0) {
                  const gone = new Set(downed.map(o => o.id));
                  for (const id of gone) {
                      const live = flightRef.current.get(id);
                      if (live) live.impacted = true;
                      ordnanceHitsRef.current.delete(id);
                  }
                  setProjectiles(prev => prev.some(p => gone.has(p.id)) ? prev.filter(p => !gone.has(p.id)) : prev);
                  if (shellsRef.current.some(s => gone.has(s.id))) {
                      shellsRef.current = shellsRef.current.filter(s => !gone.has(s.id));
                      setShells(shellsRef.current);
                  }
                  // A burst of flame in the air where each one came apart.
                  setExplosions(prev => [...prev, ...downed.map(o => ({
                      id: `intercept-${o.id}`,
                      position: { ...airThreatWorld(o.id, unitsRef.current, flightRef.current, shellsRef.current, tileSize, offset, now) ?? { x: o.at.x * tileSize - offset, y: 40, z: o.at.z * tileSize - offset } },
                      radius: o.kind === 'shell' ? 2 : 4, duration: 600, createdAt: now,
                  }))]);
                  const missiles = downed.filter(o => o.kind !== 'shell');
                  if (missiles.length > 0) {
                      const ours = missiles.some(o => o.team === playerTeam);
                      onNoticeRef.current?.(ours ? 'Your missile was shot down by enemy air defence' : 'Aegis intercepted an incoming missile', ours ? 'warn' : undefined);
                  }
              }
          }
          if (volley.shells.length > 0 || shellsRef.current.length > 0) {
              const impact = landShells([...shellsRef.current, ...volley.shells], now, currentUnitsRef, structuresRef.current, fields);
              impact.absorbed.forEach(s => absorbHit(s.team, s.at, FORCE_FIELD.absorb.shell, s.from));
              if (impact.absorbed.length > 0) setExplosions(prev => [...prev, ...impact.absorbed.map(s => shieldFlash(`shell-${s.id}`, s.at, 8))]);
              impact.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
              if (pacing) recordWeaponHits(pacing, { blasts: impact.landed.map(s => ({ attackerId: s.attackerId, team: s.team, at: s.at, radius: 2 })) }, currentUnitsRef, structuresRef.current);
              impact.structureDamage.forEach((n, id) => attacks.structureDamage.set(id, (attacks.structureDamage.get(id) || 0) + n));
              if (impact.landed.length > 0) {
                  setExplosions(prev => [...prev, ...impact.landed.map(s => ({
                      id: `shell-exp-${s.id}`,
                      position: { x: (s.at.x * CITY_CONFIG.tileSize) - offset, y: 1.5, z: (s.at.z * CITY_CONFIG.tileSize) - offset },
                      radius: 3.5, duration: 700, createdAt: now,
                  }))]);
              }
              if (volley.shells.length > 0 || impact.landed.length > 0 || impact.absorbed.length > 0) {
                  shellsRef.current = impact.flying;
                  setShells(impact.flying);
              }
          }
          // Lancer EMP rockets (sim/empRocket.ts): step them, and the ones that arrive go off.
          if (rocketsRef.current.length > 0) {
              const flight = empRocketTick(rocketsRef.current, currentUnitsRef, now, TICK_RATE);
              rocketsRef.current = flight.flying;
              setRockets(flight.flying);
              // A rocket fired from outside an enemy force field is stopped on its dome; one that
              // goes off outside doesn't reach in.
              const absorbedRockets = flight.detonated.filter(({ rocket, at }) => impactAbsorbed(fields, rocket.team, at, rocket.from));
              absorbedRockets.forEach(({ rocket, at }) => absorbHit(rocket.team, at, FORCE_FIELD.absorb.empRocket, rocket.from));
              if (absorbedRockets.length > 0) setExplosions(prev => [...prev, ...absorbedRockets.map(({ rocket, at }) => shieldFlash(`rocket-${rocket.id}`, at, 10))]);
              flight.detonated = flight.detonated.filter(d => !absorbedRockets.includes(d));
              if (flight.detonated.length > 0) {
                  const pulse = new Map<string, (u: UnitData) => UnitData>();
                  for (const { rocket, at } of flight.detonated) {
                      const hits = empRocketImpact(unitsRef.current, at, rocket.team, now);
                      for (const id of [...hits.keys()]) {
                          const victim = unitsRef.current.find(u => u.id === id);
                          if (victim && shotBlocked(fields, rocket.team, at, victim.gridPos)) hits.delete(id);
                      }
                      mergeUnitUpdates(pulse, hits);
                  }
                  if (pulse.size > 0) {
                      const hit = (list: UnitData[]) => list.map(u => pulse.get(u.id)?.(u) ?? u);
                      unitsRef.current = hit(unitsRef.current);
                      setUnits(hit);
                  }
                  setExplosions(prev => [...prev, ...flight.detonated.map(({ rocket, at }) => {
                      const target = rocket.targetUnitId ? unitsRef.current.find(u => u.id === rocket.targetUnitId) : undefined;
                      return {
                          id: `rocket-exp-${rocket.id}`,
                          position: { x: at.x * tileSize - offset, y: target ? flightUnitY(target) : 1.5, z: at.z * tileSize - offset },
                          radius: EMP_ROCKET.radius * tileSize, duration: 1100, createdAt: now, style: 'emp' as const,
                      };
                  })]);
              }
          }
          // Banshee jamming (sim/jamming.ts): enemy drones inside an active jammer lose their link
          // and take no new orders until they are out of it; hardlined drones are immune.
          {
              const jam = jammingUpdates(unitsRef.current);
              if (jam.size > 0) {
                  const apply = (list: UnitData[]) => list.map(u => jam.get(u.id)?.(u) ?? u);
                  unitsRef.current = apply(unitsRef.current);
                  setUnits(apply);
              }
          }
          // Black Wall virus (sim/blackwall.ts): bombs that land infect the enemies under them; the
          // infected burn and pass it to friends who linger next to them.
          {
              const landed = virusBombsRef.current.filter(b => b.landAt <= now);
              const virus = blackwallTick(unitsRef.current, TICK_RATE, now);
              if (landed.length > 0) {
                  virusBombsRef.current = virusBombsRef.current.filter(b => b.landAt > now);
                  setVirusBombs(virusBombsRef.current);
                  // A bomb coming down on an enemy force field is absorbed by the dome.
                  const absorbedBombs = landed.filter(b => impactAbsorbed(fields, b.team, b.at));
                  const struck = landed.filter(b => !absorbedBombs.includes(b));
                  absorbedBombs.forEach(b => absorbHit(b.team, b.at, FORCE_FIELD.absorb.virus));
                  if (absorbedBombs.length > 0) setExplosions(prev => [...prev, ...absorbedBombs.map(b => shieldFlash(`virus-${b.id}`, b.at, 20))]);
                  for (const b of struck) {
                      const hits = blackwallImpact(unitsRef.current, b.at, b.team, now);
                      for (const id of [...hits.keys()]) {
                          const victim = unitsRef.current.find(u => u.id === id);
                          if (victim && shotBlocked(fields, b.team, b.at, victim.gridPos)) hits.delete(id);
                      }
                      mergeUnitUpdates(virus, hits);
                  }
                  setExplosions(prev => [...prev, ...struck.map(b => ({
                      id: `virus-exp-${b.id}`,
                      position: { x: b.at.x * tileSize - offset, y: 0.5, z: b.at.z * tileSize - offset },
                      radius: BLACKWALL.radius * tileSize, duration: 1600, createdAt: now, style: 'blackwall' as const,
                  }))]);
              }
              if (virus.size > 0) {
                  const infect = (list: UnitData[]) => list.map(u => virus.get(u.id)?.(u) ?? u);
                  unitsRef.current = infect(unitsRef.current);
                  setUnits(infect);
              }
          }
          if (attacks.shots.length > 0) {
              // What each shot looks like: rifles and flak only flash at the muzzle; Lancers fire
              // a small missile, cannons a shell, AP guns a fast round. Sentinels draw their own laser.
              const fx: TracerData[] = [];
              attacks.shots.forEach((shot, i) => {
                  const shooter = currentUnitsRef.find(u => u.id === shot.attackerId);
                  if (shooter?.type === 'defense_drone') return;
                  const structure = !shooter;
                  const infantry = shooter ? UNIT_RULES[shooter.type].armor === 'infantry' : false;
                  const kind: ShotKind = shot.type === 'rifle' || shot.type === 'flak' || shot.type === 'mg' ? 'flash'
                      : shot.type === 'ap' ? (shooter?.type === 'lancer' ? 'missile' : 'round')
                      : 'shell';
                  const targetIsStructure = !currentUnitsRef.some(u => u.id === shot.targetId);
                  fx.push({
                      id: `shot-${now}-${i}`, kind, createdAt: now,
                      attackerId: shot.attackerId, targetId: shot.targetId,
                      from: { x: shot.from.x * tileSize - offset, y: shot.fromAir ? 74 : structure ? 4 : infantry ? 1.6 : 2.4, z: shot.from.z * tileSize - offset },
                      to: { x: shot.to.x * tileSize - offset, y: shot.toAir ? 75 : targetIsStructure ? 3 : 1.4, z: shot.to.z * tileSize - offset },
                      flashSize: structure ? 3.5 : shot.fromAir ? 2.6 : infantry ? 1.6 : 2.6,
                  });
              });
              if (fx.length > 0) setTracers(prev => [...prev, ...fx]);
          }
          if (attacks.structureDamage.size > 0 || [...attacks.fired.keys(), ...attacks.aiming.keys()].some(id => structuresRef.current.some(st => st.id === id))) {
              const applyFire = (list: StructureData[]) => applyStructureCombat(list, attacks, now);
              structuresRef.current = applyFire(structuresRef.current);
              setStructuresState(applyFire);
          }

          // Infantry capture buildings and core nodes (sim/capture.ts).
          setBuildings(prev => captureTick(prev, unitsRef.current));

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

          // Advanced Research (sim/upgrades.ts), same pattern as the fabs.
          const labTick = advanceResearch(structuresRef.current, team => productionStep(team === 'blue' || team === 'red' ? aiHelpersRef.current.doctrines?.[team]?.selected : null));
          if (labTick.updates.size > 0) {
              structuresRef.current = applyResearch(structuresRef.current, labTick);
              setStructuresState(prev => applyResearch(prev, labTick));
          }
          if (labTick.finished.length > 0) {
              setEconomy(prev => addUpgrades(prev, labTick.finished));
              for (const done of labTick.finished) {
                  if (done.team === playerTeam) { const def = upgradeDef(done.upgrade); onNotice?.(`Research complete: ${def ? upgradeTitle(def) : done.upgrade}`); }
              }
          }

          // Core Refinery upgrades to level 2 (sim/refinery.ts).
          const refits = advanceRefineryUpgrades(structuresRef.current, team => productionStep(team === 'blue' || team === 'red' ? aiHelpersRef.current.doctrines?.[team]?.selected : null));
          if (refits.structures !== structuresRef.current) {
              const now2 = new Map(refits.structures.filter(s => s.type === 'refinery').map(s => [s.id, s]));
              structuresRef.current = refits.structures;
              setStructuresState(prev => prev.map(s => {
                  const r = now2.get(s.id);
                  return r ? { ...s, refineryLevel: r.refineryLevel, refineryUpgrade: r.refineryUpgrade } : s;
              }));
              if (refits.finished.some(s => s.team === playerTeam)) onNotice?.(`Core Refinery upgraded to level 2: +${REFINERY.flat[2]} cores/s`);
          }

          // Buildings being taken down (sim/dismantle.ts): gone when done, with their refund.
          const teardown = advanceDismantling(structuresRef.current, productionStep(null));
          if (teardown.structures !== structuresRef.current) {
              const remaining = new Map(teardown.structures.map(s => [s.id, s]));
              structuresRef.current = teardown.structures;
              setStructuresState(prev => prev.filter(s => remaining.has(s.id)).map(s => {
                  const d = remaining.get(s.id)!;
                  return d.dismantle !== s.dismantle ? { ...s, dismantle: d.dismantle } : s;
              }));
              if (teardown.done.length > 0) {
                  setEconomy(prev => teardown.done.reduce((e, d) => refund(e, d.team, d.refund), prev));
                  for (const d of teardown.done) if (d.team === playerTeam) onNotice?.(`${STRUCTURE_INFO[d.type].label} disassembled: +${d.refund} cores`);
              }
          }

          // Construction and training queues (sim/production.ts), same pattern as the fabs.
          const build = advanceProduction(structuresRef.current, team => aiHelpersRef.current.doctrines?.[team]?.selected);
          if (build.updates.size > 0) {
              structuresRef.current = applyProduction(structuresRef.current, build);
              setStructuresState(prev => applyProduction(prev, build));
          }
          for (const done of build.completed) {
              if (done.team === playerTeam) onNoticeRef.current?.(`${STRUCTURE_INFO[done.type].label} complete`);
          }
          if (build.trained.length > 0) {
              const { findPath, isWalkable } = aiHelpersRef.current;
              const taken = new Set(unitsRef.current.map(u => `${u.gridPos.x},${u.gridPos.z}`));
              const born = build.trained.map(({ structure, unitType }, i) => {
                  const at = structure.gridPos;
                  // First free road tile around the structure, widening the ring if crowded.
                  let spawn = { ...at };
                  search: for (let r = 1; r <= 3; r++) {
                      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
                          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                          const k = `${at.x + dx},${at.z + dz}`;
                          if (isWalkable(at.x + dx, at.z + dz) && !taken.has(k)) { spawn = { x: at.x + dx, z: at.z + dz }; break search; }
                      }
                  }
                  taken.add(`${spawn.x},${spawn.z}`);
                  const unit = createUnit(unitType, structure.team, `u-${structure.team}-${now}-${i}`, spawn);
                  const rally = structure.rallyPoint;
                  if (rally) unit.path = isAirType(unitType) ? aiHelpersRef.current.findAirPath(spawn, rally) : findPath(spawn, rally);
                  return unit;
              });
              born.forEach(u => { if (u.team === 'blue' || u.team === 'red') tallyRef.current[u.team].trained++; });
              unitsRef.current = [...unitsRef.current, ...born];
              setUnits(prev => [...prev, ...born]);
          }
          // Researched upgrades add health and damage to their units, new ones included (sim/upgrades.ts).
          setUnits(prev => applyUpgradeBonuses(prev, economyRef.current));

          // Force field shields (sim/forcefield.ts): this tick's hits wear them down, a shield
          // battered to nothing collapses for its reboot, and a rebooted one comes back up.
          const shieldUpdates = shieldTick(currentUnitsRef, now, shieldHits);
          shieldUpdates.forEach((update, id) => {
              const before = currentUnitsRef.find(u => u.id === id);
              const after = before && update(before);
              if (!before || !after || before.team !== playerTeam) return;
              if (after.fieldDownUntil !== undefined && before.fieldDownUntil === undefined) onNoticeRef.current?.(`Force field down: rebooting for ${FORCE_FIELD.rebootMs / 1000}s`, 'warn');
              else if (after.fieldDownUntil === undefined && before.fieldDownUntil !== undefined) onNoticeRef.current?.('Force field back up');
          });
          shieldHitsRef.current = new Map();

          // This used to run inside a setStructuresState updater. React runs updaters twice in
          // development, so the whole unit tick (damage, battery, charging) ran twice per tick.
          setUnits(prevUnits => {
                  let unitsChanged = false;
                  // Who charges whom this tick (sim/energy.ts).
                  const power = chargeSources(prevUnits);

                  // Courier Delivery Events to be processed after map
                  const deliveries: Delivery[] = [];

                  const damageMap = blastDamage(prevUnits, damageEvents, tileSize, offset, { hitsCloaked: true }, fieldsRef.current);
                  attacks.unitDamage.forEach((amount, id) => damageMap.set(id, (damageMap.get(id) || 0) + amount));
                  heCloudDamage(prevUnits, burningClouds).forEach((amount, id) => damageMap.set(id, (damageMap.get(id) || 0) + amount));
                  // White Phosphorus gas burns the enemy infantry inside it (sim/warheads.ts).
                  wpGasDamage(prevUnits, wpClouds, now, TICK_RATE).forEach((amount, id) => damageMap.set(id, (damageMap.get(id) || 0) + amount));

                  let activeUnits = prevUnits.filter(u => u.health > 0);
                  if (prevUnits.length !== activeUnits.length) unitsChanged = true;

                  // Remove exploded crawlers
                  if (explodedCrawlerIds.size > 0) {
                      const beforeCount = activeUnits.length;
                      activeUnits = activeUnits.filter(u => !explodedCrawlerIds.has(u.id));
                      if (activeUnits.length !== beforeCount) unitsChanged = true;
                  }

                  // Guardians and the base block are the only healing (sim/support.ts).
                  const repair = repairTick(activeUnits, TICK_RATE, teamBasesRef.current, team => (team === 'blue' || team === 'red') ? doctrines?.[team]?.selected : null, team => economyRef.current[team].tier, now);

                  const chargers = activeUnits.filter(u => u.type === 'helios');
                  
                  // Clouds for visual obscuration logic (Charging & Targeting)
                  const activeClouds = cloudsRef.current.filter(c => c.type === 'nano');

                  const bombardDamage = bombardUnitDamage(activeUnits, strikes, fields);
                  // Enemies standing inside a force field are shocked; spent generators burn out.
                  const shock = shockDamage(activeUnits, fields, TICK_RATE);
                  // Helios in Microwave mode cook the enemies around them (sim/helios.ts).
                  microwaveDamage(activeUnits, TICK_RATE, fields).forEach((amount, id) => shock.set(id, (shock.get(id) || 0) + amount));
                  let nextUnits = activeUnits.map(u => {
                      let newUnit = { ...u };
                      let uChanged = false;

                      const bombardHit = bombardDamage.get(u.id) || 0;
                      if (bombardHit > 0) {
                          newUnit.health = u.health - bombardHit;
                          uChanged = true;
                      }
                      const shocked = shock.get(u.id) || 0;
                      if (shocked > 0) {
                          newUnit.health = newUnit.health - shocked;
                          newUnit.lastDamageTime = now;
                          uChanged = true;
                      }
                      const shieldUpdate = shieldUpdates.get(u.id);
                      if (shieldUpdate) {
                          newUnit = shieldUpdate(newUnit);
                          uChanged = true;
                      }
                      const bombardUpdate = bombard.updates.get(u.id);
                      if (bombardUpdate) {
                          newUnit = bombardUpdate(newUnit);
                          uChanged = true;
                      }

                      // What this unit is shooting at. Attack-move holds while it has a target, and
                      // the Sentinel draws its laser beam to it (Unit.tsx).
                      if (attacks.aiming.has(u.id)) {
                          const aim = attacks.aiming.get(u.id) ?? null;
                          if ((u.combatTargetId ?? null) !== aim) {
                              newUnit.combatTargetId = aim;
                              uChanged = true;
                          }
                          if (u.type === 'defense_drone' && (u.firingLaserAt ?? null) !== aim) {
                              newUnit.firingLaserAt = aim;
                              uChanged = true;
                          }
                      } else if (u.combatTargetId) {
                          newUnit.combatTargetId = null;
                          uChanged = true;
                      }
                      if (volley.fired.has(u.id)) newUnit.artilleryAim = volley.fired.get(u.id);
                      if (railFired.has(u.id)) { newUnit = afterRailShot(newUnit, now); uChanged = true; }
                      if (hornetFired.has(u.id)) { newUnit.hornetRocketAt = now; uChanged = true; }
                      if (flechetteFired.has(u.id)) { newUnit.flechetteAt = now; uChanged = true; }
                      const gun = ciws.updates.get(u.id);
                      if (gun) { newUnit = { ...newUnit, ...gun }; uChanged = true; }
                      if (attacks.fired.has(u.id)) {
                          newUnit.lastAttackTime = now;
                          // A fired Overcharged Warhead is spent.
                          if (hasBuff(newUnit, 'overcharge')) newUnit.buffs = newUnit.buffs!.filter(b => b.kind !== 'overcharge');
                          uChanged = true;
                      }
                      // Ability buffs run out (sim/unitAbilities.ts).
                      if (u.buffs?.length) {
                          const pruned = pruneBuffs(newUnit, now);
                          if (pruned !== newUnit) { newUnit = pruned; uChanged = true; }
                      }
                      
                      const courier = courierStep(u, newUnit, activeUnits, structuresRef.current, findPath);
                      if (courier.changed) uChanged = true;
                      if (courier.delivery) deliveries.push(courier.delivery);
                      // Drones fly: their surveillance and leash routes ignore the streets.
                      if (surveillanceStep(newUnit, Date.now(), aiHelpersRef.current.findAirPath)) uChanged = true;

                      // Apply accumulated damage
                      const dmg = damageMap.get(u.id) || 0;
                      if (dmg > 0) {
                          // A Kestrel's Regenerative Shield soaks hits first (sim/kestrel.ts).
                          Object.assign(newUnit, shieldedHit(newUnit, dmg));
                          newUnit.lastDamageTime = now;
                          uChanged = true;
                      }
                      if (newUnit.type === 'attack_drone' && (newUnit.team === 'blue' || newUnit.team === 'red')) {
                          const recharged = regenerateShield(newUnit, now, TICK_RATE, hasUpgrade(economyRef.current[newUnit.team], 'regen_shield'));
                          if (recharged !== newUnit) { newUnit = recharged; uChanged = true; }
                      }

                      const repairHeal = repair.heal.get(u.id) || 0;
                      if (repairHeal > 0 && newUnit.health > 0 && newUnit.health < newUnit.maxHealth) {
                          newUnit.health = Math.min(newUnit.maxHealth, newUnit.health + repairHeal);
                          uChanged = true;
                      }

                      if (newUnit.type === 'guardian') {
                          const ids = repair.assignments.get(u.id) || [];
                          const prevIds = u.repairTargetIds || [];
                          if (ids.length !== prevIds.length || ids.some((id, index) => prevIds[index] !== id)) {
                              newUnit.repairTargetIds = ids;
                              newUnit.repairTargetId = ids[0] ?? null;
                              uChanged = true;
                          }
                      }

                      // If dead from damage, handled by filter later, but we update ref
                      if (newUnit.health <= 0) return newUnit;

                      if (leashStep(u, newUnit, power.tetherHosts.get(u.id), isAirType(u.type) ? aiHelpersRef.current.findAirPath : findPath)) uChanged = true;
                      if (fabricationStep(u, newUnit, aiHelpersRef.current.doctrines?.[u.team as 'blue' | 'red']?.selected)) uChanged = true;
                      if (ballistaLoadStep(u, newUnit, TICK_RATE)) uChanged = true;
                      // Battery drain and charging (sim/energy.ts).
                      if (powerTick(u, newUnit, {
                          units: activeUnits,
                          sources: power,
                          onGrid: isInsideEnergyGrid(u.gridPos, u.team, buildingsRef.current, teamBasesRef.current.blue, teamBasesRef.current.red, blackouts),
                          inNanoCloud: isPointInCloud(u.gridPos, activeClouds, 'nano'),
                          helios: chargers,
                      })) uChanged = true;

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
                  
                  // A Battery Mule with the Volt Core goes critical where it dies (sim/voltCore.ts).
                  // Keyed by mule, so a second run of this updater changes nothing.
                  for (const c of armMules(nextUnits, team => hasUpgrade(economyRef.current[team], 'volt_core'), now)) {
                      if (!voltRef.current.has(c.muleId)) voltRef.current.set(c.muleId, c);
                  }
                  // Cloaking Fields (sim/cloak.ts): who is hidden after this tick's fire.
                  const living = nextUnits.filter(u => u.health > 0);
                  const finalUnits = applyFieldCloak(living, fieldCloakedIds(living, now));

                  // Identity check. Every changed unit is a new object, so there is no need to
                  // serialise the whole army to text twice a tick to find out.
                  if (unitsChanged || finalUnits.length !== prevUnits.length || finalUnits.some((u, i) => u !== prevUnits[i])) return finalUnits;
                  return prevUnits;
          });
      }, TICK_RATE);
      return () => clearInterval(timer);
  }, [findPath]);

  const hasMason = useMemo(() => units.some(u => u.type === 'mason' && u.team === playerTeam), [units, playerTeam]);

  // Each moving unit's route line, kept until the unit reaches a new tile or gets a new route.
  // Rebuilt every tick, every line re-made its geometry on every tick, for every unit on the move.
  const moveLineCache = useRef(new Map<string, { path: string[]; gx: number; gz: number; data: MovePathData }>());
  const movingUnitsData = useMemo(() => {
    const cache = moveLineCache.current;
    const live = new Set<string>();
    const out = units
        .filter(u => u.team === playerTeam && u.path.length > 0)
        .map(u => {
             live.add(u.id);
             const hit = cache.get(u.id);
             if (hit && hit.path === u.path && hit.gx === u.gridPos.x && hit.gz === u.gridPos.z) return hit.data;
             const destKey = u.path[u.path.length - 1];
             const [dx, dz] = destKey.split(',').map(Number);
             const points: THREE.Vector3[] = [];
             points.push(new THREE.Vector3((u.gridPos.x * tileSize) - offset, 2, (u.gridPos.z * tileSize) - offset));
             u.path.forEach(p => { const [px, pz] = p.split(',').map(Number); points.push(new THREE.Vector3((px * tileSize) - offset, 2, (pz * tileSize) - offset)); });
             const data = { id: u.id, destination: { x: dx, z: dz }, pathPoints: points };
             cache.set(u.id, { path: u.path, gx: u.gridPos.x, gz: u.gridPos.z, data });
             return data;
        });
    for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
    return out;
  }, [units, playerTeam, tileSize, offset]);

  // One element per route line, made once per line's data: reused as-is while a unit walks a tile.
  const movePathElementCache = useRef(new WeakMap<MovePathData, React.ReactElement>());
  const movePathElements = movingUnitsData.map(data => {
      let el = movePathElementCache.current.get(data);
      if (!el) {
          el = <MovePath key={`move-viz-${data.id}`} data={data} tileSize={tileSize} offset={offset} />;
          movePathElementCache.current.set(data, el);
      }
      return el;
  });

  // Primary Action Menu Visibility
  // If multiple units are selected, only show menu for the first one for now (or improve to group commands later)
  const primarySelectionId = selectedUnitIds.size > 0 ? Array.from(selectedUnitIds)[0] : null;
  // Each unit's <Unit> element from the last render, reused while nothing it shows has changed.
  // The map re-renders on every game tick; building a fresh element (some eighty props) for every
  // unit each time, only for Unit's memo to throw most of them away, was a large part of a tick's work.
  const unitElementCache = useRef(new Map<string, { u: UnitData; deps: unknown[]; el: React.ReactElement }>());
  const liveUnitIds = new Set<string>();
  const pruneUnitElements = (elements: React.ReactElement[]) => {
      for (const id of unitElementCache.current.keys()) if (!liveUnitIds.has(id)) unitElementCache.current.delete(id);
      return elements;
  };
  const tetherTargetingSource = targetingAbility === 'TETHER' && targetingSourceId
      ? units.find(src => src.id === targetingSourceId)
      : undefined;
  // Lancers about to lock on, and how far they reach: enemies they could lock get a marker.
  const lockRange = abilityDef('emp_rocket')?.targeted?.range ?? 0;
  const lockSource = targetingAbility === LOCK_ON ? units.find(src => src.id === targetingSourceId) : undefined;
  const lockers = lockSource ? units.filter(l => l.type === lockSource.type && l.health > 0 && (l.id === lockSource.id || selectedUnitIds.has(l.id))) : [];
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
    <group ref={mapRootRef}>
        <GroundPointer handlersRef={groundHandlersRef} />
        {/* Solid Ground Plane */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.1, 0]} 
          receiveShadow 
          onContextMenu={handleBgRightClick}
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

        {/* The Blackwall sealing the city in, and the waste ground beyond it. */}
        <BlackWall gridSize={gridSize} tileSize={tileSize} />
        <Landmarks landmarks={landmarks} tileSize={tileSize} offset={offset} />
        <CorpoPlaza center={plazaCenter} tileSize={tileSize} offset={offset} getUnits={getUnitsForScenery} />

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
            bases={teamBases[playerTeam === 'red' ? 'red' : 'blue']}
            tileSize={tileSize}
            offset={offset}
        />
        {/* A levelled city block's rubble is cleared away (sim/bases.ts). */}
        {buildingElements}
        {/* Free building pads and turret corners: click the + to build there. */}
        {(
            <BuildPads
                pads={freePads}
                hidden={!!placementMode || spectating}
                tileSize={tileSize}
                offset={offset}
                teamColor={TEAM_COLORS[playerTeam]}
                openKey={padMenuKey}
                onToggle={key => { setPadMenuKey(k => k === key ? null : key); setBaseMenuOpen(null); setDepotMenuOpenId(null); }}
                cores={economy[playerTeam === 'red' ? 'red' : 'blue'].cores}
                hasDepot={structuresState.some(s => s.team === playerTeam && s.type === 'builder' && isOperational(s))}
                hasMason={hasMason}
                refineryRoom={playerTeam === 'blue' || playerTeam === 'red' ? refineryLimit(structuresState, playerTeam) - refineriesOf(structuresState, playerTeam).length : 0}
                onBuild={(type, at) => {
                    // Masons pick up new turret blueprints on their own (the Mason loop).
                    if (dispatchOrder({ type: 'PLACE_STRUCTURE', structureType: type, at })) setPadMenuKey(null);
                }}
            />
        )}
        {sites.map(site => (
            <BaseSiteMarker
                key={site.id}
                site={site}
                tileSize={tileSize}
                offset={offset}
                open={siteMenuId === site.id}
                refinery={baseProximity(site.at, coreNodeTiles)}
                onToggle={() => setSiteMenuId(id => id === site.id ? null : site.id)}
                cores={economy[playerTeam === 'red' ? 'red' : 'blue'].cores}
                compute={economy[playerTeam === 'red' ? 'red' : 'blue'].compute}
                onBuild={() => {
                    if (dispatchOrder({ type: 'BUILD_BASE', at: site.at })) {
                        setSiteMenuId(null);
                        onNotice?.(`Command base under construction: ready in ${BASE_SITE.buildMs / 1000}s`);
                    }
                }}
            />
        ))}
        {structuresState.filter(s => s.type !== 'hq').map(s => ( 
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
                tier={supply.tier}
                popUsed={supply.used}
                popCap={supply.cap}
                upgrades={s.type === 'research_lab' ? playerUpgrades : undefined}
                compute={s.type === 'research_lab' && (playerTeam === 'blue' || playerTeam === 'red') ? economy[playerTeam].compute : undefined}
                upgradesUnderway={s.type === 'research_lab' ? upgradesUnderway : undefined}
                income={s.type === 'refinery' && depotMenuOpenId === s.id && s.team === playerTeam ? incomeBreakdown(buildings, playerTeam, structuresState) : undefined}
                refineryShare={s.type === 'refinery' && depotMenuOpenId === s.id ? refineryMultiplier(s, structuresState, coreNodeTiles) : undefined}
            /> 
        ))}
        {/* Only a fully held block shows a status; the rest drew nothing but still re-rendered every tick. */}
        {blocks.filter(block => block.owner).map(block => (
            <BlockStatus key={block.id} block={block} buildings={buildings} />
        ))}
        {pruneUnitElements(units.map(u => {
             const isVisible = visibleUnitIds.has(u.id);
             const isLockCandidate = lockers.length > 0 && isVisible && u.team !== playerTeam && isEmpTarget(u)
                 && lockers.some(l => Math.hypot(l.gridPos.x - u.gridPos.x, l.gridPos.z - u.gridPos.z) <= lockRange);
             const atOrdnanceFab = structuresState.some(s => s.type === 'ordnance_fab' && s.team === u.team && !s.isBlueprint && Math.hypot(s.gridPos.x - u.gridPos.x, s.gridPos.z - u.gridPos.z) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE);
             const ballistaInRange = u.type === 'mule' && units.some(b => b.type === 'ballista' && b.team === u.team && b.health > 0 && Math.hypot(b.gridPos.x - u.gridPos.x, b.gridPos.z - u.gridPos.z) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE);
             // Cores matter only in an open menu: given to every unit, the income tick re-rendered them all.
             const menuOpen = primarySelectionId === u.id && (!targetingSourceId || targetingSourceId === u.id);
             const teamCompute = (u.team === 'blue' || u.team === 'red') ? economy[u.team].tier : 0;
             const upgrades = (u.team === 'blue' || u.team === 'red') ? economy[u.team].upgrades : undefined;
             const radarRange = u.team === playerTeam ? radarRangeOf(u) : 0;
             const ownJammer = u.type === 'banshee' && u.team === playerTeam;
             const selected = selectedUnitIds.has(u.id);
             const isTargetingMode = !!targetingSourceId;
             const showTetherRange = u.type === 'banshee' && ((u.tetherTargetIds?.length ?? 0) > 0 || (targetingSourceId === u.id && targetingAbility === 'TETHER'));
             const showBatteryRange = u.type === 'sun_plate' && (selectedUnitIds.has(u.id) || (targetingSourceId === u.id && targetingAbility === 'BATTERY_TETHER'));
             const isTetherCandidate = targetingAbility === 'TETHER' && !!tetherTargetingSource && isTetherableDrone(u) && u.team === tetherTargetingSource.team && u.id !== tetherTargetingSource.id;
             const isBatteryLinkCandidate = !!batteryTargetingSource && isBatteryLinkable(u) && u.team === batteryTargetingSource.team && Math.hypot(u.gridPos.x - batteryTargetingSource.gridPos.x, u.gridPos.z - batteryTargetingSource.gridPos.z) <= ABILITY_CONFIG.BATTERY_MULE_RANGE;
             const warheadStock = u.team === playerTeam && (playerTeam === 'blue' || playerTeam === 'red') ? stockpile[playerTeam] : undefined;
             const cores = menuOpen && (u.team === 'blue' || u.team === 'red') ? teamResources[u.team] : 0;
             const deps = [teamCompute, upgrades, radarRange, ownJammer, selected, isVisible, menuOpen, isTargetingMode, showTetherRange, showBatteryRange, isLockCandidate, isTetherCandidate, isBatteryLinkCandidate, warheadStock, atOrdnanceFab, ballistaInRange, cores];
             // The same element as last render when nothing it shows changed (see unitElementCache).
             const hit = unitElementCache.current.get(u.id);
             if (hit && sameUnitForRender(hit.u, u) && hit.deps.every((d, i) => d === deps[i])) { liveUnitIds.add(u.id); return hit.el; }
             // Motion (moveProgress and friends) goes through the motion registry, not props, and the
             // battery to whole points: both change every tick, and either re-rendered every moving unit.
             const el = ( <Unit key={u.id} {...u} moveProgress={undefined} moveTarget={undefined} moveSpeed={undefined} battery={Math.round(u.battery)} teamCompute={teamCompute} upgrades={upgrades} radarRange={radarRange} ownJammer={ownJammer} isSelected={selected} onSelect={stableUnitSelect} tileSize={CITY_CONFIG.tileSize} offset={offset} onDoubleClick={stableDoubleClick} visible={isVisible} actionMenuOpen={menuOpen} onAction={stableUnitAction} isTargetingMode={isTargetingMode} showTetherRange={showTetherRange} showBatteryRange={showBatteryRange} isLockCandidate={isLockCandidate} isTetherCandidate={isTetherCandidate} isBatteryLinkCandidate={isBatteryLinkCandidate} warheadStock={warheadStock} atOrdnanceFab={atOrdnanceFab} ballistaInRange={ballistaInRange} cores={cores} /> );
             unitElementCache.current.set(u.id, { u, deps, el });
             liveUnitIds.add(u.id);
             return el;
        }))}
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
        
        {/* Aegis rotary cannon fire */}
        <CiwsTracers linksRef={ciwsLinksRef} unitsRef={unitsRef} flightRef={flightRef} shellsRef={shellsRef} structuresRef={structuresRef} canSee={canSeeGun} tileSize={tileSize} offset={offset} />

        {/* Aegis radar contacts: dots for enemy aircraft and ordnance nothing can see */}
        {(playerTeam === 'blue' || playerTeam === 'red') && (
            <RadarBlips team={playerTeam} unitsRef={unitsRef} visibleRef={visibleUnitIdsRef} flightRef={flightRef} shellsRef={shellsRef} tileSize={tileSize} offset={offset} />
        )}

        {/* Thunderhead shells, and the fire missions of selected batteries */}
        {miniRockets.map(r => <MiniRocketMesh key={r.id} rocket={r} fromY={74} tileSize={tileSize} offset={offset} />)}
        {/* Heavy Metal force fields: the dome, and lightning to every enemy inside. */}
        {(() => {
            const fields = activeFields(units, Date.now());
            const shocked = shockedBy(units, fields);
            return fields.map(f => {
                return (
                    <ForceFieldDome
                        key={f.id}
                        center={{ x: f.center.x * tileSize - offset, z: f.center.z * tileSize - offset }}
                        radius={f.radius * tileSize}
                        color={f.team === 'blue' ? '#38bdf8' : '#fb7185'}
                        strength={f.hp / f.maxHp}
                        shocked={(shocked.get(f.id) ?? []).map(u => ({ x: u.gridPos.x * tileSize - offset, y: flightUnitY(u), z: u.gridPos.z * tileSize - offset }))}
                    />
                );
            });
        })()}
        {virusBombs.map(b => <BlackwallBomb key={b.id} at={{ x: b.at.x * tileSize - offset, z: b.at.z * tileSize - offset }} firedAt={b.firedAt} landAt={b.landAt} radius={BLACKWALL.radius * tileSize} />)}
        {rockets.map(r => <EmpRocketMesh key={r.id} id={r.id} rocketsRef={rocketsRef} unitsRef={unitsRef} tileSize={tileSize} offset={offset} />)}
        {shells.map(s => <ShellMesh key={s.id} shell={s} tileSize={tileSize} offset={offset} enemy={s.team !== playerTeam} />)}
        {units.filter(u => u.type === 'howitzer' && u.artilleryTarget && u.team === playerTeam && selectedUnitIds.has(u.id))
            .map(u => <FireMissionMarker key={`fm-${u.id}`} at={u.artilleryTarget!} tileSize={tileSize} offset={offset} />)}
        {/* Where selected Bombardment Drones are dropping. */}
        {units.filter(u => u.type === 'bombard' && u.bombardmentTarget && u.team === playerTeam && selectedUnitIds.has(u.id))
            .map(u => <FireMissionMarker key={`bm-${u.id}`} at={u.bombardmentTarget!} tileSize={tileSize} offset={offset} />)}

        {/* Explosions */}
        {explosions.map(e => <ExplosionMesh key={e.id} explosion={e} />)}

        {/* Weapons fire, only where the player can see one end of the shot */}
        {tracers.filter(t => visibleUnitIds.has(t.attackerId) || visibleUnitIds.has(t.targetId) || structuresState.some(st => st.id === t.attackerId || st.id === t.targetId))
            .map(t => <ShotFx key={t.id} shot={t} />)}
        {smokeScreens.map(s => <SmokeCloud key={s.id} screen={s} tileSize={tileSize} offset={offset} />)}
        {voltWarnings.map(c => <VoltWarning key={c.muleId} charge={c} tileSize={tileSize} offset={offset} />)}
        {railBeams.filter(b => b.team === playerTeam || visibleUnitIds.has(b.attackerId) || visibleUnitIds.has(b.targetId)).map(b => <RailBeam key={b.id} beam={b} tileSize={tileSize} offset={offset} />)}
        
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
            onRightClick={handleRightClick}
            freePads={baseMenuOpen === 'blue' ? freePadsOf('blue') : undefined}
            hq={structuresState.find(st => st.id === 'hq-blue')}
            tier={economy.blue.tier}
            compute={economy.blue.compute}
            onResearch={playerTeam === 'blue' ? (tier: 2 | 3) => dispatchOrder({ type: 'RESEARCH_TIER', tier }) : undefined}
            onTrain={playerTeam === 'blue' ? (unitType: UnitType) => dispatchOrder({ type: 'TRAIN_UNIT', structureId: 'hq-blue', unitType }) : undefined}
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
            onRightClick={handleRightClick}
            freePads={baseMenuOpen === 'red' ? freePadsOf('red') : undefined}
            hq={structuresState.find(st => st.id === 'hq-red')}
            tier={economy.red.tier}
            compute={economy.red.compute}
            onResearch={playerTeam === 'red' ? (tier: 2 | 3) => dispatchOrder({ type: 'RESEARCH_TIER', tier }) : undefined}
            onTrain={playerTeam === 'red' ? (unitType: UnitType) => dispatchOrder({ type: 'TRAIN_UNIT', structureId: 'hq-red', unitType }) : undefined}
        />

        {/* Command HQs built on cleared city blocks (sim/bases.ts). */}
        {structuresState.filter(s => s.type === 'hq' && s.id !== 'hq-blue' && s.id !== 'hq-red' && s.health > 0).map(s => {
            const team = s.team === 'red' ? 'red' : 'blue';
            const mine = s.team === playerTeam;
            return (
                <Base
                    key={s.id}
                    position={[(s.gridPos.x * CITY_CONFIG.tileSize) - offset, 0, (s.gridPos.z * CITY_CONFIG.tileSize) - offset]}
                    gridPos={s.gridPos}
                    teamColor={TEAM_COLORS[team]}
                    label={`${team.toUpperCase()} BASE`}
                    onMoveCommand={handleTileClick}
                    onDoubleClick={() => { if (mine && !(s.buildRemainingMs! > 0)) setBaseMenuOpen(s.id); }}
                    menuOpen={baseMenuOpen === s.id}
                    resources={teamResources[team]}
                    onRightClick={handleRightClick}
                    freePads={baseMenuOpen === s.id ? freePadsOf(team) : undefined}
                    hq={s}
                    tier={economy[team].tier}
                    compute={economy[team].compute}
                    onResearch={mine ? (tier: 2 | 3) => dispatchOrder({ type: 'RESEARCH_TIER', tier }) : undefined}
                    onTrain={mine ? (unitType: UnitType) => dispatchOrder({ type: 'TRAIN_UNIT', structureId: s.id, unitType }) : undefined}
                    buildProgress={(s.buildTotalMs || 0) > 0 ? 1 - (s.buildRemainingMs || 0) / s.buildTotalMs! : 1}
                />
            );
        })}

        {/* Movement Visualization for Friendly Moving Units */}
        {movePathElements}

        {/* Targeting Cursor (Red for Cannon, Green for Surveillance, Orange for Missile, Cyan for Doctrine) */}
        <HoverTile store={hoverStore}>{hoverGridPos => hoverGridPos && (targetingAbility || interactionMode === 'target') && (
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
                ) : (interactionMode === 'target' && targetingDoctrine?.type === 'HEAVY_METAL_TIER3') ? (
                    // Bulwark Force Field: the dome's footprint.
                    <group>
                        <mesh rotation={[-Math.PI/2, 0, Date.now() * 0.003]}>
                            <ringGeometry args={[FORCE_FIELD.radius * tileSize - 0.7, FORCE_FIELD.radius * tileSize, 6]} />
                            <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[FORCE_FIELD.radius * tileSize, 48]} />
                            <meshBasicMaterial color="#38bdf8" transparent opacity={0.12} depthWrite={false} />
                        </mesh>
                    </group>
                ) : targetingAbility === 'MISSILE' || (interactionMode === 'target' && targetingDoctrine?.type.includes('HEAVY_METAL')) ? (
                     // Missile / Orbital Drop Targeting Reticle
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
                         {/* Impact Radius Warning: the loaded warhead's area */}
                         <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.4, 0]}>
                              <circleGeometry args={[(() => {
                                  const ammo = targetingAbility === 'MISSILE' ? units.find(u => u.id === targetingSourceId)?.loadedAmmo : null;
                                  return ammo === 'wp' ? WP.radius : ammo === 'emp' ? ABILITY_CONFIG.EMP_RADIUS : ammo === 'he' ? HE.radius : ABILITY_CONFIG.HE_RADIUS;
                              })() * tileSize, 32]} />
                              <meshBasicMaterial color="#fca5a5" transparent opacity={0.15} depthWrite={false} />
                         </mesh>
                     </group>
                ) : (interactionMode === 'target' && targetingDoctrine?.type === 'NETRUNNER_TIER3') ? (
                    // Black Wall Infect: the bomb's blast radius in Blackwall red.
                    <group>
                        <mesh rotation={[-Math.PI/2, 0, Date.now() * 0.004]}>
                            <ringGeometry args={[BLACKWALL.radius * tileSize - 0.6, BLACKWALL.radius * tileSize, 48]} />
                            <meshBasicMaterial color="#ff1a3c" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, 0]}>
                            <circleGeometry args={[BLACKWALL.radius * tileSize, 48]} />
                            <meshBasicMaterial color="#ff2fb4" transparent opacity={0.15} depthWrite={false} />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.05, 0]}>
                            <ringGeometry args={[(BLACKWALL.radius + BLACKWALL.spreadRange) * tileSize - 0.3, (BLACKWALL.radius + BLACKWALL.spreadRange) * tileSize, 48, 1, 0, Math.PI * 2]} />
                            <meshBasicMaterial color="#3f6bff" transparent opacity={0.35} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                ) : (targetingAbility === 'SWARM' || (interactionMode === 'target' && targetingDoctrine?.type.includes('NETRUNNER'))) ? (
                    (interactionMode === 'target' && targetingDoctrine?.type === 'NETRUNNER_TIER2') ? (
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
                                color={targetingAbility === 'BATTERY_TETHER' ? '#facc15' : (targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'TETHER' ? "#38bdf8" : "#10b981"))} 
                                wireframe 
                            />
                        </mesh>
                        <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0.05, 0]}>
                            <ringGeometry args={[tileSize * 0.3, tileSize * 0.35, 4]} />
                            <meshBasicMaterial 
                                color={targetingAbility === 'BATTERY_TETHER' ? '#facc15' : (targetingAbility === 'DECOY' ? '#c084fc' : (targetingAbility === 'TETHER' ? "#38bdf8" : "#10b981"))} 
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
        )}</HoverTile>


        {/* Placement Preview */}
        <HoverTile store={hoverStore}>{hoverGridPos => placementMode && hoverGridPos && (
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
        )}</HoverTile>

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
            </group>
        ))}

    </group>
  );
};

export default React.memo(CityMap);
