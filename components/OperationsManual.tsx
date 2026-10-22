// The Operations Manual: a tabbed guide for new players, opened with the ? button.
//
// Numbers come from the rules themselves (UNIT_RULES, UNIT_STATS, the ability list and the
// artillery and economy constants), so the manual stays right when the balance changes. Only
// the prose (what a role is for, what a unit's menu buttons do) is written by hand here.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_TETHERS } from '../sim/jamming';
import { HELIOS } from '../sim/helios';
import { ABILITY_CONFIG, BUILDING_VALUES, DOCTRINE_CONFIG, STRUCTURE_INFO, UNIT_STATS } from '../constants';
import type { DoctrineType, StructureType, UnitType } from '../types';
import { ARTILLERY } from '../sim/artillery';
import { BASE_REPAIR } from '../sim/support';
import { RADAR, SEARCH_RADAR } from '../sim/radar';
import { RAILGUN, railDamage } from '../sim/railgun';
import { HORNET } from '../sim/hornet';
import { BOMBARD, DROPS_TO_DESTROY } from '../sim/bombard';
import { FORCE_FIELD } from '../sim/forcefield';
import { CLOAK_FIELD } from '../sim/cloak';
import { BASE_SITE } from '../sim/bases';
import { CIWS, ORDNANCE_INTEGRITY } from '../sim/ciws';
import { HQ_INCOME } from '../sim/economy';
import { abilitiesFor } from '../sim/unitAbilities';
import { abilityUpgrade, upgradesFor } from '../sim/upgrades';
import { HE, WP } from '../sim/warheads';
import {
  ArmorClass, COMPUTE_PER_SERVER_NODE, DAMAGE_MULTIPLIER, DamageType, dps, GRID_TILES_PER_POP, HQ_COMPUTE, POP_BASE, POP_MAX, POP_PER_CORE_NODE,
  STRUCTURE_RULES, Tier, TIER_RESEARCH_COST, UNIT_RULES, unitsProducedBy, Weapon,
} from '../sim/units';
import { ROLE_GLYPH, ROLE_LABEL, roleGlyphFilled, teamBadgeColor, UnitRole, UNIT_ROLE } from './unitIcons';

type Tab = 'basics' | 'economy' | 'units' | 'structures' | 'combat' | 'doctrines' | 'interface' | 'winning';
const TABS: { id: Tab; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'units', label: 'Units' },
  { id: 'structures', label: 'Structures' },
  { id: 'economy', label: 'Economy' },
  { id: 'combat', label: 'Combat' },
  { id: 'doctrines', label: 'Doctrines' },
  { id: 'interface', label: 'Interface' },
  { id: 'winning', label: 'Winning' },
];

// --- Hand-written text ---

const ROLE_ORDER: UnitRole[] = ['infantry', 'anti_armor', 'raider', 'armor', 'anti_air', 'gunship', 'scout', 'artillery', 'support', 'engineer', 'swarm', 'sentinel'];

const ROLE_INFO: Record<UnitRole, string> = {
  infantry: 'Cheap foot soldiers. The only units that capture buildings and core nodes, and rifles are the main answer to aircraft early on.',
  anti_armor: 'Infantry with rockets. Slow and fragile, but they crack vehicles and gunships.',
  raider: 'Fast, light vehicles. Hunt infantry, raid undefended nodes, run before armour arrives.',
  armor: 'Heavy tanks. Slow and expensive; they break infantry blobs and buildings and soak fire.',
  anti_air: 'Air defence: long-range radar and an automatic rotary cannon that shoots down aircraft and incoming missiles. Escort your army; helpless against ground units.',
  gunship: 'Aircraft. Fly straight over the city ignoring roads and terrain, and punish vehicles.',
  scout: 'Unarmed eyes. Spot for your army and for artillery.',
  artillery: 'Long-range and ordnance units. Hit far away, but need protecting up close.',
  support: 'Repair, recharge, jam and power your other units. Little or no weapon of their own.',
  engineer: 'Builders. Masons haul materials to walls and turrets.',
  swarm: 'Doctrine units that release or are self-destructing drones.',
  sentinel: 'Neutral guards on the server nodes. They attack everyone who comes close.',
};

interface UnitNote {
  // How to use it, in a sentence or two.
  use: string;
  // Buttons in its action menu, other than the tiered abilities in sim/unitAbilities.ts.
  actions?: { name: string; text: string }[];
  // Where it comes from, for units no structure trains.
  source?: string;
}

