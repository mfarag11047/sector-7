// Draws a model's still parts in a handful of meshes instead of one per part.
//
// A unit model is built from dozens of small kit parts (shapes.tsx: plates, strips, turned
// pieces), seventy to a hundred and more meshes, each its own draw call, twice over with the
// shadow pass. With a big battle on screen that was thousands of draw calls a frame, and the
// renderer's per-object work dominated the frame. Most of those parts never move relative to the
// model: only a few groups turn (wheels, a turret, legs) and a few meshes blink (muzzle flashes).
//
// So the model is watched for a moment after it appears. Then every part that has stayed put is
// merged, one mesh per material (and shadow setting), and the originals are hidden (perf.ts's
// matrix walk then skips them too). Nothing in the model has to say what moves:
//
//   - A part found moving later (its position, rotation or scale, or any of its parents', or its
//     material or shape changing, or it being shown, hidden or removed) puts the model back to
//     its original parts at once, so nothing is ever drawn frozen. The part is remembered as one
//     that moves, and the rest are merged again a moment later.
//   - A part shown or hidden by the model while it is merged is caught as it happens: while
//     merged, an original's `visible` reads false (so nothing draws it) but remembers what the
//     model last set.
//
// Merging is spread over frames (BUDGET_MS a frame for all models), so a hundred units arriving at
// once never stalls a frame. Models with the same parts in the same places (every Trooper of a
// team, say) share their merged meshes.

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// How long a model is watched, still, before its parts are merged.
const SETTLE_FRAMES = 20;
// Merging time allowed per frame, across every model.
const BUDGET_MS = 2;
// A merged model is checked for moving parts every this many frames (each on its own frames, so
// the work is spread): a part that starts to move shows still for at most that long, a few
// hundredths of a second. Being shown or hidden is caught at once.
const CHECK_EVERY = 4;
let nextSlot = 0;
let frameCount = 0;

const NO_RAYCAST = () => {};
const defaultRaycast = THREE.Mesh.prototype.raycast;
const defaultOnBeforeRender = THREE.Object3D.prototype.onBeforeRender;
const defaultOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;

// Parts that have been seen to move, for good.
const moves = new WeakSet<THREE.Object3D>();

interface Snapshot {
  node: THREE.Object3D;
  parent: THREE.Object3D | null;
  v: number[];            // position, quaternion, scale
  visible: boolean;
  material?: THREE.Material | THREE.Material[];
  geometry?: THREE.BufferGeometry;
  // The shape's vertices, by version: a part reshaped in place counts as moving.
  shape?: number;
  // Set while this part is merged.
  held?: Held;
}
const snap = (o: THREE.Object3D, out: number[] = []) => {
  const { position: p, quaternion: q, scale: s } = o;
  out[0] = p.x; out[1] = p.y; out[2] = p.z; out[3] = q.x; out[4] = q.y; out[5] = q.z; out[6] = q.w; out[7] = s.x; out[8] = s.y; out[9] = s.z;
  return out;
};
const same = (o: THREE.Object3D, v: number[]) => {
  const { position: p, quaternion: q, scale: s } = o;
  return p.x === v[0] && p.y === v[1] && p.z === v[2] && q.x === v[3] && q.y === v[4] && q.z === v[5] && q.w === v[6] && s.x === v[7] && s.y === v[8] && s.z === v[9];
};

// Merged meshes shared by models with the same parts in the same places.
const shared = new Map<string, { geometry: THREE.BufferGeometry; users: number }>();
function takeShared(key: string, build: () => THREE.BufferGeometry | null) {
  let e = shared.get(key);
  if (!e) {
    const geometry = build();
    if (!geometry) return null;
    shared.set(key, e = { geometry, users: 0 });
  }
  e.users++;
  return e.geometry;
}
function releaseShared(key: string) {
  const e = shared.get(key);
  if (!e || --e.users > 0) return;
  e.geometry.dispose();
  shared.delete(key);
}

