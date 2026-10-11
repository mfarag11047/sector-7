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
3. **Win** by destroying the enemy HQ, or by **domination**: holding 4 of the 6 core nodes for
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
| Ordnance Fab | 800 | 30 s | Field Fabricator, Courier, warheads |

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
| T1 | Start | Troopers, Razorbacks, Battery Mules, Drones, Guardians, Helios, Masons |
| T2 | 120 compute | Ghosts, Lancers, Titans, Aegis, Wasps, Hornets, Banshees, Field Fabricators, T2 doctrine powers |
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

### Barracks (infantry, can capture)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Strike Trooper** (new) | 80 | 1 | T1 | 100 | Infantry | Rifle 10 / 1.0 s / 3, hits air | Backbone, capture, anti-air |
| **Ghost** EW Specialist | 150 | 1 | T2 | 110 | Infantry | Rifle 12 / 0.8 s / 3, hits air | Fast capture (1.5×), Phantom Decoy, dampener |
| **Lancer** (new) | 150 | 1 | T2 | 100 | Infantry | AP 70 / 3.0 s / 4, hits air | Anti-vehicle rockets |

### Factory (vehicles)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Razorback** (new) | 200 | 2 | T1 | 300 | Light | Rifle 10 / 0.5 s / 3, hits air | Fast raider, anti-infantry |
| **Battery Mule** | 250 | 2 | T1 | 500 | Heavy | None | Mobile power for vehicles |
| **Titan MBT** | 420 | 3 | T2 | 700 | Heavy | Explosive 60 / 2.2 s / 4, splash 1 | Main battle tank, cannon, smoke, APS |
| **Aegis** (new) | 240 | 2 | T2 | 300 | Light | Flak 30 / 1.2 s / 5, air only | Anti-air escort |

### Airpad (aircraft)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Infiltrator Drone** | 60 | 1 | T1 | 60 | Air | None | Scout, surveillance |
| **Wasp** | 240 | 2 | T2 | 160 | Air | Rifle 6 / 0.6 s / 3, hits air | Harasser, swarm volley |
| **Hornet Gunship** (new) | 320 | 3 | T2 | 320 | Air | AP 32 / 1.6 s / 4 | Anti-vehicle air |
| **Bombardment Drone** | 480 | 4 | T3 | 260 | Air | None | Levels city blocks |

### Comm Link (support)

| Unit | Cost | Pop | Tier | HP | Armor | Role |
|---|---|---|---|---|---|---|
| **Guardian** | 220 | 2 | T1 | 300 | Light | Heals 3 allies, Trophy system |
| **Helios** | 110 | 1 | T1 | 90 | Air | Wireless charging |
| **Banshee** | 320 | 3 | T2 | 380 | Light | Jammer, drone tether |
| **Ballista** | 380 | 3 | T3 | 160 | Light | Eclipse and HE missiles |

### Other producers

- **Depot:** Mason (120, pop 1, T1), plus Dragon's Teeth, Bulwark and the **Sentry Turret** (rifle
  18 / 0.8 s / 5, hits air, 900 HP).
- **Ordnance Fab:** Field Fabricator (260, T2) and Eclipse and HE warheads. Couriers are sent by
  Transfer Warhead, not trained.
- **Command HQ:** 5000 HP; AP 30 / 1.0 s / 5, hits air.

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
   Drop into a fight, Nuke on a big cluster, Decoys on an attack, EMP in a big fight, a Nano Cloud
   over a retreat, a Swarm Host between the armies.

| Difficulty | Thinks every | Income | First attack | Counter-picks | Powers |
|---|---|---|---|---|---|
| Easy | 4 s | ×0.7 | 9 min, 2400 army | No | None |
| Normal | 2 s | ×1.0 | 5 min, 1800 army | Yes | T2 |
| Hard | 1.2 s | ×1.35 | 3 min, 1400 army | Yes | T2, T3 |

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
