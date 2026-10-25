// The Ghost, the EW specialist, built from the unit kit (components/kit).
//
// Simple but military: the same armoured soldier as the Trooper (TrooperModel.tsx), carrying a
// large EW pack: a tall armoured case with a lid plate, battery cells down its sides and a lit
// status strip, and an antenna array rising from its top well above the helmet: a telescoping mast
// with a crossed array at its head, two whip antennas splayed to the sides, and a small flat panel
// on a stub. Red lights blink at the antenna tips.
//
// Built facing +Z, about 1 tall in its own units (1.5 to the mast's head), and scaled up as the
// soldier is.

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE } from '../kit/materials';
import { Plate, Strip, Turned } from '../kit/shapes';
import { ArmouredSoldier, SoldierProps } from './TrooperModel';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const PACK_TOP = 0.93;

const EwPack: React.FC = () => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite');
  // The tip lights, this Ghost's own so they can blink.
  const tips = useMemo(() => own(glow(PALETTE.warning)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => tips.dispose(), [tips]);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const on = Math.sin(clock.elapsedTime * 5) > 0.2;
    tips.color.copy(tint.set(PALETTE.warning)).multiplyScalar(on ? 1 : 0.15);
  });

  return (
    <group>
      {/* The case: armoured, a lid plate, battery cells down its sides, a status strip. */}
      <Plate size={[0.28, 0.4, 0.16]} material={composite} position={[0, 0.73, -0.17]} />
      <Plate size={[0.23, 0.32, 0.02]} material={armour} position={[0, 0.74, -0.258]} />
      <Plate size={[0.3, 0.04, 0.18]} material={dark} position={[0, PACK_TOP - 0.01, -0.17]} />
      {[1, -1].map(s => (
        <Turned key={s} profile={[[0.035, -0.16], [0.035, 0.16]]} segments={6} material={dark} position={[s * 0.16, 0.72, -0.17]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <Strip size={[0.14, 0.012, 0.004]} material={glow(PALETTE.cyan)} position={[0, 0.63, -0.27]} />
      {[-0.04, 0, 0.04].map(x => <Strip key={x} size={[0.014, 0.014, 0.004]} material={glow(x ? PALETTE.repair : PALETTE.amber)} position={[x, 0.84, -0.27]} />)}

      {/* The antenna array. A telescoping mast with a crossed array at its head. */}
      <group position={[0.05, PACK_TOP, -0.19]}>
        <Turned profile={[[0.02, 0], [0.02, 0.06]]} segments={6} material={dark} rotation={UP} />
        <Turned profile={[[0.012, 0.06], [0.012, 0.32], [0.008, 0.32], [0.008, 0.58]]} segments={6} material={steel} rotation={UP} />
        <group position={[0, 0.5, 0]}>
          {[0, Math.PI / 2].map(r => <Plate key={r} size={[0.16, 0.008, 0.008]} material={black} rotation={[0, r, 0]} />)}
          {[0, Math.PI / 2].map(r => <Plate key={r} size={[0.11, 0.008, 0.008]} material={black} position={[0, 0.04, 0]} rotation={[0, r + Math.PI / 4, 0]} />)}
        </group>
        <Strip size={[0.02, 0.02, 0.02]} material={tips} position={[0, 0.59, 0]} />
      </group>
      {/* Two whip antennas splayed to the sides. */}
      {([[-0.1, 0.46, 0.22], [0.12, 0.36, -0.3]] as const).map(([x, h, lean]) => (
        <group key={x} position={[x, PACK_TOP, -0.22]} rotation={[0, 0, lean]}>
          <Turned profile={[[0.014, 0], [0.014, 0.03]]} segments={6} material={dark} rotation={UP} />
          <Turned profile={[[0.006, 0.03], [0.003, h]]} segments={4} material={black} rotation={UP} />
          <Strip size={[0.016, 0.016, 0.016]} material={tips} position={[0, h, 0]} />
        </group>
      ))}
      {/* A small flat panel array on a stub, tilted back. */}
      <group position={[-0.07, PACK_TOP + 0.08, -0.13]} rotation={[0.35, 0, 0]}>
        <Turned profile={[[0.008, -0.08], [0.008, 0.0]]} segments={4} material={steel} rotation={UP} />
        <Plate size={[0.1, 0.13, 0.012]} material={dark} position={[0, 0.06, 0]} />
        <Plate size={[0.085, 0.115, 0.004]} material={black} position={[0, 0.06, 0.008]} />
      </group>
    </group>
  );
};

export const GhostModel: React.FC<SoldierProps> = props => <ArmouredSoldier {...props} pack={<EwPack />} />;
