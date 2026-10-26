// The wall round each starting base (sim/mapgen.ts baseCompound), in the base greys. A solid
// lower wall of dark concrete panels, a coping along its top and downlights on both faces washing
// light down it; above it a louvred fence of angled horizontal slats in a frame, split into thirds
// by mullions, between square pillars capped at the top. A thin line of the side's colour runs
// along each face under the coping. Each side of every gate stands a hazard-striped pillar with an
// amber beacon, and on the corner a watchtower. The wall tiles themselves can't be crossed; this
// draws them. Scenery, never clicked.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import { PALETTE } from './kit/materials';
import type { BaseWall } from '../sim/mapgen';
import type { GridPos } from '../sim/commands';

// Heights, world units: the solid wall, the fence on it, the pillars and their caps.
const BASE_H = 3;
const FENCE_TOP = 6.6;
const PILLAR_H = 7.1;
// Depths across the wall, world units.
const BASE_D = 2.2;
const PILLAR_W = 1.5, PILLAR_D = 2.7;
// The louvres: how many, how deep, and how far each is tipped.
const SLATS = 7;
const SLAT_TILT = 0.35;
// Downlights on each face, as fractions of a tile along the wall.
const LIGHTS = [-0.25, 0.25];
// The gate pillars and corner tower, as before.
const GATE_PILLAR_H = 8.5;
const TOWER_H = 11;
const TOWER_W = 0.62;
const noRaycast = () => null;

// Dark concrete panels: speckle, faint grime running down, and the panel joints.
function concreteTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 31;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#3a3d41';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(20,22,24,0.25)' : 'rgba(110,114,118,0.12)';
    g.fillRect(rand() * 256, rand() * 128, 2, 2);
  }
  for (let i = 0; i < 10; i++) {
    const grad = g.createLinearGradient(0, 0, 0, 100);
    grad.addColorStop(0, 'rgba(15,16,18,0.4)');
    grad.addColorStop(1, 'rgba(15,16,18,0)');
    g.fillStyle = grad;
    g.fillRect(rand() * 256, 0, 3 + rand() * 6, 100);
  }
  g.fillStyle = 'rgba(12,13,15,0.8)';
  for (const x of [0, 128]) g.fillRect(x, 0, 3, 128);
  g.fillRect(0, 62, 256, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Yellow and black stripes all the way up: the gate pillars.
function hazardTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1a17';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#d4a20a';
  for (let y = -64; y < 320; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y - 32); g.lineTo(64, y - 8); g.lineTo(0, y + 24); g.closePath(); g.fill(); }
  return new THREE.CanvasTexture(c);
}

// The pool of light a downlight throws down the wall: bright under the lamp, fading down and out.
function washTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 0, 0, 32, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// One box: where it is (world), its size, which way its wall runs (yaw), how far it is tipped
// about its length (tilt), and the side whose colour it takes.
interface Part { at: [number, number, number]; size: [number, number, number]; yaw: number; tilt?: number; team: 'blue' | 'red' }

