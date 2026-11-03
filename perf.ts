import * as THREE from 'three';

/**
 * Three.js walks the whole scene graph every frame recomposing local and world
 * matrices. For static props (buildings, props, decor) that work is pure waste.
 *
 * Clearing `matrixWorldAutoUpdate` on a subtree root makes `Scene.updateMatrixWorld`
 * skip the entire subtree, so the cost is paid once instead of every frame.
 * Call this again after any render that changes the subtree's structure or transform.
 */
export function freezeSubtree(root: THREE.Object3D | null | undefined) {
    if (!root) return;

    // Compute the subtree once while updates are still enabled.
    root.matrixAutoUpdate = true;
    root.matrixWorldAutoUpdate = true;
    root.updateMatrix();
    root.updateMatrixWorld(true);

    // Two separate wins, and both are needed:
    //
    // `matrixAutoUpdate = false` everywhere skips the position/quaternion/scale
    // compose per object, which applies even when a parent forces an update.
    //
    // `matrixWorldAutoUpdate = false` on the root alone makes the parent's walk
    // skip this subtree entirely. It is deliberately NOT set on descendants:
    // three.js guards an object's own world-matrix write behind the same flag, so
    // clearing it deeper would stop animated details ever updating again.
    root.traverse(o => { o.matrixAutoUpdate = false; });
    root.matrixWorldAutoUpdate = false;
}

/**
 * Stop a static container from dirtying itself every frame.
 *
 * `updateMatrix()` always sets `matrixWorldNeedsUpdate`, which makes
 * `updateMatrixWorld` pass `force = true` to every child and bypass their
 * `matrixWorldAutoUpdate` flags. Any ancestor above a frozen subtree must be
 * clean or the freeze below it is silently cancelled.
 */
export function freezeContainer(root: THREE.Object3D | null | undefined) {
    if (!root) return;
    root.updateMatrix();
    root.matrixAutoUpdate = false;
}

/** True only if `obj` and every ancestor is visible. */
export function isSubtreeVisible(obj: THREE.Object3D | null | undefined): boolean {
    let node: THREE.Object3D | null = obj ?? null;
    while (node) {
        if (!node.visible) return false;
        node = node.parent;
    }
    return true;
}

/**
 * Recompute matrices for a subtree that lives inside a frozen parent.
 * Used by animated details (rotating rings, fans) whose transforms still change
 * each frame even though everything around them is static.
 */
export function refreshSubtree(root: THREE.Object3D | null | undefined) {
    if (!root) return;
    root.updateMatrix();
    root.updateMatrixWorld(true);
}

// three.js `intersect()` stops descending into an object's children as soon as its
// `raycast` returns false. Returning false from a subtree root therefore removes the
// whole subtree from hit-testing at the cost of a single call, rather than walking
// every mesh inside it.
const BLOCK_RAYCAST = () => false as const;

/**
 * Exclude a subtree from pointer hit-testing entirely.
 *
 * Intended for detailed props that are picked through a cheap stand-in collider
 * instead of their own geometry.
 */
export function blockSubtreeRaycast(root: THREE.Object3D | null | undefined) {
    if (!root) return;
    root.raycast = BLOCK_RAYCAST as unknown as THREE.Object3D['raycast'];
}

const _center = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/**
 * Frustum test against a subtree root using a cached bounding radius.
 *
 * Toggling `visible` on a group short-circuits both `projectObject` (render list
 * assembly) and `renderObject`, which traverse the graph regardless of whether
 * individual meshes are culled. Per-mesh culling cannot do this.
 */
export function isSphereVisible(frustum: THREE.Frustum, center: THREE.Vector3, radius: number): boolean {
    _sphere.set(center, radius);
    return frustum.intersectsSphere(_sphere);
}

export { _center };

/**
 * The per-frame matrix walk, made to skip what it needn't visit.
 *
 * three.js's `Object3D.updateMatrixWorld` visits every object in the scene every frame (since
 * r0.15x it no longer stops at a subtree whose root has `matrixWorldAutoUpdate` cleared, so the
 * freeze above only saved the matrix maths, not the walk). The city is some 80,000 objects; in a
 * big battle the walk was the single largest cost of a frame. This replaces it with one that:
 *
 *   - stops at a frozen subtree's root (`matrixWorldAutoUpdate === false`) unless an ancestor's
 *     matrix changed, as three.js used to and as `freezeSubtree` expects;
 *   - stops at anything hidden (`visible === false`): units and buildings off screen, muzzle
 *     flashes, pooled effects. Nothing hidden is drawn, so its matrices can wait until it's shown.
 *     If an ancestor moved meanwhile, the hidden object is marked to catch up when next visited,
 *     so it's never drawn where it was. Something hidden that must still be picked by the pointer
 *     (an invisible hit proxy) sets `userData.pickWhileHidden` to keep being updated.
 *
 * Code that reads a hidden object's world position must go through `getWorldPosition` (or
 * `updateWorldMatrix`), which brings its matrices up to date on demand.
 */
function updateMatrixWorldSkipping(this: THREE.Object3D, force?: boolean) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
        if (this.matrixWorldAutoUpdate === true) {
            if (this.parent === null) this.matrixWorld.copy(this.matrix);
            else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
        this.matrixWorldNeedsUpdate = false;
        force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        if (child.visible === false && child.userData.pickWhileHidden !== true) {
            // Catch up on the parent's move when it's next shown.
            if (force) child.matrixWorldNeedsUpdate = true;
            continue;
        }
        if (child.matrixWorldAutoUpdate === false && !force && !child.matrixWorldNeedsUpdate) continue;
        child.updateMatrixWorld(force);
    }
}

let walkInstalled = false;
export function installMatrixWalk() {
    if (walkInstalled) return;
    walkInstalled = true;
    THREE.Object3D.prototype.updateMatrixWorld = updateMatrixWorldSkipping;
}
