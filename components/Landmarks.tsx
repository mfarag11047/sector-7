// The corporate arcologies at the heart of the city (sim/mapgen.ts places their lots).
//
// Four megatowers ring the central server node, each a different corp with its own silhouette:
//   - Tokugen: a defence giant's fortress after Militech's tower: a massive slab with a service
//     tower bolted on, ribbed floors jutting from its front and green neon throughout.
//   - Nexum: a dark concrete slab after Petrochem's tower: fluted stepped ribs, a ribbed tower
//     behind, louvres down the middle between holo-advert strips, its emblem in neon.
//   - Axiom: twin spires joined by a sky bridge, a beam of blue light from the roof and a
//     giant holographic koi circling between them.
//   - Vanta: an ominous dark slate monolith after Arasaka Tower, its foot flared into
//     buttresses, a white emblem near its top and its orange holographic koi circling it.
// Around them aerodynes cruise in loops above the streets.
//
// Everything is plain geometry with canvas-drawn textures (windows, signs, adverts), so nothing
// is fetched. Nothing here is interactive: the lots are solid ground the sim already routes
// around.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Landmark, LandmarkKind } from '../sim/mapgen';
import { seededRandom } from '../sim/mapgen';

// --- Canvas textures ---

// Lit office windows on a dark facade. `palette` weights the colours of lit windows.
function windowTexture(seed: number, palette: string[], litShare = 0.45, accent?: { color: string; share: number }) {
  const rng = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, 128, 256);
  const cols = 8;
  const rows = 20;
  const cw = 128 / cols;
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    // Whole floors dark or lit together now and then, like the reference skylines.
    const floorMood = rng();
    const floorLit = floorMood < 0.15 ? 0.04 : floorMood > 0.92 ? 0.85 : litShare;
    const floorAccent = accent && rng() < accent.share;
    for (let c = 0; c < cols; c++) {
      if (rng() > floorLit) continue;
      ctx.globalAlpha = 0.35 + rng() * 0.5;
      ctx.fillStyle = floorAccent ? accent!.color : palette[Math.floor(rng() * palette.length)];
      ctx.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 5);
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Neon lettering: a glowing wordmark on a transparent background.
function signTexture(text: string, color: string, opts: { vertical?: boolean; emblem?: boolean } = {}) {
  const canvas = document.createElement('canvas');
  const vertical = !!opts.vertical;
  canvas.width = vertical ? 128 : 512;
  canvas.height = vertical ? 512 : (opts.emblem ? 384 : 128);
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glowText = (t: string, x: number, y: number, size: number) => {
    ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    for (const blur of [28, 14, 4]) {
      ctx.shadowBlur = blur;
      ctx.lineWidth = 5;
      ctx.strokeText(t, x, y);
    }
    ctx.shadowBlur = 8;
    ctx.fillText(t, x, y);
  };
  if (vertical) {
    const letters = text.split('');
    const step = 512 / (letters.length + 1);
    letters.forEach((l, i) => glowText(l, 64, step * (i + 1), 78));
  } else if (opts.emblem) {
    // An original emblem: a hexagon split by a chevron, above the wordmark.
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    for (const blur of [30, 12, 3]) {
      ctx.shadowBlur = blur;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = 256 + Math.cos(a) * 105;
        const y = 130 + Math.sin(a) * 105;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.moveTo(166, 82); ctx.lineTo(256, 160); ctx.lineTo(346, 82);
      ctx.moveTo(190, 205); ctx.lineTo(256, 150); ctx.lineTo(322, 205);
      ctx.stroke();
    }
    glowText(text, 256, 320, 82);
  } else {
    glowText(text, 256, 64, 92);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A holo-advert: coloured panels and blocky glyph columns that scroll upward.
function advertTexture(seed: number, colors: string[]) {
  const rng = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#020409';
  ctx.fillRect(0, 0, 64, 512);
  let y = 0;
  while (y < 512) {
    const h = 30 + rng() * 90;
    const c = colors[Math.floor(rng() * colors.length)];
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, c);
    grad.addColorStop(1, '#020409');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = grad;
    ctx.fillRect(4, y + 3, 56, h - 6);
    // Glyphs: little bright blocks in a column, like signage characters.
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    for (let gy = y + 10; gy < y + h - 12; gy += 14) {
      if (rng() < 0.3) continue;
      const gx = 12 + Math.floor(rng() * 3) * 14;
      ctx.fillRect(gx, gy, 10 + rng() * 6, 3);
      ctx.fillRect(gx + 4, gy - 3, 3, 9);
    }
    y += h;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft round glow, for halos behind neon.
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Textures and materials are made once for the whole skyline and freed with it.
function useDisposable<T extends { dispose: () => void }>(make: () => T[], deps: React.DependencyList): T[] {
  const items = useMemo(make, deps);
  useEffect(() => () => items.forEach(i => i.dispose()), [items]);
  return items;
}

// --- Building blocks ---

const ROOF = new THREE.MeshStandardMaterial({ color: '#0a0d16', metalness: 0.7, roughness: 0.5 });
const FRAME = new THREE.MeshStandardMaterial({ color: '#141a28', metalness: 0.85, roughness: 0.35 });

// A tower block with lit windows on its sides and a dark roof. Window size stays the same
// whatever the block's dimensions.
const WindowBlock: React.FC<{ size: [number, number, number]; position: [number, number, number]; tex: THREE.Texture; tint?: string }> = ({ size, position, tex, tint = '#ffffff' }) => {
  const [w, h, d] = size;
  const materials = useMemo(() => {
    const side = (span: number) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(span / 30, h / 60);
      return new THREE.MeshStandardMaterial({
        color: '#0d1220', map: t, emissiveMap: t, emissive: tint, emissiveIntensity: 0.9,
        metalness: 0.55, roughness: 0.32,
      });
    };
    const x = side(d);
    const z = side(w);
    return [x, x, ROOF, ROOF, z, z];
  }, [tex, w, h, d, tint]);
  useEffect(() => () => {
    for (const m of new Set(materials)) {
      if (m === ROOF) continue;
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  }, [materials]);
  return (
    <mesh position={position} material={materials} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
};

// A bright neon tube.
const Neon: React.FC<{ size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number] }> = ({ size, position, color, rotation }) => (
  <mesh position={position} rotation={rotation} raycast={() => null}>
    <boxGeometry args={size} />
    <meshBasicMaterial color={color} toneMapped={false} />
  </mesh>
);

// A neon outline around a w x d rectangle at height y.
const NeonFrame: React.FC<{ w: number; d: number; y: number; color: string; thickness?: number }> = ({ w, d, y, color, thickness = 0.6 }) => (
  <group>
    <Neon size={[w + thickness, thickness, thickness]} position={[0, y, d / 2]} color={color} />
    <Neon size={[w + thickness, thickness, thickness]} position={[0, y, -d / 2]} color={color} />
    <Neon size={[thickness, thickness, d + thickness]} position={[w / 2, y, 0]} color={color} />
    <Neon size={[thickness, thickness, d + thickness]} position={[-w / 2, y, 0]} color={color} />
  </group>
);

// A neon sign: the lettering plus a soft halo behind it, on one face.
const Sign: React.FC<{ tex: THREE.Texture; glow: THREE.Texture; color: string; size: [number, number]; position: [number, number, number]; rotationY?: number }> = ({ tex, glow, color, size, position, rotationY = 0 }) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    <mesh position={[0, 0, 0.3]} raycast={() => null}>
      <planeGeometry args={[size[0] * 1.5, size[1] * 1.9]} />
      <meshBasicMaterial map={glow} color={color} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0, 0.6]} raycast={() => null}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>
);

