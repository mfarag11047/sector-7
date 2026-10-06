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

"Today" points at the code that carries out the order now. Step 2 moves each of these
into `sim/`.

| Command | Who uses it | Sent with | Today |
|---|---|---|---|
| `MOVE` | Any selected units | unit ids, target tile | `CityMap.tsx` `handleTileClick`, movement branch (~2358) |
| `PLACE_STRUCTURE` | HQ build menu, Depot wall/turret menu | structure type, tile | `handleBuild` / `SELECT_WALL` then `commitPlacement` (~2078) |
| `TRAIN_UNIT` | Barracks, Factory, Airpad, etc. | structure id, unit type | `handleStructureAction` `BUILD_UNIT` (~2785) |
| `BUILD_WARHEAD` | Ordnance Fab | structure id, warhead | `handleStructureAction` `BUILD_WARHEAD` (~2770) |
| `TOGGLE_DAMPENER` | Ghost | unit ids | `handleUnitAction` toggle block (~2715) |
| `TOGGLE_JAMMER` | Banshee | unit ids | same |
| `TOGGLE_ANCHOR` | Battery Mule, Swarm Host | unit ids | same |
| `SMOKE_SCREEN` | Titan | unit ids | same |
| `ACTIVATE_APS` | Titan | unit ids | same |
| `PHANTOM_DECOY` | Ghost | unit id | `handleUnitAction` `PHANTOM_DECOY_INIT` (~2659) |
| `LOAD_AMMO` | Ballista | unit id, warhead | `handleUnitAction` `LOAD_AMMO_*` (~2493) |
| `TAKE_WARHEAD` | Ballista beside its Ordnance Fab | unit id, warhead | `TAKE_ECLIPSE` / `TAKE_HE` (~2582) |
| `FABRICATE` | Field Fabricator | unit id, warhead | `FABRICATE_ECLIPSE` / `FABRICATE_HE` (~2526) |
| `RESUPPLY_MATERIAL` | Field Fabricator beside an Ordnance Fab | unit id | `RESUPPLY_MATERIAL` (~2542) |
| `TRANSFER_WARHEAD` | Field Fabricator → nearest Ballista | unit id, warhead | `TRANSFER_ECLIPSE` / `TRANSFER_HE` (~2551) |
| `CANNON_FIRE` | Titan | unit id, target tile | `handleTileClick` `CANNON` branch (~2192) |
| `SURVEILLANCE` | Infiltrator Drone | unit id, target tile | `handleTileClick` `SURVEILLANCE` branch (~2165) |
| `FIRE_BALLISTA` | Ballista (armed) | unit id, target tile | `handleTileClick` `MISSILE` branch (~2215) |
| `FIRE_SWARM` | Wasp | unit id, target tile | `handleTileClick` `SWARM` branch (~2255) |
| `BOMBARD` | Bombardment Drone | unit id, target tile | `handleTileClick` `BOMBARD` branch (~2316) |
| `HARDLINE_TETHER` | Banshee → drone | unit id, target unit id | `handleUnitSelect` `TETHER` branch (~1958) |
| `DISCONNECT_TETHER` | Banshee | unit id | `handleUnitAction` `DISCONNECT_TETHER` (~2607) |
| `BATTERY_LINK` | Anchored Battery Mule → vehicle | unit id, target unit id | `handleUnitSelect` `BATTERY_TETHER` branch (~1976) |
| `DISCONNECT_BATTERY` | Battery Mule | unit id | `handleUnitAction` `DISCONNECT_BATTERY` (~2625) |
| `SELECT_DOCTRINE` | Player | doctrine | `App.tsx` `handleSelectDoctrine` |
| `DOCTRINE_POWER` | Player | tier, target tile (none for Global EMP) | `App.tsx` `handleTriggerDoctrine` / `handleMapTarget`, then `CityMap.tsx` (~1631) |

Line numbers are approximate and will drift as the code changes.

## Two layers of checking

1. **Shape**: `isPlayerCommand()` in `commands.ts`. It rejects anything that isn't
   one of the commands above with the right fields. Examples: a made-up `SET_RESOURCES`,
   a fractional tile, an unknown unit type, an empty selection.
2. **Legality**: done by the simulation when it applies the command (step 2). For every
   command it should confirm that:
   - the unit or structure exists and belongs to the sender's team
   - it is the right type for that order
   - the team can afford it
   - the ability is off cooldown and has charges or battery left
   - the target is in range

## Gaps found while making this list

Today these rules are partly enforced by the menus (a greyed-out button) and partly not
enforced at all. In step 2, the simulation must enforce all of them itself:

- **Titan cooldowns are never checked.** `CANNON_FIRE`, `SMOKE_SCREEN` and `ACTIVATE_APS`
  set `mainCannon` / `titanSmoke` / `titanAps` cooldowns, but nothing reads them.
  Smoke and APS charges are never spent either. A Titan can use all three as fast
  as the player clicks.
- **Unit actions don't check ownership.** Only `MOVE` and the building menus check
  `team === playerTeam`. The unit-ability handlers trust that the clicked unit is yours.
- **Doctrine powers don't check the tier cooldowns in `DOCTRINE_CONFIG`.** Their cost is
  now charged by `sim/economy.ts`, no longer through the `window.GAME_CHEATS` debug hook.
- **`LOAD_AMMO` finishes on a browser `setTimeout`,** not on the game clock.
- **Ghost hacking (`hackType` recall/drain) has state fields but no command triggers it.**
  It needs a command added here once it is designed.
