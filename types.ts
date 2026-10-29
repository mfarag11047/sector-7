
import React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Three.js elements
      group: any;
      mesh: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      boxGeometry: any;
      cylinderGeometry: any;
      sphereGeometry: any;
      octahedronGeometry: any;
      dodecahedronGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      torusGeometry: any;
      primitive: any;
      color: any;
      fog: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      coneGeometry: any;
      line: any;
      bufferGeometry: any;
      lineBasicMaterial: any;
      instancedMesh: any;

      // HTML elements
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
      span: React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>;
      h1: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h2: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h3: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      p: React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>;
      button: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
      br: React.DetailedHTMLProps<React.HTMLAttributes<HTMLBRElement>, HTMLBRElement>;
      ul: React.DetailedHTMLProps<React.HTMLAttributes<HTMLUListElement>, HTMLUListElement>;
      li: React.DetailedHTMLProps<React.HTMLAttributes<HTMLLIElement>, HTMLLIElement>;
      img: React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;
      input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
      
      // SVG elements
      svg: React.SVGProps<SVGSVGElement>;
      rect: React.SVGProps<SVGRectElement>;
      text: React.SVGProps<SVGTextElement>;
      circle: React.SVGProps<SVGCircleElement>;
      polyline: React.SVGProps<SVGPolylineElement>;
    }
  }
}

export interface BuildingData {
  id: string;
  gridX: number;
  gridZ: number;
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  type: 'residential' | 'commercial' | 'industrial' | 'hightech' | 'server_node' | 'core_node';
  height: number;
  blockId: string;
  owner: 'blue' | 'red' | null;
  captureProgress: number;
  capturingTeam: 'blue' | 'red' | null;
  health: number;
  maxHealth: number;
  destroyed?: boolean;
  // The whole building this tile is part of, for city buildings: its first tile and size in
  // tiles, and on a tower-on-podium building, the tile the tower rises from.
  footprint?: { x: number; z: number; w: number; d: number; tower?: { x: number; z: number } };
  // Its city lot (sim/bases.ts) has a street or avenue running through it, so it is two blocks
  // split by a road, not one whole block: levelling it never opens a base site.
  splitLot?: boolean;
}

export interface BuildingBlock {
  id: string;
  type: BuildingData['type'];
  buildingIds: string[];
  owner: 'blue' | 'red' | null;
}

export type UnitType = 'drone' | 'tank' | 'ghost' | 'guardian' | 'mule' | 'wasp' | 'mason' | 'helios' | 'sun_plate' | 'ballista' | 'courier' | 'banshee' | 'defense_drone' | 'titan_dropped' | 'swarm_host' | 'crawler_drone' | 'bombard' | 'trooper' | 'lancer' | 'razorback' | 'aegis' | 'hornet' | 'howitzer' | 'cloak_generator' | 'field_generator' | 'scout_car' | 'attack_drone'
  // Doctrine heroes (sim/heroes.ts): one per doctrine, placeholders for now.
  | 'hero_heavy_metal' | 'hero_shadow_ops' | 'hero_netrunner';
export type UnitClass = 'support' | 'infantry' | 'armor' | 'ordnance' | 'air' | 'builder' | 'defense';

export interface UnitData {
  // Timed effects from unit abilities (sim/unitAbilities.ts), and when each ability is ready again.
  buffs?: { kind: 'stim' | 'nanoweave' | 'overcharge' | 'nitro' | 'overclock' | 'barrage' | 'radar' | 'afterburner' | 'emp' | 'smoke' | 'piercing_round' | 'shadow_cloak'; until: number }[];
  abilityReadyAt?: Record<string, number>;
  id: string;
  type: UnitType;
  unitClass: UnitClass;
  team: 'blue' | 'red' | 'neutral';
  gridPos: { x: number; z: number };
  path: string[];
  // Fraction of the step from gridPos to moveTarget covered so far (0 to 1). See sim/movement.ts.
  moveProgress?: number;
  moveTarget?: string;
  moveSpeed?: number; // World units per second on the current step
  visionRange: number;
  health: number;
  maxHealth: number;
  battery: number;
  maxBattery: number;
  
