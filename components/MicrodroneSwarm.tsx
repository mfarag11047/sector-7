// The Wasps' micro-drones (sim/microdrones.ts), drawn as one instanced swarm: a small dark diamond
// with a glowing core in its side's colour. The sim moves them on the game tick; here each drone
// glides toward where the sim has it, so the swarm flows rather than stepping. Escorting drones
// fly just under the Wasps' altitude with a little bob; an attacking drone dives at a ground
// target over its last few tiles, or stays high for one in the air.
//
// Enemy drones show only when their Wasp is in sight or they are diving at one of the player's units.

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TEAM_COLORS } from '../constants';
import type { UnitData } from '../types';
import type { Swarm } from '../sim/microdrones';
import { UNIT_RULES } from '../sim/units';

// The height the drones fly at, just under the Wasps (aircraft hover at 75).
export const DRONE_AIR_Y = 72;
// A ground target's height, and the distance in tiles over which a drone dives down to it.
const GROUND_Y = 2;
const DIVE_TILES = 3.5;
const MAX_DRONES = 256;
// How quickly a drawn drone catches up with the sim (per second).
const FOLLOW = 14;

const bodyGeometry = new THREE.OctahedronGeometry(1.8, 0).scale(1, 0.35, 1);
const coreGeometry = new THREE.SphereGeometry(0.7, 8, 6);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#1f2933', metalness: 0.7, roughness: 0.35 });
const coreMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });

const hash = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967295;
};

export const MicrodroneSwarm: React.FC<{
  swarmRef: React.MutableRefObject<Swarm>;
  unitsRef: React.MutableRefObject<UnitData[]>;
  visibleIdsRef: React.MutableRefObject<Set<string>>;
  playerTeam: string;
  tileSize: number;
  offset: number;
}> = ({ swarmRef, unitsRef, visibleIdsRef, playerTeam, tileSize, offset }) => {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  // Where each drone is drawn now, by id.
  const drawn = useRef(new Map<string, { x: number; y: number; z: number; yaw: number }>());
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), c: new THREE.Color() }), []);

  useFrame((state, delta) => {
    const b = bodies.current, c = cores.current;
    if (!b || !c) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * FOLLOW);
    const t = state.clock.elapsedTime;
    const units = unitsRef.current;
    const seen = new Set<string>();
    let n = 0;
    for (const d of swarmRef.current.drones) {
      if (n >= MAX_DRONES) break;
      const target = d.mode === 'attack' && d.targetId ? units.find(u => u.id === d.targetId) : undefined;
      const ours = d.team === playerTeam;
      if (!ours && !visibleIdsRef.current.has(d.waspId) && !(target && target.team === playerTeam)) continue;
      // Where the sim has it, in the world.
      const x = d.at.x * tileSize - offset;
      const z = d.at.z * tileSize - offset;
      let y = DRONE_AIR_Y + Math.sin(t * 3 + hash(d.id) * 6.28) * 0.6;
      if (target) {
        const targetY = UNIT_RULES[target.type].armor === 'air' ? DRONE_AIR_Y : GROUND_Y;
        const left = Math.hypot(target.gridPos.x - d.at.x, target.gridPos.z - d.at.z);
        y = targetY + (DRONE_AIR_Y - targetY) * Math.min(1, left / DIVE_TILES);
      }
      let pos = drawn.current.get(d.id);
      if (!pos) {
        pos = { x, y, z, yaw: 0 };
        drawn.current.set(d.id, pos);
      }
      const dx = x - pos.x, dz = z - pos.z;
      if (dx * dx + dz * dz > 0.01) pos.yaw = Math.atan2(dx, dz);
      pos.x += dx * k;
      pos.y += (y - pos.y) * k;
      pos.z += dz * k;
      seen.add(d.id);
      tmp.p.set(pos.x, pos.y, pos.z);
      tmp.q.setFromEuler(tmp.e.set(0, pos.yaw, 0));
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      b.setMatrixAt(n, tmp.m);
      c.setMatrixAt(n, tmp.m);
      c.setColorAt(n, tmp.c.set(TEAM_COLORS[d.team as 'blue' | 'red'] ?? '#ffffff'));
      n++;
    }
    for (const id of drawn.current.keys()) if (!seen.has(id)) drawn.current.delete(id);
    b.count = n;
    c.count = n;
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, MAX_DRONES]} frustumCulled={false} castShadow />
      <instancedMesh ref={cores} args={[coreGeometry, coreMaterial, MAX_DRONES]} frustumCulled={false} />
    </group>
  );
};
