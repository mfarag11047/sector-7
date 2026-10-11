# Sector 7 – playable build design

This is the design behind the `claude/playable-game` branch. It takes the systems already in the
game (core nodes, the energy grid, compute, doctrines, the ability units) and wraps them in a
complete match: a fair map, an opponent, a counter-based roster, production that takes time, and a
way to win. The numbers live in code (`sim/units.ts`, `constants.ts`). This file explains the intent,
so tuning keeps the shape.

## The match

1. **Setup screen.** Choose your side, the opponent (AI Easy, Normal or Hard, or Sandbox where you
   control both sides with the old showcase roster) and your doctrine.
2. **Start.** Each side has its Command HQ, 3 Strike Troopers, a Mason, an Infiltrator Drone and
   1000 cores.
3. **Win** by destroying the enemy HQ, or by **domination**: holding 4 of the 6 core nodes for
   two minutes without interruption. The HUD shows the countdown for whoever is closest.
4. **End screen** with the result, match time and stats, and a button to play again.

The intended arc:
- **Opening (0–4 min):** troopers take the home core node and nearby buildings to stretch the grid,
  then a Barracks and Factory go up.
- **Mid game:** fights over the four outer core nodes. A strike on the guarded server nodes in the
  centre unlocks Tier 2.
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

## Population

`cap = 20 + 8 × core nodes held`, up to 60. Holding more of the map lets you field a bigger army. A
unit's pop cost is reserved when it is queued.

## Tech tiers (compute)

| Tier | Requires |
|---|---|
| T1 | Start |
| T2 | Hold 1 server node |
| T3 | Hold 2 server nodes |

There are four server nodes, mirrored around the centre, each guarded by a Sentinel drone that
fires on anyone nearby. Losing server nodes drops your tier. Units you already have stay, but you
can't train above your tier. Doctrine powers need the matching tier (T2 power at T2, T3 power at T3)
and respect their cooldowns.

## Combat model

Every unit has an **armor class** and a **weapon**. The weapon has damage, a cooldown, a range in
tiles, a damage type, and whether it can hit ground and/or air.

**Damage multipliers** (damage type × armor):

| | Infantry | Light | Heavy | Air | Structure |
|---|---|---|---|---|---|
| Rifle (small arms) | 1.0 | 0.6 | 0.25 | 0.5 | 0.2 |
| AP (anti-armor) | 0.5 | 1.5 | 1.75 | 0.75 | 0.75 |
| Flak | 0.4 | 0.4 | 0.2 | 2.0 | 0.1 |
| Explosive | 1.25 | 1.0 | 0.75 | 0 | 1.5 |

**The counter triangle**, Halo Wars style, holds at equal cost (tested in `sim/balance.test.ts`):
- Infantry beat air
- Air beats vehicles
- Vehicles beat infantry
- Specialists counter each corner: Lancers beat vehicles, Aegis beat air, and Titans beat light
  vehicles.

**Engagement rules:**
- Units fire automatically at the nearest enemy their weapon can hit, including while moving.
- **Attack-move** (used by the AI, and by the player with the A key or Ctrl-click) stops to fight
  whatever comes into range, then carries on.
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
| **Ghost** EW Specialist | 150 | 1 | T2 | 90 | Infantry | Rifle 12 / 1.0 s / 3, hits air | Fast capture (1.5×), Phantom Decoy, dampener |
| **Lancer** (new) | 140 | 1 | T2 | 80 | Infantry | AP 55 / 2.5 s / 4, hits air | Anti-vehicle rockets |

### Factory (vehicles)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Razorback** (new) | 200 | 2 | T1 | 260 | Light | Rifle 9 / 0.5 s / 3, hits air | Fast raider, anti-infantry |
| **Battery Mule** | 250 | 2 | T1 | 500 | Heavy | None | Mobile power for vehicles |
| **Titan MBT** | 420 | 3 | T2 | 700 | Heavy | AP 60 / 2.2 s / 4 | Main battle tank, cannon, smoke, APS |
| **Aegis** (new) | 240 | 2 | T2 | 300 | Light | Flak 30 / 1.2 s / 5, air only | Anti-air escort |

### Airpad (aircraft)

| Unit | Cost | Pop | Tier | HP | Armor | Weapon | Role |
|---|---|---|---|---|---|---|---|
| **Infiltrator Drone** | 60 | 1 | T1 | 60 | Air | Rifle 4 / 1.0 s / 2 | Scout, surveillance |
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
- **Ordnance Fab:** Field Fabricator (260, T2), Courier (50, T2), Eclipse and HE warheads.
- **Command HQ:** 5000 HP; AP 30 / 1.0 s / 5, hits air.

## AI opponent

The AI (`sim/ai.ts`) plays by the same rules as you. It sends the same validated commands, from the
same economy.

1. **Build order:** Barracks → Factory → Comm Link → Airpad (at T2) → Depot, placed inside its grid.
2. **Production:** keeps a target mix that shifts with its tier and counters what it has seen of
   your army. For example, it builds more Aegis and Troopers when you build aircraft, and more
   Lancers when you build vehicles.
3. **Territory:** pairs of Troopers capture the nearest core nodes, then buildings that extend the
   grid.
4. **Army:**
   - It gathers, then attack-moves on your nearest core node, then your structures, then your HQ,
     once it has enough strength.
   - It regroups if the attack is broken.
   - It pushes on server nodes to tech up.
5. **Defence:** it pulls the army home when your units approach its base.

| Difficulty | Thinks every | Income | Attacks |
|---|---|---|---|
| Easy | 3 s | ×0.8 | Later, smaller waves; no counter-picking |
| Normal | 1.5 s | ×1.0 | |
| Hard | 1 s | ×1.2 | Earlier and harder |

## Map

- The city is 79×79 tiles. That size makes the road grid mirror exactly, so the map is
  **point-symmetric**: whatever is at a tile near your base is also at the matching tile near the
  enemy's.
- Generation uses a seeded random number generator, so a seed reproduces a map.
- There are 6 core nodes and 4 server nodes, all in mirrored pairs.
