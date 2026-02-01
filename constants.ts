
import { CityConfig, UnitClass, StructureType, UnitType, DoctrineType } from './types';

export const CITY_CONFIG: CityConfig = {
  gridSize: 80, 
  tileSize: 14, 
  buildingDensity: 0.15, // Adjusted for clumping
};

export const BUILDING_VALUES = {
  residential: { captureSpeed: 20, income: 5, label: 'Residential' },
  industrial: { captureSpeed: 12, income: 15, label: 'Industrial' },
  commercial: { captureSpeed: 8, income: 30, label: 'Commercial' },
  hightech: { captureSpeed: 5, income: 60, label: 'High-Tech' },
  server_node: { captureSpeed: 5, income: 0, label: 'Server Node' }, // 3x slower capture, gives Compute instead of income
};

export const COMPUTE_GATES = {
  PHANTOM_DECOY: 1,
  TROPHY_SYSTEM: 2,
  SYSTEM_OVERRIDE: 3,
  LAUNCH_ORDNANCE: 4,
};

export const UNIT_STATS: Record<UnitType, { captureMultiplier: number, label: string, visionRange: number, speedMod: number, maxHealth: number, attackDamage: number, attackCooldown: number, cost: number, unitClass: UnitClass }> = {
  drone: { unitClass: 'air', cost: 50, captureMultiplier: 1.5, label: 'Infiltrator Drone', visionRange: 2, speedMod: 1.2, maxHealth: 50, attackDamage: 5, attackCooldown: 1000 },
  tank: { unitClass: 'armor', cost: 300, captureMultiplier: 0.5, label: 'Titan Main Battle Tank', visionRange: 3, speedMod: 0.7, maxHealth: 400, attackDamage: 25, attackCooldown: 2000 }, 
  ghost: { unitClass: 'infantry', cost: 150, captureMultiplier: 1.0, label: 'Ghost EW Specialist', visionRange: 3, speedMod: 1.0, maxHealth: 80, attackDamage: 8, attackCooldown: 800 },
  guardian: { unitClass: 'support', cost: 200, captureMultiplier: 0.2, label: 'Guardian UGV', visionRange: 3, speedMod: 0.6, maxHealth: 150, attackDamage: 0, attackCooldown: 0 },
  mule: { unitClass: 'ordnance', cost: 250, captureMultiplier: 0.0, label: '"Mule" Field Fabricator', visionRange: 3, speedMod: 0.9, maxHealth: 60, attackDamage: 0, attackCooldown: 0 },
  wasp: { unitClass: 'air', cost: 200, captureMultiplier: 0.0, label: '"Wasp" Swarm Launcher', visionRange: 5, speedMod: 1.5, maxHealth: 40, attackDamage: 5, attackCooldown: 500 },
  mason: { unitClass: 'builder', cost: 150, captureMultiplier: 0.0, label: '"Mason" Combat Engineer', visionRange: 2, speedMod: 0.8, maxHealth: 150, attackDamage: 0, attackCooldown: 0 },
  helios: { unitClass: 'support', cost: 100, captureMultiplier: 0.0, label: '"Helios" Microwave Drone', visionRange: 4, speedMod: 1.3, maxHealth: 60, attackDamage: 0, attackCooldown: 0 },
  sun_plate: { unitClass: 'armor', cost: 400, captureMultiplier: 0.0, label: '"Sun-Plate" Armored Array', visionRange: 2, speedMod: 0.5, maxHealth: 500, attackDamage: 0, attackCooldown: 0 },
  ballista: { unitClass: 'support', cost: 350, captureMultiplier: 0.0, label: '"Ballista" Launch Platform', visionRange: 3, speedMod: 0.4, maxHealth: 100, attackDamage: 0, attackCooldown: 0 },
  courier: { unitClass: 'support', cost: 50, captureMultiplier: 0.0, label: 'Ordnance Courier', visionRange: 2, speedMod: 1.8, maxHealth: 30, attackDamage: 0, attackCooldown: 0 },
  banshee: { unitClass: 'support', cost: 300, captureMultiplier: 0.0, label: '"Banshee" EW Vehicle', visionRange: 4, speedMod: 0.9, maxHealth: 350, attackDamage: 0, attackCooldown: 0 },
  defense_drone: { unitClass: 'defense', cost: 0, captureMultiplier: 0.0, label: 'Sentinel Drone', visionRange: 2, speedMod: 0, maxHealth: 60, attackDamage: 10, attackCooldown: 500 },
  titan_dropped: { unitClass: 'armor', cost: 0, captureMultiplier: 0.8, label: 'Titan (Orbital Drop)', visionRange: 3, speedMod: 0.7, maxHealth: 400, attackDamage: 25, attackCooldown: 2000 },
  swarm_host: { unitClass: 'ordnance', cost: 0, captureMultiplier: 0, label: 'Swarm Host', visionRange: 3, speedMod: 0.8, maxHealth: 100, attackDamage: 0, attackCooldown: 0 },
};

