# Sector 7 – playable build design

This is the design behind the `claude/playable-game` branch. It takes the systems already in the
game (core nodes, the energy grid, compute, doctrines, the ability units) and wraps them in a
complete match: a fair map, an opponent, a counter-based roster, production that takes time, and a
way to win. The numbers live in code (`sim/units.ts`, `constants.ts`). This file explains the intent,
so tuning keeps the shape.

## The factions

The two sides are rival corporations, each in the colours of its tower in the city
(`components/Landmarks.tsx`): **Vanta** in deep red (`#c8102e`), from the north-west base, and **Tokugen** in
green, from the south-east. Their colours (`TEAM_COLORS`) mark units, bases, badges, force fields,
the minimap and the HUD, and their names (`TEAM_NAMES`) are used wherever a side is named: the team
panels, the setup and end screens, base labels and the pacing report. Both colours are light, so
the role badges draw their symbols in dark ink (`components/factions.ts`). In the code the sides keep
their ids: `blue` is Vanta and `red` is Tokugen.

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
- **Late game:** Tier 3 units, the last ranks of the doctrine track, Bombardment Drones opening lanes through blocks,
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
  and the computer's Ballistas strike upgraded refineries first, then any refinery, before other
  buildings.
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
  - A trained unit comes out on the nearest free road tile round its building, and of those the
    one nearest the middle of its base (the side's nearest Command HQ), so new units gather inside
    the base rather than against its walls; the ring widens to three tiles if crowded
    (`spawnTile`).
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
  the grid forward behind them. They capture anything within 2 tiles, straight or diagonal
  (`CAPTURE_RANGE`, `sim/capture.ts`), so a squad walking down a street takes the buildings set a
  tile back from it too.

## Movement

- Ground units move at 2× speed on main roads, 1× on streets and 0.5× on open ground, and they
  route by travel time (`sim/pathfinding.ts`): a unit will detour onto a highway when that gets it
  there sooner than the direct line through side streets and empty lots.
- Aircraft ignore terrain: they fly a straight line, diagonals included, over buildings and city
  blocks, at the same speed everywhere.
- On screen, a unit glides between the game's movement ticks (`components/glide.ts`): it keeps
  going along its route at its speed and is eased toward each new position as it comes in. The
  guess counts game time in ticks, not seconds: the game moves a unit one tick's worth per tick
  however late the tick runs, and with the page busy in a big fight ticks come late, so a guess
  by the clock ran units on past where the next tick put them and each tick pulled them back
  (rubber-banding). Now a unit reaches where the next tick will put it just as that tick comes in,
  at the pace ticks have lately been coming, and waits there if the tick is later still.

## New command bases

Rules: `sim/bases.ts`. Once every building in a city block (the 5x5 lot between roads) is
destroyed, the block's rubble is cleared away and a base site appears at its centre: a glowing
hex pad with a button over it. Only a whole block does: a lot that a street or main avenue runs
through (the lots along the two central avenues, and a few by the bases) is two half-blocks, and
its rubble clears but no site appears (`splitLot`, marked by `sim/mapgen.ts`). Core and server
node blocks never become sites either, and the computer never levels a block that wouldn't make one.

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

| Tier | Research cost | Research time | Unlocks |
|---|---|---|---|
| T1 | Start | | Scout RC Cars (from the HQ), Troopers, Ghosts, Razorbacks, Thunderheads, Battery Mules, Drones, Guardians, Helios, Masons |
| T2 | 120 compute | 45 s | Lancers, Titans, Aegis, Wasps, Hornets, Banshees, Field Fabricators, Swarm Hosts |
| T3 | 360 compute | 60 s | Bombardment Drones, Ballistas |

Research from the button in your team panel or the HQ build menu. The compute is paid when you
start; the tier unlocks when the research is done (`TIER_RESEARCH_MS` in `sim/units.ts`,
`advanceTierResearch` in `sim/economy.ts`), counting down only while you have an HQ standing. Both
buttons show the countdown and a progress bar meanwhile, and one tier is researched at a time. The
fanfare, the announcer's "Tier two unlocked" and the notice come when it unlocks; the computer
player researches the same way.

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
of the match can unlock or train it (`sim/heroes.ts`).

| Doctrine | Hero | Class | Health | Speed | Weapon |
|---|---|---|---|---|---|
| Heavy Metal | Goliath | Armour (heavy) | 1400 | 0.8 | Heavy MG, 16 dmg / 0.3 s, range 5, hits air; grenades |
| Shadow Ops | Kage | Infantry (captures ×2) | 650 | 1.4 | Katana (melee), 60 blade dmg / 0.8 s, range 1.3, ground only; Optical Camo |
| Netrunner | Cipher | Support (light) | 800 | 1.0 | Smart SMG, 14 dmg / 0.5 s, range 4, hits air |

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

**Cipher (Netrunner)** is an intrusion operative who fights with the network
(`sim/netrunnerHero.ts`, `components/models/CipherModel.tsx`, built from the unit kit): a long dark
coat with a team-colour hem, a deep hood over a black faceplate with a cyan visor and three lens
dots, a cyberdeck on the back cabled to a holo-screen over the left forearm, a compact smart SMG,
and a small hack drone circling over the shoulder.
- **Smart SMG:** light, decent against everything, hits aircraft.
- **Override** (its ability, from Tier 1; 40 s cooldown): aimed at a spot up to 7 tiles away (in
  sight), it seizes the nearest enemy light vehicle or aircraft within 2 tiles of it (not
  infantry, heavy armour, heroes, generators or couriers) for 15 s: the machine is the side's own,
  to order about and fight with, then goes back to its owner wherever it is. A seized machine
  wears a ring in its new side's colour that drains as the hold runs out, and a spinning glyph;
  Cipher's holo-screen flares and its drone sends out a ring as it casts. The computer seizes the
  most valuable machine in reach.
- **Uplink** (passive): once the side has the Sentinels' code, Cipher hacks neutral Sentinels from
  5 tiles rather than 2, three times as fast (under 3 s), with the usual check that no enemy is
  contesting it.

- **Unlock:** take the hero at **rank 3 of the doctrine track** (8:00 at the earliest; see The
  doctrine track). It gives no stat bonus; it lets the hero be trained at Advanced Research. A side
  that takes the other rank 3 option has no hero that match.
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

Units built in code are moving onto a shared kit (`components/kit/`). The look is simple but
military: sharp-edged armour plate with flat, untextured tones, so the silhouette and the angles of
the plates carry the detail, team colour as stripes and markings, and only a few small lights.
Edges are hard by default; a part is rounded or bevelled only where that makes sense (track
belts). The Titan tank (`components/models/TitanTankModel.tsx`, also the orbital-drop Titan) and
the Guardian, the Battery Mule, the Thunderhead, the Ballista, the Aegis, the Banshee, the Mason, the Razorback, the Scout RC Car, the Hornet, the Helios, the Kestrel, the Wasp, the Bombardment Drone, the Infiltrator, the Swarm Host, the Crawler Drone, the Lancer, the Trooper, the Ghost, the Field Fabricator, the Bulwark Field Generator and the Cloaking Field Generator are done, as are all the base structures; the rest of the roster follows by type.
- **Materials** (`materials.ts`): a shared palette as cached, flat-shaded materials: olive
  drab armour, dark olive secondary plates, bright metal, black, dark matte composite (skirts,
  panniers, bumpers) and pale equipment housings; team colour as paint; and lights (`glow`) that
  ignore tone mapping so they glow (cyan for the standard army). A unit isn't one flat colour:
  each part takes the material it would be made of, tuned as what it is: bare metal metallic, paint
  satin, polymer less, rubber matte. Every plate carries a little wear (`weathered`), a fine
  mottling of its tone and roughness in the part's own space, and sets how much of the
  environment's soft fill it takes (paint little, so it isn't washed flat; metal all). It also
  adds a rim: a cool light on faces seen nearly edge-on, which on faceted parts are the thin bands
  along a silhouette, so units stand out from the dark streets from any camera heading. A unit
  animating its own material (a scrolling track, a pulsing light) takes a copy with `own`.
- **Lighting** (`components/Atmosphere.tsx`): besides the suns and fill lights, an environment
  built once from light panels, not loaded: softboxes where the suns are, a dim sky overhead and
  in a ring all round, neon cyan and magenta strips low on the horizon and an amber city glow.
  It is what metal reflects, so steel reads as steel from any camera heading.
- **Shadows** (`components/KeyLight.tsx`): only the key light casts them, and its shadow is
  fitted every frame to the ground in view (the screen's corners traced to the ground, out to the
  fog), so units get crisp shadows and shadow each other rather than a map-wide blur. The box
  moves in whole shadow texels and steps in size, so shadows hold still while the camera pans or
  zooms; filtered (`shadows="percentage"`) with a soft-edge radius. Surfaces are lifted clear of
  their own shadow by a normal bias set in shadow texels, so it grows with the box; too little and
  the soft-edge sampling half-shadows a surface into a noise texture that crawls as the view moves.
  The shadow map is redrawn every other frame, reaches only a little past where the fog thickens,
  and small kit parts (under 0.2 units) and lights don't cast: together these cut the shadow pass
  by more than half.
- **Ambient occlusion** (`components/PostFx.tsx`, N8AO): darkens where surfaces close in (under
  hulls, where legs meet bodies, round buildings' feet) from the depth buffer alone, at full
  resolution (half shimmers on big walls), first in the post-processing chain so it works on the
  scene's real brightness. Its transparency mode is off: it would walk the whole scene and draw it
  twice more every frame. A guard after it turns any non-finite pixel (NaN, infinity) black and
  clamps negative colours before bloom: bloom's blur would otherwise spread one such pixel over half
  the screen or all of it. Bloom's own brightness filter is off (the bloom layer selects what
  glows); at a threshold of zero it computes smoothstep(0, 0, x), undefined in GLSL and a NaN on
  some GPUs.
