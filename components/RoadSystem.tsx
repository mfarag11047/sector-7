
import React, { useMemo, useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { RoadTileData } from '../types';
import { createGroundTexture, createRoadTexture, groundOfTile, RoadPiece, roadPieceOf, TileGround } from './districtTheme';

// --- PROCEDURAL TEXTURES ---

// 1. Hex Grid Texture (Slow/Open)
const createHexTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512; 
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Open ground. Kept in the night palette, without a per-tile vignette that
        // reads as a shadow whenever the camera isn't looking into the light.
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 512, 512);
        
        // Hex Lines
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        
        const r = 32;
        const width = r * 2;
        const height = Math.sqrt(3) * r;
        
        const drawHex = (x: number, y: number) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const px = x + r * Math.cos(angle);
                const py = y + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Inner highlight
            ctx.fillStyle = 'rgba(51, 65, 85, 0.3)'; 
            ctx.fill();
        };

        // Draw grid
        for (let y = -height; y < 512 + height; y += height) {
            for (let x = -width; x < 512 + width; x += width * 1.5) {
                drawHex(x, y);
                drawHex(x + width * 0.75, y + height * 0.5);
            }
        }
        
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
};

// --- SINGLE TYPE INSTANCED MESH ---
const SingleTypeRoads: React.FC<{
    tiles: RoadTileData[];
    tileSize: number;
    offset: number;
    texture: THREE.Texture;
    baseColor: THREE.Color;
    onClick: (x: number, z: number) => void;
    onRightClick: (x: number, z: number) => void;
    onHover: (x: number, z: number) => void;
    getRotation?: (tile: RoadTileData) => number;
    // A colour per tile (a district's tint), else baseColor for all.
    colorOf?: (tile: RoadTileData) => THREE.Color;
    tileScale?: number;
    randomRotation?: boolean;
}> = ({ tiles, tileSize, offset, texture, baseColor, onClick, onRightClick, onHover, getRotation, colorOf, tileScale = 0.95, randomRotation = false }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const tempObject = useMemo(() => new THREE.Object3D(), []);
    const hoverColor = useMemo(() => new THREE.Color("#0ea5e9").addScalar(0.2), []);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        tiles.forEach((tile, i) => {
            const x = (tile.x * tileSize) - offset;
            const z = (tile.z * tileSize) - offset;
            
            // Using boxGeometry, so position Y should be half thickness (0.1) so it sits on 0
            tempObject.position.set(x, 0.1, z); 
            
            let rotationY = 0;
            if (getRotation) {
                rotationY = getRotation(tile);
            } else if (randomRotation) {
                // Deterministic random based on position to avoid flicker on re-renders
                const hash = Math.abs(Math.sin(tile.x * 12.9898 + tile.z * 78.233) * 43758.5453);
                const rot = Math.floor((hash - Math.floor(hash)) * 4);
                rotationY = rot * (Math.PI / 2);
            }
            
            tempObject.rotation.set(0, rotationY, 0);
            
            tempObject.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObject.matrix);
            meshRef.current!.setColorAt(i, colorOf ? colorOf(tile) : baseColor);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [tiles, tileSize, offset, baseColor, getRotation, randomRotation, colorOf]);

    // Road tiles sit on a regular grid, so the tile under a ray is found by meeting the
    // road surface and rounding, instead of three.js testing every one of the thousands of
    // instances. The pointer system ray-tests this mesh on every mouse move to track hover.
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const index = new Map<number, number>();
        tiles.forEach((tile, i) => index.set(tile.x * 4096 + tile.z, i));
        const half = (tileSize * tileScale) / 2;
        const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
        const hit = new THREE.Vector3();
        mesh.raycast = (raycaster, intersects) => {
            if (!raycaster.ray.intersectPlane(top, hit)) return;
            const gx = Math.round((hit.x + offset) / tileSize);
            const gz = Math.round((hit.z + offset) / tileSize);
            const i = index.get(gx * 4096 + gz);
            if (i === undefined) return;
            if (Math.abs(hit.x - (gx * tileSize - offset)) > half || Math.abs(hit.z - (gz * tileSize - offset)) > half) return;
            const distance = raycaster.ray.origin.distanceTo(hit);
            if (distance < raycaster.near || distance > raycaster.far) return;
            intersects.push({ distance, point: hit.clone(), object: mesh, instanceId: i, face: null });
        };
    }, [tiles, tileSize, offset, tileScale]);

    useEffect(() => {
        if (!meshRef.current) return;
        if (hoveredId !== null && hoveredId < tiles.length) {
            meshRef.current.setColorAt(hoveredId, hoverColor);
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
        return () => {
            if (meshRef.current && hoveredId !== null && hoveredId < tiles.length) {
                meshRef.current.setColorAt(hoveredId, colorOf ? colorOf(tiles[hoveredId]) : baseColor);
                if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
            }
        };
    }, [hoveredId, tiles, baseColor, hoverColor, colorOf]);

    const handlePointerMove = (e: any) => {
        if (e.instanceId !== undefined) {
            setHoveredId(e.instanceId);
            const tile = tiles[e.instanceId];
            onHover(tile.x, tile.z);
        }
    };

    const handlePointerOut = () => {
        setHoveredId(null);
    };

    const handleClick = (e: any) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            const tile = tiles[e.instanceId];
            onClick(tile.x, tile.z);
        }
    };

    const handleContextMenu = (e: any) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            const tile = tiles[e.instanceId];
            onRightClick(tile.x, tile.z);
        }
    };

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, tiles.length]}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
        >
            <boxGeometry args={[tileSize * tileScale, 0.2, tileSize * tileScale]} />
            <meshStandardMaterial 
                map={texture} 
                roughness={0.95} 
                metalness={0.05}
                color={baseColor}
            />
        </instancedMesh>
    );
};

