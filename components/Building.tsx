
import React, { useMemo, useState, useRef, useCallback } from 'react';
import { BuildingData } from '../types';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import { useFrame } from '@react-three/fiber';

interface BuildingProps {
  data: BuildingData;
  onClick?: (x: number, z: number) => void;
  onRightClick?: (x: number, z: number) => void;
  onHover?: (x: number, z: number) => void;
}

// --- Sub-Components for Commercial Tower ---

const HologramRing = ({ radius, height, color }: { radius: number, height: number, color: string }) => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (groupRef.current) {
        groupRef.current.rotation.y -= delta * 0.2;
        // Floating effect
        groupRef.current.position.y = height * 0.9 + Math.sin(state.clock.elapsedTime) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 1.5, radius * 1.6, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {[0, 120, 240].map((deg, i) => (
            <group key={i} rotation={[0, (deg * Math.PI) / 180, 0]}>
                <mesh position={[radius * 1.8, 0, 0]} rotation={[0, 0, 0]}>
                    <planeGeometry args={[radius * 0.8, radius * 0.3]} />
                    <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
                <mesh position={[radius * 1.8, radius * 0.2, 0]} rotation={[0, 0, 0]}>
                    <boxGeometry args={[radius * 0.8, 0.05, 0.05]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            </group>
        ))}
    </group>
  );
};

