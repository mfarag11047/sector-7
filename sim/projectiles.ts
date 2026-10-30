// Projectile flight: Titan shells, Ballista missiles, orbital drops and
// nano canisters.
//
// This code used to run once per animation frame, so shells flew slower whenever the
// frame rate dropped below 20 fps and hit detection depended on the frame rate.
// stepProjectiles now advances every shot on the fixed game tick, in small sub-steps
// so hit detection is as fine as it was at 60 fps. The flight rules themselves are
// unchanged and were moved here from CityMap.tsx.

import { ABILITY_CONFIG, CITY_CONFIG, STRUCTURE_INFO } from '../constants';
import type { BuildingData, CloudData, DecoyData, Explosion, Projectile, StructureData, UnitData } from '../types';
import { ArmorClass, isAirType } from './units';
import { HE, WP } from './warheads';
import { FORCE_FIELD, type ForceField } from './forcefield';
import { isHidden } from './cloak';

// How fast a ballistic shot flies: Ballista warheads faster than drop pods.
const cruiseSpeed = (p: Projectile) =>
    p.payload === 'emp' || p.payload === 'he' || p.payload === 'wp' ? ABILITY_CONFIG.BALLISTA_MISSILE_SPEED : ABILITY_CONFIG.MISSILE_CRUISE_SPEED;

// How far along its arc a ballistic missile is, 0 at launch to 1 at impact.
export const ballisticProgress = (p: Projectile, nowMs: number) => {
    const totalDuration = (p.maxDistance / cruiseSpeed(p)) * 1000;
    return totalDuration > 0 ? Math.min(1, Math.max(0, (nowMs - (p.startTime || nowMs)) / totalDuration)) : 1;
};

// Ballistic missiles are a closed-form arc, so the mesh can follow the same
// curve the sim uses without waiting for the 10 Hz tick.
export const sampleBallistic = (p: Projectile, nowMs: number) => {
    const start = p.startPos!;
    const target = p.targetPos!;
    const totalDuration = (p.maxDistance / cruiseSpeed(p)) * 1000;
    const elapsed = nowMs - (p.startTime || nowMs);
    const t = Math.min(1, Math.max(0, totalDuration > 0 ? elapsed / totalDuration : 1));
    const peakHeight = Math.min(120, p.maxDistance * 0.5);
    const x = start.x + (target.x - start.x) * t;
    const z = start.z + (target.z - start.z) * t;
    const y = 4 * peakHeight * t * (1 - t) + start.y * (1 - t) + target.y * t;

    const tNext = Math.min(1, t + 0.01);
    const x2 = start.x + (target.x - start.x) * tNext;
    const z2 = start.z + (target.z - start.z) * tNext;
    const y2 = 4 * peakHeight * tNext * (1 - tNext) + start.y * (1 - tNext) + target.y * tNext;
    return { x, y, z, vx: x2 - x, vy: y2 - y, vz: z2 - z };
};

export type LiveFlight = { shot: Projectile; impacted: boolean };

export type FlightEvent =
    | { kind: 'explosion'; position: { x: number; y: number; z: number }; radius: number; duration: number; style?: Explosion['style'] }
    // ownerId: the unit that fired it, for the pacing report's damage tally.
    // vs: damage multiplier by armour class (the HE missile is anti-armour).
    | { kind: 'damage'; position: { x: number; y: number; z: number }; radius: number; damage: number; team: UnitData['team']; ownerId?: string; vs?: Record<ArmorClass, number> }
    | { kind: 'decoy'; id: string }
    | { kind: 'cloud'; cloudType: 'nano' | 'emp' | 'wp'; position: { x: number; y: number; z: number }; team: CloudData['team'] }
    | { kind: 'titan'; position: { x: number; y: number; z: number }; team: 'blue' | 'red' }
    | { kind: 'cloak'; position: { x: number; y: number; z: number }; team: 'blue' | 'red' }
    | { kind: 'field'; position: { x: number; y: number; z: number }; team: 'blue' | 'red' }
    // A shot stopped on a force field's dome, wearing down its shield.
    | { kind: 'shieldHit'; fieldId: string; damage: number };

export const cloneProjectile = (p: Projectile): Projectile => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
    startPos: p.startPos ? { ...p.startPos } : undefined,
    targetPos: p.targetPos ? { ...p.targetPos } : undefined,
});

