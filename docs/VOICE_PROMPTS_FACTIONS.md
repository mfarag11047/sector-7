# Faction announcers: voice prompts

Two announcers, one for each side, so each corporation sounds like itself. Each side hears only
its own.

| | Vanta | Tokugen |
|---|---|---|
| Archetype | A dynastic corporate empire | A federal arms corporation |
| Callsign (call window) | **KAMI-OS** · Tactical Arbiter | **TAC-NET** · Overwatch |
| Voice | The existing female AI voice, re-directed | The new male AI voice |
| Addresses the player as | Director | Commander |
| War is... | Restoring order; an audit of trespassers | A contract; a live-fire product demonstration |
| Enemies are... | Trespassers, dissidents, rogue elements | Hostiles, insurgents, OpFor |
| Own forces are... | Retainers, assets of the Family | Contractors, hardware, line items |
| Under pressure she/he gets... | Colder and slower, never louder | Louder and faster, escalating |

This replaces the single-announcer line list in `docs/VOICE_PROMPTS.md` (keys, timing and file
rules stay the same).

---

## 1. Rules for both

- **The game's own words stay plain in every line.** Core node, server node, cores, compute,
  H-Q, Tier two, the building names: the flavour goes around them, never instead of them. A
  player must understand every line at a glance.
- **Short.** Threats under 2 seconds, reports under 2.5, refusals under 1. The longer lines in
  the ideology bible are for briefings; here only the opening and the ending run longer.
- **Two registers each,** marked per line: **R** report, **A** alert. They mean different
  things for each announcer (below).
- **Pronunciation:** CIWS is "sea-whiz", Sector 7 is "Sector Seven", HQ is "H-Q", tier numbers
  are words ("Tier two"). Write the **Say** text exactly as given.

### Files

- Same keys as now, one folder per side:
  `public/vo/vanta/<key>.mp3` and `public/vo/tokugen/<key>.mp3`.
- A line with variants: the base file, then `<key>_2.mp3`, `<key>_3.mp3`. The game picks one at
  random.
- Mono, 44.1 kHz. Trim the silence before the first word; leave about 0.2 s after the last.
- Render clean. The game adds each side's treatment afterwards (see §4), so leave out radio
  static, clicks and reverb.
- Until Vanta's new lines are recorded, the current recordings in `public/vo/` stand in for her.

---

## 2. Vanta · KAMI-OS

### Voice direction (paste with every generation)

> A composed female corporate AI, the tactical arbiter of an old and patient dynasty. Calm,
> resonant, silk-smooth alto with crisp, clipped diction and perfectly even pacing. She speaks
> like an executive concierge merged with an orbital targeting computer: aristocratic, detached,
> faintly displeased by disorder, never surprised by victory. She never shouts, never hurries,
> never uses slang. Under threat she grows colder and slower rather than louder: an attack is a
> breach of etiquette, a loss is an accounting discrepancy. Studio-clean, close microphone, no
> reverb, no music.

### Settings

- **Stability:** high (about 0.75). Every line the same composed unit.
- **Style / exaggeration:** low (about 0.15). Restraint is the character.
- **Speed:** a touch slow (about 0.95). Let the pauses at full stops land.

### Registers

- **R (report):** level, unhurried, with a faint note of condescension. Statements, not
  celebrations. Falling pitch at every full stop.
- **A (alert):** *no* rise in pitch or volume. Colder, a little slower, consonants sharper, as if
  addressing a subordinate who has disappointed her. No exclamation, ever.

### Vocabulary

Use: sovereignty, compound, order, harmony, trespassers, dissidents, rogue elements, retainers,
audit, liquidated, excised, authorised, capital, yield, dividend, protocol, the Family, the board.
Never: military slang, exclamations, contractions, anything that sounds hurried.

---

## 3. Tokugen · TAC-NET

### Voice direction (paste with every generation)

> A male military AI, the tactical net of a federal arms corporation, speaking like a combat
> controller in a situation room. Crisp, authoritative baritone, punchy and assertive, with
> clipped military brevity and active verbs. Confident to the point of swagger when things go
> well, proud of his hardware; when under fire he escalates fast, louder and quicker, calling for
> fire and armour, but always in control, never panicked. Pragmatic and blunt, with a defence
> contractor's habit of sounding like a press release. Studio-clean, close microphone, no
> reverb, no music.

