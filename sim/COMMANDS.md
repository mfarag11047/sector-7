# Player commands

This is the complete list of orders a player can give in Sector 7. In multiplayer,
the browser sends one of these to the game server, and the server decides whether
it happens. The definitions live in [`commands.ts`](./commands.ts).

**Not commands:** selecting units, opening a building's menu, entering targeting mode,
moving the camera, and the minimap. Those only change what one player sees, so they stay
in the browser.

**Not in the command list:** some things happen on their own every tick. These include
capture by infantry standing near a building, auto-attacks, Guardian repairs, Mason hauls,
Swarm Host spawns and grid charging. They become simulation rules in step 2.

## The list

"Today" points at the code that carries out the order now. Unit abilities already run
through `sim/abilities.ts`; the rest still live in `CityMap.tsx` and `App.tsx`.

| Command | Who uses it | Sent with | Today |
|---|---|---|---|
| `MOVE` | Any selected units | unit ids, target tile | `CityMap.tsx` `handleTileClick`, movement branch (~2358) |
| `PLACE_STRUCTURE` | HQ build menu, Depot wall/turret menu | structure type, tile | `handleBuild` / `SELECT_WALL` then `commitPlacement` (~2078) |
| `TRAIN_UNIT` | Barracks, Factory, Airpad, etc. | structure id, unit type | `handleStructureAction` `BUILD_UNIT` (~2785) |
| `BUILD_WARHEAD` | Ordnance Fab | structure id, warhead | `handleStructureAction` `BUILD_WARHEAD` (~2770) |
| `TOGGLE_DAMPENER` | Ghost | unit ids | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `TOGGLE_JAMMER` | Banshee | unit ids | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `TOGGLE_ANCHOR` | Battery Mule, Swarm Host | unit ids | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `SMOKE_SCREEN` | Titan | unit ids | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `ACTIVATE_APS` | Titan | unit ids | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `PHANTOM_DECOY` | Ghost | unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `LOAD_AMMO` | Ballista | unit id, warhead | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `TAKE_WARHEAD` | Ballista beside its Ordnance Fab | unit id, warhead | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `FABRICATE` | Field Fabricator | unit id, warhead | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `RESUPPLY_MATERIAL` | Field Fabricator beside an Ordnance Fab | unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `TRANSFER_WARHEAD` | Field Fabricator → nearest Ballista | unit id, warhead | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `CANNON_FIRE` | Titan | unit id, target tile | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `SURVEILLANCE` | Infiltrator Drone | unit id, target tile | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `FIRE_BALLISTA` | Ballista (armed) | unit id, target tile | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `FIRE_SWARM` | Wasp | unit id, target tile | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `BOMBARD` | Bombardment Drone | unit id, target tile | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `HARDLINE_TETHER` | Banshee → drone | unit id, target unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `DISCONNECT_TETHER` | Banshee | unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `BATTERY_LINK` | Anchored Battery Mule → vehicle | unit id, target unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `DISCONNECT_BATTERY` | Battery Mule | unit id | `sim/abilities.ts` (checked, then applied by `dispatchAbility` in `CityMap.tsx`) |
| `SELECT_DOCTRINE` | Player | doctrine | `App.tsx` `handleSelectDoctrine` |
| `DOCTRINE_POWER` | Player | tier, target tile (none for Global EMP) | `App.tsx` `handleTriggerDoctrine` / `handleMapTarget`, then `CityMap.tsx` (~1631) |

Line numbers are approximate and will drift as the code changes.

## Two layers of checking

1. **Shape**: `isPlayerCommand()` in `commands.ts`. It rejects anything that isn't
   one of the commands above with the right fields. Examples: a made-up `SET_RESOURCES`,
   a fractional tile, an unknown unit type, an empty selection.
2. **Legality**: done when the command is applied. For unit abilities this is
   `abilityEffects()` in `abilities.ts`, which confirms that:
   - the unit exists, is alive and belongs to the sender's team
   - it is the right type for that order
   - the team can afford it
   - the ability is off cooldown and has charges or battery left
   - the target is in range, for tethers and Battery Mule links

   `MOVE`, `PLACE_STRUCTURE`, `TRAIN_UNIT`, `BUILD_WARHEAD`, `SELECT_DOCTRINE` and
   `DOCTRINE_POWER` still need the same treatment.

## Gaps

Fixed:
- **Titan cooldowns and charges.** Smoke, APS and the cannon now respect their
  cooldowns, and smoke and APS spend charges. Smoke and APS also wear off now; nothing
  counted them down before.
- **Ownership.** Unit abilities check the unit belongs to the sender.
- **Wasp swarm cooldown.** It was set but never checked.
- **`LOAD_AMMO`** advances on the game tick instead of a browser `setTimeout`, and
  will not load over a missile that is already loaded or armed.
- **Doctrine powers** are charged by `sim/economy.ts`, not the `window.GAME_CHEATS` hook.

Still open:
- **Doctrine powers don't check the tier cooldowns in `DOCTRINE_CONFIG`.**
- **No range limits on aimed abilities.** The Titan cannon, Ballista, Wasp swarm and
  Bombardment Drone can target any tile. `TITAN_CANNON_RANGE` and `WASP_SWARM_RANGE` exist
  in `constants.ts` but nothing uses them. Whether they should is a design decision.
- **Ghost hacking (`hackType` recall/drain) has state fields but no command triggers it.**
  It needs a command added here once it is designed.