- **Bloom** (`components/PostFx.tsx`): every opaque unlit light (the kit's `glow` parts, the
  city's neon, structure trim) glows with a soft halo in its own colour. It is selective: lights
  are found by a sweep of the scene (a slice of it each frame, under half a millisecond, as the
  whole scene is tens of thousands of objects) and put on a bloom layer, so lit surfaces never bloom however
  bright, and nothing has to be pushed to white to bloom. See-through lights (exhausts, the force
  field dome) don't. Tone mapping comes after bloom, then grading on the displayed image: a little
  more contrast and saturation, and a vignette. `?render=slow` (software rendering for tests) skips
  the post-processing chain.
- **Drawing cost** (`components/kit/Batched.tsx`, `perf.ts`): a model is dozens of small parts,
  each its own draw call (twice with its shadow), so every unit model and city building is drawn
  through `Batched`: watched for a moment after it appears, then every part that has stayed put
  is merged, one mesh per material, into a mesh carried by whatever carries it (the model, or a
  part that moves: a turret, a wheel, a bobbing hull). Nothing has to say what moves: a part found
  moving, changing or being shown or hidden later puts the model back to its own parts at once,
  and the rest are merged again a moment later without it. Merging is spread over frames (2 ms a
  frame, what's on screen first), and identical models (every Trooper of a side) share their
  merged shapes. Parts whose own shader reads their coordinates (a building's capture fill) stay
  apart; the kit's wear grain, which only shifts, doesn't count. Typical units go from 70 to 170
  draw calls to 17 to 30, and a zoomed-out view of the city with an army in it from about 7,800
  draw calls a frame to 3,300. And three.js's per-frame matrix walk, which visited every one of the
  scene's 80,000 objects, now skips anything hidden (off screen, merged away, a muzzle flash
  between shots) and frozen subtrees (`installMatrixWalk`); a hidden object catches up when shown.
  `GAME_CHEATS.batching(false)` turns merging off to compare; `verifyBatching()` checks every
  merged model draws just what its own parts would.
- **Explosions** (`components/FireballFx.tsx`): a high-explosive blast is a white-hot flash and a
  glow thrown on the ground, a pressure ring racing out along it, a fireball of soft, ragged flame
  puffs thrown out and up that cool from white through yellow and orange to a deep red, sparks
  streaking out on falling arcs, dark debris thrown up that lands and lies a moment, then smoke
  rising out of the dying fireball (lit orange underneath at first, then dark grey) that spreads
  and thins away, and a scorch mark left on the ground. One in the air leaves no ring or scorch,
  and its debris falls to the ground. The flame and smoke are camera-facing sprites with a cloudy
  texture drawn in code, one instanced mesh per kind; flame, sparks and flash are added light
  brighter than white, which tone mapping rolls off into a hot core. Nothing in it writes depth: a
  see-through shape that did would hide whatever is drawn after it inside its outline, and the
  ambient occlusion and bloom passes, which read depth, would shade and cut out the scene under it.
  The flame lasts the explosion's duration (at least 0.7 s); the smoke and scorch 3.6 times that.
- **Textures** (`textures.ts`): only two, drawn in code: a soft tread that scrolls so tracks
  visibly run, and a contact shadow.
- **Parts** (`shapes.tsx`): `Plate` (a box, sharp unless given a `radius`), `Prism` (an outline
  extruded into a slab, for angled armour, sharp unless given a `bevel`), `Loft` (a solid tapering
  from one top-view outline to another, for hulls that slope in), `Turned` (lathe parts:
  barrels, masts, sights; few segments give flat facets), `Wheel`, `Strip` (a light) and
  `ContactShadow`. Geometry is cached and shared.
- **The Titan**: a long hull with a sloped glacis and armour blocks across the nose; composite side
  skirts over the tracks, hung with add-on armour modules and two diagonal team stripes; a long,
  low turret in two angular tiers with a remote weapon station, a commander's sight and two
  antennas; and the rail gun, a slab-sided shroud with cooling slots and a glowing slit down each
  side, ending in a round barrel. Its turret turns to what it is shooting at (`turretAt`, from
  CityMap), the rail gun recoils and its slits flare when it fires, and the tracks run and the
  hull rocks while it drives.
- **The Guardian** (`components/models/GuardianModel.tsx`): a six-wheeled robotic carrier with a
  sloped nose, a dark sensor window and a composite bumper; composite panniers over the wheels with
  team stripes; and a pale module with green repair crosses carrying the repair emitter on a
  telescopic mast (a six-sided head with a pulsing green band, where the repair beams start), a
  turning radar panel and the Trophy launcher, whose light turns red while it reloads. Repair green
  (`PALETTE.repair`) is kept for repair, so it reads at a glance.
- **The Battery Mule** (`components/models/BatteryMuleModel.tsx`, sim type `sun_plate`): a short,
  wide, heavily armoured tracked carrier with a heavy sloped cab and armoured vision slits, thick
  composite skirts with armour modules and team stripes, and an armoured bay of three battery cells
  laid lengthways: each a large core glowing power yellow (`PALETTE.power`) in an open armoured
  frame (tray, end caps, two ribs, top rails), so most of the cell shows. The charging links start
  from the cells; yellow light also shows through vent slits in the bay walls and at the charging
  port. Anchored, it settles onto four stabiliser jacks and its cells glow brighter.
- **The Thunderhead** (`components/models/ThunderheadModel.tsx`, sim type `howitzer`): an
  eight-wheeled armoured rocket truck with an angular cab (light bars, a sensor ball, smoke
  dischargers, team stripes), composite lockers along the rear deck, and four armoured rocket pods
  on a turntable, nine tubes each with red lights at the muzzle. Anchored, four corner jacks push
  down onto the ground and the launcher turns to its target and raises its pods. Its shots fly as
  rockets (CityMap's `ShellMesh`): from the pods, nose along the arc, a flame behind.
- **The Ballista** (`components/models/BallistaModel.tsx`): on the move, a large eight-wheeled
  armoured truck, much longer than a Titan so it makes a big target: an angular cab with a sloped windscreen, a sensor bar and a front plough, and a
  long armoured module on the back hiding the launch tube. Loading or armed and standing still, it
  erects: the module swings up on hydraulic rams about its rear edge (a jack plants under the
  hinge) until the tube's round mouth faces the sky. The missile slides up the tube as it loads,
  and when armed its nose stands out of the mouth, its collar ring glowing its type's colour (EMP
  blue, HE red, WP white; the missile model is below). Fired, or driving off, it folds down; the
  missile leaves from the mouth's height.
- **The Aegis** (`components/models/AegisModel.tsx`): an eight-wheeled truck carrying a close-in
  weapon system: a boxy angular cab, the gun mount on a pedestal mid-deck, and a long rear with a
  generator housing carrying a big search radar, a wide two-faced panel array turning on a tall
  mast behind the gun. The mount turns, and the gun and its pod
  elevate together: a six-barrel rotary cannon under an angular six-sided armoured pod with a dark
  sensor band, a lens and a team-colour band. On a target, it turns and lifts onto it (CityMap's
  CIWS stream passes each Aegis its target, `ciwsAims`) and the barrels are at full speed the
  moment it opens fire, running down after; idle, it sweeps.
- **The Banshee** (`components/models/BansheeModel.tsx`): a six-wheeled EW truck. Right behind
  its angular armoured cab, a rack of three tether spools, cable drums whose outlets light when
  their hardline is connected; the tether cables run from those outlets. Over the back three
  quarters of the bed, a big jamming dish on a turntable, tilted to the sky with an emitter at its
  focus: it spins and the emitter glows while the jammer is on.
- **The Mason** (`components/models/MasonModel.tsx`): a six-wheeled combat engineering truck: an
  aggressive armoured V-blade on push arms and rams (swept back from a ram-spiked point, steel teeth
  along the cutting edge, hazard stripes on its jutting lip), an armoured cab, an armoured
  materials box behind it with steel beams strapped on top while it carries materials, and a
  knuckle-boom lifting arm at the back ending in a big three-claw pincer. Building, the arm rises
  off its rest, slews and reaches out, its claws working and work light flashing, and the
  construction beam runs from its tip; otherwise it lies folded over the box.
- **The Razorback** (`components/models/RazorbackModel.tsx`): a six-wheeled light armoured car
  with a long sloped hood behind a steel grille guard, a faceted armoured cabin with a dark
  windscreen, armoured doors with team stripes, roof rails and a light bar, and a remote weapon
  station on the roof: an anti-personnel machine gun behind a small shield, with an ammunition box
  and a sensor head. The gun turns to what it is shooting at (`turretAt`) and flashes at the
  muzzle when it fires.
- **The Scout RC Car** (`components/models/ScoutCarModel.tsx`): a small six-wheeled stealth UGV on
  oversized wheels, much smaller than the other vehicles: a low faceted shell in dark stealth
  tones, fender pods, small red and amber lights, a team stripe down the spine, and a sensor array
  on a short mast (a pan-tilt head with three lenses and a dome) that scans to and fro.
- **The Hornet** (`components/models/HornetModel.tsx`): an armoured VTOL attack drone, wide and
  low: a broad, chamfered, layered deck (spine, dome, cable runs, handle, antenna, team colour),
  and below it one hull sloping in on every side to a narrow keel (the kit's `Loft`). The keel's
  flat face carries a sensor array (two lenses, a grille, a light), and at its foot the
  twin-barrelled gun only just stands out of its slot, turning a little toward its target
  (`turretAt`) and flashing when it fires. Four splayed thruster pods hang under the deck's rim and
  fire flickering jets downward (grab rails, team markings, canisters on the front pair); with
  Hunter-Killer Rockets researched, a cluster of four rocket tubes rides on each side of the deck.
- **The Helios** (`components/models/HeliosModel.tsx`): a hovering power drone: an armoured body
  with a team band, a solar array of four tilted panels on a mast, four jet nacelles on short arms
  firing down, and under the body, facing the ground, the microwave projector: a flared horn whose
  core and ring glow gold while it charges friends and orange-red while it microwaves enemies, and
  go dark when it can't work.
- **The Kestrel** (`components/models/AttackDroneModel.tsx`, sim type `attack_drone`): a small
  attack drone: a slim, long faceted body with four short blade fins standing near upright from its top
  corners, running fore and aft with the body, and two fins out of its lower sides angling down;
  each has a slatted vent through it, a red edge and serrations, on a hinge pin. Slots in the
  body's sides show where the fins fold away when it isn't flying: the bottom fin up into the
  middle, the top fins down fore and aft of it. No team colour on the body. A sensor array on the
  front (a big round lens, a column of red-ringed lenses) and a short twin gun under the front
  that flashes when it fires.
- **The Wasp** (`components/models/WaspModel.tsx`): a compact faceted VTOL body with a sensor
  face, a chin gun, a tail fin and stabilisers, and two lift jets under it. Long, swept wings
  carry its micro-drone launchers: two hex pods hung under each wing on pylons, their faces
  clusters of tubes with a red-nosed micro drone in each, and team bands. Red and green wingtip lights.
- **The Bombardment Drone** (`components/models/BombardModel.tsx`, sim type `bombard`): an
  unmanned stealth flying wing: a cranked-kite planform with a sawtooth trailing edge, a low hump
  along the middle with a dorsal intake and flat exhaust slots, raised wing panels, team markings
  and wingtip lights. Under the middle, a bomb bay whose doors swing open while it bombards,
  showing the munitions left in its rack.
- **The Infiltrator** (`components/models/InfiltratorModel.tsx`, sim type `drone`): a
  blended-wing stealth drone with very long wings, body and wings one sweeping piece: a pointed
  body widening into long, slender, slightly swept wings, a low hump with a dorsal intake, two
  small canted fins and a flat jet nozzle with a glowing exhaust at the tail. A sensor array on the
  nose (a dark window on top, a turret under the chin); a radar rotodome on a short fairing that
  turns while the radar runs, its scan bar lit. Team markings near the wingtips.
- **The Swarm Host** (`components/models/SwarmHostModel.tsx`, sim type `swarm_host`): a big,
  sturdy armoured six-legged crawler: a massive faceted hull (tapering belly, skirt band, sloped
  armour to a flat deck) with amber sensor lenses and a short gun on the glacis, and six short,
  thick legs close in to the hull, each shin faced with a segmented armour slab, posed by a two-link solve so the feet stay planted. It walks
  in alternating tripods. Anchored, it kneels to the ground with its legs splayed, then its split
  deck hatch opens and its micro crawler drones rise into view. Each Crawler Drone it releases
  (the opening pair once it has opened up, then one at a time) is fired out of the hatch in a
  canister that arcs to where the drone lands, kicking up a ring of dust. The drone only comes
  into being as its canister lands: the host carries its canisters (`pendingCrawlers`) and the
  game tick turns each landed one into a Crawler Drone (`landCrawlers`, sim/support.ts).
- **The Crawler Drone** (`components/models/CrawlerDroneModel.tsx`, sim type `crawler_drone`):
  a micro Swarm Host on four legs with a rounder body: a faceted dome shell over a skirt band,
  amber sensor lenses on the front, a team stripe and a stub antenna, and four short, thick legs
  with armour-slabbed shins. It scuttles in diagonal pairs. The Swarm Host's legs and the
  Crawler's share the two-link leg solve in `components/kit/legs.ts`.
- **The Lancer** (`components/models/LancerMechModel.tsx`, sim type `lancer`): the anti-vehicle
  infantry unit as a heavy two-legged mech. Its hull is one compact armoured wedge slung low
  between its legs (narrow belly, wide flanks, the front face sloping back to the top) with a
  chin sensor cluster, headlight clusters, a searchlight and an antenna. Two crouched,
  digitigrade legs bent twice: huge armoured thighs forward to gridded knee pads, shins back to
  raised ankles, then foot segments forward to clawed feet. Each upper flank carries an arm with
  a rocket pod over a machine gun; the arms come up while it fights and kick back on each shot.
  Each leg is posed from the foot up (the foot segment, then a two-link solve to the ankle).
- **The Trooper** (`components/models/TrooperModel.tsx`, sim type `trooper`): the basic
  infantry unit in full armour. Underneath, a body that reads as a person: tapered,
  smooth-shaded limbs and torso in a dark undersuit (`smoothMaterial`, kit/materials.ts). Over
  it, angular, flat-faceted armour: a vest wrapping the torso, abdominal plates, layered shoulder
  plates edged in team colour, faceted bracers, thigh and shin guards, angled knee pads, boots;
  and a faceted combat helmet with a brow ridge, cheek guards, a wraparound visor with a lit line
  and an angled faceplate. A backpack, and a plain futuristic rifle held in both hands. It walks
  with swinging legs and bending knees, carries the rifle at low ready and brings it up to aim
  while fighting.
- **The Ghost** (`components/models/GhostModel.tsx`, sim type `ghost`): the EW specialist, the
  Trooper's armoured soldier with a large EW pack in place of the backpack: a tall armoured case
  with battery cells and a lit status strip, and an antenna array rising well above the helmet (a
  telescoping mast with a crossed array at its head, two splayed whips with blinking red tips, a
  small flat panel). Phantom Decoy and Cloaking Field tint it as before.
- **The Field Fabricator** (`components/models/FieldFabricatorModel.tsx`, sim type `mule`): a
  long-wheelbase six-wheeled truck: an armoured cab, a compact fabrication station right behind it
  (a housing with a tool gantry, lit work windows and a vent stack), and the rest of the bed in
  four steel box cages, two across and two high, each holding one missile, nose to the rear. The
  cages show the stock in the Ballista's missile (below): each missile fabricated has its nose on and
  its collar ring in its type's colour, each material charge not yet made is a bare body, the rest
  of the cages are empty. While it fabricates, the station's windows and the next bare body's ring
  pulse in the colour of the warhead being made.
- **The Bulwark Field Generator** (`components/models/FieldGeneratorModel.tsx`, sim type
  `field_generator`): the drop pod it comes down in, landed and braced. An octagonal armoured hull
  with sloped sides and team stripes, four stabiliser legs hinged out onto foot pads, four
  capacitor banks with lit cell windows on the deck, and a six-sided projector column ringed with
  heat sink fins, crowned by three curved emitter vanes round a faceted lens. While the dome is up
  the lens and cells glow in the dome's colour and pulse and the crown turns; down, they go dark
  and a warning beacon blinks red.
- **The Cloaking Field Generator** (`components/models/CloakGeneratorModel.tsx`, sim type
  `cloak_generator`): a low twelve-sided armoured drum on four pads, ringed with lens intakes (a lit
  lens set back in each deep housing, a smaller ring tilted up on the chamfer) as if watching the
  ground round it, and a team band. On the deck a core with a violet crystal and four cradles;
  above it four floating projectors. While the field is up they hover, bob and circle the core,
  each throwing a faint violet beam out and down (nested additive cones, so it fades along its
  length), and a bright sweep runs round the lenses; down, the projectors settle onto their
  cradles, the lights go dark and an amber standby light comes on. Its lights are `cloakExempt`:
  while the generator sits cloaked in its own field the rest of it takes the cloak's tint, but
  they keep scanning and projecting.
- **Base structures** take their own palette in `materials.ts` rather than the army's olive: a
  light and a dark grey and near black (`structLight`, `structGrey`, `structDark`), with team
  colour as stripes and lights.
- **The Command HQ** (`components/models/CommandHqModel.tsx`, drawn by `components/Base.tsx`,
  which keeps its menu, health bar and build-up): a heavy foundation block on a dark plinth (a
  window band and a roll-up vehicle door at the front, a pipe run at its foot, vents and a service
  door at the back, a lower annex with a door and a railed balcony), and a tall watchtower set
  back on it: corner pillars, an X-braced truss band, a duct from a utility box, a ladder up the
  back. An overhanging control cab sits on an angled underside, dark windows all round, and on its
  roof a comms mast (antenna panels, two dishes, a blinking team beacon at the tip), two radomes
  and a turning radar array.
- **Facing** (`kit/facing.ts`): the base buildings on an HQ's pads turn their fronts (doors, yards,
  markings) in toward the middle of their base, the nearest Command HQ of their side, squared to
  the nearest of the four headings. The Command HQ itself faces away from the middle of the map,
  toward the corner its owner's camera starts in.
- **The Barracks** (`components/models/BarracksModel.tsx`, structure type `infantry`): an L of
  two blocks on a raised, chamfered concrete pad with ramps. The two-storey main block holds the
  bays (two roll-up doors under awnings, weapon lockers, hooded windows; AC units, a pipe run and a
  whip antenna on its roof); the command block beside it stands a storey taller (a railed stair to
  a double door, two team rank chevrons, a screen facing the yard, floodlights; on its roof a comms
  mast with dishes, a slowly turning satellite dish, AC boxes and exhaust stacks). In front of the
  bays a fenced training yard (assembly circle, targets, a pull-up frame), and supply crates.
- **The Factory** (`components/models/FactoryModel.tsx`, structure type `armor`): a vehicle plant
  on a raised concrete pad. A long assembly hangar with a chamfered roof and ribs, its front a
  portal framed in dark plate opening on a lit bay where two robot arms work, sparks flashing;
  rails run out across the pad. Beside it an office block (door, marked sign panel, AC unit) and a
  machinery block with pipes; behind, two smokestacks, a domed tank on a lattice frame and a
  lattice tower; over the east side a gantry crane whose trolley runs slowly along its beam.
- **The Airpad** (`components/models/AirpadModel.tsx`, structure type `air`): a landing deck held
  high on one column. A footing block with a door, braced by two splayed buttress legs; the column
  in segments, two spines framing a dark lift core (a lift car rides it), framed openings and
  X-braced panels, a small railed side platform; at the top the spines fork into a Y under a broad
  deck reaching out over the front: a landing pad (team-colour mark and H, edge lights blinking
  round it in turn), an apron of grille panels, fan housings under its sides, a mast with a beacon.
- **The Comm Link** (`components/models/CommLinkModel.tsx`, structure type `support`): a signals
  tower on a raised platform. Four stilt legs on lit footings under a faceted platform with a
  railing, a stair down one side and a grated walkway out from another; on the deck a core block
  (lit doorway, team stripe), a canopy and an upper cab, with a tall slanted fin up the back. A
  lattice mast (`kit/lattice.tsx`) climbs from the cab: sector panels, small dishes, a whip with a
  blinking beacon; and near its head, out on one side, a large dish with a three-strut feed,
  panning slowly.
- **The Depot** (`components/models/DepotModel.tsx`, structure type `builder`): a gantry loading
  bay on a raised deck deep enough to hold a lit supply pit under a pair of floor doors. Four
  corner pillars carry side rails; a hazard-striped bridge with a toothed rack spans them, a hoist
  trolley on it. A control booth on a back corner, a winch drum on the front edge, and a roller
  conveyor into a dispatch bay on the east side. While it has a Mason in training it runs a
  delivery cycle: the doors swing down, the hook lifts a crate (team band) out of the pit, the
  doors close, the gantry carries it to the conveyor and sets it down, and it rolls into the bay;
  when the work stops it finishes the cycle in hand and parks.
- **The Ordnance Fab** (`components/models/OrdnanceFabModel.tsx`, structure type `ordnance_fab`):
  a munitions plant with a silo. A round panelled dais with a lit pool in its middle; behind it a
  tall fabrication tower (dark plinth, pale tapering body, team stripe, a service column and pipe up
  its face, a dome, dishes and a beacon mast at the crown). Out from the tower over the pool, the
  silo ring: a drum with a band of windows on a funnel, a feed pipe down into the pool, and standing
  in three clamps on its collar the Ballista's missile. A lower block with a dome and antenna to the
  east, two spherical tanks on legs to the west. While it fabricates, the missile carries the
  warhead being made and its collar ring and the drum's windows pulse in that warhead's colour (and
  the window band turns); idle, the missile is a bare body and the windows are dim.
- **Advanced Research** (`components/models/ResearchLabModel.tsx`, structure type `research_lab`):
  the lab's dome, now of security glass in a cage of ribs, on a heavy armoured drum with a team
  band, vents and a front airlock. Inside, hung from the crown by cable bundles, a black monolith
  supercomputer: faceted down its front, rack modules with red lights down its sides, and a column
  of red data running down into a floor socket. The team-colour ring still orbits the dome, its
  track on two pylons. While research runs the data column flickers bright, the rack lights blink
  and the ring turns fast.
- **The Core Refinery** (`components/models/RefineryModel.tsx`, structure type `refinery`): a
  reactor sphere held in four arms under a cooling stack. The sphere is the building's bulk, wider
  than the stack and the collar, so its ring shows round the stack from the game camera above.
  Four heavy arms rise from a stepped round dais, bend wide at elbows where clamps grip the
  sphere's equator, and carry a collar ring on its crown; the sphere has
  a band of light in core yellow (`CORE_COLOR`, shared with the map's core nodes) and capsule
  prongs with lit collars. On the collar, a short, broad reactor-style cooling stack with steam
  rising. Between the arms' feet an electric security fence: posts with insulators, a see-through
  mesh, live wires humming in core yellow, a warning sign, and now and then an arc across a panel. Level 2 raises the stack and lights a second band and every prong's collar; while it
  upgrades the light pulses fast and the collar ring turns. The arms and the Comm Link's dish feed
  use the kit's `Strut`.
- **The CIWS Turret** (`components/models/AaTurretModel.tsx`, structure type `aa_turret`): the
  Aegis' gun on a fixed mount, in the base greys. An octagonal armoured plinth with sloped sides
  over a dark skirt, team stripes on four faces, amber lights on the corners and an ammunition
  hatch at the back; on its deck a turret ring carrying the same yoke, six-barrel rotary cannon and
  six-sided pod as the Aegis, a little larger. On a target, it turns and lifts the gun onto it
  (the aim CityMap's tracer stream shares with the Aegis) and the barrels wind up over its spin-up,
  and once it fires the stream leaves from the barrels' tips; idle, it turns slowly round,
  scanning the sky.
- **The Sentry Turret** (`components/models/SentryTurretModel.tsx`, structure type `defense`): a
  railgun on a heavy cradle, in the base greys, up on a gun tower so it fires down over the base
  wall instead of through it. The tower is a tapered octagonal concrete shaft (panel seams, team
  stripes, an armoured door and a ladder on the side facing into the base) flaring into a collar
  with downlights under a cantilevered deck with a railing; its gun stands about 12 high, clear of
  the wall's 7, and can look down 37 degrees onto targets just outside. On the deck, an octagonal
  plinth (team stripes, amber corner lights) with a turret ring; on it a turntable with two braced brackets holding a chunky angular
  receiver on trunnions, a power block at its back. Out of its front the railgun: a dark shroud,
  then two bare rails with the charging slot lit between them, clamp bands and a blunt muzzle. On
  the left a six-sided capacitor pack with four cell ends; on the right a sensor box with two
  lenses; on top the sensor array, a gimbal sensor head on a mast that turns on its own, a radome
  and a whip antenna. It faces out of the base, sweeping slowly; with a target it turns and lifts
  the gun onto it. The slot and cells charge up over the reload and flash as it fires, and the
  barrel kicks back. Its shot (`ShotFx` kind `rail`) leaves the muzzle as a white-hot slug in a cyan
  glow, very fast, leaving a straight ion trail and a wake of shock rings that hang and fade.
- **The missile** (`components/models/MissileModel.tsx`): one model for the Ballista's missile
  wherever it shows (the Field Fabricator's cages, the Ballista's launch tube, in flight): a long
  dark body, a forked tail of four prongs growing out of it and sweeping out round a nozzle, four
  swept fins ahead of them rooted in the body (each one piece with it), and behind a faceted dark
  nose a collar ring glowing the colour of its warhead (EMP blue, HE red, WP white).
  A missile with no warhead yet is a bare body, open at the front, its ring unlit.

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
- **The Sentinel** (`components/models/SentinelDroneModel.tsx`) hovers over its node's roof: a
  round grey robot that is all one eye. A smooth grey shell with dark seam rings, a belt round its
  middle with red lights and a stubby thruster pod on each side, a sensor mast with a blinking red
  tip, and a hover emitter glowing underneath. In front, the eye: a heavy dark rim under an
  armoured brow, a black socket ringed by eight shutter blades, a red iris round a white-hot pupil.
  It turns its whole body to look at what it is shooting and fires a flickering laser from the
  pupil (a white-hot core in a red glow, with a flare at each end); idle, it turns slowly round,
  looking down over its node, its eye dimmed.

Rough timings: holding just your own node, Tier 2 takes about 2 minutes of holding it, and Tier 3
another 6. Holding three nodes gets you from Tier 2 to Tier 3 in about 2 minutes.

### Camera

The camera's angle down is fixed (`components/DroneCamera.tsx`, `components/cameraView.ts`): it
looks down at 65 degrees, steeply but well off straight down. It opens along a diagonal heading set
per side (each looks across from its own base's corner toward the centre, so a player sees their
buildings' fronts). It pans with WASD or the arrow keys, turns with the right mouse button held and
dragged left or right (round the spot in the middle of the screen, which stays put; the right-click
that ends a turn doesn't cancel orders or clear the selection), and zooms with the wheel by a share
of its height per notch, on the middle of the screen, between 20 and 190 units up. Right out, it
takes in about 310 units across and 200 deep on a 16:9 screen: a good stretch of the battle, under
a third of the map's width, so the rest takes the minimap and scouting. The minimap's view box is
the true patch of ground on screen, a trapezoid wider at the top of the screen, turning with the
camera. The objectives have their own minimap icons so they're easy to find: a cyan chip with pins
for each server (compute) node and an amber hex with a dark core for each core node, ringed in the
holder's colour once taken.

### Sound

Weapons and explosions have sound effects, played with the Web Audio API (`components/sfx.ts`)
from recordings in `public/sfx/`, listed by sound in `public/sfx/manifest.json`. Every weapon and
blast has its own: rifle cracks (six takes), machine guns, flak, the CIWS guns' minigun (Aegis and
CIWS Turret alike, looping for as long as each burst lasts, riding over the gun switching targets;
the turret's starts with the recording's wind-up while it spins up, so its roar meets the first
rounds, and the Aegis's, which fires at once, starts straight into the firing), cannon booms, the tank's heavy rail gun shot, the Sentry
Turret's railgun slug, the Lancer's missile and the Thunderhead's rocket launches, the Sentinel's laser (a
loop that hums for as long as its beam is locked on, starting with the zap and fading when it
lets go), Kage's blade, explosions in three sizes picked by the size of the blast (a grenade or rocket, a
shell or bomb drop, a missile strike), EMP blasts crackling and shots on a force field thudding. Each plays one of its takes, a different one
from last time and a touch faster or slower each time, so a volley doesn't sound like one clip
repeated. Hits and destruction have recordings too: small-arms rounds ringing off armour, rounds
stopped by a building or wall chipping it (or, from a tank, rail gun or rocket, crunching into it),
a city building collapsing, a wall or gate breached, a blast gate hissing open or shut with its
thud, a soldier going down and a small drone falling; vehicles and larger aircraft now go up in a
fireball, with its explosion. The player also hears their own side's progress where it happens,
and only when it is on screen or within about 3 tiles of its edge (at any zoom; `reach: 'view'` in
`components/sfx.ts`), so the captures going on all over the map early in a match aren't a constant
chiming: a building finished, a unit ready, research done, a new Command HQ
ordered, a chime for each building taken (nothing while a capture is under way: infantry take
buildings just by walking past them, so a sound for it played whenever they moved through the city); their building
sites clank and weld on a loop while they go up (a timed build, or a blueprint with a Mason beside
it), and their blast gates hiss as they open and close. Only what matters wherever the player is
looking plays at full volume everywhere: a core or server node taken or lost, a new tier, and the
interface below. The interface sounds too: a click for every button,
a beep for each move or attack-move order, a buzz when an order is refused, a ping for a message
(unless the event's own sound already said it), an alarm when enemies reach the base or start
taking one of the player's nodes (only when playing: a spectator gets the message and its ping,
not the siren, since the computer sides contest nodes all match long), a radar warning when an
enemy missile launches (a Ballista or an Ordnance Fab silo launch, and nothing else). Each siren
comes with a line saying what it is for in the HUD's System Message box (bottom left), in red with a
warning sign and up for 12 s rather than the usual 6: "Your base is under attack!", "Your server
node is under attack!" (or core node), "Enemy missile launched!" (spectating, named for the side
being viewed: "Blue's base is under attack!", by its faction name). And a sting for
victory or defeat. Hover and selection are silent for now.

**The announcer's call window** (`components/CommsCall.tsx`, profile in
`components/announcerProfile.ts`). While the side's announcer speaks, a holo-call opens on top of
the system message box in the bottom left, joined to it: the caller's name (KAMI-OS, tactical
arbiter, for Vanta; TAC-NET, overwatch, for Tokugen) over a portrait frame, the voice's waveform
beside it (following its actual level), and the words being said below it in quotes, taken from
the voice manifest's `lines`. It flickers in when a line starts, stays a moment after it ends, and
closes. Each caller wears its side's colour (KAMI-OS deep red, TAC-NET green); a threat turns the
frame alarm red, pulsing, as a "priority channel". A line cut off by a more urgent one hands the
window straight over. The portrait frame is a space for an asset: set a caller's `portrait` in
`ANNOUNCER_PROFILES` to an image or looping video under `public/` and it shows there; until then it shows a placeholder feed,
a dim silhouette under scanlines marked NO FEED. `GAME_CHEATS.call(text, priority, ms)` opens it
for testing.

**The announcers** (`components/announcer.ts`; lines, voice direction and recording notes in
`docs/VOICE_PROMPTS_FACTIONS.md`, recordings in `public/vo/vanta/` and `public/vo/tokugen/`, each
with its own `manifest.json`): each side has its own corporate AI, speaking only to that side's
player (`setAnnouncerSide`; spectating, the side being viewed). Vanta's **KAMI-OS** is a composed,
aristocratic female arbiter who calls the player Director, enemies trespassers, and grows colder
rather than louder under threat; Tokugen's **TAC-NET** is a brisk, boastful male combat
controller who calls the player Commander and escalates fast under fire. Every line has a version
in each voice (some with two or three takes, picked at random). The announcer calls out what
matters to the player: the match starting and its result; the base, a node or the
perimeter under attack, an enemy missile launch, an enemy Orbital Drop near your forces, a
structure lost, the force field going down, orders jammed; nodes taken and lost; each base
building coming online, a new HQ, research, tiers and refinery upgrades (not units ready: they
come out too often); your own missiles and doctrine powers; and an order refused for want of cores, or a building
that can't go where it was placed (other refusals get just the buzz). She speaks one line at a time,
centred, on her own channel past the effects' compressor, and the effects dip while she speaks.
Each line has a priority (match result, then threats, objectives, base reports, refusals): a
threat cuts off anything less urgent, anything else waits for the line in progress (only the most
important waiting line, for up to 3.5 s), and each line has a cooldown so it isn't repeated. Lines
for an event with its own chime or siren start just after it. The recordings are clean; each voice's
treatment is added live, the same on all its lines (`VOICE_FX`): Vanta's crystalline and expensive
(a wide clean band, a faint high shimmer, a very short glassy doubling), Tokugen's a sat-link radio
(a narrow comms band with a push in the mids, light saturation, a little bit reduction, and a
squelch click keying each transmission in). Each signs off after every line with its own sound
(`public/vo/<side>/vo_end.mp3`, through the voice's treatment): KAMI-OS a soft, glassy chime of a
secure channel closing, TAC-NET a walkie-talkie squelch tail with a roger beep. A line cut off by
a more urgent one never signs off, and the next line waits for the sign-off. Spectating, like the siren, the announcer
stays quiet about attacks. Under it all, the city's own
background, a night-time megacity bed looping for the whole match, the same everywhere on the map
(`startAmbience`, from the steady stretch of its recording, its level evened out). Hornet rockets, Wasp micro-drone launches and the Ballista's launch have no recordings yet and are
made in code, as is any sound whose files haven't loaded (prompts for the rest:
`docs/SOUND_PROMPTS.md`). A sound is fainter the further it is from the middle
of the view (heard further when zoomed out, and explosions further than gunfire) and panned by
where it is across the screen. Each kind has a cap on how many play at once and how soon another
may start, and everything runs through a compressor, so a big fight stays a din rather than a wall
of noise. Audio starts on the player's first click or key press, as browsers require. The speaker
button under the match clock mutes it, remembered between visits.

### The doctrine track

`sim/doctrineTrack.ts`. A doctrine grows over the match, the way a leader's powers do in a
console RTS: a side earns **doctrine points** in the background, one every 90 s of match time,
a quarter faster for every server node it holds (two nodes: one every 60 s), starting with one.
The track has **four ranks**, opening at 0:00, 4:00, 8:00 and 12:00 and costing 1, 2, 3 and 4
points. At each rank the side takes **one of two options**, for good; the other is gone. Ranks go
in order. Holding server nodes gets a side to the top sooner; without them rank 4 comes at about
16 minutes.

| Rank | Heavy Metal | Shadow Ops | Netrunner |
|---|---|---|---|
| 1 | Scrap Haulers (wrecks worth double) / Field Welders (armour self-repair from the start, 10 HP/s) | Silent Running (infantry and light vehicles +20% speed) / Killing Ground (ambush ×2 instead of ×1.5) | Brute Force (hack in 3 s) / Sentinel Foundry (Sentinels 180 cores, 12 s) |
| 2 | Orbital Drop / Bulwark Force Field | Phantom Decoys / Cloaking Field | Nano-Cloud / Black Wall Infect |
| 3 | Goliath / Hardened Plate (vehicles take 15% less damage) | Kage / Quick Fade (go dark 2 s after a fight) | Cipher / Hardened Nodes (defenders after 45 s) |
| 4 | Arsenal (the other power too) / Overdrive (powers at half cost and cooldown) | the same | the same |

- The powers still cost cores and recharge; the track decides which a side has (no longer the
  researched tier). Taking the hero unlocks it for training at Advanced Research; its Mk II and
  Mk III refits are still researched there. Passing it up means no hero that match.
- The team panel shows the side's points (◆, with a bar to the next) and a Track / Choose button
  (pulsing when a rank can be taken) that opens the track sheet: the passive, then each rank's two
  options, taken, passed up, open, or what they wait on. Its powers appear as buttons once taken.
- A pick is an order (`PICK_DOCTRINE`, sim/orders.ts), checked like any other, so the computer is
  held to the same track.

### Doctrine in the team panel

A side's doctrine sits in its team panel under the corporation's name: the doctrine's name (the
player's own opens the doctrine track), its doctrine points (◆, a bar filling to the next, and a
Track button that reads Choose and pulses when a rank can be taken), and, for the player, the
powers taken on the track as buttons. Each shows its cost in cores or its cooldown in seconds;
hovering gives the power's description. Click one, then the map, to use it. Before rank 2 there
is a line saying when the first power can be chosen.

### HUD size

The HUD (team panels, clock, minimap, army panel, messages and the panels it
opens) and the build and unit menus in the world are laid out for a 1920x1080 window. In a smaller
one they are drawn smaller by the share the window is smaller, by width or height, whichever is
tighter (a 1440x900 laptop window gets three quarters), but never below 0.6, where text gets too
small to read, and never above 1: a bigger screen just shows more of the game
(`components/hudScale.ts`, applied with CSS zoom through the `--hud-scale` variable, so panels keep
to their corners and clicks land where things are drawn).

### Role badges

Every visible unit shows a role badge in its team colour, so an army's make-up reads at a
glance. It is a fixed size on screen and draws over buildings; since the camera looks nearly
straight down, it is shifted up and a little right of the unit on screen, clear of it at the usual
zoom, and is see-through (45%), so the unit itself stays in view. The minimap uses the same badge. A unit's badge hides while that unit is selected. Roles come from
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

**Cover** (`sim/cover.ts`): city buildings, the landmark towers and the other side's walls stop
direct fire.
- A ground gun firing at a ground target (weapons fire and tank rail slugs) needs a clear line to
  it. The first standing city building, landmark tower, or enemy base wall, blast gate or Bulwark
  Wall that the line passes through takes the shot instead, and nothing splashes past it. A line
  that only clips a building's corner gets past. Dragon's Teeth are low enough to shoot over.
- A side's own walls don't stop its own fire: defenders shoot out from behind their walls, and
  attackers have to break through them.
- A unit behind cover can still be targeted when it is seen, but guns go for targets in the open
  first, and a target behind cover doesn't hold an attack-move: the unit carries on until it has
  a clear line.
- A wall takes a stopped shot as it would one aimed at it. A city building takes only a share of
  the shot's damage against structures, by the shooter's weight: 20% from infantry, 50% from light
  vehicles and turrets, all of it from heavy vehicles. So a rifle barely marks a building (a Trooper
  needs 500 shots for a 200-health building), while a tank's shell or rail slug knocks one down in three. A building brought to nothing is destroyed, as a Bombardment Drone leaves it. The
  landmark towers, server nodes and core nodes can't be knocked down.
- Out of it: aircraft, and the Sentinels hovering above the server nodes, fire from above the
  rooftops and are shot at above them; shots at aircraft; and anything lobbed (Thunderhead
  shells, missiles, grenades).
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
| **Battery Mule** | 250 | 2 | T1 | 500 | Heavy | None | Mobile power for vehicles, as fast as a Titan (0.7×). Moving or parked (it no longer anchors), it charges up to 4 friendly ground vehicles (not aircraft) within 7 tiles automatically (10 once its Mk III Refit is researched, `muleRange`), lowest battery first (`muleLinks`, `sim/energy.ts`); Volt Core (T2, researched) |
| **Titan MBT** | 420 | 3 | T2 | 600 | Heavy | Explosive 50 / 2.2 s / 4, splash 1 (10%); rail gun AP 120 / 5 s / 14 | Main battle tank, automatic rail gun; Smoke Screen, Piercing Rail Round (T3, researched) |
| **Aegis** (new) | 240 | 2 | T2 | 300 | Light | Flak 30 / 1.2 s / 5, air only | Anti-air escort |

### Airpad (aircraft)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Infiltrator Drone** | 60 | 1 | T1 | 60 | Air | None | Scout, surveillance |
| **"Kestrel" Attack Drone** (new) | 130 | 1 | T1 | 110 | Air | Machine gun 6 / 0.4 s / 3, hits ground and air | Cheap generalist; fast (1.5×), sees 5, remote-controlled; Flechette Burst (T2, researched), Regenerative Shield (T3, researched) |
| **Wasp** | 240 | 2 | T2 | 160 | Air | Micro-drones: 14 (MG) a strike, 40% to others within 0.6 tiles, one built / 1.5 s always (up to 10), hunt within 6, ground and air, shield the Wasp | Swarm launcher; see Wasp micro-drone swarm |
| **Hornet Gunship** (new) | 320 | 3 | T2 | 320 | Air | AP 32 / 1.6 s / 4; researched T3 rocket AP 60 / 6 s | Anti-vehicle air |
| **Bombardment Drone** | 480 | 4 | T3 | 260 | Air | None | Levels city blocks; 5 drops, rearms at base |

### Comm Link (support)

| Unit | Cost | Pop | Tier | HP | Armor | Role |
|---|---|---|---|---|---|---|
| **Guardian** | 220 | 2 | T1 | 300 | Light | Heals 3 allies, Trophy system |
| **Helios** | 110 | 1 | T1 | 90 | Air | Wireless charging |
| **Banshee** | 320 | 3 | T2 | 380 | Light | Jammer, drone tether |

### Other producers

- **Depot:** Mason (120, pop 1, T1), plus Dragon's Teeth and Bulwark walls; it also enables two turrets:
  - **Walls** fill their tile and block it, but run one way across it (`wallRun`, `sim/walls.ts`).
    While placing, R turns the wall. A wall placed beside one of the side's walls snaps to join it:
    on along a neighbour already running toward it, else along the axis its neighbours lie on; R
    turns it away from the snap there if wanted. The preview shows the row the way it will run,
    cyan when it joins a wall beside it. Placing ends after one wall, so the base pads come back;
    with Shift held the next stays in hand, so a line can be laid tile by tile, until Shift is let
    go, right-click, Esc or the cores run out. While placing, the base pads are hidden.
  - **Dragon's Teeth** (`components/models/DragonsTeethModel.tsx`): three anti-tank hedgehogs
    planted in a row across the middle of the tile on a low concrete footing the full tile long, so
    a joined line runs on unbroken. Each hedgehog is three square beams of near-black steel crossing
    at right angles, stood on three ends with three pointing up: each end chamfers in to a smaller
    face, with a dull ochre hazard band and a black stripe just inboard and a white light strip
    further in, and a line of the side's colour runs along the footing. While the Masons build it, its outline shows the way it runs.
  - **Bulwark Wall** (`components/models/BulwarkWallModel.tsx`): a tall poured-concrete blast
    barrier the length of its tile, the way it runs: a broad foot stepping in to a near-upright face
    chamfered at the top and capped in dark steel. Each face has two recessed panels with a corner
    brace and a hazard plaque between them, a strip of white light along the foot's step and a line
    of the side's colour along the top edge. Bulwarks side by side running the same way click
    together (`bulwarkJoins` in `sim/walls.ts`): the ends that meet run to the tile's edge with no
    cap, so a line of them is one unbroken wall; an end with no neighbour stops just short behind a
    dark steel end cap. While the Masons build one, its outline shows the way it runs.
  - **Sentry Turret** (400): anti-vehicle railgun, AP 40 / 1.5 s / 6, ground only, 900 HP.
  - Both turrets are base defences: they only go on the four corner pads of one of your Command
    HQs (the starting one or one you built), built by clicking the + on a free corner. They need
    a finished Depot and a Mason. Walls come from the Depot menu and can go anywhere in your grid.
  - **CIWS Turret** (450, three Mason hauls): the Aegis rotary cannon on a fixed mount with its own
    tracking radar (`sim/ciws.ts`). Shoots aircraft and incoming ordnance within 10 tiles exactly as
    the Aegis does (32/s to aircraft, 60/s to ordnance, 3.5 s bursts, 6 s reload), but has to wind
    up for 1.2 s before it opens fire, where the Aegis fires at once; with the sky
    clear it fires on ground units within 6 tiles at half its flak damage (about 6/s to infantry
    and light vehicles, 3/s to heavy armour). 800 HP.
- **Ordnance Fab:** the **Ballista** (380, T3, 3 pop, 160 HP, light: EMP, HE and White Phosphorus
  missiles up to 39 tiles away, half the map; see [Ballista warheads](#ballista-warheads)), trained
  only here, beside the warheads it fires; Field Fabricator (260, T2), Swarm Host (340, T2, 3 pop,
  30 s: anchors to release up to 7 Crawler Drones that hunt nearby enemies) and EMP (500), HE (300)
  and White Phosphorus (350) warheads. From Tier 3 it also launches missiles straight from its silo
  (see [Ballista warheads](#ballista-warheads)). Couriers are sent by Transfer Warhead, not trained.
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
Radar Sweep adds 2 tiles). It engages at once: its six barrels are kept turning, so it opens fire
the moment it sees something, even straight after a reload (`CIWS.aegisSpinUpMs`, none; the CIWS
Turret is the one that winds up, `CIWS.spinUpMs` 1.2 s, turning onto the target meanwhile but
firing nothing, and staying spun up while it keeps finding targets, for up to 0.3 s of lull,
`CIWS.spinGraceMs`). A magazine holds 3.5 s of fire; empty, the gun stops for a 6 s reload,
and after 4 s without firing a part-used magazine is topped up. Ordnance has integrity rather than
health: missiles take 120 (2 s of fire), drop pods 180, shells 30. A downed missile
bursts in the air and does nothing. The fire is drawn as a dense stream of glowing rounds; an
enemy Aegis you can't see doesn't show its stream.

## Ballista warheads

Rules: `sim/warheads.ts`. Built at the Ordnance Fab (or by a Field Fabricator), taken and loaded by
the Ballista. Each suits a different enemy, so what you build follows what you face.

**Launching from the Ordnance Fab** (`FAB_LAUNCH` in `sim/abilities.ts`): from Tier 3, the same tier
as the Ballista, an Ordnance Fab fires a stockpiled warhead straight from its silo. Its menu's
"Launch from the silo" section has a button per warhead with the stock left; pick one, then a tile
on the map (a red ring shows the reach). It reaches as far as a Ballista does, 39 tiles (the
Ballista's base range, not its upgrades), and the missile flies and lands exactly like a
Ballista's. Then the silo takes 5 s, a Ballista's load time, to ready the next: it stands empty
for a moment and the next missile rises up out of the drum into the clamps. The fab has to be
finished and not coming down. The computer does it too, at the same targets its Ballistas pick,
and keeps a couple of warheads in stock for it from Tier 3 even without a Ballista.

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
- Drawn as the Sentry Turret's railgun slug (`ShotFx` kind `rail`): from the tip of the tank's
  barrel (`titanMuzzle`), a white-hot slug in a cyan glow, very fast, leaving a straight ion trail
  and a wake of shock rings, with a cyan muzzle flash and a hard flash where it strikes. The gun
  itself is a housing at the turret, then two parallel rails split by a charging slot that glows
  between them and flares when it fires, held by clamp bands, ending in a steel muzzle plate and
  a round extension barrel.


## Wasp micro-drone swarm

`sim/microdrones.ts`. The Wasp is a swarm launcher, an airborne Swarm Host that never has to
anchor. It has no gun of its own: its micro-drones are its weapon.

- **Building:** it always builds a micro-drone every 1.5 s, launched from its wing pods, up to
  10 out at once. With no enemy near they circle it as an escort, riding along wherever it
  flies, so it comes to a fight with a full swarm.
- **Hunting:** once an enemy (ground or air, not the neutral Sentinels) comes within 6 tiles of
  the Wasp, every drone peels off at once and dives at an enemy near the Wasp, spreading over the
  targets rather than piling onto one: a burst of up to 10 strikes to open the fight. It keeps
  launching a drone every 1.5 s through the fight, each diving in as it comes. A drone is spent when it strikes: it
  detonates on its target for 14 damage by the machine-gun multipliers (about 13 to infantry, 8
  to heavy armour, 11 to aircraft), with the Wasp's refits, in a small blast 0.6 tiles across
  that catches every other enemy there for 40% of that. So units bunched on the same tile are
  all hit, but the next tile over is not; a blast in the air stays in the air and one on the
  ground on the ground, and an enemy force field still shelters what is inside it. (A full-strength
  blast would let Wasps beat the Troopers meant to counter them, since chasing infantry bunch up.)
  Drones never chase more than 9 tiles from their Wasp.
- **Shielding:** the drones take fire meant for their Wasp. Damage that hits the Wasp is taken
  first by its drones within 1.5 tiles of it, nearest first, each soaking up to 25 and spent
  doing it (a puff where it goes), so light fire is soaked whole and a heavy hit still partly gets
  through. Once the Wasp has been hit, it keeps the 3 drones nearest it back as guards, circling it
  rather than diving, until 3 s pass without a hit; the drones it launches meanwhile fill the
  guard first. Drones out hunting are too far off to shield it. (`shieldWasps`, applied to the
  tick's direct fire, CIWS, rail and blast damage before it is dealt.)
- **Regrouping:** when the fight is over, the survivors form up round the Wasp again.
- **Balance:** the balance skirmish (`sim/battle.ts`) starts each Wasp with its full swarm, as it
  would come to a fight. At equal cost it beats tanks, Hornets, Lancers and Ghosts and loses to
  Troopers, Razorbacks and Aegis.
- **Holding:** a Wasp whose swarm is fighting holds its attack-move there, as a gun does.
- **Counters:** the drones are fragile. Aegis and CIWS guns shoot them out of the air like
  missiles (a drone comes apart in one tick of fire), and an enemy force field stops a drone
  diving at a unit inside it. Kill the Wasp and its whole swarm drops; an EMP or stun stops it
  building until it recovers.
- **On screen:** small dark diamonds with a glowing core in the side's colour, circling the
  Wasp at its altitude and diving at ground targets over their last few tiles, with a small
  burst where each strikes (`components/MicrodroneSwarm.tsx`). Enemy drones show when their Wasp
  is in sight or they are diving at your units.

At equal cost (`sim/balance.test.ts`) Wasps beat Tanks, Hornets, Lancers and Ghosts, and lose to
Troopers, Razorbacks and above all Aegis.

## Battery Mule Volt Core

`sim/voltCore.ts`. Researched at Advanced Research (T2, 250 cores, 30 s), then passive on every
Battery Mule the side has. When a mule is destroyed its core goes critical where it fell: a
sparking core, a red ring marking the blast radius, and a flashing red warning sign counting down
3, 2, 1, flashing faster as it nears zero. Both sides see it, so there's a moment to get clear.
Then it detonates two ways at once, in a blue electrical discharge and a fireball:
- the discharge: 220 damage at the centre to every enemy unit within 4 tiles, ground or air,
  falling off evenly to 25% (55) at the rim;
- the physical blast: 260 explosive damage at the centre within 3 tiles, falling off to 30% at the
  rim, to enemy ground units (by the explosive multipliers: 325 to infantry, 195 to heavy armour)
  and enemy structures (390). Aircraft are above it and take only the discharge.

So a tank right beside it takes over 400 of its 600 health, and infantry, light vehicles and a
turret close by don't survive it. Friendly units and structures are spared. A mule killed by the blast goes critical in turn, with its own countdown,
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

## Heavy Metal passive: Salvage & Repair

`sim/salvage.ts`, `components/Wrecks.tsx`. Every vehicle destroyed, either side's (light or heavy
armour; not infantry, aircraft or the small drones), leaves a burning wreck where it died for 60 s:
a scorched, burnt-out hull with embers and smoke. A Heavy Metal ground unit within 1.5 tiles of
it, with no other side's unit that close, strips it over 4 s (a ring fills in the side's colour):
the side gets 30% of the vehicle's cost in cores (a dropped Titan counts as a tank), and each of
its vehicles at the wreck is patched up by a quarter of its maximum health. Walk off or be
contested and it stalls. Heavy Metal keeps Mechanized Repair too: Guardians and its base repair
armour 50% faster, and from Tier 2 armour repairs itself (5 HP/s) after 5 s out of combat.
Fighting where its armour can reach the wrecks pays for the next tank.

## Shadow Ops passive: Going Dark

`sim/cloak.ts` (`goesDark`). Shadow Ops' infantry and light vehicles on the ground cloak whenever
they hold still and haven't fired or been hit for 6 s: the same cloak as a Cloaking Field (the
enemy can neither see nor target them; blasts and shelling still hurt; an Aegis radar shows a
blip). Moving, firing or being hit shows them. A shot from any cloak but Kage's own (which
doubles) is an ambush for +50% damage (`AMBUSH_DARK`, sim/combat.ts). A Shadow Ops army waiting in
position is invisible, and opens the fight on its own terms. (It replaced Signal Masking, +20%
speed for stealth units.)

## Netrunner passive: the Sentinel Net

`sim/sentinelNet.ts`. Netrunner turns the server nodes' Sentinels to its side.
- **The code.** The first time a Netrunner side holds a server node it cracks the Sentinels' code,
  for good (`TeamEconomy.sentinelCode`; a notice says so). Until then none of the rest works.
- **Build them.** The Comm Link builds Sentinels for Netrunner only (300 cores, 2 pop, 20 s, Tier 1;
  Mk II and Mk III refits at Advanced Research, Netrunner only). The same heavy drone with its
  rifle (14 dmg / 0.5 s, range 3) and 300 health, wearing the side's colour on its belt. It hovers
  over the city, not along the roads, slowly (speed 0.45 of an aircraft's 1.2): a guard to post at
  a chokepoint or a node, not a front-line unit. Ground fire hits it as armour, not as an aircraft.
- **Hack them.** A unit of a cracked Netrunner side within 2 tiles of a neutral Sentinel, with no
  unit of the other side within 3 tiles of it, hacks it over 8 s; a ring on the ground fills in the
  side's colour. Meanwhile the Sentinel's targeting is scrambled: it holds its fire, and the
  hacking side's units leave it alone. Walk away or be contested and the hack stalls (the ring
  dims), runs back at half speed, and the Sentinel fires again. Hacked, it joins the side,
  guarding the node it stood at.
- **Defenders.** Every server node a Netrunner side has held for 2 minutes gains a Sentinel of its
  own over the roof, and another 2 minutes after the last one falls, as long as the node is held.
- Posted Sentinels (defenders and hacked guards) take no population; built ones do. Neither side
  routes round its own or its enemy's Sentinels, only the neutral ones.
- The computer as Netrunner builds its Comm Link as soon as it has the code, keeps one Sentinel of
  its own at home (two on Hard), and hacks guards as its army comes up to them.

## Netrunner doctrine: Black Wall Infect

`sim/blackwall.ts`. The Netrunner doctrine (formerly Skunkworks) has the Sentinel Net as its
passive (below; it replaced the old +10% production Overclock) and Nano-Cloud (Tier 2). Its Tier 3 power (1100 cores, 300 s cooldown) is Black Wall
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

Server (compute) nodes and core nodes are the map's objectives and can't be destroyed: no drop,
Thunderhead shell or stopped shot ever damages them (`isIndestructible` in `sim/bombard.ts`).

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

The Thunderhead (`sim/artillery.ts`) is an eight-wheeled rocket-artillery truck from the Factory, there from
Tier 1. It trades every close-range strength for reach:

- **Mobile, it cannot fire.** It anchors only once it has stopped (Anchor Down), then takes
  3 s to set up. A move order packs it up straight away and drops its fire mission.
- **Anchored with no fire mission, it fires on sight:** at the nearest armed enemy ground unit in
  range that it, or any friendly unit, can see; failing that the nearest unarmed one, then the
  nearest enemy structure (friendly structures spot 5 tiles around them). It never hits aircraft.
- **Fire Mission** shells a tile the player picks, again every 5 s, whether or not anyone can
  see it, until Cease Fire, a new mission, or packing up. Several selected batteries take the
  same mission.
- **Range grows with research:** 12 tiles to start, 16 with Long-Range Shells (T2), 20 with Guided
  Shells (T3), both from Advanced Research. Nothing closer
  than 3 tiles can be shelled. Selected and anchored, it shows its range (and the dead zone) as
  an orange ring; a fire mission's target shows as a red reticle.
- **Shells fly**, drawn as rockets from its pods. Each takes 1.2 s plus 0.09 s per tile to land and drifts up to 0.7 tiles, so a
  target that keeps moving can get out from under it. A shell does 70 explosive damage at the
  centre, down to 40% at the 1.6-tile edge, to enemy ground units and structures. Enemy shells
  show only on the way down.
- **Shells knock down city buildings** in the splash, like a Bombardment Drone, only slower: each
  shell does a quarter of a drop's damage, so a residential tile takes 8 shells and a commercial
  one 20. A side's own captured buildings are spared.

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
   - **Wasps** fly with the army; their micro-drones fight on their own.
   - **Bombardment Drones** (T3) strike enemy production, never on top of its own units.
   - **Ballista** (T3) stays by the Ordnance Fab, which keeps two **warheads** coming, of
     the kind that suits your army (White Phosphorus against mostly infantry, EMP against a big air
     wing, otherwise HE); it loads the best one it holds and fires White Phosphorus at the thickest
     infantry crowd, HE at the thickest knot of vehicles or else a structure. It only fires at targets within its 39-tile range.
     The Ballista is trained at the Ordnance Fab, and from Tier 3 the Fab itself launches stocked
     warheads from its silo at the same kind of target.
   - **Masons** put up 1 (Normal) or 2 (Hard) **Sentry Turrets** on the turret corners facing
     you.
   - It opens **new Command HQs** (up to 2 on Normal, 3 on Hard; none on Easy) at T3, or at T2
     once its building pads are all taken (`sim/aiExpansion.ts`). It builds on the best cleared
     block on its own half of the map with no enemy near, nearest a core node first. With none, it
     makes one: it trains a Bombardment Drone and has its drones level a city block on its own
     half (near a core node, quick to bring down, nothing built on it, none of its own captured
     buildings or units in it, no enemy close), sticking with the same block until it is down. Once
     a site is ready it saves up for the HQ (2000 cores and 200 compute, plus 500 to spare;
     production and research only spend what is over that, unless it is under attack), sends a
     scout car or the nearest infantry to stand by it, and founds the base there.
   - Its **Bombardment Drones** otherwise strike only a group of enemy units worth at least 400
     cores that nothing of theirs can shoot them down over (no anti-air unit or CIWS Turret in
     reach): parked artillery, an unescorted tank column. A strike levels city buildings and hurts
     units, but leaves structures standing, and a drone sent over a defended base is shot down, so
     they never go for the enemy base.
7. **Powers and the doctrine track:** it takes each rank of its doctrine track as soon as it opens
   and it has the points, one of the two options at a coin's toss (leaning 60/40 to its hero at
   rank 3). It uses the powers it chose: none on Easy, one on Normal, both on Hard: Orbital
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
Bombardment Drones strike as in the game, levelling city blocks and hurting units under them, so
the computer's new bases can be tested here. It doesn't yet model projectiles, most unit abilities,
clouds, doctrine powers other than Orbital Drop, or Masons.

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
  up its panels in deep red and its own emblem (a broken ring round a V and a diamond) glowing red near its top, a red line round its podium, with a tall holo-advert column off one corner
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
  fringe** along it. Two **industrial** patches sit on the flanks of each base, and the 3×3 blocks
  round each of the two outer core nodes in the corners away from the bases are the **estates**,
  where the very rich wall themselves off (below). The zoning mirrors
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
  | Estates | ~15% | villas spread out in their gardens round the outer corner core nodes, and the sky club | 7–16 (the club 34) | residential |
  | Base | ~12% | barracks rows beside the starting square | 8–16 | residential |

  Two rules hold everywhere, and `sim/mapgen.test.ts` checks them against the plan: buildings
  never touch side to side, so there is always at least a one-tile alley between them, and no
  open ground is ever sealed off from the streets. Every building is a rectangle with a matching
  twin across the centre. Overall about a third of lot tiles are built; the centre is the
  tightest and the edges the most open.
- Each starting base is a walled military compound (`baseCompound` in `sim/mapgen.ts`, drawn by
  `components/BaseCompound.tsx`). A blast wall runs four tiles out from the HQ along the two sides
  facing the map, with the Blackwall at its back: a solid lower wall of dark concrete panels with a
  coping, sodium-orange downlights on both faces throwing pools of light down it and a line of the side's colour
  under the coping; above it a louvred fence of angled horizontal slats in a frame, split by
  mullions, between square capped pillars; and a watchtower on the corner. Each of the four roads
  that run through it has a blast gate between two tall black capped pillars with lights facing
  along the road: a ribbed steel shutter with a line of the side's colour along its top, that sinks
  into a slot in the road while the side's own ground units come through and rises behind them.
  The wall and its gates are a layer of defence that holds an early rush, not a seal
  (`sim/compound.ts`):
  - Every wall tile (Base Wall, 2000 HP; the corner tower 3000) and every gate (Blast Gate, 1500
    HP) is a structure of the base's side with health. Enemy units shoot them like any enemy
    structure in range, and the health bar shows once one is hit. They are never repaired, built,
    dismantled or clicked, and aircraft fly over them.
  - A standing wall tile blocks everyone. Shot down, it leaves rubble and its tile is open ground:
    a breach anyone can go through.
  - A gate lets its own side straight through. The other side's ground units are planned through
    it like any road but stop in front of a standing gate, shooting it, until it is down; then it
    leaves rubble at the sides of the road and anyone can pass. One tank takes about 37 seconds
    to bring a gate down on its own.
  Inside,
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
  midtown every block is a courtyard: open tiles beside a street or the boulevard are light
  concrete paving, the rest are dry, dusty olive lawn laid edge to edge (not green, so Tokugen's
  units stand out on it), with a low pale kerb where lawn meets
  paving (`groundOfTile`). The outskirts work the same way with darker ground: small dark-grey
  pavers along the streets round empty parking lots marked out in bays, laid edge to edge
  with their aisles all one way. The industrial yards are plain jointed concrete with markings
  painted over each whole zone (`components/IndustrialYard.tsx`): a red-and-black hazard band (not yellow, which is the core nodes')
  along every yard edge onto the street, tyre tracks from each shed's door through its yard to
  the nearest street (the band breaks there for a gate), an oil stain at every door and a few
  more scattered about. Painted once for blue's zone and shown turned round over red's. The
  Blackwall fringe is old weathered concrete slabs, slightly corrupted by the wall
  (`components/BlackwallCorruption.tsx`): about one slab in four has a crack glowing with the
  Blackwall's red, magenta and blue static, tearing and flickering, and every fringe building
  flickers with patches of glitching scanlines on its walls, static on its roof and a glow round
  its base, gone once the building is destroyed. Downtown and the corporate core are a corporate
  plaza (`components/DowntownDressing.tsx`): polished dark granite along the streets with a
  thin, dim indigo line inlaid at the kerb, plaza stone laid in a two-tone diamond lattice inside
  each block, and long planters with dark clipped hedges along the foot of every tower.
- **The energy grid made visible** (`components/powerGrid.ts`, drawn by `components/PowerGrid.tsx`).
  Each side's grid shows in the city itself, so who holds what reads without the minimap:
  - **Grid lines on the streets**: every street a side's captured buildings power outside its
    base carries a line in the side's colour along the road, just off its centre line, running on
    as far as that power reaches and in to the edge of the base's own circle (6 tiles round the
    HQ), so the lines show the outer grid feeding the base; inside a base there are none: a dark casing with a faint glow and a slim core, pulses
    running along it outward from the HQ. One line per street and none off to the buildings, so a
    side's territory reads as its streets lit up without a line for every building it holds. Where
    both sides' grids reach, the side whose HQ is nearer holds the street, and a stretch blacked
    out by an enemy EMP goes dark. (Earlier versions drew a line from the HQ to every powered
    building, then overhead power lines on the lamp posts: both too cluttered; then lines inside the
    bases too.)
  - **Streetlights**: a lamp on every other street tile, at the road's edge, on the same side all
    along a street, in sodium orange. A
    lamp inside a side's grid is lit, brightest by its HQ and dimming to 30% 30 tiles out
    (`LIGHT`), with a small indicator light on top of the post in the colour of the side holding
    the power there; one in nobody's grid, or in a grid blacked out by an EMP, is dark. (Captured
    city buildings themselves aren't marked in their owner's colour; only core and server nodes
    wear their holder's.) So the light
    peaks round each base, thins out over contested ground and leaves the unclaimed perimeter dark,
    and streets light up as a side takes them.
  Both redraw only when the grid changes (a building changing hands, a base, an EMP), not every
  tick.
- **The city's eras** (`components/eras.ts`, drawn by `components/FootprintBuilding.tsx` and
  `components/Retrofits.tsx`). The city grew in four eras, and its buildings show more than one,
  layered from the street up, the newer always on top of the older: **1 utilitarian** (concrete
  boxes, square corners, tanks and ducts), **2 mass-market** (rounded corners, pastel neon, big
  signs), **3 corporate** (chamfered 135-degree corners, dark matte, stark light strips, cooling
  rigs and cameras bolted onto whatever was there) and **4 ultra-elite** (glass and champagne
  pavilions among dark trees). Each building gets an era stack: its **bones** (how it was built,
  which sets its outside corners: square, rounded or chamfered, with windows, the ledge's neon
  and, on a rounded corner, pastel bands or, on a chamfer, a light strip carried round the cut),
  its **frontage**, the ground storey in the era it was last done up (`components/Frontage.tsx`):
  roller shutters in bare concrete, some half up with light under them, a caged lamp and tags
  sprayed on (1); lit shopfronts with rounded tops under a rounded pastel awning, an oversized
  sign bolted above on some stretches (2); a tall lobby of dark tinted glass under a slanted
  canopy with a stark light strip along its edge (3); warm marble with a champagne trim line and
  planters (4). Its **body**, the middle floors: the bones' own, or reclad in corporate **panel
  cladding** (big shapes with 45-degree corners in two dark tones, crimson on charcoal, slate blue
  on grey or burnt orange on charcoal, the windows showing through slots), always where newer
  owners reclad older bones and on half the corporate-era buildings; an old era-1 body gets
  conduit bolted up some of its walls. Now and then a sleek corporate lobby stands under old
  floors the owner never got round to rebuilding. The buildings of an apartment complex went up
  together and share one stack. And its **roof retrofit**: a
  water tank or air handlers with a duct down the wall (1), a rounded neon sign or a bubble
  skylight (2), a server cooling rig or a camera mast (3), a sky pavilion (4). On a building of
  one or two tiles the retrofit takes the place of its usual rooftop piece; on a bigger one it
  stands on a corner tile clear of it. The district sets the odds, so the city reads as its
  history going inward: the fringe and outskirts mostly era 1 under era 1 and 2 additions,
  midtown the boom's rounded blocks with corporate kit on top, the industrial sheds era 1 under
  era 3 cooling rigs (the plants bought up for compute). Every layer is at least as new as the
  bones. The corporate towers of downtown and the core, and the two sides' megatowers, get no
  stack: pristine monoliths, as new as the day they went up. Picked from where a building
  stands, so its twin across the map is the same.
