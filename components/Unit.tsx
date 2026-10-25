
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Edges, Float, Html, Line, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TEAM_COLORS, UNIT_CLASSES, ABILITY_CONFIG, UNIT_STATS } from '../constants';
import { UnitType, UnitClass, UnitData } from '../types';
import { abilitiesFor } from '../sim/unitAbilities';
import { roleBadgeTexture, UNIT_ROLE } from './unitIcons';
import { isObjectInFrustum, isPointInFrustum } from '../frustum';
import { currentTilePosition, parseTile } from '../sim/movement';
import { CloakGeneratorModel, FieldGeneratorModel, InfiltratorModel, LancerLauncher, TrooperKit } from './unitModels';
import { ARTILLERY, artilleryRange } from '../sim/artillery';
import { CIWS } from '../sim/ciws';
import { BOMBARD } from '../sim/bombard';
import { CLOAK_FIELD } from '../sim/cloak';
import { FORCE_FIELD } from '../sim/forcefield';
import { BlackwallExposure, BlackwallInfection } from './BlackwallFx';
import { follow, motionOf, positionKey, predictPosition, stampedAt, walkAlong } from './glide';
import { MAX_TETHERS } from '../sim/jamming';
import { JamRange, JamStatic } from './JamStatic';
import { GlitchField } from './GlitchField';
import { HeliosField } from './HeliosField';
import { ScoutCarModel } from './models/ScoutCarModel';
import { Meter, METER_COLORS, UnitBars } from './UnitBars';
import { abilityUnlocked, artilleryTierOf, type UpgradeId } from '../sim/upgrades';
import { shieldMax } from '../sim/kestrel';
import { WARHEAD_LABEL } from '../sim/warheads';
import { isHeroType } from '../sim/heroes';
import { GoliathRig } from './GoliathRig';
import { BatteryMuleModel, BATTERY_MULE_LINK_Y } from './models/BatteryMuleModel';
import { AegisModel } from './models/AegisModel';
import { RazorbackModel } from './models/RazorbackModel';
import { HeliosModel } from './models/HeliosModel';
import { HornetModel } from './models/HornetModel';
import { MasonModel } from './models/MasonModel';
import { BansheeModel, BANSHEE_TETHER_ORIGINS } from './models/BansheeModel';
import { AttackDroneModel } from './models/AttackDroneModel';
import { WaspModel } from './models/WaspModel';
import { BallistaModel } from './models/BallistaModel';
import { ThunderheadModel } from './models/ThunderheadModel';
import { GuardianModel, GUARDIAN_BEAM_ORIGIN_Y } from './models/GuardianModel';
import { TitanTankModel } from './models/TitanTankModel';
import { KageRig } from './KageRig';
import { GOLIATH } from '../sim/heavyMetalHero';

const NO_UPGRADES: readonly UpgradeId[] = [];

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


