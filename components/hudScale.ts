// How big the HUD is drawn, for the size of the window it is in.
//
// The HUD (UIOverlay.tsx: team panels, minimap, army panel, messages, doctrine protocols) and the
// build and unit menus in the world (`.hud-menu`) are laid out for a 1920x1080 window. On a smaller
// one, a laptop's, they would cover far more of the game, so they are drawn smaller by the same
// share the window is smaller, by width or height, whichever is tighter: a 1440x900 window gets
// three quarters. Never below HUD_SCALE.min, where text would be too small to read, and never
// above 1: a bigger screen keeps the HUD as it is and simply shows more of the game.
//
// The scale is the CSS variable --hud-scale on the page, which index.html's `.hud-root` and
// `.hud-menu` rules apply with CSS zoom. Zoom, rather than a transform, shrinks the layout too: the
// HUD's full-screen layer still covers the window (its size is in percentages, which zoom leaves
// alone) while everything in it, sized in pixels, shrinks, so the panels keep to its corners and
// edges and clicks land where things are drawn.

import { useEffect } from 'react';

export const HUD_SCALE = { width: 1920, height: 1080, min: 0.6, max: 1 };

export function hudScaleFor(width: number, height: number): number {
  const fit = Math.min(width / HUD_SCALE.width, height / HUD_SCALE.height);
  // In hundredths, so a window dragged a pixel wider doesn't lay the HUD out again.
  return Math.round(Math.min(HUD_SCALE.max, Math.max(HUD_SCALE.min, fit)) * 100) / 100;
}

// Keeps --hud-scale up to date with the window's size.
export function useHudScale(): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--hud-scale', String(hudScaleFor(window.innerWidth, window.innerHeight)));
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}
