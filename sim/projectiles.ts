// Projectile flight: Titan shells, Ballista missiles, Wasp swarms, orbital drops and
// nano canisters.
//
// This code used to run once per animation frame, so shells flew slower whenever the
// frame rate dropped below 20 fps and hit detection depended on the frame rate.
// stepProjectiles now advances every shot on the fixed game tick, in small sub-steps
// so hit detection is as fine as it was at 60 fps. The flight rules themselves are
// unchanged and were moved here from CityMap.tsx.

import { ABILITY_CONFIG, CITY_CONFIG, STRUCTURE_INFO } from '../constants';
import type { BuildingData, CloudData, DecoyData, Projectile, StructureData, UnitData } from '../types';

// Ballistic missiles are a closed-form arc, so the mesh can follow the same
// curve the sim uses without waiting for the 10 Hz tick.
export const sampleBallistic = (p: Projectile, nowMs: number) => {
    const start = p.startPos!;
    const target = p.targetPos!;
    const totalDuration = (p.maxDistance / ABILITY_CONFIG.MISSILE_CRUISE_SPEED) * 1000;
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
    | { kind: 'explosion'; position: { x: number; y: number; z: number }; radius: number; duration: number }
    | { kind: 'damage'; position: { x: number; y: number; z: number }; radius: number; damage: number; team: UnitData['team'] }
    | { kind: 'decoy'; id: string }
    | { kind: 'cloud'; cloudType: 'nano' | 'eclipse'; position: { x: number; y: number; z: number }; team: CloudData['team'] }
    | { kind: 'titan'; position: { x: number; y: number; z: number }; team: 'blue' | 'red' };

export const cloneProjectile = (p: Projectile): Projectile => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
    startPos: p.startPos ? { ...p.startPos } : undefined,
    targetPos: p.targetPos ? { ...p.targetPos } : undefined,
});

// Trophy systems stop heavy ordnance only. Small-arms fire and swarm darts are not shots it can catch.
export const isHeavyOrdnance = (p: Projectile) => {
    if (p.trajectory === 'ballistic' && (p.payload === 'eclipse' || p.payload === 'he' || p.payload === 'nuke')) return true;
    if (p.trajectory === 'direct' && !p.payload && p.damage >= ABILITY_CONFIG.TITAN_CANNON_DAMAGE) return true;
    return false;
};