const UNIT_NOTES: Record<UnitType, UnitNote> = {
  scout_car: { use: `Trained at your Command HQ. A remote-controlled scout car: the fastest unit in the game, sees ${UNIT_STATS.scout_car.visionRange} tiles (most units see 3 to 6) and carries a large ${ABILITY_CONFIG.SCOUT_CAR_BATTERY}-point battery for long runs off the grid. Unarmed and dies to almost anything, so scout and pull back. Being remote-controlled, a Banshee can jam it.` },
  trooper: { use: 'Your bread-and-butter unit. Send squads to capture core nodes and buildings (which grows your energy grid), and keep some with the army to shoot down aircraft.' },
  ghost: {
    use: 'Captures 1.5× faster than a Trooper. Sneaks in to steal nodes and hides from the enemy. Trained from Tier 1; its abilities unlock with research.',
    actions: [
      { name: 'Toggle Dampener (Tier 2)', text: `The Ghost and friendly units within ${ABILITY_CONFIG.GHOST_DAMPENER_RADIUS} tiles vanish from the enemy's minimap and radar. They can still be seen up close and shot. Slows the Ghost and drains its battery while on; shows as a wall of glitch bars.` },
      { name: 'Phantom Decoy (Tier 3)', text: `Cloaks the Ghost and sends ${ABILITY_CONFIG.PHANTOM_DECOY_COUNT} holographic copies running in different directions for ${ABILITY_CONFIG.DECOY_DURATION / 1000}s. Drains battery while cloaked.` },
    ],
  },
  lancer: { use: 'Rocket team: bring them against tanks, Razorbacks and gunships. Keep them behind Troopers, as rifles shred them.' },
  razorback: { use: 'Fast raider buggy. Chase down infantry and capture squads, then fall back before Lancers or Titans arrive.' },
  howitzer: {
    use: `Mobile rail-gun battery. It cannot fire while moving: stop it, anchor it, wait ${ARTILLERY.setupMs / 1000}s for setup, then it shells enemies your side can see. Keep it behind your army.`,
    actions: [
      { name: 'Anchor Down / Pack Up', text: 'Plants the battery (only when stopped). Any move order packs it up and cancels its fire mission.' },
      { name: 'Fire Mission', text: `Click a tile inside the orange range ring: it shells that spot every ${ARTILLERY.cooldownMs / 1000}s, even into fog, until you Cease Fire or move it. Nothing within ${ARTILLERY.minRange} tiles can be shelled.` },
      { name: 'Cease Fire', text: 'Cancels the fire mission. It goes back to firing at enemies it can see.' },
    ],
  },
  tank: {
    use: 'Main battle tank. Leads pushes, levels buildings and breaks infantry clumps.',
    actions: [
      { name: 'Rail Gun (automatic)', text: `Fires on its own at enemy ground units and buildings up to ${RAILGUN.range} tiles away that any of your units or buildings can see, armour first: ${Math.round(railDamage('heavy'))} to heavy armour, ${Math.round(railDamage('light'))} to light vehicles, only ${Math.round(railDamage('infantry'))} to infantry. ${RAILGUN.cooldownMs / 1000}s recharge, ${RAILGUN.batteryCost} battery a shot.` },
    ],
  },
  aegis: {
    use: 'Air-defence carrier: radar plus an automatic rotary cannon. Park it with your army or base to shred Hornets, Wasps and incoming missiles. It cannot hit ground targets at all.',
    actions: [
      { name: 'CIWS rotary cannon', text: `Automatic. Fires a stream of rounds at any enemy aircraft or missile, shell or drop pod its radar holds within ${CIWS.range} tiles, missiles first. A magazine lasts ${CIWS.burstMs / 1000}s of fire, then it must stop for a ${CIWS.reloadMs / 1000}s reload; after ${CIWS.topUpMs / 1000}s without firing it tops a part-used magazine back up. Its menu shows the magazine and reload. It does ${CIWS.airDps} damage a second to aircraft and tears through ordnance far faster: a missile comes down after about ${Math.round(ORDNANCE_INTEGRITY.missile / CIWS.ordnanceDps)}s of fire, a shell in a fraction of a second.` },{ name: 'Air-search radar', text: `Always on: a green sweep ${RADAR.range} tiles across. Enemy aircraft and incoming missiles, shells and drop pods inside it show as red dots on the map and minimap, even in fog. A dot tells you something is there, not what it is. An EMP knocks the radar out.` }],
  },
  sun_plate: {
    use: 'Mobile power. Send it with your vehicles beyond the energy grid so they can keep going: it charges them as it drives.',
    actions: [
      { name: 'Auto-charge', text: `Moving or parked, it charges up to ${ABILITY_CONFIG.BATTERY_MULE_SLOTS} friendly ground vehicles (not aircraft) within ${ABILITY_CONFIG.BATTERY_MULE_RANGE} tiles (yellow ring) on its own, like a Guardian heals: lowest battery first, staying on each until it is full.` },
    ],
  },
  attack_drone: { use: 'A cheap armed drone from the Airpad at Tier 1. Its machine gun does decent damage to everything, infantry, vehicles, armour and aircraft, without being the best answer to any of them: mass a few to back up any army, or as the core of a drone force. Fragile, needs the energy grid like other aircraft, and remote-controlled, so a Banshee can jam it or hardline it.' },
  drone: {
    use: `Loitering radar scout. Its ground-search radar (${SEARCH_RADAR.range} tiles) shows enemy ground units, cloaked ones included, and large aircraft (the Bombardment Drone) as red blips; small and medium aircraft slip under it. Spots for Thunderheads.`,
    actions: [{ name: 'Surveillance', text: `Flies to a spot and circles it for ${ABILITY_CONFIG.SURVEILLANCE_DURATION / 60000} minutes, its radar reaching ${SEARCH_RADAR.surveillanceRange} tiles from the centre.` }],
  },
  wasp: {
    use: 'Harasser aircraft with homing missile swarms.',
    actions: [{ name: 'Fire Swarm', text: `Launches ${ABILITY_CONFIG.WASP_MISSILES_PER_VOLLEY} homing missiles at a spot up to ${ABILITY_CONFIG.WASP_SWARM_RANGE} tiles away. ${ABILITY_CONFIG.WASP_MAX_CHARGES} charges.` }],
  },
  hornet: { use: `Gunship. Hunts vehicles with armour-piercing rounds; at Tier 3 it also fires an anti-vehicle rocket every ${HORNET.rocket.cooldownMs / 1000}s at its target (${HORNET.rocket.damage} AP) and gains the Hellfire Salvo, a rocket barrage over an area. Avoid Aegis and massed Troopers.` },
  bombard: {
    use: 'Slow heavy drone that flattens city blocks to open new lanes.',
    actions: [
      { name: 'Bombard', text: `Flies to a spot and keeps dropping cluster strikes on the ${ABILITY_CONFIG.BOMBARD_RADIUS * 2 + 1}×${ABILITY_CONFIG.BOMBARD_RADIUS * 2 + 1} patch below, one every ${BOMBARD.intervalMs / 1000}s, until you Cease Bombard or its ${BOMBARD.magazine} munitions run out. Each drop does ${ABILITY_CONFIG.BOMBARD_UNIT_DAMAGE} damage to every unit under it, friend or foe. Buildings take more drops toward the centre: residential ${DROPS_TO_DESTROY.residential}, industrial ${DROPS_TO_DESTROY.industrial}, high-tech ${DROPS_TO_DESTROY.hightech}, commercial ${DROPS_TO_DESTROY.commercial}.` },
      { name: 'Rearm', text: `Empty, it flies home to the nearest command base on its own and reloads there in ${BOMBARD.rearmMs / 1000}s. A part-used drone parked by a base tops up the same way.` },
    ],
  },
  guardian: {
    use: 'Combat medic vehicle. Keep it just behind your front line.',
    actions: [
      { name: 'Auto-repair', text: `Repairs up to ${ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS} damaged allies within ${ABILITY_CONFIG.GUARDIAN_REPAIR_RANGE} tiles, ${ABILITY_CONFIG.GUARDIAN_REPAIR_RATE} HP a second each. Automatic.` },
      { name: 'Trophy System', text: `Shoots down heavy shells and missiles near it. ${ABILITY_CONFIG.GUARDIAN_TROPHY_COOLDOWN / 1000}s between intercepts. Automatic.` },
    ],
  },
  helios: {
    use: `Support drone with a microwave emitter covering ${ABILITY_CONFIG.HELIOS_RADIUS} tiles. One mode at a time.`,
    actions: [
      { name: 'Charge Friendlies', text: `Slowly tops up the batteries of friendly units in range (${HELIOS.chargePerTick * 10}/s each), itself included, so it never runs flat in this mode.` },
      { name: 'Microwave Enemies', text: `Slowly cooks enemy units in range (${HELIOS.burnDps} damage/s each). Charges nothing, drains the Helios' own battery and stops when it is flat. Blocked by enemy force fields.` },
    ],
  },
  banshee: {
    use: 'Electronic warfare vehicle.',
    actions: [
      { name: 'Toggle Jammer', text: `Jams communications within ${ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS} tiles. Enemy drones and other remote-controlled units inside lose their link: they finish their last order and still fire at anything in range on their own, but take no new orders (moves, attacks, abilities) until they leave the field. Jammed units fizz with static. Drones on a hardline can't be jammed. The blue ring is the jammer's reach; it shimmers while the jammer is on.` },
      { name: 'Tether Drones', text: `Hardlines up to ${MAX_TETHERS} friendly drones to the Banshee's battery: keeps them powered, leashed within the blue ring, and immune to enemy jamming. Click a tethered drone again to let it go.` },
    ],
  },
  ballista: {
    use: 'Missile launcher. Strikes up to half the map away (39 tiles, red ring when selected) with EMP, HE or White Phosphorus warheads built at the Ordnance Fab.',
    actions: [
      { name: 'Take / Load', text: 'Take warheads from your stockpile beside an Ordnance Fab, then load one.' },
      { name: 'Launch', text: `Fires the loaded missile at any tile. HE is anti-armour: a ${HE.radius}-tile blast of ${HE.damage} at the centre, x${HE.vs.heavy} against heavy armour and x${HE.vs.light} against light vehicles, but only x${HE.vs.infantry} against infantry and aircraft. White Phosphorus bursts high over the target into ${WP.canisters} canisters that blanket ${WP.radius} tiles in burning white gas for ${WP.durationMs / 1000}s, ${WP.dps} damage a second to enemy infantry inside it (vehicles and aircraft are untouched). EMP knocks out the enemy energy grid within ${ABILITY_CONFIG.EMP_RADIUS} tiles and shuts down every enemy vehicle and aircraft caught in the blast, both for ${ABILITY_CONFIG.EMP_DURATION / 1000}s.` },
    ],
  },
  mason: { use: 'Combat engineer. Place walls from the Depot or turrets on a + turret corner, and Masons haul materials to build them.' },
  mule: {
    use: 'Field Fabricator. Builds missiles at the front and hands them to Ballistas.',
    actions: [
      { name: 'Fabricate', text: `Turns material into an EMP, HE or White Phosphorus missile (${ABILITY_CONFIG.FABRICATOR_BUILD_TIME / 1000}s each, ${ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY} material).` },
      { name: 'Transfer', text: 'Hands a finished missile to a Ballista alongside.' },
    ],
  },
  courier: { use: 'Runs a warhead to a Ballista.', source: 'Dispatched by Transfer Warhead; it is never trained.' },
  defense_drone: { use: 'Guards a server node and attacks anyone nearby. Kill it to capture the node.', source: 'Placed by the map on every server node.' },
  titan_dropped: { use: 'A Titan delivered from orbit.', source: 'Heavy Metal doctrine, Tier 2 power: Orbital Drop.' },
  swarm_host: {
    use: 'Mobile drone hive.',
    actions: [{ name: 'Anchor', text: `Anchored, it releases Crawler Drones (up to ${ABILITY_CONFIG.SWARM_HOST_MAX_DRONES}) that hunt enemies nearby.` }],
  },
  field_generator: {
    use: `Projects a force-field dome ${FORCE_FIELD.radius} tiles out from its centre, about a city block. Your units inside fire out freely; enemy shots and projectiles from outside hit the dome instead. Enemies who walk in can fight from inside but are shocked for ${FORCE_FIELD.shockDps} damage a second. The dome has ${FORCE_FIELD.shieldHp} shield health: everything it stops wears it down, and once broken it reboots for ${FORCE_FIELD.rebootMs / 1000}s before coming back at full strength. It runs on the generator's battery, indefinitely inside your grid. The generator can be destroyed by enemies who go inside; an EMP inside the dome knocks it out.`,
    source: 'Heavy Metal doctrine, Tier 3 power: Bulwark Force Field. Dropped in a pod; one per side, a new drop removes the old one.',
  },
  cloak_generator: {
    use: `Projects a ${CLOAK_FIELD.radius}-tile Cloaking Field: friendly units inside, and the generator itself, are hidden from the enemy and can't be targeted, though blasts and shelling still hurt. An enemy Aegis' radar still shows them as red blips. A unit that fires or is hit shows itself for ${CLOAK_FIELD.revealMs / 1000}s. Runs on its battery: indefinitely inside your grid, about a minute outside it; a Battery Mule or Helios keeps it going. An EMP shuts it down.`,
    actions: [{ name: 'Cloaking Field', text: 'Switches the field off (saving battery; the generator and everything near it can be seen) or back on.' }],
    source: 'Shadow Ops doctrine, Tier 3 power: Cloaking Field. Air-dropped; one per side, a new drop destroys the old one.',
  },
  crawler_drone: { use: `Self-destructing drone: explodes for ${ABILITY_CONFIG.CRAWLER_EXPLOSION_DAMAGE} damage beside enemies.`, source: 'Released by an anchored Swarm Host.' },
};

