// Kage, Shadow Ops' doctrine hero (sim/shadowHero.ts): a stealth operative. A dark helmet with a
// four-lens night-vision rig glowing green over a covered face; a charcoal suit under angular
// armour tiles scattered over the chest and belly; shoulder pads with red tags; a red patch on
// the arm. He carries a black katana low in his right hand, its scabbard across his back, and
// cuts with it when he strikes. Team colour on the helmet band and belt.
//
// Built from primitives in world units (then scaled up a little), standing on y = 0 and facing +Z. Each Kage has his own
// materials: Optical Camo tints them in place (Unit.tsx), and remounts the model when it ends.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const makeMaterials = (teamColor: string) => ({
  suit: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.2, roughness: 0.8 }),
  suitDark: new THREE.MeshStandardMaterial({ color: '#222429', metalness: 0.25, roughness: 0.75 }),
  armour: new THREE.MeshStandardMaterial({ color: '#17191c', metalness: 0.55, roughness: 0.45 }),
  helmet: new THREE.MeshStandardMaterial({ color: '#1b1d21', metalness: 0.45, roughness: 0.5 }),
  rig: new THREE.MeshStandardMaterial({ color: '#0e0f11', metalness: 0.7, roughness: 0.35 }),
  blade: new THREE.MeshStandardMaterial({ color: '#0a0a0c', metalness: 0.95, roughness: 0.12 }),
  edge: new THREE.MeshStandardMaterial({ color: '#5b6068', metalness: 1, roughness: 0.1 }),
  wrap: new THREE.MeshStandardMaterial({ color: '#2a0d0f', metalness: 0.1, roughness: 0.9 }),
  lens: new THREE.MeshBasicMaterial({ color: '#39ff6a', toneMapped: false }),
  glow: new THREE.MeshBasicMaterial({ color: '#39ff6a', toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  red: new THREE.MeshBasicMaterial({ color: '#d42a2a', toneMapped: false }),
  team: new THREE.MeshBasicMaterial({ color: teamColor, toneMapped: false }),
});
type Mats = ReturnType<typeof makeMaterials>;

type V3 = [number, number, number];
const Box: React.FC<{ p: V3; s: V3; r?: V3; m: THREE.Material }> = ({ p, s, r, m }) => (
  <mesh position={p} rotation={r} material={m} castShadow><boxGeometry args={s} /></mesh>
);
const Cyl: React.FC<{ p: V3; rt: number; rb?: number; h: number; r?: V3; m: THREE.Material; seg?: number }> = ({ p, rt, rb, h, r, m, seg = 10 }) => (
  <mesh position={p} rotation={r} material={m} castShadow><cylinderGeometry args={[rt, rb ?? rt, h, seg]} /></mesh>
);

// Armour tiles over the chest and belly, each a little askew, as on the reference suit.
const TILES: { p: V3; s: [number, number]; rz: number }[] = [
  { p: [-0.17, 3.0, 0], s: [0.24, 0.22], rz: 0.15 }, { p: [0.17, 3.02, 0], s: [0.22, 0.24], rz: -0.2 },
  { p: [-0.2, 2.75, 0], s: [0.2, 0.2], rz: -0.25 }, { p: [0.02, 2.78, 0], s: [0.18, 0.2], rz: 0.3 }, { p: [0.22, 2.74, 0], s: [0.2, 0.18], rz: 0.1 },
  { p: [-0.1, 2.5, 0], s: [0.2, 0.18], rz: 0.35 }, { p: [0.14, 2.48, 0], s: [0.22, 0.2], rz: -0.1 },
  { p: [0.0, 2.26, 0], s: [0.18, 0.16], rz: 0.2 },
];

// A leg: thigh, knee pad, shin and boot.
const Leg: React.FC<{ side: 1 | -1; M: Mats }> = ({ side, M }) => (
  <group position={[side * 0.2, 0, 0]}>
    <Cyl p={[0, 1.6, 0]} rt={0.16} rb={0.13} h={0.9} m={M.suit} />
    <Box p={[side * 0.06, 1.7, 0.08]} s={[0.14, 0.32, 0.18]} m={M.armour} />
    <Box p={[0, 1.12, 0.13]} s={[0.2, 0.2, 0.08]} m={M.armour} />
    <Cyl p={[0, 0.7, 0]} rt={0.13} rb={0.11} h={0.85} m={M.suitDark} />
    <Box p={[0, 0.12, 0.06]} s={[0.22, 0.24, 0.42]} m={M.rig} />
  </group>
);

