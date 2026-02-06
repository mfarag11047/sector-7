
import React, { useMemo, useState, useRef, useLayoutEffect, useEffect } from 'react';
import * as THREE from 'three';
import { RoadTileData } from '../types';

// --- PROCEDURAL TEXTURES ---

// 1. Hex Grid Texture (Slow/Open)
const createHexTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512; 
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Dark Base
        ctx.fillStyle = '#020617'; // Slate 950
        ctx.fillRect(0, 0, 512, 512);
        
        // Hex Lines
        ctx.strokeStyle = '#1e293b'; // Slate 800
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
            ctx.fillStyle = 'rgba(30, 41, 59, 0.3)'; 
            ctx.fill();
        };

        // Draw grid
        for (let y = -height; y < 512 + height; y += height) {
            for (let x = -width; x < 512 + width; x += width * 1.5) {
                drawHex(x, y);
                drawHex(x + width * 0.75, y + height * 0.5);
            }
        }
        
        // Add vignette/shadow at edges
        const grad = ctx.createRadialGradient(256, 256, 150, 256, 256, 300);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,512,512);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
};

// 2. Concrete Texture (Normal/Street) - UPDATED VISUALS
const createConcreteTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512; // Increased resolution for details
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Helper for rounded rects
        const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        };

        // 1. Dark Industrial Base
        ctx.fillStyle = '#1e293b'; // Slate 800
        ctx.fillRect(0, 0, 512, 512);
        
        // 2. Heavy Noise / Grime
        for(let i=0; i<8000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#0f172a' : '#334155';
            ctx.globalAlpha = 0.15;
            const s = Math.random() * 6;
            ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
        }
        ctx.globalAlpha = 1.0;

        // 3. Concrete Cracks
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            let cx = Math.random() * 512;
            let cy = Math.random() * 512;
            ctx.moveTo(cx, cy);
            for(let j=0; j<6; j++) {
                cx += (Math.random() - 0.5) * 100;
                cy += (Math.random() - 0.5) * 100;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // 4. Maintenance Hatch (The "Panel")
        const hx = 80, hy = 120, hw = 160, hh = 240;
        
        // Hatch Shadow/Inset
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        drawRoundRect(hx+5, hy+5, hw, hh, 15);
        ctx.fill();

        // Hatch Body
        ctx.fillStyle = '#283547'; 
        drawRoundRect(hx, hy, hw, hh, 15);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Hatch Hinge Line
        ctx.beginPath();
        ctx.moveTo(hx + 20, hy + hh/2);
        ctx.lineTo(hx + hw - 20, hy + hh/2);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Hatch Handle
        ctx.fillStyle = '#0f172a';
        drawRoundRect(hx + hw - 40, hy + hh/2 - 25, 20, 50, 5);
        ctx.fill();

        // 5. Panel Cut Lines (Grid)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 380); ctx.lineTo(512, 380); 
        ctx.moveTo(350, 0); ctx.lineTo(350, 512); 
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        
        // 6. Worn Edges
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 8;
        ctx.strokeRect(0,0,512,512);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
};

