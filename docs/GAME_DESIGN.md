# Sector 7 – playable build design

This is the design behind the `claude/playable-game` branch. It takes the systems already in the
game (core nodes, the energy grid, compute, doctrines, the ability units) and wraps them in a
complete match: a fair map, an opponent, a counter-based roster, production that takes time, and a
way to win. The numbers live in code (`sim/units.ts`, `constants.ts`). This file explains the intent,
so tuning keeps the shape.

## The match

1. **Setup screen.** Choose your side, the opponent (AI Easy, Normal or Hard, or Sandbox where you
   control both sides with the old showcase roster), your doctrine and the map seed. The AI's
   doctrine comes from the seed.
2. **Start.** Each side has its Command HQ, 3 Strike Troopers, a Mason, an Infiltrator Drone and
   1000 cores.
3. **Win** by destroying every enemy HQ (its starting one and any it has built), or by **domination**: holding 4 of the 6 core nodes for
   two minutes without interruption. The HUD shows the countdown for whoever is closest.
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

- Start with 1000 cores.
- Structures must be placed **inside your energy grid**: around your HQ or near buildings you have
  captured. Holding ground is what lets you build forward.
- Base structures take time to construct. While under construction they can't produce.

| Structure | Cost | Build time | Produces |
|---|---|---|---|
| Barracks | 300 | 15 s | Infantry |
| Depot | 200 | 12 s | Mason, plus walls and turrets |
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
  build around it), repair for units in its block, and the HQ menu (structures, research).
- Victory by destruction now means destroying every one of a side's HQs, its starting HQ and any
  it has built. A base still going up counts.
- The AI doesn't build new bases yet.

## Population

`cap = 20 + 8 × core nodes held`, up to 60. Holding more of the map lets you field a bigger army. A
unit's pop cost is reserved when it is queued.

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
| Wings | Aircraft | Wasp, Hornet |
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

**The counter triangle**, Halo Wars style, holds at equal cost (tested in `sim/balance.test.ts`):
- Infantry beat air
- Air beats vehicles
- Vehicles beat infantry
- Specialists counter each corner: Lancers beat vehicles, Aegis beat air, and Titans' high-explosive
  shells (splash 1 tile at 30%) break clumped infantry and structures.