- **The corporate center, refined** (`components/FootprintBuilding.tsx`, `corpoFacades.ts`
  `CORPO_CORNER`, `components/DowntownDressing.tsx`). The towers of the core and downtown are the
  corporate era at its most pristine: monoliths, never layered, decayed or retrofitted.
  - **Massing**: chamfered 135-degree corners on the monolith, office and ticker towers (and on
    every tower rising off a podium, all four of its corners), the gold-scaled towers of the core
    seamless and rounded like the ultra-elite's, the brutalist slabs left sheer and square.
  - **Restrained light**: each tower keeps its accent for one line round its roof; its setbacks
    and its podium's roof are trimmed in brushed steel, not neon, and a chamfer carries one slim
    indigo strip. Low-frequency detail, tightly grouped.
  - **Lobbies**: every tower meets the street in a tall lobby of dark tinted glass under a slanted
    canopy with a stark light strip along its edge, its podium the same; the gold-scaled towers'
    lobbies are marble with a champagne line and planters.
  - **Visual rest**: no coloured glow round the towers' feet, a thin dim indigo line inlaid along
    the kerbs instead of bright neon, and the planters' hedges dark, so the dark granite between
    the towers lets the eye rest and the towers' own lights, the billboards and the objectives
    stand out.
- **The estates** (`sim/districts.ts`; looks in `components/residentialLooks.ts`, `components/eras.ts`,
  grounds in `components/estateGrounds.ts` drawn by `components/EstateGrounds.tsx`). Round each of
  the two outer core nodes, in the corners away from the bases, the ultra-rich live behind
  synthetic nature. Before, the blocks round each of these nodes were kept empty; now they're
  villas in their grounds, real city buildings like any other (captured and destroyed tile by
  tile, feeding the grid), mirrored so both corners are the same:
  - **Villas**: all era 4. Rounded corners left seamless, walls of floor-to-ceiling glass lit warm
    or softly rose between deep slabs in warm ivory stone, dark bronze or taupe, a muted-rose light
    line under each slab; the upper storey often cantilevered out over the garden or stepped back to
    a terrace; marble ground floors with a champagne trim line and planters; a garden on the roof,
    and on most a pavilion or a rooftop pool (lit from inside, on a travertine deck with loungers
    and a parasol). Never decayed, never corrupted by the Blackwall.
  - **Grounds**: travertine paving along the streets round manicured lawns mown in broad stripes
    (olive, not green: Tokugen's colour is green), immaculate city roads with sidewalks; rows of
    palms along the streets and clumps of them in the gardens, low clipped hedges along every
    garden's street edge, pools set in the lawns (deep blue, clear of the server nodes' cyan).
    The ground right round each core node is kept clear so the objective stays plain to see.
  - **The sky club** (a district centerpiece, below).
