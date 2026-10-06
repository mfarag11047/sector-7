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

// When the latest movement tick ran. A unit's reported position is where it was at that
// moment, so prediction counts from here rather than from when React got around to
// showing it. Timing from the render made late updates pull units backward.
export const simClock = { lastTickAt: 0 };

// How far ahead of the last known position a unit may be drawn while waiting for
// the next update. Past this, a slow update shows as a brief pause, not a runaway.
export const MAX_EXTRAPOLATION_S = 0.3;
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