export const UNIT_CLASSES: Record<UnitClass, { icon: string, label: string }> = {
  support: { icon: '✚', label: 'Support' },
  infantry: { icon: '●', label: 'Infantry' },
  armor: { icon: '■', label: 'Armor' },
  ordnance: { icon: '▲', label: 'Ordnance' },
  air: { icon: '▼', label: 'Air' },
  builder: { icon: '⚒', label: 'Engineering' },
  defense: { icon: '☠', label: 'Automated Defense' },
};

export const ABILITY_CONFIG = {
  SURVEILLANCE_DURATION: 120000, // 2 Minutes
  SURVEILLANCE_RADIUS: 7,        // 7 Blocks
  SURVEILLANCE_VISION: 8,        // Increased to 8 (Base 2 + 6)
  SURVEILLANCE_ALTITUDE: 80,
  GHOST_DAMPENER_RADIUS: 3, 
  GHOST_SPEED_PENALTY: 0.5, 
  GHOST_DECOY_RANGE: 10, // Added range for Phantom Decoy
  DECOY_DURATION: 20000, // Increased to 20 seconds
  GUARDIAN_TROPHY_RANGE: 2, 
  GUARDIAN_TROPHY_COOLDOWN: 10000, 
  GUARDIAN_REPAIR_RATE: 15, 
  GUARDIAN_REPAIR_RANGE: 2, 
  GUARDIAN_DRAIN_RATE: 8.0,
  
  // Titan Tank Abilities
  TITAN_SMOKE_DURATION: 20000, 
  TITAN_SMOKE_COOLDOWN: 20000,
  TITAN_APS_DURATION: 5000, 
  TITAN_APS_COOLDOWN: 15000,
  TITAN_CANNON_RANGE: 6, 
  TITAN_CANNON_PROJECTILE_RANGE: 20,
  TITAN_CANNON_DAMAGE: 150,
  TITAN_CANNON_SPEED: 200, 
  TITAN_CANNON_COOLDOWN: 5000,
  TITAN_CANNON_COST: 15,

  // Ammo Limits
  MAX_CHARGES_SMOKE: 2,
  MAX_CHARGES_APS: 1,

  // Mule Abilities
  MULE_PRINT_RANGE: 1.5, 
  MULE_PRINT_COOLDOWN: 5000,
  MULE_EXPLOSION_RADIUS: 2, 
  MULE_EXPLOSION_DAMAGE: 500,
  MULE_SMOG_COOLDOWN: 30000, // 30s
  MULE_SMOG_RANGE: 10,

  // Wasp Abilities
  WASP_SWARM_RANGE: 12,
  WASP_SWARM_RADIUS: 2, 
  WASP_SWARM_COOLDOWN: 15000, 
  WASP_MAX_CHARGES: 2, 
  WASP_MISSILES_PER_VOLLEY: 10, 
  WASP_DAMAGE_PER_MISSILE: 15,
  WASP_MISSILE_SPEED: 25, 
  WASP_MISSILE_TURN_RATE: 5, 
  SWARM_HOST_MAX_UNITS: 15,

  // Mason / Wall Abilities
  MASON_CARGO_CAPACITY: 100,
  MASON_LOAD_TIME: 2000, 
  MASON_BUILD_AMOUNT: 100, 
  WALL_TIER1_SLOW_FACTOR: 0.25, 

  // Battery / Solar Logic
  BATTERY_MAX: 100,
  BATTERY_DRAIN_MOVE: 0.2, 
  BATTERY_DRAIN_IDLE: 0.01, 
  
  // Static Ability Drains 
  DRAIN_STATIC_JAMMER: 1.5, 
  DRAIN_STATIC_DOME: 1.5,   

  // Active Ability Drains
  DRAIN_ACTIVE_HACK_MAINTENANCE: 6.0, 
  
  // Instant Ability Costs
  COST_ABILITY_LOW: 10,    
  COST_ABILITY_MEDIUM: 15, 
  COST_ABILITY_HIGH: 25,   
  SYSTEM_OVERCLOCK_COST: 250,

  HELIOS_CHARGE_RATE: 2, 
  HELIOS_RADIUS: 3,
  SUNPLATE_CHARGE_RATE: 6, 
  SUNPLATE_RADIUS: 5,
  SMOG_DURATION: 60000,
  SMOG_RADIUS: 5, 

  // Ballista / Warhead Logic
  BALLISTA_LOAD_TIME: 5000, 
  WARHEAD_COST_ECLIPSE: 500,
  WARHEAD_BUILD_TIME_ECLIPSE: 20000, 
  ECLIPSE_DURATION: 60000,
  ECLIPSE_RADIUS: 10,

  WARHEAD_COST_WP: 300,
  WARHEAD_BUILD_TIME_WP: 15000, 
  WP_DURATION: 20000, 
  WP_RADIUS: 5,
  WP_DAMAGE_PER_TICK: 5, 
  
  // Ballistic Missile Physics
  MISSILE_LAUNCH_HEIGHT: 80,
  MISSILE_ASCENT_SPEED: 10, 
  MISSILE_CRUISE_SPEED: 15, 
  MISSILE_TERMINAL_SPEED: 30, 

  // Banshee Logic
  BANSHEE_JAMMER_RADIUS: 7,
  BANSHEE_ACTION_RANGE: 7,
  BANSHEE_HACK_BREAK_RANGE: 10,
  BANSHEE_HACK_DRAIN_MULTIPLIER: 3, 
  
  // New Banshee Battery Stats
  BANSHEE_MAX_MAIN_BATTERY: 300,
  BANSHEE_MAX_SEC_BATTERY: 200,
  BANSHEE_INTERNAL_CHARGE_RATE: 2.0, 
  BANSHEE_TETHER_CHARGE_RATE: 5.0,   

  // Defense Drone
  DEFENSE_DRONE_DAMAGE: 10,
  DEFENSE_DRONE_RANGE: 2,
  UNIT_RETALIATION_DAMAGE: 5, 
};

