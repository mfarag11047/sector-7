
import React from 'react';
import { Environment, Lightformer, Stars } from '@react-three/drei';
import { FOG_NEAR, FOG_FAR } from '../constants';
import '../types';

// How strongly the environment lights and is reflected by the scene.
const ENVIRONMENT_INTENSITY = 0.7;
// The ring of sky panels round the horizon, about 50 degrees up: high enough to leave the sides
// of things to the suns, low enough for metal seen from the camera to catch.
const SKY_RING = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4) * 7, Math.sin(k * Math.PI / 4) * 7]);

const Atmosphere: React.FC = () => {
  return (
    <>
      <color attach="background" args={['#050510']} />
      {/* Matches the background colour so distant geometry dissolves into the night
          rather than vanishing at the camera's far plane. */}
      <fog attach="fog" args={['#050510', FOG_NEAR, FOG_FAR]} />
      
      {/* What every surface reflects and is softly lit by: a night sky over the city, built once
          from light panels rather than loaded. Softboxes where the two suns are, so highlights
          agree with the shadows; neon strips low on the horizon in the corner lights' cyan and
          magenta, and a dim amber glow of the city between, which bare metal picks up as rim
          light; and a ring of dim sky all round, a little above the height the camera looks down
          from, so metal seen from any heading has something to catch. Dark below. */}
      <Environment frames={1} resolution={256} environmentIntensity={ENVIRONMENT_INTENSITY}>
        <Lightformer form="rect" intensity={0.22} color="#b4bcc8" position={[0, 9, 0]} scale={[18, 18, 1]} />
        {SKY_RING.map(([x, z], i) => (
          <Lightformer key={i} form="rect" intensity={0.3} color="#c2c9d4" position={[x, 8, z]} scale={[7, 3, 1]} />
        ))}
        <Lightformer form="rect" intensity={2.2} color="#e7fbff" position={[4.8, 7.3, 4.8]} scale={[5, 5, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ddd6fe" position={[-5.4, 7.4, -3.7]} scale={[4, 4, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#0ea5e9" position={[7, 1, 7]} scale={[8, 1, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#d946ef" position={[-7, 1, -7]} scale={[8, 1, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#f59e0b" position={[7, 0.6, -7]} scale={[8, 1, 1]} />
      </Environment>

      {/* Flat fill so a surface still has a readable floor when it faces away from both suns,
          lower now the environment lights the scene too. */}
      <ambientLight intensity={0.42} color="#d5deee" />
      <hemisphereLight args={['#c5e8ff', '#2a2348', 0.85]} />
      
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