export function compoundParts(walls: readonly BaseWall[], gates: readonly GridPos[], gridSize: number, tileSize: number, offset: number) {
  const centre = (gridSize - 1) / 2;
  const teamOf = (p: { x: number; z: number }): 'blue' | 'red' => (p.x + p.z < 2 * centre ? 'blue' : 'red');
  const out = {
    concrete: [] as Part[], coping: [] as Part[], frame: [] as Part[], slats: [] as Part[], pillars: [] as Part[], caps: [] as Part[],
    lamps: [] as Part[], washes: [] as Part[], strips: [] as Part[], gatePillars: [] as Part[], beacons: [] as Part[], towers: [] as Part[], towerBands: [] as Part[],
  };
  const T = tileSize;
  const world = (x: number, z: number) => [x * T - offset, z * T - offset] as const;
  // A point `along` the wall and `across` it from (cx, cz), world units, for a wall turned `yaw`.
  const place = (cx: number, cz: number, yaw: number, along: number, y: number, across: number): [number, number, number] =>
    [cx + Math.cos(yaw) * along + Math.sin(yaw) * across, y, cz - Math.sin(yaw) * along + Math.cos(yaw) * across];

  // A length of wall centred at (cx, cz) world: the concrete, its coping, the team line and
  // downlights on each face, and the fence above.
  const span = (cx: number, cz: number, yaw: number, length: number, team: 'blue' | 'red', lights: boolean) => {
    const box = (list: Part[], along: number, y: number, across: number, size: [number, number, number], tilt?: number) =>
      list.push({ at: place(cx, cz, yaw, along, y, across), size, yaw, tilt, team });
    box(out.concrete, 0, BASE_H / 2, 0, [length, BASE_H, BASE_D]);
    box(out.concrete, 0, 0.3, 0, [length, 0.6, BASE_D + 0.5]);
    box(out.coping, 0, BASE_H + 0.1, 0, [length, 0.2, BASE_D + 0.3]);
    for (const s of [-1, 1]) {
      box(out.strips, 0, BASE_H - 0.35, s * (BASE_D / 2 + 0.02), [length - 0.2, 0.1, 0.04]);
      if (!lights) continue;
      for (const f of LIGHTS) {
        box(out.lamps, f * T, BASE_H - 0.15, s * (BASE_D / 2 + 0.16), [0.9, 0.18, 0.3]);
        box(out.washes, f * T, BASE_H / 2 - 0.1, s * (BASE_D / 2 + 0.03), [3.6, BASE_H - 0.2, 0.01]);
      }
    }
    // The fence: a bottom and a top rail, the louvres between, mullions at the thirds.
    const fenceH = FENCE_TOP - BASE_H - 0.2;
    box(out.frame, 0, BASE_H + 0.35, 0, [length, 0.3, 0.8]);
    box(out.frame, 0, FENCE_TOP, 0, [length, 0.34, 0.9]);
    for (let i = 0; i < SLATS; i++) {
      box(out.slats, 0, BASE_H + 0.75 + (i / (SLATS - 1)) * (fenceH - 0.95), 0, [length, 0.16, 0.42], SLAT_TILT);
    }
    if (length > T * 0.5) for (const f of [-1 / 6, 1 / 6]) box(out.frame, f * length, BASE_H + 0.2 + fenceH / 2, 0, [0.22, fenceH, 0.6]);
  };

  const wallAt = new Map(walls.map(w => [`${w.at.x},${w.at.z}`, w]));
  const gateAt = new Set(gates.map(g => `${g.x},${g.z}`));
  const pillarAt = new Map<string, Part>();
  const pillar = (x: number, z: number, yaw: number, team: 'blue' | 'red') => {
    const key = `${x},${z}`;
    if (pillarAt.has(key)) return;
    const [wx, wz] = world(x, z);
    pillarAt.set(key, { at: [wx, PILLAR_H / 2, wz], size: [PILLAR_W, PILLAR_H, PILLAR_D], yaw, team });
    out.caps.push({ at: [wx, PILLAR_H + 0.15, wz], size: [PILLAR_W + 0.35, 0.3, PILLAR_D + 0.35], yaw, team });
  };

  for (const w of walls) {
    const team = teamOf(w.at);
    const [cx, cz] = world(w.at.x, w.at.z);
    if (w.runs === 'corner') {
      out.towers.push({ at: [cx, TOWER_H / 2, cz], size: [TOWER_W * T, TOWER_H, TOWER_W * T], yaw: 0, team });
      out.towerBands.push({ at: [cx, TOWER_H - 1.4, cz], size: [TOWER_W * T * 1.04, 0.5, TOWER_W * T * 1.04], yaw: 0, team });
      // Short lengths of wall out from the tower to the tile's edge, toward each wall beside it.
      const stub = (0.5 - TOWER_W / 2) * T;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!wallAt.has(`${w.at.x + dx},${w.at.z + dz}`)) continue;
        const yaw = dx !== 0 ? 0 : Math.PI / 2;
        const mid = (TOWER_W / 2) * T + stub / 2;
        span(cx + dx * mid, cz + dz * mid, yaw, stub, team, false);
      }
      continue;
    }
    // Wall running along x (yaw 0) or z (a quarter turn).
    const yaw = w.runs === 'x' ? 0 : Math.PI / 2;
    const [dx, dz] = w.runs === 'x' ? [1, 0] : [0, 1];
    span(cx, cz, yaw, T, team, true);
    // A pillar at each end, except where the wall meets a gate (the gate has its own).
    for (const s of [-1, 1]) {
      if (gateAt.has(`${w.at.x + s * dx},${w.at.z + s * dz}`)) continue;
      pillar(w.at.x + s * dx * 0.5, w.at.z + s * dz * 0.5, yaw, team);
    }
  }
  out.pillars.push(...pillarAt.values());

  // A hazard pillar with a beacon on each side of every gate, on the wall tile beside it.
  for (const g of gates) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!wallAt.get(`${g.x + dx},${g.z + dz}`)) continue;
      const [px, pz] = world(g.x + dx * 0.62, g.z + dz * 0.62);
      const team = teamOf(g);
      out.gatePillars.push({ at: [px, GATE_PILLAR_H / 2, pz], size: [0.26 * T, GATE_PILLAR_H, 0.26 * T], yaw: 0, team });
      out.beacons.push({ at: [px, GATE_PILLAR_H + 0.5, pz], size: [1, 1, 1], yaw: 0, team });
    }
  }
  return out;
}

