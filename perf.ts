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