// A red aircraft-warning light that blinks.
const Beacon: React.FC<{ position: [number, number, number]; glow: THREE.Texture; phase?: number }> = ({ position, glow, phase = 0 }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.visible = Math.sin(clock.elapsedTime * 3 + phase) > -0.2;
  });
  return (
    <group ref={ref} position={position}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.8, 8, 6]} />
        <meshBasicMaterial color="#ff2a2a" toneMapped={false} />
      </mesh>
      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={glow} color="#ff3030" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
};

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    // Bright at the source, fading out toward the sky, with a slow shimmer running up it.
    float fade = pow(1.0 - vUv.y, 1.4);
    float shimmer = 0.85 + 0.15 * sin(vUv.y * 40.0 - uTime * 3.0);
    float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = fade * shimmer * (0.35 + 0.65 * edge) * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// A column of light into the sky. `sweep` swings it around like a searchlight.
const SkyBeam: React.FC<{ position: [number, number, number]; color: string; radius: number; length: number; tilt?: number; sweep?: number; strength?: number }> = ({ position, color, radius, length, tilt = 0, sweep = 0, strength = 0.8 }) => {
  const ref = useRef<THREE.Group>(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
  }), [color, strength]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    if (ref.current && sweep) ref.current.rotation.y = clock.elapsedTime * sweep;
  });
  return (
    <group ref={ref} position={position}>
      <group rotation={[0, 0, tilt]}>
        <mesh position={[0, length / 2, 0]} material={material} raycast={() => null} frustumCulled={false} renderOrder={6}>
          <cylinderGeometry args={[radius * 2.2, radius, length, 20, 1, true]} />
        </mesh>
      </group>
    </group>
  );
};

