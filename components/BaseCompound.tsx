// The blast wall round each starting base (sim/mapgen.ts baseCompound): a run of concrete
// T-wall slabs with a hazard band at the foot and a strip of the side's colour along the top,
// hazard-striped pillars with amber beacons either side of each gate, and a watchtower on the
// corner. The wall tiles themselves can't be crossed; this draws them. Scenery, never clicked.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import type { BaseWall } from '../sim/mapgen';
import type { GridPos } from '../sim/commands';

const SLAB_H = 6;
const PILLAR_H = 8.5;
const TOWER_H = 11;
const noRaycast = () => null;

// Weathered concrete with vertical form seams, a stencilled marking and a hazard band at the foot.
function slabTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  let seed = 31;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#5b5e5c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(40,42,41,0.25)' : 'rgba(120,124,120,0.2)';
    g.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  // Streaks of grime running down from the top.
  for (let i = 0; i < 12; i++) {
    const x = rand() * 256;
    const grad = g.createLinearGradient(0, 0, 0, 180);
    grad.addColorStop(0, 'rgba(25,27,26,0.45)');
    grad.addColorStop(1, 'rgba(25,27,26,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 4 + rand() * 8, 180);
  }
  g.fillStyle = 'rgba(30,32,31,0.6)';
  g.fillRect(126, 0, 4, 256);
  // Stencil.
  g.fillStyle = 'rgba(225,228,220,0.35)';
  g.font = 'bold 26px monospace';
  g.fillText('S7-DEF', 30, 110);
  // Hazard band.
  g.save();
  g.beginPath(); g.rect(0, 206, 256, 50); g.clip();
  g.fillStyle = '#1b1a17';
  g.fillRect(0, 206, 256, 50);
  g.fillStyle = 'rgba(234,179,8,0.9)';
  for (let x = -60; x < 300; x += 40) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 20, 256); g.lineTo(x + 70, 206); g.lineTo(x + 50, 206); g.closePath(); g.fill(); }
  g.restore();
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

interface Piece { x: number; z: number; y: number; w: number; h: number; d: number; team: 'blue' | 'red' }

export function compoundPieces(walls: readonly BaseWall[], gates: readonly GridPos[], gridSize: number) {
  const centre = (gridSize - 1) / 2;
  const teamOf = (p: GridPos): 'blue' | 'red' => (p.x + p.z < 2 * centre ? 'blue' : 'red');
  const slabs: Piece[] = [];
  const pillars: Piece[] = [];
  const towers: Piece[] = [];
  const wallAt = new Map(walls.map(w => [`${w.at.x},${w.at.z}`, w]));
  for (const w of walls) {
    const team = teamOf(w.at);
    if (w.runs === 'corner') { towers.push({ x: w.at.x, z: w.at.z, y: TOWER_H / 2, w: 0.62, h: TOWER_H, d: 0.62, team }); continue; }
    // Two slabs to a tile, a hair apart.
    for (const off of [-0.25, 0.25]) {
      slabs.push(w.runs === 'x'
        ? { x: w.at.x + off, z: w.at.z, y: SLAB_H / 2, w: 0.47, h: SLAB_H, d: 0.22, team }
        : { x: w.at.x, z: w.at.z + off, y: SLAB_H / 2, w: 0.22, h: SLAB_H, d: 0.47, team });
    }
  }
  // A pillar on each side of every gate, on the wall tile beside it.
  for (const g of gates) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const w = wallAt.get(`${g.x + dx},${g.z + dz}`);
      if (!w) continue;
      pillars.push({ x: g.x + dx * 0.62, z: g.z + dz * 0.62, y: PILLAR_H / 2, w: 0.26, h: PILLAR_H, d: 0.26, team: teamOf(g) });
    }
  }
  return { slabs, pillars, towers };
}

function usePieces(ref: React.RefObject<THREE.InstancedMesh | null>, pieces: Piece[], tileSize: number, offset: number, color?: (p: Piece) => THREE.Color, yOf?: (p: Piece) => number, scale?: (p: Piece) => [number, number, number]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    pieces.forEach((p, i) => {
      o.position.set(p.x * tileSize - offset, yOf ? yOf(p) : p.y, p.z * tileSize - offset);
      const [sx, sy, sz] = scale ? scale(p) : [p.w * tileSize, p.h, p.d * tileSize];
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (color) mesh.setColorAt(i, color(p));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, pieces, tileSize, offset, color, yOf, scale]);
}

