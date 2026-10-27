// Which way a base structure faces. A Command HQ faces away from the middle of the map, toward
// the corner its owner's camera starts in and looks from (App.tsx cameraStart), its front squared
// to the nearest of the four headings, so a player sees its front. The buildings on its pads face
// in toward it (facingBase). Models are built facing +Z; this is the turn about Y that points +Z
// that way.

import { CITY_CONFIG } from '../../constants';

// A base building faces in toward the middle of its base (its Command HQ, `centre`), its front
// squared to the nearest of the four headings, so units come out of it into the base. With no
// centre, it faces its owner's view.
export function facingBase(gridPos: { x: number; z: number }, centre: { x: number; z: number } | null): number {
  if (!centre) return facingOwnerView(gridPos);
  const dx = centre.x - gridPos.x, dz = centre.z - gridPos.z;
  if (dx === 0 && dz === 0) return facingOwnerView(gridPos);
  return Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
}

export function facingOwnerView(gridPos: { x: number; z: number }): number {
  const centre = (CITY_CONFIG.gridSize - 1) / 2;
  const dx = gridPos.x - centre, dz = gridPos.z - centre;
  if (dx === 0 && dz === 0) return 0;
  return Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
}