// A giant holographic koi swimming in a circle: a translucent body with a wireframe skin and a
// long trailing fan of tail and fins that ripple as it swims.
const HoloKoi: React.FC<{ center: [number, number, number]; radius: number; length: number; color: string; speed: number; phase?: number; bob?: number }> = ({ center, radius, length, color, speed, phase = 0, bob = 6 }) => {
  const ref = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const body = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [color]);
  const skin = useMemo(() => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [color]);
  const fin = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [color]);
  useEffect(() => () => { body.dispose(); skin.dispose(); fin.dispose(); }, [body, skin, fin]);
  // Long thin fan strands for the tail.
  const strands = useMemo(() => Array.from({ length: 11 }, (_, i) => ({ angle: (i - 5) * 0.1, len: length * (0.6 + 0.3 * Math.cos((i - 5) * 0.35)) })), [length]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase;
    if (ref.current) {
      ref.current.position.set(center[0] + Math.cos(t) * radius, center[1] + Math.sin(t * 2.3) * bob, center[2] + Math.sin(t) * radius);
      // Face along the circle (the fish's nose points down +x).
      ref.current.rotation.y = -t - Math.PI / 2 * Math.sign(speed);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 2.2 + phase) * 0.35;
  });
  const L = length;
  return (
    <group ref={ref}>
      <mesh scale={[L * 0.5, L * 0.16, L * 0.13]} material={body} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      <mesh scale={[L * 0.505, L * 0.165, L * 0.135]} material={skin} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 18, 6]} />
      </mesh>
      {/* Pectoral and pelvic fins hanging below, and a dorsal fin along the back. */}
      {[[0.15, 1], [0.15, -1], [-0.12, 1], [-0.12, -1]].map(([x, side], i) => (
        <mesh key={i} position={[L * x, -L * 0.2, side * L * 0.1]} rotation={[side * 0.5, 0, -0.3]} material={fin} raycast={() => null} frustumCulled={false}>
          <planeGeometry args={[L * 0.14, L * 0.32]} />
        </mesh>
      ))}
      <mesh position={[-L * 0.05, L * 0.24, 0]} material={fin} raycast={() => null} frustumCulled={false}>
        <planeGeometry args={[L * 0.5, L * 0.12]} />
      </mesh>
      <group ref={tail} position={[-L * 0.45, 0, 0]}>
        {strands.map((s, i) => (
          <mesh key={i} rotation={[0, 0, s.angle]} position={[-s.len / 2 * Math.cos(s.angle), -s.len / 2 * Math.sin(s.angle), 0]} material={fin} raycast={() => null} frustumCulled={false}>
            <planeGeometry args={[s.len, L * 0.035]} />
          </mesh>
        ))}
        {strands.map((s, i) => (
          <mesh key={`v${i}`} rotation={[Math.PI / 2, 0, s.angle]} position={[-s.len / 2 * Math.cos(s.angle), -s.len / 2 * Math.sin(s.angle), 0]} material={fin} raycast={() => null} frustumCulled={false}>
            <planeGeometry args={[s.len, L * 0.035]} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// A tall holo-billboard whose content scrolls.
const Billboard: React.FC<{ tex: THREE.Texture; size: [number, number]; position: [number, number, number]; rotationY?: number; speed?: number }> = ({ tex, size, position, rotationY = 0, speed = 0.03 }) => {
  const own = useMemo(() => { const t = tex.clone(); t.needsUpdate = true; return t; }, [tex]);
  useEffect(() => () => own.dispose(), [own]);
  useFrame((_, delta) => { own.offset.y = (own.offset.y + delta * speed) % 1; });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 0.2]} raycast={() => null}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={own} toneMapped={false} />
      </mesh>
      <Neon size={[size[0] + 0.8, 0.5, 0.5]} position={[0, size[1] / 2, 0.2]} color="#9ff6ff" />
      <Neon size={[size[0] + 0.8, 0.5, 0.5]} position={[0, -size[1] / 2, 0.2]} color="#9ff6ff" />
    </group>
  );
};

// --- The four towers ---

interface Kit {
  glow: THREE.Texture;
  windows: Record<'cool' | 'warm' | 'red' | 'amber' | 'green', THREE.Texture>;
  signs: Record<LandmarkKind, THREE.Texture>;
  verticalSigns: Record<'axiom' | 'vanta' | 'tokugen', THREE.Texture>;
  adverts: THREE.Texture[];
}

