import * as THREE from 'three';

export const globalFrustum = new THREE.Frustum();
export const frustumMatrix = new THREE.Matrix4();

export function updateGlobalFrustum(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    globalFrustum.setFromProjectionMatrix(frustumMatrix);
}

const _sphere = new THREE.Sphere();
const _vec3 = new THREE.Vector3();

export function isObjectInFrustum(object: THREE.Object3D, radius: number = 25): boolean {
    object.getWorldPosition(_vec3);
    _sphere.set(_vec3, radius);
    return globalFrustum.intersectsSphere(_sphere);
}

export function isPointInFrustum(point: THREE.Vector3, radius: number = 25): boolean {
    _sphere.set(point, radius);
    return globalFrustum.intersectsSphere(_sphere);
}
