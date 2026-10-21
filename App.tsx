
import React, { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ArmyControls, ArmyInfo, SelectionSummary } from './components/ArmyPanel';
import { Canvas, advance } from '@react-three/fiber';
import * as THREE from 'three';
import { Loader } from '@react-three/drei';
import CityMap, { MatchInfo } from './components/CityMap';
import { MatchEnd, MatchSetup, MatchSummary } from './components/MatchScreens';
import DroneCamera from './components/DroneCamera';
import Atmosphere from './components/Atmosphere';
import UIOverlay from './components/UIOverlay';
import { GameStats, UnitData, BuildingData, RoadTileData, MinimapData, StructureData, DoctrineState, DoctrineType } from './types';
import { DOCTRINE_CONFIG, CAMERA_FAR, CITY_CONFIG, TEAM_BASES } from './constants';
import { MatchConfig, MatchMode, STARTING_CORES, doctrineOf } from './sim/match';
import type { OrderCommand } from './sim/orders';
import type { Victory } from './sim/victory';
import type { PacingRecord } from './sim/pacing';
import { PacingReport } from './components/PacingReport';

const INITIAL_STATS: GameStats = {
  blue: { 
    resources: STARTING_CORES.ai, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0, core_node: 0 },
    stockpile: { emp: 0, he: 0, wp: 0 },
    doctrine: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  },
  red: { 
    resources: STARTING_CORES.ai, 
    income: 0, 
    compute: 0,
    units: 0, 
    buildings: { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0, core_node: 0 },
    stockpile: { emp: 0, he: 0, wp: 0 },
    doctrine: { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } }
  }
};

// Debug: ?render=slow draws a frame every two seconds instead of continuously. For automated
// tests on machines without a GPU, where software rendering would otherwise starve the game logic.
const SLOW_RENDER = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('render') === 'slow';
const SlowRender: React.FC = () => {
  useEffect(() => {
    const timer = setInterval(() => advance(performance.now()), 2000);
    return () => clearInterval(timer);
  }, []);
  return null;
};

// ?autostart=1 skips the setup screen with default settings (for automated tests);
// &doctrine=shadow_ops picks the player's doctrine, &mode=sandbox starts the sandbox and
// &mode=spectate an AI vs AI match.
const PARAMS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const AUTOSTART = !!PARAMS?.has('autostart');
const AUTOSTART_DOCTRINE = (['heavy_metal', 'shadow_ops', 'netrunner'] as DoctrineType[]).find(d => d === PARAMS?.get('doctrine')) ?? 'heavy_metal';

export interface Notice { id: number; text: string; tone: 'info' | 'warn'; at: number }

const NO_DOCTRINE: DoctrineState = { selected: null, unlockedTiers: 0, cooldowns: { tier2: 0, tier3: 0 } };

