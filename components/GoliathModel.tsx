// Goliath, Heavy Metal's doctrine hero (sim/heavyMetalHero.ts): a towering full-borg heavy. A
// pale skull of a face with red eyes and a steel jaw above a high armoured collar; huge padded
// pauldrons; a broad chest plate over bundles of red synthetic muscle cable; thick plated legs
// on clawed feet. He carries a heavy machine gun in both hands, belt-fed from a drum on his
// back, and an articulated arm curls up from his back over his right shoulder holding a box
// grenade launcher above his head. Team colour on the shoulder and chest lights.
//
// Built from primitives in world units, standing on y = 0 and facing +Z (the way Unit.tsx turns
// a unit toward where it is going). The launcher kicks back when a volley goes up.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GOLIATH } from '../sim/heavyMetalHero';

// Each Goliath gets his own materials: a cloak (Unit.tsx) tints them in place.
const makeMaterials = () => ({
  plate: new THREE.MeshStandardMaterial({ color: '#2a3039', metalness: 0.7, roughness: 0.38 }),
  plateLight: new THREE.MeshStandardMaterial({ color: '#4a525e', metalness: 0.8, roughness: 0.28 }),
  padding: new THREE.MeshStandardMaterial({ color: '#2b3247', metalness: 0.25, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.95, roughness: 0.2 }),
  muscle: new THREE.MeshStandardMaterial({ color: '#7a2226', metalness: 0.3, roughness: 0.55 }),
  skin: new THREE.MeshStandardMaterial({ color: '#d9d4cf', metalness: 0.15, roughness: 0.45 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: '#121418', metalness: 0.85, roughness: 0.35 }),
  eyes: new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false }),
  red: new THREE.MeshBasicMaterial({ color: '#ef4444', toneMapped: false }),
});
type Mats = ReturnType<typeof makeMaterials>;

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; m: THREE.Material }> = ({ p, s, r, m }) => (
  <mesh position={p} rotation={r} material={m} castShadow><boxGeometry args={s} /></mesh>
);
const Cyl: React.FC<{ p: [number, number, number]; rt: number; rb?: number; h: number; r?: [number, number, number]; m: THREE.Material; seg?: number }> = ({ p, rt, rb, h, r, m, seg = 10 }) => (
  <mesh position={p} rotation={r} material={m} castShadow><cylinderGeometry args={[rt, rb ?? rt, h, seg]} /></mesh>
);

// One leg: plated thigh with muscle cable on its inner side, knee plate, shin, clawed foot.
const Leg: React.FC<{ side: 1 | -1; M: Mats }> = ({ side, M: { plate, plateLight, muscle, chrome, gunMetal } }) => (
  <group position={[side * 0.72, 0, 0]}>
    <Box p={[0, 2.45, 0]} s={[0.8, 1.35, 0.9]} m={plate} />
    <Box p={[side * 0.08, 2.55, 0.42]} s={[0.55, 0.9, 0.12]} r={[-0.08, 0, 0]} m={plateLight} />
    <Cyl p={[-side * 0.38, 2.4, 0]} rt={0.2} h={1.3} m={muscle} />
    <Box p={[0, 1.65, 0.38]} s={[0.55, 0.45, 0.25]} r={[0.25, 0, 0]} m={chrome} />
    <Box p={[0, 1.0, 0]} s={[0.6, 1.25, 0.7]} m={plate} />
    <Cyl p={[0, 1.0, -0.38]} rt={0.16} h={1.1} m={muscle} />
    <Box p={[0, 1.1, 0.36]} s={[0.4, 0.8, 0.08]} m={plateLight} />
    {/* Clawed foot: a heel and three toes. */}
    <Box p={[0, 0.2, 0.15]} s={[0.7, 0.4, 0.9]} m={gunMetal} />
    {[-0.22, 0, 0.22].map(x => <Box key={x} p={[x, 0.12, 0.72]} s={[0.17, 0.22, 0.45]} m={chrome} />)}
  </group>
);

