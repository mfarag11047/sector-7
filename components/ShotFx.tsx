// What a shot looks like in the 3D view (replacing the old shooter-to-target tracer lines).
//
// Every shot flashes at the muzzle. Small arms (rifles, flak) show only that, so firing
// infantry twinkle with gunfire. Heavier weapons also send a visible projectile across to the
// target and burst where it lands:
//   - 'round': a fast, bright slug (Hornet AP rounds, the HQ gun),
//   - 'shell': a glowing cannon shell (tanks, Titans),
//   - 'missile': a small rocket with a flame and a smoke trail (Lancers),
//   - 'rail': a railgun slug (Sentry Turrets): a white-hot dart in a cyan glow, very fast, leaving a
//     straight ion trail and a wake of shock rings that hang and fade, with a cyan muzzle flash and
//     a hard flash where it strikes.
// Purely visual: the sim has already applied the damage.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type ShotKind = 'flash' | 'round' | 'shell' | 'missile' | 'rail';

export interface ShotFxData {
  id: string;
  kind: ShotKind;
  // World positions of the muzzle and the impact.
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  // Muzzle flash size: small for infantry, bigger for vehicles and guns.
  flashSize: number;
  createdAt: number;
}

// Projectile speeds, world units a second.
const SPEED: Record<ShotKind, number> = { flash: Infinity, round: 520, shell: 300, missile: 150, rail: 900 };
const FLASH_MS = 90;
const IMPACT_MS = 180;
// How long a rail shot's trail and shock rings hang in the air after it lands.
const RAIL_TRAIL_MS = 550;
const RAIL_RINGS = 6;

// How long a shot's effect lasts in total, for clearing it away.
export const shotFxLifeMs = (s: ShotFxData) => {
  if (s.kind === 'flash') return FLASH_MS + 20;
  const d = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z);
  return Math.max(FLASH_MS, (d / SPEED[s.kind]) * 1000) + (s.kind === 'rail' ? RAIL_TRAIL_MS : IMPACT_MS) + 20;
};

// A soft round glow for flashes and impacts.
let glow: THREE.CanvasTexture | null = null;
const glowTexture = () => {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.9)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
};

// A spiky star for muzzle flashes.
let star: THREE.CanvasTexture | null = null;
const starTexture = () => {
  if (star) return star;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  g.fillStyle = 'rgba(255,250,220,1)';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 30 : 7;
    const a = (i / 16) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grad;
  g.fillRect(-32, -32, 64, 64);
  star = new THREE.CanvasTexture(c);
  return star;
};

const COLORS: Record<ShotKind, string> = { flash: '#ffd27a', round: '#fff1b0', shell: '#ffb347', missile: '#ff9f43', rail: '#a5f3fc' };

export const ShotFx: React.FC<{ shot: ShotFxData }> = ({ shot }) =>
  shot.kind === 'rail' ? <RailShotFx shot={shot} /> : <BallisticFx shot={shot} />;