  // Status Effects & Doctrine fields
  isStunned?: boolean;
  stunDuration?: number;
  isStealthed?: boolean;
  activeBuffs?: ('speed' | 'damage' | 'regen')[];
  lastDamageTime?: number;
  // Tank rail gun (sim/railgun.ts): when it last fired.
  railgunFiredAt?: number;
  // Hornet Tier 3 anti-vehicle rocket (sim/hornet.ts): when it last fired.
  hornetRocketAt?: number;
  // Kestrel (sim/kestrel.ts): when its Flechette Burst last fired, and its Regenerative Shield left.
  flechetteAt?: number;
  // Goliath, the Heavy Metal hero (sim/heavyMetalHero.ts): when his grenade launcher last fired.
  grenadeAt?: number;
  regenShield?: number;
  // Upgrades its side has researched for its type (sim/upgrades.ts): each adds health and damage.
  upgradeLevel?: number;
  // Inside a friendly Cloaking Field and hidden from the enemy (sim/cloak.ts).
  fieldCloaked?: boolean;
  // A Cloaking Field Generator its owner has switched off.
  cloakFieldOff?: boolean;
  
  // New Decoy Fields
  decoyActive?: boolean;
  decoyStartTime?: number;

  // Existing extended fields
  secondaryBattery?: number;
  maxSecondaryBattery?: number;
  chargingStatus?: number; // 0=none, 1=helios or grid, 2=battery mule tether
  isInNanoCloud?: boolean; // Standing in a nano cloud: no Helios charging, no shooting
  cargo?: number;
  constructionTargetId?: string | null;
  isDampenerActive?: boolean;
  isDeployed?: boolean; // Battery Mule or Thunderhead anchor. While planted it cannot move.
  // Thunderhead battery (sim/artillery.ts): when it planted, the tile its fire mission is
  // shelling, and where its last shell was aimed (for the gun to point at).
  anchoredAt?: number;
  // Aegis CIWS (sim/ciws.ts): magazine used (ms of fire), reloading until, last shot, and target.
  ciwsUsedMs?: number;
  ciwsReloadUntil?: number;
  ciwsLastFiredAt?: number;
  ciwsTargetId?: string | null;
  artilleryTarget?: { x: number; z: number } | null;
  artilleryAim?: { x: number; z: number } | null;
  batteryTetherIds?: string[]; // Vehicles the anchored Battery Mule is feeding
  isAnchored?: boolean; // Added for Swarm Host
  anchorTime?: number; // Added for Swarm Host spawn delay logic
  lastSpawnTime?: number; // Added for Swarm Host interval logic
  spawnedUnitIds?: string[]; // Added to track child units
  crawlerTargetId?: string | null; // Enemy a Crawler Drone is currently hunting
  jammerActive?: boolean;
  // Drones on this Banshee's hardline tether (at most MAX_TETHERS, sim/jamming.ts).
  tetherTargetIds?: string[];
  isHacked?: boolean;
  hackType?: 'recall' | 'drain' | null;
  hackedBy?: string | null;
  isJammed?: boolean;
  // Helios mode (sim/helios.ts): charging friendly units, or microwaving enemies. Charge if unset.
  heliosMode?: 'charge' | 'burn';
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'emp' | 'he' | 'wp' | null;
  missileInventory?: { emp: number; he: number; wp: number };
  // Field Fabricator: untyped charges, spent one per missile fabricated in the field.
  ordnanceMaterial?: number;
  fabrication?: { active: boolean; item: 'emp' | 'he' | 'wp'; progress: number; totalTime: number };
  loadingProgress?: number;
  courierTargetId?: string;
  courierPayload?: 'emp' | 'he' | 'wp';
  bombardmentTarget?: { x: number; z: number } | null;
  // Bombardment Drone munitions (sim/bombard.ts): drops left (undefined = a full load), when it
  // last dropped, flying home empty, and when it started rearming at a base.
  bombardMunitions?: number;
  // Black Wall virus (sim/blackwall.ts): when it was infected, and how long it has stood near an
  // infected friend without catching it yet.
  // Bulwark Force Field generator (sim/forcefield.ts): the shield's health left, and while it
  // reboots after being battered down, when it comes back.
  fieldShieldHp?: number;
  fieldDownUntil?: number;
  blackwallInfectedAt?: number;
  blackwallExposureMs?: number;
  bombardLastStrikeAt?: number;
  bombardReturning?: boolean;
  bombardRearmStartedAt?: number;
  firingLaserAt?: string | null;
  lastAttackTime?: number;
  // What this unit's weapon is aimed at this tick (sim/combat.ts resolveAttacks).
  combatTargetId?: string | null;
  // Attack-move: stop to fight anything in range, then carry on along the path.
  attackMove?: boolean;
  charges?: {
    swarm?: number;
  };
  cooldowns: {
    trophySystem?: number;
    combatPrint?: number;
    swarmLaunch?: number;
    smogShell?: number;
    mainCannon?: number;
    spawnWasp?: number; 
    spawnCrawler?: number; // Swarm Host periodic Crawler Drone production
  };
  repairTargetId?: string | null;
  repairTargetIds?: string[];
  surveillance?: {
    active: boolean;
    status: 'traveling' | 'active' | 'returning';
    center: { x: number, z: number };
    returnPos: { x: number, z: number };
    startTime?: number;
  };
  // Hierarchy
  parentId?: string;
  // A Swarm Host's canisters, each carrying a Crawler Drone: where it will land and when it is
  // fired. The drone comes into being only when its canister lands (landCrawlers, sim/support.ts).
  pendingCrawlers?: { at: { x: number, z: number }; launchAt: number }[];
}

