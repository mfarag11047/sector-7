# Announcer voice

Prompts for the announcer: a female military support AI who calls out what matters in a match.
First design the voice itself with a voice generator, then render the lines below with it,
one file per line, saved under the name given.

## 1. The voice

### Voice design prompt

> A female artificial intelligence serving as a military command-and-control support system.
> A clear, mid-range alto, sounding like a woman in her early thirties: calm, precise and
> quietly confident, with crisp, clipped diction and perfectly even pacing. A subtle synthetic
> quality runs under it, a faint digital sheen and an almost too-smooth evenness, as if she is
> speaking through a high-end battlefield comms system, but she stays warm and human enough to
> sound loyal to her commander. Neutral accent. Efficient and economical with words: urgent but
> never panicked under fire, dry and understated when reporting a success. Studio-clean
> recording, close microphone, no background noise, no music, no reverb.

How she differs from the familiar "friendly AI companion" voice: less playful and less breathy,
more clipped and military. She reports, she doesn't chat. No sighs, no laughs, no
wink in the voice.

### Preview text

Voice designers need a passage to preview the voice. Use this one: it has a calm report, an
alarm and a success, so you can hear all three registers.

> Commander, the command link is established and all systems are online. Enemy forces are
> massing near the eastern server node. Warning: missile launch detected. Brace for impact.
> Server node secured. Compute is coming online.

### Settings and delivery

- **Stability:** fairly high, so every line sounds like the same unit. Leave a little
  variation, or alarms come out flat.
- **Style / exaggeration:** low. She should sound controlled, not dramatic.
- **Speed:** normal to slightly brisk. Most lines should land in 1 to 2 seconds.
- **Two registers:** *report* (calm, level, for completions and captures) and *alert*
  (tighter, faster, a little louder, for attacks and missiles). Each line below says which.
- **Clean takes, robotic edge added later:** render her clean. A light synthetic treatment
  (a touch of ring modulation or bit reduction, a narrow comms band-pass, a very short metallic
  doubling) is better added afterwards, the same on every line, than baked into the voice.
  It can be tuned in the game's own processing.

### Files

- One line per file, named `<key>.mp3` (or `.wav`) using the keys below, e.g.
  `vo_base_under_attack.mp3`. For a line with several variants, add `_1`, `_2`... and the
  game will pick between them.
- Mono, 44.1 kHz. Trim the silence before the first word; leave about 0.2 s after the last.
- Two or three takes of the most frequent lines (unit ready, construction complete, under
  attack) keep them from wearing thin.

### Pronunciation

The text to send to the generator is in the **Say** column, spelled for the ear where that
matters:

- **CIWS** is said "sea-whiz".
- **Sector 7** is "Sector Seven".
- **HQ** is "H-Q", **EMP** is "E-M-P".
- Tier numbers are words: "Tier two".

## 2. The lines

**Register:** *R* is report, calm and level. *A* is alert, tight and urgent.

### Match

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_match_start` | The match begins | R | Command link established. All systems online. |
| `vo_match_start_2` | (variant) | R | Sector Seven is live. Good hunting, Commander. |
| `vo_victory` | The enemy's last HQ falls | R | Enemy command has fallen. Sector Seven is ours. |
| `vo_defeat` | Your last HQ falls | A | Command H-Q lost. All units, withdraw. |

### Threats

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_base_under_attack` | Enemies reach your base | A | Our base is under attack. |
| `vo_base_under_attack_2` | (variant) | A | Hostiles inside the perimeter. |
| `vo_server_node_under_attack` | The enemy starts taking your server node | A | Our server node is under attack. |
| `vo_core_node_under_attack` | The enemy starts taking your core node | A | Our core node is under attack. |
| `vo_missile_launch` | An enemy Ballista or silo fires | A | Warning: missile launch detected. |
| `vo_missile_launch_2` | (variant) | A | Incoming missile. Brace for impact. |
| `vo_missile_intercepted` | Your guns shoot an enemy missile down | R | Incoming missile intercepted. |
| `vo_wall_breached` | One of your base walls or gates is destroyed | A | Perimeter breached. |
| `vo_structure_lost` | One of your base buildings is destroyed | A | Structure lost. |
| `vo_force_field_down` | Your force field collapses | A | Force field down. Rebooting. |
| `vo_force_field_up` | It comes back up | R | Force field restored. |
| `vo_jammed` | Your orders are jammed | A | Signal jammed. Orders are not getting through. |
| `vo_enemy_orbital_drop` | An enemy Orbital Drop is coming down near you | A | Enemy orbital drop detected. |

