// The "Jackrabbit" scout RC car: a small, low four-wheeled buggy with a roll cage, a camera mast
// and a whip antenna, built to look fast and fragile next to the real vehicles.

import React from 'react';
import * as THREE from 'three';

const body = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.35 });
const dark = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 });
const cage = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 });

export const ScoutCarModel: React.FC<{ teamColor: string }> = ({ teamColor }) => (
  <group scale={[2.2, 2.2, 2.2]}>
    {/* Chassis and nose wedge */}
    <mesh position={[0, 0.35, 0]} material={body}><boxGeometry args={[0.8, 0.2, 1.5]} /></mesh>
    <mesh position={[0, 0.38, 0.85]} rotation={[0.35, 0, 0]} material={body}><boxGeometry args={[0.7, 0.12, 0.4]} /></mesh>
    {/* Team stripe down the spine */}
    <mesh position={[0, 0.46, 0]}><boxGeometry args={[0.12, 0.02, 1.4]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh>
    {/* Big off-road wheels */}
    {[[-0.48, 0.55], [0.48, 0.55], [-0.48, -0.55], [0.48, -0.55]].map(([x, z], i) => (
      <mesh key={i} position={[x, 0.25, z]} rotation={[0, 0, Math.PI / 2]} material={dark}><cylinderGeometry args={[0.25, 0.25, 0.18, 10]} /></mesh>
    ))}
    {/* Roll cage */}
    {[-0.3, 0.3].map(x => (
      <mesh key={x} position={[x, 0.62, -0.1]} material={cage}><boxGeometry args={[0.05, 0.05, 0.9]} /></mesh>
    ))}
    <mesh position={[0, 0.62, 0.32]} material={cage}><boxGeometry args={[0.65, 0.05, 0.05]} /></mesh>
    <mesh position={[0, 0.62, -0.52]} material={cage}><boxGeometry args={[0.65, 0.05, 0.05]} /></mesh>
    {/* Camera mast with a glowing lens */}
    <mesh position={[0, 0.85, 0.1]} material={cage}><cylinderGeometry args={[0.03, 0.03, 0.45, 6]} /></mesh>
    <mesh position={[0, 1.1, 0.12]} material={dark}><boxGeometry args={[0.2, 0.14, 0.2]} /></mesh>
    <mesh position={[0, 1.1, 0.23]}><circleGeometry args={[0.06, 12]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh>
    {/* Whip antenna with a team-coloured tip */}
    <mesh position={[0.28, 1.05, -0.6]} rotation={[-0.2, 0, 0]} material={cage}><cylinderGeometry args={[0.012, 0.012, 1.1, 4]} /></mesh>
    <mesh position={[0.28, 1.6, -0.71]}><sphereGeometry args={[0.05, 6, 6]} /><meshBasicMaterial color={teamColor} toneMapped={false} /></mesh>
  </group>
);
