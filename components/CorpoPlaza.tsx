// The great roundabout at the heart of the city, between the four corporate towers
// (components/Landmarks.tsx), in the spirit of Night City's Corpo Plaza.
//
// At street level a ring road is painted round the central server node: yellow edge lines, a
// dashed lane, in-ground blue lights, and a curbed island of palms around the node. Above it two
// elevated ring decks stand on pillars, stacked and offset like tiers: dark asphalt with yellow
// skirts, a blue glow underneath, lamp posts, palms and traffic circling on them.
//
// It is scenery, never in the way of play. The street level is only lines and a low curb, so the
// tiles under it still light up and take clicks. A deck fades almost to nothing while any ground
// unit is beneath it, so a fight for the node is never hidden.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { UnitData } from '../types';
import { isAirType } from '../sim/units';

const YELLOW = '#ffc21a';
const BLUE = '#3cc8ff';

// A flat annulus (inner..outer) lying in the ground plane, `thickness` deep, top face at y = 0.
function deckGeometry(inner: number, outer: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 64 });
  // Extruded along +z; lay it flat so it hangs below y = 0.
  g.rotateX(Math.PI / 2);
  return g;
}

const noRaycast = () => null;

// Many copies of one mesh placed once: palms, lamp posts, lane dashes.
const Instances: React.FC<{ geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }> = ({ geometry, material, matrices }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} raycast={noRaycast} />;
};

const compose = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));

// Palm trees at the given spots: a leaning trunk and a crown of drooping fronds.
const Palms: React.FC<{ spots: { x: number; y: number; z: number; s: number }[] }> = ({ spots }) => {
  const parts = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 7, 5);
    trunk.translate(0, 3.5, 0);
    const frond = new THREE.BoxGeometry(3.4, 0.08, 0.7);
    frond.translate(1.7, 0, 0);
    return {
      trunk, frond,
      trunkMat: new THREE.MeshStandardMaterial({ color: '#3b2f25', roughness: 0.9 }),
      frondMat: new THREE.MeshStandardMaterial({ color: '#1f5a3a', emissive: '#0b2f1d', emissiveIntensity: 0.6, roughness: 0.8 }),
    };
  }, []);
  useEffect(() => () => { parts.trunk.dispose(); parts.frond.dispose(); parts.trunkMat.dispose(); parts.frondMat.dispose(); }, [parts]);
  const { trunks, fronds } = useMemo(() => {
    const trunks: THREE.Matrix4[] = [];
    const fronds: THREE.Matrix4[] = [];
    spots.forEach((p, i) => {
      const lean = 0.08 * Math.sin(i * 2.7);
      trunks.push(compose(p.x, p.y, p.z, i * 1.3, 0, lean, p.s));
      const top = new THREE.Vector3(p.x - Math.sin(lean) * 7 * p.s, p.y + 7 * p.s, p.z);
      for (let k = 0; k < 7; k++) fronds.push(compose(top.x, top.y, top.z, (k / 7) * Math.PI * 2 + i, 0, -0.45, p.s));
    });
    return { trunks, fronds };
  }, [spots]);
  return (
    <group>
      <Instances geometry={parts.trunk} material={parts.trunkMat} matrices={trunks} />
      <Instances geometry={parts.frond} material={parts.frondMat} matrices={fronds} />
    </group>
  );
};

// Street lamps on a circle: a slim pole with a glowing head.
const Lamps: React.FC<{ radius: number; count: number; y: number; height?: number; color?: string }> = ({ radius, count, y, height = 4.5, color = '#fff2d6' }) => {
  const parts = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.1, 0.14, height, 5);
    pole.translate(0, height / 2, 0);
    const head = new THREE.BoxGeometry(1.1, 0.25, 0.45);
    head.translate(0.4, height, 0);
    return {
      pole, head,
      poleMat: new THREE.MeshStandardMaterial({ color: '#1c2333', metalness: 0.7, roughness: 0.4 }),
      headMat: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    };
  }, [height, color]);
  useEffect(() => () => { parts.pole.dispose(); parts.head.dispose(); parts.poleMat.dispose(); parts.headMat.dispose(); }, [parts]);
  const matrices = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return compose(Math.cos(a) * radius, y, Math.sin(a) * radius, -a + Math.PI);
  }), [radius, count, y]);
  return (
    <group>
      <Instances geometry={parts.pole} material={parts.poleMat} matrices={matrices} />
      <Instances geometry={parts.head} material={parts.headMat} matrices={matrices} />
    </group>
  );
};