// Stable across renders: passing freshly built Colors in JSX invalidates the
// instance-matrix effect below and rewrites every road tile on each render.
const COLOR_ROAD = new THREE.Color('#ffffff');
const COLOR_OPEN = new THREE.Color('#ffffff');

// A low pale kerb along each lawn edge that meets other open ground (the paving round a
// courtyard); edges against a building need none.
const LawnKerbs: React.FC<{ lawn: RoadTileData[]; open: RoadTileData[]; tileSize: number; offset: number }> = ({ lawn, open, tileSize, offset }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const kerbs = useMemo(() => {
        const isLawn = new Set(lawn.map(t => `${t.x},${t.z}`));
        const isOpen = new Set(open.map(t => `${t.x},${t.z}`));
        const out: { x: number; z: number; alongX: boolean }[] = [];
        for (const t of lawn) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const k = `${t.x + dx},${t.z + dz}`;
                if (isLawn.has(k) || !isOpen.has(k)) continue;
                out.push({ x: (t.x + dx * 0.47) * tileSize - offset, z: (t.z + dz * 0.47) * tileSize - offset, alongX: dz !== 0 });
            }
        }
        return out;
    }, [lawn, open, tileSize, offset]);
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const o = new THREE.Object3D();
        kerbs.forEach((k, i) => {
            o.position.set(k.x, 0.3, k.z);
            o.rotation.set(0, k.alongX ? 0 : Math.PI / 2, 0);
            o.updateMatrix();
            mesh.setMatrixAt(i, o.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    }, [kerbs]);
    if (kerbs.length === 0) return null;
    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, kerbs.length]} raycast={() => null}>
            <boxGeometry args={[tileSize, 0.4, tileSize * 0.06]} />
            <meshStandardMaterial color="#9aa1ab" roughness={0.9} />
        </instancedMesh>
    );
};