// Trophy systems stop heavy ordnance only. Small-arms fire is not a shot it can catch.
export const isHeavyOrdnance = (p: Projectile) => {
    if (p.trajectory === 'ballistic' && (p.payload === 'emp' || p.payload === 'he' || p.payload === 'wp')) return true;
    if (p.trajectory === 'direct' && !p.payload && p.damage >= ABILITY_CONFIG.TITAN_CANNON_DAMAGE) return true;
    return false;
};

export const flightUnitY = (u: UnitData) => {
    if (u.type === 'bombard') return 42.0;
    if (isAirType(u.type)) return 75.0;
    if (u.type === 'defense_drone') return 12.0;
    return 1.5;
};

// Steps a shot by one displayed frame and reports a hit on that same pose.
// The mesh reads this object, so the detonation is where the model is.
export const decoyWorld = (d: DecoyData, offset: number, tileSize: number) => ({
    x: (d.gridPos.x * tileSize) - offset,
    y: 1.5,
    z: (d.gridPos.z * tileSize) - offset,
});

// A cloaked Ghost is not a target. Shots can lock and strike the projections instead.
export const advanceFlight = (
    p: Projectile,
    dt: number,
    now: number,
    offset: number,
    tileSize: number,
    gridSize: number,
    units: UnitData[],
    buildings: BuildingData[],
    structures: StructureData[],
    decoys: DecoyData[],
): FlightEvent[] | null => {
    if (p.trajectory === 'ballistic' && p.startPos && p.startTime && p.targetPos) {
        const pose = sampleBallistic(p, now);
        p.position = { x: pose.x, y: pose.y, z: pose.z };
        p.velocity = { x: pose.vx, y: pose.vy, z: pose.vz };
        const totalDuration = (p.maxDistance / cruiseSpeed(p)) * 1000;
        const t = totalDuration > 0 ? (now - p.startTime) / totalDuration : 1;
        if (t < 1) return null;

        const events: FlightEvent[] = [];
        if (p.payload === 'emp') {
            // A blue energy discharge the size of the blast, not a fireball.
            events.push({ kind: 'explosion', position: p.targetPos, radius: ABILITY_CONFIG.EMP_RADIUS * tileSize, duration: 1400, style: 'emp' });
            events.push({ kind: 'cloud', cloudType: 'emp', position: p.targetPos, team: p.team });
            return events;
        }
        if (p.payload === 'wp') {
            // Bursts high over the target; the canisters fall and lay the gas (sim/warheads.ts).
            events.push({ kind: 'explosion', position: { ...p.targetPos, y: p.targetPos.y + WP.burstHeight }, radius: 5, duration: 900, style: 'airburst' });
            events.push({ kind: 'cloud', cloudType: 'wp', position: p.targetPos, team: p.team });
            return events;
        }
        events.push({
            kind: 'explosion',
            position: p.targetPos,
            radius: p.payload === 'nano_canister' ? 2 : 8,
            duration: p.payload === 'nano_canister' ? 500 : 1200,
        });
        if ((p.payload || 'he') === 'he') {
            events.push({ kind: 'damage', position: p.targetPos, damage: HE.damage, radius: HE.radius * tileSize, team: p.team, ownerId: p.ownerId, vs: p.payload === 'he' ? HE.vs : undefined });
        }
        if (p.payload === 'nano_cloud_master') events.push({ kind: 'cloud', cloudType: 'nano', position: p.targetPos, team: p.team });
        return events;
    }

    const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
    const moveAmount = speed * dt;
    const stepSize = CITY_CONFIG.tileSize * 0.4;
    const steps = Math.max(1, Math.ceil(moveAmount / stepSize));
    const stepX = (p.velocity.x * dt) / steps;
    const stepY = (p.velocity.y * dt) / steps;
    const stepZ = (p.velocity.z * dt) / steps;
    let hit = false;
    // The unit a shell ran into. Shells stop up to 0.8 tiles short of a unit, which is outside
    // their 3-unit blast, so the blast is centered on the unit instead. Before this the
    // Titan cannon never damaged the unit it hit.
    let struck: { x: number; y: number; z: number } | null = null;

    if (speed > 0) {
        for (let i = 0; i < steps; i++) {
            p.position.x += stepX;
            p.position.y += stepY;
            p.position.z += stepZ;
            p.distanceTraveled += Math.hypot(stepX, stepY, stepZ);

            if (p.position.y <= 0.5) { hit = true; break; }

            if (p.payload === 'titan_drop' || p.payload === 'cloak_drop' || p.payload === 'field_drop') {
                if (p.position.y <= 0.5) { hit = true; break; }
            } else {
                if (p.distanceTraveled >= p.maxDistance) { hit = true; break; }
                const gx = Math.round((p.position.x + offset) / CITY_CONFIG.tileSize);
                const gz = Math.round((p.position.z + offset) / CITY_CONFIG.tileSize);
                if (gx >= 0 && gx < gridSize && gz >= 0 && gz < gridSize) {
                    const building = buildings.find(b => b.gridX === gx && b.gridZ === gz);
                    if (building && p.position.y > 0 && p.position.y < building.scale[1]) { hit = true; break; }
                    const structure = structures.find(s => s.gridPos.x === gx && s.gridPos.z === gz && !s.isBlueprint);
                    if (structure && p.position.y > 0 && p.position.y < STRUCTURE_INFO[structure.type].height) { hit = true; break; }
                }
                for (const u of units) {
                    if (u.team === p.team || u.health <= 0 || u.decoyActive) continue;
                    const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                    const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                    if (Math.hypot(p.position.x - uX, p.position.z - uZ) < CITY_CONFIG.tileSize * 0.8) { hit = true; struck = { x: uX, y: p.position.y, z: uZ }; break; }
                }
                if (!hit) {
                    for (const d of decoys) {
                        if (d.team === p.team) continue;
                        const pos = decoyWorld(d, offset, tileSize);
                        if (Math.hypot(p.position.x - pos.x, p.position.z - pos.z) < CITY_CONFIG.tileSize * 0.8) { hit = true; break; }
                    }
                }
            }
            if (hit) break;
        }
    }

    if (!hit) return null;
    const events: FlightEvent[] = [
        { kind: 'explosion', position: { ...p.position }, radius: 3, duration: 500 },
    ];
    if (p.payload === 'titan_drop' && p.targetPos) {
        events.push({ kind: 'titan', position: p.targetPos, team: p.team as 'blue' | 'red' });
    } else if (p.payload === 'cloak_drop' && p.targetPos) {
        events.push({ kind: 'cloak', position: p.targetPos, team: p.team as 'blue' | 'red' });
    } else if (p.payload === 'field_drop' && p.targetPos) {
        events.push({ kind: 'field', position: p.targetPos, team: p.team as 'blue' | 'red' });
    } else if (p.payload === 'nano_cloud_master') {
        events.push({ kind: 'cloud', cloudType: 'nano', position: { ...p.position }, team: p.team });
        events.push({ kind: 'damage', position: { ...p.position }, damage: p.damage, radius: 3, team: p.team, ownerId: p.ownerId });
    } else {
        events.push({ kind: 'damage', position: struck ?? { ...p.position }, damage: p.damage, radius: 3, team: p.team, ownerId: p.ownerId });
    }
    const struckDecoy = decoys.find(d => {
        if (d.team === p.team) return false;
        const pos = decoyWorld(d, offset, tileSize);
        return Math.hypot(p.position.x - pos.x, p.position.z - pos.z) < CITY_CONFIG.tileSize * 0.8;
    });
    if (struckDecoy) events.push({ kind: 'decoy', id: struckDecoy.id });
    return events;
};