// Dashes round a circle, flat on a surface at height y: lane markings and in-ground lights.
const Dashes: React.FC<{ radius: number; count: number; y: number; size: [number, number]; color: string; glow?: boolean }> = ({ radius, count, y, size, color, glow }) => {
  const parts = useMemo(() => {
    const g = new THREE.PlaneGeometry(size[0], size[1]);
    g.rotateX(-Math.PI / 2);
    const m = glow
      ? new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    return { g, m };
  }, [size, color, glow]);
  useEffect(() => () => { parts.g.dispose(); parts.m.dispose(); }, [parts]);
  const matrices = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    // Long side along the tangent.
    return compose(Math.cos(a) * radius, y, Math.sin(a) * radius, -a + Math.PI / 2);
  }), [radius, count, y]);
  return <Instances geometry={parts.g} material={parts.m} matrices={matrices} />;
};

// A painted line round a circle.
const RingLine: React.FC<{ radius: number; width: number; y: number; color: string; opacity?: number; glow?: boolean }> = ({ radius, width, y, color, opacity = 0.85, glow }) => (
  <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
    <ringGeometry args={[radius - width / 2, radius + width / 2, 96]} />
    <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={!glow} polygonOffset polygonOffsetFactor={-2} />
  </mesh>
);

// Traffic going round a deck: dark cars with white headlights and red tail lights.
const Traffic: React.FC<{ lanes: { radius: number; count: number; speed: number }[]; y: number }> = ({ lanes, y }) => {
  const cars = useMemo(() => lanes.flatMap(l => Array.from({ length: l.count }, (_, i) => ({ radius: l.radius, speed: l.speed, phase: (i / l.count) * Math.PI * 2 + l.radius }))), [lanes]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    cars.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = clock.elapsedTime * c.speed + c.phase;
      g.position.set(Math.cos(a) * c.radius, y, Math.sin(a) * c.radius);
      // Nose (+x) along the direction of travel.
      g.rotation.y = -a - Math.sign(c.speed) * Math.PI / 2;
    });
  });
  return (
    <group>
      {cars.map((c, i) => (
        <group key={i} ref={el => { refs.current[i] = el; }}>
          <mesh position={[0, 0.45, 0]} raycast={noRaycast}>
            <boxGeometry args={[3.2, 0.8, 1.6]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#5a1620' : '#151b29'} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[1.62, 0.5, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.06, 0.2, 1.3]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh position={[-1.62, 0.5, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.06, 0.2, 1.4]} />
            <meshBasicMaterial color="#ff2040" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

interface DeckSpec {
  inner: number;
  outer: number;
  // Height of the road surface.
  height: number;
  // Where its centre sits, relative to the plaza centre.
  at: [number, number];
  pillars: number;
  lanes: { radius: number; count: number; speed: number }[];
}

// Faded: barely there, so units beneath show through.
const FADED = 0.12;

// An elevated ring road on pillars. `faded` (0..1, eased) turns it see-through.
const Deck: React.FC<{ spec: DeckSpec; fade: React.MutableRefObject<number> }> = ({ spec, fade }) => {
  const { inner, outer, height, pillars } = spec;
  const thickness = 1.6;
  const group = useRef<THREE.Group>(null);
  const traffic = useRef<THREE.Group>(null);
  const built = useMemo(() => {
    const deck = deckGeometry(inner, outer, thickness);
    const materials = {
      asphalt: new THREE.MeshStandardMaterial({ color: '#272e3d', metalness: 0.3, roughness: 0.75 }),
      skirt: new THREE.MeshStandardMaterial({ color: '#4a3606', emissive: YELLOW, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
      rim: new THREE.MeshStandardMaterial({ color: '#202634', metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }),
      pillar: new THREE.MeshStandardMaterial({ color: '#2a3140', metalness: 0.6, roughness: 0.5 }),
      glow: new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false }),
      rail: new THREE.MeshBasicMaterial({ color: '#ffe6a0', toneMapped: false }),
    };
    for (const m of Object.values(materials)) m.transparent = true;
    return { deck, materials };
  }, [inner, outer]);
  useEffect(() => () => {
    built.deck.dispose();
    Object.values(built.materials).forEach(m => m.dispose());
  }, [built]);
  // Every material in the deck, plus anything the palms and lamps added, eases to the fade.
  useFrame(() => {
    const opacity = 1 - (1 - FADED) * fade.current;
    const solid = opacity > 0.98;
    group.current?.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m.userData.baseOpacity) m.userData.baseOpacity = m.opacity;
        m.transparent = true;
        m.opacity = m.userData.baseOpacity * opacity;
        m.depthWrite = solid && !(m as THREE.MeshBasicMaterial).map && m.userData.baseOpacity === 1;
      }
    });
    if (traffic.current) traffic.current.visible = opacity > 0.5;
  });
  const { materials } = built;
  const mid = (inner + outer) / 2;
  const palmSpots = useMemo(() => {
    const count = Math.round(outer / 5);
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + 0.2;
      return { x: Math.cos(a) * (inner + 1.4), y: height, z: Math.sin(a) * (inner + 1.4), s: 0.7 };
    });
  }, [inner, outer, height]);
  return (
    <group ref={group} position={[spec.at[0], 0, spec.at[1]]}>
      {/* The road deck, its yellow outer skirt, inner rim and the blue glow underneath. */}
      <mesh geometry={built.deck} material={materials.asphalt} position={[0, height, 0]} raycast={noRaycast} />
      <mesh position={[0, height - 1.1, 0]} material={materials.skirt} raycast={noRaycast}>
        <cylinderGeometry args={[outer + 0.05, outer + 0.05, 2.4, 96, 1, true]} />
      </mesh>
      <mesh position={[0, height - 0.8, 0]} material={materials.rim} raycast={noRaycast}>
        <cylinderGeometry args={[inner - 0.05, inner - 0.05, 1.8, 96, 1, true]} />
      </mesh>
      <mesh position={[0, height - 2.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.glow} raycast={noRaycast}>
        <torusGeometry args={[outer - 0.6, 0.18, 4, 96]} />
      </mesh>
      <mesh position={[0, height - 1.8, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.glow} raycast={noRaycast}>
        <torusGeometry args={[inner + 0.4, 0.15, 4, 96]} />
      </mesh>
      {/* Guard rail along the outer edge. */}
      <mesh position={[0, height + 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.rail} raycast={noRaycast}>
        <torusGeometry args={[outer - 0.3, 0.07, 3, 96]} />
      </mesh>
      {/* Lane markings on the deck. */}
      <RingLine radius={mid} width={0.25} y={height + 0.03} color={YELLOW} />
      <Dashes radius={mid + (outer - inner) / 4} count={Math.round(outer * 1.2)} y={height + 0.03} size={[1.6, 0.18]} color="#e6edf7" />
      <Dashes radius={mid - (outer - inner) / 4} count={Math.round(outer * 1.2)} y={height + 0.03} size={[1.6, 0.18]} color="#e6edf7" />
      {/* Pillars down to the street. */}
      {Array.from({ length: pillars }, (_, i) => {
        const a = (i / pillars) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * mid, (height - thickness) / 2, Math.sin(a) * mid]} material={materials.pillar} raycast={noRaycast}>
            <cylinderGeometry args={[0.9, 1.2, height - thickness, 8]} />
          </mesh>
        );
      })}
      {/* Blue lights set into the deck along its inner edge. */}
      <Dashes radius={inner + 0.5} count={Math.round(inner * 1.1)} y={height + 0.04} size={[0.9, 0.35]} color={BLUE} glow />
      <Lamps radius={outer - 0.8} count={Math.round(outer / 3.5)} y={height} />
      <Palms spots={palmSpots} />
      <group ref={traffic}>
        <Traffic lanes={spec.lanes} y={height} />
      </group>
    </group>
  );
};