const TEAM = { blue: new THREE.Color(TEAM_COLORS.blue), red: new THREE.Color(TEAM_COLORS.red) };
const teamColour = (p: Piece) => TEAM[p.team];
// A thin light line along the top of each slab.
const stripY = (p: Piece) => p.h + 0.08;
const stripScale = (tileSize: number) => (p: Piece): [number, number, number] =>
  p.w > p.d ? [p.w * tileSize, 0.16, p.d * tileSize * 0.28] : [p.w * tileSize * 0.28, 0.16, p.d * tileSize];
// A lit band round the tower just under its roof.
const bandY = (p: Piece) => p.h - 1.4;
const bandScale = (tileSize: number) => (p: Piece): [number, number, number] => [p.w * tileSize * 1.04, 0.5, p.d * tileSize * 1.04];
const beaconY = (p: Piece) => p.h + 0.5;
const beaconScale = (): [number, number, number] => [1, 1, 1];
const footY = () => 0.45;
const footScale = (tileSize: number) => (p: Piece): [number, number, number] => [p.w * tileSize * (p.w > p.d ? 1 : 1.9), 0.9, p.d * tileSize * (p.d > p.w ? 1 : 1.9)];

const BaseCompound: React.FC<{ walls: BaseWall[]; gates: GridPos[]; tileSize: number; offset: number }> = ({ walls, gates, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const { slabs, pillars, towers } = useMemo(() => compoundPieces(walls, gates, gridSize), [walls, gates, gridSize]);
  const slabTex = useMemo(slabTexture, []);
  const hazardTex = useMemo(hazardTexture, []);
  const sStrip = useMemo(() => stripScale(tileSize), [tileSize]);
  const sFoot = useMemo(() => footScale(tileSize), [tileSize]);
  const sBand = useMemo(() => bandScale(tileSize), [tileSize]);
  const slabRef = useRef<THREE.InstancedMesh>(null);
  const footRef = useRef<THREE.InstancedMesh>(null);
  const stripRef = useRef<THREE.InstancedMesh>(null);
  const pillarRef = useRef<THREE.InstancedMesh>(null);
  const beaconRef = useRef<THREE.InstancedMesh>(null);
  const towerRef = useRef<THREE.InstancedMesh>(null);
  const towerLightRef = useRef<THREE.InstancedMesh>(null);
  usePieces(slabRef, slabs, tileSize, offset);
  usePieces(footRef, slabs, tileSize, offset, undefined, footY, sFoot);
  usePieces(stripRef, slabs, tileSize, offset, teamColour, stripY, sStrip);
  usePieces(pillarRef, pillars, tileSize, offset);
  usePieces(beaconRef, pillars, tileSize, offset, undefined, beaconY, beaconScale);
  usePieces(towerRef, towers, tileSize, offset);
  usePieces(towerLightRef, towers, tileSize, offset, teamColour, bandY, sBand);
  return (
    <group>
      <instancedMesh key={`slab-${slabs.length}`} ref={slabRef} args={[undefined, undefined, slabs.length]} raycast={noRaycast} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={slabTex} roughness={0.9} metalness={0.05} />
      </instancedMesh>
      <instancedMesh key={`foot-${slabs.length}`} ref={footRef} args={[undefined, undefined, slabs.length]} raycast={noRaycast} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4b4e4c" roughness={0.95} />
      </instancedMesh>
      <instancedMesh key={`strip-${slabs.length}`} ref={stripRef} args={[undefined, undefined, slabs.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {pillars.length > 0 && (
        <>
          <instancedMesh key={`pillar-${pillars.length}`} ref={pillarRef} args={[undefined, undefined, pillars.length]} raycast={noRaycast} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial map={hazardTex} roughness={0.7} metalness={0.2} />
          </instancedMesh>
          <instancedMesh key={`beacon-${pillars.length}`} ref={beaconRef} args={[undefined, undefined, pillars.length]} raycast={noRaycast}>
            <sphereGeometry args={[0.7, 10, 8]} />
            <meshBasicMaterial color="#fbbf24" toneMapped={false} />
          </instancedMesh>
        </>
      )}
      {towers.length > 0 && (
        <>
          <instancedMesh key={`tower-${towers.length}`} ref={towerRef} args={[undefined, undefined, towers.length]} raycast={noRaycast} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial map={slabTex} color="#8a8e8c" roughness={0.85} metalness={0.1} />
          </instancedMesh>
          <instancedMesh key={`towerlight-${towers.length}`} ref={towerLightRef} args={[undefined, undefined, towers.length]} raycast={noRaycast}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </>
      )}
    </group>
  );
};

export default React.memo(BaseCompound);