// Sub-step length. Matches a 60 fps frame, which is what the hit tests were tuned for.
export const FLIGHT_SUBSTEP_MS = 1000 / 60;

export interface FlightWorld {
    offset: number;
    tileSize: number;
    gridSize: number;
    units: UnitData[];
    buildings: BuildingData[];
    structures: StructureData[];
    decoys: DecoyData[];
    // Force fields up (sim/forcefield.ts). An enemy shot that came from outside one is stopped
    // on its dome, which is a hemisphere of the field's radius.
    fields?: readonly ForceField[];
}

// What a shot stopped on a dome takes off its shield.
const shieldDamageOf = (p: Projectile) =>
    p.payload === 'titan_drop' || p.payload === 'cloak_drop' || p.payload === 'field_drop' ? FORCE_FIELD.absorb.pod
    : p.trajectory === 'ballistic' ? FORCE_FIELD.absorb.missile
    : p.damage;

// The enemy dome a shot has just flown into from outside, if any.
function domeHit(p: Projectile, fields: readonly ForceField[], offset: number, tileSize: number) {
    for (const f of fields) {
        if (f.team === p.team) continue;
        const cx = f.center.x * tileSize - offset;
        const cz = f.center.z * tileSize - offset;
        const r = f.radius * tileSize;
        if (Math.hypot(p.position.x - cx, p.position.y, p.position.z - cz) > r) continue;
        const start = p.startPos;
        if (start && Math.hypot(start.x - cx, start.y, start.z - cz) <= r) continue;
        return f;
    }
    return null;
}