export type StructureType = 'support' | 'infantry' | 'armor' | 'ordnance' | 'air' | 'builder' | 'ordnance_fab' | 'research_lab' | 'refinery' | 'wall_tier1' | 'wall_tier2' | 'defense' | 'aa_turret' | 'hq' | 'base_wall' | 'base_gate';

export interface StructureData {
  id: string;
  type: StructureType;
  team: 'blue' | 'red';
  gridPos: { x: number; z: number };
  isBlueprint: boolean;
  constructionProgress: number;
  maxProgress: number;
  health: number;
  maxHealth: number;
  production?: {
      active: boolean;
      item: 'emp' | 'he' | 'wp';
      progress: number;
      totalTime: number;
  };
  // An Advanced Research building's upgrade in progress (sim/upgrades.ts).
  research?: { upgrade: import('./sim/upgrades').UpgradeId; remainingMs: number; totalMs: number };
  // A Core Refinery's level (1 unless upgraded) and its upgrade to level 2 in progress (sim/refinery.ts).
  refineryLevel?: 1 | 2;
  refineryUpgrade?: { remainingMs: number; totalMs: number };
  // Being taken down by its owner, and what that pays back when done (sim/dismantle.ts).
  dismantle?: { remainingMs: number; totalMs: number; refund: number };
  // Base structures take time to go up and cannot train or fire until finished.
  buildRemainingMs?: number;
  buildTotalMs?: number;
  // Units in training, front first. Pop and cores are paid when queued.
  queue?: { unitType: UnitType; remainingMs: number; totalMs: number }[];
  // New units walk here.
  rallyPoint?: { x: number; z: number } | null;
  // HQ and Sentry Turret weapons.
  lastAttackTime?: number;
  combatTargetId?: string | null;
  // A buildable wall (Dragon's Teeth, Bulwark Wall): which way its barrier runs across the tile (sim/walls.ts).
  wallRun?: 'x' | 'z';
  // Ordnance Fab: when its silo can launch again after a missile left it (sim/abilities.ts FAB_LAUNCH).
  siloReadyAt?: number;
  // CIWS turret (sim/ciws.ts): magazine used (ms of fire), reloading until, last shot, target.
  ciwsUsedMs?: number;
  ciwsReloadUntil?: number;
  ciwsLastFiredAt?: number;
  ciwsTargetId?: string | null;
}

export type RoadType = 'main' | 'street' | 'open';

export interface RoadTileData {
  x: number;
  z: number;
  type: RoadType;
}

export type DoctrineType = 'heavy_metal' | 'shadow_ops' | 'netrunner';