const DECKS: DeckSpec[] = [
  // The broad lower tier, reaching out over the streets around the block.
  { inner: 45, outer: 59, height: 8, at: [0, 0], pillars: 14, lanes: [{ radius: 49, count: 7, speed: 0.12 }, { radius: 55, count: 8, speed: -0.1 }] },
  // A narrower tier above it, set off-centre so the two read as stacked.
  { inner: 28, outer: 38, height: 15, at: [5, -4], pillars: 9, lanes: [{ radius: 31, count: 4, speed: -0.16 }, { radius: 35, count: 5, speed: 0.14 }] },
];
const UPPER = DECKS[1];

export const CorpoPlaza: React.FC<{ center: { x: number; z: number }; tileSize: number; offset: number; getUnits: () => UnitData[] }> = ({ center, tileSize, offset, getUnits }) => {
  const cx = center.x * tileSize - offset;
  const cz = center.z * tileSize - offset;
  const fades = useRef(DECKS.map(() => ({ current: 0 })));

  // Fade a deck while any ground unit is under (or right beside) it.
  useFrame((_, delta) => {
    const units = getUnits();
    DECKS.forEach((d, i) => {
      const ox = cx + d.at[0];
      const oz = cz + d.at[1];
      let under = false;
      for (const u of units) {
        if (u.health <= 0 || isAirType(u.type)) continue;
        const r = Math.hypot(u.gridPos.x * tileSize - offset - ox, u.gridPos.z * tileSize - offset - oz);
        if (r > d.inner - 6 && r < d.outer + 6) { under = true; break; }
      }
      const f = fades.current[i];
      const target = under ? 1 : 0;
      f.current += (target - f.current) * Math.min(1, delta * 5);
    });
  });

  const islandPalms = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: Math.cos(a) * 16, y: 0.9, z: Math.sin(a) * 16, s: 1 };
  }), []);

  return (
    <group position={[cx, 0, cz]}>
      {/* Street level: the painted roundabout, laid out right under the upper tier so its yellow
          edge lines trace that deck's edges. */}
      <group position={[UPPER.at[0], 0, UPPER.at[1]]}>
        <RingLine radius={UPPER.inner} width={0.5} y={0.24} color={YELLOW} />
        <RingLine radius={UPPER.outer} width={0.5} y={0.24} color={YELLOW} />
        <Dashes radius={(UPPER.inner + UPPER.outer) / 2} count={44} y={0.24} size={[2.4, 0.3]} color="#e6edf7" />
        <Dashes radius={UPPER.outer + 1} count={36} y={0.25} size={[0.9, 0.5]} color={BLUE} glow />
        {/* Yellow hazard stripes round the inside of the ring. */}
        <Dashes radius={UPPER.inner - 1.5} count={48} y={0.24} size={[1.2, 1.4]} color={YELLOW} />
      </group>
      {/* The island: a low curb with a lit edge, planted with palms, round the server node. */}
      <mesh position={[0, 0.5, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[18.5, 18.5, 0.8, 72, 1, true]} />
        <meshStandardMaterial color="#2b3242" metalness={0.4} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <RingLine radius={18.5} width={0.9} y={0.92} color={YELLOW} opacity={0.95} />
      <RingLine radius={17.6} width={0.3} y={0.93} color={BLUE} opacity={1} glow />
      <Palms spots={islandPalms} />
      <Lamps radius={21} count={12} y={0.2} height={5} />
      {/* The elevated tiers. */}
      {DECKS.map((d, i) => <Deck key={i} spec={d} fade={fades.current[i]} />)}
    </group>
  );
};

export default CorpoPlaza;