### Settings

- **Stability:** medium (about 0.5). He needs room to push on alerts.
- **Style / exaggeration:** moderate (about 0.35).
- **Speed:** brisk (about 1.08).

### Registers

- **R (report):** brisk, confident, a hint of a grin. Like reading out a good quarter.
- **A (alert):** urgent and loud, clipped, rising energy, as if keyed over a radio in a hot
  zone. Exclamations are fine and intended.

### Vocabulary

Use: base, perimeter, hostiles, contact, theatre, pacify, contract, contractors, ordnance,
hardware, requisition, annexed, cleared hot, weapons free, sat-link, splash, write off, sign-off.
Never: poetry, feudal or mystical language, anything passive or philosophical.

---

## 4. In the game (for when they go in)

- Each side's announcer speaks only to that side's player; spectating, the side being viewed
  speaks.
- The call window shows each side's callsign: KAMI-OS framed in Vanta's red, TAC-NET in
  Tokugen's green (threats still flash red).
- Treatment added in the game, the same on every line of a side:
  - **Vanta:** crystalline and expensive. A wide, clean band (no telephone squash), a faint
    high shimmer and a very short glassy doubling, no static.
  - **Tokugen:** sat-link radio. A narrower comms band-pass, light saturation, a soft squelch
    click at the start and end of each transmission.

---

## 5. The lines

Columns: **Key** (the file name), **When** it plays, **Reg.** (register), **Say** (the text to
generate), **Direction** (how to deliver it; put it in the generator's style or description
field, or as a bracketed tag before the text if your generator takes them).

### 5.1 Match

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_match_start` | The match begins | R | Orbital grid synchronised. Sector Seven is unsettled, Director. Restore order. | Slow, deliberate, a quiet command. | R | TAC-NET online. Sat-link green. You are cleared hot, Commander. | Brisk briefing, confident. |
| `vo_match_start_2` | (variant) | R | Loyalty. Pragmatism. Discipline. The board is watching, Director. | The three words as a creed, a beat between each. | R | Forward base established. Rules of engagement: weapons free. | Upbeat, ready to roll. |
| `vo_victory` | The enemy's last HQ falls | R | The trespassers have been liquidated. Order is restored. Well executed, Director. | Unsurprised; victory as the natural state of things. Slight warmth only on the last three words. | R | Theatre pacified. Contract fulfilled. Outstanding work, Commander. | Triumphant, a grin you can hear. |
| `vo_defeat` | Your last HQ falls | A | This compound has fallen. The Family endures. Withdraw the data cores. | Ice-cold resolve, slow. No grief, a promise of later retaliation. | A | H-Q is overrun! Scrub the servers and pull everyone out! | Gritty, defiant, shouting over noise. |

### 5.2 Threats

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_base_under_attack` | Enemies reach your base | A | Trespassers inside our compound. Remove them. | Cold displeasure, clipped. | A | Hostiles hitting the base! Return fire! | Urgent, loud. |
| `vo_base_under_attack_2` | (variant) | A | Our compound is under attack, Director. | Level, icy. | A | Contact at the perimeter! Base under attack! | Urgent, fast. |
| `vo_server_node_under_attack` | The enemy starts taking your server node | A | Dissidents are contesting our server node. | Clipped, faint disdain on "dissidents". | A | Server node taking fire! Hold that position! | Urgent. |
| `vo_core_node_under_attack` | The enemy starts taking your core node | A | Our core node is being violated. | Cold, as of a breach of etiquette. | A | Core node under attack! Push them off it! | Urgent. |
| `vo_missile_launch` | An enemy Ballista or silo fires | A | Missile launch detected. Brace the compound. | Sharper consonants, still no rise. | A | Launch detected! Missile inbound! | Alarm, fast. |
| `vo_missile_launch_2` | (variant) | A | A rival warhead is in the air. | Measured, ominous. | A | Incoming! Brace for impact! | Shouted. |
| `vo_missile_intercepted` | Your guns shoot an enemy missile down | R | Warhead intercepted. The sky remains ours. | Calm, satisfied. | R | Splash one! Incoming missile intercepted. | Pumped, quick. |
| `vo_wall_breached` | One of your base walls or gates is destroyed | A | Our perimeter has been breached. | Cold. | A | Perimeter breach! Seal that gap! | Urgent. |
| `vo_structure_lost` | One of your base buildings is destroyed | A | A facility has been lost. It will be accounted for. | Ledger-like, a quiet threat in the second sentence. | A | Structure down! Write it off and rebuild! | Blunt, urgent. |
| `vo_force_field_down` | Your force field collapses | A | Force field collapsed. Recalibrating. | Clipped. | A | Shield's down! Rebooting the generator! | Urgent. |
| `vo_force_field_up` | It comes back up | R | Force field restored. Harmony maintained. | Level. | R | Shield's back up. Good to go. | Relieved, brisk. |
| `vo_jammed` | Your orders are jammed | A | Our signal is polluted. Orders are not arriving. | Distaste on "polluted". | A | Comms jammed! Orders aren't getting through! | Frustrated, urgent. |
| `vo_enemy_orbital_drop` | An enemy Orbital Drop is coming down near you | A | Unlicensed orbital insertion near our forces. | Cold, precise. | A | Enemy drop inbound near our position! | Urgent. |

