import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { freezeContainer, freezeSubtree, installMatrixWalk } from './perf';

installMatrixWalk();

const worldX = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).x;

describe('the matrix walk', () => {
  it('updates visible objects as three.js does', () => {
    const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Mesh();
    scene.add(a); a.add(b);
    a.position.x = 3; b.position.x = 2;
    scene.updateMatrixWorld();
    expect(worldX(b)).toBe(5);
  });

  it('skips something hidden, then catches it up on the parent\'s move when shown', () => {
    const scene = new THREE.Scene(), a = new THREE.Group(), hidden = new THREE.Group(), leaf = new THREE.Mesh();
    scene.add(a); a.add(hidden); hidden.add(leaf);
    scene.updateMatrixWorld();
    hidden.visible = false;
    leaf.matrixAutoUpdate = false;   // even a frozen leaf follows when it's shown again
    a.position.x = 4;
    scene.updateMatrixWorld();
    expect(worldX(leaf)).toBe(0);    // not visited while hidden
    hidden.visible = true;
    scene.updateMatrixWorld();
    expect(worldX(leaf)).toBe(4);
  });

  it('keeps updating a hidden hit proxy', () => {
    const scene = new THREE.Scene(), a = new THREE.Group(), proxy = new THREE.Mesh();
    proxy.visible = false; proxy.userData.pickWhileHidden = true;
    scene.add(a); a.add(proxy);
    a.position.x = 7;
    scene.updateMatrixWorld();
    expect(worldX(proxy)).toBe(7);
  });

  it('stops at a frozen subtree, unless an ancestor moved', () => {
    const scene = new THREE.Scene(), a = new THREE.Group(), frozen = new THREE.Group(), leaf = new THREE.Mesh();
    scene.add(a); a.add(frozen); frozen.add(leaf);
    freezeSubtree(frozen);
    // Its ancestors are clean (an object that composes its own matrix forces its children).
    freezeContainer(scene); freezeContainer(a);
    scene.updateMatrixWorld();
    let visits = 0;
    const own = leaf.updateMatrixWorld.bind(leaf);
    leaf.updateMatrixWorld = (f?: boolean) => { visits++; own(f); };
    scene.updateMatrixWorld();
    expect(visits).toBe(0);
    a.position.x = 2; a.updateMatrix();
    scene.updateMatrixWorld();
    expect(visits).toBe(1);
  });

  it('getWorldPosition still finds a hidden object', () => {
    const scene = new THREE.Scene(), a = new THREE.Group(), hidden = new THREE.Mesh();
    scene.add(a); a.add(hidden); hidden.visible = false;
    a.position.x = 9;
    scene.updateMatrixWorld();
    expect(hidden.getWorldPosition(new THREE.Vector3()).x).toBe(9);
  });
});