- **District centerpieces** (`sim/centerpieces.ts`, styled in `components/centerpieceLooks.ts`,
  drawn with the city building kit plus `components/Centerpieces.tsx`). Each side has a landmark
  in its midtown, one in its industrial zone and one in the estates, mirrored across the map: a mass that stands out
  from across the city and is just as recognisable at its front door, its look carried all the
  way down to the pavement.
  - **The megablock** (midtown, 3x3, 62 high): housing narrow at its foot and swelling out over
    the street a third of the way up, chamfered corners, clad from the pavement to the roof in big
    crimson and slate panels, holo billboards on its faces, its number (07) lit huge near the top
    of every face and again over the entrance in the middle of each: a tall dark portal between
    panel pylons under a heavy canopy with a light strip. Cooling rigs and camera masts on the
    corners of its roof, antennas in the middle.
  - **The sky club** (estates, 3x3, 34 high): ribbon after ribbon of rounded floors in dark bronze
    and glass, each further out over the gardens than the one below, over a narrow core;
    champagne bands round every floor, waterfalls sheeting off the edge of its first deck into
    pools at its foot, and a pool and a pavilion on its roof round a garden.
  - **The lifted block** (industrial, 5x3, 40 high): a block of pale concrete with blue panels and
    blue stripes painted round it every few storeys, lifted on braced concrete pylons over a
    narrow core with blue loading doors at street level, its code (S7-03) stencilled big on its
    front, and a tower of stacked chamfered modules in the same stripes rising out of its middle
    to 66. Cooling rigs and air handlers on its corner roofs.
  In the game they're ordinary city buildings, captured and destroyed tile by tile; only their
  heights differ (set in map generation, so shots and missiles meet them where they're drawn),
  kept below the core's towers so the camera can still come down low over them. They're never
  layered with eras, left unfinished or squatted.
- **Everyday rulers** (`components/streetFurniture.ts`, drawn by
  `components/StreetFurniture.tsx`). Things everyone knows the size of, set on the pavement at the
  foot of every building at least 34 high so the towers read as huge against them: benches and
  bollards beside the corporate towers of the core and downtown (now and then a vending machine),
  benches, vending machines with their fronts lit and dumpsters (dull blue or rust) beside the
  other tall buildings. A piece or two to each stretch of pavement, the same every time.
- **Decay** (`components/decay.ts`, drawn by `components/Decay.tsx` and
  `components/FootprintBuilding.tsx`). Each city block of the poor edge and a few in midtown has
  fallen into one state of ruin, sometimes with traces of a second (a block's primary state
  shows on all its buildings, its secondary on about a third):
  - **Deconstruction**: building stopped mid-build. A building at least 14 tall is finished only
    to whole storeys about 60% of the way up; above that its upper floors are a bare concrete
    frame of columns and slabs, the top slab half poured and the columns ragged with rebar
    sticking out, scaffolding up one face with a faded denim or rust tarp hung on it, and a tower
    crane left standing over it. (The game still counts the full height.)
  - **Deterioration**: weather and neglect. Sand drifted into the gutters of the streets round
    the block, puddles of standing water in the road (dark, with smeared reflections of the sky
    and the neon), weeds up through the pavement cracks, and grime streaked down the buildings'
    walls from their roofs.
  - **Redevelopment**: people living in the ruins. Shipping containers stacked two or three high
    into homes on the roofs (rust, faded blue, dull orange, grey; a lit window, a tarp to a pole,
    a ladder up) in place of the usual rooftop piece, and lean-to shacks of sheet metal against
    the ground floors with tarps stretched out over the pavement.
  A decayed building in any of the three states is **dead**: none of its neon lit (the ledge
  lines, strips and bands, the rounded corners' bands and the chamfers' strips, the neon on its
  rooftop piece and retrofit are all there but dark), its windows almost all dark (squatted
  buildings keep a few lit, and the shanties' windows on their roofs), its shopfronts shuttered
  whatever era they were done up in, its lamps out, no red lights on its masts or cranes and no
  smoke from its stack, so it reads as not working from across the map.
  The fringe always decays (mostly redevelopment and deterioration), the outskirts often, the
  industrial zones as often (the taller sheds left half built), midtown rarely; the core, downtown, the
  bases and the corporate towers never. **Devastation**, the fourth state, isn't laid out: it's
  what the fighting leaves (ruins and craters, below). Picked per block, a block and its twin
  across the map the same.
- **Ruins and craters** (`components/ruins.ts`, drawn by `components/Ruins.tsx`). A match leaves
  its mark on the city:
  - **Ruins**: a destroyed building tile is a ruin rather than a bare patch: the broken
    ground-floor slab, jagged wall stubs in the building's own colour gone dark with soot (14% to
    42% of its height, at least 1.6 and at most 14 m), with gaps blown through them and rebar
    sticking up, standing only along the building's outside walls so a ruined building of several
    tiles reads as one gutted shell; chunks of concrete and slabs of fallen floor inside, grey to
    charred black with now and then a piece of facade; and a soot stain spilling past its edge.
    For 45 seconds after it falls, embers glow on the rubble and a plume of smoke rises, both dying
    away. Laid out from the tile's id, so it looks the same every time. A block levelled whole
    still has its rubble cleared for a base site (above).
  - **Craters**: a blast on the ground at least 3 world units across (Bombardment strikes,
    Thunderhead shells, Ballista warheads, grenades, vehicle wrecks, a Volt Core going critical) leaves a
    scorched crater that stays for the match: a charred pit with a ring of debris and soot thrown
    out in streaks, 80% of the blast's radius (2.5 to 18). Small hits (bullets, drone strikes, a
    single Hornet rocket), blasts in the air and energy effects (EMP, the Black Wall, a shot
    stopped by a force field) leave none. The newest 320 are kept, drawn as one instanced decal.