export const KageModel: React.FC<{ teamColor: string; lastAttackTime?: number }> = ({ teamColor, lastAttackTime }) => {
  const M = useMemo(() => makeMaterials(teamColor), [teamColor]);
  useEffect(() => () => { Object.values(M).forEach(m => m.dispose()); }, [M]);
  const swordArm = useRef<THREE.Group>(null);
  useFrame(() => {
    const arm = swordArm.current;
    if (!arm) return;
    // A cut: the blade sweeps across in front of him over a quarter second, then settles back.
    const t = lastAttackTime === undefined ? Infinity : (Date.now() - lastAttackTime) / 250;
    const swing = t < 1 ? Math.sin(t * Math.PI) : 0;
    arm.rotation.y = 0.5 - swing * 1.6;
    arm.rotation.x = -0.2 - swing * 0.5;
  });
  return (
    // A hero stands a head taller than the line infantry.
    <group scale={1.4}>
      <Leg side={1} M={M} />
      <Leg side={-1} M={M} />

      {/* Belt with the team light, and the torso under its armour tiles. */}
      <Box p={[0, 2.08, 0]} s={[0.56, 0.16, 0.34]} m={M.rig} />
      <Box p={[0, 2.08, 0.175]} s={[0.12, 0.06, 0.02]} m={M.team} />
      <Box p={[0, 2.65, 0]} s={[0.6, 1.0, 0.32]} m={M.suit} />
      <Box p={[0, 3.05, -0.02]} s={[0.7, 0.3, 0.36]} m={M.suit} />
      {TILES.map((t, i) => <Box key={i} p={[t.p[0], t.p[1], 0.18]} s={[t.s[0], t.s[1], 0.05]} r={[0, 0, t.rz]} m={M.armour} />)}
      <Box p={[0.15, 2.9, 0.215]} s={[0.05, 0.05, 0.02]} m={M.red} />

      {/* Shoulder pads with red tags. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.42, 3.08, 0]} rotation={[0, 0, -s * 0.35]}>
          <Box p={[0, 0, 0]} s={[0.26, 0.16, 0.36]} m={M.armour} />
          <Box p={[s * 0.06, 0.02, 0.16]} s={[0.06, 0.05, 0.02]} m={M.red} />
        </group>
      ))}

      {/* Left arm forward, open hand out for balance. */}
      <group position={[-0.42, 3.0, 0]} rotation={[-0.7, 0, 0.15]}>
        <Cyl p={[0, -0.28, 0]} rt={0.09} h={0.56} m={M.suit} />
        <Box p={[-0.06, -0.3, 0.02]} s={[0.04, 0.1, 0.1]} m={M.red} />
        <Cyl p={[0, -0.78, 0]} rt={0.08} rb={0.07} h={0.5} r={[-0.4, 0, 0]} m={M.suitDark} />
        <Box p={[0, -1.08, 0.12]} s={[0.12, 0.16, 0.1]} m={M.rig} />
      </group>

      {/* Right arm with the black katana held low and forward; it swings to cut. */}
      <group ref={swordArm} position={[0.42, 3.0, 0]} rotation={[-0.2, 0.5, 0]}>
        <Cyl p={[0, -0.28, 0]} rt={0.09} h={0.56} r={[0, 0, -0.1]} m={M.suit} />
        <group position={[0.03, -0.56, 0]} rotation={[-0.9, 0, 0]}>
          <Cyl p={[0, -0.25, 0]} rt={0.08} rb={0.07} h={0.5} m={M.suitDark} />
          <group position={[0, -0.55, 0]}>
            <Box p={[0, 0, 0]} s={[0.13, 0.15, 0.13]} m={M.rig} />
            {/* The katana: wrapped grip, guard, and a long black blade with a pale edge. */}
            <group rotation={[0.4, 0, 0]}>
              <Cyl p={[0, 0, 0.05]} rt={0.035} h={0.4} r={[Math.PI / 2, 0, 0]} m={M.wrap} seg={6} />
              <Cyl p={[0, 0, 0.27]} rt={0.09} h={0.03} r={[Math.PI / 2, 0, 0]} m={M.rig} seg={10} />
              <Box p={[0, 0, 1.05]} s={[0.035, 0.1, 1.5]} r={[0.04, 0, 0]} m={M.blade} />
              <Box p={[0, -0.055, 1.05]} s={[0.02, 0.02, 1.46]} r={[0.04, 0, 0]} m={M.edge} />
            </group>
          </group>
        </group>
      </group>

      {/* Scabbard across his back. */}
      <Box p={[0, 2.75, -0.22]} s={[0.07, 0.07, 1.4]} r={[Math.PI / 2 - 0.5, 0, 0.6]} m={M.rig} />

      {/* Neck, covered face, helmet with the team band, and the four-lens night-vision rig. */}
      <Cyl p={[0, 3.3, 0]} rt={0.1} h={0.2} m={M.suitDark} />
      <group position={[0, 3.55, 0.02]}>
        <mesh material={M.suitDark} scale={[0.85, 1, 0.95]} castShadow><sphereGeometry args={[0.22, 12, 10]} /></mesh>
        <mesh position={[0, 0.07, -0.01]} material={M.helmet} scale={[1, 0.85, 1.05]} castShadow>
          <sphereGeometry args={[0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.team}><torusGeometry args={[0.255, 0.012, 4, 24]} /></mesh>
        {[-1, 1].map(s => <Box key={s} p={[s * 0.24, 0.02, 0]} s={[0.05, 0.12, 0.14]} m={M.rig} />)}
        <Box p={[0, 0.22, 0.2]} s={[0.08, 0.08, 0.1]} m={M.rig} />
        <Box p={[0, 0.07, 0.25]} s={[0.36, 0.08, 0.08]} m={M.rig} />
        {[-0.135, -0.045, 0.045, 0.135].map((x, i) => (
          <group key={x} position={[x, 0.05, 0.3]} rotation={[0, (i - 1.5) * 0.18, 0]}>
            <Cyl p={[0, 0, 0]} rt={0.035} h={0.12} r={[Math.PI / 2, 0, 0]} m={M.rig} seg={8} />
            <mesh position={[0, 0, 0.065]} material={M.lens}><circleGeometry args={[0.034, 10]} /></mesh>
            <mesh position={[0, 0, 0.09]} material={M.glow} raycast={() => null}><sphereGeometry args={[0.06, 8, 6]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
};
