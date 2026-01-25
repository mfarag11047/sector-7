
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import { StructureData, StructureType, UnitType } from '../types';
import { STRUCTURE_INFO, TEAM_COLORS, UNIT_CLASSES, UNIT_STATS } from '../constants';
import * as THREE from 'three';

interface StructureProps {
  data: StructureData;
  tileSize: number;
  offset: number;
  onRightClick?: (x: number, z: number) => void;
  onDoubleClick?: (id: string) => void;
  onClick?: (id: string) => void; // Added for explicit click
  menuOpen?: boolean;
  onAction?: (action: string, payload?: any) => void;
  hasMason?: boolean;
  resources?: number;
}

const CommLinkModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
  const dishRef = useRef<THREE.Group>(null);
  const fanRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (dishRef.current) {
        dishRef.current.rotation.y += delta * 0.2;
        dishRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.2 - 0.2;
    }
    if (fanRef.current) {
        fanRef.current.rotation.y += delta * 5;
    }
  });

  return (
    <group position={[0, 0, 0]}>
        <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[3, 3.5, 1, 6]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
            <Edges color={teamColor} />
        </mesh>
        {[0, Math.PI/3, 2*Math.PI/3].map((r, i) => (
            <mesh key={i} position={[0, 0.5, 0]} rotation={[0, r, 0]}>
                 <boxGeometry args={[5.5, 0.6, 0.5]} />
                 <meshStandardMaterial color="#334155" />
            </mesh>
        ))}
        <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.8, 1.2, 5, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
        {[0, Math.PI/2, Math.PI, -Math.PI/2].map((r, i) => (
             <group key={i} rotation={[0, r, 0]}>
                 <mesh position={[1.2, 2, 0]} rotation={[0, 0, -0.1]}>
                      <boxGeometry args={[0.4, 4, 0.4]} />
                      <meshStandardMaterial color="#475569" />
                 </mesh>
                 <mesh position={[1.41, 2, 0]} rotation={[0, 0, -0.1]}>
                      <boxGeometry args={[0.1, 3, 0.1]} />
                      <meshBasicMaterial color={color} />
                 </mesh>
             </group>
        ))}
        <group position={[0, 6, 0]} ref={dishRef}>
             <mesh rotation={[0, 0, Math.PI/2]}>
                  <cylinderGeometry args={[0.5, 0.5, 2, 8]} />
                  <meshStandardMaterial color="#1e293b" />
             </mesh>
             <group position={[0, 0.5, 0]} rotation={[-Math.PI/4, 0, 0]}>
                 <mesh>
                     <cylinderGeometry args={[2.5, 1, 0.5, 16]} />
                     <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
                     <Edges color={color} />
                 </mesh>
                 <mesh position={[0, 0.26, 0]}>
                     <circleGeometry args={[2, 16]} />
                     <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
                 </mesh>
                 <mesh position={[0, 1, 0]}>
                     <cylinderGeometry args={[0.1, 0.2, 2]} />
                     <meshStandardMaterial color="#cbd5e1" metalness={1} />
                 </mesh>
                 <pointLight color={color} intensity={2} distance={10} position={[0, 2, 0]} />
             </group>
        </group>
        <group position={[0, 4.5, 0]}>
             {[0, Math.PI].map((r, i) => (
                 <group key={i} rotation={[0, r, 0]}>
                     <mesh position={[1.2, 0, 0]} rotation={[0, 0, -Math.PI/4]}>
                         <cylinderGeometry args={[0.1, 0.1, 2]} />
                         <meshStandardMaterial color="#94a3b8" />
                     </mesh>
                     <mesh position={[1.8, 0.8, 0]}>
                         <sphereGeometry args={[0.2]} />
                         <meshBasicMaterial color={teamColor} />
                     </mesh>
                 </group>
             ))}
        </group>
    </group>
  );
}

const BarracksModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
    return (
        <group position={[0, 0, 0]}>
            <mesh position={[0, 0.25, 0]}>
                <boxGeometry args={[7, 0.5, 5]} />
                <meshStandardMaterial color="#1e293b" />
                <Edges color={teamColor} />
            </mesh>
            <mesh position={[0, 1.75, 0]}>
                <boxGeometry args={[6, 2.5, 4]} />
                <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.6} />
            </mesh>
            {[[-3, -2], [3, -2], [-3, 2], [3, 2]].map((pos, i) => (
                <mesh key={i} position={[pos[0], 1.5, pos[1]]}>
                    <boxGeometry args={[0.8, 3, 0.8]} />
                    <meshStandardMaterial color="#475569" metalness={0.6} />
                    <Edges color="#000000" />
                </mesh>
            ))}
            <group position={[0, 3, 0]}>
                <mesh rotation={[0, 0, Math.PI/2]}>
                     <cylinderGeometry args={[2, 2, 6, 3]} />
                     <meshStandardMaterial color="#1e293b" metalness={0.7} />
                </mesh>
                {[ -1.5, 0, 1.5 ].map((x, i) => (
                    <mesh key={i} position={[x, 1, -0.5]} rotation={[0.2, 0, 0]}>
                        <boxGeometry args={[0.8, 0.5, 0.8]} />
                        <meshStandardMaterial color="#475569" />
                        <mesh position={[0, 0, 0.41]}>
                             <planeGeometry args={[0.6, 0.3]} />
                             <meshBasicMaterial color="#000000" />
                        </mesh>
                    </mesh>
                ))}
            </group>
            <group position={[0, 1, 2.1]}>
                <mesh>
                    <boxGeometry args={[3.2, 2.2, 0.4]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>
                <mesh position={[0, 0, 0.1]}>
                    <planeGeometry args={[2.8, 1.8]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
                </mesh>
                <mesh position={[0, -0.8, 0.11]}>
                     <planeGeometry args={[2.8, 0.2]} />
                     <meshBasicMaterial color="#fbbf24" />
                </mesh>
                <mesh position={[0, 1.2, 0]}>
                    <boxGeometry args={[1, 0.2, 0.2]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            </group>
            <group position={[0, 3.5, 2]}>
                <mesh rotation={[0, 0, 0]}>
                    <planeGeometry args={[1.5, 1.5]} />
                    <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
                </mesh>
                <group scale={[0.5, 0.5, 0.5]} position={[0, 0, 0.01]}>
                    <mesh position={[0, 0.5, 0]}>
                        <circleGeometry args={[0.3, 16]} />
                        <meshBasicMaterial color={color} transparent opacity={0.8} />
                    </mesh>
                    <mesh position={[0, -0.2, 0]}>
                         <planeGeometry args={[0.8, 0.6]} />
                         <meshBasicMaterial color={color} transparent opacity={0.6} />
                    </mesh>
                </group>
                <mesh position={[0, -0.8, 0]}>
                    <boxGeometry args={[1.6, 0.2, 0.4]} />
                    <meshStandardMaterial color="#334155" />
                </mesh>
            </group>
        </group>
    )
}

const FactoryModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
    return (
        <group position={[0, 0, 0]}>
             <mesh position={[0, 2, 0]}>
                 <boxGeometry args={[7, 4, 6]} />
                 <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
                 <Edges color="#1e293b" />
             </mesh>
             <group position={[0, 4, 0]}>
                 <mesh>
                     <boxGeometry args={[6.5, 0.5, 5.5]} />
                     <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 {[-1.5, 0, 1.5].map((z, i) => (
                      <mesh key={i} position={[0, 0.26, z]} rotation={[-Math.PI/2, 0, 0]}>
                          <planeGeometry args={[5, 1]} />
                          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.3} />
                      </mesh>
                 ))}
             </group>
             {[-3.6, 3.6].map(x => (
                 <group key={x} position={[x, 2, 0]}>
                     <mesh>
                         <boxGeometry args={[0.4, 4.5, 6.2]} />
                         <meshStandardMaterial color="#1e293b" />
                         <Edges color={teamColor} />
                     </mesh>
                     <mesh position={[x > 0 ? 0.21 : -0.21, -1, 0]} rotation={[0, x > 0 ? Math.PI/2 : -Math.PI/2, 0]}>
                         <planeGeometry args={[6, 0.5]} />
                         <meshBasicMaterial color="#fbbf24" />
                     </mesh>
                 </group>
             ))}
             {[
                 {x: -2, z: -2.2}, {x: 0, z: -2.2}, {x: 2, z: -2.2}
             ].map((pos, i) => (
                 <group key={i} position={[pos.x, 4, pos.z]}>
                     <mesh>
                         <cylinderGeometry args={[0.5, 0.7, 3, 16]} />
                         <meshStandardMaterial color="#475569" metalness={0.7} />
                     </mesh>
                     <mesh position={[0, 1.5, 0]}>
                         <torusGeometry args={[0.5, 0.1, 8, 16]} rotation={[Math.PI/2, 0, 0]} />
                         <meshStandardMaterial color="#1e293b" />
                     </mesh>
                     <group position={[0, 2.5, 0]}>
                         <mesh position={[0.2, 0, 0]}>
                             <dodecahedronGeometry args={[0.4]} />
                             <meshBasicMaterial color="#cbd5e1" transparent opacity={0.3} />
                         </mesh>
                         <mesh position={[-0.2, 0.6, 0.1]}>
                             <dodecahedronGeometry args={[0.5]} />
                             <meshBasicMaterial color="#cbd5e1" transparent opacity={0.2} />
                         </mesh>
                         <mesh position={[0, 1.2, -0.1]}>
                             <dodecahedronGeometry args={[0.6]} />
                             <meshBasicMaterial color="#cbd5e1" transparent opacity={0.1} />
                         </mesh>
                     </group>
                 </group>
             ))}
             <group position={[0, 1.5, 3.05]}>
                 <mesh>
                     <planeGeometry args={[5, 3]} />
                     <meshStandardMaterial color="#1e293b" metalness={0.8} />
                 </mesh>
                 {[0, 0.5, 1, 1.5, 2, 2.5].map((y, i) => (
                      <mesh key={i} position={[0, y - 1.5, 0.05]}>
                          <boxGeometry args={[4.8, 0.45, 0.1]} />
                          <meshStandardMaterial color="#334155" />
                      </mesh>
                 ))}
                 <mesh position={[2.8, 1, 0]}>
                      <boxGeometry args={[0.3, 0.6, 0.2]} />
                      <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <mesh position={[2.8, 1, 0.11]}>
                      <planeGeometry args={[0.2, 0.4]} />
                      <meshBasicMaterial color={color} />
                 </mesh>
             </group>
             <group position={[3.8, 1, 1]} rotation={[0, 0, -0.2]}>
                  <mesh position={[0, 0.5, 0]}>
                      <boxGeometry args={[0.5, 1, 0.5]} />
                      <meshStandardMaterial color="#334155" />
                  </mesh>
                  <group position={[0, 1, 0]} rotation={[0, 0, -0.5]}>
                       <mesh position={[0, 0.6, 0]}>
                           <boxGeometry args={[0.3, 1.2, 0.3]} />
                           <meshStandardMaterial color="#f59e0b" />
                       </mesh>
                       <group position={[0, 1.2, 0]} rotation={[0, 0, 1.5]}>
                            <mesh position={[0, 0.6, 0]}>
                                <boxGeometry args={[0.25, 1.2, 0.25]} />
                                <meshStandardMaterial color="#f59e0b" />
                            </mesh>
                            <mesh position={[0, 1.2, 0]}>
                                <coneGeometry args={[0.1, 0.3, 8]} />
                                <meshBasicMaterial color="#38bdf8" />
                            </mesh>
                            <pointLight position={[0, 1.3, 0]} color="#38bdf8" intensity={1} distance={3} />
                       </group>
                  </group>
             </group>
             <mesh position={[-3.51, 3, 1]}>
                 <cylinderGeometry args={[0.6, 0.6, 0.2, 16]} rotation={[0, 0, Math.PI/2]} />
                 <meshStandardMaterial color="#0f172a" />
             </mesh>
             <mesh position={[-3.52, 3, 1]} rotation={[0, 0, Math.PI/2]}>
                 <circleGeometry args={[0.5, 32]} />
                 <meshBasicMaterial color="#000000" transparent opacity={0.5} />
             </mesh>
        </group>
    )
}

const MunitionsModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
  return (
    <group position={[0, 0, 0]}>
        <mesh position={[0, 1, 0]}>
            <boxGeometry args={[7, 2, 7]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            <Edges color="#1e293b" />
        </mesh>
        {[[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]].map((pos, i) => (
             <mesh key={i} position={[pos[0], 1, pos[1]]}>
                 <boxGeometry args={[1.5, 2.2, 1.5]} />
                 <meshStandardMaterial color="#1e293b" />
                 <Edges color={teamColor} />
                 <mesh position={[0, 0.8, 0]}>
                     <boxGeometry args={[0.2, 0.8, 0.2]} />
                     <meshBasicMaterial color={color} />
                 </mesh>
             </mesh>
        ))}
        {[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map((pos, i) => (
            <group key={i} position={[pos[0], 2.01, pos[1]]}>
                <mesh rotation={[-Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[1.4, 1.4, 0.2, 32]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.11, 0]}>
                    <ringGeometry args={[1.0, 1.3, 32]} />
                    <meshBasicMaterial color="#fbbf24" />
                </mesh>
                <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI/4, 0]}>
                    <boxGeometry args={[2.6, 0.1, 0.2]} />
                    <meshStandardMaterial color="#1e293b" />
                </mesh>
                <pointLight color={color} intensity={1} distance={3} position={[0, 1, 0]} />
            </group>
        ))}
        {[0, Math.PI/2, Math.PI, -Math.PI/2].map((rot, i) => (
             <group key={i} rotation={[0, rot, 0]}>
                 <mesh position={[3.6, 1, 0]}>
                     <boxGeometry args={[0.5, 1, 3]} />
                     <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <mesh position={[3.9, 1, 0]}>
                     <planeGeometry args={[0.1, 2.5]} />
                     <meshBasicMaterial color={color} />
                 </mesh>
             </group>
        ))}
        <group position={[-2.5, 2.5, 2.5]}>
             <mesh>
                 <cylinderGeometry args={[0.8, 1, 1, 8]} />
                 <meshStandardMaterial color="#1e293b" />
             </mesh>
             <mesh position={[0, 0.5, 0]} rotation={[0.5, 0.5, 0]}>
                 <cylinderGeometry args={[0.8, 0.1, 0.2]} />
                 <meshStandardMaterial color="#64748b" />
             </mesh>
        </group>
    </group>
  );
}

const AirpadModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
    const radarRef = useRef<THREE.Group>(null);
    useFrame((state, delta) => {
        if(radarRef.current) radarRef.current.rotation.y += delta;
    });

    return (
        <group>
            <mesh position={[0, 0.25, 0]}>
                <boxGeometry args={[7.5, 0.5, 7.5]} />
                <meshStandardMaterial color="#1e293b" />
                <Edges color={teamColor} />
            </mesh>
            <mesh position={[0, 0.51, 0]} rotation={[-Math.PI/2, 0, 0]}>
                 <planeGeometry args={[6.5, 6.5]} />
                 <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>
            <group position={[0, 0.52, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <mesh>
                    <ringGeometry args={[2.5, 2.7, 32]} />
                    <meshBasicMaterial color={color} />
                </mesh>
                <mesh>
                    <planeGeometry args={[0.4, 2]} />
                    <meshBasicMaterial color={color} />
                </mesh>
                 <mesh rotation={[0, 0, Math.PI/2]}>
                    <planeGeometry args={[0.4, 2]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            </group>
            {[[-3.75, -3.75], [3.75, -3.75], [-3.75, 3.75]].map((pos, i) => (
                 <mesh key={i} position={[pos[0], 0.5, pos[1]]}>
                     <boxGeometry args={[0.5, 0.5, 0.5]} />
                     <meshStandardMaterial color="#1e293b" />
                     <mesh position={[0, 0.3, 0]}>
                         <sphereGeometry args={[0.2]} />
                         <meshBasicMaterial color={color} />
                     </mesh>
                     <pointLight color={color} distance={4} intensity={2} position={[0, 1, 0]} />
                 </mesh>
            ))}
            <group position={[3, 2, 3]}>
                 <mesh position={[0, -1, 0]}>
                     <cylinderGeometry args={[1, 1.2, 2, 6]} />
                     <meshStandardMaterial color="#334155" />
                     <Edges color={teamColor} />
                 </mesh>
                 <mesh position={[0, 0.5, 0]}>
                     <cylinderGeometry args={[1.4, 1, 0.8, 6]} />
                     <meshStandardMaterial color="#0ea5e9" transparent opacity={0.6} />
                 </mesh>
                 <mesh position={[0, 1.1, 0]}>
                     <cylinderGeometry args={[1.2, 1.4, 0.4, 6]} />
                     <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <group ref={radarRef} position={[0, 1.5, 0]}>
                     <mesh rotation={[0.2, 0, 0]}>
                         <cylinderGeometry args={[0.8, 0.1, 0.6, 16, 1, false, 0, Math.PI]} />
                         <meshStandardMaterial color="#94a3b8" side={THREE.DoubleSide} />
                     </mesh>
                     <mesh rotation={[0.2, 0, 0]} position={[0, 0, 0.1]}>
                          <boxGeometry args={[0.1, 0.1, 0.5]} />
                          <meshStandardMaterial color="#1e293b" />
                     </mesh>
                 </group>
            </group>
        </group>
    );
}

const DepotModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
    return (
        <group>
             <mesh position={[0, 0.3, 0]}>
                 <boxGeometry args={[7.5, 0.6, 7.5]} />
                 <meshStandardMaterial color="#1e293b" />
                 <Edges color={teamColor} />
             </mesh>
             <mesh position={[0, 0.61, 0]} rotation={[-Math.PI/2, 0, 0]}>
                 <planeGeometry args={[6.5, 6.5]} />
                 <meshStandardMaterial color="#0f172a" roughness={0.8} />
             </mesh>
             <mesh position={[-1.5, 0.62, 1.5]} rotation={[-Math.PI/2, 0, 0]}>
                 <planeGeometry args={[3, 3]} />
                 <meshBasicMaterial color="#fbbf24" transparent opacity={0.2} />
                 <Edges color="#fbbf24" />
             </mesh>
             <Html position={[-1.5, 0.65, 1.5]} transform rotation={[-Math.PI/2, 0, 0]} scale={[0.5, 0.5, 0.5]}>
                 <div className="text-yellow-500 font-mono font-bold text-4xl border-4 border-yellow-500 p-2">LOADING ZONE</div>
             </Html>
             <group position={[2.5, 0, -2.5]}>
                 <mesh position={[0, 2.5, 0]}>
                     <boxGeometry args={[1, 5, 1]} />
                     <meshStandardMaterial color="#475569" />
                     <Edges color="#000000" />
                 </mesh>
                 <mesh position={[0.51, 2.5, 0]} rotation={[0, 0, Math.PI/2]}>
                     <planeGeometry args={[4, 0.8]} />
                     <meshBasicMaterial color="#fbbf24" />
                 </mesh>
                 <group position={[0, 5, 0]} rotation={[0, Math.PI/1.5, 0]}>
                      <mesh position={[0, 0, 2.5]}>
                          <boxGeometry args={[0.8, 0.8, 7]} />
                          <meshStandardMaterial color="#475569" />
                      </mesh>
                      <mesh position={[0, 0, -2]}>
                          <boxGeometry args={[1.2, 1.2, 1.5]} />
                          <meshStandardMaterial color="#1e293b" />
                      </mesh>
                      <mesh position={[0.6, 0.2, 0]}>
                          <boxGeometry args={[0.8, 0.8, 1]} />
                          <meshStandardMaterial color="#0ea5e9" transparent opacity={0.6} />
                      </mesh>
                      <group position={[0, -0.4, 4]}>
                           <mesh position={[0, -1.5, 0]}>
                               <cylinderGeometry args={[0.05, 0.05, 3]} />
                               <meshBasicMaterial color="#000000" />
                           </mesh>
                           <mesh position={[0, -3, 0]}>
                               <boxGeometry args={[1.2, 1.2, 1.2]} />
                               <meshStandardMaterial color="#cbd5e1" />
                               <Edges color={teamColor} />
                               <mesh>
                                   <boxGeometry args={[1, 1, 1]} />
                                   <meshBasicMaterial color={color} transparent opacity={0.5} />
                               </mesh>
                           </mesh>
                      </group>
                 </group>
             </group>
             <group position={[-2.5, 1, -2.5]}>
                 <mesh>
                     <boxGeometry args={[1.5, 1.5, 1.5]} />
                     <meshStandardMaterial color="#334155" />
                     <Edges color={teamColor} />
                 </mesh>
                 <mesh position={[1, -0.3, 0.5]}>
                     <boxGeometry args={[1, 0.8, 1.2]} />
                     <meshStandardMaterial color="#475569" />
                 </mesh>
             </group>
             <group position={[2.8, 1.5, 2.8]}>
                 <mesh>
                     <boxGeometry args={[1.5, 2.5, 1.5]} />
                     <meshStandardMaterial color="#334155" />
                 </mesh>
                 <mesh position={[-0.4, 0.5, 0.76]}>
                     <planeGeometry args={[0.6, 0.6]} />
                     <meshStandardMaterial color="#0ea5e9" />
                 </mesh>
                 <mesh position={[0, 1.5, 0]}>
                     <cylinderGeometry args={[0.1, 0.1, 1]} />
                     <meshStandardMaterial color="#94a3b8" />
                 </mesh>
             </group>
        </group>
    );
}

const OrdnanceFabModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[5, 1, 5]} />
        <meshStandardMaterial color="#1e293b" />
        <Edges color={teamColor} />
      </mesh>

      {/* 4 Heavy Struts */}
      {[45, 135, 225, 315].map((angle, i) => {
        const rad = angle * Math.PI / 180;
        const x = Math.cos(rad) * 2;
        const z = Math.sin(rad) * 2;
        return (
          <group key={i} position={[x, 3, z]} rotation={[0, -rad, 0]}>
             <mesh>
                 <boxGeometry args={[1, 5, 1]} />
                 <meshStandardMaterial color="#334155" metalness={0.6} />
             </mesh>
             <mesh position={[0, 0, -0.51]}>
                 <planeGeometry args={[0.2, 4]} />
                 <meshBasicMaterial color={color} />
             </mesh>
          </group>
        )
      })}

      {/* Central Core (Glowing) */}
      <group position={[0, 3, 0]}>
          <mesh>
              <cylinderGeometry args={[1.5, 1.5, 4.5, 16]} />
              <meshStandardMaterial color="#0f172a" />
          </mesh>
          {[-1.5, -0.5, 0.5, 1.5].map((y, i) => (
              <mesh key={i} position={[0, y, 0]}>
                  <cylinderGeometry args={[1.55, 1.55, 0.2, 16]} />
                  <meshBasicMaterial color={teamColor} toneMapped={false} />
              </mesh>
          ))}
          {[0, 90, 180, 270].map((deg, i) => (
              <mesh key={i} rotation={[0, deg * Math.PI/180, 0]} position={[0, 0, 0]}>
                  <boxGeometry args={[0.2, 4, 3]} />
                  <meshBasicMaterial color={color} transparent opacity={0.5} />
              </mesh>
          ))}
      </group>

      {/* Top Emitter (Angled) */}
      <group position={[0, 6, 0]} rotation={[-Math.PI/6, 0, 0]}>
           <mesh position={[0, 0.5, 0]}>
               <cylinderGeometry args={[1.2, 1.5, 2, 8]} />
               <meshStandardMaterial color="#334155" />
           </mesh>
           <mesh position={[0, 1.51, 0]}>
               <circleGeometry args={[0.8, 16]} />
               <meshBasicMaterial color="#ffffff" />
           </mesh>
           <pointLight position={[0, 2, 0]} color={color} distance={10} intensity={2} />
      </group>
    </group>
  )
}