const ARMOR_LABEL: Record<ArmorClass, string> = { infantry: 'Infantry', light: 'Light vehicles', heavy: 'Heavy armour', air: 'Aircraft', structure: 'Structures' };
const DAMAGE_LABEL: Record<DamageType, string> = { rifle: 'Rifle', ap: 'Anti-vehicle (AP)', flak: 'Flak', explosive: 'High explosive', mg: 'Machine gun' };
const ARMORS: ArmorClass[] = ['infantry', 'light', 'heavy', 'air', 'structure'];

// --- Small pieces ---

const RoleBadge: React.FC<{ role: UnitRole; color: string; size?: number }> = ({ role, color, size = 28 }) => {
  const filled = roleGlyphFilled(role);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-label={ROLE_LABEL[role]}>
      <rect x={1} y={1} width={22} height={22} rx={5} fill={color} stroke="#020617" strokeWidth={1.5} />
      <g transform="translate(3 3) scale(0.75)">
        <path d={ROLE_GLYPH[role]} fill={filled ? '#fff' : 'none'} stroke={filled ? 'none' : '#fff'} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-fuchsia-400 font-mono text-sm uppercase tracking-widest border-l-2 border-fuchsia-500 pl-3 mb-3">{children}</h3>
);
const Item: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-3">
    <div className="text-cyan-200 font-bold text-xs uppercase mb-1">{label}</div>
    <div className="text-slate-300 text-xs leading-relaxed">{children}</div>
  </div>
);
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-cyan-200 font-mono text-[10px]">{children}</kbd>
);
const UnitLink: React.FC<{ type: UnitType; onOpen: (t: UnitType) => void }> = ({ type, onOpen }) => (
  <button onClick={() => onOpen(type)} className="text-cyan-300 hover:text-white underline decoration-dotted underline-offset-2 text-xs">
    {UNIT_STATS[type].label}
  </button>
);

const producerLabel = (type: UnitType) => {
  const p = UNIT_RULES[type].producer;
  return p ? STRUCTURE_INFO[p].label : null;
};
const trainable = (type: UnitType) => UNIT_RULES[type].producer !== null;
const speedText = (m: number) => (m >= 1.3 ? 'Fast' : m >= 0.95 ? 'Average' : m >= 0.6 ? 'Slow' : m > 0 ? 'Very slow' : 'Stationary');

// --- Bars ---
// Every bar of a kind shares one scale across the whole manual, so a long bar means the same on
// every page: attack bars against the hardest-hitting unit, toughness bars against a fixed cap.

