// Markings on the ground of the industrial zones: hazard stripes round the edge of each yard,
// tyre tracks running from each shed's door out to the street, and oil stains where trucks stand.
//
// Laid out from the city plan, so every track starts at a real building and ends at a gate in the
// hazard stripes. Painted onto one canvas over blue's industrial zone and shown again, turned
// round, over red's: the zones mirror like the rest of the map. Scenery only, never clicked.

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BuildingData, RoadTileData } from '../types';
import { districtOfTile } from './districtTheme';

type Side = 'n' | 's' | 'e' | 'w';
const STEP: Record<Side, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
const STRIDE = 6;

export interface YardLayout {
  // The tiles the canvas covers on blue's side, edges included: x0 - 0.5 .. x1 + 0.5.
  x0: number; z0: number; x1: number; z1: number;
  // An open tile's edge onto the street that gets a hazard band.
  stripes: { x: number; z: number; side: Side }[];
  // Each track as a line through tile coordinates, from the shed's door to its gate.
  tracks: { x: number; z: number }[][];
  // Oil stains: centre in tile coordinates, radius in tiles.
  stains: { x: number; z: number; r: number }[];
}

// A repeatable hash of a tile, 0..1.
const hash = (x: number, z: number) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };

export function industrialYardLayout(tiles: readonly RoadTileData[], buildings: readonly BuildingData[], gridSize: number): YardLayout | null {
  const last = gridSize - 1;
  const type = new Map<string, RoadTileData['type']>(tiles.map(t => [`${t.x},${t.z}`, t.type]));
  const isRoad = (x: number, z: number) => { const k = type.get(`${x},${z}`); return k === 'main' || k === 'street'; };
  const blueSide = (x: number, z: number) => x + z < last;
  const isYard = (x: number, z: number) => type.get(`${x},${z}`) === 'open' && districtOfTile(x, z, gridSize) === 'industrial';
  const yard = tiles.filter(t => t.type === 'open' && blueSide(t.x, t.z) && isYard(t.x, t.z));
  if (yard.length === 0) return null;
  const blockOf = (x: number, z: number) => `${Math.floor(x / STRIDE)},${Math.floor(z / STRIDE)}`;

  // --- Tracks: from each shed (two tiles or more), out through its yard to the nearest street ---
  const sheds = new Map<string, NonNullable<BuildingData['footprint']>>();
  for (const b of buildings) {
    const f = b.footprint;
    if (!f || b.type !== 'industrial' || f.w * f.d < 2 || !blueSide(f.x, f.z) || districtOfTile(f.x, f.z, gridSize) !== 'industrial') continue;
    sheds.set(`${f.x},${f.z}`, f);
  }
  const tracks: YardLayout['tracks'] = [];
  const gates = new Set<string>();
  const stains: YardLayout['stains'] = [];
  for (const f of [...sheds.values()].sort((a, b) => a.z - b.z || a.x - b.x)) {
    const inShed = (x: number, z: number) => x >= f.x && x < f.x + f.w && z >= f.z && z < f.z + f.d;
    const block = blockOf(f.x, f.z);
    // Doors: open yard tiles beside the shed, on its long sides first.
    const doors: { x: number; z: number; from: { x: number; z: number } }[] = [];
    const longX = f.w >= f.d;
    const sides: Side[] = longX ? ['s', 'n', 'e', 'w'] : ['e', 'w', 's', 'n'];
    for (const side of sides) {
      const [dx, dz] = STEP[side];
      for (let x = f.x; x < f.x + f.w; x++) for (let z = f.z; z < f.z + f.d; z++) {
        const nx = x + dx, nz = z + dz;
        if (inShed(nx, nz) || !isYard(nx, nz) || blockOf(nx, nz) !== block) continue;
        doors.push({ x: nx, z: nz, from: { x, z } });
      }
    }
    if (doors.length === 0) continue;
    // Out through the yard from every door at once; the first tile beside a street is the gate.
    const prev = new Map<string, string | null>();
    const doorOf = new Map<string, typeof doors[0]>();
    const queue: { x: number; z: number }[] = [];
    for (const d of doors) {
      const k = `${d.x},${d.z}`;
      if (prev.has(k)) continue;
      prev.set(k, null);
      doorOf.set(k, d);
      queue.push(d);
    }
    let gate: { x: number; z: number; side: Side } | null = null;
    for (let i = 0; i < queue.length && !gate; i++) {
      const t = queue[i];
      for (const side of ['n', 'w', 'e', 's'] as Side[]) {
        const [dx, dz] = STEP[side];
        if (isRoad(t.x + dx, t.z + dz)) { gate = { x: t.x, z: t.z, side }; break; }
      }
      if (gate) break;
      for (const [dx, dz] of Object.values(STEP)) {
        const n = { x: t.x + dx, z: t.z + dz };
        const k = `${n.x},${n.z}`;
        if (prev.has(k) || !isYard(n.x, n.z) || blockOf(n.x, n.z) !== block) continue;
        prev.set(k, `${t.x},${t.z}`);
        queue.push(n);
      }
    }
    if (!gate) continue;
    const path: { x: number; z: number }[] = [];
    for (let k: string | null = `${gate.x},${gate.z}`; k; k = prev.get(k) ?? null) {
      const [x, z] = k.split(',').map(Number);
      path.unshift({ x, z });
    }
    const door = doorOf.get(`${path[0].x},${path[0].z}`)!;
    const [gx, gz] = STEP[gate.side];
    // From the shed's wall, through the middle of each tile, out through the gate.
    const face = { x: (door.x + door.from.x) / 2, z: (door.z + door.from.z) / 2 };
    tracks.push([face, ...path, { x: gate.x + gx * 0.5, z: gate.z + gz * 0.5 }]);
    gates.add(`${gate.x},${gate.z},${gate.side}`);
    // Where a truck stands at the door, it drips.
    stains.push({ x: face.x * 0.55 + door.x * 0.45, z: face.z * 0.55 + door.z * 0.45, r: 0.28 + hash(door.x, door.z) * 0.1 });
  }

  // --- Hazard bands along every yard edge onto the street, broken at the gates ---
  const stripes: YardLayout['stripes'] = [];
  for (const t of yard) {
    for (const side of Object.keys(STEP) as Side[]) {
      const [dx, dz] = STEP[side];
      if (isRoad(t.x + dx, t.z + dz) && !gates.has(`${t.x},${t.z},${side}`)) stripes.push({ x: t.x, z: t.z, side });
    }
  }

  // --- A few more stains here and there across the yards ---
  for (const t of yard) {
    const h = hash(t.x, t.z);
    if (h < 0.12) stains.push({ x: t.x + (hash(t.z, t.x) - 0.5) * 0.5, z: t.z + (hash(t.x + 7, t.z) - 0.5) * 0.5, r: 0.12 + h });
  }

  const xs = yard.map(t => t.x), zs = yard.map(t => t.z);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs), stripes, tracks, stains };
}