export const GoliathModel: React.FC<{ teamColor: string; flashRef: React.Ref<THREE.Mesh>; grenadeAt?: number }> = ({ teamColor, flashRef, grenadeAt }) => {
  const launcher = useRef<THREE.Group>(null);
  const M = useMemo(makeMaterials, []);
  const { plate, plateLight, padding, chrome, muscle, skin, gunMetal, eyes, red } = M;
  const team = useMemo(() => new THREE.MeshBasicMaterial({ color: teamColor, toneMapped: false }), [teamColor]);
  useEffect(() => () => { Object.values(M).forEach(m => m.dispose()); }, [M]);
  useEffect(() => () => team.dispose(), [team]);
  useFrame(() => {
    const g = launcher.current;
    if (!g) return;
    // Kicks back with each grenade of a volley, settling between.
    const since = grenadeAt === undefined ? Infinity : Date.now() - grenadeAt;
    const volley = GOLIATH.grenades.count * GOLIATH.grenades.intervalMs;
    const kick = since < volley + 200 ? Math.max(0, 1 - (since % GOLIATH.grenades.intervalMs) / GOLIATH.grenades.intervalMs) : 0;
    g.rotation.x = -0.35 - kick * 0.25;
  });
  return (
    <group>
      <Leg side={1} M={M} />
      <Leg side={-1} M={M} />

      {/* Pelvis and the exposed muscle-cable waist. */}
      <Box p={[0, 3.25, 0]} s={[1.6, 0.5, 1.0]} m={plate} />
      <Box p={[0, 3.05, 0.48]} s={[0.55, 0.65, 0.12]} r={[0.1, 0, 0]} m={plateLight} />
      {[-0.3, 0, 0.3].map(x => <Cyl key={x} p={[x, 3.85, 0]} rt={0.2} h={0.9} m={muscle} />)}
      <Cyl p={[0, 3.85, -0.3]} rt={0.14} h={0.9} m={chrome} />

      {/* Chest: a broad armoured torso with a tapering front plate and red slits. */}
      <Box p={[0, 4.95, -0.05]} s={[2.1, 1.5, 1.25]} m={plate} />
      <Box p={[0, 4.75, 0.66]} s={[1.3, 1.5, 0.18]} r={[-0.12, 0, 0]} m={plateLight} />
      <Box p={[0, 4.1, 0.62]} s={[0.8, 0.4, 0.16]} r={[-0.3, 0, 0]} m={plateLight} />
      <Box p={[0, 5.15, 0.78]} s={[0.45, 0.06, 0.04]} m={team} />
      {[-0.55, 0.55].map(x => <Box key={x} p={[x, 4.6, 0.7]} s={[0.18, 0.06, 0.04]} r={[0, 0, x > 0 ? -0.5 : 0.5]} m={red} />)}

      {/* High collar flaring up behind the head. */}
      <Box p={[0, 6.0, -0.5]} s={[1.6, 0.8, 0.25]} r={[-0.45, 0, 0]} m={plate} />
      {[-1, 1].map(s => <Box key={s} p={[s * 0.7, 5.95, -0.1]} s={[0.25, 0.65, 0.95]} r={[0, 0, s * 0.45]} m={plate} />)}
      {[-1, 1].map(s => <Cyl key={s} p={[s * 0.25, 6.0, 0.05]} rt={0.09} h={0.6} r={[0, 0, s * 0.25]} m={muscle} />)}

      {/* Head: pale skull, steel jaw, glowing red eyes, a seam over the crown. */}
      <Cyl p={[0, 6.3, 0.05]} rt={0.2} h={0.5} m={chrome} />
      <group position={[0, 6.8, 0.08]}>
        <mesh material={skin} scale={[0.8, 1.05, 0.95]} castShadow><sphereGeometry args={[0.44, 16, 12]} /></mesh>
        {/* Steel lower face: a jaw cage and cheek plates. */}
        <Box p={[0, -0.3, 0.1]} s={[0.5, 0.3, 0.5]} m={chrome} />
        {[-0.08, 0, 0.08].map(x => <Box key={x} p={[x, -0.3, 0.36]} s={[0.04, 0.24, 0.04]} m={gunMetal} />)}
        {[-1, 1].map(s => <Box key={s} p={[s * 0.27, -0.08, 0.16]} s={[0.08, 0.26, 0.3]} r={[0, s * 0.3, 0]} m={chrome} />)}
        {/* Dark brow over the red eyes, and a seam over the crown. */}
        <Box p={[0, 0.1, 0.37]} s={[0.4, 0.07, 0.08]} m={gunMetal} />
        {[-0.13, 0.13].map(x => <mesh key={x} position={[x, 0.02, 0.38]} material={eyes}><sphereGeometry args={[0.06, 8, 6]} /></mesh>)}
        <Box p={[0, 0.3, 0]} s={[0.035, 0.05, 0.8]} m={gunMetal} />
      </group>

      {/* Huge padded pauldrons with a plate and a team light. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 1.4, 5.5, -0.05]} rotation={[0, 0, -s * 0.22]}>
          <mesh material={padding} scale={[0.62, 0.48, 0.74]} castShadow><sphereGeometry args={[1, 14, 10]} /></mesh>
          <Box p={[s * 0.25, 0.42, 0]} s={[0.85, 0.15, 1.5]} m={plate} />
          <Box p={[s * 0.6, -0.05, 0]} s={[0.12, 0.9, 1.25]} m={plateLight} />
          <Box p={[s * 0.67, 0.1, 0.3]} s={[0.03, 0.12, 0.5]} m={team} />
        </group>
      ))}

      {/* Arms forward to the gun: muscle-cable upper arms, armoured forearms, fists on the grips. */}
      {[-1, 1].map(s => (
        <group key={s}>
          <Cyl p={[s * 1.35, 4.65, 0.1]} rt={0.26} rb={0.22} h={1.2} r={[0.35, 0, 0]} m={muscle} />
          <Cyl p={[s * 1.35, 4.05, 0.3]} rt={0.24} h={0.3} r={[0.35, 0, 0]} m={chrome} />
          <Box p={[s * 1.1, 3.95, 0.8]} s={[0.55, 0.55, 1.05]} r={[0, -s * 0.35, 0]} m={plate} />
          <Box p={[s * 1.1, 4.25, 0.8]} s={[0.4, 0.08, 0.8]} r={[0, -s * 0.35, 0]} m={plateLight} />
        </group>
      ))}
      <Box p={[0.35, 4.05, 1.2]} s={[0.42, 0.42, 0.42]} m={gunMetal} />
      <Box p={[-0.45, 4.15, 1.75]} s={[0.4, 0.4, 0.4]} m={gunMetal} />

      {/* The heavy machine gun, held across the body: receiver, ammo box, shrouded barrel. */}
      <group position={[-0.1, 4.25, 1.4]}>
        <Box p={[0, 0, 0]} s={[0.5, 0.55, 1.6]} m={gunMetal} />
        <Box p={[0, 0.33, -0.2]} s={[0.3, 0.12, 0.9]} m={plateLight} />
        <Box p={[0.42, -0.15, -0.25]} s={[0.36, 0.5, 0.6]} m={plate} />
        <Box p={[0, -0.42, 0.25]} s={[0.16, 0.4, 0.2]} r={[0.3, 0, 0]} m={gunMetal} />
        <Cyl p={[0, 0.05, 1.25]} rt={0.2} h={1.0} r={[Math.PI / 2, 0, 0]} m={plate} seg={8} />
        <Cyl p={[0, 0.05, 2.0]} rt={0.09} h={1.2} r={[Math.PI / 2, 0, 0]} m={chrome} seg={8} />
        <Cyl p={[0, 0.05, 2.65]} rt={0.14} h={0.25} r={[Math.PI / 2, 0, 0]} m={gunMetal} seg={8} />
        <mesh ref={flashRef} position={[0, 0.05, 2.95]} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.45, 8, 6]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
        {/* Ammo belt back over the shoulder to the drum. */}
        <Box p={[0.55, 0.4, -0.95]} s={[0.12, 0.08, 1.0]} r={[0.6, 0.3, 0]} m={chrome} />
      </group>

      {/* Back: an ammo drum and the pack that carries the launcher arm. */}
      <Box p={[0, 4.85, -0.95]} s={[1.5, 1.4, 0.7]} m={plate} />
      <Cyl p={[0.55, 4.4, -1.15]} rt={0.42} h={0.5} r={[0, 0, Math.PI / 2]} m={plateLight} seg={12} />
      <Box p={[-0.35, 5.3, -1.32]} s={[0.4, 0.25, 0.06]} m={red} />

      {/* The launcher arm: up from the pack, curling over the right shoulder. */}
      <group position={[-0.7, 5.6, -1.05]}>
        <Cyl p={[0, 0.7, 0]} rt={0.17} h={1.4} r={[0.15, 0, 0]} m={chrome} />
        <Cyl p={[0, 0.7, -0.12]} rt={0.11} h={1.3} r={[0.15, 0, 0]} m={muscle} />
        <mesh position={[0, 1.45, -0.1]} material={plate}><sphereGeometry args={[0.24, 10, 8]} /></mesh>
        <Cyl p={[0, 1.95, 0.25]} rt={0.15} h={1.1} r={[0.9, 0, 0]} m={chrome} />
        <group ref={launcher} position={[0, 2.45, 0.75]} rotation={[-0.35, 0, 0]}>
          {/* The box launcher: six tubes facing forward, red-tipped. */}
          <Box p={[0, 0, 0]} s={[1.25, 0.72, 1.0]} m={plate} />
          <Box p={[0, 0.4, -0.05]} s={[1.3, 0.1, 1.05]} m={plateLight} />
          {[-0.38, 0, 0.38].flatMap(x => [-0.16, 0.16].map(y => (
            <group key={`${x},${y}`} position={[x, y, 0.51]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={gunMetal}><cylinderGeometry args={[0.13, 0.13, 0.08, 10]} /></mesh>
              <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={red}><cylinderGeometry args={[0.07, 0.07, 0.06, 8]} /></mesh>
            </group>
          )))}
          <Box p={[0.66, 0, 0.1]} s={[0.04, 0.12, 0.5]} m={team} />
        </group>
      </group>
    </group>
  );
};