- **Vanta's colour** was a cool near-white until it proved hard to pick out on the night city;
  it is now a deep signal red (`#c8102e`) everywhere it shows: units and their badges (whose
  pictograms are drawn in light ink on the red, dark on Tokugen's green, `inkOn` in
  `components/factions.ts`), the HUD, bases, force fields, the streetlight indicators and the
  Vanta tower's emblem, seams and podium line. Red is reserved for it now, so the scenery's reds
  moved: its red and crimson neon to hot pink-red and pink, the rose to a pinker rose, coral and
  the noodle ads to orange, hazard chevrons, smokestack bands and storage tanks to orange and rust,
  and the megablock's and the cladding's crimson panels to plum. The palette test checks every
  facade, sign and advert stays clear of any true red.
- **Colour readability** (`components/scenePalette.ts`, checked by its test). Some colours are
  reserved so they always mean one thing: the sides' Vanta deep red and Tokugen green (every
  unit, the indicator lights on the streetlights of the grid each holds, and the objectives they
  hold), neutral purple, and the objectives'
  cyan (server nodes) and amber (core nodes). The scenery never uses them: its neon keeps to
  magenta and hot pink, orange, and blue and indigo, with dark bodies between them as rest for
  the eye, so a building's own trim never reads as captured, nothing near a node competes with it
  and units don't melt into walls of their own colour. On purpose, the two sides' megatowers
  keep their corporations' colours, the gold-scale towers their gold (none stands near a core
  node), and road paint stays road paint. So: midtown's trim is blue, hot pink and orange (it was
  teal, mint and pale mint), the outskirts' rose, indigo and pink (sky blue), industry's orange,
  red and blue (amber and mint); the downtown facades are listed below; helipad markings are red;
  cranes rust orange; roof gardens and lawns dull olive; the Axiom tower electric blue (it was
  cyan, beside the centre server node); the adverts and shop signs lost their cyan, green and
  yellow; and the base compounds' floodlights are sodium orange.
