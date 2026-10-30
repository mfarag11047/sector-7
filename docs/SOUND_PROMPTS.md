# Sound effect prompts

Prompts for generating Sector 7's sound effects with an AI sound generator. Each entry gives the
file name to save it as, a target length, and the prompt. The names in **Weapons and blasts** match
the sounds the game already plays (`SoundKind` in `components/sfx.ts`), so those files can replace
the synthesised sounds directly; the rest are sounds the game doesn't have yet.

## How to generate them

- Add this style line to the end of every prompt if the generator doesn't keep a session style:
  *"Near-future cyberpunk military, crisp and punchy, mono, dry with no reverb or music, no voices,
  starts instantly with no silence."*
- **Variations:** sounds marked ×4 play many times a second in a firefight. Generate four takes
  of each (`rifle_1` … `rifle_4`) so a volley doesn't sound like one sample repeated. The game
  pitches and pans them on top.
- **Keep them dry and mono.** The game places each sound in the stereo field and fades it with
  distance itself, so baked-in reverb, stereo width or a long tail will fight that.
- **Trim** the silence at the start of each file; the game fires the sound on the exact frame.
- **Loops** (marked *loop*) should be generated a little long and cut to loop seamlessly.
- Save as `.mp3` (plays in every browser), peaks around −3 dB. Generators often make clips far
  longer than asked; a long one is fine, it gets trimmed and faded to length.

## Adding a recording to the game

Put the trimmed takes in `public/sfx/` as `<name>_1.mp3`, `<name>_2.mp3`, … and list them under
that name in `public/sfx/manifest.json`; the game reads the manifest, so no code changes. Names the
game already plays are those in **Weapons and blasts** (explosions by size: `explosion_small`,
`explosion`, `explosion_large`) plus `hornet_rocket`, `wasp_swarm` and `ballista_launch`, which
play a made-in-code sound until they have recordings. The others need hooking up where they happen.

`tools/process_sfx.py` is how the weapon pack was cut down: it trims each raw clip to its first
transient (the railgun to its shot, after the charge-up), cuts it to length with a fade, mixes it
to mono, levels the takes of each sound to match and writes the manifest. The Sentinel's laser is
made into a loop (`laser_beam`): the opening zap plays once, then a crossfaded stretch of the
steady hum repeats for as long as the beam is on; its manifest entry gives the loop points.

In the game: every sound in **Weapons and blasts**. Still to record: everything below it.

## Weapons and blasts (replace the current sounds)

| File | Length | Takes | Prompt |
|---|---|---|---|
| `rifle` | 0.2 s | ×4 | Single shot from a compact electric-assisted assault rifle, sharp supersonic crack with a short low thump, heard from a short distance in a city street. |
| `mg` | 0.15 s | ×4 | Single round from a light drone-mounted machine gun, tight snappy crack slightly lower and heavier than a rifle, mechanical bolt click underneath. |
| `flak` | 0.3 s | ×4 | Single anti-aircraft flak cannon shot, dull heavy pop with a short airburst crackle, mid-low pitch. |
| `ciws` | 0.5 s | ×3 | Short burst from a rotary close-in weapon system firing thousands of rounds a minute, continuous buzz-saw brrrt with a whine of the spinning barrels, cut off sharply. |
| `cannon` | 0.6 s | ×4 | Main battle tank cannon firing, deep concussive boom with a falling pitch, short metallic breech clank, no echo. |
| `rail` | 0.9 s | ×3 | Electromagnetic railgun shot: a hard supersonic crack, an electric zap sweeping down in pitch, a bright metallic ring that hangs briefly, and a sub-bass punch. |
| `missile` | 0.7 s | ×3 | Shoulder-fired anti-tank missile launching, quick ignition pop then a rushing whoosh rising in pitch as it leaves the tube. |
| `rocket` | 0.8 s | ×4 | Artillery rocket launching from a truck-mounted pod, loud ignition bang and roaring whoosh climbing away into the sky. |
| `laser` | 0.6 s | ×3 | Security drone firing a focused energy beam, buzzing electric hum that sweeps downward in pitch with a crackle where it hits. |
| `blade` | 0.3 s | ×4 | Quick monomolecular katana slash, sharp airy swish ending in a thin metallic shing. |
| `explosion_small` | 1 s | ×4 | Small explosion, a grenade or light vehicle hit: punchy bang with flying debris and a short fading rumble. |
| `explosion` | 1.6 s | ×4 | Medium explosion, a vehicle destroyed: heavy boom, crackling fire burst and metal debris falling, rumble fading out. |
| `explosion_large` | 2.5 s | ×3 | Large explosion, a building or base structure destroyed: deep roaring blast with a low sub-bass boom, concrete and glass raining down, long falling rumble. |
| `emp` | 1.2 s | ×3 | Electromagnetic pulse detonation, sharp electric crackle and buzzing static over a tone dropping steeply in pitch, electronics powering down. |
| `shield` | 0.4 s | ×4 | Shot absorbed by an energy force field, soft resonant electric thud with a brief shimmering hum. |

