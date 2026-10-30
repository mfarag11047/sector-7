// The wall round each starting base (sim/mapgen.ts baseCompound), in the base greys. A solid
// lower wall of dark concrete panels, a coping along its top and downlights on both faces washing
// light down it; above it a louvred fence of angled horizontal slats in a frame, split into thirds
// by mullions, between square pillars capped at the top. A thin line of the side's colour runs
// along each face under the coping. Each side of every gate stands a tall black pillar, capped,
// with lights facing up and down the road, and between them a blast door: a ribbed steel shutter
// with a line of the side's colour along its top, that sinks into a slot in the road as the side's
// own ground units come through and rises again behind them. On the corner, a watchtower.
//
// Every wall tile and gate is a structure that can be shot down (sim/compound.ts); this draws the
// ones still standing (`standing`) and leaves broken concrete and twisted fence where the rest
// were. Scenery, never clicked: their health bars come from Structure.tsx.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import { PALETTE } from './kit/materials';
import { currentTilePosition } from '../sim/movement';
import { isAirType } from '../sim/units';
import { playSound } from './sfx';
import type { UnitData } from '../types';
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
// The gate pillars, as fractions of a tile out from the gate's centre and across; the corner tower.
const GATE_PILLAR_H = 8.5;
const GATE_PILLAR_AT = 0.62, GATE_PILLAR_W = 0.26;
const TOWER_H = 11;
const TOWER_W = 0.62;
const noRaycast = () => null;
const noUnits = () => [] as const;

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

// A blast gate's door: where it stands (world), which way it spans, and how wide.
export interface GateDoor { key: string; x: number; z: number; yaw: number; width: number; team: 'blue' | 'red' }

