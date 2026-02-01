
import React, { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import CityMap from './components/CityMap';
import DroneCamera from './components/DroneCamera';
import Atmosphere from './components/Atmosphere';
import UIOverlay from './components/UIOverlay';
import { GameStats, UnitData, BuildingData, RoadTileData, MinimapData, StructureData, DoctrineState, DoctrineType } from './types';

const INITIAL_STATS: GameStats = {
  blue: { 
    resources: 1000, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0 },
    stockpile: { eclipse: 0, wp: 0 },
    doctrine: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  },
  red: { 
    resources: 1000, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0 },
    stockpile: { eclipse: 0, wp: 0 },
    doctrine: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  }
};

function App() {
  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [playerTeam, setPlayerTeam] = useState<'blue' | 'red'>('blue');
  const [minimapData, setMinimapData] = useState<MinimapData>({
      units: [],
      buildings: [],
      structures: [],
      roadTiles: [],
      gridSize: 40
  });

  // App-Level State for Doctrines (Source of Truth)
  // This state exists outside the simulation loop to persist selection
  const [doctrines, setDoctrines] = useState<{ blue: DoctrineState, red: DoctrineState }>({
    blue: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } },
    red: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  });

  // Mutable ref to track camera state efficiently without re-rendering the App tree
  const cameraStateRef = useRef({ x: 0, y: 80, z: 80, yaw: 0 });

  // Update local stats from CityMap, but preserve App-level doctrine state
  // We ignore the doctrine state coming *from* CityMap initially, as we manage it here
  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(prev => ({
        blue: { ...newStats.blue, doctrine: prev.blue.doctrine }, 
        red: { ...newStats.red, doctrine: prev.red.doctrine }
    }));
  }, []);

  const handleMapInit = useCallback((data: { roadTiles: RoadTileData[], gridSize: number }) => {
     setMinimapData(prev => ({ ...prev, ...data }));
  }, []);

  const handleMinimapUpdate = useCallback((data: { units: UnitData[], buildings: BuildingData[], structures: StructureData[] }) => {
     setMinimapData(prev => ({ ...prev, ...data }));
  }, []);

  const handleSelectDoctrine = useCallback((team: 'blue' | 'red', doctrine: DoctrineType) => {
      setDoctrines(prev => ({
          ...prev,
          [team]: { ...prev[team], selected: doctrine, unlockedTiers: 1 } // Unlock Tier 1 immediately on selection
      }));
  }, []);

  // Merge dynamic game stats with persistent doctrine state for UI consumption
  const combinedStats = useMemo(() => ({
      blue: { ...stats.blue, doctrine: doctrines.blue },
      red: { ...stats.red, doctrine: doctrines.red }
  }), [stats, doctrines]);

  // Expose global cheats for Doctrine testing
  useEffect(() => {
    const currentCheats = (window as any).GAME_CHEATS || {};
    (window as any).GAME_CHEATS = {
      ...currentCheats,
      setDoctrine: (team: 'blue' | 'red', doctrine: string) => {
        handleSelectDoctrine(team, doctrine as DoctrineType);
      }
    };
  }, [handleSelectDoctrine]);

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
          />
          <DroneCamera cameraStateRef={cameraStateRef} />
        </Suspense>
      </Canvas>
      
      <UIOverlay 
        stats={combinedStats} 
        minimapData={minimapData} 
        playerTeam={playerTeam} 
        setPlayerTeam={setPlayerTeam}
        cameraStateRef={cameraStateRef}
        onSelectDoctrine={handleSelectDoctrine}
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
