// What the camera sees: it looks down at a fixed angle (CAMERA_PITCH, a little off straight down)
// along a fixed heading per side, and only its height changes as it zooms. Pure, for the camera
// (DroneCamera.tsx), where a match opens (App.tsx), and the minimap's view box (UIOverlay.tsx).

import { CAMERA_FOV, CAMERA_PITCH } from '../constants';

const HALF_FOV = (CAMERA_FOV / 2) * Math.PI / 180;

// How far ahead of the camera, along its heading, the middle of the view meets the ground, from
// `height` up.
export const lookAhead = (height: number) => height / Math.tan(CAMERA_PITCH);

// The patch of ground in view from `height` up, on a screen `aspect` wide to its height: a
// trapezoid, measured along the heading from the point under the camera, from `near` (the screen's
// bottom edge; behind the camera when the view takes in the ground under it) to `far` (the top
// edge), `nearHalf` and `farHalf` wide either side of the heading at those edges, and `width`
// across the middle of the view.
export interface ViewFootprint { near: number; far: number; nearHalf: number; farHalf: number; width: number }
export function viewFootprint(height: number, aspect: number): ViewFootprint {
  const spread = Math.tan(HALF_FOV) * aspect;
  // Along the heading to where a ray `below` the horizon meets the ground, and half the view's width
  // there: its distance in front of the lens times the spread.
  const ground = (below: number) => height / Math.tan(below);
  const half = (below: number, offAxis: number) => (height / Math.sin(below)) * Math.cos(offAxis) * spread;
  return {
    near: ground(CAMERA_PITCH + HALF_FOV), far: ground(CAMERA_PITCH - HALF_FOV),
    nearHalf: half(CAMERA_PITCH + HALF_FOV, HALF_FOV), farHalf: half(CAMERA_PITCH - HALF_FOV, HALF_FOV),
    width: half(CAMERA_PITCH, 0) * 2,
  };
}
