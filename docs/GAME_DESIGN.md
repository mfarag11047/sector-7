# Sector 7 – playable build design

This is the design behind the `claude/playable-game` branch. It takes the systems already in the
game (core nodes, the energy grid, compute, doctrines, the ability units) and wraps them in a
complete match: a fair map, an opponent, a counter-based roster, production that takes time, and a
way to win. The numbers live in code (`sim/units.ts`, `constants.ts`). This file explains the intent,
so tuning keeps the shape.

## The match

1. **Setup screen.** Choose your side, the opponent (AI Easy, Normal or Hard, Sandbox where you
   control both sides with the old showcase roster, or AI vs AI), your doctrine and the map seed.
   The AI's doctrine comes from the seed.
2. **Start.** Each side has its Command HQ, 3 Strike Troopers, a Mason, an Infiltrator Drone and
   1000 cores.
3. **Win** by destroying every enemy Command HQ: its starting one and any it has built. That is
   the only win condition. Core and server nodes bring income, population and tech, but holding
   them never wins on its own.
4. **End screen** with the result, match time and stats, and a button to play again.

The intended arc:
- **Opening (0–4 min):** troopers take the home core node and nearby buildings to stretch the grid,
  then a Barracks and Factory go up.
- **Mid game:** taking the guarded server node in your own half starts compute flowing toward
  Tier 2. Then come fights over the four outer core nodes and the contested flank and centre
  server nodes, which speed research toward Tier 3.
- **Late game:** Tier 3 units and doctrine powers, Bombardment Drones opening lanes through blocks,
  and the push on the HQ.

## Economy

| Source | Rate |
|---|---|
| Command HQ (always) | 3 cores/s |
| Each core node held | 5 cores/s |
| Each Core Refinery | 1.5 cores/s (4 at level 2), plus 4–15% of your core node income, more the nearer its base is to a core node |

### Core Refinery

Rules: `sim/refinery.ts`. A base building (600 cores, 30 s, 900 HP) that makes cores at home, so a
side can invest in its economy instead of only fighting for nodes.

- It takes a **building pad**, so it competes with production: at most **2 per Command HQ**. More
  refineries and more production at once means more bases.
- Each working refinery pays a **flat 1.5 cores/s** plus a **share of your core node income**
  that depends on how close its base (the Command HQ whose pad it stands on) is to the nearest
  core node, any core node, counted in city blocks (diagonal neighbours count as next door):
  **+15%** on the block next to one, **+11%** two blocks away, **+7%** three, and **+4%** (the
  minimum) four or more. The starting bases are both 2 blocks from their home core node (+11%),
  so a new base built beside a node is the best place for refineries. The shares stack
  additively across refineries and are capped at **+40%**. It multiplies only node income (not
  the HQ trickle or other refineries), so holding more of the map makes every refinery worth more,
  while a refinery is never worthless to a side holding nothing. The AI difficulty income bonus
  applies to the total, after the refineries.
- The base-site menu shows what refineries would add at a new base there, the pad menu what one
  would add on that pad, and a refinery's menu its own share and its base's distance. The computer
  builds new bases on the site nearest a core node it can reach.
- **Level 2** (Tier 2, 500 cores, 25 s, from the refinery's own menu) raises only that refinery's
  flat income, to 4 cores/s. The multiplier doesn't change. An upgraded refinery is a bigger loss,
  and the computer's Bombardment Drones and Ballistas strike upgraded refineries first, then any
  refinery, before other buildings.
- The refinery's menu shows its level and income, what all your refineries add, and the
  multiplier against your node income.
- The computer builds one once its Barracks and Factory are up (Hard: a second at Tier 2) and
  upgrades them at Tier 2 with cores to spare.
- AI-vs-AI over 8 seeds: matches ran about 27 min on average (25 before), total income about
  20-25% higher, Tier 2 timing unchanged.

- Start with 1000 cores.
- Structures must be placed **inside your energy grid**: around your HQ or near buildings you have
  captured. Holding ground is what lets you build forward.
- **Base pads** (`sim/baseLayout.ts`): each Command HQ has **6 building pads** for Barracks,
  Factories, Airpads, Comm Links, Ordnance Fabs, Depots and Advanced Research, in any mix, and **4 turret corners**
  for Sentry and CIWS Turrets. Base buildings and turrets go nowhere else. More production than
  six structures takes another Command HQ, which brings its own six pads and four corners. Walls
  are not limited to pads.
  - A starting HQ sits on a paved 7x7 square. Its building pads ring the HQ, clear of the two roads
    crossing the square, and its turret corners are the square's corners. The two sides' layouts
    are mirror images.
  - An HQ built later stands in the middle of its cleared block. Its building pads ring it inside
    the block, and its turret corners are the block's corners.
  - Every free pad is marked on the ground with a **+** button (amber on turret corners). Click it
    for a menu of what can go there: the base buildings on a building pad, the Sentry and CIWS
    turrets on a turret corner (these need a finished Depot and a Mason). Pick one and it is
    placed on that pad and starts building. The HQ menu shows how many pads are left.
    (`components/BuildPads.tsx`)
- Base structures take time to construct. While under construction they can't produce.
- **Disassembling** (`sim/dismantle.ts`): click one of your base buildings or turrets and choose
  Disassemble (it asks you to confirm) to change course. A finished one stops working at once,
  comes down over 8 s (a pulsing amber frame shows it), then is gone, freeing its pad, and pays
  back 50% of what it cost, a Core Refinery's level 2 upgrade included. The refund comes only
  when it is down, so taking down a building about to be destroyed gains nothing; choose Stop to
  keep it. Whatever it was doing is cancelled and refunded in full at once: units in its queue,
  a warhead being built, research in progress (cores and compute), a refinery upgrade. One
  still under construction, or a turret blueprint, is cancelled at once with its full cost back.
  The Command HQ and walls can't be disassembled. The computer never does it.

| Structure | Cost | Build time | Produces |
|---|---|---|---|
| Barracks | 300 | 15 s | Infantry |
| Depot | 200 | 12 s | Mason and walls; needed for turrets |
| Factory | 550 | 25 s | Vehicles |
| Comm Link | 450 | 20 s | Support units |
| Airpad | 600 | 25 s | Aircraft |
| Ordnance Fab | 800 | 30 s | Field Fabricator, Swarm Host, Courier, warheads |

## Energy grid and batteries

- Your grid covers 6 tiles around the HQ and 4 around every building you have captured (core
  nodes pay instead of powering).
- Vehicles and aircraft recharge inside the grid and drain while moving outside it, which gives
  them about 15–25 tiles of range past the edge.
- On a flat battery they don't stop dead: they crawl at 30% speed on reserve power until they reach
  the grid again. Stranded far out they are slow and exposed, so overextending is still punished,
  but a unit is never stuck for the rest of the match.
- Infantry don't need the grid to move, which is why they lead the way, capturing buildings to pull
  the grid forward behind them.

## Movement

- Ground units move at 2× speed on main roads, 1× on streets and 0.5× on open ground, and they
  route by travel time (`sim/pathfinding.ts`): a unit will detour onto a highway when that gets it
  there sooner than the direct line through side streets and empty lots.
- Aircraft ignore terrain: they fly a straight line, diagonals included, over buildings and city
  blocks, at the same speed everywhere.

## New command bases

Rules: `sim/bases.ts`. Once every building in a city block (the 5x5 lot between roads) is
destroyed, the block's rubble is cleared away and a base site appears at its centre: a glowing
hex pad with a button over it. Core and server node blocks never become sites.

- Clicking the button opens the site menu: **Build Command HQ** for 2000 cores and 200 compute
  (`BUILD_BASE`, checked in `sim/orders.ts`). One of your units must be within 6 tiles of the
  site. Either side can build on any free site.
- The new HQ takes 60 s to go up, rising out of the ground with a build bar. Until then it does
  nothing, but it can be attacked.
- Finished, it is a full HQ: 5000 health and the HQ's gun, its own energy grid circle (so you can
  build around it), repair for units in its block, and the HQ menu (Scout RC Cars, research), plus its own pads to build on.
- Victory by destruction now means destroying every one of a side's HQs, its starting HQ and any
  it has built. A base still going up counts.
- The AI doesn't build new bases yet.

## Population

`cap = 20 + 3 × core nodes held + 1 per 100 grid tiles`, up to 60.

- Core nodes give a small bump each.
- Most of the growth comes from the energy grid. Count the map tiles inside the grid circles of
  your captured buildings (`gridTiles` in `sim/energy.ts`), each tile once however many buildings
  cover it. Your base's own circle and core nodes don't count, since core nodes don't power the
  grid.
- In AI test matches, held grid runs from about 350 tiles at 2–3 minutes to 2,000 by 10 minutes
  and 3,000+ late. That puts the cap around 27 early, 45–50 mid-game and the full 60 late, for a
  side that spreads out.
- Losing buildings shrinks the cap again. Units already in the field stay, but new ones can't be
  queued over it.
- Hover **Pop** in the team panel for the breakdown.

A unit's pop cost is reserved when it is queued.

## Tech tiers (compute)

Compute is a resource, like cores. Server nodes produce it and you spend it to research tiers,
which stay unlocked for good.

| Source | Compute per second |
|---|---|
| Command HQ (always) | 0.25 |
| Each server node held | 1 |

| Tier | Research cost | Unlocks |
|---|---|---|
| T1 | Start | Scout RC Cars (from the HQ), Troopers, Ghosts, Razorbacks, Thunderheads, Battery Mules, Drones, Guardians, Helios, Masons |
| T2 | 120 compute | Lancers, Titans, Aegis, Wasps, Hornets, Banshees, Field Fabricators, Swarm Hosts, T2 doctrine powers |
| T3 | 360 compute | Bombardment Drones, Ballistas, T3 doctrine powers |

Research from the button in your team panel or the HQ build menu.