const BallisticFx: React.FC<{ shot: ShotFxData }> = ({ shot }) => {
  const flash = useRef<THREE.Sprite>(null);
  const projectile = useRef<THREE.Group>(null);
  const impact = useRef<THREE.Sprite>(null);
  const smoke = useRef<THREE.Group>(null);
  const flightMs = useMemo(() => {
    if (shot.kind === 'flash') return 0;
    const d = Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y, shot.to.z - shot.from.z);
    return (d / SPEED[shot.kind]) * 1000;
  }, [shot]);
  const dir = useMemo(() => new THREE.Vector3(shot.to.x - shot.from.x, shot.to.y - shot.from.y, shot.to.z - shot.from.z).normalize(), [shot]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), [dir]);
  const angle = useMemo(() => Math.random() * Math.PI, []);

  useFrame(() => {
    const age = Date.now() - shot.createdAt;
    if (flash.current) {
      const on = age < FLASH_MS;
      flash.current.visible = on;
      if (on) {
        const s = shot.flashSize * (0.8 + 0.4 * Math.random());
        flash.current.scale.set(s, s, 1);
        (flash.current.material as THREE.SpriteMaterial).rotation = angle + age * 0.01;
      }
    }
    if (shot.kind === 'flash') return;
    const t = flightMs > 0 ? age / flightMs : 1;
    if (projectile.current) {
      projectile.current.visible = t < 1;
      if (t < 1) {
        // Missiles climb a little and dip onto the target; rounds and shells fly flat.
        const arc = shot.kind === 'missile' ? Math.sin(t * Math.PI) * 3 : 0;
        projectile.current.position.set(
          shot.from.x + (shot.to.x - shot.from.x) * t,
          shot.from.y + (shot.to.y - shot.from.y) * t + arc,
          shot.from.z + (shot.to.z - shot.from.z) * t,
        );
      }
    }
    if (smoke.current && projectile.current) {
      // Puffs left behind along the path, fading out.
      smoke.current.children.forEach((puff, i) => {
        const pt = Math.min(1, t) - (i + 1) * 0.08;
        puff.visible = pt > 0 && age < flightMs + 250;
        if (!puff.visible) return;
        puff.position.set(
          shot.from.x + (shot.to.x - shot.from.x) * pt,
          shot.from.y + (shot.to.y - shot.from.y) * pt + Math.sin(pt * Math.PI) * 3,
          shot.from.z + (shot.to.z - shot.from.z) * pt,
        );
        const m = (puff as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = 0.35 * (1 - i / 6) * Math.max(0, 1 - (age - flightMs) / 250);
      });
    }
    if (impact.current) {
      const since = age - flightMs;
      const on = since >= 0 && since < IMPACT_MS;
      impact.current.visible = on;
      if (on) {
        const s = (shot.kind === 'shell' ? 5 : shot.kind === 'missile' ? 4.5 : 2) * (0.6 + since / IMPACT_MS);
        impact.current.scale.set(s, s, 1);
        (impact.current.material as THREE.SpriteMaterial).opacity = 1 - since / IMPACT_MS;
      }
    }
  });

  const color = COLORS[shot.kind];
  return (
    <group>
      <sprite ref={flash} position={[shot.from.x, shot.from.y, shot.from.z]} visible={false} raycast={() => null}>
        <spriteMaterial map={starTexture()} color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      {shot.kind !== 'flash' && (
        <>
          <group ref={projectile} quaternion={quat} visible={false}>
            {shot.kind === 'missile' ? (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                  <cylinderGeometry args={[0.14, 0.14, 1.2, 6]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.4} />
                </mesh>
                <mesh position={[0, 0, -0.9]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                  <coneGeometry args={[0.18, 0.8, 6, 1, true]} />
                  <meshBasicMaterial color="#ffb347" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </mesh>
              </>
            ) : (
              <>
                <mesh raycast={() => null}>
                  <sphereGeometry args={[shot.kind === 'shell' ? 0.45 : 0.18, 8, 6]} />
                  <meshBasicMaterial color={color} toneMapped={false} />
                </mesh>
                {/* A short bright streak behind it. */}
                <mesh position={[0, 0, shot.kind === 'shell' ? -1.2 : -1.6]} raycast={() => null}>
                  <boxGeometry args={[shot.kind === 'shell' ? 0.3 : 0.1, shot.kind === 'shell' ? 0.3 : 0.1, shot.kind === 'shell' ? 2.4 : 3.2]} />
                  <meshBasicMaterial color={color} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </mesh>
              </>
            )}
          </group>
          {shot.kind === 'missile' && (
            <group ref={smoke}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <mesh key={i} visible={false} raycast={() => null}>
                  <sphereGeometry args={[0.35 + i * 0.08, 6, 5]} />
                  <meshBasicMaterial color="#94a3b8" transparent opacity={0.3} depthWrite={false} />
                </mesh>
              ))}
            </group>
          )}
          <sprite ref={impact} position={[shot.to.x, shot.to.y, shot.to.z]} visible={false} raycast={() => null}>
            <spriteMaterial map={glowTexture()} color={shot.kind === 'round' ? '#fff1b0' : '#ff8a3d'} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
        </>
      )}
    </group>
  );
};

// The railgun slug. Its trail runs from the muzzle to the slug and stays behind it; the shock
// rings stand across the path, each appearing as the slug passes and spreading as it fades.
const RAIL = { core: '#f0fdff', glow: '#22d3ee', ring: '#67e8f9' };
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ringGeometry = new THREE.TorusGeometry(0.55, 0.07, 6, 18);

