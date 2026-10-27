// A high-explosive blast: shells, rockets, bombs, missiles and anything blown up.
//
// In order, over its life:
//   - a white-hot flash, and a glow on the ground under it, gone in the first fifth of a second;
//   - a ring of dust and pressure racing out along the ground;
//   - a fireball of billowing flame: soft, ragged puffs thrown out and up from the centre, white
//     hot at first, then yellow, orange and a deep red as they cool and fade;
//   - sparks streaking out on falling arcs, and a few dark chunks of debris thrown up that land
//     and lie a moment;
//   - smoke, rising out of the fireball as it dies, lit orange underneath at first, then a dark
//     grey that spreads, climbs and thins away well after the flame is gone;
//   - a scorch mark left on the ground, fading with the smoke.
//
// Flame, sparks and the flash are added light (additive), in colours brighter than white, which the
// post chain's tone mapping rolls off into a hot core. The flame and smoke puffs are flat sprites
// with a soft, cloudy texture, turned to face the camera every frame, drawn as one instanced mesh
// per kind. Nothing here writes depth: a see-through shape that did would hide whatever is drawn
// after it inside its outline, and the ambient occlusion and bloom passes (PostFx.tsx), which read
// depth, would shade and cut out the scene under it.
//
// An explosion `radius` sets the scale: the fireball spreads to about twice it. `duration` is the
// flame's life (at least FLAME_MIN_MS); the smoke and scorch last SMOKE_LIFE times as long, so the
// whole effect lives `fireballLifeMs`.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const FLAME_MIN_MS = 700;
const SMOKE_LIFE = 3.6;
const FLAMES = 11;
const SMOKES = 9;
const SPARKS = 16;
const DEBRIS = 7;
// World units per second squared: a tile (14 units) is about ten metres.
const GRAVITY = 14;

export const flameLifeMs = (duration: number) => Math.max(duration, FLAME_MIN_MS);
export const fireballLifeMs = (duration: number) => flameLifeMs(duration) * SMOKE_LIFE;

// --- Textures, drawn once on a canvas ---