### 5.3 Objectives

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_core_node_captured` | You take a core node | R | Core node absorbed. Dividends flowing. | Quietly pleased, a shareholder's tone. | R | Core node annexed. Requisition flowing. | Confident. |
| `vo_server_node_captured` | You take a server node | R | Server node acquired. Compute is ours. | Level, possessive. | R | Server node secured. Compute online. | Brisk. |
| `vo_core_node_lost` | You lose a core node | A | A core node has slipped from our hands. | Cold, disappointed. | A | Core node lost! Take it back! | Urgent. |
| `vo_server_node_lost` | You lose a server node | A | Server node lost. An unacceptable deficit. | Icy. | A | Server node lost! Get it back, Commander! | Urgent. |

### 5.4 Base and economy

These play often. Keep them light and quick.

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_construction_complete` | Any base building finishes (fallback) | R | Facility complete. Minimal form, absolute function. | Level, a small aphorism. | R | Structure up and operational. | Brisk. |
| `vo_construction_complete_2` | (variant) | R | Construction complete. | Plain. | R | Construction complete. Ready for production. | Brisk. |
| `vo_barracks_online` | A Barracks finishes | R | Barracks online. Retainers await assignment. | Level. | R | Barracks online. Contractors ready. | Brisk. |
| `vo_factory_online` | A Factory finishes | R | Factory online. Precision lines running. | Level. | R | Factory online. Armour coming off the line. | Proud. |
| `vo_airpad_online` | An Airpad finishes | R | Airpad online. Air assets authorised. | Level. | R | Airpad online. Air support on standby. | Brisk. |
| `vo_depot_online` | A Depot finishes | R | Depot online. Logistics in order. | Level. | R | Depot online. Supply lines open. | Brisk. |
| `vo_comm_link_online` | A Comm Link finishes | R | Comm Link online. Our sight extends. | Level. | R | Comm Link online. Sat-link extended. | Brisk. |
| `vo_munitions_online` | A Munitions plant finishes | R | Munitions online. | Plain. | R | Munitions online. Ordnance in production. | Brisk. |
| `vo_ordnance_fab_online` | An Ordnance Fab finishes | R | Ordnance Fab online. Our arsenal deepens. | Level, faint menace. | R | Ordnance Fab online. Heavy payloads authorised. | Proud. |
| `vo_research_online` | An Advanced Research lab finishes | R | Advanced Research online. Special projects may proceed. | Level. | R | Advanced Research online. R and D is go. | Brisk. |
| `vo_refinery_online` | A Core Refinery finishes | R | Core Refinery online. Yield increased. | A banker's satisfaction. | R | Core Refinery online. Extraction rig running. | Brisk. |
| `vo_sentry_online` | A Sentry Turret finishes | R | Sentry turret online. Trespassers will be excised. | Level, quiet threat. | R | Sentry gun online. Field of fire established. | Confident. |
| `vo_ciws_online` | A CIWS Turret finishes | R | Sea-whiz turret online. The sky is closed. | Level. | R | Sea-whiz online. Air defence is hot. | Confident. |
| `vo_hq_deploying` | You order a new command base | R | A new compound is being established. | Level. | R | New forward base deploying. | Brisk. |
| `vo_hq_online` | It finishes | R | Regional compound online. Our reach extends. | Pleased, measured. | R | Forward operating base online. | Confident. |
| `vo_refinery_upgraded` | A Core Refinery reaches level 2 | R | Refinery upgrade complete. Yield optimised. | Level. | R | Refinery upgraded. Throughput up. | Brisk. |
| `vo_research_complete` | An upgrade finishes researching | R | Research complete. Protocols updated. | Level. | R | Research complete. New gear cleared. | Brisk. |
| `vo_tier_ready` | You have the compute for the next tier | R | Compute threshold reached. The board will authorise a new tier. | Measured, a hint of anticipation. | R | Compute threshold met. Next tier ready for sign-off. | Brisk, eager. |
| `vo_tier_2` | Tier 2 researched | R | Tier two authorised. | Formal, a decree. | R | Tier two unlocked. New hardware on the catalogue. | Proud, salesman. |
| `vo_tier_3` | Tier 3 researched | R | Tier three authorised. Special projects are yours, Director. | Formal, a rare note of approval. | R | Tier three unlocked. Heavy weapons catalogue open. | Proud, a grin. |

