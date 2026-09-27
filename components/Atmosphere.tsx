
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
      
      {/* Flat fill so a surface still has a readable floor when it faces away from both suns. */}
      <ambientLight intensity={0.7} color="#d5deee" />
      <hemisphereLight args={['#c5e8ff', '#2a2348', 1.25]} />
      
      {/* Key light. Shadows stay on this one so the map keeps a direction without doubling the shadow cost. */}
      <directionalLight 
        position={[400, 600, 400]} 
        intensity={1.7} 
        color="#e7fbff" 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
      />
      {/* Opposite fill. The camera can yaw a full circle, and a single sun leaves the far side of every block black. */}
      <directionalLight
        position={[-380, 520, -260]}
        intensity={1.05}
        color="#ddd6fe"
      />
      
      {/* Corner color, kept weak so it tints the night without painting hot spots. */}
      <pointLight position={[-600, 300, -600]} intensity={8} color="#d946ef" distance={1800} decay={2} />
      <pointLight position={[600, 300, 600]} intensity={8} color="#0ea5e9" distance={1800} decay={2} />

      {/* Radius has to stay inside CAMERA_FAR or the whole sky gets clipped away, while
          still sitting well above MAX_ZOOM so it reads as sky and not nearby particles. */}
      <Stars radius={700} depth={60} count={6000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};

export default Atmosphere;