// 3. Highway Glow Texture (Fast/Main)
const createHighwayGlowTexture = () => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#0f172a'; // Deep Base
        ctx.fillRect(0, 0, 256, 256);
        
        // Glow Settings
        ctx.shadowColor = '#06b6d4'; // Cyan
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#22d3ee'; // Light Cyan
        ctx.lineWidth = 4;
        
        // 1. Center Double Lines (Vertical on texture)
        ctx.beginPath();
        ctx.moveTo(120, 0); ctx.lineTo(120, 256);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(136, 0); ctx.lineTo(136, 256);
        ctx.stroke();
        
        // 2. Side Dashed Lines
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        
        ctx.beginPath();
        ctx.moveTo(40, 0); ctx.lineTo(40, 256);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(216, 0); ctx.lineTo(216, 256);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // 3. Edge Markers
        ctx.fillStyle = '#06b6d4';
        ctx.shadowBlur = 10;
        // Left Edge
        ctx.fillRect(5, 20, 5, 40);
        ctx.fillRect(5, 100, 5, 40);
        ctx.fillRect(5, 180, 5, 40);
        // Right Edge
        ctx.fillRect(246, 20, 5, 40);
        ctx.fillRect(246, 100, 5, 40);
        ctx.fillRect(246, 180, 5, 40);
    }
    const tex = new THREE.CanvasTexture(canvas);
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
    tileScale?: number;
    randomRotation?: boolean;
}> = ({ tiles, tileSize, offset, texture, baseColor, onClick, onRightClick, onHover, getRotation, tileScale = 0.95, randomRotation = false }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const tempObject = useMemo(() => new THREE.Object3D(), []);
    const hoverColor = useMemo(() => new THREE.Color("#0ea5e9").addScalar(0.2), []);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        tiles.forEach((tile, i) => {
            const x = (tile.x * tileSize) - offset;
            const z = (tile.z * tileSize) - offset;
            
            tempObject.position.set(x, 0.02, z); // Slightly above ground
            tempObject.rotation.set(-Math.PI / 2, 0, 0);
            
            if (getRotation) {
                tempObject.rotation.z = getRotation(tile);
            } else if (randomRotation) {
                // Deterministic random based on position to avoid flicker on re-renders
                const hash = Math.abs(Math.sin(tile.x * 12.9898 + tile.z * 78.233) * 43758.5453);
                const rot = Math.floor((hash - Math.floor(hash)) * 4);
                tempObject.rotation.z = rot * (Math.PI / 2);
            } else {
                // Default random-ish but actually just 0 for others to keep clean, or random if specified
                const hash = Math.abs(Math.sin(tile.x * 32.9898 + tile.z * 48.233) * 43758.5453);
                const rot = Math.floor((hash - Math.floor(hash)) * 4);
                tempObject.rotation.z = rot * (Math.PI / 2);
            }
            
            tempObject.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObject.matrix);
            meshRef.current!.setColorAt(i, baseColor);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [tiles, tileSize, offset, baseColor, getRotation, randomRotation]);

    useEffect(() => {
        if (!meshRef.current) return;
        if (hoveredId !== null && hoveredId < tiles.length) {
            meshRef.current.setColorAt(hoveredId, hoverColor);
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
        return () => {
            if (meshRef.current && hoveredId !== null && hoveredId < tiles.length) {
                meshRef.current.setColorAt(hoveredId, baseColor);
                if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
            }
        };
    }, [hoveredId, tiles, baseColor, hoverColor]);

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
            <planeGeometry args={[tileSize * tileScale, tileSize * tileScale]} />
            <meshStandardMaterial 
                map={texture} 
                roughness={0.8} 
                metalness={0.2}
                color={baseColor}
            />
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
    const texConcrete = useMemo(() => createConcreteTexture(), []);
    const texGlow = useMemo(() => createHighwayGlowTexture(), []);

    // Split tiles by type for specialized rendering
    const { mainTiles, streetTiles, openTiles } = useMemo(() => {
        const main: RoadTileData[] = [];
        const street: RoadTileData[] = [];
        const open: RoadTileData[] = [];
        tiles.forEach(t => {
            if (t.type === 'main') main.push(t);
            else if (t.type === 'street') street.push(t);
            else open.push(t);
        });
        return { mainTiles: main, streetTiles: street, openTiles: open };
    }, [tiles]);

    // Calculate grid properties to determine orientation for Main roads
    // offset = (gridSize * tileSize) / 2
    // gridSize = (offset * 2) / tileSize
    const gridSize = Math.round((offset * 2) / tileSize);
    const mid = Math.floor(gridSize / 2);

    const getMainRotation = (tile: RoadTileData) => {
        // Texture has vertical lines.
        // Rotation 0 aligns texture lines with World Z (North-South).
        // Rotation 90 aligns texture lines with World X (East-West).
        
        // If Z is approximately the middle row, it's an East-West road (varying X).
        if (Math.abs(tile.z - mid) <= 1) return Math.PI / 2;
        
        // If X is approximately the middle column, it's a North-South road (varying Z).
        if (Math.abs(tile.x - mid) <= 1) return 0;
        
        // Default
        return 0;
    };

    // Handler wrapper
    const handleHover = (x: number, z: number) => { if(onHover) onHover(x, z); };

    return (
        <group>
            {mainTiles.length > 0 && (
                <SingleTypeRoads 
                    tiles={mainTiles} tileSize={tileSize} offset={offset} 
                    texture={texGlow} baseColor={new THREE.Color('#ffffff')}
                    onClick={onClick} onRightClick={onRightClick} onHover={handleHover}
                    getRotation={getMainRotation}
                    tileScale={tileScale}
                />
            )}
            {streetTiles.length > 0 && (
                <SingleTypeRoads 
                    tiles={streetTiles} tileSize={tileSize} offset={offset} 
                    texture={texConcrete} baseColor={new THREE.Color('#94a3b8')} // Lighten the concrete slightly
                    onClick={onClick} onRightClick={onRightClick} onHover={handleHover}
                    tileScale={tileScale}
                    randomRotation={true}
                />
            )}
            {openTiles.length > 0 && (
                <SingleTypeRoads 
                    tiles={openTiles} tileSize={tileSize} offset={offset} 
                    texture={texHex} baseColor={new THREE.Color('#ffffff')}
                    onClick={onClick} onRightClick={onRightClick} onHover={handleHover}
                    tileScale={tileScale}
                    randomRotation={true}
                />
            )}
        </group>
    );
};