// A merged original: hidden while merged, its `visible` reading false but keeping what the model sets.
interface Held { mesh: THREE.Mesh; wanted: boolean; changed: boolean; raycast: THREE.Mesh['raycast'] }
function hold(mesh: THREE.Mesh, s: State): Held {
  const held: Held = { mesh, wanted: mesh.visible, changed: false, raycast: mesh.raycast };
  Object.defineProperty(mesh, 'visible', {
    configurable: true,
    get: () => false,
    // Shown or hidden by the model: undone at the next frame.
    set: (v: boolean) => { if (v !== held.wanted) { held.wanted = v; held.changed = true; s.dirty = true; } },
  });
  mesh.raycast = NO_RAYCAST;
  return held;
}
function release(held: Held) {
  delete (held.mesh as { visible?: boolean }).visible;
  held.mesh.visible = held.wanted;
  held.mesh.raycast = held.raycast;
}

// What can go into a merged mesh with others: a plain mesh, drawn, not mirrored.
function mergeable(mesh: THREE.Mesh) {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(mesh.material) || !mesh.material || !mesh.geometry?.attributes.position) return false;
  // (Groups in a shape only matter with a list of materials, which isn't merged.)
  if (mesh.geometry.morphAttributes.position) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial || mesh.onBeforeRender !== defaultOnBeforeRender) return false;
  if (mesh.raycast !== defaultRaycast && mesh.raycast.length > 0) return false;   // its own picking
  // A shader of its own may read the part's own coordinates (a capture fill rising up a building),
  // which merging would move; unless the material says that's harmless (the kit's wear grain).
  const mat = mesh.material as THREE.Material;
  if (!mat.userData.mergeSafe && ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.onBeforeCompile !== defaultOnBeforeCompile)) return false;
  return true;
}

type Phase = 'settling' | 'queued' | 'merged';
interface State {
  phase: Phase;
  stillFor: number;
  snaps: Snapshot[];
  // While merged: the parts that went into a merge, and those carrying them up to their carrier,
  // the only ones whose moving would show wrong. (The rest draw themselves.)
  critical: Snapshot[];
  dirty: boolean;
  // Which frames it's checked on while merged.
  slot: number;
  snapped: Set<THREE.Object3D>;
  held: Held[];
  merged: { mesh: THREE.Mesh; key: string }[];
}

const queue: { root: THREE.Group; state: State }[] = [];
// Every model on screen, for checking merges (verifyBatching).
const live = new Map<THREE.Group, State>();

// Whether merging is on (for comparing the two while testing: GAME_CHEATS.batching).
let enabled = true;
export function setBatching(on: boolean) { enabled = on; }

export const Batched: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  const state = useRef<State>({ phase: 'settling', stillFor: 0, snaps: [], critical: [], dirty: false, slot: nextSlot++ % CHECK_EVERY, snapped: new Set(), held: [], merged: [] });

  // After every render of the model: if that changed any part, back to its own parts and watch it
  // again. (A unit re-renders often in a fight; most renders change nothing here.)
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const s = state.current;
    if (s.snaps.length === 0 || changed(s)) { unmerge(root, s); watch(root, s); }
  });
  useEffect(() => {
    const root = ref.current;
    if (root) live.set(root, state.current);
    return () => { if (root) { unmerge(root, state.current); live.delete(root); } };
  }, []);

  useFrame(() => {
    const root = ref.current;
    const s = state.current;
    if (!root) return;
    if (s.phase === 'merged') {
      if (!enabled) { unmerge(root, s); watch(root, s); return; }
      // Off screen, nothing it does shows; it's checked again once it's back.
      if (!s.dirty && ((frameCount + s.slot) % CHECK_EVERY !== 0 || !shown(root))) return;
      if (s.dirty || changedAmong(s.critical)) { unmerge(root, s); watch(root, s); }
      return;
    }
    if (!enabled) return;
    if (s.phase === 'settling') {
      if (changed(s)) { watch(root, s); return; }
      if (++s.stillFor >= SETTLE_FRAMES) { s.phase = 'queued'; queue.push({ root, state: s }); }
    }
  });
  // The first model to draw each frame does the queue's work; the budget is shared by all.
  useFrame(({ gl }) => { const f = gl.info.render.frame; if (f !== lastWorkFrame) { lastWorkFrame = f; frameCount++; work(); } });

  return <group ref={ref}>{children}</group>;
};