// Every part of the wall still standing, the rubble where it has been shot down, and the gates'
// doors. `standing` holds the tiles ("x,z") whose wall or gate is still up; by default, all.
export function compoundParts(walls: readonly BaseWall[], gates: readonly GridPos[], gridSize: number, tileSize: number, offset: number, standing?: ReadonlySet<string>) {
  const centre = (gridSize - 1) / 2;
  const teamOf = (p: { x: number; z: number }): 'blue' | 'red' => (p.x + p.z < 2 * centre ? 'blue' : 'red');
  const up = (x: number, z: number) => !standing || standing.has(`${x},${z}`);
  const out = {
    concrete: [] as Part[], coping: [] as Part[], frame: [] as Part[], slats: [] as Part[], pillars: [] as Part[], caps: [] as Part[],
    lamps: [] as Part[], washes: [] as Part[], strips: [] as Part[], gatePillars: [] as Part[], towers: [] as Part[], towerBands: [] as Part[],
    rubble: [] as Part[], doors: [] as GateDoor[],
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

  // Broken concrete and twisted fence where a piece has been shot down, low enough to drive over;
  // on a gate's tile, pushed to the sides of the road.
  const rubble = (x: number, z: number, yaw: number, gate: boolean) => {
    const [cx, cz] = world(x, z);
    let seed = ((x * 73856093) ^ (z * 19349663)) >>> 0 || 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 7; i++) {
      const side = gate ? (i % 2 ? 1 : -1) * (0.3 + rand() * 0.15) : (rand() - 0.5) * 0.8;
      const across = (rand() - 0.5) * (gate ? 0.5 : 0.3) * T;
      const h = 0.5 + rand() * 1.1;
      out.rubble.push({ at: place(cx, cz, yaw, side * T, h / 2 - 0.15, across), size: [1.4 + rand() * 2.4, h, 1.1 + rand() * 1.8], yaw: yaw + rand() * 1.2, tilt: (rand() - 0.5) * 0.6, team: teamOf({ x, z }) });
    }
    for (let i = 0; i < 2; i++) {
      out.frame.push({ at: place(cx, cz, yaw, (rand() - 0.5) * 0.6 * T, 0.3, (rand() - 0.5) * 0.3 * T), size: [3 + rand() * 3, 0.2, 0.5], yaw: yaw + (rand() - 0.5) * 0.9, tilt: rand() * 0.4, team: teamOf({ x, z }) });
    }
  };

  for (const w of walls) {
    const team = teamOf(w.at);
    const [cx, cz] = world(w.at.x, w.at.z);
    if (!up(w.at.x, w.at.z)) { rubble(w.at.x, w.at.z, w.runs === 'z' ? Math.PI / 2 : 0, false); continue; }
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

  // A tall black pillar on each side of every gate, on the wall tile beside it, capped, with a
  // light facing up and down the road; and the gate's door between them while it stands.
  for (const g of gates) {
    const team = teamOf(g);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => wallAt.has(`${g.x + dx},${g.z + dz}`));
    const yaw = sides.some(([dx]) => dx !== 0) ? 0 : Math.PI / 2;
    for (const [dx, dz] of sides) {
      if (!up(g.x + dx, g.z + dz)) continue;
      const [px, pz] = world(g.x + dx * GATE_PILLAR_AT, g.z + dz * GATE_PILLAR_AT);
      const w = GATE_PILLAR_W * T;
      out.gatePillars.push({ at: [px, GATE_PILLAR_H / 2, pz], size: [w, GATE_PILLAR_H, w], yaw, team });
      out.caps.push({ at: [px, GATE_PILLAR_H + 0.2, pz], size: [w + 0.5, 0.4, w + 0.5], yaw, team });
      for (const s of [-1, 1]) out.lamps.push({ at: place(px, pz, yaw, 0, GATE_PILLAR_H - 1.2, s * (w / 2 + 0.06)), size: [w * 0.6, 0.22, 0.12], yaw, team });
    }
    const [gx, gz] = world(g.x, g.z);
    if (up(g.x, g.z)) out.doors.push({ key: `${g.x},${g.z}`, x: gx, z: gz, yaw, width: (2 * GATE_PILLAR_AT - GATE_PILLAR_W) * T, team });
    else rubble(g.x, g.z, yaw, true);
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

// One instanced mesh of parts.
const Parts: React.FC<{ name: string; parts: Part[]; material: THREE.Material; geometry?: THREE.BufferGeometry; teamColour?: boolean; shadow?: boolean }> = ({ name, parts, material, geometry = unitBox, teamColour, shadow }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useParts(ref, parts, teamColour);
  if (parts.length === 0) return null;
  return <instancedMesh key={`${name}-${parts.length}`} ref={ref} args={[geometry, material, parts.length]} raycast={noRaycast} castShadow={shadow} receiveShadow={shadow} />;
};

// The blast doors. A door opens (sinks into the road) while any of its side's ground units is
// within OPEN_REACH tiles of it or about to step onto it, and rises again once they are through.
const DOOR_H = 6.2;
const DOOR_D = 0.9;
const RIBS = 11;
const OPEN_REACH = 1.6;
const DOOR_SECONDS = 0.9;

const BlastDoors: React.FC<{ doors: GateDoor[]; tileSize: number; offset: number; unitsOf: () => readonly UnitData[]; m: Record<'door' | 'ribs' | 'caps' | 'slot', THREE.Material> }> = ({ doors, tileSize, offset, unitsOf, m }) => {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const open = useRef<number[]>([]);
  // Whether each door was last wanted open, so it is heard as it starts to move (components/sfx.ts).
  const wantedBefore = useRef<(boolean | undefined)[]>([]);
  const ribs = useMemo(() => Array.from({ length: RIBS }, (_, i) => 0.45 + (i / (RIBS - 1)) * (DOOR_H - 1.1)), []);
  useFrame((_, delta) => {
    const units = unitsOf();
    doors.forEach((d, i) => {
      const g = refs.current[i];
      if (!g) return;
      const gx = (d.x + offset) / tileSize, gz = (d.z + offset) / tileSize;
      const wanted = units.some(u => {
        if (u.team !== d.team || u.health <= 0 || isAirType(u.type)) return false;
        if (u.path?.[0] === d.key) return true;
        const at = currentTilePosition(u);
        return Math.hypot(at.x - gx, at.z - gz) <= OPEN_REACH;
      });
      if (wantedBefore.current[i] !== undefined && wantedBefore.current[i] !== wanted) playSound('gate_cycle', d.x, d.z);
      wantedBefore.current[i] = wanted;
      const o = open.current[i] ?? 0;
      const next = Math.min(1, Math.max(0, o + (wanted ? 1 : -1) * Math.min(delta, 0.25) / DOOR_SECONDS));
      open.current[i] = next;
      g.position.y = -next * (DOOR_H + 0.3);
      g.visible = next < 1;
    });
  });
  return (
    <group>
      {doors.map((d, i) => (
        <group key={d.key} position={[d.x, 0, d.z]} rotation={[0, d.yaw, 0]}>
          {/* The slot in the road it sinks into. */}
          <mesh geometry={unitBox} material={m.slot} position={[0, 0.03, 0]} scale={[d.width, 0.06, DOOR_D + 0.5]} raycast={noRaycast} receiveShadow />
          <group ref={el => { refs.current[i] = el; }}>
            <mesh geometry={unitBox} material={m.door} position={[0, DOOR_H / 2, 0]} scale={[d.width, DOOR_H, DOOR_D]} raycast={noRaycast} castShadow receiveShadow />
            {ribs.map(y => <mesh key={y} geometry={unitBox} material={m.ribs} position={[0, y, 0]} scale={[d.width - 0.3, 0.14, DOOR_D + 0.2]} raycast={noRaycast} />)}
            <mesh geometry={unitBox} material={m.caps} position={[0, DOOR_H + 0.15, 0]} scale={[d.width, 0.3, DOOR_D + 0.35]} raycast={noRaycast} castShadow />
            {[-1, 1].map(s => (
              <mesh key={s} geometry={unitBox} position={[0, DOOR_H - 0.35, s * (DOOR_D / 2 + 0.11)]} scale={[d.width - 0.6, 0.1, 0.04]} raycast={noRaycast}>
                <meshBasicMaterial color={TEAM_COLORS[d.team]} toneMapped={false} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
};

const BaseCompound: React.FC<{ walls: BaseWall[]; gates: GridPos[]; tileSize: number; offset: number; standing?: ReadonlySet<string>; unitsOf?: () => readonly UnitData[] }> = ({ walls, gates, tileSize, offset, standing, unitsOf }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const parts = useMemo(() => compoundParts(walls, gates, gridSize, tileSize, offset, standing), [walls, gates, gridSize, tileSize, offset, standing]);
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
      gatePillars: new THREE.MeshStandardMaterial({ color: '#1a1c1f', roughness: 0.65, metalness: 0.3 }),
      rubble: new THREE.MeshStandardMaterial({ map: concreteTex, color: '#6b7077', roughness: 0.95, metalness: 0.05 }),
      door: new THREE.MeshStandardMaterial({ color: '#1c1e21', roughness: 0.55, metalness: 0.55 }),
      slot: new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.9, metalness: 0.2 }),
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
      <Parts name="rubble" parts={parts.rubble} material={m.rubble} shadow />
      <Parts name="towers" parts={parts.towers} material={m.towers} shadow />
      <Parts name="towerBands" parts={parts.towerBands} material={m.towerBands} teamColour />
      <BlastDoors doors={parts.doors} tileSize={tileSize} offset={offset} unitsOf={unitsOf ?? noUnits}
        m={{ door: m.door, ribs: m.slats, caps: m.caps, slot: m.slot }} />
    </group>
  );
};

export default React.memo(BaseCompound);
