// Which way a base structure faces: away from the middle of the map, toward the corner its owner's
// camera starts in and looks from (App.tsx cameraStart), its front squared to the nearest of the
// four headings. So a player sees the fronts of their own buildings (doors, yards, markings), not
// their backs. Models are built facing +Z; this is the turn about Y that points +Z that way.

import { CITY_CONFIG } from '../../constants';

export function facingOwnerView(gridPos: { x: number; z: number }): number {
  const centre = (CITY_CONFIG.gridSize - 1) / 2;
  const dx = gridPos.x - centre, dz = gridPos.z - centre;
  if (dx === 0 && dz === 0) return 0;
  return Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
}