export interface DoctrineState {
  selected: DoctrineType | null;
  unlockedTiers: number; // 0, 1, 2, 3
  cooldowns: {
    tier2: number;
    tier3: number;
  };
}

export interface TeamStats {
  resources: number;
  income: number;
  compute: number;
  // Compute per second, the researched tech tier, and population used / cap.
  computeRate?: number;
  tier?: number;
  pop?: number;
  popCap?: number;
  // Energy-grid tiles its captured buildings cover, which raise the population cap.
  gridTiles?: number;
  units: number;
  buildings: {
    residential: number;
    commercial: number;
    industrial: number;
    hightech: number;
    server_node: number;
    core_node: number;
  };
  stockpile: {
      emp: number;
      he: number;
      wp: number;
  };
  doctrine?: DoctrineState;
}

export interface GameStats {
  blue: TeamStats;
  red: TeamStats;
}

export interface MinimapMissile {
    id: string;
    team: 'blue' | 'red' | 'neutral';
    x: number;
    z: number;
    targetX: number;
    targetZ: number;
}

export interface MinimapData {
    units: UnitData[];
    buildings: BuildingData[];
    structures: StructureData[];
    roadTiles: RoadTileData[];
    gridSize: number;
    selectedUnitIds?: string[];
    missiles?: MinimapMissile[];
    // Aegis radar: enemy contacts as plain dots, and where your radars are.
    radarContacts?: { id: string; x: number; z: number }[];
    // Enemy missiles in flight, without their live position: where each launched from, and once
    // it has passed halfway, one blip at the midpoint of its course.
    missileWarnings?: { id: string; launchX: number; launchZ: number; midX?: number; midZ?: number }[];
    radars?: { x: number; z: number; range: number }[];
    // Fighting involving the player: from the attacker to its target, in tiles. `hostile` is an
    // enemy shooting at one of the player's units or structures.
    engagements?: { id: string; fromX: number; fromZ: number; toX: number; toZ: number; hostile: boolean }[];
}

export interface DecoyData {
  id: string;
  team: 'blue' | 'red';
  gridPos: { x: number; z: number };
  createdAt: number;
  ownerId?: string; // Ghost whose Phantom Decoy spawned this projection
  path?: string[]; // Scatter route, starting from the owner's tile
  moveProgress?: number;
  moveTarget?: string;
  moveSpeed?: number;
}

export interface CloudData {
    id: string;
    type: 'emp' | 'he' | 'nano' | 'wp';
    team: 'blue' | 'red' | 'neutral';
    gridPos: { x: number; z: number };
    radius: number;
    duration: number;
    createdAt: number;
}

export interface Projectile {
    id: string;
    ownerId: string;
    team: 'blue' | 'red' | 'neutral';
    position: { x: number, y: number, z: number };
    velocity: { x: number, y: number, z: number };
    damage: number;
    radius: number;
    maxDistance: number;
    distanceTraveled: number;
    targetPos?: { x: number, y: number, z: number }; // For guided/ballistic
    trajectory: 'direct' | 'ballistic' | 'swarm';
    payload?: 'emp' | 'he' | 'wp' | 'nano_canister' | 'nano_cloud_master' | 'titan_drop' | 'cloak_drop' | 'field_drop' | null; // For warheads
    startPos?: { x: number, y: number, z: number };
    startTime?: number;
    lockedTargetId?: string | null; // For swarm homing
    // Aim point refreshed by the sim. The mesh steers toward this every frame
    // so homing stays smooth while collision still runs on the slow tick.
    guidePos?: { x: number, y: number, z: number };
    phase?: 'ascent' | 'cruise' | 'terminal';
}

export interface Explosion {
    id: string;
    position: { x: number, y: number, z: number };
    radius: number;
    duration: number;
    createdAt: number;
    // 'emp': a blue energy discharge whose ring reaches `radius`, instead of a fireball.
    // 'blackwall': the Black Wall virus bomb's glitching blast.
    // 'shield': a shot or projectile stopped on a force field's skin.
    style?: 'emp' | 'blackwall' | 'shield' | 'airburst';
}

export interface CityConfig {
  gridSize: number;
  tileSize: number;
}