const TRAINABLE = (Object.keys(UNIT_RULES) as UnitType[]).filter(t => UNIT_RULES[t].producer !== null);
const DAMAGE_TYPES = Object.keys(DAMAGE_MULTIPLIER) as DamageType[];
const ATTACK_MAX = Math.max(...TRAINABLE.flatMap(t => ARMORS.map(a => dps(UNIT_RULES[t].weapon, a))));
const UNIT_MAX = {
  health: Math.max(...TRAINABLE.map(t => UNIT_STATS[t].maxHealth)),
  speed: Math.max(...TRAINABLE.map(t => UNIT_STATS[t].speedMod)),
  vision: Math.max(...TRAINABLE.map(t => UNIT_STATS[t].visionRange)),
  range: Math.max(ARTILLERY.range[3], ...TRAINABLE.map(t => UNIT_RULES[t].weapon?.range ?? 0)),
};
// Health it takes to kill it with one kind of weapon: health divided by how hard that kind hits
// its armour. Infinite when the weapon can't touch it.
const effectiveHealth = (health: number, armor: ArmorClass, type: DamageType) => {
  const m = DAMAGE_MULTIPLIER[type][armor];
  return m === 0 ? Infinity : health / m;
};
// Toughness spans 80 to 50,000, so its bars use a square-root scale up to a cap, which keeps a
// Trooper's bar visible next to a tank's.
const toughness = (ehp: number, cap: number) => (ehp === Infinity ? 1 : Math.min(1, Math.sqrt(ehp / cap)));
const UNIT_TOUGHNESS_CAP = 2000;
const STRUCTURE_TOUGHNESS_CAP = 20000;
const STRUCTURE_HEALTH_MAX = Math.max(...(Object.keys(STRUCTURE_INFO) as StructureType[]).map(s => STRUCTURE_INFO[s].maxHealth));