function App() {
  // The setup screen fills this in. Each new match bumps `round`, which remounts the map.
  const [match, setMatch] = useState<MatchConfig | null>(() => AUTOSTART
      ? { mode: (['sandbox', 'spectate'] as MatchMode[]).find(m => m === PARAMS?.get('mode')) ?? 'ai', seed: Math.floor(Math.random() * 1e6), playerTeam: 'blue', difficulty: 'normal', playerDoctrine: AUTOSTART_DOCTRINE, aiDoctrine: 'netrunner' }
      : null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ victory: Victory, summary: MatchSummary } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  // Orders from the HUD (research) go through CityMap's checks.
  const commandRef = useRef<((command: OrderCommand) => boolean) | null>(null);
  // This match's pacing report (sim/pacing.ts), filled in by CityMap.
  const pacingRef = useRef<PacingRecord | null>(null);
  const [showPacing, setShowPacing] = useState(false);
  // Selection and army panel: CityMap reports, the panel's buttons call back in.
  const armyControlsRef = useRef<ArmyControls | null>(null);
  const [armyState, setArmyState] = useState<{ selection: SelectionSummary; armies: ArmyInfo[] }>({ selection: { types: [], focused: null, total: 0 }, armies: [] });
  const handleArmyUpdate = useCallback((selection: SelectionSummary, armies: ArmyInfo[]) => setArmyState({ selection, armies }), []);
  const handleResearch = useCallback((tier: 2 | 3) => { commandRef.current?.({ type: 'RESEARCH_TIER', tier }); }, []);
  const noticeIdRef = useRef(0);
  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [playerTeam, setPlayerTeam] = useState<'blue' | 'red'>(match?.playerTeam ?? 'blue');
  const [minimapData, setMinimapData] = useState<MinimapData>({
      units: [],
      buildings: [],
      structures: [],
      roadTiles: [],
      gridSize: 40
  });

  // Doctrine & Interaction State
  const doctrinesFor = (config: MatchConfig | null) => {
      const pick = (team: 'blue' | 'red') => (config ? doctrineOf(config, team) : null);
      return { blue: { ...NO_DOCTRINE, selected: pick('blue') }, red: { ...NO_DOCTRINE, selected: pick('red') } };
  };
  const [doctrines, setDoctrines] = useState<{ blue: DoctrineState, red: DoctrineState }>(() => doctrinesFor(match));

  const startMatch = useCallback((config: MatchConfig) => {
      setMatch(config);
      setPlayerTeam(config.playerTeam);
      setDoctrines(doctrinesFor(config));
      setStats(INITIAL_STATS);
      setResult(null);
      setShowResult(false);
      setMatchInfo(null);
      setNotices([]);
      setShowPacing(false);
      setInteractionMode('select');
      setTargetingDoctrine(null);
      setRound(r => r + 1);
  }, []);

  const handleNotice = useCallback((text: string, tone: 'info' | 'warn' = 'info') => {
      const at = Date.now();
      setNotices(prev => {
          // The same message twice in a row just refreshes it.
          const rest = prev.filter(n => n.text !== text && at - n.at < 6000);
          return [...rest.slice(-4), { id: ++noticeIdRef.current, text, tone, at }];
      });
  }, []);
  useEffect(() => {
      if (notices.length === 0) return;
      const timer = setTimeout(() => setNotices(prev => prev.filter(n => Date.now() - n.at < 6000)), 1000);
      return () => clearTimeout(timer);
  }, [notices]);

  const handleMatchEnd = useCallback((victory: Victory, summary: MatchSummary) => {
      setResult({ victory, summary });
      setShowResult(true);
  }, []);

  const [interactionMode, setInteractionMode] = useState<'select' | 'target'>('select');
  const [pendingDoctrineAction, setPendingDoctrineAction] = useState<{ type: string, target: {x: number, z: number}, team: 'blue'|'red' } | null>(null);
  const [targetingDoctrine, setTargetingDoctrine] = useState<{ type: string, team: 'blue'|'red', cost: number } | null>(null);

  // Mutable ref to track camera state efficiently without re-rendering the App tree
  const cameraStateRef = useRef({ x: 0, y: 80, z: 80, yaw: 0 });

  // Update local stats from CityMap, but preserve App-level doctrine selection state
  // We sync unlockedTiers from the simulation (CityMap) to our App state
  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    // Only produce a new object when a tier actually unlocked. This runs on every stats
    // update, so returning `prev` unchanged keeps consumers that depend on the doctrines
    // identity from being invalidated several times a second.
    setDoctrines(prev => {
        const blueTiers = newStats.blue.doctrine?.unlockedTiers || prev.blue.unlockedTiers;
        const redTiers = newStats.red.doctrine?.unlockedTiers || prev.red.unlockedTiers;
        if (blueTiers === prev.blue.unlockedTiers && redTiers === prev.red.unlockedTiers) return prev;
        return {
            blue: { ...prev.blue, unlockedTiers: blueTiers },
            red: { ...prev.red, unlockedTiers: redTiers }
        };
    });

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
    // heavy_metal_tier3: Bulwark Force Field (Targeted)
    // shadow_ops_tier2: Decoy (Targeted)
    // shadow_ops_tier3: Cloaking Field (Targeted)
    // netrunner_tier2: Nano-Cloud (Targeted)
    // netrunner_tier3: Black Wall Infect (Targeted)

    const fullType = type.toUpperCase();
    const needsTarget = true;

    if (needsTarget) {
        setInteractionMode('target');
        setTargetingDoctrine({ type: fullType, team, cost });
    } else {
        // Global Ability - Execute Immediately. CityMap charges the cost when it runs the power.
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
          // Execute Targeted Ability. CityMap charges the cost when it runs the power.
          const { type, team } = targetingDoctrine;

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
  }, [interactionMode, targetingDoctrine]);

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

  // Open each match over your own HQ, looking toward the centre of the city.
  const cameraStart = useMemo(() => {
      const team = match?.playerTeam ?? 'blue';
      const offset = (CITY_CONFIG.gridSize * CITY_CONFIG.tileSize) / 2;
      const hq = TEAM_BASES[team];
      const x = hq.x * CITY_CONFIG.tileSize - offset;
      const z = hq.z * CITY_CONFIG.tileSize - offset;
      // Forward is -Z turned by yaw: -3π/4 faces +x+z (from blue), π/4 faces -x-z (from red).
      const yaw = team === 'blue' ? -3 * Math.PI / 4 : Math.PI / 4;
      const back = 40;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      return { x: x - fx * back, z: z - fz * back, yaw };
  }, [match]);

  // Merge dynamic game stats with persistent doctrine state for UI consumption
  const combinedStats = useMemo(() => ({
      blue: { ...stats.blue, doctrine: { ...stats.blue.doctrine, ...doctrines.blue, cooldowns: stats.blue.doctrine?.cooldowns ?? doctrines.blue.cooldowns } },
      red: { ...stats.red, doctrine: { ...stats.red.doctrine, ...doctrines.red, cooldowns: stats.red.doctrine?.cooldowns ?? doctrines.red.cooldowns } }
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
      <Canvas
        frameloop={SLOW_RENDER ? 'never' : 'always'}
        shadows
        // Capped at 1.5x: at 2x a high-DPI screen draws four times the pixels of 1x for a
        // barely visible gain, and fill rate is what this many lit buildings cost most.
        dpr={[1, 1.5]}
        style={{ overflow: 'clip' }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.22 }}
        camera={{ position: [0, 50, 50], fov: 45, far: CAMERA_FAR }}
      >
        {SLOW_RENDER && <SlowRender />}
        <Suspense fallback={null}>
          <Atmosphere />
          {match && <CityMap 
              key={round}
              commandRef={commandRef}
              pacingRef={pacingRef}
              onArmyUpdate={handleArmyUpdate}
              armyControlsRef={armyControlsRef}
              match={match}
              onNotice={handleNotice}
              onMatchEnd={handleMatchEnd}
              onMatchInfo={setMatchInfo}
              onStatsUpdate={handleStatsUpdate} 
              onMapInit={handleMapInit}
              onMinimapUpdate={handleMinimapUpdate}
              playerTeam={playerTeam}
              interactionMode={interactionMode}
              onMapTarget={handleMapTarget}
              pendingDoctrineAction={pendingDoctrineAction}
              doctrines={doctrines}
              targetingDoctrine={targetingDoctrine}
          />}
          <DroneCamera key={round} cameraStateRef={cameraStateRef} start={cameraStart} />
        </Suspense>
      </Canvas>
      
      {match && <UIOverlay 
        stats={combinedStats} 
        minimapData={minimapData} 
        playerTeam={playerTeam} 
        setPlayerTeam={setPlayerTeam}
        cameraStateRef={cameraStateRef}
        onSelectDoctrine={handleSelectDoctrine}
        onTriggerDoctrine={handleTriggerDoctrine}
        interactionMode={interactionMode}
        match={match}
        matchInfo={matchInfo}
        notices={notices}
        onResearch={handleResearch}
        armyState={armyState}
        armyControlsRef={armyControlsRef}
        onPacing={match.mode !== 'sandbox' ? () => setShowPacing(true) : undefined}
      />}
      {!match && <MatchSetup onStart={startMatch} />}
      {match && result && showResult && (
        <MatchEnd
            victory={result.victory}
            playerTeam={match.playerTeam}
            spectate={match.mode === 'spectate'}
            onReport={() => { setShowResult(false); setShowPacing(true); }}
            summary={result.summary}
            onContinue={() => setShowResult(false)}
            onSetup={() => { setMatch(null); setResult(null); }}
            onRematch={() => startMatch({ ...match })}
        />
      )}
      {match && showPacing && <PacingReport pacingRef={pacingRef} onClose={() => setShowPacing(false)} />}
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
