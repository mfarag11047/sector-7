
import React from 'react';
import { Stars } from '@react-three/drei';
import { FOG_NEAR, FOG_FAR } from '../constants';
import '../types';

const Atmosphere: React.FC = () => {
  return (
    <>
      <color attach="background" args={['#050510']} />
      {/* Matches the background colour so distant geometry dissolves into the night
          rather than vanishing at the camera's far plane. */}
      <fog attach="fog" args={['#050510', FOG_NEAR, FOG_FAR]} />
      
      <ambientLight intensity={0.4} color="#ffffff" />
      
      {/* Main Moon/City Glow Light - Scaled and shadow mapped for 80x80 grid */}
      <directionalLight 
        position={[400, 600, 400]} 
        intensity={1.2} 
        color="#a5f3fc" 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
      />
      
      {/* Cyberpunk accent lights - Scaled out positions */}
      <pointLight position={[-600, 300, -600]} intensity={1.5} color="#d946ef" distance={1500} />
      <pointLight position={[600, 300, 600]} intensity={1.5} color="#0ea5e9" distance={1500} />
      <pointLight position={[0, 400, 0]} intensity={0.8} color="#ffffff" distance={2000} />

      {/* Radius has to stay inside CAMERA_FAR or the whole sky gets clipped away, while
          still sitting well above MAX_ZOOM so it reads as sky and not nearby particles. */}
      <Stars radius={700} depth={60} count={6000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};

export default Atmosphere;
