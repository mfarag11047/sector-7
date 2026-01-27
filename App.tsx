
import React, { Suspense, useState, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import CityMap from './components/CityMap';
import DroneCamera from './components/DroneCamera';
import Atmosphere from './components/Atmosphere';
import UIOverlay from './components/UIOverlay';
import { GameStats, UnitData, BuildingData, RoadTileData, MinimapData, StructureData, DoctrineState } from './types';

const INITIAL_STATS: GameStats = {
  blue: { 
    resources: 1000, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0 },
    stockpile: { eclipse: 0, wp: 0 }
  },
  red: { 
    resources: 1000, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0 },
    stockpile: { eclipse: 0, wp: 0 }
  }
};

function App() {
  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [playerTeam, setPlayerTeam] = useState<'blue' | 'red'>('blue');
  const [doctrine, setDoctrine] = useState<DoctrineState>({ selected: null, unlockedTiers: 1, cooldowns: { tier2: 0, tier3: 0 } });
  
  const [minimapData, setMinimapData] = useState<MinimapData>({
      units: [],
      buildings: [],
      structures: [],
      roadTiles: [],
      gridSize: 40
  });

  // Mutable ref to track camera state efficiently without re-rendering the App tree
  // Added yaw property for rotation support
  const cameraStateRef = useRef({ x: 0, y: 80, z: 80, yaw: 0 });

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleMapInit = useCallback((data: { roadTiles: RoadTileData[], gridSize: number }) => {
     setMinimapData(prev => ({ ...prev, ...data }));
  }, []);

  const handleMinimapUpdate = useCallback((data: { units: UnitData[], buildings: BuildingData[], structures: StructureData[] }) => {
     setMinimapData(prev => ({ ...prev, ...data }));
  }, []);

  return (
    <div 
        className="w-full h-full relative bg-black" 
        onContextMenu={(e) => e.preventDefault()} // Disable context menu for RTS controls
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 50, 50], fov: 45 }}>
        <Suspense fallback={null}>
          <Atmosphere />
          <CityMap 
              onStatsUpdate={handleStatsUpdate} 
              onMapInit={handleMapInit}
              onMinimapUpdate={handleMinimapUpdate}
              playerTeam={playerTeam}
              doctrine={doctrine}
          />
          <DroneCamera cameraStateRef={cameraStateRef} />
        </Suspense>
      </Canvas>
      
      <UIOverlay 
        stats={stats} 
        minimapData={minimapData} 
        playerTeam={playerTeam} 
        setPlayerTeam={setPlayerTeam}
        cameraStateRef={cameraStateRef}
        doctrine={doctrine}
        setDoctrine={setDoctrine}
      />
      <Loader 
        containerStyles={{ backgroundColor: '#050505' }}
        innerStyles={{ width: '50vw', height: '4px', backgroundColor: '#1e293b' }}
        barStyles={{ height: '100%', backgroundColor: '#0ea5e9' }}
        dataInterpolation={(p) => `LOADING TERRAIN... ${p.toFixed(0)}%`}
        dataStyles={{ color: '#0ea5e9', fontFamily: 'monospace', fontSize: '14px', marginTop: '1rem' }}
      />
    </div>
  );
}

export default App;