const TEAM = { blue: new THREE.Color(TEAM_COLORS.blue), red: new THREE.Color(TEAM_COLORS.red) };

// Fills an instanced mesh with parts, and their side's colour when `teamColour` is set.
function useParts(ref: React.RefObject<THREE.InstancedMesh | null>, parts: Part[], teamColour = false) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    o.rotation.order = 'YXZ';
    parts.forEach((p, i) => {
      o.position.set(...p.at);
      o.rotation.set(p.tilt ?? 0, p.yaw, 0);
      o.scale.set(...p.size);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (teamColour) mesh.setColorAt(i, TEAM[p.team]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, parts, teamColour]);
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const beaconGeometry = new THREE.SphereGeometry(0.7, 10, 8);

// One instanced mesh of parts.
const Parts: React.FC<{ name: string; parts: Part[]; material: THREE.Material; geometry?: THREE.BufferGeometry; teamColour?: boolean; shadow?: boolean }> = ({ name, parts, material, geometry = unitBox, teamColour, shadow }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useParts(ref, parts, teamColour);
  if (parts.length === 0) return null;
  return <instancedMesh key={`${name}-${parts.length}`} ref={ref} args={[geometry, material, parts.length]} raycast={noRaycast} castShadow={shadow} receiveShadow={shadow} />;
};

const BaseCompound: React.FC<{ walls: BaseWall[]; gates: GridPos[]; tileSize: number; offset: number }> = ({ walls, gates, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const parts = useMemo(() => compoundParts(walls, gates, gridSize, tileSize, offset), [walls, gates, gridSize, tileSize, offset]);
  const m = useMemo(() => {
    const concreteTex = concreteTexture();
    return {
      concrete: new THREE.MeshStandardMaterial({ map: concreteTex, color: '#7d838a', roughness: 0.9, metalness: 0.05 }),
      coping: new THREE.MeshStandardMaterial({ color: PALETTE.structGrey, roughness: 0.7, metalness: 0.2 }),
      frame: new THREE.MeshStandardMaterial({ color: PALETTE.structDark, roughness: 0.6, metalness: 0.4 }),
      slats: new THREE.MeshStandardMaterial({ color: '#3a3e44', roughness: 0.5, metalness: 0.45 }),
      pillars: new THREE.MeshStandardMaterial({ color: PALETTE.structGrey, roughness: 0.75, metalness: 0.15 }),
      caps: new THREE.MeshStandardMaterial({ color: PALETTE.structDark, roughness: 0.7, metalness: 0.3 }),
      lamps: new THREE.MeshBasicMaterial({ color: '#eaf4ff', toneMapped: false }),
      washes: new THREE.MeshBasicMaterial({ map: washTexture(), color: '#cfe6ff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      strips: new THREE.MeshBasicMaterial({ toneMapped: false }),
      gatePillars: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7, metalness: 0.2 }),
      beacons: new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false }),
      towers: new THREE.MeshStandardMaterial({ map: concreteTex, color: '#9aa0a6', roughness: 0.85, metalness: 0.1 }),
      towerBands: new THREE.MeshBasicMaterial({ toneMapped: false }),
    };
  }, []);
  useEffect(() => () => Object.values(m).forEach(mat => { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }), [m]);
  return (
    <group>
      <Parts name="concrete" parts={parts.concrete} material={m.concrete} shadow />
      <Parts name="coping" parts={parts.coping} material={m.coping} shadow />
      <Parts name="frame" parts={parts.frame} material={m.frame} shadow />
      <Parts name="slats" parts={parts.slats} material={m.slats} shadow />
      <Parts name="pillars" parts={parts.pillars} material={m.pillars} shadow />
      <Parts name="caps" parts={parts.caps} material={m.caps} shadow />
      <Parts name="lamps" parts={parts.lamps} material={m.lamps} />
      <Parts name="washes" parts={parts.washes} material={m.washes} />
      <Parts name="strips" parts={parts.strips} material={m.strips} teamColour />
      <Parts name="gatePillars" parts={parts.gatePillars} material={m.gatePillars} shadow />
      <Parts name="beacons" parts={parts.beacons} material={m.beacons} geometry={beaconGeometry} />
      <Parts name="towers" parts={parts.towers} material={m.towers} shadow />
      <Parts name="towerBands" parts={parts.towerBands} material={m.towerBands} teamColour />
    </group>
  );
};

export default React.memo(BaseCompound);