export const flightUnitY = (u: UnitData) => {
    if (['wasp', 'drone', 'helios'].includes(u.type)) return 75.0;
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
        const totalDuration = (p.maxDistance / ABILITY_CONFIG.MISSILE_CRUISE_SPEED) * 1000;
        const t = totalDuration > 0 ? (now - p.startTime) / totalDuration : 1;
        if (t < 1) return null;

        const events: FlightEvent[] = [];
        const isNuke = p.payload === 'nuke';
        events.push({
            kind: 'explosion',
            position: p.targetPos,
            radius: isNuke ? 12 : (p.payload === 'nano_canister' ? 2 : 8),
            duration: isNuke ? 2000 : (p.payload === 'nano_canister' ? 500 : 1200),
        });
        if (isNuke) {
            events.push({ kind: 'damage', position: p.targetPos, damage: 500, radius: 8 * tileSize, team: p.team });
        } else if ((p.payload || 'he') === 'he') {
            events.push({ kind: 'damage', position: p.targetPos, damage: 150, radius: 4 * tileSize, team: p.team });
        }
        if (p.payload === 'nano_cloud_master') events.push({ kind: 'cloud', cloudType: 'nano', position: p.targetPos, team: p.team });
        else if (p.payload === 'eclipse') events.push({ kind: 'cloud', cloudType: 'eclipse', position: p.targetPos, team: p.team });
        return events;
    }

    if (p.trajectory === 'swarm' && p.targetPos && p.startPos) {
        let targetLocation = p.targetPos;
        let hasUnitTarget = false;

        if (p.lockedTargetId) {
            const lockedUnit = units.find(u => u.id === p.lockedTargetId && u.health > 0 && !u.decoyActive);
            const lockedDecoy = decoys.find(d => d.id === p.lockedTargetId);
            if (lockedUnit) {
                targetLocation = {
                    x: (lockedUnit.gridPos.x * CITY_CONFIG.tileSize) - offset,
                    y: flightUnitY(lockedUnit),
                    z: (lockedUnit.gridPos.z * CITY_CONFIG.tileSize) - offset,
                };
                hasUnitTarget = true;
            } else if (lockedDecoy) {
                targetLocation = decoyWorld(lockedDecoy, offset, tileSize);
                hasUnitTarget = true;
            } else {
                p.lockedTargetId = null;
            }
        }

        if (!hasUnitTarget) {
            let closestDist = 6 * CITY_CONFIG.tileSize;
            let bestCandidateId: string | null = null;
            for (const u of units) {
                if (u.team === p.team || u.team === 'neutral' || u.health <= 0 || u.decoyActive) continue;
                const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                const dist = Math.hypot(p.position.x - uX, p.position.z - uZ);
                if (dist < closestDist) {
                    closestDist = dist;
                    bestCandidateId = u.id;
                }
            }
            for (const d of decoys) {
                if (d.team === p.team) continue;
                const pos = decoyWorld(d, offset, tileSize);
                const dist = Math.hypot(p.position.x - pos.x, p.position.z - pos.z);
                if (dist < closestDist) {
                    closestDist = dist;
                    bestCandidateId = d.id;
                }
            }
            if (bestCandidateId) {
                p.lockedTargetId = bestCandidateId;
                hasUnitTarget = true;
            }
        }

        const timeAlive = now - (p.startTime || 0);
        if (timeAlive > 500) {
            const dx = targetLocation.x - p.position.x;
            const dy = targetLocation.y - p.position.y;
            const dz = targetLocation.z - p.position.z;
            const distToTarget = Math.hypot(dx, dy, dz) || 1;
            const speed = ABILITY_CONFIG.WASP_MISSILE_SPEED;
            const turnRate = hasUnitTarget ? 8.0 : 2.0;
            p.velocity.x += ((dx / distToTarget) * speed - p.velocity.x) * turnRate * dt;
            p.velocity.y += ((dy / distToTarget) * speed - p.velocity.y) * turnRate * dt;
            p.velocity.z += ((dz / distToTarget) * speed - p.velocity.z) * turnRate * dt;
        } else {
            p.velocity.y -= 5 * dt;
        }

        p.position.x += p.velocity.x * dt;
        p.position.y += p.velocity.y * dt;
        p.position.z += p.velocity.z * dt;

        let hit = Math.hypot(p.position.x - targetLocation.x, p.position.y - targetLocation.y, p.position.z - targetLocation.z) < 2.0;
        if (p.position.y <= 0.5) hit = true;
        if (!hit) {
            for (const u of units) {
                if (u.team === p.team || u.health <= 0 || u.decoyActive) continue;
                const uX = (u.gridPos.x * CITY_CONFIG.tileSize) - offset;
                const uZ = (u.gridPos.z * CITY_CONFIG.tileSize) - offset;
                const dist = Math.hypot(p.position.x - uX, p.position.y - flightUnitY(u), p.position.z - uZ);
                if (dist < 1.5) { hit = true; break; }
            }
        }
        if (!hit) {
            for (const d of decoys) {
                if (d.team === p.team) continue;
                const pos = decoyWorld(d, offset, tileSize);
                if (Math.hypot(p.position.x - pos.x, p.position.y - pos.y, p.position.z - pos.z) < 1.5) { hit = true; break; }
            }
        }
        if (Math.hypot(p.position.x - p.startPos.x, p.position.z - p.startPos.z) > 100) hit = true;
        if (!hit) return null;
        const struckDecoy = decoys.find(d => {
            if (d.team === p.team) return false;
            const pos = decoyWorld(d, offset, tileSize);
            return Math.hypot(p.position.x - pos.x, p.position.z - pos.z) < CITY_CONFIG.tileSize * 0.8;
        });
        return [
            { kind: 'explosion', position: { ...p.position }, radius: 1.5, duration: 300 },
            { kind: 'damage', position: { ...p.position }, damage: p.damage, radius: 1.5, team: p.team },
            ...(struckDecoy ? [{ kind: 'decoy' as const, id: struckDecoy.id }] : []),
        ];
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

            if (p.payload === 'titan_drop') {
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
    } else if (p.payload === 'nano_cloud_master') {
        events.push({ kind: 'cloud', cloudType: 'nano', position: { ...p.position }, team: p.team });
        events.push({ kind: 'damage', position: { ...p.position }, damage: p.damage, radius: 3, team: p.team });
    } else {
        events.push({ kind: 'damage', position: struck ?? { ...p.position }, damage: p.damage, radius: 3, team: p.team });
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