const CommercialTower = ({ 
    data, 
    materialRef, 
    onBeforeCompile, 
    onClick, 
    onRightClick, 
    onPointerOver, 
    onPointerOut, 
    hovered,
    colors
}: { 
    data: BuildingData; 
    materialRef: any; 
    onBeforeCompile: any; 
    onClick: any; 
    onRightClick: any; 
    onPointerOver: any; 
    onPointerOut: any; 
    hovered: boolean;
    colors: any;
}) => {
    const width = data.scale[0];
    const height = data.scale[1];
    const depth = data.scale[2];
    const radius = Math.min(width, depth) * 0.35;
    const coreHeight = height * 0.85;
    const podiumHeight = height * 0.15;
    
    const glowColor = data.owner ? TEAM_COLORS[data.owner] : data.color;

    return (
        <group 
            onClick={onClick}
            onContextMenu={onRightClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
        >
            {/* Podium (Base) */}
            <mesh position={[0, podiumHeight / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[radius * 1.4, radius * 1.6, podiumHeight, 8]} />
                <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
                <Edges color={hovered ? "#ffffff" : "#475569"} threshold={20} />
            </mesh>

            {/* Core (The Capture Shader Mesh) */}
            {/* Positioned so its center allows the shader logic to fill correctly upwards */}
            <mesh position={[0, podiumHeight + coreHeight / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[radius, radius, coreHeight, 16]} />
                <meshStandardMaterial
                    ref={materialRef}
                    metalness={0.6}
                    roughness={0.2}
                    onBeforeCompile={onBeforeCompile}
                />
                {hovered && <Edges color="#ffffff" threshold={40} />}
            </mesh>

            {/* Exoskeleton Pillars */}
            {[45, 135, 225, 315].map((deg, i) => {
                const rad = (deg * Math.PI) / 180;
                const dist = radius * 1.25;
                return (
                    <group key={i} position={[Math.cos(rad) * dist, height / 2, Math.sin(rad) * dist]} rotation={[0, -rad, 0]}>
                        <mesh>
                            <boxGeometry args={[width * 0.1, height, depth * 0.1]} />
                            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.4} />
                            <Edges color={hovered ? "#ffffff" : "#0f172a"} />
                        </mesh>
                        {/* Light strip on pillar */}
                        <mesh position={[0, 0, depth * 0.051]}>
                            <planeGeometry args={[width * 0.02, height * 0.9]} />
                            <meshBasicMaterial color={glowColor} />
                        </mesh>
                    </group>
                );
            })}

            {/* Ribs/Rings connecting pillars */}
            {[0.25, 0.5, 0.75].map((pct, i) => (
                <mesh key={i} position={[0, height * pct, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[radius * 1.3, width * 0.02, 4, 32]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.9} />
                </mesh>
            ))}

            {/* Top Cap */}
            <mesh position={[0, height, 0]}>
                <cylinderGeometry args={[radius * 1.1, radius * 1.1, height * 0.05, 16]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>

            {/* Hologram */}
            <HologramRing radius={radius} height={height} color={glowColor} />
        </group>
    );
};

// --- Sub-Component for High-Tech Building (Sci-Fi Data Center) ---

const HighTechBuilding = ({ 
    data, 
    materialRef, 
    onBeforeCompile, 
    onClick, 
    onRightClick, 
    onPointerOver, 
    onPointerOut, 
    hovered,
    colors
}: { 
    data: BuildingData; 
    materialRef: any; 
    onBeforeCompile: any; 
    onClick: any; 
    onRightClick: any; 
    onPointerOver: any; 
    onPointerOut: any; 
    hovered: boolean;
    colors: any;
}) => {
    const width = data.scale[0];
    const height = data.scale[1];
    const depth = data.scale[2];
    const coreHeight = height - 1.0; 
    const coreRadius = Math.min(width, depth) * 0.35;

    return (
        <group 
            onClick={onClick}
            onContextMenu={onRightClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
        >
            {/* Foundation */}
            <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>

            {/* Corner Pillars */}
            {[
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ].map(([xSign, zSign], i) => (
                <group key={i} position={[xSign * (width/2 - width*0.1), height/2, zSign * (depth/2 - depth*0.1)]}>
                    <mesh>
                        <boxGeometry args={[width*0.2, height, depth*0.2]} />
                        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
                    </mesh>
                    <mesh position={[xSign * width*0.105, 0, 0]}>
                        <boxGeometry args={[0.02, height*0.9, depth*0.1]} />
                        <meshBasicMaterial color={data.color} />
                    </mesh>
                </group>
            ))}

            {/* Central Core (Capture Target) */}
            <mesh position={[0, height/2, 0]}>
                <cylinderGeometry args={[coreRadius, coreRadius, coreHeight, 8]} />
                <meshStandardMaterial
                    ref={materialRef}
                    metalness={0.8}
                    roughness={0.2}
                    onBeforeCompile={onBeforeCompile}
                />
            </mesh>

            {/* Glass Shell */}
            <mesh position={[0, height/2, 0]}>
                <boxGeometry args={[width * 0.7, coreHeight, depth * 0.7]} />
                <meshStandardMaterial 
                    color="#a5f3fc" 
                    transparent 
                    opacity={0.15} 
                    side={THREE.DoubleSide} 
                    depthWrite={false}
                />
                <Edges color={data.color} threshold={15} transparent opacity={0.3} />
            </mesh>

            {/* Roof */}
            <mesh position={[0, height, 0]}>
                <boxGeometry args={[width, 0.2, depth]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
        </group>
    );
};

// --- Sub-Component for Industrial Complex ---

const IndustrialComplex = ({ 
    data, 
    materialRef, 
    onBeforeCompile, 
    onClick, 
    onRightClick, 
    onPointerOver, 
    onPointerOut, 
    hovered,
    colors
}: { 
    data: BuildingData; 
    materialRef: any; 
    onBeforeCompile: any; 
    onClick: any; 
    onRightClick: any; 
    onPointerOver: any; 
    onPointerOut: any; 
    hovered: boolean;
    colors: any;
}) => {
    const width = data.scale[0];
    const height = data.scale[1];
    const depth = data.scale[2];
    
    // Main Reactor dimensions match the logical height for the shader to work 1:1
    const reactorRadius = Math.min(width, depth) * 0.35;
    
    return (
        <group 
            onClick={onClick}
            onContextMenu={onRightClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
        >
            {/* Foundation */}
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 1, depth]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>

            {/* Main Reactor Body (Capture Target) */}
            <mesh position={[0, height / 2 + 0.5, 0]} castShadow receiveShadow>
                {/* 8-sided cylinder looks like a heavy industrial tank */}
                <cylinderGeometry args={[reactorRadius, reactorRadius, height, 8]} />
                <meshStandardMaterial
                    ref={materialRef}
                    metalness={0.6}
                    roughness={0.5}
                    onBeforeCompile={onBeforeCompile}
                />
                {hovered && <Edges color="#ffffff" threshold={20} />}
            </mesh>

            {/* Reactor Top Cap */}
            <mesh position={[0, height + 0.5, 0]}>
                <cylinderGeometry args={[reactorRadius * 0.8, reactorRadius, 0.5, 8]} />
                <meshStandardMaterial color="#334155" />
            </mesh>

            {/* Smokestack 1 */}
            <group position={[width * 0.35, 0, depth * 0.35]}>
                <mesh position={[0, height * 0.6, 0]}>
                    <cylinderGeometry args={[width * 0.08, width * 0.12, height * 1.2, 8]} />
                    <meshStandardMaterial color="#0f172a" />
                </mesh>
                <mesh position={[0, height * 1.2, 0]}>
                    <torusGeometry args={[width * 0.08, width * 0.02, 4, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#ef4444" toneMapped={false} />
                </mesh>
            </group>

            {/* Smokestack 2 */}
            <group position={[-width * 0.35, 0, -depth * 0.35]}>
                <mesh position={[0, height * 0.5, 0]}>
                    <cylinderGeometry args={[width * 0.06, width * 0.1, height * 1.0, 8]} />
                    <meshStandardMaterial color="#0f172a" />
                </mesh>
                <mesh position={[0, height * 1.0, 0]}>
                    <torusGeometry args={[width * 0.06, width * 0.02, 4, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#ef4444" toneMapped={false} />
                </mesh>
            </group>

            {/* Horizontal Storage Tank */}
            <group position={[-width * 0.3, 1.5, depth * 0.3]}>
                 <mesh rotation={[0, 0, Math.PI/2]}>
                     <cylinderGeometry args={[width * 0.12, width * 0.12, width * 0.5, 8]} />
                     <meshStandardMaterial color={colors.base} metalness={0.7} roughness={0.3} />
                 </mesh>
                 {/* Supports */}
                 <mesh position={[-width*0.15, -0.6, 0]}>
                     <boxGeometry args={[0.1, 1.2, 0.1]} />
                     <meshStandardMaterial color="#475569" />
                 </mesh>
                 <mesh position={[width*0.15, -0.6, 0]}>
                     <boxGeometry args={[0.1, 1.2, 0.1]} />
                     <meshStandardMaterial color="#475569" />
                 </mesh>
                 {/* Pipe to main reactor */}
                 <mesh position={[width*0.25, 0, -depth*0.1]} rotation={[0, Math.PI/4, Math.PI/2]}>
                      <cylinderGeometry args={[0.1, 0.1, width*0.4]} />
                      <meshStandardMaterial color="#64748b" />
                 </mesh>
            </group>
            
            {/* Vertical Tank */}
            <group position={[width * 0.35, width*0.25 + 0.5, -depth * 0.1]}>
                <mesh>
                    <cylinderGeometry args={[width*0.15, width*0.15, width*0.5, 12]} />
                    <meshStandardMaterial color={data.color} metalness={0.4} />
                </mesh>
                <mesh position={[0, width*0.25, 0]}>
                    <sphereGeometry args={[width*0.15, 12, 8, 0, Math.PI*2, 0, Math.PI/2]} />
                    <meshStandardMaterial color={data.color} metalness={0.4} />
                </mesh>
            </group>

        </group>
    );
};

// --- Sub-Component for Residential Building ---

const ResidentialBuilding = ({
    data,
    materialRef,
    onBeforeCompile,
    onClick,
    onRightClick,
    onPointerOver,
    onPointerOut,
    hovered,
    colors
}: {
    data: BuildingData;
    materialRef: any;
    onBeforeCompile: any;
    onClick: any;
    onRightClick: any;
    onPointerOver: any;
    onPointerOut: any;
    hovered: boolean;
    colors: any;
}) => {
    const width = data.scale[0];
    const height = data.scale[1];
    const depth = data.scale[2];

    // Core dimensions slightly smaller than full tile to allow for details
    const coreWidth = width * 0.65;
    const coreDepth = depth * 0.65;

    return (
        <group
            onClick={onClick}
            onContextMenu={onRightClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
        >
            {/* Core Hull (Capture Target) */}
            {/* Position: center is at y = height/2 so shader fill works from bottom up */}
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[coreWidth, height, coreDepth]} />
                <meshStandardMaterial
                    ref={materialRef}
                    metalness={0.5}
                    roughness={0.7}
                    onBeforeCompile={onBeforeCompile}
                />
                {hovered && <Edges color="#ffffff" threshold={20} />}
            </mesh>

            {/* Bay Columns (Dark Metallic Structures attached to faces) */}
            {[
                { pos: [0, height/2, coreDepth/2], args: [coreWidth * 0.6, height * 0.95, width * 0.15] }, // Front
                { pos: [0, height/2, -coreDepth/2], args: [coreWidth * 0.6, height * 0.95, width * 0.15] }, // Back
                { pos: [coreWidth/2, height/2, 0], args: [width * 0.15, height * 0.95, coreDepth * 0.6] }, // Right
                { pos: [-coreWidth/2, height/2, 0], args: [width * 0.15, height * 0.95, coreDepth * 0.6] }, // Left
            ].map((cfg, i) => (
                <mesh key={i} position={cfg.pos as any}>
                    <boxGeometry args={cfg.args as any} />
                    <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
                </mesh>
            ))}

            {/* Neon Accents (Vertical strips at Core Corners) */}
            {[
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ].map(([xSign, zSign], i) => (
                <mesh key={i} position={[xSign * (coreWidth/2 + 0.02), height/2, zSign * (coreDepth/2 + 0.02)]}>
                    <boxGeometry args={[0.05, height * 0.9, 0.05]} />
                    <meshBasicMaterial color="#0ea5e9" toneMapped={false} />
                </mesh>
            ))}

            {/* Roof Cap */}
            <group position={[0, height, 0]}>
                {/* Main Plate */}
                <mesh position={[0, 0.05, 0]}>
                    <boxGeometry args={[width * 0.7, 0.1, depth * 0.7]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>
                {/* AC Units */}
                <mesh position={[width * 0.15, 0.25, -depth * 0.15]}>
                    <boxGeometry args={[width * 0.2, 0.3, depth * 0.2]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[-width * 0.1, 0.2, depth * 0.1]}>
                    <boxGeometry args={[width * 0.15, 0.2, depth * 0.3]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
            </group>
        </group>
    );
};

// --- Main Building Component ---

const Building: React.FC<BuildingProps> = ({ data, onClick, onRightClick, onHover }) => {
  const [hovered, setHovered] = useState(false);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const fansRef = useRef<THREE.Group>(null);

  // Calculate colors for different states
  const colors = useMemo(() => {
    const c = new THREE.Color(data.color);
    return {
      base: c.clone().multiplyScalar(0.25), // Dark dimmed state
      hover: c.clone().multiplyScalar(0.4), // Slightly lighter for hover
      glow: c.clone().multiplyScalar(1.8).addScalar(0.1), // Bright glowing state for capture fill
      team: data.owner ? new THREE.Color(TEAM_COLORS[data.owner]) : new THREE.Color(0, 0, 0),
      edge: data.owner ? new THREE.Color(TEAM_COLORS[data.owner]) : c.clone().multiplyScalar(0.8)
    };
  }, [data.color, data.owner]);

  // Update shader uniforms every frame for smooth animation
  useFrame((state, delta) => {
    if (!materialRef.current) return;

    const shader = materialRef.current.userData.shader;
    
    if (!shader || !shader.uniforms) return;

    const uProgress = shader.uniforms.uProgress;
    const uBaseColor = shader.uniforms.uBaseColor;
    const uGlowColor = shader.uniforms.uGlowColor;
    const uTeamColor = shader.uniforms.uTeamColor;
    const uHasOwner = shader.uniforms.uHasOwner;
    const uHeight = shader.uniforms.uHeight;

    if (!uProgress || !uBaseColor || !uGlowColor || !uTeamColor || !uHasOwner || !uHeight) return;

    if (uProgress.value !== undefined) {
        uProgress.value = THREE.MathUtils.lerp(
            uProgress.value,
            data.captureProgress / 100.0,
            delta * 2
        );
    }
    
    if (uBaseColor.value && uBaseColor.value.copy) uBaseColor.value.copy(hovered ? colors.hover : colors.base);
    if (uGlowColor.value && uGlowColor.value.copy) uGlowColor.value.copy(colors.glow);
    if (uTeamColor.value && uTeamColor.value.copy) uTeamColor.value.copy(colors.team);
    
    if (uHasOwner.value !== undefined) uHasOwner.value = !!data.owner;
    if (uHeight.value !== undefined) uHeight.value = data.scale[1];
    
    // Rotate fans if server node
    if (data.type === 'server_node' && fansRef.current) {
        fansRef.current.rotation.y += delta * 2;
    }
  });

  // Inject custom logic into MeshStandardMaterial
  const onBeforeCompile = useCallback((shader: any) => {
    if (!shader.uniforms) shader.uniforms = {};

    // Initialize uniforms
    shader.uniforms.uProgress = { value: 0 };
    shader.uniforms.uBaseColor = { value: new THREE.Color() };
    shader.uniforms.uGlowColor = { value: new THREE.Color() };
    shader.uniforms.uTeamColor = { value: new THREE.Color() };
    shader.uniforms.uHasOwner = { value: false };
    shader.uniforms.uHeight = { value: data.scale[1] };

    // Inject vertex position varying
    shader.vertexShader = `
      varying vec3 vPos;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vPos = position;
      `
    );

    // Inject color mixing logic
    shader.fragmentShader = `
      uniform float uProgress;
      uniform vec3 uBaseColor;
      uniform vec3 uGlowColor;
      uniform vec3 uTeamColor;
      uniform float uHeight;
      uniform bool uHasOwner;
      varying vec3 vPos;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      
      float h = uHeight;
      // Map local Y from [-height/2, height/2] to [0, 1]
      // Adjusting normalization to handle variations in geometry origin slightly
      float normalizedY = clamp((vPos.y + h * 0.5) / h, 0.0, 1.0);
      
      vec3 finalColor = uBaseColor;
      
      // Fill Effect: Pixels below progress level use the glowing color
      if (normalizedY <= uProgress) {
        finalColor = uGlowColor;
      }
      
      // Roof Logic: Top face (approx top 2% of height) turns team color if owned
      if (uHasOwner && vPos.y > (h * 0.48)) {
        finalColor = uTeamColor;
      }

      diffuseColor.rgb = finalColor;
      `
    ).replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      float h_e = uHeight;
      float normY_e = clamp((vPos.y + h_e * 0.5) / h_e, 0.0, 1.0);

      // Add glow emission to filled area
      if (normY_e <= uProgress) {
          totalEmissiveRadiance += uGlowColor * 0.6;
      }
      
      // Add emission to team-colored roof
      if (uHasOwner && vPos.y > (h_e * 0.48)) {
          totalEmissiveRadiance += uTeamColor * 0.4;
      }
      `
    );

    if (materialRef.current) {
        materialRef.current.userData.shader = shader;
    }
  }, [data.scale]);

  const handleClick = (e: any) => {
      e.stopPropagation();
      if (onClick) onClick(data.gridX, data.gridZ);
  };

  const handleRightClick = (e: any) => {
      e.stopPropagation();
      if (onRightClick) onRightClick(data.gridX, data.gridZ);
  };

  const handlePointerOver = (e: any) => {
      e.stopPropagation();
      setHovered(true);
      if (onHover) onHover(data.gridX, data.gridZ);
  };

  const handlePointerOut = (e: any) => {
      e.stopPropagation(); 
      setHovered(false); 
  };

  return (
    <group position={data.position}>
      {/* Foundation/Base Glow */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[data.scale[0] * 1.2, data.scale[2] * 1.2]} />
        <meshBasicMaterial 
          color={data.owner ? TEAM_COLORS[data.owner] : data.color} 
          transparent 
          opacity={data.owner ? 0.3 : 0.1} 
        />
      </mesh>

      {/* Capture Ring Indicator */}
      {data.capturingTeam && (
          <mesh position={[0, (data.captureProgress / 100) * data.scale[1], 0]} rotation={[-Math.PI/2, 0, 0]}>
              <ringGeometry args={[data.scale[0] * 0.6, data.scale[0] * 0.7, 16]} />
              <meshBasicMaterial color={TEAM_COLORS[data.capturingTeam]} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
      )}

      {/* Main Building Body */}
      {data.type === 'commercial' ? (
          <CommercialTower 
              data={data}
              materialRef={materialRef}
              onBeforeCompile={onBeforeCompile}
              onClick={handleClick}
              onRightClick={handleRightClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
              hovered={hovered}
              colors={colors}
          />
      ) : data.type === 'hightech' ? (
          <HighTechBuilding 
              data={data}
              materialRef={materialRef}
              onBeforeCompile={onBeforeCompile}
              onClick={handleClick}
              onRightClick={handleRightClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
              hovered={hovered}
              colors={colors}
          />
      ) : data.type === 'industrial' ? (
          <IndustrialComplex 
              data={data}
              materialRef={materialRef}
              onBeforeCompile={onBeforeCompile}
              onClick={handleClick}
              onRightClick={handleRightClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
              hovered={hovered}
              colors={colors}
          />
      ) : data.type === 'residential' ? (
          <ResidentialBuilding
              data={data}
              materialRef={materialRef}
              onBeforeCompile={onBeforeCompile}
              onClick={handleClick}
              onRightClick={handleRightClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
              hovered={hovered}
              colors={colors}
          />
      ) : (
          /* Standard Box Building (Server Node Base) */
          <mesh
            castShadow
            receiveShadow
            onClick={handleClick}
            onContextMenu={handleRightClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            position={[0, data.scale[1] / 2, 0]} 
          >
            <boxGeometry args={data.scale} />
            <meshStandardMaterial
              ref={materialRef}
              metalness={data.type === 'server_node' ? 0.9 : 0.5}
              roughness={data.type === 'server_node' ? 0.2 : 0.2}
              onBeforeCompile={onBeforeCompile}
            />
            
            <Edges
              threshold={15}
              color={hovered ? '#ffffff' : colors.edge}
            />
          </mesh>
      )}

      {/* Server Node Details */}
      {data.type === 'server_node' && (
          <group position={[0, data.scale[1], 0]}>
               {/* Server Cooling Fans */}
               <group ref={fansRef}>
                   <mesh position={[data.scale[0]*0.25, 0.2, data.scale[2]*0.25]}>
                        <cylinderGeometry args={[data.scale[0]*0.2, data.scale[0]*0.2, 0.4]} />
                        <meshStandardMaterial color="#1e293b" />
                        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, 0]}>
                             <planeGeometry args={[data.scale[0]*0.3, data.scale[0]*0.1]} />
                             <meshBasicMaterial color="#334155" side={THREE.DoubleSide} />
                        </mesh>
                        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, Math.PI/2]}>
                             <planeGeometry args={[data.scale[0]*0.3, data.scale[0]*0.1]} />
                             <meshBasicMaterial color="#334155" side={THREE.DoubleSide} />
                        </mesh>
                   </mesh>
                   <mesh position={[-data.scale[0]*0.25, 0.2, -data.scale[2]*0.25]}>
                        <cylinderGeometry args={[data.scale[0]*0.2, data.scale[0]*0.2, 0.4]} />
                        <meshStandardMaterial color="#1e293b" />
                        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, 0]}>
                             <planeGeometry args={[data.scale[0]*0.3, data.scale[0]*0.1]} />
                             <meshBasicMaterial color="#334155" side={THREE.DoubleSide} />
                        </mesh>
                        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI/2, 0, Math.PI/2]}>
                             <planeGeometry args={[data.scale[0]*0.3, data.scale[0]*0.1]} />
                             <meshBasicMaterial color="#334155" side={THREE.DoubleSide} />
                        </mesh>
                   </mesh>
               </group>
               
               {/* Glowing Server Stripes */}
               <mesh position={[0, -data.scale[1]/2, data.scale[2]/2 + 0.05]}>
                   <planeGeometry args={[data.scale[0] * 0.8, data.scale[1] * 0.8]} />
                   <meshStandardMaterial color="#000000" emissive="#2563eb" emissiveIntensity={1} transparent opacity={0.5} />
               </mesh>
               <mesh position={[0, -data.scale[1]/2, -data.scale[2]/2 - 0.05]} rotation={[0, Math.PI, 0]}>
                   <planeGeometry args={[data.scale[0] * 0.8, data.scale[1] * 0.8]} />
                   <meshStandardMaterial color="#000000" emissive="#2563eb" emissiveIntensity={1} transparent opacity={0.5} />
               </mesh>
          </group>
      )}

      {/* Rooftop Details for standard buildings (Non-commercial, Non-server, Non-hightech, Non-industrial, Non-residential) */}
      <group position={[0, data.scale[1], 0]}>
        {data.type !== 'server_node' && data.type !== 'commercial' && data.type !== 'hightech' && data.type !== 'industrial' && data.type !== 'residential' && data.height > 20 && (
          <>
            <mesh position={[0, 1, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, 2.5, 0]}>
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshBasicMaterial color={data.owner ? TEAM_COLORS[data.owner] : "#ff003c"} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
};

export default Building;
