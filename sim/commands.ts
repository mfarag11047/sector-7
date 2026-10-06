// Every order a player can give the game, as plain data.
//
// In multiplayer the browser never changes the world itself. It sends one of these
// to the server, the server checks it is legal, and only then applies it. Anything
// that is not on this list (selecting units, opening menus, entering targeting mode,
// moving the camera) stays in the browser and never reaches the server.
//
// A command never says which team sent it. The server knows who is connected on
// each socket and stamps the team itself, so a player cannot issue orders for the
// other side. See CommandEnvelope below.
//
// sim/COMMANDS.md maps each command to the code that handles it today.

import type { DoctrineType, StructureType, UnitType } from '../types';

export type GridPos = { x: number; z: number };
export type Warhead = 'eclipse' | 'he';
export type Team = 'blue' | 'red';

// --- Movement ---

// Right-click on the ground with units selected. The server spreads the group
// across free tiles around the target, the same way the client does today.
export interface MoveCommand { type: 'MOVE'; unitIds: string[]; target: GridPos }

// --- Construction and production ---

// Covers base buildings (from the HQ menu) and walls / turrets (from the Depot menu).
// Walls and turrets start as blueprints that Masons build up.
export interface PlaceStructureCommand { type: 'PLACE_STRUCTURE'; structureType: StructureType; at: GridPos }
export interface TrainUnitCommand { type: 'TRAIN_UNIT'; structureId: string; unitType: UnitType }
export interface BuildWarheadCommand { type: 'BUILD_WARHEAD'; structureId: string; warhead: Warhead }

// --- Toggles and instant abilities ---
// These apply to every listed unit of the right type, matching how the
// current menus act on the whole selection.

export interface ToggleDampenerCommand { type: 'TOGGLE_DAMPENER'; unitIds: string[] } // Ghost
export interface ToggleJammerCommand { type: 'TOGGLE_JAMMER'; unitIds: string[] } // Banshee
export interface ToggleAnchorCommand { type: 'TOGGLE_ANCHOR'; unitIds: string[] } // Battery Mule, Swarm Host
export interface SmokeScreenCommand { type: 'SMOKE_SCREEN'; unitIds: string[] } // Titan
export interface ActivateApsCommand { type: 'ACTIVATE_APS'; unitIds: string[] } // Titan

// Ghost. Toggles the cloak and its scattering projections on or off.
export interface PhantomDecoyCommand { type: 'PHANTOM_DECOY'; unitId: string }

// --- Ordnance logistics ---

export interface LoadAmmoCommand { type: 'LOAD_AMMO'; unitId: string; warhead: Warhead } // Ballista: inventory -> armed
export interface TakeWarheadCommand { type: 'TAKE_WARHEAD'; unitId: string; warhead: Warhead } // Ballista beside its Ordnance Fab
export interface FabricateCommand { type: 'FABRICATE'; unitId: string; warhead: Warhead } // Field Fabricator
export interface ResupplyMaterialCommand { type: 'RESUPPLY_MATERIAL'; unitId: string } // Field Fabricator beside an Ordnance Fab
export interface TransferWarheadCommand { type: 'TRANSFER_WARHEAD'; unitId: string; warhead: Warhead } // Field Fabricator -> nearest Ballista

// --- Abilities aimed at a tile ---

export interface CannonFireCommand { type: 'CANNON_FIRE'; unitId: string; target: GridPos } // Titan
export interface SurveillanceCommand { type: 'SURVEILLANCE'; unitId: string; target: GridPos } // Infiltrator Drone
export interface FireBallistaCommand { type: 'FIRE_BALLISTA'; unitId: string; target: GridPos } // Ballista, fires the armed warhead
export interface FireSwarmCommand { type: 'FIRE_SWARM'; unitId: string; target: GridPos } // Wasp
export interface BombardCommand { type: 'BOMBARD'; unitId: string; target: GridPos } // Bombardment Drone

// --- Links between units ---

export interface HardlineTetherCommand { type: 'HARDLINE_TETHER'; unitId: string; targetUnitId: string } // Banshee -> drone
export interface DisconnectTetherCommand { type: 'DISCONNECT_TETHER'; unitId: string }
// Anchored Battery Mule. Links the target, or unlinks it if it is already linked.
export interface BatteryLinkCommand { type: 'BATTERY_LINK'; unitId: string; targetUnitId: string }
export interface DisconnectBatteryCommand { type: 'DISCONNECT_BATTERY'; unitId: string }

// --- Doctrine ---

export interface SelectDoctrineCommand { type: 'SELECT_DOCTRINE'; doctrine: DoctrineType }
// Tier 2 and 3 powers. Every power except Shadow Ops tier 3 (Global EMP) needs a target.
export interface DoctrinePowerCommand { type: 'DOCTRINE_POWER'; tier: 2 | 3; target?: GridPos }