## Weapons that share a sound today

| File | Length | Takes | Prompt |
|---|---|---|---|
| `hornet_rocket` | 0.6 s | ×3 | Gunship firing a guided air-to-ground rocket, sharp hiss-whoosh streaking away fast. |
| `wasp_swarm` | 1 s | ×3 | Volley of tiny homing micro-missiles fired in rapid succession from a drone pod, a dozen quick fizzing pops and whistles. |
| `flechette_burst` | 0.4 s | ×3 | Drone firing a shotgun-like burst of steel flechettes, sharp scattered metallic hiss. |
| `grenade_launch` | 0.5 s | ×3 | Heavy mech launching a volley of grenades, hollow thunk-thunk-thunk of a rotary grenade launcher. |
| `sentry_turret` | 0.8 s | ×3 | Automated base defence turret firing a railgun slug, high-voltage snap and ringing metallic crack. |
| `ballista_launch` | 2 s | ×2 | Large tactical cruise missile launching from a vertical launcher, booster ignition roar building into a thundering climb. |
| `shell_incoming` | 1.5 s | ×3 | Artillery rocket coming down from high above, descending whistle growing louder, ending just before impact. |
| `crawler_detonate` | 1 s | ×3 | Small suicide robot detonating, quick electronic beep-beep-beep then a sharp explosive bang. |
| `bombard_drop` | 1.8 s | ×3 | Cluster bomb strike from above, a rapid string of overlapping heavy explosions rolling across a city block. |
| `titan_drop` | 3 s | ×1 | Heavy war machine dropped from orbit: rising sonic roar of re-entry, a massive ground-shaking impact, then servos powering up. |
| `microwave_beam` | 2 s | loop | Microwave emitter drone projecting a beam, oppressive low electric hum with a faint wavering whine. |

## Impacts and destruction

| File | Length | Takes | Prompt |
|---|---|---|---|
| `hit_metal` | 0.2 s | ×4 | Bullet hitting armoured vehicle plating, sharp metallic ping and ricochet. |
| `hit_concrete` | 0.25 s | ×4 | Bullet striking a concrete building wall, dusty chip and crumble. |
| `hit_heavy_building` | 0.8 s | ×3 | Tank shell slamming into an office tower, concussive crunch of concrete and shattering glass. |
| `building_collapse` | 4 s | ×2 | City building collapsing after being destroyed, groaning steel, cascading concrete and glass, deep rumble settling into dust. |
| `wall_breach` | 2 s | ×2 | Fortified base wall section blown apart, heavy concrete blast and rebar groaning, rubble tumbling. |
| `gate_cycle` | 1.5 s | ×2 | Heavy armoured blast gate sliding down into the ground, hydraulic hiss and grinding steel ending in a thud. |
| `unit_destroyed_infantry` | 0.6 s | ×3 | Armoured soldier taken down, body armour clatter and gear hitting pavement, no voice. |
| `unit_destroyed_drone` | 1 s | ×3 | Small drone shot down, sparking electrical pop, rotors sputtering, then a crash on pavement. |

## Units