// --- Painting ---

const PX = 96; // Canvas pixels per tile.

function paintYard(layout: YardLayout): THREE.Texture {
  const w = layout.x1 - layout.x0 + 1, h = layout.z1 - layout.z0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = w * PX;
  canvas.height = h * PX;
  const ctx = canvas.getContext('2d')!;
  // Tile coordinates to canvas pixels: a tile's centre is half a tile in from its edge.
  const X = (x: number) => (x - layout.x0 + 0.5) * PX;
  const Z = (z: number) => (z - layout.z0 + 0.5) * PX;

  // Oil stains: a dark pool of overlapping blots with a faint sheen at the rim.
  for (const s of layout.stains) {
    const cx = X(s.x), cz = Z(s.z), r = s.r * PX;
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + s.x, d = r * 0.35 * (k ? 1 : 0);
      const bx = cx + Math.cos(a) * d, bz = cz + Math.sin(a) * d, br = r * (k ? 0.6 : 1);
      const g = ctx.createRadialGradient(bx, bz, 0, bx, bz, br);
      g.addColorStop(0, 'rgba(6, 6, 8, 0.75)');
      g.addColorStop(0.7, 'rgba(14, 12, 16, 0.5)');
      g.addColorStop(0.9, 'rgba(70, 60, 90, 0.18)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, bz, br, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Tyre tracks: drawn on their own canvas, a dark band with the middle cut out leaves two ruts,
  // with tread marks across them. Rounded at the turns.
  const tc = document.createElement('canvas');
  tc.width = canvas.width;
  tc.height = canvas.height;
  const t = tc.getContext('2d')!;
  const trace = (pts: { x: number; z: number }[]) => {
    t.beginPath();
    t.moveTo(X(pts[0].x), Z(pts[0].z));
    for (let i = 1; i < pts.length - 1; i++) t.arcTo(X(pts[i].x), Z(pts[i].z), X(pts[i + 1].x), Z(pts[i + 1].z), PX * 0.45);
    t.lineTo(X(pts[pts.length - 1].x), Z(pts[pts.length - 1].z));
  };
  t.lineCap = 'butt';
  t.lineJoin = 'round';
  for (const pts of layout.tracks) {
    trace(pts);
    t.strokeStyle = 'rgba(6, 6, 8, 0.82)';
    t.lineWidth = PX * 0.42;
    t.stroke();
    t.setLineDash([PX * 0.05, PX * 0.07]);
    t.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    t.stroke();
    t.setLineDash([]);
  }
  t.globalCompositeOperation = 'destination-out';
  for (const pts of layout.tracks) {
    trace(pts);
    t.strokeStyle = 'rgba(0, 0, 0, 1)';
    t.lineWidth = PX * 0.2;
    t.stroke();
  }
  ctx.drawImage(tc, 0, 0);

  // Hazard bands: one clip of every band, filled with diagonal stripes in canvas space so they
  // run on unbroken from tile to tile.
  const band = PX * 0.16;
  ctx.save();
  ctx.beginPath();
  for (const s of layout.stripes) {
    const left = X(s.x) - PX / 2, top = Z(s.z) - PX / 2;
    if (s.side === 'n') ctx.rect(left, top, PX, band);
    if (s.side === 's') ctx.rect(left, top + PX - band, PX, band);
    if (s.side === 'w') ctx.rect(left, top, band, PX);
    if (s.side === 'e') ctx.rect(left + PX - band, top, band, PX);
  }
  ctx.clip();
  ctx.fillStyle = 'rgba(20, 18, 14, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(234, 179, 8, 0.85)';
  const period = PX * 0.32;
  for (let d = -canvas.height; d < canvas.width + canvas.height; d += period) {
    ctx.beginPath();
    ctx.moveTo(d, 0); ctx.lineTo(d + period / 2, 0);
    ctx.lineTo(d + period / 2 - canvas.height, canvas.height); ctx.lineTo(d - canvas.height, canvas.height);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

const ROAD_TOP = 0.2;

const IndustrialYard: React.FC<{ tiles: RoadTileData[]; buildings: BuildingData[]; tileSize: number; offset: number }> = ({ tiles, buildings, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const layout = useMemo(() => industrialYardLayout(tiles, buildings, gridSize), [tiles, buildings, gridSize]);
  const texture = useMemo(() => (layout && typeof document !== 'undefined' ? paintYard(layout) : null), [layout]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!layout || !texture) return null;
  const w = (layout.x1 - layout.x0 + 1) * tileSize, h = (layout.z1 - layout.z0 + 1) * tileSize;
  const cx = ((layout.x0 + layout.x1) / 2) * tileSize - offset, cz = ((layout.z0 + layout.z1) / 2) * tileSize - offset;
  const last = gridSize - 1;
  const mx = ((last - layout.x0 + last - layout.x1) / 2) * tileSize - offset, mz = ((last - layout.z0 + last - layout.z1) / 2) * tileSize - offset;
  return (
    <group>
      {/* Blue's zone, and the same painting turned round over red's. */}
      {[{ x: cx, z: cz, turn: 0 }, { x: mx, z: mz, turn: Math.PI }].map((p, i) => (
        <mesh key={i} position={[p.x, ROAD_TOP + 0.04, p.z]} rotation={[-Math.PI / 2, 0, p.turn]} raycast={() => null} renderOrder={1}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={texture} transparent depthWrite={false} roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </group>
  );
};

export default React.memo(IndustrialYard);
