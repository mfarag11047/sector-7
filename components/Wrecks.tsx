// Wrecks of destroyed vehicles, for Heavy Metal's Salvage (sim/salvage.ts): a burnt-out hull
// lying askew where the vehicle died, embers glowing in it, smoke curling up, and while a crew
// strips it a ring on the ground filling in their colour.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import { SALVAGE, type Wreck } from '../sim/salvage';
import { UNIT_RULES } from '../sim/units';

const hull = new THREE.MeshStandardMaterial({ color: '#1d1b1a', roughness: 0.95, metalness: 0.2 });
const scorch = new THREE.MeshStandardMaterial({ color: '#2b2422', roughness: 1, metalness: 0.1 });
const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.2), toneMapped: false, transparent: true });
const smoke = new THREE.MeshBasicMaterial({ color: '#3a3836', transparent: true, opacity: 0.35, depthWrite: false });
const box = new THREE.BoxGeometry(1, 1, 1);
const puff = new THREE.IcosahedronGeometry(1, 0);
const disc = new THREE.CircleGeometry(1, 20);

// A little shake of each wreck's pose from its id, so no two lie the same.
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0) / 4294967295; };

const WreckModel: React.FC<{ w: Wreck; tileSize: number; offset: number }> = ({ w, tileSize, offset }) => {
  const r = useMemo(() => hash(w.id), [w.id]);
  // About the size of what died: a light vehicle's hull, a heavy one's bigger.
  const big = UNIT_RULES[w.type].armor === 'heavy' ? 2.8 : 2;
  const puffs = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Smoke rising and thinning; the whole wreck fading over its last 5 s.
    puffs.current?.children.forEach((p, i) => {
      const k = ((t * 0.35 + i / 3 + r) % 1);
      p.position.set(Math.sin(i * 2 + r * 6) * 0.4, 1 + k * 5, Math.cos(i * 2 + r * 6) * 0.4);
      p.scale.setScalar(0.5 + k * 1.4);
    });
    ember.opacity = 0.6 + 0.4 * Math.sin(t * 5 + r * 10);
  });
  const p = w.progress;
  return (
    <group position={[w.at.x * tileSize - offset, 0, w.at.z * tileSize - offset]} rotation={[0, r * Math.PI * 2, 0]} scale={big}>
      <mesh geometry={disc} material={scorch} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} scale={3.2} raycast={() => null} />
      <mesh geometry={box} material={hull} position={[0, 0.55, 0]} rotation={[0.08 * (r - 0.5), 0, 0.22 * (r - 0.5)]} scale={[2.2, 1, 3.4]} castShadow raycast={() => null} />
      <mesh geometry={box} material={hull} position={[0.2, 1.25, -0.3]} rotation={[0.3, 0.6 * r, 0.25]} scale={[1.3, 0.55, 1.4]} castShadow raycast={() => null} />
      <mesh geometry={box} material={ember} position={[0.5, 1.06, 0.6]} scale={[0.35, 0.08, 0.3]} raycast={() => null} />
      <mesh geometry={box} material={ember} position={[-0.6, 0.7, -1.1]} scale={[0.3, 0.06, 0.45]} raycast={() => null} />
      <group ref={puffs}>{[0, 1, 2].map(i => <mesh key={i} geometry={puff} material={smoke} raycast={() => null} />)}</group>
      {p && (
        <group position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh raycast={() => null}>
            <ringGeometry args={[tileSize * 0.6 / big, tileSize * 0.68 / big, 40]} />
            <meshBasicMaterial color={TEAM_COLORS[p.team]} transparent opacity={0.2} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh raycast={() => null}>
            <ringGeometry args={[tileSize * 0.56 / big, tileSize * 0.72 / big, 40, 1, Math.PI / 2, -Math.PI * 2 * Math.min(1, p.ms / SALVAGE.ms)]} />
            <meshBasicMaterial color={TEAM_COLORS[p.team]} transparent opacity={p.active ? 0.9 : 0.45} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
};

const Wrecks: React.FC<{ wrecks: readonly Wreck[]; tileSize: number; offset: number }> = ({ wrecks, tileSize, offset }) => (
  <group>{wrecks.map(w => <WreckModel key={w.id} w={w} tileSize={tileSize} offset={offset} />)}</group>
);

export default React.memo(Wrecks);