const DefenseTurretModel = ({ color, teamColor }: { color: string, teamColor: string }) => {
    const headRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if(headRef.current) {
            headRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
        }
    });

    return (
        <group>
            {/* Quad Legs Base */}
            <group position={[0, 0.5, 0]}>
                {[45, 135, 225, 315].map((deg, i) => (
                    <group key={i} rotation={[0, deg * Math.PI/180, 0]}>
                        <mesh position={[0, 0, 1.5]}>
                            <boxGeometry args={[1, 1, 2]} />
                            <meshStandardMaterial color="#334155" />
                            <Edges color="#000000" />
                        </mesh>
                        <mesh position={[0, -0.5, 2.2]}>
                            <boxGeometry args={[1.2, 0.5, 1.2]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                    </group>
                ))}
                <mesh>
                    <cylinderGeometry args={[2, 2.5, 1.5, 8]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[0, 0.2, 0]}>
                    <ringGeometry args={[1.8, 2, 8]} rotation={[-Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color={teamColor} />
                </mesh>
            </group>

            {/* Rotating Head */}
            <group ref={headRef} position={[0, 2, 0]}>
                <mesh>
                    <boxGeometry args={[2.5, 1.5, 3]} />
                    <meshStandardMaterial color="#334155" metalness={0.7} />
                </mesh>
                
                <mesh position={[0.5, 1, -0.5]}>
                    <boxGeometry args={[1, 0.8, 1]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[0.5, 1, 0.01]}>
                    <planeGeometry args={[0.8, 0.6]} />
                    <meshBasicMaterial color={color} />
                </mesh>

                <group position={[0, 0, 1.5]}>
                    <mesh position={[-0.6, 0, 1]}>
                        <boxGeometry args={[0.6, 0.6, 2.5]} />
                        <meshStandardMaterial color="#64748b" />
                    </mesh>
                    <mesh position={[0.6, 0, 1]}>
                        <boxGeometry args={[0.6, 0.6, 2.5]} />
                        <meshStandardMaterial color="#64748b" />
                    </mesh>
                    
                    <mesh position={[-0.6, 0, 2.26]}>
                        <planeGeometry args={[0.4, 0.4]} />
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </mesh>
                    <mesh position={[0.6, 0, 2.26]}>
                        <planeGeometry args={[0.4, 0.4]} />
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </mesh>
                </group>
            </group>
        </group>
    )
}

const WallTier1Model = ({ color, teamColor, width }: { color: string, teamColor: string, width: number }) => {
    return (
        <group>
            {[-1, 1].map((dir, i) => (
                <group key={i} position={[dir * (width / 2 - 1), 2, 0]}>
                    <mesh>
                        <boxGeometry args={[1.5, 4, 1.5]} />
                        <meshStandardMaterial color="#334155" metalness={0.8} />
                        <Edges color="#475569" />
                    </mesh>
                    <mesh position={[0, -2.5, 0]}>
                        <boxGeometry args={[2, 1, 2]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                    <mesh position={[0, 2.1, 0]}>
                        <cylinderGeometry args={[0.4, 0.4, 0.4, 8]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    <mesh position={[0, 2.4, 0]}>
                        <sphereGeometry args={[0.3]} />
                        <meshBasicMaterial color="#ef4444" />
                    </mesh>
                    
                    <mesh position={[-dir * 0.76, 0, 0]}>
                        <boxGeometry args={[0.1, 3, 0.5]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    <mesh position={[-dir * 0.8, 0, 0]}>
                        <planeGeometry args={[0.1, 2.8]} rotation={[0, dir * Math.PI/2, 0]} />
                        <meshBasicMaterial color={color} toneMapped={false} />
                    </mesh>
                </group>
            ))}

            <mesh position={[0, 2, 0]}>
                <planeGeometry args={[width - 3, 3]} />
                <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
            </mesh>
            <group position={[0, 2, 0]}>
                 {[0.5, 0, -0.5, -1].map((y, i) => (
                     <mesh key={`h-${i}`} position={[0, y, 0]}>
                         <boxGeometry args={[width - 3, 0.05, 0.05]} />
                         <meshBasicMaterial color={color} toneMapped={false} />
                     </mesh>
                 ))}
                 {[-3, -1.5, 0, 1.5, 3].map((x, i) => (
                     <mesh key={`v-${i}`} position={[x, 0, 0]}>
                         <boxGeometry args={[0.05, 3, 0.05]} />
                         <meshBasicMaterial color={color} toneMapped={false} />
                     </mesh>
                 ))}
            </group>
            
            <mesh position={[0, 2, 0]} rotation={[0, 0, 0.1]}>
                 <planeGeometry args={[width-4, 0.1]} />
                 <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
             <mesh position={[0, 1, 0]} rotation={[0, 0, -0.1]}>
                 <planeGeometry args={[width-4, 0.1]} />
                 <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
        </group>
    )
}

const WallTier2Model = ({ color, teamColor, width }: { color: string, teamColor: string, width: number }) => {
    return (
        <group>
            {/* Main Wall Mass */}
            <mesh position={[0, 2, 0]}>
                <boxGeometry args={[width, 4, 1.2]} />
                <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
                <Edges color="#1e293b" threshold={30} />
            </mesh>

            {/* Segment Separators (Grooves) */}
            {[-1, 1].map((x, i) => (
                <mesh key={i} position={[x * (width / 6), 2, 0]}>
                    <boxGeometry args={[0.1, 4.1, 1.3]} />
                    <meshStandardMaterial color="#0f172a" />
                </mesh>
            ))}

            {/* Heavy Feet */}
            {[-1.5, -0.5, 0.5, 1.5].map((x, i) => (
                <group key={i} position={[x * (width / 4), 0, 0]}>
                    {/* Front Foot */}
                    <mesh position={[0, 0.5, 0.7]}>
                        <boxGeometry args={[0.5, 1, 0.6]} />
                        <meshStandardMaterial color="#475569" metalness={0.6} />
                    </mesh>
                    <mesh position={[0, 0.25, 0.9]} rotation={[Math.PI/4, 0, 0]}>
                        <boxGeometry args={[0.5, 0.5, 0.2]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                    
                    {/* Back Foot */}
                    <mesh position={[0, 0.5, -0.7]}>
                        <boxGeometry args={[0.5, 1, 0.6]} />
                        <meshStandardMaterial color="#475569" metalness={0.6} />
                    </mesh>
                    <mesh position={[0, 0.25, -0.9]} rotation={[-Math.PI/4, 0, 0]}>
                        <boxGeometry args={[0.5, 0.5, 0.2]} />
                        <meshStandardMaterial color="#475569" />
                    </mesh>
                </group>
            ))}

            {/* Spikes on Top */}
            {Array.from({ length: 8 }).map((_, i) => {
                const x = (i - 3.5) * (width / 8);
                return (
                    <mesh key={i} position={[x, 4.3, 0]} rotation={[0, Math.PI/4, 0]}>
                        <coneGeometry args={[0.3, 0.6, 4]} />
                        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
                    </mesh>
                );
            })}

            {/* Glowing Vents */}
            {/* Front Side */}
            <group position={[0, 0, 0.61]}>
                {[-1.2, 0, 1.2].map((x, i) => (
                    <group key={i} position={[x, 0, 0]}>
                        {/* Upper Vent (Blue/Team) */}
                        <mesh position={[0, 3, 0]}>
                            <boxGeometry args={[0.8, 0.2, 0.05]} />
                            <meshBasicMaterial color={teamColor} />
                        </mesh>
                        {/* Lower Vent (Orange/Accent) */}
                        <mesh position={[0, 1.5, 0]}>
                            <boxGeometry args={[0.4, 0.15, 0.05]} />
                            <meshBasicMaterial color="#f97316" />
                        </mesh>
                        {/* Armored Plate */}
                        <mesh position={[0, 2.2, 0.05]}>
                            <boxGeometry args={[1, 1, 0.1]} />
                            <meshStandardMaterial color="#475569" metalness={0.5} />
                        </mesh>
                    </group>
                ))}
            </group>

            {/* Back Side (Mirrored Vents) */}
            <group position={[0, 0, -0.61]} rotation={[0, Math.PI, 0]}>
                {[-1.2, 0, 1.2].map((x, i) => (
                    <group key={i} position={[x, 0, 0]}>
                        <mesh position={[0, 3, 0]}>
                            <boxGeometry args={[0.8, 0.2, 0.05]} />
                            <meshBasicMaterial color={teamColor} />
                        </mesh>
                        <mesh position={[0, 1.5, 0]}>
                            <boxGeometry args={[0.4, 0.15, 0.05]} />
                            <meshBasicMaterial color="#f97316" />
                        </mesh>
                         <mesh position={[0, 2.2, 0.05]}>
                            <boxGeometry args={[1, 1, 0.1]} />
                            <meshStandardMaterial color="#475569" metalness={0.5} />
                        </mesh>
                    </group>
                ))}
            </group>
        </group>
    )
}

const Structure: React.FC<StructureProps> = ({ data, tileSize, offset, onRightClick, onDoubleClick, onClick, menuOpen, onAction, hasMason, resources = 0 }) => {
  const config = STRUCTURE_INFO[data.type];
  const teamColor = TEAM_COLORS[data.team];

  const position = useMemo(() => [
    (data.gridPos.x * tileSize) - offset,
    0,
    (data.gridPos.z * tileSize) - offset
  ] as [number, number, number], [data.gridPos, tileSize, offset]);

  const handleRightClick = (e: any) => {
    e.stopPropagation();
    if (onRightClick) onRightClick(data.gridPos.x, data.gridPos.z);
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(data.id);
  }

  const handleClick = (e: any) => {
      e.stopPropagation();
      if (onClick) onClick(data.id);
  }

  // Depot Menu Content
  const renderMenu = () => {
    if (!menuOpen) return null;
    
    // Determine buildable units based on structure type
    const buildableUnits: UnitType[] = [];
    const productionTypes: string[] = ['support', 'infantry', 'armor', 'ordnance', 'air', 'builder'];
    
    if (productionTypes.includes(data.type)) {
        // Find units that match this class
        (Object.keys(UNIT_STATS) as UnitType[]).forEach(uType => {
            if (UNIT_STATS[uType].unitClass === data.type && uType !== 'defense_drone') {
                buildableUnits.push(uType);
            }
        });
    }

    // Engineering Build List (Walls) for Depot
    const engineeringItems: StructureType[] = ['wall_tier1', 'wall_tier2', 'defense'];

    return (
        <Html position={[0, 15, 0]} center zIndexRange={[200, 0]}>
            <div className="bg-slate-900/95 border border-yellow-500 rounded-lg shadow-[0_0_30px_rgba(234,179,8,0.3)] backdrop-blur min-w-[220px] overflow-hidden flex flex-col pointer-events-auto">
                <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span className="text-yellow-400 font-mono font-bold text-xs uppercase">{config.label}</span>
                    <span className="text-[10px] text-white font-mono">{Math.floor(resources || 0)} Cores</span>
                </div>
                <div className="p-2 flex flex-col gap-1">
                    
                    {/* Unit Production Section */}
                    {buildableUnits.length > 0 && (
                        <>
                            <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1">Production</div>
                            {buildableUnits.map(uType => {
                                const stats = UNIT_STATS[uType];
                                const cost = stats.cost || 0;
                                const canAfford = (resources || 0) >= cost;
                                return (
                                    <button
                                        key={uType}
                                        disabled={!canAfford}
                                        onClick={(e) => { e.stopPropagation(); onAction && onAction('BUILD_UNIT', uType); }}
                                        className={`
                                            flex items-center justify-between px-3 py-2 text-left transition-colors rounded text-xs font-mono
                                            ${canAfford 
                                                ? 'hover:bg-slate-700 text-slate-200' 
                                                : 'opacity-50 text-slate-500 cursor-not-allowed'}
                                        `}
                                    >
                                        <div className="flex gap-2 items-center">
                                            <span style={{ color: teamColor }}>{UNIT_CLASSES[stats.unitClass].icon}</span>
                                            {stats.label}
                                        </div>
                                        <span>{cost}</span>
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {/* Engineering Section (Depot Only) */}
                    {data.type === 'builder' && (
                        <>
                            <div className="text-[10px] text-slate-400 font-mono uppercase mb-1 px-1 mt-2 border-t border-slate-700 pt-1">Defensive Structures</div>
                            {engineeringItems.map(type => {
                                const info = STRUCTURE_INFO[type];
                                const canAfford = (resources || 0) >= info.cost;
                                return (
                                    <button
                                        key={type}
                                        disabled={!canAfford || !hasMason}
                                        onClick={(e) => { e.stopPropagation(); onAction && onAction('SELECT_WALL', type); }}
                                        className={`
                                            flex items-center justify-between px-3 py-2 text-left transition-colors rounded text-xs font-mono
                                            ${(canAfford && hasMason)
                                                ? 'hover:bg-slate-700 text-slate-200' 
                                                : 'opacity-50 text-slate-500 cursor-not-allowed'}
                                        `}
                                    >
                                        <div className="flex gap-2 items-center">
                                            <span style={{ color: info.color }}>■</span>
                                            {info.label}
                                        </div>
                                        <span>{info.cost}</span>
                                    </button>
                                );
                            })}
                            {!hasMason && (
                                <div className="mt-1 text-[9px] text-red-400 px-2 italic">
                                    Requires Combat Engineer unit.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Html>
    );
  };

  const renderProgressBar = (heightOffset: number = 4) => {
    if (!data.isBlueprint) return null;
    const pct = Math.min(100, Math.floor((data.constructionProgress / data.maxProgress) * 100));
    
    return (
        <Html position={[0, heightOffset, 0]} center zIndexRange={[100, 0]}>
            <div className="flex flex-col items-center pointer-events-none select-none">
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-600 px-2 py-1 rounded mb-1 shadow-lg">
                     <div className="text-[10px] font-mono text-yellow-400 font-bold whitespace-nowrap mb-0.5">
                         CONSTRUCTING {pct}%
                     </div>
                     <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                         <div 
                            className="h-full bg-yellow-400 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                         />
                     </div>
                 </div>
                 <div className="w-px h-4 bg-yellow-400/50"></div>
            </div>
        </Html>
    );
  };

  // Determine which model to render
  const renderModel = () => {
    // 1. Custom Models
    if (data.type === 'support') {
        return <group scale={[2.2, 2.2, 2.2]}><CommLinkModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'infantry') {
        return <group scale={[1.9, 1.9, 1.9]}><BarracksModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'armor') {
        return <group scale={[1.9, 1.9, 1.9]}><FactoryModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'ordnance') {
        return <group scale={[1.9, 1.9, 1.9]}><MunitionsModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'air') {
        return <group scale={[1.75, 1.75, 1.75]}><AirpadModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'builder') {
        return <group scale={[1.75, 1.75, 1.75]}><DepotModel color={config.color} teamColor={teamColor} /></group>;
    }
    if (data.type === 'ordnance_fab') {
        return <group scale={[2.5, 2.5, 2.5]}><OrdnanceFabModel color={config.color} teamColor={teamColor} /></group>;
    }

    // 2. Specialized Existing Models
    if (data.type === 'wall_tier1') {
        return (
            <group>
            {data.isBlueprint && (
                <mesh position={[0, config.height/2, 0]}>
                    <boxGeometry args={[tileSize * 0.9, config.height, tileSize * 0.1]} />
                    <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.3} />
                </mesh>
            )}
            
            {!data.isBlueprint && (
                <WallTier1Model color={config.color} teamColor={teamColor} width={tileSize * 0.9} />
            )}
            {renderProgressBar(config.height + 2)}
            </group>
        );
    }

    if (data.type === 'wall_tier2') {
        return (
            <group>
            {data.isBlueprint && (
                <mesh position={[0, config.height/2, 0]}>
                    <boxGeometry args={[tileSize, config.height, tileSize * 0.5]} />
                    <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.3} />
                </mesh>
            )}
            
            {!data.isBlueprint && (
                <WallTier2Model color={config.color} teamColor={teamColor} width={tileSize} />
            )}
            {renderProgressBar(config.height + 2)}
            </group>
        );
    }
    
    if (data.type === 'defense') {
        return (
            <group>
                <mesh position={[0, 0.2, 0]}>
                    <cylinderGeometry args={[tileSize * 0.4, tileSize * 0.5, 1, 8]} />
                    <meshStandardMaterial color="#1e293b" />
                    <Edges color={teamColor} />
                </mesh>
                
                {!data.isBlueprint && (
                    <group scale={[2.5, 2.5, 2.5]} position={[0, 1, 0]}>
                        <DefenseTurretModel color={config.color} teamColor={teamColor} />
                    </group>
                )}
                {renderProgressBar(5)}
            </group>
        );
    }

    // Fallback for any missed types (should be none now)
    return (
        <group>
            <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[tileSize * 0.9, 0.5, tileSize * 0.9]} />
                <meshStandardMaterial color="#1e293b" />
                <Edges color={teamColor} />
            </mesh>
            <mesh position={[0, config.height / 2, 0]}>
                <boxGeometry args={[tileSize * 0.6, config.height, tileSize * 0.6]} />
                <meshStandardMaterial color={config.color} metalness={0.6} roughness={0.2} />
                <Edges color="#ffffff" threshold={15} />
            </mesh>
            <group position={[0, config.height + 2, 0]}>
                <mesh rotation={[0, Math.PI / 4, 0]}>
                    <octahedronGeometry args={[1]} />
                    <meshBasicMaterial color={teamColor} wireframe />
                </mesh>
            </group>
        </group>
    );
  };

  return (
    <group position={position} onContextMenu={handleRightClick} onDoubleClick={handleDoubleClick} onClick={handleClick}>
      {renderMenu()}
      {renderModel()}
    </group>
  );
};

export default Structure;