### Unit upgrades (Advanced Research)

Reaching a tier unlocks that tier's units with their first ability. It no longer hands over every
unit's later upgrades: each is researched at an **Advanced Research** building (400 cores, 20 s,
takes a building pad; `sim/upgrades.ts`). There isn't the time, money or pad space to research
everything, so what you research commits you to the units you mean to build.

- Each upgrade also makes the unit tougher and harder-hitting: **+20% health and +15% damage** for
  every upgrade researched for that unit (so +40% / +30% with both of a Thunderhead's, Ghost's or
  Hornet's). It applies at once to the units already out, new ones included; the extra health is
  added to what they have. The damage bonus covers all their weapons: main gun, rail gun, shells,
  rockets, flechettes, CIWS and the Volt Core blast. (`applyUpgradeBonuses` in `sim/upgrades.ts`,
  `upgradeDamage` in `sim/unitAbilities.ts`.)
- Every unit you can train has **two upgrades**, a Tier 2 and a Tier 3 one (both Tier 3 for the
  Tier 3 Ballista and Bombard). Where a unit has no ability to unlock yet, the slot is a stat-only
  **Mk II / Mk III Refit**: just the health and damage bonus, no new ability. Refits:
  Scout RC Car, Drone, Wasp, Bombard, Guardian, Helios, Banshee, Ballista, Mason, Field Fabricator
  and Swarm Host (Mk II and Mk III); Strike Trooper, Razorback and Battery Mule (Mk III,
  beside their Tier 2 ability); Lancer, Titan and Aegis (Mk II, beside their Tier 3 ability).
- Each upgrade costs cores **and compute** (T2: 250 cores + 50 compute, T3: 400 + 100), so
  upgrades compete with the next tier for compute. The computer always keeps the compute for its
  next tier before it spends any on upgrades.
- Click the building for its menu: a unit class (Infantry, Vehicles, Aircraft), then a unit, then
  that unit's upgrades. Each shows its tier, cost in cores and compute, research time and what it
  does. Locked ones say
  why: the tier, an earlier upgrade they need, or the lab busy.
- One upgrade at a time per building. More buildings research in parallel, at the cost of pads.
  Research is lost if the building is destroyed before it finishes. Finished upgrades last the
  match.
- A unit's locked abilities say "Research" in its action menu. A notice tells you when research
  completes.

| Unit | Upgrade | Tier | Cores (+ compute: 50 at T2, 100 at T3) | Time | Effect |
|---|---|---|---|---|---|
| Strike Trooper | Nano-Weave Mesh | T2 | 250 | 30 s | Unlocks the ability |
| Ghost | Dampener | T2 | 250 | 30 s | Unlocks the ability |
| | Phantom Decoy | T3 | 400 | 45 s | Unlocks the ability |
| Lancer | EMP Tandem Rocket | T3 | 400 | 45 s | Unlocks the ability |
| Razorback | Overclocked Autogun | T2 | 250 | 30 s | Unlocks the ability |
| Aegis | Sky-Net Radar Sweep | T3 | 400 | 45 s | Unlocks the ability |
| Thunderhead | Long-Range Shells | T2 | 250 | 30 s | Range 12 → 16 tiles |
| | Guided Shells | T3 | 400 | 45 s | Range 16 → 20 tiles; needs Long-Range Shells |
| Hornet | Hellfire Salvo | T3 | 400 | 45 s | Unlocks the ability |
| | Hunter-Killer Rockets | T3 | 400 | 45 s | Its passive anti-vehicle rocket |
| Kestrel | Flechette Burst | T2 | 250 | 30 s | Passive shotgun burst every 5 s (see Kestrel abilities) |
| Kestrel | Regenerative Shield | T3 | 400 | 45 s | Shield worth 25% of its health (see Kestrel abilities) |
| Titan MBT | Piercing Rail Round | T3 | 400 | 45 s | Unlocks the ability (see Tank rail gun) |
| Battery Mule | Volt Core | T2 | 250 | 30 s | Passive: detonates when destroyed (see Battery Mule Volt Core) |

### Doctrine heroes

Each doctrine has one unique **hero** unit, and only a side that picked that doctrine at the start
of the match can research or train it (`sim/heroes.ts`). Netrunner's is still a placeholder: stats
only, no abilities, and the generic unit model with a gold halo.

| Doctrine | Hero | Class | Health | Speed | Weapon |
|---|---|---|---|---|---|
| Heavy Metal | Goliath | Armour (heavy) | 1400 | 0.8 | Heavy MG, 16 dmg / 0.3 s, range 5, hits air; grenades |
| Shadow Ops | Kage | Infantry (captures ×2) | 650 | 1.4 | Katana (melee), 60 blade dmg / 0.8 s, range 1.3, ground only; Optical Camo |
| Netrunner | Netrunner Hero | Support (light) | 800 | 1.0 | MG, 14 dmg / 0.5 s, range 4, hits air |

All cost 600 cores, 4 population and 40 s to train.

**Goliath (Heavy Metal)** is a towering full-borg heavy (`sim/heavyMetalHero.ts`,
`components/GoliathRig.tsx`, from three 3D models; see **Rigged models** below): a pale skull face with red eyes and a steel jaw, huge pauldrons,
red muscle cabling under black plate, and clawed feet. He carries a **heavy machine gun** in both
hands: a machine gun's damage type, decent against everything and able to hit aircraft. On his
back, an arm curls over his right shoulder holding a box **grenade launcher**: every **8 s**, while
his gun is on a ground unit or structure within 7 tiles, it lobs **3 grenades** over his shoulder
onto it, one on the target and two scattered within 1.2 tiles. Each lands 1.1 s later and bursts
for **40 explosive damage** within 1.5 tiles (half at the edge). They fly and land like Hellfire
Salvo rockets, so enemy force fields stop them. He turns to face what he is shooting. As heavy
armour, AP weapons are his counter: a few Titans take him apart.

**Kage (Shadow Ops)** is a cloaking assassin (`sim/shadowHero.ts`): a dark armoured suit with a
four-lens night-vision helmet glowing green, red tags, and a **black katana** in his left hand. He is
the first unit drawn from a rigged, animated 3D model rather than code-built shapes (see **Rigged
models** below): he idles in a sword stance, runs, slashes on every cut, and falls when he dies.
- **Melee only.** His katana has its own damage type, **blade**: ×1.3 against infantry, ×0.9 light
  vehicles, ×0.6 heavy, ×0.5 buildings, and it **can't hit aircraft**. With a reach of 1.3 tiles he
  has to close in, so when he stands idle and uncloaked he **charges** any enemy ground unit he
  can see within 5 tiles (an attack-move onto it). He is quick (speed 1.4) to make that work.
- **Optical Camo** (his ability, from Tier 1; 25 s cooldown): he cloaks himself for 15 s with the
  same cloak as a Cloaking Field: the enemy can't see or target him, though blasts and shelling
  still hurt, and an Aegis radar shows a blip. Cloaked, he doesn't charge on his own: you pick
  the ambush. His **first strike from cloak deals double damage** and drops the cloak.
- He turns to face what he is cutting. The computer cloaks him as enemies come within 7 tiles.

- **Unlock (Tier 1):** research **Hero Unlock** at Advanced Research (300 cores + 25 compute, 25 s).
  It gives no stat bonus; it lets the hero be trained there.
- **Train it at Advanced Research.** Its menu lists only your own doctrine's hero. **One hero at a
  time:** while yours is alive or in training, another can't be queued. When it falls, train another.
- **Upgrade to Tier 3:** **Hero Mk II** (Tier 2, 250 cores + 50 compute, 30 s, needs the unlock) and
  **Hero Mk III** (Tier 3, 400 + 100, 45 s, needs Mk II). Each gives the usual upgrade bonus
  (+20% health, +15% damage), so +40% / +30% at Mk III.
- In the research menu the hero has its own **Doctrine Hero** row above the unit classes.
- Orders check all of this (`trainOrder` and `upgradeOrder` in `sim/orders.ts`), so the AI is held to
  it too. An AI with a doctrine researches its hero's unlock and refits at an idle Advanced Research
  and keeps its hero in the field.

### The unit kit

Units built in code are moving onto a shared kit (`components/kit/`). The look is clean and
stylised rather than realistic: clearly defined shapes with flat, untextured tones, so the
silhouette and bevels carry the detail, plus glowing light panels. The Titan tank
(`components/models/TitanTankModel.tsx`, also the orbital-drop Titan) is the first; the rest of the
roster follows by type.
- **Materials** (`materials.ts`): a shared palette as cached, flat-shaded materials: light grey
  armour, slate secondary plates, bright metal, black, dark matte composite (fenders, bumpers,
  guards) and pale equipment housings; team colour as accent bands; and lights
  (`glow`) that ignore tone mapping so they glow (cyan for the standard army). A unit isn't one flat
  colour: each part takes the material it would be made of. Plates are matte:
  the scene has no environment map, so metallic surfaces have nothing to reflect and render near
  black. A unit animating its own material (a scrolling track, a pulsing light) takes a copy with
  `own`.
- **Textures** (`textures.ts`): only two, drawn in code: a soft tread that scrolls so tracks
  visibly run, and a contact shadow.
- **Parts** (`shapes.tsx`): `Plate` (bevelled box), `Prism` (an outline extruded with bevelled
  edges, for sloped armour and blades), `Turned` (lathe parts: barrels, exhausts), `Wheel`, `Strip`
  (a light) and `ContactShadow`. Geometry is cached and shared.
- **The Titan** has an armoured wedge hull and turret, dark composite side skirts with a sawtooth
  lower edge joined to the hull by composite decks over the tracks, metal wheels, cyan panels on
  the glacis and turret cheeks, a roof gun, and a rail gun of two bright-metal blades round a
  glowing core. Its
  turret turns to what it is shooting at (`turretAt`, from CityMap), the rail gun recoils and its
  lights flare when it fires, and the tracks run and the hull rocks while it drives.
- **The Guardian** (`components/models/GuardianModel.tsx`) is a four-wheeled UGV: a wedge nose
  with a dark sensor visor, composite fenders topped in team colour, composite bumpers and sills,
  metal-hubbed wheels, and a pale raised module with green
  repair crosses carrying the repair emitter (a ring cage round a pulsing green core, where the
  repair beams start), a turning sensor dish and the Trophy launcher, whose light turns red while
  it reloads. Repair green (`PALETTE.repair`) is kept for repair, so it reads at a glance.

### Rigged models

Most units are built from shapes in code. A unit can instead use a rigged `.glb` model (the asset
spec covers what an artist delivers). Two do so far:
- **Kage**: `public/models/kage.glb` with animation clips, and `katana.glb`, drawn by
  `components/KageRig.tsx`.
- **Goliath**: `public/models/goliath.glb` (rigged body, no clips), `goliath_gun.glb` and
  `goliath_launcher.glb`, drawn by `components/GoliathRig.tsx`. Without clips he moves
  procedurally: his arms hold the gun by two-bone IK every frame (right hand on the pistol grip,
  left on the front grip, so the hands stay on it as it recoils); walking swings his legs and bobs
  his hips; standing, his chest breathes; each shot kicks the gun back and each grenade volley kicks
  the launcher; dead, he topples onto his back. The gun rides at his right hip and the launcher
  sits on the socket in his back, arching over his right shoulder.

For models with clips:
- **Clips** in the file: `idle` (loops), `run` (loops, in place: the game moves the unit), `attack`
  (one strike, as long as the unit's time between hits) and `death` (holds the last pose). The unit's
  state picks the clip: dead, then striking (within a cut's length of its last hit), then moving,
  else idle, cross-fading over 0.15 s.
- **Weapons** are separate models attached to a hand bone in code (Kage's katana on the left hand,
  which is the hand his slash uses).
- **Team colour** (`components/teamTint.ts`): the textures are painted with blue team markings. A
  shader recolours clearly blue texels to the side's colour, keeping their shading, and makes the
  model's lights glow: green ones for Kage's lenses, warm ones for Goliath's red eyes and amber lights
  (his dark red cabling and yellow hazard stripes stay dull).
- **Each instance** gets its own skeleton copy and materials. A cloak tints copies of a unit's
  materials, never the shared ones.
- **Death**: the game removes a unit the moment it dies, so units with a death clip leave a fallen
  copy where they were drawn (`components/FallenUnits.tsx`). It plays the death, lies there for about
  6 s, then sinks away. Only units the player could see leave one.

**Tripo props and textures.** Tripo's props came in at around 100,000 triangles and every texture at
4096², about 34 MB for Goliath's three parts. They were reduced with gltf-transform (run from a
scratch folder, not a project dependency): parts joined, welded and simplified to about 7,000
triangles each (the gun and launcher look the same at game size), and every texture resized to
1024². Goliath is about 23,000 triangles and 3.7 MB in all.

**Importing a Tripo model.** Tripo's FBX export (from its Blender conversion) needed several fixes,
done once in the browser with three.js and saved as the `.glb`:
- FBXLoader built 25 nested copies of the skeleton, one per armour piece. Keep the outermost copy,
  drop the rest, and rebind every piece to it by bone name (all copies had the same bind data).
- Replace the material (it came with a white emissive) with a standard one on the colour texture,
  downscaled to 1024².
- Every clip was padded to the scene length (4.96 s) and had sparse keys. Resample to one key per
  frame, then cut: `attack` is the swing from wind-up to follow-through (0.4 to 2.0 s) at double
  speed (0.8 s, Kage's time between cuts); `death` the first 2.8 s; `run` one 0.8 s cycle from the
  steady middle of a start-run-stop animation, its last frames blended into its first so it loops;
  `idle` the swing's opening stance with a slow breath added.
- Root motion: the hips keep their height but stay over their starting spot in `run` and `attack`.
- Copying these clips onto Tripo's separate `.glb` of the same model doesn't work: the Blender
  round trip changed the bones' rest orientations. Use the FBX's own mesh and skeleton.

**Why research and not "hold N nodes":** in the first version, your tier was however many server
nodes you held right now. All four sat in the centre, so whoever won the middle got every tier and
the other side lost theirs: the game was over. Now holding more nodes only speeds research up.
Losing them slows you down but never takes a tier back, and the HQ trickle means even a side holding
nothing reaches Tier 2 in about 8 minutes.

**Five server nodes**, each guarded by a Sentinel that fires on anyone nearby:
- **One in each side's own half**, off to the flank. Every side can tech without winning the middle,
  but has to go out and take it from its Sentinel, then hold it.
- **Two contested flank nodes** on the line halfway between the bases, beside the outer core nodes.
- **One in the centre.**

Rough timings: holding just your own node, Tier 2 takes about 2 minutes of holding it, and Tier 3
another 6. Holding three nodes gets you from Tier 2 to Tier 3 in about 2 minutes.

### Role badges

Every visible unit shows a role badge in its team colour, so an army's make-up reads at a
glance. It floats above the unit at a fixed screen size and draws over buildings; the minimap
uses the same badge. A unit's badge hides while that unit is selected. Roles come from
`components/unitIcons.ts`:

| Badge | Role | Units |
|---|---|---|
| ✕ | Infantry | Trooper, Ghost |
| ✕ with an arrowhead | Anti-armour | Lancer |
| Wedge | Light vehicle | Razorback, Courier |
| Track | Heavy armour | Tank, Titan |
| Dome | Anti-air | Aegis |
| Wings | Aircraft | Wasp, Hornet, Kestrel |
| Eye | Scout | Drone |
| + | Support | Guardian, Helios, Banshee, Sun Plate |
| Shell | Artillery / ordnance | Thunderhead, Ballista, Bombard, Mule |
| Bracket | Engineer | Mason |
| Hexagon | Sentinel | Defense drone |
| Dots | Swarm | Swarm Host, Crawler |

## Combat model

Every unit has an **armor class** and a **weapon**. The weapon has damage, a cooldown, a range in
tiles, a damage type, and whether it can hit ground and/or air.

**Damage multipliers** (damage type × armor):

| | Infantry | Light | Heavy | Air | Structure |
|---|---|---|---|---|---|
| Rifle (small arms) | 1.0 | 0.6 | 0.25 | 0.5 | 0.2 |
| AP (anti-armor) | 0.5 | 1.0 | 2.0 | 0.4 | 0.75 |
| Flak | 0.4 | 0.4 | 0.2 | 2.0 | 0.1 |
| Explosive | 1.25 | 1.0 | 0.75 | 0 | 1.5 |
| Machine gun | 0.9 | 0.8 | 0.55 | 0.8 | 0.35 |

**The counter triangle**, Halo Wars style, holds at equal cost (tested in `sim/balance.test.ts`):
- Infantry beat air
- Air beats vehicles
- Vehicles beat infantry
- Specialists counter each corner: Lancers beat vehicles, Aegis beat air, and Titans' high-explosive
  shells (splash 1 tile at 30%) break clumped infantry and structures.
- The Kestrel's machine gun sits outside the triangle: decent against every armour class, the
  best counter per core to none of them (also tested in `sim/attackDrone.test.ts`).

**Engagement rules:**
- Units fire automatically at the nearest enemy their weapon can hit, including while moving.
- A group moved together spreads over separate tiles at the target. If it mixes fighters with
  support units (anything without a gun of its own, such as Helios, Banshees, Battery Mules,
  Guardians, Swarm Hosts, scouts and Masons), the fighters take the target, and the support
  units take the ground just behind them, on the side the army is coming from. Sent on their
  own, support units go right where they're told.
- **Attack-move** (used by the AI, and by the player with Ctrl-click, or F then click) stops to
  fight whatever comes into range, then carries on. (A is taken by the camera's WASD.)
- Enemy structures and the HQ can be attacked.
- The HQ and Sentry Turrets shoot back.
- Neutral Sentinels are hostile to both sides. Ground units route around a living Sentinel's
  reach when a detour of about a block or less is available. Their route still goes through it
  if that's where they're headed.

## Roster

`Pop` is population cost, `Tier` is the tech tier needed, and HP is in hit points. Weapons are
listed as damage / cooldown / range.

### Command HQ

| Unit | Cost | Pop | Tier | HP | Class | Weapon | Notes |
|---|---|---|---|---|---|---|---|
| **"Jackrabbit"** Scout RC Car | 70 | 1 | T1 | 40 | Light | None | Fastest unit (2.2×), sees 9 tiles, 500 battery (~90 s off-grid driving); remote-controlled, so Banshees can jam it |

Trained from the HQ's own menu (each Command HQ, including ones built later), 8 s each.

### Barracks (infantry, can capture)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Strike Trooper** (new) | 80 | 1 | T1 | 100 | Infantry | Rifle 10 / 1.0 s / 3, hits air | Backbone, capture, anti-air |
| **Ghost** EW Specialist | 150 | 1 | T1 | 110 | Infantry | Rifle 12 / 0.8 s / 3, hits air | Fast capture (1.5×); Dampener (T2) and Phantom Decoy (T3) researched |
| **Lancer** (new) | 150 | 1 | T2 | 100 | Infantry | AP 70 / 3.0 s / 4, hits air | Anti-vehicle rockets |

### Factory (vehicles)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Razorback** (new) | 200 | 2 | T1 | 300 | Light | Rifle 10 / 0.5 s / 3, hits air | Fast raider, anti-infantry |
| **Thunderhead** (new) | 320 | 3 | T1 | 240 | Light | Explosive 70 / 5 s / 12–20, splash 1.6, ground only | Mobile artillery; fires only when anchored |
| **Battery Mule** | 250 | 2 | T1 | 500 | Heavy | None | Mobile power for vehicles, as fast as a Titan (0.7×). Moving or parked (it no longer anchors), it charges up to 4 friendly ground vehicles (not aircraft) within 18 tiles automatically, lowest battery first (`muleLinks`, `sim/energy.ts`); Volt Core (T2, researched) |
| **Titan MBT** | 420 | 3 | T2 | 600 | Heavy | Explosive 50 / 2.2 s / 4, splash 1 (10%); rail gun AP 120 / 5 s / 14 | Main battle tank, automatic rail gun; Smoke Screen, Piercing Rail Round (T3, researched) |
| **Aegis** (new) | 240 | 2 | T2 | 300 | Light | Flak 30 / 1.2 s / 5, air only | Anti-air escort |

### Airpad (aircraft)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Infiltrator Drone** | 60 | 1 | T1 | 60 | Air | None | Scout, surveillance |
| **"Kestrel" Attack Drone** (new) | 130 | 1 | T1 | 110 | Air | Machine gun 6 / 0.4 s / 3, hits ground and air | Cheap generalist; fast (1.5×), sees 5, remote-controlled; Flechette Burst (T2, researched), Regenerative Shield (T3, researched) |
| **Wasp** | 240 | 2 | T2 | 160 | Air | Rifle 6 / 0.6 s / 3, hits air | Harasser, swarm volley |
| **Hornet Gunship** (new) | 320 | 3 | T2 | 320 | Air | AP 32 / 1.6 s / 4; researched T3 rocket AP 60 / 6 s | Anti-vehicle air |
| **Bombardment Drone** | 480 | 4 | T3 | 260 | Air | None | Levels city blocks; 5 drops, rearms at base |

### Comm Link (support)

| Unit | Cost | Pop | Tier | HP | Armor | Role |
|---|---|---|---|---|---|---|
| **Guardian** | 220 | 2 | T1 | 300 | Light | Heals 3 allies, Trophy system |
| **Helios** | 110 | 1 | T1 | 90 | Air | Wireless charging |
| **Banshee** | 320 | 3 | T2 | 380 | Light | Jammer, drone tether |
| **Ballista** | 380 | 3 | T3 | 160 | Light | EMP, HE and White Phosphorus missiles up to 39 tiles away, half the map (see [Ballista warheads](#ballista-warheads)); missiles fly at 21 tiles/s |

### Other producers

- **Depot:** Mason (120, pop 1, T1), plus Dragon's Teeth and Bulwark walls; it also enables two turrets:
  - **Sentry Turret** (400): anti-vehicle cannon, AP 40 / 1.5 s / 6, ground only, 900 HP.
  - Both turrets are base defences: they only go on the four corner pads of one of your Command
    HQs (the starting one or one you built), built by clicking the + on a free corner. They need
    a finished Depot and a Mason. Walls come from the Depot menu and can go anywhere in your grid.
  - **CIWS Turret** (450, three Mason hauls): the Aegis rotary cannon on a fixed mount with its own
    tracking radar (`sim/ciws.ts`). Shoots aircraft and incoming ordnance within 10 tiles exactly as
    the Aegis does (32/s to aircraft, 60/s to ordnance, 3.5 s bursts, 6 s reload); with the sky
    clear it fires on ground units within 6 tiles at half its flak damage (about 6/s to infantry
    and light vehicles, 3/s to heavy armour). 800 HP.
- **Ordnance Fab:** Field Fabricator (260, T2), Swarm Host (340, T2, 3 pop, 30 s: anchors to release
  up to 7 Crawler Drones that hunt nearby enemies) and EMP (500), HE (300) and White Phosphorus (350)
  warheads. Couriers are sent by
  Transfer Warhead, not trained.
- **Command HQ:** 5000 HP; AP 30 / 1.0 s / 5, hits air.

## Healing

Units never regain health on their own. Health comes back only from:

- **Guardians:** repair beams on up to three wounded allies within 2 tiles, 15 HP a second each.
- **Base repair:** any unit standing in its own HQ's city block (the 5x5 lot, the roads around it
  and the HQ pad) recovers 4% of its full health a second (`repairTick` in `sim/support.ts`).

Heavy Metal's passive makes both repair armour 50% faster, and once its side has researched Tier 2
its armour also repairs itself at 5 HP a second after 5 s without firing or being hit: the one
exception to no free healing.

## Aegis air-search radar

Every working Aegis (not EMP-disabled or stunned) carries an air-search radar, always on, reaching
16 tiles (`sim/radar.ts`). It picks up enemy aircraft and large ordnance in flight (ballistic
missiles, Thunderhead shells, drop pods; not small arms or swarm darts), and any unit hidden by a
Cloaking Field, ground or air. A contact that nothing
of yours can see shows only as a pulsing red dot, on the map and the minimap: radar says
something is there, not what it is. Without radar, an enemy missile launch still raises a
minimap alert: a warning triangle at the launch site and, once the missile is past halfway, a
single blip at the midpoint of its course, but never its live position.
Your Aegis draw their coverage as a green circle; a selected Aegis also shows range rings and a
sweeping beam.

## Aegis CIWS

The Aegis' gun is an automatic rotary cannon (`sim/ciws.ts`). While its radar works, it fires on
its own at any enemy aircraft, or missile, Thunderhead shell or drop pod in flight, within 10
tiles, incoming ordnance first. It does 32 damage a second to aircraft but 60 to ordnance: it is
built to stop missiles and only fairly good against aircraft (Flak Barrage doubles its rate; Sky-Net
Radar Sweep adds 2 tiles). A magazine holds 3.5 s of fire; empty, the gun stops for a 6 s reload,
and after 4 s without firing a part-used magazine is topped up. Ordnance has integrity rather than
health: missiles take 120 (2 s of fire), drop pods 180, shells 30. A downed missile
bursts in the air and does nothing. The fire is drawn as a dense stream of glowing rounds; an
enemy Aegis you can't see doesn't show its stream.

## Ballista warheads

Rules: `sim/warheads.ts`. Built at the Ordnance Fab (or by a Field Fabricator), taken and loaded by
the Ballista. Each suits a different enemy, so what you build follows what you face.

- **EMP** (500): see [EMP](#emp). Shuts down vehicles and aircraft and blacks out the grid.
- **HE** (300, 15 s): anti-armour. A 4-tile blast, 150 at the centre falling off to nothing at the
  edge, times x2 against heavy armour, x1.25 against light vehicles and only x0.4 against infantry
  and aircraft. A direct hit takes half a tank.
- **White Phosphorus** (350, 17 s): anti-infantry. Flies in like the others but bursts 14 units over
  the target, throwing 14 small canisters on white smoke trails across a 6-tile radius. Where they
  land they lay a burning white gas that lingers for 20 s, doing 12 damage a second to every enemy
  infantry unit inside (Nano-Weave reduces it). Vehicles, aircraft, structures and your own side
  are untouched. A trooper that stays in it dies in about 8 s.

## EMP

Anything that runs on a battery (vehicles and aircraft, not infantry) caught in an EMP shuts down:
it can't move, fire or use abilities until the effect wears off. Every EMP shows as a blue
energy discharge rather than a fireball, and disabled machines crackle with blue static.

- **EMP missile** (Ballista; replaces the old Eclipse warhead, same 500-core cost at the
  Ordnance Fab): an 8-tile blast that disables enemy machines in it for 20 s and blacks out the
  enemy's energy grid there for the same time: nothing recharges from the grid inside the zone and
  nothing can be built there. The blackout shows as a crackling blue disc. Rules: `Blackout` and
  `isInsideEnergyGrid` in `sim/energy.ts`, `empVictims` in `sim/unitAbilities.ts`.
- **Lancer EMP Tandem Rocket** (Tier 3 ability): 2-tile blast, 4 s shutdown, and each victim loses half a full battery. Range 14 in both fire modes: lock on to an enemy vehicle or aircraft in sight (the rocket tracks it to impact), or fire at a location. A Javelin-style top-attack missile: it climbs steeply, cruises high and dives onto the target from above. It covers 9 tiles/s over the ground and burns out after 6 s.

## Tank rail gun

The main battle tank (and the orbital-drop Titan) has two guns, both automatic. Its short-range
gun is the explosive one in the unit table. Its main gun is a rail gun (`sim/railgun.ts`), which
replaced the old manually aimed Main Cannon:

- It fires on its own at enemy ground units and buildings up to 14 tiles away that the side can
  see, through the tank's own eyes or any friendly unit's or building's. Heavy armour first, then
  light vehicles, then infantry, nearest first; buildings only when no unit is in reach. It never
  shoots aircraft.
- 120 anti-armour (AP) damage, an instant hit: 240 to heavy armour, 120 to light vehicles, but
  only a quarter of the usual AP damage to infantry (15). Every 5 s, 15 battery a shot.
- Balance note: the short-range gun's splash was cut from 30% to 10% when the rail gun started
  shooting infantry, so a shell plus the rail gun's chip damage doesn't one-shot a Lancer and
  Lancers stay a counter to tanks (`sim/balance.test.ts`).
- One tank against Lancers on its own: it beats one easily and two only just (it comes out of
  the fight with under 10% health); three beat it. To get there the tank has 600 health and a
  50-damage short-range shell.
- Stunned, EMP-disabled, out-of-battery or nano-clouded tanks hold fire, and it can't target
  cloaked units.
- Drawn as a white-hot core in a cyan glow from muzzle to target, with a flash where it strikes.


## Battery Mule Volt Core

`sim/voltCore.ts`. Researched at Advanced Research (T2, 250 cores, 30 s), then passive on every
Battery Mule the side has. When a mule is destroyed its core goes critical where it fell: a
sparking core, a red ring marking the blast radius, and a flashing red warning sign counting down
3, 2, 1, flashing faster as it nears zero. Both sides see it, so there's a moment to get clear.
Then it detonates in a blue electrical discharge: 220 damage at the centre to every enemy unit
within 4 tiles, ground or air, falling off evenly to 25% (55) at the rim. Friendly units and
structures are spared. A mule killed by the blast goes critical in turn, with its own countdown,
so a cluster of mules goes off in a rolling chain. The mule's menu shows "Volt Core: armed"
once researched. A mule behind the army turns from a liability into a trap: dive it and pay.

## Tank abilities

`sim/titan.ts`. The main battle tank (and the orbital-drop Titan) has two abilities. They replaced
the old Smoke (which only hid the tank on the minimap) and APS, both on limited charges:

- **Smoke Screen (comes with the tank, T2; 35 s cooldown):** the tank fires a ring of eight smoke
  canisters that arc out and burst into a grey cloud 1.5 tiles round where it stood, after 0.6 s.
  For 8 s every friendly unit inside the cloud is **screened**:
  - Enemy ground units, turrets, HQs and rail guns can't pick it as a target, and Thunderheads
    can't aim at it.
  - Enemy aircraft do half damage to it: guns, Hornet rockets and Hellfire, and Kestrel
    flechettes.
  - The cloud stays where it was laid, so units can drive into or out of it. It doesn't stop
    splash from shells or blasts aimed elsewhere, or a fire mission on the tile.
- **Piercing Rail Round (T3, researched at Advanced Research; 30 s cooldown):** loads a slug for
  the next rail gun shot (good for 20 s). That shot doesn't stop at its target: it carries on down
  the lane to the end of the street, up to 30 tiles, and hits every enemy ground unit and structure
  within 0.75 tiles of its path for full rail gun damage. It's drawn as a thicker magenta beam.
- The AI lays smoke when a tank is hurt or swarmed, and loads a piercing round when three or more
  enemy ground units are in rail gun range.
## Kestrel abilities

`sim/kestrel.ts`. The Kestrel attack drone has two abilities on top of its machine gun:

- **Flechette Burst (T2, researched at Advanced Research, passive):** every 5 s, alongside its machine gun,
  it fires a shotgun burst at the unit it is shooting, within 3 tiles. It does 18 to the target and
  8 to each other enemy within 1.3 tiles of it. Damage by armour: infantry full, light 45%, air
  50%, heavy 20%. It fires automatically and is drawn as a spray of three rounds per target. A
  force field soaks it.
- **Regenerative Shield (T3, researched at Advanced Research):** a shield worth 25% of the drone's
  health (28) on top of it, shown as a pale blue bar. Hits drain the shield first and it takes 25%
  less damage than the hull would. A hit bigger than the shield breaks it, and the rest lands on
  the hull. After 10 s without being hit, it recharges, filling in 2 s. A drone built after the
  research starts with its shield empty and charges it the same way.

Tuned in forced matchups: a drone swarm against infantry and armour armies won 50% of 24 matches
before, 59% of 22 decisive ones after. A first try at 30/14 every 4 s took it to 85%.

## Hornet rockets

`sim/hornet.ts`. From Tier 2 the Hornet's gun fires armour-piercing rounds (AP 32 every 1.6 s,
double against heavy armour). Once its side has researched Hunter-Killer Rockets (T3, Advanced
Research) it also fires an anti-vehicle rocket on its own every 6 s at whatever its gun is shooting (AP 60, so 120 to heavy armour), drawn as an
orange streak. The Hellfire Salvo (above) is its aimed Tier 3 area attack, also researched.

## Heavy Metal Tier 3: Bulwark Force Field

`sim/forcefield.ts`. Replaces the Tactical Nuke, which wiped out whole groups. The power (1200
cores, 300 s cooldown) drops a Bulwark Field Generator in a pod. It raises a dome 3 tiles in
radius (about a city block). One per side: a new drop removes the old generator.
- **Power:** the dome has no time limit. It runs off the generator's battery (about 75 s off the
  grid); inside your energy grid the battery is topped up as fast as it drains, so it holds
  indefinitely. With no power the dome is down.
- **Shield health (6000):** the owner's units fire out through the dome freely, but enemy fire
  from outside hits the dome instead. Guns pick targets in the open first; a shot at something
  behind or under the dome hits the dome for the weapon's damage against structures (rail gun
  120, Hornet rocket 60). Ordnance that comes down on it is stopped on its skin with a ripple and
  wears it down too: shell 70, Hellfire rocket 20, EMP rocket 60, missile 150, drop pod 100,
  Bombardment drop 400, Black Wall bomb 300. A blast just outside doesn't reach in.
- **Collapse and reboot:** battered to 0 the dome collapses, and the generator reboots for 90 s
  before it comes back at full strength. The dome dims as it weakens and flickers below 25%.
- **Intruders:** enemy units that walk in can fight from inside, but the field shocks them for
  8 damage a second, drawn as lightning from the generator.
- **The generator** (2000 HP, can't move) can be destroyed by enemies who go inside; an EMP set
  off inside knocks the dome down while it lasts. Its menu shows the shield and the reboot
  countdown.
- The AI drops it over its own army in a big fight.

## Helios microwave drone

The Helios is a support drone with two modes, one at a time, picked from its menu (`sim/helios.ts`):

- **Charge Friendlies** (default): every friendly unit within 3 tiles, the Helios included, gains
  0.3 battery per tick (3 a second). That is a slow trickle, far below the energy grid. Because
  it charges itself, a Helios in this mode never runs flat. Shown as a gold ring with pulses
  drifting inward.
- **Microwave Enemies:** every enemy unit within 3 tiles takes 4 damage a second. It charges
  nothing (itself included), and the beam costs the Helios 1.5 battery a second; it stops when the
  battery is flat. Enemy force fields block it. Shown as an orange-red ring with heat rippling
  outward and a faint beam cone.

An EMP'd or stunned Helios does neither. Switching several selected Helios sets them all to the
chosen mode.

## Ghost EW Specialist

The Ghost is trained from Tier 1 and grows with research at Advanced Research (`sim/ghost.ts`):

- **Tier 1:** no abilities, just a fast capturer (1.5× a Trooper).
- **Dampener (toggle; Tier 2, researched at Advanced Research):** the Ghost and every friendly unit within 3 tiles of it vanish from
  the enemy's **minimap** and **radar** (Aegis air-search contacts and Infiltrator ground-search
  blips). They are still seen in the world and can be shot when enemies are close. A hidden
  attacker doesn't show as a red attack arrow on the enemy minimap either. The field shows as a
  wall of flickering black and white vertical glitch bars at its edge. It slows the Ghost and
  drains its battery, and switches off when the battery runs flat.
- **Phantom Decoy (Tier 3, researched at Advanced Research):** cloaks the Ghost and sends four holographic copies running off in
  different directions. A running decoy can always be called off.

The Ghost's menu shows locked abilities with the tier they need.

## Banshee: jamming and hardline tethers

The Banshee is the electronic-warfare vehicle (`sim/jamming.ts`).

- **Jammer.** Switched on, it floods everything within 7 tiles with noise for as long as it has
  battery (it drains while on). Enemy **remote-controlled units** inside the field lose their
  link to their operator:
  - they take **no new orders**: no moves, no attack-moves, no abilities. An order to a group
    still reaches its unjammed units, and the player is told how many didn't hear it;
  - they carry on with what they were last told, finishing a move, and still **fire on their
    own** at anything in range;
  - they fizz with a cloud of TV static and show a "no signal" glyph while jammed.

  Your own Banshees always show their jamming reach as a thin blue ring; while the jammer is on,
  the area inside fills with a faint shimmer of interference. Enemy Banshees show neither: you
  see their jamming only in what it does to your units.
  Remote-controlled means uncrewed machines: Recon Drones, Wasps, Helios, Bombardment Drones and
  Crawler Drones. Crewed vehicles, aircraft with pilots and infantry are not affected. The jam lifts
  the moment the unit leaves the field or the jammer goes quiet (switched off, flat, destroyed or
  EMP'd).
- **Hardline tether.** The Banshee can cable up to **3** friendly remote units at once. A tethered
  drone is charged from the Banshee's hardline pack (which splits its charge across them), kept on
  a leash within 8 tiles, and **cannot be jammed**. Pick a tethered drone again to let it go, or
  Disconnect to drop them all. Another Banshee taking a drone takes it off the first one's line.

## Netrunner doctrine: Black Wall Infect

`sim/blackwall.ts`. The Netrunner doctrine (formerly Skunkworks) keeps its Overclock passive (+10%
production) and Nano-Cloud (Tier 2). Its Tier 3 power (1100 cores, 300 s cooldown) is Black Wall
Infect: a virus bomb that falls for 1.2 s and goes off in a 1.5-tile blast.
- Every enemy unit in the blast loses 25% of its maximum health at once and is infected.
- An infected unit burns 2.5% of its maximum health a second until it dies (30 s from 75%).
  Nothing cures it.
- The virus spreads within the infected unit's own side: a unit that stays within 2 tiles of an
  infected friend for 6 s catches it. Leaving range before that resets the exposure. It never
  jumps to the other side or to the neutral Sentinels.
- Infected units crawl with Blackwall glitch (red, magenta and blue scanlines, a jittering split
  cage and a red ring on the ground); a unit catching it shows a magenta ring filling up.

The Swarm Host is no longer part of any doctrine; it is now trained at the Ordnance Fab (Tier 2).

## Bombardment Drone strike cycle

`sim/bombard.ts`. Ordered onto a tile, the drone flies there and keeps dropping a cluster strike on
the 5x5 patch below it every 4 s until told to Cease Bombard or its 5 munitions are spent. Each
drop does 35 damage to every unit under it, friend or foe. Empty, it flies itself to the nearest
friendly command base and rearms there in 6 s; a part-used drone parked by a base tops up the
same way. Its menu shows the munitions left and what it is doing.

Buildings take a set number of drops, rising toward the centre so lanes get harder to open the
deeper the fight goes:

| Building | Where | Drops |
|---|---|---|
| Residential (blue) | Outskirts | 2 |
| Industrial (orange) | Outskirts | 3 |
| High-tech (green) | Ring round the centre | 4 |
| Commercial (purple) | Downtown | 5 |
| Server node / core node | Objectives | 2 / 4 |

## Infiltrator Drone ground-search radar

The Infiltrator Drone is a loitering surveillance drone (long glider wings, pusher prop and a
turning radar rotodome). Every working one carries a ground-search radar (`SEARCH_RADAR` in
`sim/radar.ts`), drawn for its owner like the Aegis sweep: the outer ring always, the sweep while
selected.

- Reach 8 tiles; on a Surveillance loiter (the drone circles a chosen spot for 2 minutes) 12
  tiles, measured from the centre of the orbit.
- It picks up enemy ground units, Cloaking-Field ones included, and large aircraft (the
  Bombardment Drone). Small and medium aircraft (Infiltrators, Helios, Wasps, Hornets) and
  ordnance slip under it.
- Contacts that nothing of yours can see show as red blips on the map and minimap, like Aegis
  contacts: something is there, not what.
- EMP-disabled or stunned drones are off the air.

## Shadow Ops Cloaking Field

The Shadow Ops Tier 3 doctrine power (1000 cores, 240 s cooldown) air-drops a Cloaking Field
Generator on a chosen tile, in a drop pod like the Orbital Drop Titan. Rules: `sim/cloak.ts`.

- It can't move. While it has battery it projects a 3-tile field; every friendly unit inside
  (not the generator itself) is cloaked: hidden from the enemy's view and minimap, and no weapon,
  turret, CIWS, artillery battery or homing missile will pick it as a target. Area damage (shell
  splash and missile blasts) still hurts it.
- A cloaked unit that fires (including an aimed ability or CIWS burst), or is hit, shows itself
  for 6 s, then slips back under if it is still inside the field.
- The field drains 0.13 battery per tick (about 75 s on a full charge). Inside your energy grid
  it recharges faster than it drains and holds indefinitely; a Battery Mule or Helios can keep a
  forward one going. A flat battery or an EMP drops the field until it recovers.
- One generator per side: a new drop destroys the old one as it lands.
- Its owner can switch the field off and on again from the generator's menu
  (`TOGGLE_CLOAK_FIELD`). Switched off it spends no battery, and it and everything near it can
  be seen.
- The generator is hidden by its own field while it is up (it shows itself for 6 s if hit, and
  whenever the field is down). Its owner sees a violet ring and dome at the field's edge, and
  cloaked friendlies, the generator included, drawn translucent violet.
- Radar beats the field: an enemy Aegis picks up every cloaked unit within its 16-tile radar,
  ground or air, as a red blip on the map and minimap. It shows something is there, not what.

## Thunderhead mobile artillery

The Thunderhead (`sim/artillery.ts`) is a six-wheeled rail-gun truck from the Factory, there from
Tier 1. It trades every close-range strength for reach:

- **Mobile, it cannot fire.** It anchors only once it has stopped (Anchor Down), then takes
  3 s to set up. A move order packs it up straight away and drops its fire mission.
- **Anchored, it fires on its own** at the nearest enemy ground unit, then structure, that its
  side can see in range. It never hits aircraft.
- **Fire Mission** shells a tile the player picks, again every 5 s, whether or not anyone can
  see it, until Cease Fire, a new mission, or packing up. Several selected batteries take the
  same mission.
- **Range grows with research:** 12 tiles to start, 16 with Long-Range Shells (T2), 20 with Guided
  Shells (T3), both from Advanced Research. Nothing closer
  than 3 tiles can be shelled. Selected and anchored, it shows its range (and the dead zone) as
  an orange ring; a fire mission's target shows as a red reticle.
- **Shells fly.** Each takes 1.2 s plus 0.09 s per tile to land and drifts up to 0.7 tiles, so a
  target that keeps moving can get out from under it. A shell does 70 explosive damage at the
  centre, down to 40% at the 1.6-tile edge, to enemy ground units and structures. Enemy shells
  show only on the way down.

The AI fields about one Thunderhead for every six units, keeps it standing off behind the army,
plants it when something is in reach and packs up to follow when nothing is.

## New-unit abilities

Each of the five units added in this build has two abilities, in the cyberpunk spirit of the rest:
the first comes with the unit, and the second needs the next tier and then research at Advanced
Research (above), so units grow stronger only if your side invests in them. They're in the unit's action menu; aimed ones (⌖) take a map click.
Abilities act on every selected unit of that type. Rules: `sim/unitAbilities.ts`.

| Unit | Ability | Tier | Cooldown | Effect |
|---|---|---|---|---|
| Strike Trooper | Stim Injector | T1 | 30 s | +50% fire rate, +30% speed for 6 s; costs 15 health |
| | Nano-Weave Mesh | T2 | 40 s | Takes 50% less damage for 6 s |
| Razorback | Nitro Injection | T1 | 25 s | +80% speed for 5 s |
| | Overclocked Autogun | T2 | 35 s | Double fire rate for 6 s |
| Lancer | Overcharged Warhead | T2 | 25 s | Next rocket (within 15 s) does 2.5x damage |
| | EMP Tandem Rocket ⌖ | T3 | 45 s | Range 14, radius 2. Top-attack missile. Lock On (an enemy vehicle or aircraft in sight; the rocket tracks it) or Fire at Location. Vehicles and aircraft can't move or fire for 4 s and lose half a battery; infantry unaffected |
| Aegis | Flak Barrage | T2 | 30 s | Double fire rate for 6 s, and bursts also hit aircraft within 1.5 tiles of the target |
| | Sky-Net Radar Sweep | T3 | 40 s | Vision 14 and +2 weapon range for 10 s |
| Hornet | Afterburners | T2 | 25 s | +70% speed for 5 s |
| | Hellfire Salvo ⌖ | T3 | 40 s | Range 8, radius 3: each Hornet ripple-fires 16 unguided mini-rockets that come down across the area over 1.4 s, 20 explosive damage each in a 1.2-tile blast (half at the edge). An area weapon: best on infantry and light vehicles in the open |

A coloured ring under a unit shows an ability running (red: shut down by an EMP). The computer
opponent uses them too: stims and overclocks when it's in a fight, Nano-Weave and Afterburners when
hurt, Flak Barrage against aircraft, and aimed strikes on clusters of two or more.

## AI opponent

The AI (`sim/ai.ts`) plays by the same rules as you. It returns commands; the game sends them
through the same checks as yours (`sim/orders.ts`, `sim/abilities.ts`, doctrine powers), from the
same kind of economy.

1. **Build order**, most wanted first, since an HQ has only six pads:
   - Barracks, then Factory.
   - An Airpad for air and drone plans.
   - Its strategy's extra producer.
   - At T2: Advanced Research, an Airpad, a Comm Link, a Depot (Normal and Hard) and an Ordnance Fab.
   - A second Barracks on Hard.

   Each goes on the free pad nearest its home. Whatever doesn't fit waits for a second Command HQ;
   it only saves up cores for a building when a pad is free for it.
   While enemy fighters are within 12 tiles of its HQ it places
   nothing, not even turrets. It keeps training from the producers still standing and rebuilds
   once the base is clear.
   At an idle Advanced Research, with cores to spare after units, it researches the upgrade for
   the units it fields most and its strategy leans on: Overclocked Autogun and the shell upgrades
   for armour, Nano-Weave, EMP rockets and the Ghost's for infantry. Its doctrine hero's unlock and
   refits always interest it, and once unlocked it trains the hero at an idle Advanced Research.
2. **Production:** for each structure, the unit with the best damage per core against the armor mix
   of your army (weighted by value, and by its army strategy below), leaning toward whatever has
   been killing its units lately. It keeps enough infantry for a capture team plus a node squad
   (two more), three more again for an infantry army, and a Guardian per 8 units. Easy picks at
   random, weighted by its strategy. When cores pile up (600 or more in hand), as they do for an
   army of cheap units, it tends production every think and queues one deeper, and it builds its
   strategy's extra production structure straight away rather than after 4 minutes.
3. **Territory:** only infantry capture, and the AI plans around it. A capture team of 3–4
   infantry (Troopers, Ghosts, Lancers) goes for the free core node that is nearest to its base
   and farthest from yours. Ties go to the node nearer its infantry, since four of the six core
   nodes are the same distance from both bases.
   - Once its army is worth 400 cores, the army escorts that same node and the capture team
     marches with it, so they arrive together. Before that, the team goes alone and skips free
     nodes with enemies about. It waits at the gather point until at least 3 of it are together,
     then sets out as a group, instead of sending Troopers out one at a time to be picked off. Once
     out it carries on while at least two are left. A lone survivor comes back to wait for the
     next group.
   - Whenever the army goes for any other node (a server node, or one of yours), a **node squad**
     of two infantry goes onto the node with the vehicles. The capture team gives up members to
     make one.
   - With no infantry to hand, the vehicles hold at the staging point instead of clearing a node
     nobody can take, and the Barracks trains more.
   - Other infantry capture the buildings that push the grid toward the objective.
   - The army gathers at the front of the ground it actually holds: its base and buildings within
     12 tiles of its own nodes. Buildings a stray squad captured deep in enemy territory don't
     count, so new units don't trickle out there one by one.
4. **Army strategy** (`sim/aiStrategy.ts`). Each side opens with a plan picked at random:
   - **Infantry army:** Troopers, Ghosts, Lancers, Guardians; a second Barracks.
   - **Armoured army:** Razorbacks, Tanks, Thunderheads, Aegis; a second Factory.
   - **Air force:** Hornets, Wasps, Bombardment Drones, Kestrels at T1 (Airpad straight after
     the Factory); a second Airpad at T2. It pushes for T2 sooner.
   - **Drone swarm:** Kestrel attack drones from T1 (an Airpad straight after the Factory and
     a second one later), then Wasps, many Helios, Banshees, Swarm Hosts.

   The plan weights what it trains and how often each production structure is used. An air
   force plays a normal mixed army, plus Kestrels, until T2 unlocks its gunships.

   **What counters what** (`sim/counters.ts`). A counter has to kill the threat *and* survive it.
   Each unit is scored against the enemy, by unit type: its damage per second to them, times its
   health over their damage per second to it, each per core (Lanchester's square law). Troopers
   can shoot aircraft, but a Kestrel swarm's machine guns cut them down, so against Kestrels the
   Aegis scores far higher. A pure tank army is best answered by gunships, since tanks can't shoot
   up; with Aegis among the tanks, Lancers are.

   It keeps count of the units it loses and blames the enemy units around each one when it died,
   by unit type, by how hard they hit that unit. Two responses:
   - **Answers, at once.** Once it has lost 300 cores' worth in the last two minutes, the two
     units it can train that best counter whatever did it are favoured 2× in training and are
     built whatever the plan: their structure is used even if the plan hardly uses it (an
     infantry army losing to Kestrels trains Aegis at its Factory). Training otherwise ranks
     units the same way, against a mix of the enemy army it sees and what has been killing it.
   - **A new plan, sometimes.** Suppose that in the last two minutes it has lost at least 400
     cores' worth, or half its army's worth, and at least 45% of it to one kind of enemy
     (infantry, light vehicles, heavy armour or aircraft). It switches to the plan whose best
     units counter the units that did it, if that plan is at least 1.6× better than its current
     one (the answers above cover the smaller gaps). The pacing report names the killers:
     "losing units to enemy aircraft (mostly "Kestrel" Attack Drones)". It only switches
   once it has stuck with a plan for 2 minutes (Normal) or 1 minute (Hard); after a switch it
   gives the new plan twice as long. It never goes back to a plan it gave up within the last
   5 minutes, so it doesn't flip back and forth between two. Easy never changes.
   The pacing report logs each plan and change.
5. **Army**, one objective at a time, most urgent first:
   - defend its base or a node under attack;
   - take a server node (after 2–6 min, by difficulty), but only while its Sentinel stands, if
     the army can kill it while losing at most a fifth of its worth. The estimate assumes the
     Sentinel focuses one unit at a time while the whole army fires back. A few early Troopers
     don't try;
   - attack your nearest Command HQ once its army is worth 1.6× its attack threshold (1.2× at T3
     or after 15 minutes), otherwise your nearest core node once it is worth the threshold;
   - escort a second capture;
   - otherwise gather at the edge of its grid nearest you.
   It retreats when the enemy near its target is worth 1.4× its army, and waits 30 s before trying
   again. Vehicles low on battery outside the grid drive home to recharge.
6. **Specialists** (`sim/aiSpecialists.ts`), fielded in modest numbers alongside the army as a
   player would (a drone swarm fields many more Helios, Banshees and Swarm Hosts):
   - **Scout RC Car** from the HQ (2 on Hard) runs ahead to the objective. With nothing to scout
     for the army, it watches your base from 14 tiles out. It turns back home when enemies come
     within 7 tiles and never parks within 6 of a Sentinel. After losing one, it waits 3 minutes
     before training another.
   - **Ghosts** join the capture team; the **Dampener** runs while the army pushes (from T2) and
     **Phantom Decoy** gets a caught Ghost out (T3).
   - **Infiltrator Drone** keeps over the army and loiters on **Surveillance** over the objective.
   - **Helios** (one per 6 army, up to 2) charges the army and switches to **microwave** when enemies
     come in reach, back to charging when they leave or its battery is low.
   - **Banshee** (T2) keeps with the army, **jams** whenever enemy drones come in reach and
     **hardlines** its own drones so they can't be jammed.
   - **Battery Mule** (T2, with 5+ vehicles) keeps with the army at the staging point, charging the
     vehicles round it on its own as it goes.
   - **Swarm Host** (T2) anchors to release Crawlers when a fight is close.
   - **Wasps** fire **swarm volleys** into enemy groups.
   - **Bombardment Drones** (T3) strike enemy production, never on top of its own units.
   - **Ballista** (T3) stays by the Ordnance Fab, which keeps two **warheads** coming, of
     the kind that suits your army (White Phosphorus against mostly infantry, EMP against a big air
     wing, otherwise HE); it loads the best one it holds and fires White Phosphorus at the thickest
     infantry crowd, HE at the thickest knot of vehicles or else a structure. It only fires at targets within its 39-tile range.
   - **Masons** put up 1 (Normal) or 2 (Hard) **Sentry Turrets** on the turret corners facing
     you.
   - When rich, with a unit beside a cleared block, it builds a **new Command HQ** (up to 2 on
     Normal, 3 on Hard). This happens at T3, or at T2 once its building pads are all taken.
7. **Powers:** Doctrine powers on Normal (T2) and Hard (T2 and T3): Orbital
   Drop into a fight, a Force Field over its army in a big fight, Decoys on an attack, EMP in a big fight, a Nano Cloud
   over a retreat, a Black Wall Infect bomb on a big enemy cluster.

Easier levels aren't just slower; they're less attentive, the way a person juggling a base and a
fight is. They only go round their production structures every so often (and skip some), they leave a gap between
buildings, get round to research and notice raids late, and don't always pick the right counter.

| Difficulty | Thinks every | Income | Production rounds | Gap between buildings | Research delay | Reacts to raids | Best counter | First attack | Powers |
|---|---|---|---|---|---|---|---|---|---|
| Easy | 6 s | ×0.7 | every 30 s, 50% of structures | 90 s | 60 s | after 15 s | never (random) | 10 min, 2600 army | None |
| Normal | 3.5 s | ×1.0 | every 15 s, 70% of structures | 45 s | 25 s | after 6 s | 55% | 7 min, 2200 army | T2 |
| Hard | 1.5 s | ×1.35 | every think, 95% | 10 s | 3 s | at once | 90% | 3.5 min, 1500 army | T2, T3 |

A finished unit leaves its structure idle until the next production round, as it would for a
person busy elsewhere. In computer-vs-computer tests Normal fields about 15 units by 8 minutes,
against 24 for the old, perfectly efficient Normal; Hard still beats Normal and Normal beats Easy.

### AI vs AI and the pacing report

**AI vs AI (pacing test)** on the setup screen has the computer play both sides at the chosen
level while you watch with full vision: blue plays the doctrine picked for it, red its own or
the seed's. The viewer can't give orders. `?autostart=1&mode=spectate` starts one directly.
The **Viewing as** switch under the match clock flips between the two sides' views. Every unit on
the map stays in sight either way. The chosen side's own detail is what changes: its units' move
orders drawn to their destinations, its energy grid, radar contacts, Banshee jamming fields,
engagement arrows on the minimap, and its notices.

Every match except the sandbox keeps a pacing report (`sim/pacing.ts`, the **Pacing report**
button under the match clock and on the end screen; `GAME_CHEATS.pacing()` in the console):

- **Milestones** with their match time: first structure of each type, core and server nodes
  captured and lost, tiers researched, first combat between the sides, each side's first loss
  and first kill, structures destroyed, new Command HQs, the computer's army plans and changes
  of plan, and the result.
- **Snapshots** every 30 seconds per side: units, army value (cost scaled by health), cores,
  compute, tier, core and server nodes held. Charted and tabled.
- **Units** per side and type: how many started, were trained and died, and the damage they
  dealt to enemy units and to enemy structures.

Damage is credited from health lost, split among whoever hit the target in the last second, or
else its last hitter within 3 seconds. Damage nobody can be named for (doctrine powers,
force-field shocks, the Black Wall virus) is listed as Other; the neutral server-node guards
are tallied apart. The report copies out as text or downloads as JSON. Headless matches keep the
same report (`m.pacing`), so pacing can be checked over many seeds in seconds.

### Headless matches

`sim/headless.ts` runs a whole match without the browser (map, economy, production, orders,
movement, combat, capture, batteries, victory) on the sim modules alone. A 15-minute match takes
under 10 seconds. `sim/ai.test.ts` uses it; it is also a first draft of the authoritative server.
It doesn't yet model projectiles, most unit abilities, clouds, doctrine powers other than Orbital
Drop, or Masons.

## Map

- The city is 79×79 tiles. That size makes the road grid mirror exactly, so the map is
  **point-symmetric**: whatever is at a tile near your base is also at the matching tile near the
  enemy's.
- The city is the same every match. Roads, nodes and landmarks are placed by rule
  (`sim/mapgen.ts`); every other building is drawn by hand, tile by tile, in `sim/cityPlan.ts`.
  The match seed no longer changes the map, only the computer's doctrine and its dice.
- There are 6 core nodes and 5 server nodes, all in mirrored pairs (the centre node mirrors onto itself).
- Four corporate megatowers (Tokugen, Nexum, Axiom, Vanta) fill the four diagonal blocks around
  the centre server node. Tokugen is modelled after Militech's tower: a massive dark slab with a
  tall service tower bolted to one flank under a steel roof lattice, green neon strips the full
  height, ribbed floors jutting from its front between green brackets, banks of green tubes low
  down, outboard modules stacked up the far flank and the wordmark in green high on the slab.
  Nexum is modelled after Petrochem's tower: a dark grey concrete slab with fluted, stepped ribs
  up its corners and a taller ribbed tower behind, its emblem in a dark recessed panel high on the
  front under a heavy ledge, a column of dark louvres over a glass grid down the middle between
  two tall holo-advert strips, vent slits, and the emblem again in neon at its foot.
  Vanta is modelled after Arasaka Tower: a dark slate monolith on a
  flared, buttressed foot, flanked by tall side wings under a notched stepped crown, cold seams
  up its panels and its own white emblem (a broken ring round a V and a diamond) near its top, with a tall holo-advert column off one corner
  and its orange holographic koi still circling it. They are landmarks, not targets: each fills its whole block, cannot be
  driven through, captured or destroyed, and never becomes a base site. Their lots mirror like
  everything else; only the towers' looks differ.
- Between them the centre server node sits in a roundabout: painted ring lanes and an island of pink-leaved cherry trees at
  street level, and two stacked elevated ring roads above. It is scenery only and changes no
  pathing; a deck fades out while any ground unit is beneath it. No building is generated under
  the decks (`PLAZA_CLEAR_RADIUS` in `sim/mapgen.ts`), so nothing pokes through them.
- The city is zoned into districts by block (`sim/districts.ts`), in rings from the middle out:
  the **corporate core** (the 3×3 blocks around the centre), a **downtown** ring around it,
  **midtown** filling most of the map, **outskirts** just inside the edge and the **Blackwall
  fringe** along it. Two **industrial** patches sit on the flanks of each base. The zoning mirrors
  like the rest of the map, and the minimap outlines each district faintly in its own colour,
  unnamed, leaving the blocks dark so captured buildings stand out.
- Each district is drawn in its own way in the plan, with neighbouring blocks lined up so streets
  read as continuous frontages. A digit in the plan sets a building's height within its
  district's range (`DISTRICT_STYLES` in `sim/mapgen.ts`). Fill is the share of a district's lot
  tiles that is built on:

  | District | Fill | Layout | Heights | Building type |
  |---|---|---|---|---|
  | Core / downtown | ~60% | 2×2 to 3×3 towers on podiums and long slabs, tallest towers facing the centre | 30–70 | commercial |
  | Midtown | ~47% | mid-rise slabs lining the streets round open courtyards, pinwheel blocks, a few data spires | 16–34 | high-tech |
  | Industrial | ~40% | rows of long sheds lined up across the streets, and tank yards, round the core nodes by each base | 8–22 | industrial |
  | Outskirts | ~27% | terraces of houses facing the streets, a few apartment blocks | 10–22 | residential |
  | Fringe | ~19% | shacks along the inner street, scrap sheds, waste ground out to the edge | 6–14 | residential (sheds industrial) |
  | Base | ~12% | barracks rows beside the starting square | 8–16 | residential |

  Two rules hold everywhere, and `sim/mapgen.test.ts` checks them against the plan: buildings
  never touch side to side, so there is always at least a one-tile alley between them, and no
  open ground is ever sealed off from the streets. Every building is a rectangle with a matching
  twin across the centre. Overall about a third of lot tiles are built; the centre is the
  tightest and the edges the most open.
- Each starting base is a walled military compound (`baseCompound` in `sim/mapgen.ts`, drawn by
  `components/BaseCompound.tsx`). A blast wall runs four tiles out from the HQ along the two sides
  facing the map, with the Blackwall at its back: concrete T-wall slabs with a hazard band at the
  foot and a line of the side's colour along the top, and a watchtower on the corner. The wall
  can't be crossed. Each of the four roads that run through it has a gate, flanked by
  hazard-striped pillars with amber beacons, so everything leaves the base through a gate. Inside,
  the ground is reinforced concrete deck plating with steel joints and bolt plates, with marked
  lanes (yellow edges, dashed centre) along the roads out to the gates. The base blocks outside
  the wall are compacted military gravel.
- Roads are asphalt (`roadPieceOf` in `components/districtTheme.ts`), each straight piece turned
  to run along its road and laid edge to edge so the lines run on unbroken. City streets (core,
  downtown, midtown) are dark asphalt with a double yellow centre line and white edge lines; the
  main boulevard adds a dashed lane line either side. Suburban streets (outskirts, industrial,
  fringe, bases) are paler worn asphalt with cracks, a few patches and a faded dashed yellow
  centre line. Junctions are unmarked.
- The open ground in each district has its own texture (`components/districtTheme.ts`). In
  midtown every block is a green courtyard: open tiles beside a street or the boulevard are light
  concrete paving, the rest are lawn laid edge to edge, with a low pale kerb where lawn meets
  paving (`groundOfTile`). The outskirts work the same way with darker ground: small dark-grey
  pavers along the streets round empty parking lots marked out in bays, laid edge to edge
  with their aisles all one way. The industrial yards are plain jointed concrete with markings
  painted over each whole zone (`components/IndustrialYard.tsx`): a yellow-and-black hazard band
  along every yard edge onto the street, tyre tracks from each shed's door through its yard to
  the nearest street (the band breaks there for a gate), an oil stain at every door and a few
  more scattered about. Painted once for blue's zone and shown turned round over red's. The
  Blackwall fringe is old weathered concrete slabs, slightly corrupted by the wall
  (`components/BlackwallCorruption.tsx`): about one slab in four has a crack glowing with the
  Blackwall's red, magenta and blue static, tearing and flickering, and every fringe building
  flickers with patches of glitching scanlines on its walls, static on its roof and a glow round
  its base, gone once the building is destroyed. Downtown and the corporate core are a corporate
  plaza (`components/DowntownDressing.tsx`): polished dark granite along the streets with a
  magenta neon line inlaid at the kerb, plaza stone laid in a two-tone diamond lattice inside
  each block, and long planters with clipped hedges along the foot of every tower.
- The corporate towers downtown and in the core each wear one of five facades taken from Night
  City's centre (`components/corpoFacades.ts`), picked by hand for every tower and shared with its
  twin: **monolith** (near-black, scattered warm windows, full-height white light strips),
  **gold scale** (dark, glowing panels of gold scales on its two broad faces), **office** (slate
  blue, dense rows of lit office windows), **brutalist** (charcoal, horizontal louvre fins, an
  amber light line round it) and **ticker** (dark, bands of red LED readout). Each style comes in
  a few body shades, from near-black to dark grey, picked per tower so the district isn't a wall
  of black under the fog. Each tower is also massed
  and crowned by hand. Downtown mixes broad monolithic masses (3x3, 5x2, 2x3) with slim spires
  (1x1, 1x2). Massing: straight, set back, stepped, on a plinth, a narrower crown storey, a
  heavy **cantilevered** upper mass overhanging the street, a deep recessed **waist** of open
  floors, or **top-heavy** (narrow foot, broad mass above). Crowns: spire, stacked blocks, lit
  helipad, antenna cluster, blade fin, or a **beacon**: a holo-projector throwing a column of
  light into the sky, ringed by bands of scrolling holographic ad glyphs. Four massive enclosed
  **sky-bridges** a side (`components/DowntownBridges.tsx`) span the streets between towers high
  up, two of them over the boulevard into the plaza; a bridge goes when either tower falls.
- Midtown's green blocks are apartment buildings (`components/midtownLooks.ts`). Most blocks are
  mixed: each building has its own windows (data-centre bands, apartment windows or balcony
  floors), massing (straight, set back, on a plinth or with a narrower top storey), roof (water
  tanks on stilts, a roof garden, plant and an antenna ring, or masts) and, on some, a ground
  storey of lit shopfronts under an awning. Three blocks a side are apartment complexes: four
  matching buildings of one height and look, joined across the alleys between them by enclosed
  sky walkways (`components/MidtownSkyways.tsx`). The plan's midtown blocks were redrawn so
  fewer of them repeat the same four-square layout.
- The outskirts' blue buildings are cheap housing (`components/residentialLooks.ts`): tenement
  windows, concrete housing projects with access balconies and washing on the rails, or patched
  mismatched panels, in weathered paint; mostly sheer, some with a narrower storey added on top;
  AC units bolted on the walls, a zigzag fire escape down the front of most, a corner shop under
  a few, and on the roof a shack, satellite dishes, a laundry line or water tanks.
- Industry follows Night City's industrial districts (`components/industrialLooks.ts`): pale
  corporate plant halls with a dark band round their foot and a code stencilled big on the front,
  rusty teal and orange sheds with louvre vents, wall pipes and external stairs, and corrugated
  warehouses under sawtooth roofs; on the roofs, smokestacks with drifting smoke, red storage
  tanks, vents and fans, or tower cranes. Each zone has one big plant hall. Pipe gantries
  (`components/IndustrialGantries.tsx`) cross every alley and street between facing industrial
  buildings: red steel trusses carrying pipes from the halls and sheds, bare pipe runs between the
  small utility blocks. Industrial heights run 8 to 22.
- Server nodes are drawn as data centres (`components/ServerNode.tsx`): a gunmetal block whose
  walls are banks of server racks behind glass with blinking status LEDs, a cooling plant of
  four spinning fans and exhaust vents on the roof, a status mast and parapet in the owner's
  colour (cyan when neutral), and glowing fibre conduits down its corners and out along the
  ground with data pulses running along them.
- Core nodes are drawn as core extraction reactors (`components/CoreNode.tsx`): an armoured hex
  housing over the shaft, four pylons holding a glowing amber energy core that turns and pulses
  inside two tilted containment rings, an energy column down into the shaft, and six conduits on
  a hex pad with pulses running in. The rim, rings and pylon lights take the holder's colour.
- A building bigger than one tile is drawn as one building (`components/FootprintBuilding.tsx`),
  though each of its tiles is still captured, damaged and destroyed on its own. Windows and neon
  run along its outside faces only, a dark roof slab with a lit rim covers it (in the owner's
  colour once taken), and one tile carries its rooftop pieces: a crown and spire on commercial
  towers, plant and an antenna on high-tech blocks, a smokestack and storage tank on industrial
  sheds (which also get sawtooth roofs, pipe runs along their walls and, on many, a tower crane)
  and a water tank on housing. Towers on podiums stand slim on a low base. Downtown towers carry
  flickering holographic billboards, flat panels or tall blade signs, advertising the city's
  corporations and street businesses. Single-tile city buildings use the same kit.