// Ring colour while an ability's buff runs.
const BUFF_COLORS: Record<NonNullable<UnitData['buffs']>[number]['kind'], string> = {
  stim: '#f43f5e', nanoweave: '#a3e635', overcharge: '#facc15', nitro: '#fb923c', overclock: '#f97316',
  barrage: '#38bdf8', radar: '#22d3ee', afterburner: '#fb923c', emp: '#818cf8', smoke: '#94a3b8', piercing_round: '#e879f9', shadow_cloak: '#22c55e',
};
// Aegis air-search radar: a wide green circle. Selected, it also shows range rings and a sweeping
// beam that leaves a fading trail. Flat on the ground under the vehicle.
const RADAR_GREEN = '#22c55e';
const RadarSweep: React.FC<{ radius: number; y: number; strong: boolean }> = ({ radius, y, strong }) => {
  const beam = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const b = beam.current;
    if (!b) return;
    b.rotation.y -= delta * 1.6;
  });
  const a = strong ? 1 : 0.6;
  return (
    <group position={[0, y, 0]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh raycast={() => null}>
          <ringGeometry args={[radius - 1.4, radius, 128]} />
          <meshBasicMaterial color={RADAR_GREEN} transparent opacity={0.75 * a} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* Range rings, fill and sweeping beam only while this Aegis is selected; otherwise just
            the outer edge, so a field of radars isn't a field of spinning distractions. */}
        {strong && [1 / 3, 2 / 3].map(f => (
          <mesh key={f} raycast={() => null}>
            <ringGeometry args={[radius * f - 0.4, radius * f + 0.4, 96]} />
            <meshBasicMaterial color={RADAR_GREEN} transparent opacity={0.25 * a} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {strong && <mesh raycast={() => null}>
          <circleGeometry args={[radius, 96]} />
          <meshBasicMaterial color={RADAR_GREEN} transparent opacity={0.04 * a} toneMapped={false} depthWrite={false} />
        </mesh>}
      </group>
      {/* The beam and its fading trail: wedges of decreasing brightness behind the leading edge. */}
      {strong && <group ref={beam}>
        {[0.45, 0.25, 0.12, 0.05].map((o, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, i * 0.22]} position={[0, 0.05 * i, 0]} raycast={() => null}>
            <circleGeometry args={[radius, 32, 0, 0.24]} />
            <meshBasicMaterial color={RADAR_GREEN} transparent opacity={o * a} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>}
    </group>
  );
};

// The Aegis cannon's magazine in its menu: firing, ready, or reloading with a countdown.
const CiwsStatus: React.FC<{ usedMs: number; reloadUntil: number; firing: boolean }> = ({ usedMs, reloadUntil, firing }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const reloading = reloadUntil > now;
  const left = reloading ? 0 : 1 - Math.min(1, usedMs / CIWS.burstMs);
  const fill = reloading ? 1 - (reloadUntil - now) / CIWS.reloadMs : left;
  return (
    <div className="px-1 mb-1">
      <div className="flex justify-between text-[9px] font-mono uppercase">
        <span className="text-slate-400">CIWS</span>
        <span className={reloading ? 'text-amber-300' : firing ? 'text-orange-300 animate-pulse' : 'text-emerald-300'}>
          {reloading ? `Reloading ${Math.ceil((reloadUntil - now) / 1000)}s` : firing ? 'Firing' : 'Ready'}
        </span>
      </div>
      <div className="h-1 bg-slate-800 rounded-sm overflow-hidden">
        <div className="h-1" style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: reloading ? '#fbbf24' : '#fb923c' }} />
      </div>
    </div>
  );
};

// Static crackling over a unit an EMP has shut down.
const EmpStatic: React.FC<{ size: number }> = ({ size }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(state => {
    const m = ref.current;
    if (!m) return;
    m.rotation.set(state.clock.elapsedTime * 3.1, state.clock.elapsedTime * 2.3, 0);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.random() > 0.3 ? 0.35 + Math.random() * 0.45 : 0.05;
  });
  return (
    <mesh ref={ref} position={[0, 2.5, 0]} raycast={() => null}>
      <icosahedronGeometry args={[size, 1]} />
      <meshBasicMaterial color="#7dd3fc" wireframe transparent opacity={0.5} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
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
  moveProgress?: number;
  moveTarget?: string;
  moveSpeed?: number;
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
  fieldCloaked?: boolean;
  cloakFieldOff?: boolean;
  health: number;
  maxHealth: number;
  battery: number;
  maxBattery: number;
  secondaryBattery?: number;
  maxSecondaryBattery?: number;
  chargingStatus?: number; // 0, 1, or 2
  cooldowns: {
      trophySystem?: number;
      combatPrint?: number;
      swarmLaunch?: number;
      smogShell?: number;
      mainCannon?: number;
  };
  repairTargetId?: string | null; // Added for smooth visual lookup
  repairTargetIds?: string[];
  repairTargetPos?: THREE.Vector3;
  hackerPos?: THREE.Vector3;
  charges?: {
      swarm?: number;
  };
  cargo?: number;
  constructionTargetId?: string | null; // Mason target
  isTargetingMode?: boolean;
  showTetherRange?: boolean;
  showBatteryRange?: boolean;
  isTetherCandidate?: boolean;
  // An enemy the selected Lancer can lock its EMP rocket on to.
  isLockCandidate?: boolean;
  isBatteryLinkCandidate?: boolean;
  batteryTetherIds?: string[];
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'emp' | 'he' | 'wp' | null;
  missileInventory?: { emp: number; he: number; wp: number }; // Added
  ordnanceMaterial?: number;
  fabrication?: { active: boolean; item: 'emp' | 'he' | 'wp'; progress: number; totalTime: number };
  atOrdnanceFab?: boolean;
  ballistaInRange?: boolean;
  cores?: number;
  warheadStock?: { emp: number; he: number; wp: number };
  loadingProgress?: number;
  courierTargetId?: string;
  courierPayload?: 'emp' | 'he' | 'wp';
  bombardmentTarget?: { x: number; z: number } | null;
  bombardMunitions?: number;
  blackwallInfectedAt?: number;
  fieldShieldHp?: number;
  fieldDownUntil?: number;
  blackwallExposureMs?: number;
  bombardReturning?: boolean;
  bombardRearmStartedAt?: number;
  jammerActive?: boolean;
  tetherTargetIds?: string[];
  isJammed?: boolean;
  heliosMode?: 'charge' | 'burn';
  // A Banshee on the player's side, which shows its jamming range.
  ownJammer?: boolean;
  isHacked?: boolean;
  hackType?: 'recall' | 'drain' | null;
  teamCompute: number; // New Prop
  // The side's upgrades from Advanced Research (sim/upgrades.ts).
  upgrades?: readonly UpgradeId[];
  // A Kestrel's Regenerative Shield left (sim/kestrel.ts).
  regenShield?: number;
  // Goliath (sim/heavyMetalHero.ts): when his grenade launcher last fired.
  grenadeAt?: number;
  // Where the unit's gun is pointed, in tiles, for units that turn to face what they shoot (Goliath).
  faceAt?: { x: number; z: number } | null;
  // What a turret is aimed at, in tiles (the Titan's).
  turretAt?: { x: number; z: number } | null;
  // Tank rail gun (sim/railgun.ts): when it last fired.
  railgunFiredAt?: number;
  firingLaserAt?: string | null;
  lastAttackTime?: number;
  combatTargetId?: string | null;
  buffs?: UnitData['buffs'];
  abilityReadyAt?: Record<string, number>;
  // Reach in tiles of a working radar on the player's side (Aegis or Infiltrator): draw its
  // sweep (sim/radar.ts). 0 for none.
  radarRange?: number;
  // Aegis rotary cannon (sim/ciws.ts)
  ciwsUsedMs?: number;
  ciwsReloadUntil?: number;
  ciwsTargetId?: string | null;
  // Where each Aegis is shooting this frame, by gun id (filled by CityMap's CIWS stream).
  ciwsAims?: React.MutableRefObject<Map<string, THREE.Vector3>>;
  // Thunderhead (sim/artillery.ts)
  anchoredAt?: number;
  artilleryTarget?: { x: number; z: number } | null;
  artilleryAim?: { x: number; z: number } | null;
  // Step 3 Updates
  isStunned?: boolean;
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

const paintGhostMaterial = (mat: THREE.MeshStandardMaterial, bodyColor: string) => {
  mat.color.set(bodyColor);
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
// All infantry share this soldier mesh; the armor color tells them apart.
const SoldierModel: React.FC<{ bodyColor: string }> = ({ bodyColor }) => {
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
        if (copy.color) paintGhostMaterial(copy, bodyColor);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
    });
    return cloned;
  }, [scene, bodyColor]);

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

const GhostModel: React.FC = () => <SoldierModel bodyColor="#7c868f" />;

const Unit: React.FC<UnitProps> = ({ 
  id, type, unitClass, team, gridPos, isSelected, onSelect, tileSize, offset, path, moveProgress, moveTarget, moveSpeed, onDoubleClick, visionRange, visible = true, surveillance, isDampenerActive, isDeployed, actionMenuOpen, onAction, isDecoy, decoyActive, fieldCloaked, cloakFieldOff, health, maxHealth, battery, maxBattery, secondaryBattery, maxSecondaryBattery, chargingStatus, cooldowns, repairTargetId, repairTargetIds, repairTargetPos, hackerPos, charges, cargo, constructionTargetId, isTargetingMode, showTetherRange, showBatteryRange, isTetherCandidate, isLockCandidate, isBatteryLinkCandidate, ammoState, loadedAmmo, missileInventory, ordnanceMaterial, fabrication, atOrdnanceFab, ballistaInRange, cores, warheadStock, loadingProgress, courierPayload, bombardmentTarget, bombardMunitions, bombardReturning, bombardRearmStartedAt, blackwallInfectedAt, blackwallExposureMs, fieldShieldHp, fieldDownUntil, jammerActive, tetherTargetIds, batteryTetherIds, isJammed, ownJammer, heliosMode, isHacked, hackType, firingLaserAt, lastAttackTime, combatTargetId, buffs, abilityReadyAt, teamCompute = 1, upgrades = NO_UPGRADES, regenShield, grenadeAt, faceAt, turretAt, railgunFiredAt, radarRange = 0, ciwsUsedMs, ciwsReloadUntil, ciwsTargetId, ciwsAims, anchoredAt, artilleryTarget, artilleryAim,
  isStunned, activeBuffs, isAnchored, isInNanoCloud
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const moveScratch = useRef({
    look: new THREE.Vector3(),
    orient: new THREE.Object3D(),
  });
  const tetherLineRefs = useRef<(THREE.BufferGeometry | null)[]>([]);
  const batteryLineRefs = useRef<(THREE.BufferGeometry | null)[]>([]);
  const repairBeamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const laserRef = useRef<THREE.BufferGeometry>(null);
  const constructionLineRef = useRef<THREE.BufferGeometry>(null);
  // The tip of the Mason's lifting arm, where the construction beam starts.
  const masonTipRef = useRef<THREE.Object3D>(null);
  const scene = useThree((state) => state.scene); // Access scene for lookups
  const flashRef = useRef<THREE.Mesh>(null);

  const teamColor = TEAM_COLORS[team];
  // Thunderhead: its range follows the side's shell upgrades; the gun turns to where it last fired.
  const howitzerTier = artilleryTierOf({ upgrades: [...upgrades] });
  const aimWorld = useMemo(() => {
    const at = artilleryTarget ?? artilleryAim;
    return at ? new THREE.Vector3(at.x * tileSize - offset, 0, at.z * tileSize - offset) : null;
  }, [artilleryTarget?.x, artilleryTarget?.z, artilleryAim?.x, artilleryAim?.z, tileSize, offset]);
  const [settingUp, setSettingUp] = useState(false);
  useEffect(() => {
    if (type !== 'howitzer' || !isDeployed || !anchoredAt) { setSettingUp(false); return; }
    const left = anchoredAt + ARTILLERY.setupMs - Date.now();
    setSettingUp(left > 0);
    if (left <= 0) return;
    const timer = setTimeout(() => setSettingUp(false), left);
    return () => clearTimeout(timer);
  }, [type, isDeployed, anchoredAt]);
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
  const isAttackDrone = type === 'attack_drone';
  const isDefenseDrone = type === 'defense_drone';
  const isSwarmHost = type === 'swarm_host';
  const isCrawler = type === 'crawler_drone';
  const isBombard = type === 'bombard';
  const isTrooper = type === 'trooper';
  const isLancer = type === 'lancer';
  const isRazorback = type === 'razorback';
  const isScoutCar = type === 'scout_car';
  const isHowitzer = type === 'howitzer';
  const isCloakGen = type === 'cloak_generator';
  const isFieldGen = type === 'field_generator';
  const fieldUp = isCloakGen && !cloakFieldOff && health > 0 && battery > 0 && !buffs?.some(b => b.kind === 'emp');
  const isAegis = type === 'aegis';
  const isHornet = type === 'hornet';
  const isHero = isHeroType(type);
  const isAir = isWasp || isDrone || isAttackDrone || isHelios || isBombard || isHornet;
  
  const classConfig = UNIT_CLASSES[unitClass];
  const unitStats = UNIT_STATS[type];

  // Safety check to prevent crash if unit type is unknown
  if (!unitStats) return null;



  // Floating height difference
  // Raised ground units to 1.2 to clear the Base platform (height 1.0)
  const hoverHeight = isBombard ? 42 : isDefenseDrone ? 12.0 : (isTank || isGhost || isGuardian || isMule || isMason || isSunPlate || isBallista || isCourier || isBanshee || isSwarmHost || isCrawler || isTrooper || isLancer || isRazorback || isScoutCar || isAegis || isHowitzer || isCloakGen || isFieldGen) ? 1.2 : (isAir ? 75.0 : 2.0);
  
  // Logical World Position
  const logicalWorldPos = useMemo(() => new THREE.Vector3(
      (gridPos.x * tileSize) - offset,
      hoverHeight,
      (gridPos.z * tileSize) - offset
  ), [gridPos, tileSize, offset, hoverHeight]);

  // Where the simulation last said the unit was (sim/movement.ts), and when. Between
  // ticks the model keeps moving along its route at the reported speed, so motion stays
  // smooth however irregularly React delivers updates. See components/glide.ts.
  //
  // Read each frame from the motion registry (motionOf), not from props, so that moving part of
  // the way along a tile doesn't re-render the unit; decoys, which aren't units, use their props.
  const tracked = useRef<{ key: string; path: readonly string[]; route: { x: number; z: number }[]; speed: number; report: { x: number; z: number; at: number } } | null>(null);
  const trackMotion = () => {
    const m = motionOf(id) ?? { gridPos, path, moveProgress, moveTarget, moveSpeed };
    const key = positionKey(m);
    let t = tracked.current;
    if (!t || t.key !== key || t.path !== m.path) {
      const tile = currentTilePosition({ gridPos: m.gridPos, path: m.path as string[], moveProgress: m.moveProgress, moveTarget: m.moveTarget });
      const route = t && t.path === m.path ? t.route : m.path.map(k => {
        const p = parseTile(k);
        return { x: (p.x * tileSize) - offset, z: (p.z * tileSize) - offset };
      });
      // The tick that put the unit here, which can be well before the latest one when the screen
      // is behind; a position no tick stamped (a spawn, a decoy) counts as fresh.
      const report = { x: (tile.x * tileSize) - offset, z: (tile.z * tileSize) - offset, at: stampedAt(id, key) ?? performance.now() };
      t = { key, path: m.path, route, speed: 0, report };
      tracked.current = t;
    }
    t.speed = m.moveSpeed || 0;
    return t;
  };

  // The model unmounts while hidden by fog. A fresh one starts on the sim position, not the origin.
  const placedMesh = useRef<THREE.Group | null>(null);

  const bodyRef = useRef<THREE.Group>(null);

  // Infiltrator radar sweep: kept flat on the ground at the radar's centre while the drone
  // turns and orbits above it. Registered after the movement frame, so the body has moved.
  const radarAnchorRef = useRef<THREE.Group>(null);
  const radarScratch = useMemo(() => new THREE.Vector3(), []);

  // Owner-only cloak. Tinting is limited to the body group, which is remounted
  // when the cloak ends so the Ghost's materials come back solid.
  useLayoutEffect(() => {
    const root = bodyRef.current;
    if (!root || (!decoyActive && !fieldCloaked)) return;
    // Phantom Decoy tints cyan; a Cloaking Field (sim/cloak.ts) violet.
    const [tint, glow] = decoyActive ? ['#7dd3fc', '#38bdf8'] : ['#d8b4fe', '#a855f7'];
    // Tinted copies, never the materials themselves: models share materials between units
    // (components/kit), and a cloak must not tint every other unit's.
    const tintOf = (mat: THREE.Material) => {
      if (mat.userData.cloakTint || mat.opacity === 0) return mat;
      const tinted = mat.clone() as THREE.MeshStandardMaterial;
      tinted.userData.cloakTint = true;
      tinted.transparent = true;
      tinted.opacity = 0.32;
      tinted.depthWrite = false;
      if (tinted.color) tinted.color.set(tint);
      if (tinted.emissive) {
        tinted.emissive.set(glow);
        tinted.emissiveIntensity = 0.85;
      }
      cloakCopies.current.push(tinted);
      return tinted;
    };
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tintOf) : tintOf(mesh.material);
    });
  });
  // The tinted copies go when the cloak ends (the body remounts with its own materials).
  const cloakCopies = useRef<THREE.Material[]>([]);
  const cloaked = !!decoyActive || !!fieldCloaked;
  useEffect(() => {
    if (cloaked) return;
    cloakCopies.current.forEach(m => m.dispose());
    cloakCopies.current = [];
  }, [cloaked]);
  useEffect(() => () => cloakCopies.current.forEach(m => m.dispose()), []);


  useFrame((state, delta) => {
    let isVisible = true;
    if (meshRef.current) {
        // Units with a wide ring on the ground stay drawn while any of the ring is on screen.
        const cullRadius = radarRange > 0 ? radarRange * tileSize : (isHowitzer && isDeployed ? artilleryRange(howitzerTier) * tileSize : isCloakGen ? CLOAK_FIELD.radius * tileSize : 15);
        isVisible = isObjectInFrustum(meshRef.current, cullRadius);
        if (meshRef.current.visible !== isVisible) {
            meshRef.current.visible = isVisible;
        }
    }

    if (isVisible) {
        // Muzzle Flash Logic
        if (flashRef.current) {
            // A glowing mesh, not a light: toggling a light's visibility changes the scene's light
            // count, which makes three.js recompile every lit shader and stalls the frame.
            flashRef.current.visible = !!lastAttackTime && Date.now() - lastAttackTime < 100;
        }


        
        if (meshRef.current && isDefenseDrone) {
            meshRef.current.rotation.y += delta * 0.5;
        }
    }

    // Imperative Line Updates (Construction, Laser, Tether) ...
    if (constructionLineRef.current && meshRef.current && isMason) {
        if (constructionTargetId) {
            const start = new THREE.Vector3(0, 2.5, 1.0);
            if (masonTipRef.current) meshRef.current.worldToLocal(masonTipRef.current.getWorldPosition(start));
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

    // One hardline cable to each tethered drone.
    if (isBanshee && meshRef.current) {
        for (let i = 0; i < MAX_TETHERS; i++) {
            const geom = tetherLineRefs.current[i];
            if (!geom) continue;
            const targetId = tetherTargetIds?.[i];
            const targetObj = targetId ? scene.getObjectByName(`unit-${targetId}`) : undefined;
            if (targetObj) {
                const start = new THREE.Vector3(...BANSHEE_TETHER_ORIGINS[i]);
                const targetWorld = new THREE.Vector3();
                targetObj.getWorldPosition(targetWorld);
                const sourceWorld = new THREE.Vector3();
                meshRef.current.getWorldPosition(sourceWorld);
                const diffWorld = new THREE.Vector3().subVectors(targetWorld, sourceWorld);
                diffWorld.y += 0.5;
                const localEnd = diffWorld.applyQuaternion(meshRef.current.quaternion.clone().invert());
                geom.setFromPoints([start, localEnd]);
            } else {
                geom.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
            }
            geom.attributes.position.needsUpdate = true;
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
                const start = new THREE.Vector3(0, BATTERY_MULE_LINK_Y, 0);
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
            const start = new THREE.Vector3(0, GUARDIAN_BEAM_ORIGIN_Y, 0);
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

    if (!meshRef.current) return;

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

        const meshPos = meshRef.current.position;
        const { report, route, speed } = trackMotion();
        const predicted = predictPosition(report, route, speed, (performance.now() - report.at) / 1000);
        if (placedMesh.current !== meshRef.current) {
            placedMesh.current = meshRef.current;
            meshPos.set(predicted.x, hoverHeight, predicted.z);
        } else {
            const drawn = follow({ x: meshPos.x, z: meshPos.z }, predicted, delta, tileSize);
            meshPos.set(drawn.x, hoverHeight, drawn.z);
        }

        // Face where the route goes next while travelling.
        if (speed > 0 && route.length > 0) {
            const scratch = moveScratch.current;
            const ahead = walkAlong(predicted, route, tileSize * 0.5);
            scratch.look.set(ahead.x, meshPos.y, ahead.z);
            if (meshPos.distanceTo(scratch.look) > 0.05) {
                scratch.orient.position.copy(meshPos);
                scratch.orient.lookAt(scratch.look);
                meshRef.current.quaternion.slerp(scratch.orient.quaternion, 1 - Math.exp(-delta * 14));
            }
        }
        // Standing and firing: turn to face the target.
        else if (faceAt) {
            const scratch = moveScratch.current;
            scratch.look.set(faceAt.x * tileSize - offset, meshPos.y, faceAt.z * tileSize - offset);
            if (meshPos.distanceTo(scratch.look) > 0.05) {
                scratch.orient.position.copy(meshPos);
                scratch.orient.lookAt(scratch.look);
                meshRef.current.quaternion.slerp(scratch.orient.quaternion, 1 - Math.exp(-delta * 6));
            }
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
  // The 3D model is built only when something it shows changes, not on every render. A moving
  // unit re-renders every game tick; rebuilding dozens of meshes for each one, then having React
  // compare them part by part, was a large share of the frame time with many units on the move.
  // The values below are what the model reads, reduced to what changes its look.
  const powered = battery > 0 && health > 0;
  const fieldGenActive = health > 0 && battery > 0 && fieldDownUntil === undefined && !buffs?.some(b => b.kind === 'emp');
  const trophyCooling = cooldowns.trophySystem !== undefined && cooldowns.trophySystem > 0;
  const carrying = !!cargo && cargo > 0;
  // A Helios works unless an EMP has knocked it out, or it is microwaving with a flat battery.
  const heliosWorking = isHelios && !buffs?.some(b => b.kind === 'emp') && (heliosMode !== 'burn' || battery > 0);
  const radarShown = radarRange > 0 || !!surveillance;
  // Walking somewhere: rigged models play their run (KageRig).
  const moving = path.length > 0;
  // The turret's target, kept in a ref so aiming never rebuilds the model.
  const turretAimRef = useRef<THREE.Vector3 | null>(null);
  turretAimRef.current = turretAt ? new THREE.Vector3(turretAt.x * tileSize - offset, 0, turretAt.z * tileSize - offset) : null;
  const renderModel = () => {
    if (isTrooper || isLancer) return (
        <group>
            <group scale={3.7} rotation={[0, Math.PI, 0]}>
                <SoldierModel bodyColor={isTrooper ? '#4b5563' : '#6b5a3e'} />
                {isTrooper ? <TrooperKit teamColor={teamColor} /> : <LancerLauncher teamColor={teamColor} />}
            </group>
            <mesh ref={flashRef} position={[0, 2.2, 0]} visible={false} raycast={() => null}><sphereGeometry args={[0.3, 8, 6]} /><meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} /></mesh>
        </group>
    );
    if (isRazorback) return <RazorbackModel teamColor={teamColor} moving={moving} aimRef={turretAimRef} flashRef={flashRef} />;
    if (isScoutCar) return <ScoutCarModel teamColor={teamColor} moving={moving} />;
    if (isCloakGen) return <CloakGeneratorModel teamColor={teamColor} active={fieldUp} />;
    if (isFieldGen) return <FieldGeneratorModel teamColor={teamColor} active={fieldGenActive} />;
    if (isHowitzer) return <ThunderheadModel teamColor={teamColor} moving={moving} deployed={!!isDeployed} aim={aimWorld} />;
    if (isAegis) return <AegisModel teamColor={teamColor} moving={moving} firing={!!ciwsTargetId} aimOf={() => ciwsAims?.current.get(id)} />;
    if (isHornet) return <HornetModel teamColor={teamColor} rockets={upgrades.includes('hunter_rockets')} aimRef={turretAimRef} flashRef={flashRef} />;
    if (type === 'hero_shadow_ops') return <KageRig teamColor={teamColor} lastAttackTime={lastAttackTime} moving={moving} />;
    if (type === 'hero_heavy_metal') return <GoliathRig teamColor={teamColor} flashRef={flashRef} grenadeAt={grenadeAt} lastAttackTime={lastAttackTime} moving={moving} />;
     if (isDefenseDrone) {
        const bodyColor = "#334155"; const glowColor = firingLaserAt ? "#ff0000" : "#ef4444"; const detailColor = "#1e293b";
        return ( <group scale={[3, 3, 3]}> <mesh><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color={bodyColor} metalness={0.8} roughness={0.3} /></mesh> <mesh rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.605, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, 0.35, 0]} rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.48, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, -0.35, 0]} rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.48, 0.015, 6, 24]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <group position={[0, 0, 0.52]} rotation={[Math.PI/2, 0, 0]}> <mesh><cylinderGeometry args={[0.22, 0.25, 0.15, 8]} /><meshStandardMaterial color={detailColor} metalness={0.9} /></mesh> <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.15, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshBasicMaterial color={glowColor} toneMapped={false} /></mesh> <mesh position={[0, 0.2, 0]} rotation={[Math.PI/2, 0, 0]}><ringGeometry args={[0.06, 0.12, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} /></mesh> </group> {[90, 180, 270].map((deg) => { const rad = deg * Math.PI / 180; return ( <group key={deg} rotation={[0, rad, 0]}> <group position={[0, 0, 0.55]} rotation={[Math.PI/2, 0, 0]}> <mesh><cylinderGeometry args={[0.1, 0.12, 0.1, 8]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, 0.06, 0]}><sphereGeometry args={[0.06, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshBasicMaterial color={glowColor} /></mesh> </group> </group> ); })} {[ [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1] ].map((vec, i) => { const dir = new THREE.Vector3(...vec).normalize(); const pos = dir.clone().multiplyScalar(0.58); const quaternion = new THREE.Quaternion(); quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); return ( <group key={i} position={pos} quaternion={quaternion}> <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.06, 0.08, 0.1, 6]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, 0.25, 0]}><coneGeometry args={[0.03, 0.4, 8]} /><meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} /></mesh> </group> ); })} <group position={[0.2, 0.55, -0.2]} rotation={[0, 0, -0.2]}> <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.02, 0.02, 0.6]} /><meshStandardMaterial color="#94a3b8" metalness={1} /></mesh> <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.03]} /><meshBasicMaterial color={glowColor} /></mesh> </group> <group position={[-0.2, 0.55, -0.1]} rotation={[0.1, 0, 0.2]}> <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.015, 0.015, 0.4]} /><meshStandardMaterial color="#94a3b8" metalness={1} /></mesh> </group> <group position={[0, -0.6, 0]}> <mesh rotation={[Math.PI, 0, 0]}><cylinderGeometry args={[0.2, 0.3, 0.15, 6]} /><meshStandardMaterial color={detailColor} /></mesh> <mesh position={[0, -0.1, 0]}><cylinderGeometry args={[0.1, 0.1, 0.1, 8]} /><meshBasicMaterial color={glowColor} transparent opacity={0.8} /></mesh> </group> </group> );
    }

    if (isTank) return <TitanTankModel teamColor={teamColor} moving={moving} railFiredAt={railgunFiredAt} aimRef={turretAimRef} flashRef={flashRef} decoy={isDecoy} />;

    if (isBanshee) return <BansheeModel teamColor={teamColor} moving={moving} jamming={!!jammerActive && battery > 0} tethered={tetherTargetIds?.length ?? 0} />;
    if (isCourier) { const payloadColor = courierPayload === 'emp' ? '#38bdf8' : '#ffffff'; return ( <group scale={[2.2, 2.2, 2.2]}> <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.9, 0.4, 1.8]} /><meshStandardMaterial color="#475569" metalness={0.6} /><Edges color={teamColor} /></mesh> {[[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6]].map((pos, i) => (<mesh key={i} position={[pos[0], 0.2, pos[1]]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.2, 0.2, 0.2, 12]} /><meshStandardMaterial color="#1e293b" /></mesh>))} <mesh position={[0, 0.6, 0.5]}><boxGeometry args={[0.8, 0.4, 0.6]} /><meshStandardMaterial color="#334155" /><Edges color="#000000" /></mesh> {courierPayload && (<mesh position={[0, 0.5, -0.4]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.8, 8]} /><meshStandardMaterial color={payloadColor} emissive={payloadColor} emissiveIntensity={0.5} /><Edges color="#000000" /></mesh>)} <mesh position={[0, 0.9, 0.5]}><sphereGeometry args={[0.1, 6, 6]} /><meshBasicMaterial color="#f59e0b" /></mesh> </group> ); }
    if (isHelios) return <HeliosModel teamColor={teamColor} mode={heliosMode ?? 'charge'} working={heliosWorking} />;
    if (isSunPlate) return <BatteryMuleModel teamColor={teamColor} moving={moving} planted={!!isDeployed} />;
    if (isBallista) return <BallistaModel teamColor={teamColor} moving={moving} ammoState={ammoState} loadedAmmo={loadedAmmo} loadingProgress={loadingProgress} />;
    if (isMason) return <MasonModel teamColor={teamColor} moving={moving} working={!!constructionTargetId} carrying={!!carrying} tipRef={masonTipRef} />;
    if (isMule) { return ( <group scale={[2.6, 2.6, 2.6]}> <group position={[0, 0.5, 0]}> <mesh><boxGeometry args={[1.0, 0.25, 2.4]} /><meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} /></mesh> <mesh position={[0.6, -0.1, 0]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#334155" /></mesh> <mesh position={[-0.6, -0.1, 0]}><boxGeometry args={[0.2, 0.3, 1.0]} /><meshStandardMaterial color="#334155" /></mesh> </group> {[ { x: 0.65, z: 0.8 }, { x: -0.65, z: 0.8 }, { x: 0.65, z: -0.8 }, { x: -0.65, z: -0.8 } ].map((pos, i) => ( <group key={i} position={[pos.x, 0.35, pos.z]}> <mesh rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.35, 0.35, 0.3, 8]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh> <mesh rotation={[0, 0, pos.x > 0 ? Math.PI/2 : -Math.PI/2]} position={[pos.x > 0 ? 0.16 : -0.16, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.05, 8]} /><meshStandardMaterial color="#475569" metalness={0.6} /></mesh> </group> ))} <group position={[0, 0.9, 0.7]}> <mesh><boxGeometry args={[1.0, 0.8, 0.9]} /><meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} /><Edges color="#64748b" threshold={15} /></mesh> <mesh position={[0, 0.1, 0.46]}><planeGeometry args={[0.9, 0.35]} /><meshStandardMaterial color="#020617" metalness={0.9} roughness={0.1} /></mesh> <mesh position={[0.4, 0.4, -0.3]}><cylinderGeometry args={[0.02, 0.02, 0.8]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0.3, 0.4, -0.3]}><cylinderGeometry args={[0.02, 0.02, 0.5]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0.35, -0.2, 0.46]}><planeGeometry args={[0.15, 0.1]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh> <mesh position={[-0.35, -0.2, 0.46]}><planeGeometry args={[0.15, 0.1]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh> <mesh position={[0.4, 0.41, 0.3]}><boxGeometry args={[0.1, 0.05, 0.1]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> <mesh position={[-0.4, 0.41, 0.3]}><boxGeometry args={[0.1, 0.05, 0.1]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> </group> <group position={[0, 1.0, -0.6]}> <mesh><boxGeometry args={[1.0, 0.9, 1.3]} /><meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} /><Edges color="#1e293b" /></mesh> {[-1, 1].map((dir) => ( <group key={dir} position={[dir * 0.51, 0, 0]} rotation={[0, dir * Math.PI/2, 0]}> <mesh><planeGeometry args={[0.8, 0.5]} /><meshStandardMaterial color="#1e293b" /></mesh> {[0.1, 0, -0.1].map((y, i) => ( <mesh key={i} position={[0, y, 0.01]}><planeGeometry args={[0.6, 0.05]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh> ))} </group> ))} <mesh position={[0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 1.3]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[-0.2, 0.5, 0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 1.3]} /><meshStandardMaterial color="#94a3b8" /></mesh> <mesh position={[0, 0, -0.66]}><boxGeometry args={[0.6, 0.1, 0.05]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh> </group> <mesh position={[0, 0.7, 0.1]}><boxGeometry args={[0.8, 0.6, 0.4]} /><meshStandardMaterial color="#1e293b" /></mesh> </group> ); }
    if (isGuardian) return <GuardianModel teamColor={teamColor} moving={moving} trophyCooling={trophyCooling} />;
    if (isGhost) return (
        <group>
            <group scale={4.2} rotation={[0, Math.PI, 0]}>
                <GhostModel />
            </group>
            {/* Dampener running: a wall of black and white glitch bars at the field's edge. */}
            {isDampenerActive && powered && (
                <GlitchField radius={ABILITY_CONFIG.GHOST_DAMPENER_RADIUS * tileSize} height={12} y={-hoverHeight} />
            )}
            <mesh ref={flashRef} position={[0, 2.2, 0]} visible={false} raycast={() => null}><sphereGeometry args={[0.3, 8, 6]} /><meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} /></mesh>
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
    if (isWasp) return <WaspModel teamColor={teamColor} flashRef={flashRef} />;
    if (isDrone) return <InfiltratorModel teamColor={teamColor} radarOn={radarShown} />;
    if (isAttackDrone) return <AttackDroneModel teamColor={teamColor} flashRef={flashRef} />;
    
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
                {/* Doctrine heroes (placeholders, sim/heroes.ts): a gold halo marks them out. */}
                {isHero && <mesh position={[0, 2.1, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.9, 0.08, 6, 24]} /><meshBasicMaterial color="#fbbf24" toneMapped={false} /></mesh>}
                <mesh ref={flashRef} position={[0, 0, 1]} visible={false} raycast={() => null}><sphereGeometry args={[0.3, 8, 6]} /><meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} /></mesh>
            </group>
        </Float>
    );
  };
  const model = useMemo(renderModel, [
    type, teamColor, hoverHeight, tileSize, aimWorld, ammoState, loadedAmmo, isDeployed, isAnchored, radarShown, isSelected, isDecoy,
    isDampenerActive, powered, fieldGenActive, fieldUp, trophyCooling, carrying, firingLaserAt, courierPayload, constructionTargetId, ciwsTargetId,
    grenadeAt, isHero ? lastAttackTime : 0, isHero || isTank || isGuardian || isSunPlate || isHowitzer || isBallista || isAegis || isBanshee || isMason || isRazorback || isScoutCar ? moving : false, isTank ? railgunFiredAt : 0,
    isBallista ? Math.floor((loadingProgress || 0) / 10) : 0,
    isBanshee ? `${!!jammerActive && battery > 0}|${tetherTargetIds?.length ?? 0}` : 0,
    isHornet && upgrades.includes('hunter_rockets'),
    isHelios ? `${heliosMode ?? 'charge'}|${heliosWorking}` : 0,
  ]);

  useFrame(() => {
    const anchor = radarAnchorRef.current;
    const body = meshRef.current;
    if (!anchor || !body) return;
    const loiter = surveillance?.status === 'active';
    radarScratch.set(
      loiter ? surveillance!.center.x * tileSize - offset : body.position.x,
      0.35,
      loiter ? surveillance!.center.z * tileSize - offset : body.position.z,
    );
    body.updateMatrixWorld();
    body.worldToLocal(radarScratch);
    anchor.position.copy(radarScratch);
    anchor.quaternion.copy(body.quaternion).invert();
  });

  if (!visible) return null;

  // Calculate visual vision radius based on visionRange prop
  const isSurveillanceActive = surveillance && surveillance.status === 'active';
  const effectiveVision = isSurveillanceActive ? ABILITY_CONFIG.SURVEILLANCE_RADIUS : 2;
  const visualVisionRadius = effectiveVision * tileSize;

  return (
    <group 
      ref={meshRef}
      name={`unit-${id}`}
      // Moving units are placed every frame from the glide; only static Sentinels bind here.
      position={isDefenseDrone ? logicalWorldPos : undefined}
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

      {/* Role badge: a team-coloured pictogram floating above the unit, the same size on screen at
          any zoom and drawn over the city, so an army reads at a glance. Hidden while selected. */}
      {!isSelected && !actionMenuOpen && (
        <sprite position={[0, isAir ? 10 : 9, 0]} scale={[0.04, 0.04, 1]} renderOrder={20} raycast={() => null}>
          <spriteMaterial map={roleBadgeTexture(UNIT_ROLE[type] ?? 'infantry', team)} sizeAttenuation={false} depthTest={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      )}

      {/* An ability is running: a coloured ring at the unit's feet (an EMP shows as a red ring). */}
      {buffs && buffs.length > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} raycast={() => null}>
          <ringGeometry args={[tileSize * 0.3, tileSize * 0.36, 24]} />
          <meshBasicMaterial color={BUFF_COLORS[buffs[buffs.length - 1].kind]} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      )}

      {/* Hitbox */}
      <mesh position={[0, 0, 0]} visible={true}>
          <boxGeometry args={[3.5, 3.5, 3.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={bodyRef} key={decoyActive ? 'cloaked' : fieldCloaked ? 'field' : 'solid'}>
        {model}
      </group>

      {decoyActive && (
        <group>
          <mesh position={[0, 0.8, 0]} userData={{ cloakShell: true }} raycast={() => null}>
            <capsuleGeometry args={[0.7, 1.2, 4, 10]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      )}

      {/* Cloaking Field: the edge of the field and a faint dome while it is up. */}
      {isCloakGen && fieldUp && (
        <group position={[0, -hoverHeight + 0.3, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[CLOAK_FIELD.radius * tileSize - 0.5, CLOAK_FIELD.radius * tileSize, 64]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh raycast={() => null}>
            <sphereGeometry args={[CLOAK_FIELD.radius * tileSize, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#a855f7" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
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
      {isBanshee && Array.from({ length: MAX_TETHERS }, (_, i) => (
          <line key={`tether-${i}`}>
              <bufferGeometry ref={(node) => { tetherLineRefs.current[i] = node as THREE.BufferGeometry | null; }} />
              <lineBasicMaterial color="#38bdf8" linewidth={2} transparent opacity={0.7} />
          </line>
      ))}
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
      {(isAir || isDefenseDrone) && !isDrone && (
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
              </group>
          </group>
      )}

      {/* Helios: gold while charging friends, orange-red with a beam while microwaving enemies (HeliosField.tsx). */}
      {isHelios && health > 0 && (
        <HeliosField radius={ABILITY_CONFIG.HELIOS_RADIUS * tileSize} mode={heliosMode ?? 'charge'} groundY={-hoverHeight + 0.3}
          working={heliosWorking} />
      )}
      {/* Your own Banshee: a blue ring always marks its jamming reach, and the field inside it
          shimmers with interference while the jammer is on (JamStatic.tsx). */}
      {isBanshee && ownJammer && health > 0 && <JamRange radius={ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS * tileSize} active={!!jammerActive && battery > 0} y={-hoverHeight + 0.35} />}
      {showTetherRange && (
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
          <ringGeometry args={[ABILITY_CONFIG.BANSHEE_TETHER_RANGE * tileSize, ABILITY_CONFIG.BANSHEE_TETHER_RANGE * tileSize + 0.35, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Ballista selected: how far it can fire, half the map across. */}
      {isBallista && (isSelected || actionMenuOpen) && (
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.8, 0]} raycast={() => null}>
          <ringGeometry args={[ABILITY_CONFIG.BALLISTA_RANGE * tileSize - 1, ABILITY_CONFIG.BALLISTA_RANGE * tileSize + 1, 160]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.55} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {/* Thunderhead anchored and selected: its reach at the side's tier, and the dead zone inside. */}
      {isHowitzer && isDeployed && (isSelected || actionMenuOpen) && (
        <group rotation={[-Math.PI/2, 0, 0]} position={[0, 0.25, 0]}>
          <mesh raycast={() => null}>
            <ringGeometry args={[artilleryRange(howitzerTier) * tileSize - 0.6, artilleryRange(howitzerTier) * tileSize + 0.6, 96]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.6} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh raycast={() => null}>
            <ringGeometry args={[ARTILLERY.minRange * tileSize - 0.3, ARTILLERY.minRange * tileSize + 0.3, 48]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.3} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      )}
      {showBatteryRange && (
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.15, 0]} raycast={() => null}>
          <ringGeometry args={[ABILITY_CONFIG.BATTERY_MULE_RANGE * tileSize, ABILITY_CONFIG.BATTERY_MULE_RANGE * tileSize + 0.45, 64]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Lock-on reticle: drawn over everything so it reads on any vehicle or aircraft. */}
      {isLockCandidate && (
        <mesh rotation={[-Math.PI/2, 0, Math.PI / 4]} position={[0, isAir ? 0 : 1, 0]} raycast={() => null} renderOrder={15}>
          <ringGeometry args={[tileSize * 0.36, tileSize * 0.44, 4]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
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
      {radarRange > 0 && !isDrone && <RadarSweep radius={radarRange * tileSize} y={-hoverHeight + 0.35} strong={isSelected || !!actionMenuOpen} />}
      {/* The Infiltrator's sweep sits on the ground below its radar's centre: under the drone,
          or, on a Surveillance loiter, at the middle of the orbit it flies. */}
      {radarRange > 0 && isDrone && (
        <group ref={radarAnchorRef}>
          <RadarSweep radius={radarRange * tileSize} y={0} strong={isSelected || !!actionMenuOpen} />
        </group>
      )}
      {/* Infected with the Black Wall virus: glitching red and blue code crawling over it. A unit
          catching it from a nearby carrier shows a ring filling up. */}
      {blackwallInfectedAt !== undefined && health > 0 && <BlackwallInfection size={hoverHeight > 20 ? 5 : 3.2} seed={blackwallInfectedAt} />}
      {blackwallInfectedAt === undefined && (blackwallExposureMs ?? 0) > 0 && <BlackwallExposure size={hoverHeight > 20 ? 5 : 3.2} exposureMs={blackwallExposureMs!} />}
      {/* Knocked out by an EMP: a shell of blue static flickering over the machine. */}
      {buffs?.some(b => b.kind === 'emp') && <EmpStatic size={hoverHeight > 20 ? 5 : 4} />}
      {/* Signal jammed by an enemy Banshee: a cloud of TV static and a no-signal glyph. */}
      {isJammed && health > 0 && <JamStatic size={hoverHeight > 20 ? 4.5 : 3} />}
      {isHacked && hackType === 'drain' && (<group><mesh position={[0, 1, 0]} rotation={[Math.random(), Math.random(), Math.random()]} raycast={() => null}><planeGeometry args={[0.5, 0.5]} /><meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} /></mesh></group>)}
      
      {/* Guardian Repair Beam fallback when only a world position is known */}
      {isGuardian && !repairTargetIds?.length && repairTargetPos && (
          <Line
              points={[[0, GUARDIAN_BEAM_ORIGIN_Y, 0], [repairTargetPos.x - logicalWorldPos.x, repairTargetPos.y - logicalWorldPos.y + 0.5, repairTargetPos.z - logicalWorldPos.z]]}
              color="#4ade80"
              lineWidth={2}
          />
      )}

      {/* Bars stay hidden until the unit is selected, or that meter drops below full.
          The action menu occupies this same anchor, so its own copy of the bars is shown instead.
          Drawn as screen-sized sprites (components/UnitBars.tsx), not HTML: one HTML element per
          damaged unit, moved every frame, was a heavy cost in a big fight. */}
      {!isDecoy && !actionMenuOpen && (() => {
          const meters: Meter[] = [];
          if (isSelected || health < maxHealth) meters.push({ ratio: health / maxHealth, color: METER_COLORS.hp });
          // A Kestrel's Regenerative Shield (sim/kestrel.ts), while it has one.
          const shieldCap = type === 'attack_drone' && upgrades.includes('regen_shield') ? shieldMax({ type, maxHealth }) : 0;
          if (shieldCap > 0 && (isSelected || (regenShield ?? 0) < shieldCap)) meters.push({ ratio: (regenShield ?? 0) / shieldCap, color: METER_COLORS.shield });
          if (maxBattery > 0 && (isSelected || battery < maxBattery)) meters.push({ ratio: battery / maxBattery, color: METER_COLORS.battery });
          if (secondaryBattery !== undefined && maxSecondaryBattery !== undefined && (isSelected || secondaryBattery < maxSecondaryBattery)) {
              meters.push({ ratio: secondaryBattery / maxSecondaryBattery, color: METER_COLORS.secondary });
          }
          const charging = chargingStatus !== undefined && chargingStatus > 0 && !isInNanoCloud;
          return meters.length > 0 || charging ? <UnitBars y={4} meters={meters} charging={charging} /> : null;
      })()}

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

                  {type === 'sun_plate' && (
                      <div className={`text-[10px] bg-slate-900/60 ${upgrades.includes('volt_core') ? 'text-sky-300' : 'text-slate-500'} px-2 py-1 rounded flex justify-between gap-2`} title="Passive: when the Battery Mule is destroyed it detonates, dealing 220 electrical damage to enemies within 4 tiles, less toward the edge. Researched at Advanced Research (Tier 2).">
                        <span>Volt Core</span><span className="font-mono">{upgrades.includes('volt_core') ? 'armed' : 'T2 · Research'}</span>
                      </div>
                  )}
                  {type === 'attack_drone' && (
                      <>
                        <div className={`text-[10px] bg-slate-900/60 ${upgrades.includes('flechette_burst') ? 'text-slate-300' : 'text-slate-500'} px-2 py-1 rounded flex justify-between gap-2`} title="Passive: every 5s alongside its machine gun, a shotgun burst that hits its target hard and peppers enemies beside it. Shreds infantry. Researched at Advanced Research (Tier 2).">
                          <span>Flechette Burst</span><span className="font-mono">{upgrades.includes('flechette_burst') ? 'passive' : 'T2 · Research'}</span>
                        </div>
                        <div className={`text-[10px] bg-slate-900/60 ${upgrades.includes('regen_shield') ? 'text-slate-300' : 'text-slate-500'} px-2 py-1 rounded flex justify-between gap-2`} title="A shield worth 25% of its health that takes 25% less damage, and recharges after 10s without being hit. Researched at Advanced Research (Tier 3).">
                          <span>Regenerative Shield</span>
                          <span className="font-mono">{upgrades.includes('regen_shield') ? `${Math.round(regenShield ?? 0)}/${shieldMax({ type, maxHealth })}` : 'T3 · Research'}</span>
                        </div>
                      </>
                  )}
                  {type === 'hero_heavy_metal' && (
                      <div className="text-[10px] bg-slate-900/60 text-slate-300 px-2 py-1 rounded flex justify-between gap-2" title={`Passive: every ${GOLIATH.grenades.cooldownMs / 1000}s while his gun is on a ground target, a volley of ${GOLIATH.grenades.count} grenades from his back lands on and around it.`}>
                        <span>Grenade Launcher</span><span className="font-mono">every {GOLIATH.grenades.cooldownMs / 1000}s</span>
                      </div>
                  )}
                  {isAegis && <CiwsStatus usedMs={ciwsUsedMs ?? 0} reloadUntil={ciwsReloadUntil ?? 0} firing={!!ciwsTargetId} />}

                  {/* New-unit abilities: the tier (teamCompute carries it), and research at Advanced Research for the second. */}
                  {abilitiesFor(type).flatMap(a => {
                      const tierLocked = teamCompute < a.tier;
                      const locked = !abilityUnlocked(a, { tier: Math.max(1, Math.min(3, teamCompute)) as 1 | 2 | 3, upgrades: [...upgrades] });
                      const wait = Math.ceil(Math.max(0, (abilityReadyAt?.[a.id] ?? 0) - Date.now()) / 1000);
                      const active = !!buffs?.some(b => b.kind === a.id);
                      // The EMP rocket has two fire modes, sharing one cooldown.
                      const modes = a.id === 'emp_rocket'
                          ? [{ action: `UNIT_ABILITY:${a.id}:lock`, label: 'EMP Rocket: Lock On', hint: 'Click an enemy vehicle or aircraft in sight; the rocket tracks it to impact.' },
                             { action: `UNIT_ABILITY:${a.id}`, label: 'EMP Rocket: Fire at Location', hint: 'Click a spot; for when nothing is in sight.' }]
                          : [{ action: `UNIT_ABILITY:${a.id}`, label: a.name, hint: '' }];
                      return modes.map(m => (
                          <button
                              key={m.action}
                              disabled={locked || wait > 0}
                              title={`${a.description}${m.hint ? ` ${m.hint}` : ''}${tierLocked ? ` Needs Tier ${a.tier}, then research at Advanced Research.` : locked ? ' Research it at Advanced Research.' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleMenuAction(m.action); }}
                              className={`text-[10px] px-2 py-1 rounded text-left flex justify-between gap-2 ${active ? 'bg-cyan-900 text-cyan-200' : locked ? 'bg-slate-900 text-slate-500' : 'bg-slate-800 hover:bg-slate-700 text-white'} disabled:cursor-not-allowed`}
                          >
                              <span>{m.label}{a.targeted ? ' ⌖' : ''}</span>
                              <span className="font-mono">{tierLocked ? `T${a.tier}` : locked ? 'Research' : wait > 0 ? `${wait}s` : active ? 'ON' : ''}</span>
                          </button>
                      ));
                  })}

                  {/* Actions based on unit type */}
                  {isFieldGen && (() => {
                      // The dome's shield, or the reboot countdown once it has been battered down.
                      const rebootLeft = fieldDownUntil !== undefined ? Math.max(0, Math.ceil((fieldDownUntil - Date.now()) / 1000)) : 0;
                      const shield = fieldShieldHp ?? FORCE_FIELD.shieldHp;
                      return (
                          <div className="px-1">
                              <div className="flex items-center gap-1">
                                  <span className="text-[8px] font-mono text-sky-300 w-5 leading-none">SH</span>
                                  <div className="hud-meter flex-1 h-2">
                                      <div className="h-full" style={{ width: `${(shield / FORCE_FIELD.shieldHp) * 100}%`, background: '#38bdf8' }} />
                                  </div>
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5">
                                  {fieldDownUntil !== undefined ? `Shield down: rebooting ${rebootLeft}s` : battery <= 0 ? 'No power: dome down' : `Shield ${Math.round(shield)} / ${FORCE_FIELD.shieldHp}`}
                              </div>
                          </div>
                      );
                  })()}
                  {isCloakGen && (
                      <button
                          onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_CLOAK_FIELD'); }}
                          title="Switch the Cloaking Field off (saves battery; everything in it can be seen) or back on."
                          className={`text-[10px] ${cloakFieldOff ? 'bg-slate-800 text-white' : 'bg-fuchsia-900 text-fuchsia-200'} hover:bg-slate-700 px-2 py-1 rounded text-left flex justify-between gap-2`}
                      >
                          <span>Cloaking Field</span>
                          <span className="font-mono">{cloakFieldOff ? 'OFF' : fieldUp ? 'ON' : 'NO POWER'}</span>
                      </button>
                  )}
                  {isGhost && (
                      <>
                        {/* Abilities are researched at Advanced Research (sim/upgrades.ts): locked ones say so. */}
                        {upgrades.includes('dampener') ? (
                          <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE DAMPENER'); }} className={`text-[10px] ${isDampenerActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Dampener</button>
                        ) : (
                          <div className="text-[10px] bg-slate-900/60 text-slate-500 px-2 py-1 rounded">Dampener · T2 · Research</div>
                        )}
                        {upgrades.includes('phantom_decoy') || decoyActive ? (
                          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleMenuAction('PHANTOM_DECOY_INIT'); }} className={`text-[10px] ${decoyActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>{decoyActive ? 'Phantom Decoy (On)' : 'Phantom Decoy'}</button>
                        ) : (
                          <div className="text-[10px] bg-slate-900/60 text-slate-500 px-2 py-1 rounded">Phantom Decoy · T3 · Research</div>
                        )}
                      </>
                  )}
                  {isHelios && (
                      <>
                        <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Mode</div>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('HELIOS_CHARGE'); }} className={`text-[10px] ${heliosMode !== 'burn' ? 'bg-amber-900 text-amber-200' : 'bg-slate-800 text-white hover:bg-slate-700'} px-2 py-1 rounded text-left`}>Charge Friendlies{heliosMode !== 'burn' ? ' (On)' : ''}</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('HELIOS_BURN'); }} className={`text-[10px] ${heliosMode === 'burn' ? 'bg-red-900 text-red-200' : 'bg-slate-800 text-white hover:bg-slate-700'} px-2 py-1 rounded text-left`}>Microwave Enemies{heliosMode === 'burn' ? ' (On)' : ''}</button>
                      </>
                  )}
                  {isBanshee && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_JAMMER'); }} className={`text-[10px] ${jammerActive ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Toggle Jammer</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('HARDLINE_TETHER'); }} className={`text-[10px] ${(tetherTargetIds?.length ?? 0) > 0 || isTargetingMode ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>Tether Drones ({tetherTargetIds?.length ?? 0}/{MAX_TETHERS})</button>
                        {(tetherTargetIds?.length ?? 0) > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); handleMenuAction('DISCONNECT_TETHER'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Disconnect</button>
                        )}
                      </>
                  )}
                  {isHowitzer && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TOGGLE_ANCHOR'); }} disabled={!isDeployed && path.length > 0} className={`text-[10px] ${isDeployed ? 'bg-orange-900 text-orange-200' : path.length > 0 ? 'bg-slate-900 text-slate-500' : 'bg-slate-800 text-white'} hover:bg-slate-700 px-2 py-1 rounded text-left`}>{isDeployed ? 'Pack Up' : path.length > 0 ? 'Stop to Anchor' : 'Anchor Down'}</button>
                        <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FIRE_MISSION'); }} disabled={!isDeployed} className={`text-[10px] ${isDeployed ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-900 text-slate-500'} px-2 py-1 rounded text-left flex justify-between`}><span>{isTargetingMode ? 'Pick Target' : 'Fire Mission'}</span><span>{artilleryRange(howitzerTier)} tiles</span></button>
                        {artilleryTarget && (
                          <button onClick={(e) => { e.stopPropagation(); handleMenuAction('CEASE_FIRE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Cease Fire</button>
                        )}
                        <div className="text-[9px] text-slate-400 px-1">{!isDeployed ? 'Mobile: cannot fire' : settingUp ? 'Setting up…' : artilleryTarget ? 'Shelling target' : 'Firing on sight'}</div>
                      </>
                  )}
                  {isSunPlate && (
                      <>
                        {/* Charging is automatic, moving or parked: lowest battery first (sim/energy.ts muleLinks). */}
                        <div className="text-[9px] font-mono px-1 flex justify-between">
                          <span className="text-yellow-300">Auto-charging</span>
                          <span className="text-slate-400">{(batteryTetherIds || []).length}/{ABILITY_CONFIG.BATTERY_MULE_SLOTS}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 px-1">Lowest battery first · {ABILITY_CONFIG.BATTERY_MULE_RANGE} tiles</div>
                      </>
                  )}
                  {isDrone && (
                      <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOITERING SURVEILLANCE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Surveillance</button>
                  )}
                  {isBombard && (
                      <>
                        <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Bombardment</div>
                        {(() => {
                          const ammo = bombardMunitions ?? BOMBARD.magazine;
                          const status = bombardmentTarget
                            ? (path.length === 0 && gridPos.x === bombardmentTarget.x && gridPos.z === bombardmentTarget.z ? 'Bombarding' : 'On approach')
                            : bombardReturning ? 'Returning to rearm'
                            : bombardRearmStartedAt !== undefined ? 'Rearming at base'
                            : ammo <= 0 ? 'Empty: send it to a base' : 'Ready';
                          return (
                            <>
                              <div className="flex justify-between items-center px-1 mb-1">
                                <span className="text-[9px] text-slate-400">Munitions</span>
                                <span className="flex gap-0.5">
                                  {Array.from({ length: BOMBARD.magazine }, (_, i) => (
                                    <span key={i} style={{ width: 6, height: 10, background: i < ammo ? '#fb923c' : '#334155' }} className="inline-block rounded-sm" />
                                  ))}
                                </span>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('BOMBARD'); }} disabled={ammo <= 0} className={`text-[10px] ${ammo <= 0 ? 'bg-slate-900 text-slate-500' : bombardmentTarget ? 'bg-orange-900 text-orange-200 hover:bg-slate-700' : 'bg-slate-800 text-orange-300 hover:bg-slate-700'} px-2 py-1 rounded text-left`}>{isTargetingMode ? 'Pick Target' : 'Bombard'}</button>
                              {bombardmentTarget && (
                                <button onClick={(e) => { e.stopPropagation(); handleMenuAction('CEASE_BOMBARD'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-left">Cease Bombard</button>
                              )}
                              <div className="text-[9px] text-slate-500 px-1">{status}</div>
                            </>
                          );
                        })()}
                      </>
                  )}
                  {isMule && (() => {
                      const material = ordnanceMaterial ?? 0;
                      const empReady = missileInventory?.emp ?? 0;
                      const heReady = missileInventory?.he ?? 0;
                      const wpReady = missileInventory?.wp ?? 0;
                      const held = empReady + heReady + wpReady;
                      const room = ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY - held;
                      const busy = !!fabrication?.active;
                      const canFabricateEmp = material > 0 && !busy && (cores ?? 0) >= ABILITY_CONFIG.WARHEAD_COST_EMP;
                      const canFabricateHe = material > 0 && !busy && (cores ?? 0) >= ABILITY_CONFIG.WARHEAD_COST_HE;
                      const canFabricateWp = material > 0 && !busy && (cores ?? 0) >= ABILITY_CONFIG.WARHEAD_COST_WP;
                      const canLoad = !!atOrdnanceFab && material < room;
                      return (
                          <>
                              <div className="text-[9px] text-slate-400 uppercase font-mono mb-1">Field Fabricator</div>
                              <div className="text-[10px] text-amber-300 px-2 py-1 bg-slate-900/50 rounded">Material {material}/{ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY}</div>
                              <div className="text-[9px] text-slate-500 font-mono px-1">EMP {empReady} · HE {heReady} · WP {wpReady}</div>
                              {busy && fabrication && (
                                  <div className="px-1">
                                      <div className="text-[9px] text-yellow-300 font-mono uppercase">
                                          Fabricating {WARHEAD_LABEL[fabrication.item]} {Math.min(100, Math.floor((fabrication.progress / fabrication.totalTime) * 100))}%
                                      </div>
                                      <div className="hud-meter w-full h-1.5 mt-1">
                                          <div className="hud-meter-cell h-full" style={{ width: `${Math.max(4, Math.min(100, (fabrication.progress / fabrication.totalTime) * 100))}%` }} />
                                      </div>
                                  </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FABRICATE_EMP'); }} disabled={!canFabricateEmp} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-400 px-2 py-1 rounded text-left flex justify-between disabled:opacity-40"><span>Fabricate EMP</span><span>{ABILITY_CONFIG.WARHEAD_COST_EMP}</span></button>
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FABRICATE_HE'); }} disabled={!canFabricateHe} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left flex justify-between disabled:opacity-40"><span>Fabricate HE</span><span>{ABILITY_CONFIG.WARHEAD_COST_HE}</span></button>
                              <button onClick={(e) => { e.stopPropagation(); handleMenuAction('FABRICATE_WP'); }} disabled={!canFabricateWp} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-orange-200 px-2 py-1 rounded text-left flex justify-between disabled:opacity-40"><span>Fabricate WP</span><span>{ABILITY_CONFIG.WARHEAD_COST_WP}</span></button>
                              {canLoad && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('RESUPPLY_MATERIAL'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded text-left">Load Material</button>
                              )}
                              {room <= 0 && (
                                  <div className="text-[9px] text-slate-500 px-1">Bay full — hand missiles to a Ballista</div>
                              )}
                              {room > 0 && material < room && !atOrdnanceFab && (
                                  <div className="text-[9px] text-slate-500 px-1">Drive to an Ordnance Fab to load material</div>
                              )}
                              {empReady > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TRANSFER_EMP'); }} disabled={!ballistaInRange} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-300 px-2 py-1 rounded text-left disabled:opacity-40">Transfer EMP ({empReady})</button>
                              )}
                              {heReady > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TRANSFER_HE'); }} disabled={!ballistaInRange} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-300 px-2 py-1 rounded text-left disabled:opacity-40">Transfer HE ({heReady})</button>
                              )}
                              {wpReady > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TRANSFER_WP'); }} disabled={!ballistaInRange} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-orange-200 px-2 py-1 rounded text-left disabled:opacity-40">Transfer WP ({wpReady})</button>
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
                                    <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TAKE_EMP'); }} disabled={!warheadStock?.emp} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-400 px-2 py-1 rounded text-left disabled:opacity-40">Take EMP ({warheadStock?.emp ?? 0})</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TAKE_HE'); }} disabled={!warheadStock?.he} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left disabled:opacity-40">Take HE ({warheadStock?.he ?? 0})</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleMenuAction('TAKE_WP'); }} disabled={!warheadStock?.wp} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-orange-200 px-2 py-1 rounded text-left disabled:opacity-40">Take WP ({warheadStock?.wp ?? 0})</button>
                                  </>
                                ) : (
                                  <div className="text-[9px] text-slate-500 px-1">Drive to an Ordnance Fab to resupply</div>
                                )}
                                {missileInventory && missileInventory.emp > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_EMP'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-400 px-2 py-1 rounded text-left">Load EMP ({missileInventory.emp})</button>
                                )}
                                {missileInventory && missileInventory.he > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_HE'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded text-left">Load HE ({missileInventory.he})</button>
                                )}
                                {missileInventory && missileInventory.wp > 0 && (
                                     <button onClick={(e) => { e.stopPropagation(); handleMenuAction('LOAD_AMMO_WP'); }} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-orange-200 px-2 py-1 rounded text-left">Load WP ({missileInventory.wp})</button>
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