| File | Length | Takes | Prompt |
|---|---|---|---|
| `move_infantry` | 3 s | loop | Squad of armoured soldiers jogging on wet city pavement, boots and gear rattle, no voices. |
| `move_light_vehicle` | 3 s | loop | Fast electric buggy driving, high whining electric motor and tyres on asphalt. |
| `move_heavy_vehicle` | 3 s | loop | Heavy electric battle tank rolling, deep motor hum, rumbling tracks and suspension creaks. |
| `move_drone` | 3 s | loop | Small quadcopter drone hovering and flying, steady high-pitched propeller buzz. |
| `move_gunship` | 3 s | loop | Futuristic ducted-fan gunship in flight, heavy thrumming rotor wash and turbine whine. |
| `move_bombard` | 3 s | loop | Large heavy-lift bomber drone flying low, deep droning turbines. |
| `anchor_down` | 1.5 s | ×2 | Mobile artillery truck deploying, hydraulic stabiliser legs thumping down and rocket pods raising with servo whirr. |
| `pack_up` | 1.5 s | ×2 | Mobile artillery truck stowing, servos lowering the pods and hydraulic legs retracting with a hiss. |
| `battery_charge` | 2 s | loop | Mobile battery truck wirelessly charging a vehicle, rising electrical hum with soft crackles. |
| `repair_beam` | 2 s | loop | Repair robot welding damaged armour, steady arc-welder buzz with small sparks. |
| `jammer` | 2 s | loop | Electronic warfare vehicle jamming signals, warbling radio static and digital chirps. |
| `cloak_on` | 0.8 s | ×2 | Optical camouflage activating, shimmering rising whoosh fading to silence. |
| `cloak_off` | 0.8 s | ×2 | Optical camouflage dropping, shimmering falling whoosh and electric pop. |
| `force_field_up` | 1.5 s | ×2 | Energy dome shield generator powering up, deep electric swell blooming into a resonant hum. |
| `force_field_down` | 1.2 s | ×2 | Energy dome shield collapsing, cracking electric shatter fading out. |
| `smoke_screen` | 1.2 s | ×2 | Tank launching smoke grenades, several quick mortar pops and hissing smoke. |

## Base, economy and capture

| File | Length | Takes | Prompt |
|---|---|---|---|
| `construction` | 3 s | loop | Robotic construction site, automated welding, hydraulic presses and servo arms working. |
| `structure_complete` | 1.2 s | ×1 | Military base building finishing construction, heavy mechanical lock-in clunk followed by a short rising power-up hum. |
| `unit_ready` | 0.8 s | ×1 | Factory bay door opening and a vehicle rolling out, pneumatic hiss and short electronic chime. |
| `research_complete` | 1.2 s | ×1 | Futuristic research upgrade completed, bright ascending digital chime with a soft synth shimmer. |
| `tier_up` | 2 s | ×1 | Military tech tier unlocked, powerful rising synth swell ending in a confident low impact. |
| `capture_tick` | 0.15 s | ×1 | Subtle digital data-upload blip, soft and short. |
| `building_captured` | 0.8 s | ×1 | Building claimed for your faction, satisfying two-note digital confirmation tone with a power-up hum. |
| `node_captured` | 1.5 s | ×1 | Major objective captured, a core reactor humming to life with a rising energy swell and bright chime. |
| `node_lost` | 1.5 s | ×1 | Objective lost to the enemy, falling synth tone with a power-down hum. |
| `base_founded` | 2.5 s | ×1 | New command headquarters deploying, heavy landing thud, hydraulics unfolding and systems booting up. |

## Interface

| File | Length | Takes | Prompt |
|---|---|---|---|
| `ui_click` | 0.08 s | ×2 | Clean futuristic interface button click, soft and short. |
| `ui_hover` | 0.05 s | ×1 | Very subtle holographic interface tick. |
| `ui_select` | 0.15 s | ×3 | Unit selected in a sci-fi tactical display, crisp digital blip. |
| `ui_order_move` | 0.2 s | ×3 | Move order acknowledged on a military tactical display, short double electronic beep. |
| `ui_order_attack` | 0.2 s | ×3 | Attack order acknowledged on a military tactical display, sharper lower electronic beep with an aggressive edge. |
| `ui_error` | 0.3 s | ×1 | Invalid action on a futuristic interface, short low buzz denial tone. |
| `ui_notice` | 0.4 s | ×1 | Incoming tactical notification, clean two-tone ping. |
| `alert_under_attack` | 1 s | ×1 | Base under attack warning, urgent pulsing electronic alarm, three short bursts. |
| `alert_missile` | 1.2 s | ×1 | Enemy missile launch detected, rapid rising radar warning tone. |
| `victory` | 4 s | ×1 | Victory sting for a cyberpunk strategy game, triumphant synth brass rising to a bold resolved chord. |
| `defeat` | 4 s | ×1 | Defeat sting for a cyberpunk strategy game, dark descending synth with a heavy final low hit. |

## Ambience

| File | Length | Takes | Prompt |
|---|---|---|---|
| `city_ambience` | 60 s | loop | Night-time cyberpunk megacity ambience, distant traffic hum, neon buzz, far-off sirens and occasional drone fly-bys, no music, no voices. |
| `battle_distant` | 30 s | loop | Distant urban battle heard across a city, muffled gunfire and occasional far explosions, no music. |