export const STRUCTURE_COST = 1000;
export const BUILD_RADIUS = 15; 

export const STRUCTURE_INFO: Record<StructureType, { label: string, color: string, height: number, cost: number, maxProgress: number, maxHealth: number }> = {
    support: { label: 'Comm Link', color: '#8b5cf6', height: 12, cost: 1000, maxProgress: 0, maxHealth: 500 },
    infantry: { label: 'Barracks', color: '#10b981', height: 6, cost: 1000, maxProgress: 0, maxHealth: 500 },
    armor: { label: 'Factory', color: '#f59e0b', height: 8, cost: 1000, maxProgress: 0, maxHealth: 500 },
    ordnance: { label: 'Munitions', color: '#ef4444', height: 5, cost: 1000, maxProgress: 0, maxHealth: 500 },
    air: { label: 'Airpad', color: '#0ea5e9', height: 3, cost: 1000, maxProgress: 0, maxHealth: 500 },
    builder: { label: 'Depot', color: '#fbbf24', height: 6, cost: 1000, maxProgress: 0, maxHealth: 600 },
    ordnance_fab: { label: 'Ordnance Fab', color: '#be185d', height: 7, cost: 1500, maxProgress: 0, maxHealth: 400 },
    // Walls
    wall_tier1: { label: "Dragons Teeth", color: '#475569', height: 1.5, cost: 200, maxProgress: 100, maxHealth: 300 }, // 1 Trip
    wall_tier2: { label: "Bulwark Wall", color: '#334155', height: 4, cost: 500, maxProgress: 300, maxHealth: 1500 }, // 3 Trips
    defense: { label: 'Defense Turret', color: '#ef4444', height: 4, cost: 500, maxProgress: 200, maxHealth: 800 },
};

// Fortification / Block Bonuses
export const BLOCK_BONUS = {
  RESOURCE_MULTIPLIER: 1.5, 
  BASE_DEFENSE: 0.20, 
  DEFENSE_PER_BUILDING: 0.05, 
};

export const FORTIFICATION_BONUS = 0.5; 

export const BUILDING_COLORS = {
  residential: '#0ea5e9',
  commercial: '#d946ef',
  industrial: '#f59e0b',
  hightech: '#10b981',
  server_node: '#2563eb', // Server Node Blue
};

export const TEAM_COLORS = {
  blue: '#3b82f6',
  red: '#ef4444',
  neutral: '#a855f7',
};

export const CAMERA_SPEED = 1.2;
export const CAMERA_ZOOM_SPEED = 2.0;
export const MIN_ZOOM = 20;
export const MAX_ZOOM = 600;

export const DOCTRINE_CONFIG: Record<DoctrineType, { label: string, tier1_passive: string, tier2_cost: number, tier2_cooldown: number, tier3_cost: number, tier3_cooldown: number }> = {
  heavy_metal: {
    label: "Heavy Metal",
    tier1_passive: "Mechanized Repair: Armor units regen 2 HP/s when out of combat.",
    tier2_cost: 500,
    tier2_cooldown: 120000,
    tier3_cost: 1200,
    tier3_cooldown: 300000,
  },
  shadow_ops: {
    label: "Shadow Ops",
    tier1_passive: "Signal Masking: Stealth units gain +20% speed.",
    tier2_cost: 400,
    tier2_cooldown: 60000,
    tier3_cost: 1000,
    tier3_cooldown: 240000,
  },
  skunkworks: {
    label: "Skunkworks",
    tier1_passive: "Overclock: Production speed +10% globally.",
    tier2_cost: 600,
    tier2_cooldown: 90000,
    tier3_cost: 1100,
    tier3_cooldown: 300000,
  }
};

export const TIER_UNLOCK_COSTS = {
  TIER2: 1500,
  TIER3: 3500,
};

export const CP_REWARDS = {
  BUILDING_CAPTURE: 50,
  UNIT_DESTROYED: 25,
  SERVER_NODE_TICK: 1, // Per 10s?
};
