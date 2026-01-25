
import React from 'react';
import { Stars } from '@react-three/drei';
import '../types';

const Atmosphere: React.FC = () => {
  return (
    <>
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 30, 900]} />
      
      <ambientLight intensity={0.4} color="#ffffff" />
      
      {/* Main Moon/City Glow Light - Scaled and shadow mapped for 80x80 grid */}
      <directionalLight 
        position={[400, 600, 400]} 
        intensity={1.2} 
        color="#a5f3fc" 
        castShadow 
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
      />
      
      {/* Cyberpunk accent lights - Scaled out positions */}
      <pointLight position={[-600, 300, -600]} intensity={1.5} color="#d946ef" distance={1500} />
      <pointLight position={[600, 300, 600]} intensity={1.5} color="#0ea5e9" distance={1500} />
      <pointLight position={[0, 400, 0]} intensity={0.8} color="#ffffff" distance={2000} />

      <Stars radius={1200} depth={100} count={15000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};

export default Atmosphere;
