// The unit kit's only textures, drawn in code: the kit's look is clean, untextured plates, so these
// are just a soft tread (scrolled so the tracks visibly run) and a contact shadow for under a unit.

import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

let tread: THREE.CanvasTexture | null = null;
// Track links: low-contrast bands across a dark belt. Repeats along the track.
export function treadMap(): THREE.CanvasTexture {
  if (tread) return tread;
  const { c, g } = canvas(16, 64);
  g.fillStyle = 'rgb(40,42,47)';
  g.fillRect(0, 0, 16, 64);
  g.fillStyle = 'rgb(62,65,71)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 16, 7);
  tread = new THREE.CanvasTexture(c);
  tread.colorSpace = THREE.SRGBColorSpace;
  tread.wrapS = tread.wrapT = THREE.RepeatWrapping;
  return tread;
}

let shadow: THREE.CanvasTexture | null = null;
// A soft dark blot for under a unit, where it meets the ground.
export function contactShadowMap(): THREE.CanvasTexture {
  if (shadow) return shadow;
  const { c, g } = canvas(64, 64);
  const b = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  b.addColorStop(0, 'rgba(0,0,0,0.75)');
  b.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  b.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = b;
  g.fillRect(0, 0, 64, 64);
  shadow = new THREE.CanvasTexture(c);
  return shadow;
}