export interface FlightTickResult {
    impactedIds: string[];
    events: FlightEvent[];
    // Guardians whose Trophy system fired this tick.
    trophyFired: string[];
}

// One game tick of flight for every live shot. Shots are advanced in place, as before.
// `trophyReady` maps a Guardian id to the time its Trophy system can fire again.
export function stepProjectiles(
    flights: Map<string, LiveFlight>,
    dtMs: number,
    now: number,
    world: FlightWorld,
    trophyReady: Map<string, number>,
): FlightTickResult {
    const result: FlightTickResult = { impactedIds: [], events: [], trophyFired: [] };
    const substeps = Math.max(1, Math.ceil(dtMs / FLIGHT_SUBSTEP_MS));
    const stepMs = dtMs / substeps;
    const trophyRadius = ABILITY_CONFIG.GUARDIAN_TROPHY_RANGE * world.tileSize;

    for (let i = 1; i <= substeps; i++) {
        const at = now - dtMs + i * stepMs;
        for (const [id, live] of flights) {
            if (live.impacted) continue;
            const produced = advanceFlight(live.shot, stepMs / 1000, at, world.offset, world.tileSize, world.gridSize,
                world.units, world.buildings, world.structures, world.decoys);

            // Stopped on an enemy force field's skin.
            const dome = world.fields?.length ? domeHit(live.shot, world.fields, world.offset, world.tileSize) : null;
            if (dome) {
                live.impacted = true;
                result.impactedIds.push(id);
                result.events.push({ kind: 'explosion', position: { ...live.shot.position }, radius: 3, duration: 600, style: 'shield' });
                result.events.push({ kind: 'shieldHit', fieldId: dome.id, damage: shieldDamageOf(live.shot) });
                continue;
            }

            // A Guardian's Trophy system knocks heavy ordnance out of the air, one shot per cooldown.
            if (isHeavyOrdnance(live.shot)) {
                let best: UnitData | null = null;
                let bestDist = trophyRadius;
                for (const guardian of world.units) {
                    if (guardian.type !== 'guardian' || guardian.health <= 0 || guardian.team === live.shot.team) continue;
                    if ((trophyReady.get(guardian.id) ?? 0) > at) continue;
                    const gx = (guardian.gridPos.x * world.tileSize) - world.offset;
                    const gz = (guardian.gridPos.z * world.tileSize) - world.offset;
                    const dist = Math.hypot(live.shot.position.x - gx, live.shot.position.z - gz);
                    if (dist <= bestDist) {
                        bestDist = dist;
                        best = guardian;
                    }
                }
                if (best) {
                    result.trophyFired.push(best.id);
                    trophyReady.set(best.id, at + ABILITY_CONFIG.GUARDIAN_TROPHY_COOLDOWN);
                    live.impacted = true;
                    result.impactedIds.push(id);
                    result.events.push({ kind: 'explosion', position: { ...live.shot.position }, radius: 2.2, duration: 450 });
                    continue;
                }
            }

            if (!produced) continue;
            live.impacted = true;
            result.impactedIds.push(id);
            result.events.push(...produced);
        }
    }
    return result;
}

// Where to draw a shot `secondsAhead` after its last tick. Ballistic arcs are exact;
// everything else carries on in a straight line, which is close over a fraction of a tick.
export function drawnShotPosition(shot: Projectile, nowMs: number, secondsAhead: number) {
    if (shot.trajectory === 'ballistic' && shot.startPos && shot.startTime && shot.targetPos) {
        const pose = sampleBallistic(shot, nowMs);
        return { position: { x: pose.x, y: pose.y, z: pose.z }, heading: { x: pose.vx, y: pose.vy, z: pose.vz } };
    }
    const t = Math.min(Math.max(secondsAhead, 0), 0.15);
    const { position: p, velocity: v } = shot;
    return { position: { x: p.x + v.x * t, y: Math.max(p.y + v.y * t, 0.5), z: p.z + v.z * t }, heading: v };
}