const RailShotFx: React.FC<{ shot: ShotFxData }> = ({ shot }) => {
  const flash = useRef<THREE.Sprite>(null);
  const slug = useRef<THREE.Group>(null);
  const trailCore = useRef<THREE.Mesh>(null);
  const trailGlow = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const impact = useRef<THREE.Sprite>(null);
  const { from, to, length, quat, flightMs } = useMemo(() => {
    const from = new THREE.Vector3(shot.from.x, shot.from.y, shot.from.z), to = new THREE.Vector3(shot.to.x, shot.to.y, shot.to.z);
    const length = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    return { from, to, length, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), flightMs: (length / SPEED.rail) * 1000 };
  }, [shot]);
  const at = useMemo(() => new THREE.Vector3(), []);
  // Each shot's materials fade on their own.
  const mats = useMemo(() => ({
    core: new THREE.MeshBasicMaterial({ color: RAIL.core, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ color: RAIL.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    rings: Array.from({ length: RAIL_RINGS }, () => new THREE.MeshBasicMaterial({ color: RAIL.ring, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })),
  }), []);
  useEffect(() => () => { mats.core.dispose(); mats.glow.dispose(); mats.rings.forEach(m => m.dispose()); }, [mats]);

  useFrame(() => {
    const age = Date.now() - shot.createdAt;
    if (flash.current) {
      const on = age < FLASH_MS * 1.5;
      flash.current.visible = on;
      if (on) {
        const s = shot.flashSize * (1 - age / (FLASH_MS * 1.5) * 0.4) * (0.9 + 0.2 * Math.random());
        flash.current.scale.set(s, s, 1);
      }
    }
    const t = Math.min(1, flightMs > 0 ? age / flightMs : 1);
    at.lerpVectors(from, to, t);
    if (slug.current) {
      slug.current.visible = t < 1;
      slug.current.position.copy(at);
    }
    // The trail: from the muzzle to the slug, fading once it has struck.
    const fade = age < flightMs ? 1 : Math.max(0, 1 - (age - flightMs) / RAIL_TRAIL_MS);
    const len = Math.max(0.01, length * t);
    for (const [mesh, width] of [[trailCore.current, 0.14], [trailGlow.current, 0.7]] as const) {
      if (!mesh) continue;
      mesh.visible = fade > 0;
      mesh.position.lerpVectors(from, at, 0.5);
      mesh.scale.set(width * (0.6 + 0.4 * fade), width * (0.6 + 0.4 * fade), len);
    }
    mats.core.opacity = 0.9 * fade;
    mats.glow.opacity = 0.4 * fade * fade;
    // The shock rings, spread along the path.
    rings.current?.children.forEach((ring, i) => {
      const k = (i + 0.5) / RAIL_RINGS;
      const since = age - flightMs * k;
      const life = RAIL_TRAIL_MS + flightMs * (1 - k);
      ring.visible = since > 0 && since < life;
      if (!ring.visible) return;
      const u = since / life;
      ring.position.lerpVectors(from, to, k);
      ring.scale.setScalar(0.6 + u * 2.6);
      mats.rings[i].opacity = 0.6 * (1 - u) * (1 - u);
    });
    if (impact.current) {
      const since = age - flightMs;
      const on = since >= 0 && since < IMPACT_MS * 1.4;
      impact.current.visible = on;
      if (on) {
        const u = since / (IMPACT_MS * 1.4);
        const s = 7 * (0.5 + u);
        impact.current.scale.set(s, s, 1);
        (impact.current.material as THREE.SpriteMaterial).opacity = 1 - u;
      }
    }
  });

  return (
    <group>
      <sprite ref={flash} position={from} visible={false} raycast={() => null}>
        <spriteMaterial map={starTexture()} color={COLORS.rail} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <group ref={slug} quaternion={quat} visible={false}>
        <mesh geometry={unitBox} scale={[0.26, 0.26, 2.8]} raycast={() => null}>
          <meshBasicMaterial color={RAIL.core} toneMapped={false} />
        </mesh>
        <mesh geometry={unitBox} scale={[0.8, 0.8, 4.2]} raycast={() => null}>
          <meshBasicMaterial color={RAIL.glow} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <sprite scale={[4.5, 4.5, 1]} position={[0, 0, 1]} raycast={() => null}>
          <spriteMaterial map={glowTexture()} color={RAIL.glow} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      </group>
      <mesh ref={trailCore} geometry={unitBox} material={mats.core} quaternion={quat} raycast={() => null} />
      <mesh ref={trailGlow} geometry={unitBox} material={mats.glow} quaternion={quat} raycast={() => null} />
      <group ref={rings}>
        {mats.rings.map((m, i) => <mesh key={i} geometry={ringGeometry} material={m} quaternion={quat} visible={false} raycast={() => null} />)}
      </group>
      <sprite ref={impact} position={to} visible={false} raycast={() => null}>
        <spriteMaterial map={glowTexture()} color={RAIL.core} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
};