// --- MAIN EXPORTED COMPONENT ---
export const InstancedRoads: React.FC<{ 
    tiles: RoadTileData[]; 
    tileSize: number; 
    offset: number; 
    onClick: (x: number, z: number) => void; 
    onRightClick: (x: number, z: number) => void; 
    onHover?: (x: number, z: number) => void;
    tileScale?: number;
}> = ({ tiles, tileSize, offset, onClick, onRightClick, onHover, tileScale = 0.95 }) => {
    
    // Generate Textures (Once)
    const texHex = useMemo(() => createHexTexture(), []);

    // Calculate grid properties to determine orientation for Main roads
    // offset = (gridSize * tileSize) / 2
    // gridSize = (offset * 2) / tileSize
    const gridSize = Math.round((offset * 2) / tileSize);

    // Split tiles by type for specialized rendering, and open ground by its district's style
    // (components/districtTheme.ts): one instanced mesh per ground style.
    // Roads by piece (components/districtTheme.ts roadPieceOf): city or suburb, straight or
    // junction, and the main boulevard; straight pieces turned to run along their road.
    const { roadsByPiece, openByStyle } = useMemo(() => {
        const roads = new Map<RoadPiece, RoadTileData[]>();
        const open = new Map<TileGround, RoadTileData[]>();
        tiles.forEach(t => {
            if (t.type === 'main' || t.type === 'street') {
                const { piece } = roadPieceOf(t.x, t.z, t.type, gridSize);
                if (!roads.has(piece)) roads.set(piece, []);
                roads.get(piece)!.push(t);
            } else {
                const style = groundOfTile(t.x, t.z, gridSize);
                if (!open.has(style)) open.set(style, []);
                open.get(style)!.push(t);
            }
        });
        return { roadsByPiece: [...roads.entries()], openByStyle: [...open.entries()] };
    }, [tiles, gridSize]);
    const groundTextures = useMemo(() => new Map<TileGround, THREE.Texture>(
        (['granite', 'plazaStone', 'paving', 'lawn', 'walkway', 'parking', 'yard', 'slab'] as const).map(s => [s, createGroundTexture(s)])), []);
    const roadTextures = useMemo(() => new Map<RoadPiece, THREE.Texture>(
        (['cityStraight', 'cityJunction', 'suburbStraight', 'suburbJunction', 'avenue'] as const).map(p => [p, createRoadTexture(p)])), []);
    // Markings are drawn up the texture: turned a quarter for a road running along x.
    const roadRotation = useCallback((t: RoadTileData) =>
        (roadPieceOf(t.x, t.z, t.type as 'main' | 'street', gridSize).alongX ? Math.PI / 2 : 0), [gridSize]);

    // Handler wrapper
    const onHoverRef = useRef(onHover);
    onHoverRef.current = onHover;
    const handleHover = useCallback((x: number, z: number) => { onHoverRef.current?.(x, z); }, []);

    return (
        <group>
            {roadsByPiece.map(([piece, roads]) => (
                <SingleTypeRoads
                    key={piece}
                    tiles={roads} tileSize={tileSize} offset={offset}
                    texture={roadTextures.get(piece)!} baseColor={COLOR_ROAD}
                    onClick={onClick} onRightClick={onRightClick} onHover={handleHover}
                    // Roads meet edge to edge, so their lines run on unbroken.
                    tileScale={1}
                    getRotation={piece.endsWith('Junction') ? undefined : roadRotation}
                    randomRotation={piece.endsWith('Junction')}
                />
            ))}
            {openByStyle.map(([style, open]) => (
                <SingleTypeRoads
                    key={style}
                    tiles={open} tileSize={tileSize} offset={offset}
                    texture={style === 'hex' ? texHex : groundTextures.get(style)!} baseColor={COLOR_OPEN}
                    onClick={onClick} onRightClick={onRightClick} onHover={handleHover}
                    // Lawn and parking tiles meet edge to edge, so a courtyard reads as one lawn and
                    // a lot's bays run on unbroken; parking keeps one heading so its aisles line up.
                    tileScale={style === 'lawn' || style === 'parking' ? 1 : tileScale}
                    randomRotation={style !== 'parking'}
                />
            ))}
            <LawnKerbs lawn={openByStyle.find(([style]) => style === 'lawn')?.[1] ?? []} open={tiles} tileSize={tileSize} offset={offset} />
        </group>
    );
};
