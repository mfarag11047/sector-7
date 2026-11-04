# Sector 7: notes for Claude

A real-time strategy game in the browser: React 19, React Three Fiber / three.js, Vite, vitest.
Two sides (internally `blue` and `red`; shown as Vanta and Tokugen) fight over a seeded city map.
**`docs/GAME_DESIGN.md` is the source of truth** for every rule, number, unit and the AI: read the
relevant section before changing a system, and update it in the same change.

## Working rules (from the project owner)

- Work on the branch `claude/playable-game` and push there. No pull requests unless asked.
- No names of existing games, studios, brands or franchises anywhere in the repo (code, comments,
  docs, unit names). Describe mechanics in plain words instead.
- No AI model names or IDs in commits, code or docs.
- Every gameplay change also updates `docs/GAME_DESIGN.md` and, if players see it, the in-game
  manual (`components/OperationsManual.tsx`).
- Check changes in the real game in a browser (see below), not only with tests, and look at
  screenshots for anything visual.
- When a design choice is open, offer a recommended option and ask; once decided, don't reopen it.

## Commands

- `npm run dev`: dev server (slow React dev mode). `npm run play`: build and open the fast version.
- `npx vitest run`: all tests (about 660, ~20 s). `npx vitest run sim/foo.test.ts` for one file.
- `npx tsc --noEmit -p .`: expect exactly **2 errors**, in `components/Building.tsx` (torus
  geometry typing). They are old and harmless; anything beyond them is new.
- `npx vite build`: must succeed before pushing.

## Architecture

- `sim/`: the game rules as **pure modules** (no React, no three): combat, movement, economy,
  production, abilities, AI, map generation, each with its own `*.test.ts`. New rules go here.
  - Player and AI orders are commands (`sim/commands.ts`, listed in `sim/COMMANDS.md`), applied by
    `sim/orders.ts`; abilities by `sim/abilities.ts` (side powers) and `sim/unitAbilities.ts`
    (unit and hero abilities). The AI (`sim/ai.ts` and `sim/ai*.ts`) sends the same commands.
  - Unit stats: `sim/units.ts` (`UNIT_RULES`). Upgrades: `sim/upgrades.ts`. Heroes:
    `sim/heroes.ts` plus one module each (`heavyMetalHero.ts`, `shadowHero.ts`, `netrunnerHero.ts`).
    Doctrine track: `sim/doctrineTrack.ts`.
- The sim runs in **two places that must stay in step**: `components/CityMap.tsx` (the live game,
  100 ms ticks) and `sim/headless.ts` (fast matches for AI and balance tests). A new per-tick rule
  is wired into both.
- `components/`: rendering and UI. `CityMap.tsx` is the big game component (state, tick loop,
  effects). `Unit.tsx` picks each unit's model; `UIOverlay.tsx` is the HUD. `App.tsx` holds the
  setup screen and the canvas.
- `types.ts`: shared data types (`UnitData`, structures, economy, doctrine state).

## Unit models

Every unit is built in code from the kit in `components/kit/` (no imported 3D files):
`shapes.tsx` (Plate, Prism, Loft, Turned, Strip, ContactShadow), `materials.ts` (`kitMaterial`,
`smoothMaterial`, `teamPaint`, `glow`, `PALETTE`). Models live in `components/models/`, are built
about 1 unit tall facing +Z and scaled up, and animate in `useFrame` from props like `moving`,
`lastAttackTime`, `flashRef` (the muzzle flash Unit.tsx lights). `components/kit/Batched.tsx`
merges a model's still parts for speed; materials need `userData.mergeSafe` to merge. Look at
`TrooperModel.tsx`, `CipherModel.tsx` or `KageModel.tsx` before writing a new one.

## Testing in the browser

- URL parameters skip the setup screen:
  `/?autostart=1&mode=sandbox&seed=7&doctrine=netrunner` (doctrine `heavy_metal`, `shadow_ops`,
  `netrunner`; `mode=sandbox` has no enemy AI; `render=slow` turns off post-processing for
  software rendering).
- `window.GAME_CHEATS` (defined in `CityMap.tsx`) drives the game from a script: `spawn(type,
  team, {x, z})`, `state()`, `focus({x, z})`, `order(cmd, team)`, `ability(cmd, team)`,
  `setResources`, `setCompute`, `power(type, target, team)`, `setTrackPicks(team, picks)` (doctrine powers without waiting for ranks), `spawnStructure`, `capture`, `screenOf`, `probe()` (scene, camera,
  renderer), `drawnAt(id)`.
- Playwright works for screenshots; headless Chromium needs `--use-gl=swiftshader
  --enable-unsafe-swiftshader`. `index.html` loads Tailwind and fonts from CDNs; offline, route
  those requests or the HUD has no styles. Zoomed in, units can be off screen or behind buildings:
  project a unit's position with `probe().camera` to aim the shot.
- To preview a model alone, a throwaway `zz_preview.html` + `.tsx` at the root rendering it on a
  plain ground, served by `npx vite`, is quicker than the full game. Delete it after.
- Stop a background preview server by its PID (`ps aux | grep "[v]ite preview"`), not with
  `pkill -f "vite preview"`, which kills the shell running it.

## Odds and ends

- The `patch_*.cjs`, `test_*.cjs/js` files at the root are leftovers from early scripted edits;
  nothing uses them.
- Comments in this codebase are plain prose explaining what a part is and why; keep that style.
- Commit messages: a short summary line, then a paragraph on what changed and why.
- The owner builds on Windows, where file names are case-insensitive: never give two files in a
  folder names that differ only in case (`decay.ts` beside `Decay.tsx` broke the build). Pure
  helpers beside a component take a suffix instead (`decayPlan.ts`).
- More than one session may push to the branch: `git fetch` and rebase before pushing.