- The corporate towers downtown and in the core each wear one of five facades taken from Night
  City's centre (`components/corpoFacades.ts`), picked by hand for every tower and shared with its
  twin: **monolith** (near-black, scattered warm windows, full-height indigo light strips),
  **gold scale** (dark, glowing panels of gold scales on its two broad faces), **office** (slate
  blue, dense rows of lit office windows, blue trim), **brutalist** (charcoal, horizontal louvre fins, an
  orange light line round it) and **ticker** (dark, bands of red LED readout between rose lines). Each style comes in
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
- Server nodes are drawn as compute clusters, kept minimal so they read cleanly from the camera
  (`components/ServerNode.tsx`): a gunmetal block whose walls are four tall cabinets of dark glass
  to a face, each with one slim light line down it that breathes slowly with a pulse climbing it
  now and then (no rows of LEDs); a light line up each corner and a band round the top of the
  walls in the holder's colour (cyan when neutral); and on the roof a solid cooling deck with four
  round wells cut into it, a fan spinning down in each, each well ringed in the same colour. (It
  used to have blinking LEDs on every rack unit, fans in separate housings standing on the roof,
  vents, a mast and fibre runs along the ground: too busy.)
- Core nodes are drawn as core extraction reactors (`components/CoreNode.tsx`): an armoured hex
  housing over the shaft, four pylons holding a glowing amber energy core that turns and pulses
  inside two tilted containment rings, an energy column down into the shaft, and six conduits on
  a hex pad with pulses running in. The rim, rings and pylon lights take the holder's colour.
- A building bigger than one tile is drawn as one building (`components/FootprintBuilding.tsx`),
  though each of its tiles is still captured, damaged and destroyed on its own. Windows and neon
  run along its outside faces only, a dark roof slab with a lit rim covers it (it looks the
  same whoever holds it: a captured city building isn't marked in its owner's colour, though the
  capture fill still climbs it in the capturer's colour while it is being taken; which side holds
  a stretch of the grid shows on the streetlights' indicator lights instead), and one tile carries its rooftop pieces: a crown and spire on commercial
  towers, plant and an antenna on high-tech blocks, a smokestack and storage tank on industrial
  sheds (which also get sawtooth roofs, pipe runs along their walls and, on many, a tower crane)
  and a water tank on housing. Towers on podiums stand slim on a low base. Downtown towers carry
  flickering holographic billboards, flat panels or tall blade signs, advertising the city's
  corporations and street businesses. Single-tile city buildings use the same kit.