// Tokugen: a defence giant's fortress, after Night City's Militech tower. A massive dark slab
// with a tall narrow service tower bolted to one side, a green neon strip running its full height;
// the wordmark across a band high on the main block under a crown of dotted windows and a steel
// lattice; ribbed floors jutting out across the middle of the front between green brackets;
// banks of vertical green tubes low down; stacked outboard modules hung off the far flank.
const Tokugen: React.FC<{ kit: Kit }> = ({ kit }) => {
  const green = '#8dff7a';
  const ribs = [92, 106, 120];
  return (
    <group>
      <WindowBlock size={[64, 10, 64]} position={[0, 5, 0]} tex={kit.windows.green} />
      <NeonFrame w={64} d={64} y={10.2} color={green} />
      {/* The main slab, and its crown of dotted windows above the wordmark band. */}
      <WindowBlock size={[44, 150, 34]} position={[-6, 85, 0]} tex={kit.windows.green} />
      <WindowBlock size={[38, 24, 30]} position={[-8, 172, 0]} tex={kit.windows.green} tint="#d9ffd2" />
      <mesh position={[-6, 160.6, 0]} material={FRAME}><boxGeometry args={[46, 1.2, 36]} /></mesh>
      {/* The tall service tower on the near flank, a green strip the whole way up its front. */}
      <WindowBlock size={[14, 206, 28]} position={[23, 113, -1]} tex={kit.windows.green} />
      {[19.5, 26.5].map(x => <Neon key={x} size={[0.9, 196, 0.6]} position={[x, 112, 13.3]} color={green} />)}
      <Neon size={[0.9, 196, 0.6]} position={[23, 112, -15.3]} color={green} />
      {/* Ribbed floors jutting from the middle of the front, between green brackets. */}
      {ribs.map(y => (
        <group key={y} position={[-6, y, 19]}>
          <WindowBlock size={[30, 8, 6]} position={[0, 0, 0]} tex={kit.windows.green} tint="#e8ffe2" />
          <mesh position={[0, -4.4, 0.4]} material={FRAME}><boxGeometry args={[32, 0.8, 7]} /></mesh>
          {[-15.6, 15.6].map(x => <Neon key={x} size={[0.7, 9, 0.7]} position={[x, 0, 3.2]} color={green} />)}
        </group>
      ))}
      {/* Banks of vertical green tubes low on the front. */}
      {[-24, -20.5, -17, -13.5].map(x => <Neon key={x} size={[0.6, 44, 0.6]} position={[x, 36, 17.4]} color={green} />)}
      {[2, 5.5].map(x => <Neon key={x} size={[0.6, 70, 0.6]} position={[x, 50, 17.4]} color={green} />)}
      {/* Stacked outboard modules hung off the far flank. */}
      {[30, 54, 78, 102, 126].map((y, i) => (
        <group key={y} position={[-31, y, i % 2 ? 4 : -4]}>
          <WindowBlock size={[6, 16, 22]} position={[0, 0, 0]} tex={kit.windows.green} />
          <Neon size={[0.5, 0.5, 22.2]} position={[-3.1, 8.2, 0]} color={green} />
        </group>
      ))}
      {/* A steel lattice on the roof of the service tower, and a mast. */}
      <group position={[23, 216, -1]}>
        {[[-6, -12], [6, -12], [-6, 12], [6, 12]].map(([x, z], i) => (
          <mesh key={i} position={[x, 6, z]} material={FRAME}><boxGeometry args={[0.6, 12, 0.6]} /></mesh>
        ))}
        {[0, 12].map(y => (
          <group key={y}>
            <mesh position={[0, y, -12]} material={FRAME}><boxGeometry args={[12.6, 0.5, 0.5]} /></mesh>
            <mesh position={[0, y, 12]} material={FRAME}><boxGeometry args={[12.6, 0.5, 0.5]} /></mesh>
            <mesh position={[-6, y, 0]} material={FRAME}><boxGeometry args={[0.5, 0.5, 24.6]} /></mesh>
            <mesh position={[6, y, 0]} material={FRAME}><boxGeometry args={[0.5, 0.5, 24.6]} /></mesh>
          </group>
        ))}
        {[-12, 12].map(z => <mesh key={z} position={[0, 6, z]} rotation={[0, 0, 1.1]} material={FRAME}><boxGeometry args={[0.4, 13.5, 0.4]} /></mesh>)}
      </group>
      <mesh position={[-14, 196, 0]} material={FRAME}><cylinderGeometry args={[0.5, 1, 24, 6]} /></mesh>
      <Beacon position={[-14, 208.5, 0]} glow={kit.glow} />
      <Beacon position={[23, 229, -1]} glow={kit.glow} phase={1.3} />
      {/* The wordmark across the band high on the main slab, front and back. */}
      <Sign tex={kit.signs.tokugen} glow={kit.glow} color={green} size={[32, 8]} position={[-6, 150, 17.1]} />
      <Sign tex={kit.signs.tokugen} glow={kit.glow} color={green} size={[32, 8]} position={[-6, 150, -17.1]} rotationY={Math.PI} />
      <Sign tex={kit.verticalSigns.tokugen} glow={kit.glow} color={green} size={[6, 24]} position={[30.1, 150, -1]} rotationY={Math.PI / 2} />
    </group>
  );
};

// Nexum: an energy giant's headquarters, after Night City's Petrochem tower. A dark grey concrete
// slab with fluted, stepped ribs up its corners and a taller ribbed tower rising behind; high on
// its front a dark recessed panel carries the emblem under a heavy ledge; down the middle a
// column of dark louvres over a glass grid, flanked by two tall holo-advert strips; rows of vent
// slits; the emblem again in neon at the foot.