const Bar: React.FC<{ label: React.ReactNode; fraction: number; value: string; color: string; hint?: string }> = ({ label, fraction, value, color, hint }) => (
  <div className="flex items-center gap-2 text-xs" title={hint}>
    <span className="w-24 shrink-0 text-slate-400 truncate">{label}</span>
    <div className="flex-1 h-2 bg-slate-800 rounded-sm overflow-hidden">
      <div className="h-2 rounded-sm" style={{ width: `${Math.max(fraction > 0 ? 3 : 0, Math.min(1, fraction) * 100)}%`, background: color }} />
    </div>
    <span className={`w-16 shrink-0 text-right tabular-nums ${fraction > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{value}</span>
  </div>
);

// Short names for the bar labels.
const ARMOR_SHORT: Record<ArmorClass, string> = { infantry: 'Infantry', light: 'Light veh.', heavy: 'Heavy armour', air: 'Aircraft', structure: 'Buildings' };
const DAMAGE_SHORT: Record<DamageType, string> = { rifle: 'Rifles', ap: 'AP rockets', flak: 'Flak', explosive: 'Explosives', mg: 'Machine guns' };

const ATTACK_COLOR = '#fb923c';
const DEFENSE_COLOR = '#38bdf8';
const STAT_COLOR = '#a78bfa';

// Damage per second against each kind of target.
const AttackBars: React.FC<{ weapon: Weapon | null }> = ({ weapon }) => (
  <div className="space-y-1">
    <div className="text-[10px] uppercase tracking-wider" style={{ color: ATTACK_COLOR }}>Damage per second against</div>
    {ARMORS.map(a => {
      const v = dps(weapon, a);
      return <Bar key={a} label={ARMOR_SHORT[a]} fraction={v / ATTACK_MAX} value={v ? `${v.toFixed(1)}/s` : '—'} color={ATTACK_COLOR} hint="Damage per second" />;
    })}
  </div>
);

// How much of each kind of weapon it takes to destroy it.
const DefenseBars: React.FC<{ health: number; armor: ArmorClass; cap: number }> = ({ health, armor, cap }) => (
  <div className="space-y-1">
    <div className="text-[10px] uppercase tracking-wider" style={{ color: DEFENSE_COLOR }}>Damage to destroy it with</div>
    {DAMAGE_TYPES.map(d => {
      const ehp = effectiveHealth(health, armor, d);
      const m = DAMAGE_MULTIPLIER[d][armor];
      return (
        <Bar key={d} label={DAMAGE_SHORT[d]} fraction={toughness(ehp, cap)} color={DEFENSE_COLOR}
          value={ehp === Infinity ? 'Immune' : `${Math.round(ehp)}`} hint={`Takes ${m}× damage from ${DAMAGE_LABEL[d].toLowerCase()}: ${ehp === Infinity ? 'cannot be hurt by it' : `${Math.round(ehp)} damage to destroy`}`} />
      );
    })}
  </div>
);

const Legend: React.FC = () => (
  <p className="text-[11px] text-slate-500 mb-2 flex flex-wrap gap-x-4">
    <span><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: ATTACK_COLOR }} />Attack: damage per second</span>
    <span><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: DEFENSE_COLOR }} />Toughness: damage it takes to destroy</span>
    <span>Longer is stronger; bars share one scale across the manual.</span>
  </p>
);

// --- Unit detail ---

const UnitDetail: React.FC<{ type: UnitType; color: string; onOpen: (t: UnitType) => void; onBack: () => void }> = ({ type, color, onOpen, onBack }) => {
  const rules = UNIT_RULES[type];
  const stats = UNIT_STATS[type];
  const note = UNIT_NOTES[type];
  const role = UNIT_ROLE[type];
  const weapon = rules.weapon;
  const abilities = abilitiesFor(type);
  const isArtillery = type === 'howitzer';

  // What beats it: trainable units doing the most damage to its armour per core, with a little
  // weight for toughness (the same measure the AI uses to pick counters).
  const counters = useMemo(() => (Object.keys(UNIT_RULES) as UnitType[])
    .filter(t => trainable(t) && t !== type && dps(UNIT_RULES[t].weapon, rules.armor) > 0)
    .map(t => ({ t, score: (dps(UNIT_RULES[t].weapon, rules.armor) * Math.sqrt(UNIT_STATS[t].maxHealth)) / Math.max(1, UNIT_STATS[t].cost) }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(c => c.t), [type, rules.armor]);

  const tiers: Tier[] = [1, 2, 3];
  const stepsAt = (t: Tier): string[] => {
    const steps: string[] = [];
    if (trainable(type) && rules.tier === t) steps.push(t === 1 ? `Available from the start at the ${producerLabel(type)}` : `Unlocked: trainable at the ${producerLabel(type)}`);
    // A later ability or passive is researched at Advanced Research once its tier is reached.
    for (const a of abilities.filter(a => a.tier === t && !abilityUpgrade(a))) steps.push(`Ability: ${a.name}`);
    for (const u of upgradesFor(type).filter(u => u.tier === t)) {
      steps.push(`Research at Advanced Research: ${u.name} (${u.cost} cores + ${u.compute} compute, ${u.researchMs / 1000}s; +20% health, +15% damage)${isArtillery ? ` · range ${ARTILLERY.range[t]} tiles` : ''}`);
    }
    if (isArtillery && t === 1) steps.push(`Range ${ARTILLERY.range[1]} tiles`);
    return steps;
  };

  return (
    <div>
      <button onClick={onBack} className="text-slate-400 hover:text-cyan-300 font-mono text-xs mb-4">← All units</button>
      <div className="flex items-center gap-3 mb-2">
        <RoleBadge role={role} color={color} size={40} />
        <div>
          <div className="text-cyan-100 font-bold text-lg leading-tight">{stats.label}</div>
          <div className="text-slate-400 text-xs">{ROLE_LABEL[role]} · {rules.role}</div>
        </div>
      </div>
      <p className="text-slate-300 text-xs leading-relaxed mb-4">{note.use}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Legend />
          <H>Attack</H>
          {weapon ? (
            <div className="mb-4">
              <AttackBars weapon={weapon} />
              <p className="text-[11px] text-slate-400 mt-2">
                {DAMAGE_LABEL[weapon.type]}: {weapon.damage} damage every {weapon.cooldownMs / 1000}s
                {weapon.splash ? `, ${weapon.splash}-tile splash` : ''}. Hits {weapon.hitsGround && weapon.hitsAir ? 'ground and air' : weapon.hitsAir ? 'aircraft only' : 'ground only'}.
                {isArtillery && ' Fires only when anchored.'}
              </p>
            </div>
          ) : <p className="text-xs text-slate-400 mb-4">Unarmed.</p>}

          <H>Toughness</H>
          <div className="mb-4"><DefenseBars health={stats.maxHealth} armor={rules.armor} cap={UNIT_TOUGHNESS_CAP} /></div>

          <H>Stats</H>
          <div className="space-y-1 mb-3">
            <Bar label="Health" fraction={stats.maxHealth / UNIT_MAX.health} value={String(stats.maxHealth)} color={STAT_COLOR} />
            <Bar label="Speed" fraction={stats.speedMod / UNIT_MAX.speed} value={speedText(stats.speedMod)} color={STAT_COLOR} />
            <Bar label="Vision" fraction={stats.visionRange / UNIT_MAX.vision} value={`${stats.visionRange} tiles`} color={STAT_COLOR} />
            <Bar label="Range" fraction={(isArtillery ? ARTILLERY.range[1] : weapon?.range ?? 0) / UNIT_MAX.range}
              value={weapon ? (isArtillery ? `${ARTILLERY.range[1]}–${ARTILLERY.range[3]}` : `${weapon.range} tiles`) : '—'} color={STAT_COLOR} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-4">
            {([
              ['Built at', producerLabel(type) ?? '—'],
              ['Unlocks', trainable(type) ? `Tier ${rules.tier}` : '—'],
              ['Cost', stats.cost ? `${stats.cost} cores` : '—'],
              ['Population', String(rules.pop)],
              ['Build time', rules.buildTimeMs ? `${rules.buildTimeMs / 1000}s` : '—'],
              ['Armour', ARMOR_LABEL[rules.armor]],
              ['Captures', stats.captureMultiplier > 0 ? `Yes (${stats.captureMultiplier}×)` : 'No'],
            ] as [string, string][]).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-slate-500">{k}</dt><dd className="text-slate-200">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
          {note.source && <Item label="Where it comes from">{note.source}</Item>}
          {trainable(type) && counters.length > 0 && (
            <Item label="Countered by">
              <span className="flex flex-wrap gap-x-3">{counters.map(t => <UnitLink key={t} type={t} onOpen={onOpen} />)}</span>
            </Item>
          )}
        </div>

        <div>
          {(note.actions?.length || abilities.length > 0) && <H>Abilities</H>}
          {note.actions?.map(a => <Item key={a.name} label={a.name}>{a.text}</Item>)}
          {abilities.map(a => (
            <Item key={a.id} label={<>{a.name} <span className="text-amber-300 normal-case font-normal">· Tier {a.tier}{abilityUpgrade(a) ? ' + research' : ''} · {a.cooldownMs / 1000}s cooldown{a.targeted ? ` · aimed, ${a.targeted.range} tiles` : ''}</span></>}>
              {a.description}
            </Item>
          ))}

          <H>Upgrade tree</H>
          <ol className="relative border-l border-slate-700 ml-2">
            {tiers.map(t => {
              const steps = stepsAt(t);
              const locked = trainable(type) && t < rules.tier;
              return (
                <li key={t} className="ml-4 mb-3">
                  <span className={`absolute -left-[7px] w-3 h-3 rounded-full border ${steps.length ? 'bg-amber-400 border-amber-200' : 'bg-slate-800 border-slate-600'}`} />
                  <div className="text-xs font-mono text-amber-300">TIER {t}{t > 1 ? ` · research ${TIER_RESEARCH_COST[t as 2 | 3]} compute` : ''}</div>
                  <div className="text-xs text-slate-300">
                    {locked ? <span className="text-slate-500">Not yet available</span>
                      : steps.length ? steps.map(s => <div key={s}>{s}</div>)
                      : <span className="text-slate-500">No change</span>}
                  </div>
                </li>
              );
            })}
          </ol>
          {rules.armor !== 'infantry' && rules.armor !== 'air' && UNIT_STATS[type].unitClass === 'armor' && (
            <p className="text-[11px] text-slate-400">Doctrine: with Heavy Metal, Guardians and your base repair armour units 50% faster, and from Tier 2 armour repairs itself out of combat.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Tabs ---

// Every trainable unit side by side: what it hits hard, and how tough it is.
const PRODUCER_ORDER: StructureType[] = ['infantry', 'armor', 'air', 'support', 'builder', 'ordnance_fab'];
const MiniBar: React.FC<{ fraction: number; value: string; color: string; best?: boolean }> = ({ fraction, value, color, best }) => (
  <div className="min-w-[56px]">
    <div className={`text-[11px] tabular-nums ${fraction > 0 ? (best ? 'text-white font-bold' : 'text-slate-300') : 'text-slate-600'}`}>{value}</div>
    <div className="h-1.5 bg-slate-800 rounded-sm overflow-hidden">
      <div className="h-1.5 rounded-sm" style={{ width: `${fraction > 0 ? Math.max(4, Math.min(1, fraction) * 100) : 0}%`, background: color }} />
    </div>
  </div>
);

const CompareChart: React.FC<{ color: string; onOpen: (t: UnitType) => void }> = ({ color, onOpen }) => (
  <div className="overflow-x-auto">
    <Legend />
    <table className="w-full text-xs border-separate border-spacing-x-2 border-spacing-y-1">
      <thead>
        <tr className="text-slate-500 text-[11px]">
          <th className="text-left font-normal">Unit</th>
          {ARMORS.map(a => <th key={a} className="text-left font-normal" style={{ color: ATTACK_COLOR }}>vs {ARMOR_SHORT[a]}</th>)}
          <th className="text-left font-normal" style={{ color: DEFENSE_COLOR }}>Health</th>
        </tr>
      </thead>
      <tbody>
        {PRODUCER_ORDER.map(producer => {
          const units = TRAINABLE.filter(t => UNIT_RULES[t].producer === producer).sort((a, b) => UNIT_RULES[a].tier - UNIT_RULES[b].tier);
          if (units.length === 0) return null;
          return (
            <React.Fragment key={producer}>
              <tr><td colSpan={ARMORS.length + 2} className="pt-2 text-fuchsia-400 font-mono text-[10px] uppercase tracking-widest">{STRUCTURE_INFO[producer].label}</td></tr>
              {units.map(t => {
                const values = ARMORS.map(a => dps(UNIT_RULES[t].weapon, a));
                const best = Math.max(...values);
                return (
                  <tr key={t}>
                    <td className="whitespace-nowrap pr-2">
                      <span className="inline-flex items-center gap-1.5">
                        <RoleBadge role={UNIT_ROLE[t]} color={color} size={16} />
                        <UnitLink type={t} onOpen={onOpen} />
                        <span className="text-slate-600 text-[10px]">T{UNIT_RULES[t].tier}</span>
                      </span>
                    </td>
                    {values.map((v, i) => (
                      <td key={ARMORS[i]}><MiniBar fraction={v / ATTACK_MAX} value={v ? v.toFixed(1) : '—'} color={ATTACK_COLOR} best={v > 0 && v === best} /></td>
                    ))}
                    <td><MiniBar fraction={UNIT_STATS[t].maxHealth / UNIT_MAX.health} value={String(UNIT_STATS[t].maxHealth)} color={DEFENSE_COLOR} /></td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
    <p className="text-[11px] text-slate-500 mt-2">Attack numbers are damage per second. Each unit's best target is in bold. Open a unit for how tough it is against each weapon type.</p>
  </div>
);

const UnitsTab: React.FC<{ color: string; open: UnitType | null; onOpen: (t: UnitType | null) => void }> = ({ color, open, onOpen }) => {
  const [view, setView] = useState<'roles' | 'compare'>('roles');
  if (open) return <UnitDetail type={open} color={color} onOpen={onOpen} onBack={() => onOpen(null)} />;
  const byRole = (role: UnitRole) => (Object.keys(UNIT_ROLE) as UnitType[]).filter(t => UNIT_ROLE[t] === role);
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {([['roles', 'By role'], ['compare', 'Compare all']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
            className={`px-2 py-1 font-mono text-[11px] uppercase border ${view === id ? 'border-fuchsia-400 text-fuchsia-300' : 'border-slate-700 text-slate-400 hover:text-cyan-200'}`}>
            {label}
          </button>
        ))}
      </div>
      {view === 'compare' ? <CompareChart color={color} onOpen={onOpen} /> : <>
      <p className="text-slate-400 text-xs mb-4">
        Every unit carries one of these badges in its team colour, above it on the map and on the minimap, so you can read an army at a glance. Click a unit's name for its full brief and upgrade tree, or Compare all to see every unit's strengths side by side.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ROLE_ORDER.map(role => (
          <div key={role} className="flex gap-3 p-3 rounded border border-slate-700/60 bg-slate-900/40">
            <RoleBadge role={role} color={role === 'sentinel' ? '#94a3b8' : color} size={32} />
            <div className="min-w-0">
              <div className="text-cyan-200 font-bold text-xs uppercase">{ROLE_LABEL[role]}</div>
              <p className="text-slate-400 text-[11px] leading-snug mb-1">{ROLE_INFO[role]}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {byRole(role).map(t => <UnitLink key={t} type={t} onOpen={onOpen} />)}
              </div>
            </div>
          </div>
        ))}
      </div>
      </>}
    </div>
  );
};

const STRUCTURE_ORDER: StructureType[] = ['infantry', 'armor', 'air', 'support', 'builder', 'ordnance_fab', 'research_lab', 'refinery', 'wall_tier1', 'wall_tier2', 'defense', 'aa_turret', 'hq'];
const STRUCTURE_TEXT: Partial<Record<StructureType, string>> = {
  infantry: 'Trains infantry.',
  armor: 'Trains vehicles.',
  air: 'Trains aircraft.',
  support: 'Trains support units and the Ballista.',
  builder: 'Trains Masons and unlocks walls and turrets.',
  ordnance_fab: 'Builds EMP and HE warheads for Ballistas, and trains Field Fabricators.',
  refinery: 'Core Refinery: makes cores at home. Each pays 1.5 cores/s plus a share of your core node income: 15% if its base is on the city block next to a core node, 4% fewer for each block further, down to 4% (the shares stack to +40% across refineries). Build new bases beside core nodes for the best refineries. Up to 2 per Command HQ, on a building pad. Upgrade one to level 2 at Tier 2 (500 cores) for 4 cores/s from that refinery; the multiplier stays the same.',
  research_lab: 'Advanced Research: researches unit upgrades, one at a time, for cores, compute and time. Each upgrade also gives that unit type +20% health and +15% damage. A unit\'s second ability, the Ghost\'s Dampener and Phantom Decoy, the Thunderhead\'s longer range and the Hornet\'s rockets all need researching here after reaching their tier.',
  wall_tier1: 'Cheap tank traps that block a lane. One Mason haul.',
  wall_tier2: 'A heavy wall. Three Mason hauls.',
  defense: 'Anti-vehicle cannon: armour-piercing shells that crack tanks and light vehicles. Cannot shoot aircraft. Mason-built, only on the corner pads of one of your Command HQs.',
  aa_turret: 'CIWS turret: the Aegis rotary cannon on a fixed mount with its own tracking radar. Shoots down aircraft and incoming missiles within 10 tiles; with the sky clear it hoses ground units within 6 tiles at a fraction of the damage. Fires in bursts and reloads. Mason-built, only on the corner pads of one of your Command HQs.',
  hq: 'Your headquarters. Builds structures, researches tiers and earns income. Lose it and you lose.',
};

const StructuresTab: React.FC<{ onOpen: (t: UnitType) => void }> = ({ onOpen }) => (
  <div>
    <Legend />
    <p className="text-slate-400 text-xs mb-4">Every free building pad and turret corner around your Command HQs is marked with a +: click it and pick what to build there. Double-click a finished structure to train from it. Any base building or turret can be disassembled from its menu: it comes down over 8s and pays back half its cost (one still going up is cancelled with all its cost back). Turrets and walls need a Depot and Masons to build; walls come from the Depot menu.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {STRUCTURE_ORDER.map(s => {
        const info = STRUCTURE_INFO[s];
        const trains = unitsProducedBy(s);
        const weapon = STRUCTURE_RULES[s].weapon;
        return (
          <div key={s} className="p-3 rounded border border-slate-700/60 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-sm" style={{ background: info.color }} />
              <span className="text-cyan-200 font-bold text-xs uppercase">{info.label}</span>
              <span className="ml-auto text-[11px] text-slate-400">{info.cost ? `${info.cost} cores` : ''}</span>
            </div>
            <p className="text-slate-400 text-[11px] mb-2">
              {STRUCTURE_TEXT[s]}
              {STRUCTURE_RULES[s].buildTimeMs ? ` Builds in ${STRUCTURE_RULES[s].buildTimeMs / 1000}s.` : ''}
              {weapon ? ` Armed: ${weapon.damage} ${DAMAGE_LABEL[weapon.type].toLowerCase()} every ${weapon.cooldownMs / 1000}s, range ${weapon.range}.` : ''}
            </p>
            <div className="space-y-1 mb-2">
              <Bar label="Health" fraction={info.maxHealth / STRUCTURE_HEALTH_MAX} value={String(info.maxHealth)} color={STAT_COLOR} />
              <DefenseBars health={info.maxHealth} armor="structure" cap={STRUCTURE_TOUGHNESS_CAP} />
            </div>
            {weapon && <div className="mb-2"><AttackBars weapon={weapon} /></div>}
            {trains.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {trains.map(t => (
                  <span key={t} className="text-[11px] text-slate-500"><UnitLink type={t} onOpen={onOpen} /> T{UNIT_RULES[t].tier}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const BasicsTab: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <H>Camera</H>
      <Item label="Pan"><Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> or the arrow keys.</Item>
      <Item label="Rotate and tilt">Hold the right mouse button and drag.</Item>
      <Item label="Zoom">Mouse wheel.</Item>
      <H>Orders</H>
      <Item label="Select">Click a unit, or drag a box over several with the left mouse button. Clicking empty ground with nothing selected clears the selection.</Item>
      <Item label="Move">With units selected, click the ground. Ground units take the quickest route (main roads are twice as fast, open ground half as fast); aircraft fly straight.</Item>
      <Item label="Attack-move">Hold <Key>Ctrl</Key> while clicking, or press <Key>F</Key> then click. Units stop to fight anything on the way.</Item>
      <Item label="Armies">Everything you select is listed above the minimap, one line per unit type with a count (×3). Click a line to open that type's orders: aimed attacks such as missile launches, cannon shots and fire missions are then carried out by every selected unit of that type at once. Group Army saves the selection as Army 1, 2, 3...; click it or press its number key to select it again, and click again to centre the camera on it.</Item>
      <Item label="Unit actions">A selected unit shows its action menu above it: abilities, anchors, fire missions. Aimed ones take a map click; <Key>Esc</Key> cancels.</Item>
    </div>
    <div>
      <H>Your first minutes</H>
      <ol className="list-decimal ml-5 space-y-2 text-xs text-slate-300">
        <li>Send Troopers to the nearest core node to capture it: it pays cores and raises your population cap.</li>
        <li>Click a + pad beside your HQ and build a Barracks, then a Factory on another.</li>
        <li>Capture ordinary buildings near your army to stretch the energy grid toward the fight.</li>
        <li>Take the server node in your half for compute, then Research Tier 2 for better units and abilities.</li>
        <li>Build a mixed army (check the Units tab for counters) and take the enemy's core nodes or their HQ.</li>
      </ol>
    </div>
  </div>
);

const EconomyTab: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <H>Cores (money)</H>
      <Item label="Income">Your HQ pays {HQ_INCOME} cores a second. Each core node you hold pays {BUILDING_VALUES.core_node.income} more. Only infantry capture, and core nodes are slow to take.</Item>
      <Item label="Population">Starts at {POP_BASE}. Each core node held adds {POP_PER_CORE_NODE}, and every {GRID_TILES_PER_POP} tiles of energy grid your captured buildings cover add 1 more, so spreading across the city raises it bit by bit. Up to {POP_MAX}. Hover Pop in your team panel for the breakdown. Queued units reserve their population.</Item>
      <H>Compute and tiers</H>
      <Item label="Compute">Each server node you hold makes {COMPUTE_PER_SERVER_NODE} compute a second; your HQ adds {HQ_COMPUTE}. Spend it on Research in your team panel or the HQ menu.</Item>
      <Item label="Tiers">Tier 2 costs {TIER_RESEARCH_COST[2]} compute, Tier 3 {TIER_RESEARCH_COST[3]}. A researched tier is yours for good. Tiers unlock units, unit abilities, doctrine powers and longer artillery range.</Item>
    </div>
    <div>
      <H>Server nodes</H>
      <Item label="Where">Five on the map: one in your half, one in the enemy's, two on the flanks and one in the centre. Each is guarded by a Sentinel drone that attacks everyone.</Item>
      <H>Energy grid</H>
      <Item label="Power">Your HQ powers {ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS} tiles around it, and each captured building (not core nodes) adds {ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS} more. Vehicles and aircraft recharge inside and drain outside; on a flat battery they crawl at 30% speed. You can only build inside it.</Item>
      <Item label="Stretching it">Battery Mules and Helios drones keep vehicles going beyond the grid.</Item>
    </div>
  </div>
);

const CombatTab: React.FC = () => (
  <div>
    <H>Damage types</H>
    <p className="text-slate-400 text-xs mb-2">How hard each kind of weapon hits each kind of target. Above 1× is effective; below is weak.</p>
    <div className="overflow-x-auto mb-6">
      <table className="text-xs w-full">
        <thead>
          <tr className="text-slate-500"><th className="text-left font-normal pr-3">Weapon \ Target</th>{ARMORS.map(a => <th key={a} className="font-normal px-2">{ARMOR_LABEL[a]}</th>)}</tr>
        </thead>
        <tbody>
          {(Object.keys(DAMAGE_MULTIPLIER) as DamageType[]).map(d => (
            <tr key={d} className="border-t border-slate-800">
              <td className="text-cyan-200 pr-3 py-1">{DAMAGE_LABEL[d]}</td>
              {ARMORS.map(a => {
                const m = DAMAGE_MULTIPLIER[d][a];
                return <td key={a} className={`text-center ${m >= 1.25 ? 'text-emerald-400 font-bold' : m >= 1 ? 'text-emerald-300' : m === 0 ? 'text-slate-600' : 'text-rose-300'}`}>{m}×</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <H>Counters</H>
        <Item label="Rock, paper, scissors">Razorbacks hunt Troopers; Lancers and Hornets hunt vehicles; Aegis and Troopers shoot down aircraft; Titans break infantry blobs and bases; Thunderheads shell anything that stands still.</Item>
        <Item label="Targeting">Units fire at the nearest enemy they can hit and stick with it. They only shoot buildings when no unit is in range.</Item>
      </div>
      <div>
        <H>Tactics</H>
        <Item label="Artillery">Thunderheads only fire when anchored, need vision (or a Fire Mission) and can't hit within {ARTILLERY.minRange} tiles. Shells take a moment to land, so keep moving under fire.</Item>
        <Item label="EMP">EMPs shut down anything that runs on a battery (vehicles and aircraft) caught in the blast: they can't move or fire until it wears off. Infantry are unaffected. The Ballista's EMP missile also blacks out the enemy energy grid inside the blast (a crackling blue zone): no recharging and no building there until it fades.</Item>
        <Item label="Abilities">Many units have abilities that unlock as you research tiers. Open a unit's page in the Units tab to see them.</Item>
        <Item label="Repairs">Units never heal on their own (except Heavy Metal armour from Tier 2, out of combat). They recover beside a Guardian (repair beams) or inside your HQ's own city block, where everything repairs at {Math.round(BASE_REPAIR.perSecond * 100)}% of its health a second. Pull damaged units back to base or bring Guardians.</Item>
      </div>
    </div>
  </div>
);

const DoctrinesTab: React.FC = () => (
  <div>
    <p className="text-slate-400 text-xs mb-4">Pick one doctrine per match with the ★ button. Its passive is always on; its powers unlock with your tiers and cost cores to use.</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {(Object.keys(DOCTRINE_CONFIG) as DoctrineType[]).map(d => {
        const c = DOCTRINE_CONFIG[d];
        return (
          <div key={d} className="p-3 rounded border border-slate-700/60 bg-slate-900/40">
            <div className="text-amber-300 font-bold text-xs uppercase mb-2">{c.label}</div>
            <Item label="Passive">{c.tier1_passive}</Item>
            <Item label={`Tier 2 · ${c.tier2_name}`}>{c.tier2_desc} {c.tier2_cost} cores, {c.tier2_cooldown / 1000}s cooldown.</Item>
            <Item label={`Tier 3 · ${c.tier3_name}`}>{c.tier3_desc} {c.tier3_cost} cores, {c.tier3_cooldown / 1000}s cooldown.</Item>
          </div>
        );
      })}
    </div>
  </div>
);

const InterfaceTab: React.FC<{ color: string }> = ({ color }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <H>Team panel</H>
      <Item label="⚡ Compute">Compute banked and its rate. The Research button lights up when you can afford the next tier.</Item>
      <Item label="Cores">Cores banked and income per second.</Item>
      <Item label="Grid / Cores / Tier / Pop">Buildings captured, core nodes held out of 6, researched tier, and population used of your cap.</Item>
      <H>Top of the screen</H>
      <Item label="Clock">The match clock.</Item>
      <Item label="System message">Your current objective, and notices such as finished structures or refused orders.</Item>
      <Item label="Active Protocols">Your doctrine's powers, with their cost and what unlocks them.</Item>
    </div>
    <div>
      <H>Minimap</H>
      <Item label="Missile launch">A flashing MISSILE LAUNCH alert, an orange warning triangle where an enemy missile took off, and a red blip halfway along its course once it gets there. Its live position shows only inside your Aegis radar.</Item>
      <Item label="What it shows">Team-coloured role badges for every unit you can see, your HQs as squares, the camera's view, your energy grid outline and warning marks at guarded server nodes.</Item>
      <H>On the map</H>
      <Item label={<span className="flex items-center gap-2"><RoleBadge role="infantry" color={color} size={18} /> Role badges</span>}>Above each unit you can see. A unit's badge hides while it is selected.</Item>
      <Item label="Rings">Team-coloured ring: selected. Coloured ring at a unit's feet: an ability is running (electric indigo with blue static: knocked out by an EMP). Orange ring: a Thunderhead's range. Red reticle: its fire mission. Yellow ring: a Battery Mule's reach. Blue ring: a Banshee's tether leash.</Item>
      <Item label="Bars">Health, and battery for vehicles and aircraft, over damaged or selected units.</Item>
      <Item label="Radar">A green circle around your Aegis is its radar's reach; select the Aegis to see the sweep. Red pulsing dots inside it (and on the minimap) are enemy aircraft or ordnance it has picked up but nothing can see yet.</Item>
      <Item label="Incoming fire">Glowing shells dropping from the sky are enemy artillery: move out from under them. A blue crackling zone is an energy grid blacked out by an EMP.</Item>
    </div>
  </div>
);

const WinningTab: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <H>Destruction</H>
      <p className="text-xs text-slate-300 leading-relaxed">Destroy every enemy Command HQ: its starting one and any new bases it has built. Each has {STRUCTURE_INFO.hq.maxHealth} health and an anti-vehicle gun, so bring Titans, Lancers or artillery.</p>
      <H>New bases</H>
      <p className="text-xs text-slate-300 leading-relaxed">Level every building in a city block and its rubble clears away, leaving a base site marked with a button in the middle. Click it to build a new Command HQ there: {BASE_SITE.cores} cores and {BASE_SITE.compute} compute, {BASE_SITE.buildMs / 1000}s to build, and one of your units must be within {BASE_SITE.reach} tiles. It extends your energy grid, repairs units in its block and has the HQ menu.</p>
    </div>
    <div>
      <H>Territory</H>
      <p className="text-xs text-slate-300 leading-relaxed">Core and server nodes never win the match on their own. They pay for it: income and population from core nodes, compute for the next tier from server nodes. Destroying every enemy Command HQ is the only way to win.</p>
    </div>
  </div>
);

// --- The manual ---

export const OperationsManual: React.FC<{ team: 'blue' | 'red'; onClose: () => void }> = ({ team, onClose }) => {
  const [tab, setTab] = useState<Tab>('basics');
  const [unit, setUnit] = useState<UnitType | null>(null);
  const color = teamBadgeColor(team);
  // Unit links on other tabs jump to that unit's page.
  const openUnit = (t: UnitType | null) => { setUnit(t); if (t) setTab('units'); };
  // A new page starts at the top.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [tab, unit]);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100] p-4">
      <div className="hud-plate hud-corners w-full max-w-4xl backdrop-blur-xl p-4 md:p-6 pointer-events-auto relative overflow-hidden animate-in fade-in zoom-in duration-200" data-testid="operations-manual">
        <div className="relative flex justify-between items-center mb-4 border-b border-cyan-500/20 pb-3">
          <h2 className="text-xl md:text-2xl font-bold text-cyan-400 font-mono tracking-widest uppercase flex items-center gap-3">
            <span className="w-4 h-4 bg-cyan-500 rounded-sm"></span>
            Operations Manual
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-cyan-400 transition-colors font-mono text-sm">[ CLOSE ]</button>
        </div>

        <div role="tablist" className="flex gap-1 overflow-x-auto mb-4 pb-1">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => { setTab(t.id); if (t.id === 'units') setUnit(null); }}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-cyan-400 text-slate-950 border-cyan-200' : 'border-slate-700 text-slate-400 hover:text-cyan-200 hover:border-cyan-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div ref={body} className="relative max-h-[65vh] overflow-y-auto pr-2">
          {tab === 'basics' && <BasicsTab />}
          {tab === 'units' && <UnitsTab color={color} open={unit} onOpen={openUnit} />}
          {tab === 'structures' && <StructuresTab onOpen={openUnit} />}
          {tab === 'economy' && <EconomyTab />}
          {tab === 'combat' && <CombatTab />}
          {tab === 'doctrines' && <DoctrinesTab />}
          {tab === 'interface' && <InterfaceTab color={color} />}
          {tab === 'winning' && <WinningTab />}
        </div>
      </div>
    </div>
  );
};
