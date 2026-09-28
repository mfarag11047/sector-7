export const ENERGY_GRID_COLOR = '#facc15';

const TAU = Math.PI * 2;

export type GridPoint = { x: number; z: number };

// Angles use atan2(z, x): 0 is +x and increases toward +z.
function addWrapped(intervals: [number, number][], start: number, end: number) {
  const norm = (angle: number) => ((angle % TAU) + TAU) % TAU;
  const a = norm(start);
  const b = norm(end);
  if (b < a) {
    intervals.push([a, TAU], [0, b]);
  } else if (b - a > 1e-6) {
    intervals.push([a, b]);
  }
}

function mergeIntervals(intervals: [number, number][]) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const [start, end] = sorted[i];
    if (start <= last[1] + 1e-5) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function visibleArcs(covered: [number, number][]) {
  if (covered.length === 0) return [[0, TAU] as [number, number]];
  const gaps: [number, number][] = [];
  if (covered[0][0] > 1e-4) gaps.push([0, covered[0][0]]);
  for (let i = 0; i < covered.length - 1; i++) gaps.push([covered[i][1], covered[i + 1][0]]);
  if (TAU - covered[covered.length - 1][1] > 1e-4) gaps.push([covered[covered.length - 1][1], TAU]);
  return gaps.filter(([start, end]) => end - start > 1e-3);
}

// Outer rim of a union of equal-radius circles. Arcs buried inside another circle are omitted.
export function outerEnergyGridPolylines(
  centers: GridPoint[],
  radius: number,
  fullCircleSegments = 56,
): GridPoint[][] {
  const unique: GridPoint[] = [];
  for (const center of centers) {
    if (unique.some(existing => (existing.x - center.x) ** 2 + (existing.z - center.z) ** 2 < 1e-4)) continue;
    unique.push(center);
  }

  const polylines: GridPoint[][] = [];
  for (let i = 0; i < unique.length; i++) {
    const covered: [number, number][] = [];
    for (let j = 0; j < unique.length; j++) {
      if (i === j) continue;
      const dx = unique[j].x - unique[i].x;
      const dz = unique[j].z - unique[i].z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-6 || distance >= radius * 2) continue;
      const half = Math.acos(Math.min(1, Math.max(-1, distance / (2 * radius))));
      const mid = Math.atan2(dz, dx);
      addWrapped(covered, mid - half, mid + half);
    }

    for (const [start, end] of visibleArcs(mergeIntervals(covered))) {
      const sweep = end - start;
      const steps = Math.max(2, Math.ceil(fullCircleSegments * sweep / TAU));
      const points: GridPoint[] = [];
      for (let step = 0; step <= steps; step++) {
        const angle = start + sweep * (step / steps);
        points.push({
          x: unique[i].x + radius * Math.cos(angle),
          z: unique[i].z + radius * Math.sin(angle),
        });
      }
      polylines.push(points);
    }
  }
  return polylines;
}