// Dark concrete: tall plates, faint vertical fluting, weathering streaks.
function concreteTexture(slits: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let seed = slits ? 77 : 61;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#44474e';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = x % 32 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 3, 256); }
  for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(40,40,44,0.12)'; g.fillRect(rnd() * 256, 0, 2 + rnd() * 6, 60 + rnd() * 196); }
  g.fillStyle = 'rgba(30,30,34,0.35)';
  g.fillRect(0, 127, 256, 2);
  if (slits) {
    // Vertical rows of small vent slits.
    for (const x of [40, 120, 200]) for (let y = 10; y < 250; y += 9) { g.fillStyle = 'rgba(15,15,18,0.75)'; g.fillRect(x, y, 14, 3); }
    for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(255,220,180,0.55)'; g.fillRect(Math.floor(rnd() * 3) * 80 + 40, rnd() * 250, 14, 3); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Dark louvres: horizontal slats with a faint glow between.
function louvreTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#121418';
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 6) { g.fillStyle = '#2a2d33'; g.fillRect(0, y, 64, 3); g.fillStyle = 'rgba(255,140,100,0.12)'; g.fillRect(0, y + 3, 64, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const Nexum: React.FC<{ kit: Kit }> = ({ kit }) => {
  const neon = '#ff7a5a';
  const [plain, slitted, louvre] = useDisposable(() => [concreteTexture(false), concreteTexture(true), louvreTexture()], []);
  const mats = useMemo(() => {
    const tiled = (t: THREE.Texture, rx: number, ry: number) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; };
    return {
      slab: new THREE.MeshStandardMaterial({ map: tiled(slitted, 2, 6), color: '#ffffff', metalness: 0.2, roughness: 0.75 }),
      rib: new THREE.MeshStandardMaterial({ map: tiled(plain, 0.3, 6), color: '#c8cad0', metalness: 0.2, roughness: 0.7 }),
      tower: new THREE.MeshStandardMaterial({ map: tiled(slitted, 1, 7), color: '#a9abb1', metalness: 0.25, roughness: 0.7 }),
      louvre: new THREE.MeshStandardMaterial({ map: tiled(louvre, 2, 6), color: '#ffffff', metalness: 0.5, roughness: 0.5, emissive: '#2a0f08', emissiveIntensity: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: '#16181d', metalness: 0.6, roughness: 0.45 }),
    };
  }, [plain, slitted, louvre]);
  useEffect(() => () => { for (const m of Object.values(mats)) { m.map?.dispose(); m.dispose(); } }, [mats]);
  const B: React.FC<{ size: [number, number, number]; position: [number, number, number]; m: keyof typeof mats }> = ({ size, position, m }) => (
    <mesh position={position} material={mats[m]} castShadow receiveShadow><boxGeometry args={size} /></mesh>
  );
  return (
    <group>
      <B size={[62, 8, 62]} position={[0, 4, 0]} m="dark" />
      <NeonFrame w={62} d={62} y={8.2} color={neon} thickness={0.35} />
      {/* The taller ribbed tower rising behind. */}
      <B size={[22, 218, 24]} position={[14, 117, -12]} m="tower" />
      {[8, 14, 20].map(x => <B key={x} size={[1.4, 214, 1.2]} position={[x, 117, 0.6]} m="rib" />)}
      {/* The main slab, its heavy ledge, and the top section above. */}
      <B size={[44, 196, 32]} position={[0, 106, 4]} m="slab" />
      <B size={[47, 3, 35]} position={[0, 160, 4]} m="dark" />
      {/* Fluted, stepped ribs up both front corners. */}
      {[1, -1].map(side => [0, 1, 2].map(k => (
        <B key={`${side}${k}`} size={[2.2, 186 - k * 22, 3]} position={[side * (23.2 - k * 2.4), 101 - k * 11, 18.5 - k * 0.6]} m="rib" />
      )))}
      {/* The recessed dark panel high on the front, with the emblem. */}
      <B size={[30, 32, 1]} position={[0, 182, 20.2]} m="dark" />
      <Sign tex={kit.signs.nexum} glow={kit.glow} color={neon} size={[26, 19.5]} position={[0, 182, 20.4]} />
      {/* On the back, the emblem goes on the ribbed tower, which covers most of the slab's back. */}
      <B size={[18, 24, 1]} position={[14, 196, -24.2]} m="dark" />
      <Sign tex={kit.signs.nexum} glow={kit.glow} color={neon} size={[16, 12]} position={[14, 196, -24.4]} rotationY={Math.PI} />
      {/* Down the middle: dark louvres over a glass grid. */}
      <B size={[12, 42, 1]} position={[0, 132, 20.2]} m="louvre" />
      <WindowBlock size={[12, 80, 1]} position={[0, 70, 20.2]} tex={kit.windows.amber} tint="#ffd9c4" />
      {/* Two tall holo-advert strips either side of it. */}
      <Billboard tex={kit.adverts[0]} size={[5, 120]} position={[-10, 92, 20.3]} speed={0.025} />
      <Billboard tex={kit.adverts[2]} size={[5, 120]} position={[10, 92, 20.3]} speed={0.032} />
      {/* The emblem in neon at the foot, and rooftop plant. */}
      <Sign tex={kit.signs.nexum} glow={kit.glow} color={neon} size={[14, 10.5]} position={[0, 20, 20.6]} />
      <B size={[10, 6, 8]} position={[-10, 207, 6]} m="dark" />
      <B size={[8, 4, 8]} position={[6, 206, 10]} m="dark" />
      <mesh position={[14, 236, -12]} material={FRAME}><cylinderGeometry args={[0.4, 0.9, 20, 6]} /></mesh>
      <Beacon position={[14, 246, -12]} glow={kit.glow} />
      <Beacon position={[-18, 205, 18]} glow={kit.glow} phase={1.7} />
    </group>
  );
};

// Axiom: twin spires on a sky bridge, a blue light column from the roof and a holo koi.
const Axiom: React.FC<{ kit: Kit }> = ({ kit }) => {
  const cyan = '#3ee0ff';
  return (
    <group>
      <WindowBlock size={[64, 12, 64]} position={[0, 6, 0]} tex={kit.windows.cool} />
      <NeonFrame w={64} d={64} y={12.2} color={cyan} />
      <WindowBlock size={[22, 196, 22]} position={[-14, 110, -14]} tex={kit.windows.cool} />
      <WindowBlock size={[20, 160, 20]} position={[15, 92, 15]} tex={kit.windows.cool} />
      {/* Stepped tops. */}
      <WindowBlock size={[16, 18, 16]} position={[-14, 217, -14]} tex={kit.windows.cool} />
      <WindowBlock size={[14, 14, 14]} position={[15, 179, 15]} tex={kit.windows.cool} />
      {/* Sky bridges linking the spires. */}
      {[96, 134].map(y => (
        <group key={y} position={[0.5, y, 0.5]} rotation={[0, -Math.PI / 4, 0]}>
          <mesh material={FRAME}><boxGeometry args={[30, 5, 7]} /></mesh>
          <Neon size={[30, 0.4, 7.4]} position={[0, -2.6, 0]} color={cyan} />
        </group>
      ))}
      {[[-25.2, -2.8], [-2.8, -2.8], [-25.2, -25.2], [-2.8, -25.2]].map(([x, z], i) => (
        <Neon key={i} size={[0.5, 194, 0.5]} position={[x, 110, z]} color={cyan} />
      ))}
      <Sign tex={kit.verticalSigns.axiom} glow={kit.glow} color={cyan} size={[8, 32]} position={[15, 120, 25.1]} />
      <Sign tex={kit.verticalSigns.axiom} glow={kit.glow} color={cyan} size={[8, 32]} position={[25.1, 120, 15]} rotationY={Math.PI / 2} />
      <Sign tex={kit.signs.axiom} glow={kit.glow} color={cyan} size={[20, 5]} position={[-14, 212, -2.9]} />
      <Beacon position={[-14, 228, -14]} glow={kit.glow} />
      <SkyBeam position={[-14, 226, -14]} color="#4fc8ff" radius={4} length={460} strength={0.85} />
      <HoloKoi center={[0, 130, 0]} radius={58} length={78} color="#64d8ff" speed={0.12} bob={10} />
    </group>
  );
};

// Vanta: an ominous corporate monolith after Night City's Arasaka Tower. A sheer dark slate
// shaft whose foot flares out into sloping buttresses, flanked by tall side wings that step in at
// their shoulders, under a notched, stepped crown; thin cold seams run up its panels, and a white
// emblem of its own (a broken ring round a V) glows near the top of its front and back. A tall holo-advert column stands off
// one corner, and its orange holographic koi still circles it.

// Dark slate panels: tall plates with fine joints, a few faint lit slits.
function slateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let seed = 51;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#2c3037';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const shade = 54 + Math.floor(rnd() * 12);
    g.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 8})`;
    g.fillRect(x + 1, 0, 30, 256);
  }
  g.fillStyle = 'rgba(10,12,16,0.8)';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
  for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 1.5);
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(190,215,240,0.35)'; g.fillRect(Math.floor(rnd() * 8) * 32 + 12, rnd() * 240, 6, 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Vanta's own emblem in white light: a ring broken at the bottom, a bold V of two blades rising
// out of the gap, and a small diamond floating in the V.
function vantaEmblemTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.shadowColor = '#cfe6ff';
  g.lineCap = 'round';
  g.lineJoin = 'miter';
  for (const blur of [24, 8, 2]) {
    g.shadowBlur = blur;
    // The ring, open at the bottom.
    g.lineWidth = 11;
    g.beginPath(); g.arc(128, 128, 104, Math.PI / 2 + 0.42, Math.PI / 2 - 0.42 + Math.PI * 2); g.stroke();
    // The V: two tapered blades meeting at the gap.
    g.beginPath(); g.moveTo(52, 62); g.lineTo(80, 62); g.lineTo(128, 196); g.lineTo(116, 214); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(204, 62); g.lineTo(176, 62); g.lineTo(128, 196); g.lineTo(140, 214); g.closePath(); g.fill();
    // The diamond in the V.
    g.beginPath(); g.moveTo(128, 78); g.lineTo(146, 102); g.lineTo(128, 126); g.lineTo(110, 102); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SEAM = new THREE.MeshBasicMaterial({ color: '#b9d6f2', transparent: true, opacity: 0.8, toneMapped: false });

const Vanta: React.FC<{ kit: Kit }> = ({ kit }) => {
  const [slate, emblem] = useDisposable(() => [slateTexture(), vantaEmblemTexture()], []);
  // Slate on every block, its plates lined up with the block's size.
  const slateMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', map: slate, metalness: 0.55, roughness: 0.45 }), [slate]);
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1d22', metalness: 0.6, roughness: 0.5 }), []);
  useEffect(() => () => { slateMat.dispose(); darkMat.dispose(); }, [slateMat, darkMat]);
  const Block: React.FC<{ size: [number, number, number]; position: [number, number, number]; dark?: boolean }> = ({ size, position, dark }) => (
    <mesh position={position} material={dark ? darkMat : slateMat} castShadow receiveShadow><boxGeometry args={size} /></mesh>
  );
  // Seams up the front and back of the shaft.
  const seams = [-11, -5, 4, 10];
  return (
    <group>
      {/* Podium. */}
      <Block size={[66, 8, 66]} position={[0, 4, 0]} dark />
      <NeonFrame w={66} d={66} y={8.2} color="#cfe6ff" thickness={0.35} />
      {/* The flared foot: a square frustum sloping in from the podium to the shaft. */}
      <mesh position={[0, 8 + 45, 0]} rotation={[0, Math.PI / 4, 0]} material={slateMat} castShadow receiveShadow>
        <cylinderGeometry args={[24 * Math.SQRT2, 31 * Math.SQRT2, 90, 4, 1]} />
      </mesh>
      {/* The shaft. */}
      <Block size={[48, 200, 36]} position={[0, 108, 0]} />
      {/* A recessed dark channel down the middle of front and back, stopping short of the emblem. */}
      {[1, -1].map(side => <Block key={side} size={[3, 120, 1]} position={[0, 105, side * 18.2]} dark />)}
      {/* Side wings: tall slabs standing proud of the shaft, stepping in at their shoulders. */}
      {[1, -1].map(side => (
        <group key={side}>
          <Block size={[8, 170, 30]} position={[side * 27, 93, 0]} />
          <Block size={[6, 18, 24]} position={[side * 26, 187, 0]} />
          <Block size={[4, 10, 16]} position={[side * 25, 201, 0]} />
        </group>
      ))}
      {/* The crown: stepped blocks with a notch at the middle of the front. */}
      <Block size={[40, 10, 30]} position={[0, 213, 0]} />
      {[-12, 12].map(x => <Block key={x} size={[12, 8, 24]} position={[x, 222, 0]} />)}
      <Block size={[6, 4, 20]} position={[0, 220, 0]} dark />
      {/* Cold seams up the panels. */}
      {[1, -1].map(side => seams.map(x => (
        <mesh key={`${side}${x}`} position={[x, 110, side * 18.1]} material={SEAM}><boxGeometry args={[0.35, 120 - Math.abs(x) * 3, 0.2]} /></mesh>
      )))}
      {/* The emblem near the top of front and back. */}
      {[1, -1].map(side => (
        <group key={`e${side}`} position={[0, 188, side * 19.2]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <mesh position={[0, 0, 0.2]}><planeGeometry args={[30, 30]} /><meshBasicMaterial map={kit.glow} color="#cfe6ff" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
          <mesh position={[0, 0, 0.4]}><planeGeometry args={[18, 18]} /><meshBasicMaterial map={emblem} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
        </group>
      ))}
      {/* A tall holo-advert column off one front corner, and the name low on the podium. */}
      <Billboard tex={kit.adverts[1]} size={[12, 120]} position={[38, 110, 30]} rotationY={-Math.PI / 4} speed={0.02} />
      <mesh position={[38, 50, 30]} material={darkMat}><boxGeometry args={[1.5, 100, 1.5]} /></mesh>
      <Sign tex={kit.signs.vanta} glow={kit.glow} color="#cfe6ff" size={[24, 6]} position={[0, 14, 30]} />
      <Beacon position={[-12, 227, 0]} glow={kit.glow} phase={0.7} />
      <Beacon position={[12, 227, 0]} glow={kit.glow} phase={2.1} />
      {/* Its orange holographic koi, circling the tower as it always has. */}
      <HoloKoi center={[0, 90, 0]} radius={52} length={56} color="#ff8a4a" speed={-0.15} phase={2} bob={6} />
    </group>
  );
};

const TOWERS: Record<LandmarkKind, React.FC<{ kit: Kit }>> = { tokugen: Tokugen, nexum: Nexum, axiom: Axiom, vanta: Vanta };

// --- Air traffic ---

// Aerodynes looping over the centre at different heights: dark hulls with white headlights and
// red tail lights.
const Aerodynes: React.FC<{ glow: THREE.Texture }> = ({ glow }) => {
  const cars = useMemo(() => {
    const rng = seededRandom(707);
    return Array.from({ length: 14 }, () => ({
      rx: 60 + rng() * 90, rz: 60 + rng() * 90,
      y: 35 + rng() * 45,
      speed: (0.05 + rng() * 0.07) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * Math.PI * 2,
      tilt: rng() * Math.PI,
    }));
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cars.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * c.speed + c.phase;
      // An ellipse turned by `tilt`, so the loops cross each other.
      const ex = Math.cos(a) * c.rx;
      const ez = Math.sin(a) * c.rz;
      const x = ex * Math.cos(c.tilt) - ez * Math.sin(c.tilt);
      const z = ex * Math.sin(c.tilt) + ez * Math.cos(c.tilt);
      const dx = (-Math.sin(a) * c.rx) * Math.cos(c.tilt) - (Math.cos(a) * c.rz) * Math.sin(c.tilt);
      const dz = (-Math.sin(a) * c.rx) * Math.sin(c.tilt) + (Math.cos(a) * c.rz) * Math.cos(c.tilt);
      const dir = Math.sign(c.speed);
      g.position.set(x, c.y + Math.sin(t * 0.7 + c.phase) * 3, z);
      g.rotation.y = Math.atan2(-dz * dir, dx * dir);
    });
  });
  return (
    <group>
      {cars.map((c, i) => (
        <group key={i} ref={el => { refs.current[i] = el; }}>
          <mesh material={FRAME}><boxGeometry args={[5, 1.2, 2.4]} /></mesh>
          <mesh position={[0.4, 0.8, 0]} material={ROOF}><boxGeometry args={[2.4, 0.8, 2]} /></mesh>
          <Neon size={[0.3, 0.3, 2]} position={[2.6, 0, 0]} color="#ffffff" />
          <Neon size={[0.3, 0.3, 2.2]} position={[-2.6, 0, 0]} color="#ff2040" />
          <sprite position={[-3, 0, 0]} scale={[5, 5, 1]}>
            <spriteMaterial map={glow} color="#ff2040" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <sprite position={[3, 0, 0]} scale={[4, 4, 1]}>
            <spriteMaterial map={glow} color="#fff4e0" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
};

// --- The skyline ---

// Towers are modelled at full size and shrunk to fit the game's camera, which flies at 20-340
// units and usually sits around 80: at this scale the tallest roofs are a little over 110.
const TOWER_SCALE = 0.5;
const TOWER_TOP = 230 * TOWER_SCALE;
const LOT_COLORS: Record<LandmarkKind, string> = { tokugen: '#8dff7a', nexum: '#ff7a5a', axiom: '#3ee0ff', vanta: '#cfe6ff' };

// A tower's whole city block: a dark plaza edged in its corp colour, with the tower on it. While
// the camera is down among the floors of a tower, the tower is hidden so it never fills the view.
const LandmarkLot: React.FC<{ position: [number, number, number]; rotationY: number; size: number; color: string; children: React.ReactNode }> = ({ position, rotationY, size, color, children }) => {
  const tower = useRef<THREE.Group>(null);
  const half = size / 2;
  useFrame(({ camera }) => {
    if (!tower.current) return;
    const inside = Math.abs(camera.position.x - position[0]) < half && Math.abs(camera.position.z - position[2]) < half && camera.position.y < TOWER_TOP + 8;
    tower.current.visible = !inside;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.5, 0]} material={ROOF} receiveShadow>
        <boxGeometry args={[size, 1, size]} />
      </mesh>
      <NeonFrame w={size} d={size} y={1.05} color={color} thickness={0.35} />
      <group ref={tower} position={[0, 1, 0]} scale={TOWER_SCALE}>
        {children}
      </group>
    </group>
  );
};

export const Landmarks: React.FC<{ landmarks: Landmark[]; tileSize: number; offset: number }> = ({ landmarks, tileSize, offset }) => {
  const [glow, cool, warm, red, amber, green, sTokugen, sNexum, sAxiom, sVanta, vAxiom, vVanta, vTokugen, ad0, ad1, ad2] = useDisposable(() => [
    glowTexture(),
    windowTexture(11, ['#bfe6ff', '#e8f4ff', '#7fd8ff', '#fff1cf']),
    windowTexture(23, ['#ffd9a0', '#ffc47a', '#fff1cf', '#ff9a5a'], 0.5),
    windowTexture(37, ['#ffe6b0', '#e8f4ff', '#fff1cf'], 0.4, { color: '#ff2a3a', share: 0.18 }),
    windowTexture(41, ['#ffd27a', '#fff1cf', '#ffe6b0'], 0.5),
    windowTexture(53, ['#d9ffd2', '#9dff8a', '#f2fff0'], 0.16),
    signTexture('TOKUGEN', '#8dff7a'),
    signTexture('NEXUM', '#ff7a5a', { emblem: true }),
    signTexture('AXIOM', '#3ee0ff'),
    signTexture('VANTA', '#cfe6ff'),
    signTexture('AXIOM', '#3ee0ff', { vertical: true }),
    signTexture('VANTA', '#ff6a2a', { vertical: true }),
    signTexture('TOKUGEN', '#8dff7a', { vertical: true }),
    advertTexture(5, ['#ff2a8a', '#2ad8ff', '#ffb02a']),
    advertTexture(9, ['#2affc8', '#8a5aff', '#ff4a6a']),
    advertTexture(13, ['#ff7a2a', '#ff2a5a', '#ffd84a']),
  ], []);
  const kit: Kit = useMemo(() => ({
    glow,
    windows: { cool, warm, red, amber, green },
    signs: { tokugen: sTokugen, nexum: sNexum, axiom: sAxiom, vanta: sVanta },
    verticalSigns: { axiom: vAxiom, vanta: vVanta, tokugen: vTokugen },
    adverts: [ad0, ad1, ad2],
  }), [glow, cool, warm, red, amber, green, sTokugen, sNexum, sAxiom, sVanta, vAxiom, vVanta, vTokugen, ad0, ad1, ad2]);

  // The towers face the middle of the map, so their fronts all look onto the central plaza.
  const centre = useMemo(() => {
    if (landmarks.length === 0) return { x: 0, z: 0 };
    return {
      x: landmarks.reduce((s, l) => s + l.center.x, 0) / landmarks.length,
      z: landmarks.reduce((s, l) => s + l.center.z, 0) / landmarks.length,
    };
  }, [landmarks]);

  return (
    <group>
      {landmarks.map(l => {
        const Tower = TOWERS[l.kind];
        const facing = Math.atan2(centre.x - l.center.x, centre.z - l.center.z);
        // Snap to the nearest diagonal-facing quarter turn so the block stays on the grid.
        const ry = Math.round(facing / (Math.PI / 2)) * (Math.PI / 2);
        return (
          <LandmarkLot key={l.id} position={[l.center.x * tileSize - offset, 0, l.center.z * tileSize - offset]} rotationY={ry} size={tileSize * 5 - 2} color={LOT_COLORS[l.kind]}>
            <Tower kit={kit} />
          </LandmarkLot>
        );
      })}
      {landmarks.length > 0 && (
        <group position={[centre.x * tileSize - offset, 0, centre.z * tileSize - offset]}>
          <Aerodynes glow={glow} />
        </group>
      )}
    </group>
  );
};

// Static scenery: memoised so the map re-rendering on every game tick doesn't re-render it.
export default React.memo(Landmarks);
