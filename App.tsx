
import React, { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import CityMap from './components/CityMap';
import DroneCamera from './components/DroneCamera';
import Atmosphere from './components/Atmosphere';
import UIOverlay from './components/UIOverlay';
import { GameStats, UnitData, BuildingData, RoadTileData, MinimapData, StructureData, DoctrineState, DoctrineType } from './types';
import { DOCTRINE_CONFIG } from './constants';

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

  // Doctrine & Interaction State
  const [doctrines, setDoctrines] = useState<{ blue: DoctrineState, red: DoctrineState }>({
    blue: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } },
    red: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  });

  const [interactionMode, setInteractionMode] = useState<'select' | 'target'>('select');
  const [pendingDoctrineAction, setPendingDoctrineAction] = useState<{ type: string, target: {x: number, z: number}, team: 'blue'|'red' } | null>(null);
  const [targetingDoctrine, setTargetingDoctrine] = useState<{ type: string, team: 'blue'|'red', cost: number } | null>(null);

  // Mutable ref to track camera state efficiently without re-rendering the App tree
  const cameraStateRef = useRef({ x: 0, y: 80, z: 80, yaw: 0 });

  // Update local stats from CityMap, but preserve App-level doctrine selection state
  // We sync unlockedTiers from the simulation (CityMap) to our App state
  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setDoctrines(prev => ({
        blue: { ...prev.blue, unlockedTiers: newStats.blue.doctrine?.unlockedTiers || prev.blue.unlockedTiers },
        red: { ...prev.red, unlockedTiers: newStats.red.doctrine?.unlockedTiers || prev.red.unlockedTiers }
    }));

    setStats(newStats); 
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
          [team]: { ...prev[team], selected: doctrine } // Selection is managed by UI
      }));
  }, []);

  const handleTriggerDoctrine = useCallback((team: 'blue' | 'red', type: string, tier: 2 | 3, cost: number) => {
    // 1. Check Resources
    if (stats[team].resources < cost) {
        console.warn("Insufficient resources for doctrine.");
        return;
    }

    // 2. Identify Targeting Mode
    // Mapping specific doctrine types to their behavior
    // heavy_metal_tier2: Drop (Targeted)
    // heavy_metal_tier3: Nuke (Targeted)
    // shadow_ops_tier2: Decoy (Targeted)
    // shadow_ops_tier3: Global EMP (Global)
    // skunkworks_tier2: Nano-Cloud (Targeted)
    // skunkworks_tier3: Swarm Host (Targeted)

    const fullType = type.toUpperCase();
    const needsTarget = fullType !== 'SHADOW_OPS_TIER3';

    if (needsTarget) {
        setInteractionMode('target');
        setTargetingDoctrine({ type: fullType, team, cost });
    } else {
        // Global Ability - Execute Immediately
        const cheatApi = (window as any).GAME_CHEATS;
        if (cheatApi) {
            cheatApi.setResources(team, stats[team].resources - cost);
        }
        
        setPendingDoctrineAction({
            type: fullType,
            target: { x: 0, z: 0 }, // Global ignores target
            team
        });

        // Clear action after a tick to prevent loops
        setTimeout(() => setPendingDoctrineAction(null), 100);
    }
  }, [stats]);

  const handleMapTarget = useCallback((location: { x: number, z: number }) => {
      if (interactionMode === 'target' && targetingDoctrine) {
          // Execute Targeted Ability
          const { type, team, cost } = targetingDoctrine;

          // Deduct Cost
          const cheatApi = (window as any).GAME_CHEATS;
          if (cheatApi) {
             cheatApi.setResources(team, stats[team].resources - cost);
          }

          setPendingDoctrineAction({
              type,
              target: location,
              team
          });

          // Reset Mode
          setInteractionMode('select');
          setTargetingDoctrine(null);
          
          // Clear action after a tick
          setTimeout(() => setPendingDoctrineAction(null), 100);
      }
  }, [interactionMode, targetingDoctrine, stats]);

  // Cancel targeting with Escape or right click (handled by CityMap right click usually)
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && interactionMode === 'target') {
              setInteractionMode('select');
              setTargetingDoctrine(null);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactionMode]);

  // Merge dynamic game stats with persistent doctrine state for UI consumption
  const combinedStats = useMemo(() => ({
      blue: { ...stats.blue, doctrine: { ...stats.blue.doctrine, ...doctrines.blue } },
      red: { ...stats.red, doctrine: { ...stats.red.doctrine, ...doctrines.red } }
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
        onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 50, 50], fov: 45 }}>
        <Suspense fallback={null}>
          <Atmosphere />
          <CityMap 
              onStatsUpdate={handleStatsUpdate} 
              onMapInit={handleMapInit}
              onMinimapUpdate={handleMinimapUpdate}
              playerTeam={playerTeam}
              interactionMode={interactionMode}
              onMapTarget={handleMapTarget}
              pendingDoctrineAction={pendingDoctrineAction}
              doctrines={doctrines}
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
        onTriggerDoctrine={handleTriggerDoctrine}
        interactionMode={interactionMode}
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