### Objectives

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_core_node_captured` | You take a core node | R | Core node secured. |
| `vo_server_node_captured` | You take a server node | R | Server node secured. Compute online. |
| `vo_core_node_lost` | You lose a core node | A | Core node lost. |
| `vo_server_node_lost` | You lose a server node | A | Server node lost. |

### Base and economy

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_construction_complete` | Any base building finishes (fallback) | R | Construction complete. |
| `vo_barracks_online` | A Barracks finishes | R | Barracks online. |
| `vo_factory_online` | A Factory finishes | R | Factory online. |
| `vo_airpad_online` | An Airpad finishes | R | Airpad online. |
| `vo_depot_online` | A Depot finishes | R | Depot online. |
| `vo_comm_link_online` | A Comm Link finishes | R | Comm Link online. |
| `vo_munitions_online` | A Munitions plant finishes | R | Munitions online. |
| `vo_ordnance_fab_online` | An Ordnance Fab finishes | R | Ordnance Fab online. |
| `vo_research_online` | An Advanced Research lab finishes | R | Advanced Research online. |
| `vo_refinery_online` | A Core Refinery finishes | R | Core Refinery online. |
| `vo_sentry_online` | A Sentry Turret finishes | R | Sentry turret online. |
| `vo_ciws_online` | A CIWS Turret finishes | R | Sea-whiz turret online. |
| `vo_hq_deploying` | You order a new command base | R | New command base deploying. |
| `vo_hq_online` | It finishes | R | Forward command online. |
| `vo_refinery_upgraded` | A Core Refinery reaches level 2 | R | Refinery upgrade complete. |
| `vo_research_complete` | An upgrade finishes researching | R | Research complete. |
| `vo_tier_ready` | You have the compute for the next tier | R | Compute threshold reached. New tier available. |
| `vo_tier_2` | Tier 2 researched | R | Tier two unlocked. |
| `vo_tier_3` | Tier 3 researched | R | Tier three unlocked. |

### Your weapons and powers

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_missile_away` | Your Ballista or silo fires | R | Missile away. |
| `vo_missile_shot_down` | Your missile is shot down | A | Our missile was intercepted. |
| `vo_orbital_drop` | You call an Orbital Drop | R | Orbital drop inbound. |
| `vo_bulwark_field` | You raise a Bulwark Force Field | R | Bulwark field active. |
| `vo_decoys` | You deploy Phantom Decoys | R | Phantom decoys deployed. |
| `vo_cloaking_field` | Your Cloaking Field goes up | R | Cloaking field active. |
| `vo_nano_cloud` | You release a Nano-Cloud | R | Nano-cloud released. |

### Refusals

Short and level. These play often, so keep them under a second.

| Key | When | Reg. | Say |
|---|---|---|---|
| `vo_not_enough_cores` | An order needs more cores than you have | R | Insufficient cores. |
| `vo_cannot_build_there` | A building can't go where you placed it | R | Cannot build there. |
| `vo_unable` | Any other refused order | R | Unable to comply. |

## 3. How the game uses them

Built in `components/announcer.ts`, with the recordings in `public/vo/` (listed in
`public/vo/manifest.json`).

- Only the player's side is announced. Spectating, she speaks for the side being viewed, and
  "under attack" lines stay silent as the siren does.
- One line at a time. The most important line wins: threats over objectives over base reports
  over refusals. A line that would repeat within a few seconds is dropped. The per-building
  lines fall back to "Construction complete" if a file is missing.
- She takes the place of the existing chime for the same event, or plays just after it, so
  the two don't clash.