export type PlayerCommand =
  | MoveCommand
  | PlaceStructureCommand
  | TrainUnitCommand
  | BuildWarheadCommand
  | ToggleDampenerCommand
  | ToggleJammerCommand
  | ToggleAnchorCommand
  | SmokeScreenCommand
  | ActivateApsCommand
  | PhantomDecoyCommand
  | LoadAmmoCommand
  | TakeWarheadCommand
  | FabricateCommand
  | ResupplyMaterialCommand
  | TransferWarheadCommand
  | CannonFireCommand
  | SurveillanceCommand
  | FireBallistaCommand
  | FireSwarmCommand
  | BombardCommand
  | HardlineTetherCommand
  | DisconnectTetherCommand
  | BatteryLinkCommand
  | DisconnectBatteryCommand
  | SelectDoctrineCommand
  | DoctrinePowerCommand;

export type CommandType = PlayerCommand['type'];

// What the simulation actually receives. The server fills in `team` from the
// connection and `tick` from its own clock; `seq` is the client's running count,
// so it can match acknowledgements and drop duplicates after a reconnect.
export interface CommandEnvelope {
  team: Team;
  tick: number;
  seq: number;
  command: PlayerCommand;
}

// --- Shape checks ---
// Anything arriving over the network is untrusted. isPlayerCommand only confirms
// the message has the right fields with the right kinds of values. Whether the
// order is legal (owns the unit, can afford it, off cooldown, in range) is the
// simulation's job when it applies the command.

// Written as Records so the compiler flags a type added to types.ts but missing here.
const STRUCTURE_TYPES = Object.keys({
  support: 1, infantry: 1, armor: 1, ordnance: 1, air: 1, builder: 1, ordnance_fab: 1, wall_tier1: 1, wall_tier2: 1, defense: 1,
} satisfies Record<StructureType, 1>);
const UNIT_TYPES = Object.keys({
  drone: 1, tank: 1, ghost: 1, guardian: 1, mule: 1, wasp: 1, mason: 1, helios: 1, sun_plate: 1, ballista: 1, courier: 1,
  banshee: 1, defense_drone: 1, titan_dropped: 1, swarm_host: 1, crawler_drone: 1, bombard: 1,
} satisfies Record<UnitType, 1>);
const DOCTRINES = Object.keys({ heavy_metal: 1, shadow_ops: 1, skunkworks: 1 } satisfies Record<DoctrineType, 1>);
const WARHEADS = Object.keys({ eclipse: 1, he: 1 } satisfies Record<Warhead, 1>);

// Large enough for any real selection, small enough to stop a flood.
const MAX_UNIT_IDS = 200;
const MAX_ID_LENGTH = 64;

type Fields = Record<string, unknown>;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;
const isIdList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.length <= MAX_UNIT_IDS && v.every(isId);
const isTile = (v: unknown): v is GridPos => {
  if (typeof v !== 'object' || v === null) return false;
  const { x, z } = v as Fields;
  return Number.isInteger(x) && Number.isInteger(z);
};
const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

const unit = (c: Fields) => isId(c.unitId);
const unitAt = (c: Fields) => isId(c.unitId) && isTile(c.target);
const unitWarhead = (c: Fields) => isId(c.unitId) && oneOf(WARHEADS, c.warhead);
const unitLink = (c: Fields) => isId(c.unitId) && isId(c.targetUnitId);
const unitList = (c: Fields) => isIdList(c.unitIds);

const CHECKS: Record<CommandType, (c: Fields) => boolean> = {
  MOVE: c => isIdList(c.unitIds) && isTile(c.target),
  PLACE_STRUCTURE: c => oneOf(STRUCTURE_TYPES, c.structureType) && isTile(c.at),
  TRAIN_UNIT: c => isId(c.structureId) && oneOf(UNIT_TYPES, c.unitType),
  BUILD_WARHEAD: c => isId(c.structureId) && oneOf(WARHEADS, c.warhead),
  TOGGLE_DAMPENER: unitList,
  TOGGLE_JAMMER: unitList,
  TOGGLE_ANCHOR: unitList,
  SMOKE_SCREEN: unitList,
  ACTIVATE_APS: unitList,
  PHANTOM_DECOY: unit,
  LOAD_AMMO: unitWarhead,
  TAKE_WARHEAD: unitWarhead,
  FABRICATE: unitWarhead,
  RESUPPLY_MATERIAL: unit,
  TRANSFER_WARHEAD: unitWarhead,
  CANNON_FIRE: unitAt,
  SURVEILLANCE: unitAt,
  FIRE_BALLISTA: unitAt,
  FIRE_SWARM: unitAt,
  BOMBARD: unitAt,
  HARDLINE_TETHER: unitLink,
  DISCONNECT_TETHER: unit,
  BATTERY_LINK: unitLink,
  DISCONNECT_BATTERY: unit,
  SELECT_DOCTRINE: c => oneOf(DOCTRINES, c.doctrine),
  DOCTRINE_POWER: c => (c.tier === 2 || c.tier === 3) && (c.target === undefined || isTile(c.target)),
};

export const COMMAND_TYPES = Object.keys(CHECKS) as CommandType[];

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (typeof value !== 'object' || value === null) return false;
  const fields = value as Fields;
  if (typeof fields.type !== 'string' || !Object.prototype.hasOwnProperty.call(CHECKS, fields.type)) return false;
  return CHECKS[fields.type as CommandType](fields);
}
