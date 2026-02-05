
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
  type: 'residential' | 'commercial' | 'industrial' | 'hightech' | 'server_node';
  height: number;
  blockId: string;
  owner: 'blue' | 'red' | null;
  captureProgress: number;
  capturingTeam: 'blue' | 'red' | null;
}

export interface BuildingBlock {
  id: string;
  type: BuildingData['type'];
  buildingIds: string[];
  owner: 'blue' | 'red' | null;
}

export type UnitType = 'drone' | 'tank' | 'ghost' | 'guardian' | 'mule' | 'wasp' | 'mason' | 'helios' | 'sun_plate' | 'ballista' | 'courier' | 'banshee' | 'defense_drone' | 'titan_dropped' | 'swarm_host' | 'crawler_drone';
export type UnitClass = 'support' | 'infantry' | 'armor' | 'ordnance' | 'air' | 'builder' | 'defense';

export interface UnitData {
  id: string;
  type: UnitType;
  unitClass: UnitClass;
  team: 'blue' | 'red' | 'neutral';
  gridPos: { x: number; z: number };
  path: string[];
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
  
  // New Decoy Fields
  decoyActive?: boolean;
  decoyStartTime?: number;

  // Existing extended fields
  secondaryBattery?: number;
  maxSecondaryBattery?: number;
  chargingStatus?: number; // 0=none, 1=helios, 2=sunplate
  cargo?: number;
  constructionTargetId?: string | null;
  isDampenerActive?: boolean;
  isDeployed?: boolean;
  isAnchored?: boolean; // Added for Swarm Host
  anchorTime?: number; // Added for Swarm Host spawn delay logic
  lastSpawnTime?: number; // Added for Swarm Host interval logic
  spawnedUnitIds?: string[]; // Added to track child units
  jammerActive?: boolean;
  tetherTargetId?: string | null;
  isHacked?: boolean;
  hackType?: 'recall' | 'drain' | null;
  hackedBy?: string | null;
  isJammed?: boolean;
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'eclipse' | 'wp' | null;
  missileInventory?: { eclipse: number; wp: number };
  loadingProgress?: number;
  courierTargetId?: string;
  courierPayload?: 'eclipse' | 'wp';
  firingLaserAt?: string | null;
  lastAttackTime?: number;
  charges?: {
    smoke?: number;
    aps?: number;
    swarm?: number;
  };
  smoke?: {
    active: boolean;
    remainingTime: number;
  };
  aps?: {
    active: boolean;
    remainingTime: number;
  };
  cooldowns: {
    trophySystem?: number;
    titanAps?: number;
    titanSmoke?: number;
    combatPrint?: number;
    swarmLaunch?: number;
    smogShell?: number;
    mainCannon?: number;
    spawnWasp?: number; 
  };
  repairTargetId?: string | null;
  surveillance?: {
    active: boolean;
    status: 'traveling' | 'active' | 'returning';
    center: { x: number, z: number };
    returnPos: { x: number, z: number };
    startTime?: number;
  };
  // Hierarchy
  parentId?: string;
}

export type StructureType = 'support' | 'infantry' | 'armor' | 'ordnance' | 'air' | 'builder' | 'ordnance_fab' | 'wall_tier1' | 'wall_tier2' | 'defense';

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
      item: 'eclipse' | 'wp';
      progress: number;
      totalTime: number;
  };
}

export type RoadType = 'main' | 'street' | 'open';

export interface RoadTileData {
  x: number;
  z: number;
  type: RoadType;
}

export type DoctrineType = 'heavy_metal' | 'shadow_ops' | 'skunkworks';

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
  units: number;
  buildings: {
    residential: number;
    commercial: number;
    industrial: number;
    hightech: number;
    server_node: number;
  };
  stockpile: {
      eclipse: number;
      wp: number;
  };
  doctrine?: DoctrineState;
}

export interface GameStats {
  blue: TeamStats;
  red: TeamStats;
}

export interface MinimapData {
    units: UnitData[];
    buildings: BuildingData[];
    structures: StructureData[];
    roadTiles: RoadTileData[];
    gridSize: number;
    selectedUnitIds?: string[];
}

export interface DecoyData {
  id: string;
  team: 'blue' | 'red';
  gridPos: { x: number; z: number };
  createdAt: number;
}

export interface CloudData {
    id: string;
    type: 'eclipse' | 'wp';
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
    payload?: 'eclipse' | 'wp' | null; // For warheads
    startPos?: { x: number, y: number, z: number };
    startTime?: number;
    lockedTargetId?: string | null; // For swarm homing
    phase?: 'ascent' | 'cruise' | 'terminal';
}

export interface Explosion {
    id: string;
    position: { x: number, y: number, z: number };
    radius: number;
    duration: number;
    createdAt: number;
}

export interface CityConfig {
  gridSize: number;
  tileSize: number;
  buildingDensity: number;
}