**Engagement rules:**
- Units fire automatically at the nearest enemy their weapon can hit, including while moving.
- **Attack-move** (used by the AI, and by the player with Ctrl-click, or F then click) stops to
  fight whatever comes into range, then carries on. (A is taken by the camera's WASD.)
- Enemy structures and the HQ can be attacked.
- The HQ and Sentry Turrets shoot back.
- Neutral Sentinels are hostile to both sides.

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
| **Ghost** EW Specialist | 150 | 1 | T1 | 110 | Infantry | Rifle 12 / 0.8 s / 3, hits air | Fast capture (1.5×); Dampener at T2, Phantom Decoy at T3 |
| **Lancer** (new) | 150 | 1 | T2 | 100 | Infantry | AP 70 / 3.0 s / 4, hits air | Anti-vehicle rockets |

### Factory (vehicles)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Razorback** (new) | 200 | 2 | T1 | 300 | Light | Rifle 10 / 0.5 s / 3, hits air | Fast raider, anti-infantry |
| **Thunderhead** (new) | 320 | 3 | T1 | 240 | Light | Explosive 70 / 5 s / 12–20, splash 1.6, ground only | Mobile artillery; fires only when anchored |
| **Battery Mule** | 250 | 2 | T1 | 500 | Heavy | None | Mobile power for vehicles |
| **Titan MBT** | 420 | 3 | T2 | 600 | Heavy | Explosive 50 / 2.2 s / 4, splash 1 (10%); rail gun AP 120 / 5 s / 14 | Main battle tank, automatic rail gun, smoke, APS |
| **Aegis** (new) | 240 | 2 | T2 | 300 | Light | Flak 30 / 1.2 s / 5, air only | Anti-air escort |

### Airpad (aircraft)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Infiltrator Drone** | 60 | 1 | T1 | 60 | Air | None | Scout, surveillance |
| **Wasp** | 240 | 2 | T2 | 160 | Air | Rifle 6 / 0.6 s / 3, hits air | Harasser, swarm volley |
| **Hornet Gunship** (new) | 320 | 3 | T2 | 320 | Air | AP 32 / 1.6 s / 4; T3 rocket AP 60 / 6 s | Anti-vehicle air |
| **Bombardment Drone** | 480 | 4 | T3 | 260 | Air | None | Levels city blocks; 5 drops, rearms at base |

### Comm Link (support)

| Unit | Cost | Pop | Tier | HP | Armor | Role |
|---|---|---|---|---|---|---|
| **Guardian** | 220 | 2 | T1 | 300 | Light | Heals 3 allies, Trophy system |
| **Helios** | 110 | 1 | T1 | 90 | Air | Wireless charging |
| **Banshee** | 320 | 3 | T2 | 380 | Light | Jammer, drone tether |
| **Ballista** | 380 | 3 | T3 | 160 | Light | EMP and HE missiles (EMP: grid blackout and vehicle shutdown, 8 tiles, 20 s) |

### Other producers

- **Depot:** Mason (120, pop 1, T1), plus Dragon's Teeth, Bulwark and two turrets:
  - **Sentry Turret** (400): anti-vehicle cannon, AP 40 / 1.5 s / 6, ground only, 900 HP.
  - **CIWS Turret** (450, three Mason hauls): the Aegis rotary cannon on a fixed mount with its own
    tracking radar (`sim/ciws.ts`). Shoots aircraft and incoming ordnance within 10 tiles exactly as
    the Aegis does (32/s to aircraft, 60/s to ordnance, 3.5 s bursts, 6 s reload); with the sky
    clear it fires on ground units within 6 tiles at half its flak damage (about 6/s to infantry
    and light vehicles, 3/s to heavy armour). 800 HP.
- **Ordnance Fab:** Field Fabricator (260, T2), Swarm Host (340, T2, 3 pop, 30 s: anchors to release
  up to 7 Crawler Drones that hunt nearby enemies) and EMP and HE warheads. Couriers are sent by
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

## Hornet rockets

`sim/hornet.ts`. From Tier 2 the Hornet's gun fires armour-piercing rounds (AP 32 every 1.6 s,
double against heavy armour). Once its side has Tier 3 it also fires an anti-vehicle rocket on
its own every 6 s at whatever its gun is shooting (AP 60, so 120 to heavy armour), drawn as an
orange streak. The Hellfire Salvo (above) is its aimed Tier 3 area attack.

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

The Ghost is trained from Tier 1 and grows with research (`sim/ghost.ts`):

- **Tier 1:** no abilities, just a fast capturer (1.5× a Trooper).
- **Tier 2, Dampener (toggle):** the Ghost and every friendly unit within 3 tiles of it vanish from
  the enemy's **minimap** and **radar** (Aegis air-search contacts and Infiltrator ground-search
  blips). They are still seen in the world and can be shot when enemies are close. A hidden
  attacker doesn't show as a red attack arrow on the enemy minimap either. The field shows as a
  wall of flickering black and white vertical glitch bars at its edge. It slows the Ghost and
  drains its battery, and switches off when the battery runs flat.
- **Tier 3, Phantom Decoy:** cloaks the Ghost and sends four holographic copies running off in
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
- **Range grows with tech:** 12 tiles at Tier 1, 16 at Tier 2, 20 at Tier 3. Nothing closer
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
the first unlocks with the unit's own tier, the second with the next tier, so units grow stronger
as your side researches. They're in the unit's action menu; aimed ones (⌖) take a map click.
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

1. **Build order:** Barracks → Factory; then Airpad and Comm Link once it reaches T2; a second
   Barracks on Hard. Placed on open ground inside its grid, never on a road or touching another
   structure, so lanes stay open.
2. **Production:** for each structure, the unit with the best damage per core against the armor mix
   of your army (weighted by value), with a floor of 6 infantry for capturing and a Guardian per 8
   units. Easy picks at random.
