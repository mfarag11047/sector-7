// Smooth on-screen motion between simulation ticks.
//
// The simulation moves units ten times a second, but those updates reach the screen
// at irregular moments: React can take longer to process some ticks than others,
// especially when a unit enters a new tile and fog of war is recomputed. Gliding
// toward the latest position over a fixed time made units stall whenever an update
// was late, then lurch when it arrived.
//
// Instead, a unit keeps moving along its path at the speed the simulation reports
// (dead reckoning) and is gently pulled toward each new position as it arrives.
// This is also how a networked client hides latency.

export type Point = { x: number; z: number };

// When the latest movement tick ran.
export const simClock = { lastTickAt: 0 };

// When each tick put each unit where it is. A position on screen can be several ticks old when
// React falls behind (many units moving at once), so prediction has to count from the tick that
// produced that position, not from the latest tick: counting from the latest one drew stale
// positions as fresh, which pulled units back for a moment before they zipped forward again.
const STAMPS_KEPT = 12;
const stamps = new Map<string, { key: string; at: number }[]>();
// What identifies a unit's position: its tile and how far it is toward the next one.
export const positionKey = (u: { gridPos: Point | { x: number; z: number }; moveProgress?: number; moveTarget?: string | null }) =>
  `${u.gridPos.x},${u.gridPos.z},${u.moveTarget ?? ''},${(u.moveProgress ?? 0).toFixed(4)}`;
let stampWrites = 0;
export function stampPosition(id: string, key: string, at: number) {
  // Now and then, drop units that haven't moved in a while (most are gone).
  if (++stampWrites % 2000 === 0) for (const [k, l] of stamps) if (at - l[l.length - 1].at > 10_000) stamps.delete(k);
  const list = stamps.get(id) ?? [];
  if (list.length > 0 && list[list.length - 1].key === key) return;
  list.push({ key, at });
  if (list.length > STAMPS_KEPT) list.shift();
  stamps.set(id, list);
}
// When a tick put unit `id` at the position `key`, if one recently did.
export function stampedAt(id: string, key: string): number | undefined {
  const list = stamps.get(id);
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].key === key) return list[i].at;
  return undefined;
}

// Each unit's latest movement fields, refreshed by the map after every render. A unit model reads
// its motion from here each frame instead of through React props: moveProgress changes on every
// game tick, and as a prop it re-rendered every moving unit ten times a second, which with a big
// army on the march was most of the frame's work.
export interface Motion {
  gridPos: Point;
  path: readonly string[];
  moveProgress?: number;
  moveTarget?: string;
  moveSpeed?: number;
}
const motions = new Map<string, Motion>();
export function publishMotion(units: readonly (Motion & { id: string })[]) {
  motions.clear();
  for (const u of units) motions.set(u.id, u);
}
export const motionOf = (id: string): Motion | undefined => motions.get(id);

// How far ahead of the last known position a unit may be drawn while waiting for the next
// update. Past this, a slow update shows as a brief pause, not a runaway. Kept short: a unit held
// up in a crowd still reports its travel speed, and drawing it far ahead along its route then
// pulls it back when the real position arrives, which is exactly the rubber-banding to avoid.
export const MAX_EXTRAPOLATION_S = 0.35;
// How quickly the drawn position closes the gap to the predicted one, per second.
const FOLLOW_RATE = 12;
// Gaps wider than this are a shove or a return from a surveillance orbit: ease in slowly.
const FAR_FOLLOW_RATE = 4;

// The point `distance` along a route that starts at `from` and visits `waypoints` in order.
export function walkAlong(from: Point, waypoints: readonly Point[], distance: number): Point {
  let x = from.x;
  let z = from.z;
  let left = distance;
  for (const wp of waypoints) {
    const leg = Math.hypot(wp.x - x, wp.z - z);
    if (leg >= left) {
      const t = leg > 0 ? left / leg : 0;
      return { x: x + (wp.x - x) * t, z: z + (wp.z - z) * t };
    }
    left -= leg;
    x = wp.x;
    z = wp.z;
  }
  return { x, z };
}

// Where the unit most likely is now: its last reported position, carried forward
// along its route at its reported speed for the time since that report.
export function predictPosition(sim: Point, waypoints: readonly Point[], speed: number, secondsSinceUpdate: number): Point {
  if (speed <= 0 || waypoints.length === 0) return sim;
  const seconds = Math.min(Math.max(secondsSinceUpdate, 0), MAX_EXTRAPOLATION_S);
  return walkAlong(sim, waypoints, speed * seconds);
}

// Move the drawn position toward the predicted one for a frame of `dt` seconds.
export function follow(drawn: Point, predicted: Point, dt: number, farGap: number): Point {
  const gap = Math.hypot(predicted.x - drawn.x, predicted.z - drawn.z);
  if (gap < 1e-3) return predicted;
  const rate = gap > farGap ? FAR_FOLLOW_RATE : FOLLOW_RATE;
  const t = 1 - Math.exp(-dt * rate);
  return { x: drawn.x + (predicted.x - drawn.x) * t, z: drawn.z + (predicted.z - drawn.z) * t };
}