const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

let lastWorkFrame = -1;
const stats = { merges: 0, mergeMs: 0 };
function work() {
  const start = performance.now();
  // What's on screen first.
  for (const onScreenOnly of [true, false]) {
    for (let i = 0; i < queue.length && performance.now() - start < BUDGET_MS;) {
      const { root, state } = queue[i];
      if (state.phase !== 'queued' || !root.parent) { queue.splice(i, 1); continue; }
      if (onScreenOnly && !shown(root)) { i++; continue; }
      queue.splice(i, 1);
      const t0 = performance.now();
      if (changed(state)) watch(root, state);
      else { merge(root, state); stats.merges++; stats.mergeMs += performance.now() - t0; }
    }
  }
}

// Note every part's place, and which have moved since last noted. A part known to move isn't
// watched itself (it is never merged, so its moving matters to nothing here), but what rides on it
// is: still relative to it, that can be merged into a mesh that moves with it.
function watch(root: THREE.Group, s: State) {
  for (const n of s.snaps) if (differs(n)) moves.add(n.node);
  s.snaps = [];
  s.snapped.clear();
  const visit = (o: THREE.Object3D) => {
    if (o.userData.batchedMerge) return;
    if (!moves.has(o)) {
      const mesh = o as THREE.Mesh;
      s.snaps.push({ node: o, parent: o.parent, v: snap(o), visible: o.visible, material: mesh.isMesh ? mesh.material : undefined, geometry: mesh.isMesh ? mesh.geometry : undefined, shape: mesh.isMesh ? shapeVersion(mesh) : undefined });
      s.snapped.add(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  s.phase = 'settling';
  s.stillFor = 0;
}

const shapeVersion = (mesh: THREE.Mesh) => (mesh.geometry?.attributes.position as THREE.BufferAttribute | undefined)?.version;

// Whether a part has moved, changed or been shown, hidden or removed since it was noted.
function differs(n: Snapshot) {
  const o = n.node;
  if (o.parent !== n.parent || !same(o, n.v)) return true;
  // A merged original reads hidden; what the model set is in its hold.
  if (n.held ? n.held.changed : o.visible !== n.visible) return true;
  if (n.material) {
    const mesh = o as THREE.Mesh;
    if (mesh.material !== n.material || mesh.geometry !== n.geometry || shapeVersion(mesh) !== n.shape) return true;
  }
  return false;
}

const reasons = new Map<string, number>();
function why(n: Snapshot) {
  const o = n.node, mesh = o as THREE.Mesh;
  const what = o.parent !== n.parent ? 'removed' : !same(o, n.v) ? 'moved' : (n.held ? n.held.changed : o.visible !== n.visible) ? 'shown/hidden' : mesh.material !== n.material ? 'material' : mesh.geometry !== n.geometry ? 'geometry' : 'reshaped';
  let path = ''; for (let p: THREE.Object3D | null = o; p && !p.name.startsWith('unit-'); p = p.parent) path = p.type[0] + path;
  return `${what} ${o.type} ${path.length}`;
}
function changedAmong(snaps: Snapshot[]) {
  for (const n of snaps) if (differs(n)) { const k = why(n); reasons.set(k, (reasons.get(k) || 0) + 1); return true; }
  return false;
}
const changed = (s: State) => changedAmong(s.snaps);

// What a shape's vertices hold (merged shapes must hold the same), worked out once per shape.
const layouts = new WeakMap<THREE.BufferGeometry, string>();
function layout(g: THREE.BufferGeometry) {
  let l = layouts.get(g);
  if (l === undefined) layouts.set(g, l = (g.index ? 'i:' : 'n:') + Object.keys(g.attributes).sort().join(','));
  return l;
}
// A part's place, as a number: to tell whether two models have the same parts in the same places.
function placeHash(m: THREE.Matrix4) {
  let h = 0;
  for (const x of m.elements) h = (Math.imul(h ^ Math.round(x * 1e4), 0x01000193) + 0x9e3779b9) | 0;
  return h >>> 0;
}

function merge(root: THREE.Group, s: State) {
  // Parts that stay put relative to what carries them (the model, or a part that moves: a turret,
  // a wheel, a bobbing hull), each set merged into a mesh carried the same way. Placed by their
  // own transforms down from the carrier, not by world matrices, which aren't kept up to date for
  // anything hidden (perf.ts).
  const groups = new Map<string, { anchor: THREE.Object3D; meshes: THREE.Mesh[]; matrices: THREE.Matrix4[]; sig: string[] }>();
  const walk = (o: THREE.Object3D, anchor: THREE.Object3D, above: THREE.Matrix4 | null) => {
    if (o.userData.batchedMerge) return;
    if (moves.has(o)) {
      for (const c of o.children) walk(c, o, null);
      return;
    }
    if (!s.snapped.has(o) || !o.visible) return;
    o.updateMatrix();
    const rel = above ? new THREE.Matrix4().multiplyMatrices(above, o.matrix) : o.matrix.clone();
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mergeable(mesh) && rel.determinant() > 0) {
      const g = mesh.geometry, mat = mesh.material as THREE.Material;
      const key = `${anchor.id}|${mat.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}|${layout(g)}|${mesh.frustumCulled ? 1 : 0}`;
      let e = groups.get(key);
      if (!e) groups.set(key, e = { anchor, meshes: [], matrices: [], sig: [] });
      e.meshes.push(mesh);
      e.matrices.push(rel);
      e.sig.push(`${g.id}:${placeHash(rel)}`);
    }
    for (const c of o.children) walk(c, anchor, rel);
  };
  for (const c of root.children) walk(c, root, null);

  for (const [key, e] of groups) {
    if (e.meshes.length < 2) continue;
    // Shared by key without the carrier: the same parts in the same places on another model.
    const geoKey = key.slice(key.indexOf('|') + 1) + '#' + e.sig.join(';');

    const geometry = takeShared(geoKey, () => {
      const parts = e.meshes.map((m, i) => {
        const g = m.geometry.clone();
        g.applyMatrix4(e.matrices[i]);
        return g;
      });
      const out = mergeGeometries(parts, false);
      parts.forEach(p => p.dispose());
      if (out) out.computeBoundingSphere();
      return out;
    });
    if (!geometry) continue;
    const first = e.meshes[0];
    const merged = new THREE.Mesh(geometry, first.material);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    merged.frustumCulled = first.frustumCulled;
    merged.layers.mask = first.layers.mask;
    merged.raycast = NO_RAYCAST;
    merged.userData.batchedMerge = true;
    e.anchor.add(merged);
    // Placed now: in a frozen subtree (perf.ts freezeSubtree) the frame's matrix walk won't reach it.
    merged.updateMatrix();
    e.anchor.updateWorldMatrix(true, false);
    merged.matrixWorld.multiplyMatrices(e.anchor.matrixWorld, merged.matrix);
    s.merged.push({ mesh: merged, key: geoKey });
    for (const m of e.meshes) s.held.push(hold(m, s));
  }
  // Their snapshots look to their holds for what the model sets.
  const heldBy = new Map(s.held.map(h => [h.mesh as THREE.Object3D, h]));
  for (const n of s.snaps) n.held = heldBy.get(n.node);
  // What to keep checking: the merged parts and what carries them, up to their carriers.
  const bySnap = new Map(s.snaps.map(n => [n.node, n]));
  const critical = new Set<Snapshot>();
  for (const h of s.held) {
    for (let o: THREE.Object3D | null = h.mesh; o && o !== root && !moves.has(o); o = o.parent) {
      const n = bySnap.get(o);
      if (!n || critical.has(n)) break;
      critical.add(n);
    }
  }
  s.critical = [...critical];
  s.dirty = false;
  // Only needed while choosing what to merge.
  s.snapped.clear();
  s.phase = 'merged';
}

function unmerge(root: THREE.Group, s: State) {
  for (const h of s.held) { if (h.changed) moves.add(h.mesh); release(h); }
  s.held = [];
  s.critical = [];
  s.dirty = false;
  for (const n of s.snaps) n.held = undefined;
  for (const { mesh, key } of s.merged) { mesh.parent?.remove(mesh); releaseShared(key); }
  s.merged = [];
  if (s.phase === 'queued') { const i = queue.findIndex(q => q.state === s); if (i >= 0) queue.splice(i, 1); }
  s.phase = 'settling';
}

// What a model draws, per material and shadow setting: triangles, and the sum of their corners in
// world space.
function drawn(root: THREE.Object3D) {
  const out = new Map<string, { tris: number; sum: [number, number, number] }>();
  const v = new THREE.Vector3();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      mesh.updateWorldMatrix(true, false);
      const key = `${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}`;
      let e = out.get(key);
      if (!e) out.set(key, e = { tris: 0, sum: [0, 0, 0] });
      const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index;
      const n = idx ? idx.count : pos.count;
      e.tris += n / 3;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos as THREE.BufferAttribute, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        e.sum[0] += v.x; e.sum[1] += v.y; e.sum[2] += v.z;
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return out;
}

// For testing: for every merged model, whether it draws just what its own parts would, and what
// merging saved. Each is put back to its own parts to compare, then merged again.
export function verifyBatching() {
  let models = 0, before = 0, after = 0, pending = 0;
  const wrong: string[] = [];
  for (const [root, s] of live) {
    if (s.phase !== 'merged' || !root.parent) continue;
    // A part just started moving, not yet noticed (checks run every CHECK_EVERY frames).
    if (s.dirty || changedAmong(s.critical)) { pending++; continue; }
    models++;
    const count = () => { let n = 0; root.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
    const merged = drawn(root); after += count();
    unmerge(root, s);
    const own = drawn(root); before += count();
    watch(root, s);
    merge(root, s);
    for (const k of new Set([...merged.keys(), ...own.keys()])) {
      const a = merged.get(k), b = own.get(k);
      if (!a || !b || Math.abs(a.tris - b.tris) > 0 || a.sum.some((x, i) => Math.abs(x - b.sum[i]) > 1e-3 * Math.max(1, Math.abs(x)))) {
        wrong.push(`${root.parent?.parent?.name ?? '?'} ${k}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      }
    }
  }
  const phases: Record<string, number> = {};
  for (const [root, st] of live) {
    let unit = ''; for (let o: THREE.Object3D | null = root; o; o = o.parent) if (o.name.startsWith('unit-')) unit = 'unit ';
    const k = `${unit}${st.phase}${shown(root) ? '' : ' (off screen)'}`; phases[k] = (phases[k] || 0) + 1;
  }
  const why = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return { why, phases, pending, models, drawCallsOwn: before, drawCallsMerged: after, wrong, queued: queue.length, live: live.size, merges: stats.merges, msPerMerge: +(stats.mergeMs / Math.max(stats.merges, 1)).toFixed(2) };
}

// For tests.
const newState = (): State => ({ phase: 'settling', stillFor: 0, snaps: [], critical: [], dirty: false, slot: 0, snapped: new Set(), held: [], merged: [] });
export const batchedInternals = { moves, shared, queue, work, newState, watch, merge, unmerge, changed, changedAmong, drawn };
