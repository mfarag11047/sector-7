import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installMatrixWalk } from '../../perf';
import { batchedInternals as B } from './Batched';

installMatrixWalk();

const box = new THREE.BoxGeometry(1, 1, 1);
const steel = new THREE.MeshStandardMaterial({ color: '#888888' });
const paint = new THREE.MeshStandardMaterial({ color: '#c8102e' });

// A model: a hull of three steel plates and a paint stripe, and a turret (two steel plates) that turns.
function model() {
  const scene = new THREE.Scene(), root = new THREE.Group();
  scene.add(root);
  const part = (mat: THREE.Material, x: number, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(box, mat);
    m.position.set(x, 0, 0);
    parent.add(m);
    return m;
  };
  const hull = [part(steel, 0), part(steel, 1), part(steel, 2)];
  const stripe = part(paint, 3);
  const turret = new THREE.Group();
  turret.position.y = 1;
  root.add(turret);
  const guns = [part(steel, 0, turret), part(steel, 1, turret)];
  scene.updateMatrixWorld();
  return { scene, root, hull, stripe, turret, guns };
}
const drawCalls = (root: THREE.Object3D) => { let n = 0; root.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
const same = (a: ReturnType<typeof B.drawn>, b: ReturnType<typeof B.drawn>) => {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const [k, v] of a) { expect(v.tris).toBe(b.get(k)!.tris); v.sum.forEach((x, i) => expect(x).toBeCloseTo(b.get(k)!.sum[i], 6)); }
};

describe('Batched', () => {
  it('draws the still parts merged, one mesh per material, just as they were', () => {
    const m = model(), s = B.newState();
    const own = B.drawn(m.root);
    B.watch(m.root, s);
    B.merge(m.root, s);
    // Hull 3 steel -> 1, turret 2 steel -> 1 (in one piece, as nothing has turned yet), stripe alone.
    expect(drawCalls(m.root)).toBe(2);
    expect(m.hull[0].visible).toBe(false);
    same(B.drawn(m.root), own);
    B.unmerge(m.root, s);
    expect(drawCalls(m.root)).toBe(6);
    expect(m.hull[0].visible).toBe(true);
  });

  it('puts a model back the moment a merged part moves, and leaves that part out after', () => {
    const m = model(), s = B.newState();
    B.watch(m.root, s);
    B.merge(m.root, s);
    m.turret.rotation.y = 0.5;
    expect(B.changedAmong(s.critical)).toBe(true);
    B.unmerge(m.root, s);
    B.watch(m.root, s);
    expect(B.moves.has(m.turret)).toBe(true);
    B.merge(m.root, s);
    // The turret's plates are merged on the turret, so they turn with it.
    const onTurret = m.turret.children.filter(c => c.userData.batchedMerge);
    expect(onTurret.length).toBe(1);
    m.turret.rotation.y = 1.2;
    m.scene.updateMatrixWorld();
    expect(B.changedAmong(s.critical)).toBe(false);
    const own = (() => { B.unmerge(m.root, s); const d = B.drawn(m.root); B.watch(m.root, s); B.merge(m.root, s); return d; })();
    same(B.drawn(m.root), own);
  });

  it('keeps what the model shows or hides while merged', () => {
    const m = model(), s = B.newState();
    B.watch(m.root, s);
    B.merge(m.root, s);
    m.hull[1].visible = false;
    expect(s.dirty).toBe(true);
    expect(m.hull[1].visible).toBe(false);
    B.unmerge(m.root, s);
    expect(m.hull[1].visible).toBe(false);
    expect(m.hull[0].visible).toBe(true);
    expect(B.moves.has(m.hull[1])).toBe(true);
  });

  it('leaves out parts with a shader of their own', () => {
    const m = model(), s = B.newState();
    const custom = new THREE.MeshStandardMaterial();
    custom.onBeforeCompile = () => {};
    m.hull.forEach(h => { h.material = custom; });
    B.watch(m.root, s);
    B.merge(m.root, s);
    expect(m.hull.every(h => h.visible)).toBe(true);
  });

  it('shares merged shapes between models with the same parts', () => {
    const a = model(), b = model(), sa = B.newState(), sb = B.newState();
    B.watch(a.root, sa); B.merge(a.root, sa);
    B.watch(b.root, sb); B.merge(b.root, sb);
    const ga = (a.root.children.find(c => c.userData.batchedMerge) as THREE.Mesh).geometry;
    const gb = (b.root.children.find(c => c.userData.batchedMerge) as THREE.Mesh).geometry;
    expect(ga).toBe(gb);
    B.unmerge(a.root, sa);
    expect(B.shared.size).toBeGreaterThan(0);
    B.unmerge(b.root, sb);
    expect([...B.shared.values()].some(e => e.geometry === ga)).toBe(false);
  });

  it('notices a part removed', () => {
    const m = model(), s = B.newState();
    B.watch(m.root, s);
    B.merge(m.root, s);
    m.root.remove(m.hull[2]);
    expect(B.changedAmong(s.critical)).toBe(true);
  });
});
