import React from 'react';
import { Html } from '@react-three/drei';
import { UNIT_STATS } from '../constants';
import type { StructureData } from '../types';

// Floating bars over a structure or HQ: health once damaged, construction while it goes up,
// and the unit in training with how many more are queued.
const StructureStatus: React.FC<{ data: StructureData; height: number }> = ({ data, height }) => {
  const building = (data.buildRemainingMs || 0) > 0 && (data.buildTotalMs || 0) > 0;
  const damaged = data.health < data.maxHealth;
  const training = data.queue && data.queue.length > 0 ? data.queue[0] : null;
  if (!building && !damaged && !training) return null;

  const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`;
  return (
    <Html position={[0, height + 4, 0]} center zIndexRange={[40, 0]}>
      <div className="flex flex-col items-center gap-0.5 pointer-events-none" style={{ width: data.type === 'hq' ? '96px' : '56px' }}>
        {damaged && (
          <div className="hud-meter w-full h-1.5">
            <div className="hud-meter-hp h-full transition-all duration-300" style={{ width: pct(data.health / data.maxHealth) }} />
          </div>
        )}
        {building && (
          <>
            <div className="text-[8px] font-mono uppercase text-amber-300 leading-none">Building</div>
            <div className="hud-meter w-full h-1">
              <div className="hud-meter-cell h-full" style={{ width: pct(1 - data.buildRemainingMs! / data.buildTotalMs!) }} />
            </div>
          </>
        )}
        {training && !building && (
          <>
            <div className="text-[8px] font-mono uppercase text-cyan-200 leading-none whitespace-nowrap">
              {UNIT_STATS[training.unitType].label.replace(/"/g, '')}{data.queue!.length > 1 ? ` +${data.queue!.length - 1}` : ''}
            </div>
            <div className="hud-meter w-full h-1">
              <div className="hud-meter-cell h-full" style={{ width: pct(1 - training.remainingMs / training.totalMs) }} />
            </div>
          </>
        )}
      </div>
    </Html>
  );
};

export default StructureStatus;
