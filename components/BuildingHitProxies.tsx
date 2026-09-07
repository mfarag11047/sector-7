import React, { useRef, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { BuildingData } from '../types';

interface BuildingHitProxiesProps {
    buildings: BuildingData[];
    onClick: (x: number, z: number) => void;
    onRightClick: (x: number, z: number) => void;
    onHover: (x: number, z: number) => void;
}

/**
 * Pointer collider for every building, as one InstancedMesh.
 *
 * Buildings are built from 15-30 detail meshes each, and react-three-fiber ray-tests
 * recursively from anything carrying pointer handlers, so putting handlers on the
 * buildings themselves drags tens of thousands of meshes into every mouse move.
 * A single box per building collapses that into one instanced hit test while keeping
 * picking tied to each building's actual footprint and height.
 *
 * Never rendered: three.js raycasting ignores `visible`, but the renderer does not.
 */
const BuildingHitProxies: React.FC<BuildingHitProxiesProps> = ({ buildings, onClick, onRightClick, onHover }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const temp = useMemo(() => new THREE.Object3D(), []);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        buildings.forEach((b, i) => {
            const [width, height, depth] = b.scale;
            temp.position.set(b.position[0], height / 2, b.position[2]);
            temp.scale.set(width, height, depth);
            temp.rotation.set(0, 0, 0);
            temp.updateMatrix();
            mesh.setMatrixAt(i, temp.matrix);
        });

        mesh.count = buildings.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [buildings, temp]);

    const resolve = (e: any): BuildingData | null => {
        if (e.instanceId === undefined) return null;
        return buildings[e.instanceId] ?? null;
    };

    const handleClick = (e: any) => {
        const b = resolve(e);
        if (!b) return;
        e.stopPropagation();
        onClick(b.gridX, b.gridZ);
    };

    const handleContextMenu = (e: any) => {
        const b = resolve(e);
        if (!b) return;
        e.stopPropagation();
        onRightClick(b.gridX, b.gridZ);
    };

    const handlePointerMove = (e: any) => {
        const b = resolve(e);
        if (!b) return;
        // The ground plane and road tiles sit behind the building and would
        // otherwise report their own tile immediately afterwards.
        e.stopPropagation();
        onHover(b.gridX, b.gridZ);
    };

    if (buildings.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, buildings.length]}
            visible={false}
            frustumCulled={false}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onPointerMove={handlePointerMove}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial />
        </instancedMesh>
    );
};

export default BuildingHitProxies;