const canvasTexture = (size: number, draw: (g: CanvasRenderingContext2D, size: number) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
const radial = (g: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) => {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};
let textures: { soft: THREE.Texture; cloud: THREE.Texture; scorch: THREE.Texture } | null = null;
const getTextures = () => textures ??= {
  // A round, soft-edged dot: the flash, the ground glow, sparks.
  soft: canvasTexture(64, (g, s) => radial(g, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']])),
  // A puff of cloud: many soft blobs heaped round the middle, clipped to a soft round edge, so
  // its outline is ragged and its inside lumpy.
  cloud: canvasTexture(128, (g, s) => {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() ** 1.5 * s * 0.3;
      const r = s * (0.08 + Math.random() * 0.16);
      const alpha = 0.08 + Math.random() * 0.3;
      radial(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, [[0, `rgba(255,255,255,${alpha})`], [1, 'rgba(255,255,255,0)']]);
    }
    g.globalCompositeOperation = 'destination-in';
    radial(g, s / 2, s / 2, s / 2, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0)']]);
  }),
  // Burnt ground: a dark blotch, darkest in the middle, with blackened streaks thrown outward.
  scorch: canvasTexture(128, (g, s) => {
    radial(g, s / 2, s / 2, s * 0.4, [[0, 'rgba(0,0,0,0.95)'], [0.45, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
    // Streaks thrown out from the middle, each a run of fading blobs.
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, len = s * (0.25 + Math.random() * 0.2);
      for (let d = s * 0.15; d < len; d += s * 0.025) {
        const k = 1 - d / len;
        radial(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * 0.05 * (0.4 + k), [[0, `rgba(0,0,0,${0.22 * k})`], [1, 'rgba(0,0,0,0)']]);
      }
    }
  }),
};

// --- Materials shared by every blast; anything that fades as a whole has its own ---

// Per-sprite opacity for the smoke: an `aAlpha` attribute on the instanced geometry.
const withInstanceAlpha = (m: THREE.MeshBasicMaterial) => {
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  m.customProgramCacheKey = () => 'instance-alpha';
  return m;
};
let materials: { flame: THREE.MeshBasicMaterial; smoke: THREE.MeshBasicMaterial; spark: THREE.MeshBasicMaterial; debris: THREE.MeshStandardMaterial } | null = null;
const getMaterials = () => materials ??= {
  flame: new THREE.MeshBasicMaterial({ map: getTextures().cloud, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  smoke: withInstanceAlpha(new THREE.MeshBasicMaterial({ map: getTextures().cloud, transparent: true, depthWrite: false })),
  spark: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  debris: new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.9, metalness: 0.2 }),
};
const PLANE = new THREE.PlaneGeometry(1, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(0.93, 1, 64);

// Flame cooling over its life, as added light brighter than white: white hot, yellow, orange, a
// deep red, then nothing.
const FLAME_RAMP: [number, [number, number, number]][] = [
  [0, [5, 4.4, 3.2]], [0.12, [4.2, 2.4, 0.7]], [0.38, [2.2, 0.75, 0.14]], [0.7, [0.75, 0.14, 0.03]], [1, [0, 0, 0]],
];
const ramp = (t: number, out: THREE.Color) => {
  const k = Math.min(1, Math.max(0, t));
  for (let i = 1; i < FLAME_RAMP.length; i++) {
    const [b, cb] = FLAME_RAMP[i];
    if (k <= b) {
      const [a, ca] = FLAME_RAMP[i - 1];
      const f = (k - a) / (b - a);
      return out.setRGB(ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f);
    }
  }
  return out.setRGB(0, 0, 0);
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
// A direction out from the centre, leaning upward by `lift` (0 level, 1 straight up).
const outward = (lift: number) => {
  const a = Math.random() * Math.PI * 2;
  const up = rand(lift * 0.5, lift);
  return new THREE.Vector3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize();
};

interface Puff { dir: THREE.Vector3; reach: number; size: number; start: number; life: number; spin: number; spinRate: number; tint: number }
interface Flying { vel: THREE.Vector3; start: number; life: number; size: number; spin: THREE.Vector3 }

export const FireballFx: React.FC<{ position: { x: number; y: number; z: number }; radius: number; createdAt: number; duration: number }> = ({ position, radius: r, createdAt, duration }) => {
  const camera = useThree(s => s.camera);
  const flame = flameLifeMs(duration) / 1000, total = fireballLifeMs(duration) / 1000;
  const centre = useMemo(() => new THREE.Vector3(position.x, position.y, position.z), [position.x, position.y, position.z]);
  // On or near the ground: it lights, rings and scorches it.
  const grounded = position.y <= r * 1.5;
  const tex = getTextures(), mat = getMaterials();

  // Each blast thrown a little differently.
  const parts = useMemo(() => ({
    flames: Array.from({ length: FLAMES }, (_, i): Puff => ({
      dir: i === 0 ? new THREE.Vector3(0, 1, 0) : outward(grounded ? 0.75 : 0.4), reach: i === 0 ? 0.3 : rand(0.5, 1.3), size: rand(0.9, 1.5),
      start: i === 0 ? 0 : rand(0, 0.22), life: rand(0.55, 1), spin: rand(0, Math.PI * 2), spinRate: rand(-1.2, 1.2), tint: 0,
    })),
    smokes: Array.from({ length: SMOKES }, (): Puff => ({
      dir: outward(grounded ? 0.55 : 0.3), reach: rand(0.4, 1.1), size: rand(1, 1.5),
      start: rand(0.25, 0.6) * flame, life: 0, spin: rand(0, Math.PI * 2), spinRate: rand(-0.35, 0.35), tint: rand(0.75, 1.15),
    })),
    sparks: Array.from({ length: SPARKS }, (): Flying => ({
      vel: outward(grounded ? 0.7 : 0.2).multiplyScalar(r * rand(3.5, 8)), start: rand(0, 0.08), life: rand(0.45, 1.1) * flame, size: rand(0.6, 1.2), spin: new THREE.Vector3(),
    })),
    debris: Array.from({ length: DEBRIS }, (): Flying => ({
      vel: outward(0.8).multiplyScalar(r * rand(2, 4.5)), start: 0, life: total * rand(0.5, 0.8), size: r * rand(0.06, 0.14),
      spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
    })),
  }), [r, flame, total, grounded]);

  // Smoke sprites carry their own opacity (withInstanceAlpha), so they get their own geometry.
  const smokeGeometry = useMemo(() => {
    const g = PLANE.clone();
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(SMOKES), 1));
    return g;
  }, []);
  // What fades as a whole: the flash, the glow on the ground, the shock ring and the scorch.
  const own = useMemo(() => ({
    flash: new THREE.MeshBasicMaterial({ map: tex.soft, color: new THREE.Color(6, 5, 3.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ map: tex.soft, color: new THREE.Color(2.4, 1, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    ring: new THREE.MeshBasicMaterial({ color: '#d8c3a0', transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    scorch: new THREE.MeshBasicMaterial({ map: tex.scorch, color: '#0b0806', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  }), [tex]);
  useEffect(() => () => { smokeGeometry.dispose(); Object.values(own).forEach(m => m.dispose()); }, [smokeGeometry, own]);

  const flameRef = useRef<THREE.InstancedMesh>(null);
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const sparkRef = useRef<THREE.InstancedMesh>(null);
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const scorchRef = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), roll: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(),
    c: new THREE.Color(), z: new THREE.Vector3(0, 0, 1), dir: new THREE.Vector3(), e: new THREE.Euler(),
  }), []);

  // Every sprite starts hidden, with a colour, so none shows at the origin before the first frame
  // and the shaders are built with per-sprite colour from the start.
  useLayoutEffect(() => {
    const none = new THREE.Matrix4().makeScale(0, 0, 0), black = new THREE.Color(0, 0, 0);
    for (const mesh of [flameRef.current, smokeRef.current, sparkRef.current, debrisRef.current]) {
      if (!mesh) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.setMatrixAt(i, none);
        if (mesh !== debrisRef.current) mesh.setColorAt(i, black);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useFrame(() => {
    const t = (Date.now() - createdAt) / 1000;
    const { m, q, roll, p, s, c, z, dir, e } = tmp;
    const hide = (mesh: THREE.InstancedMesh, i: number) => { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); };
    // A sprite at p, `size` across, facing the camera, turned `angle` about the view axis.
    const sprite = (mesh: THREE.InstancedMesh, i: number, size: number, angle: number) => {
      roll.setFromAxisAngle(z, angle);
      q.copy(camera.quaternion).multiply(roll);
      mesh.setMatrixAt(i, m.compose(p, q, s.set(size, size, size)));
    };

    // Flash and the light it throws on the ground.
    const f = clamp01(t / (flame * 0.28));
    if (flashRef.current) {
      const size = r * (1.6 + 2.2 * easeOut(f));
      flashRef.current.quaternion.copy(camera.quaternion);
      flashRef.current.scale.setScalar(size);
      flashRef.current.position.set(centre.x, Math.max(centre.y, size * 0.32), centre.z);
      own.flash.opacity = (1 - f) ** 2;
      flashRef.current.visible = f < 1;
    }
    if (glowRef.current) {
      const g = clamp01(t / (flame * 0.7));
      glowRef.current.scale.setScalar(r * (4 + 2 * g));
      own.glow.opacity = 0.9 * (1 - g) ** 1.5;
      glowRef.current.visible = g < 1;
    }
    // The shock ring along the ground.
    if (ringRef.current) {
      const k = clamp01(t / (flame * 0.45));
      ringRef.current.scale.setScalar(r * (0.6 + 4.4 * easeOut(k)));
      own.ring.opacity = 0.32 * (1 - k) ** 2;
      ringRef.current.visible = k < 1;
    }
    // The scorch: darkens in under the fireball and fades with the last of the smoke.
    if (scorchRef.current) own.scorch.opacity = 0.85 * clamp01(t / (flame * 0.3)) * (1 - clamp01((t - total * 0.55) / (total * 0.45)));

    // Flame.
    const flames = flameRef.current;
    if (flames) {
      parts.flames.forEach((b, i) => {
        const k = (t / flame - b.start) / b.life;
        if (k < 0 || k >= 1) return hide(flames, i);
        const out = easeOut(k);
        p.copy(centre).addScaledVector(b.dir, r * b.reach * out);
        p.y += r * 0.9 * k * k;
        const size = r * b.size * (0.7 + 1.5 * out);
        // Sat on the ground rather than cut off by it.
        p.y = Math.max(p.y, size * 0.3);
        sprite(flames, i, size, b.spin + b.spinRate * t);
        flames.setColorAt(i, ramp(k, c));
      });
      flames.instanceMatrix.needsUpdate = true;
      if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
    }

    // Smoke: rises out of the dying fireball, spreads, climbs and thins away.
    const smokes = smokeRef.current;
    if (smokes) {
      const alpha = smokeGeometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
      parts.smokes.forEach((b, i) => {
        const k = (t - b.start) / (total - b.start);
        if (k < 0 || k >= 1) { alpha.setX(i, 0); return hide(smokes, i); }
        const out = easeOut(k);
        p.copy(centre).addScaledVector(b.dir, r * b.reach * (0.4 + out));
        p.y += r * (0.6 + 2.6 * Math.sqrt(k));
        const size = r * b.size * (1.3 + 2.4 * out);
        p.y = Math.max(p.y, size * 0.3);
        sprite(smokes, i, size, b.spin + b.spinRate * t);
        // Lit by the flame below at first, a sooty brown, then a dark grey.
        const warm = clamp01(1 - k * 6);
        smokes.setColorAt(i, c.setRGB((0.075 + 0.2 * warm) * b.tint, (0.072 + 0.07 * warm) * b.tint, (0.07 + 0.01 * warm) * b.tint));
        alpha.setX(i, clamp01(k * 6) * (1 - k) ** 1.1);
      });
      alpha.needsUpdate = true;
      smokes.instanceMatrix.needsUpdate = true;
      if (smokes.instanceColor) smokes.instanceColor.needsUpdate = true;
    }

    // Sparks: thin streaks along their flight, on falling arcs.
    const sparks = sparkRef.current;
    if (sparks) {
      parts.sparks.forEach((b, i) => {
        const age = t - b.start;
        const k = age / b.life;
        if (k < 0 || k >= 1) return hide(sparks, i);
        p.copy(centre).addScaledVector(b.vel, age);
        p.y -= 0.5 * GRAVITY * age * age;
        if (p.y < 0.05) return hide(sparks, i);
        dir.copy(b.vel);
        dir.y -= GRAVITY * age;
        const speed = dir.length();
        q.setFromUnitVectors(z, dir.multiplyScalar(1 / speed));
        const w = 0.09 * b.size * (1 - k);
        sparks.setMatrixAt(i, m.compose(p, q, s.set(w, w, Math.max(w, speed * 0.045))));
        sparks.setColorAt(i, ramp(0.1 + k * 0.9, c));
      });
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }

    // Debris: thrown up tumbling, lands and lies a moment, then is gone.
    const debris = debrisRef.current;
    if (debris) {
      parts.debris.forEach((b, i) => {
        const k = t / b.life;
        if (k >= 1) return hide(debris, i);
        // Time until it comes down to the ground from the blast's height.
        const vy = b.vel.y, h = centre.y;
        const land = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;
        const flying = Math.min(t, land);
        p.copy(centre).addScaledVector(b.vel, flying);
        p.y = Math.max(b.size / 2, h + vy * flying - 0.5 * GRAVITY * flying * flying);
        e.set(b.spin.x * flying, b.spin.y * flying, b.spin.z * flying);
        q.setFromEuler(e);
        const shrink = 1 - clamp01((k - 0.8) / 0.2);
        debris.setMatrixAt(i, m.compose(p, q, s.set(b.size * shrink, b.size * 0.7 * shrink, b.size * 1.3 * shrink)));
      });
      debris.instanceMatrix.needsUpdate = true;
    }
  });

  // Drawn back to front: scorch and ground light, smoke, then flame and sparks over it.
  return (
    <group>
      {grounded && (
        <>
          <mesh ref={scorchRef} geometry={PLANE} material={own.scorch} position={[centre.x, 0.06, centre.z]} rotation={[-Math.PI / 2, 0, 0]} scale={r * 3.4} raycast={() => null} renderOrder={1} />
          <mesh ref={glowRef} geometry={PLANE} material={own.glow} position={[centre.x, 0.1, centre.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2} />
          <mesh ref={ringRef} geometry={RING} material={own.ring} position={[centre.x, 0.14, centre.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2} />
        </>
      )}
      <instancedMesh ref={debrisRef} args={[BOX, mat.debris, DEBRIS]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={smokeRef} args={[smokeGeometry, mat.smoke, SMOKES]} frustumCulled={false} raycast={() => null} renderOrder={3} />
      <instancedMesh ref={flameRef} args={[PLANE, mat.flame, FLAMES]} frustumCulled={false} raycast={() => null} renderOrder={4} />
      <instancedMesh ref={sparkRef} args={[BOX, mat.spark, SPARKS]} frustumCulled={false} raycast={() => null} renderOrder={4} />
      <mesh ref={flashRef} geometry={PLANE} material={own.flash} position={centre} raycast={() => null} renderOrder={5} />
    </group>
  );
};