### 5.5 Your weapons and powers

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_missile_away` | Your Ballista or silo fires | R | Judgement authorised. Missile away. | Cold, ceremonial. | R | Missile away! Ordnance on target. | Pumped. |
| `vo_missile_shot_down` | Your missile is shot down | A | Our missile was intercepted. An inconvenience. | Dry, unbothered. | A | Our missile's been shot down! | Frustrated. |
| `vo_orbital_drop` | You call an Orbital Drop | R | Orbital insertion inbound. | Level. | R | Drop pods inbound. Boots on the ground in seconds. | Confident. |
| `vo_bulwark_field` | You raise a Bulwark Force Field | R | Bulwark field raised. | Level. | R | Bulwark shield up. | Brisk. |
| `vo_decoys` | You deploy Phantom Decoys | R | Phantom decoys deployed. Let them chase shadows. | Faint amusement. | R | Decoys out. Spoofing their targeting. | Sly, quick. |
| `vo_cloaking_field` | Your Cloaking Field goes up | R | Cloaking field active. We are unseen. | Hushed, a little lower. | R | Cloak is up. Running dark. | Low, quick. |
| `vo_nano_cloud` | You release a Nano-Cloud | R | Nano-cloud released. | Level. | R | Nano-cloud deployed. Area denial active. | Brisk. |

### 5.6 Refusals

Under a second, flat, no flavour beyond a word: these can play several times a minute.

| Key | When | Vanta · Reg. | Vanta · Say | Vanta · Direction | Tokugen · Reg. | Tokugen · Say | Tokugen · Direction |
|---|---|---|---|---|---|---|---|
| `vo_not_enough_cores` | An order needs more cores than you have | R | Insufficient cores. | Flat, faint disapproval. | R | Not enough cores. | Flat, quick. |
| `vo_cannot_build_there` | A building can't go where you placed it | R | That site is not permitted. | Flat. | R | Can't build there. | Flat, quick. |

---

## 6. Optional extra takes

If you have the time, a second take of these keeps the most frequent lines from wearing thin
(the file names are given):

| File | Vanta · Say | Tokugen · Say |
|---|---|---|
| `vo_core_node_captured_2` | Core node secured. The conglomerate grows. | Core node secured. Cash flow's up. |
| `vo_server_node_captured_2` | Server node secured. Compute online. | Server node locked down. Compute flowing. |
| `vo_research_complete_2` | Research complete. | Research done. Gear's cleared for the field. |
| `vo_missile_launch_3` | Warning. Missile launch detected. | Missile in the air! Take cover! |