3. **Territory:** a capture team of 3–4 Troopers goes for the free core node that is nearest to its
   base and farthest from yours, then the next. Infantry capture the buildings they pass, which
   grows its grid.
4. **Army**, one objective at a time, most urgent first:
   - defend its base or a node under attack;
   - break your hold on a core node if you are close to a domination win;
   - take a server node (after 2–6 min, by difficulty);
   - attack your nearest core node, then your HQ, once its army is worth enough;
   - escort a second capture;
   - otherwise gather at the edge of its grid nearest you.
   It retreats when the enemy near its target is worth 1.4× its army, and waits 30 s before trying
   again. Vehicles low on battery outside the grid drive home to recharge.
5. **Powers:** Titan smoke when hurt. Doctrine powers on Normal (T2) and Hard (T2 and T3): Orbital
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
- Generation uses a seeded random number generator, so a seed reproduces a map.
- There are 6 core nodes and 5 server nodes, all in mirrored pairs (the centre node mirrors onto itself).
- Four corporate megatowers (Tokugen, Nexum, Axiom, Vanta) fill the four diagonal blocks around
  the centre server node. They are landmarks, not targets: each fills its whole block, cannot be
  driven through, captured or destroyed, and never becomes a base site. Their lots mirror like
  everything else; only the towers' looks differ.
- Between them the centre server node sits in a roundabout: painted ring lanes and a palm island at
  street level, and two stacked elevated ring roads above. It is scenery only and changes no
  pathing; a deck fades out while any ground unit is beneath it. No building is generated under
  the decks (`PLAZA_CLEAR_RADIUS` in `sim/mapgen.ts`), so nothing pokes through them.
- The city is zoned into districts by block (`sim/districts.ts`), in rings from the middle out:
  the **corporate core** (the 3×3 blocks around the centre), a **downtown** ring around it,
  **midtown** filling most of the map, **outskirts** just inside the edge and the **Blackwall
  fringe** along it. Two **industrial** patches sit on the flanks of each base. The zoning mirrors
  like the rest of the map, and the minimap outlines each district faintly in its own colour,
  unnamed, leaving the blocks dark so captured buildings stand out.
- Each district builds up its blocks in its own way (`DISTRICT_STYLES` in `sim/mapgen.ts`). Fill
  is the share of a block's lot that is built on:

  | District | Fill | Layout | Heights | Building type |
  |---|---|---|---|---|
  | Core / downtown | ~50% | megablocks of 2×2 to 3×3 tiles, some towers on low podiums | 30–70 | commercial |
  | Midtown | ~38% | buildings along the street front around an open courtyard | 16–34 | high-tech |
  | Industrial | ~33% | long low sheds (1×3 to 2×4) with yards | 7–14 | industrial |
  | Outskirts | ~25% | scattered small housing | 10–22 | residential |
  | Fringe | ~18% | sparse 1–2 tile shacks and sheds | 6–14 | residential / industrial |

  Two rules hold everywhere: buildings never touch side to side, so there is always at least a
  one-tile alley between them, and no open ground is ever sealed off from the streets. Overall
  about 28% of lot tiles are built and about 80% of the map is walkable; the centre is the
  tightest and the edges the most open. `CITY_CONFIG.buildingDensity` scales every district's fill.
- A building bigger than one tile is drawn as one building (`components/FootprintBuilding.tsx`),
  though each of its tiles is still captured, damaged and destroyed on its own. Windows and neon
  run along its outside faces only, a dark roof slab with a lit rim covers it (in the owner's
  colour once taken), and one tile carries its rooftop pieces: a crown and spire on commercial
  towers, plant and an antenna on high-tech blocks, a smokestack and storage tank on industrial
  sheds (which also get sawtooth roofs, pipe runs along their walls and, on many, a tower crane)
  and a water tank on housing. Towers on podiums stand slim on a low base. Downtown towers carry
  flickering holographic billboards, flat panels or tall blade signs, advertising the city's
  corporations and street businesses. Single-tile city buildings use the same kit.
