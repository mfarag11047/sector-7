<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/14lOvi-Oqyg_opF0gKkPfyZyB89hxD9db

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Playing a match

`npm run play` builds the game and opens the optimized version: use this to judge how smooth
it feels. (`npm run dev` is for editing: it reloads on save but runs React in development mode,
which is several times slower.) Pick your side, opponent (computer Easy / Normal / Hard, or the
Sandbox), doctrine and map seed, then **Deploy**.

- **Win** by destroying the enemy Command HQ, or by holding 4 of the 6 core nodes for 2 minutes.
- **Select** with left-click or a drag box; **move** by clicking the ground; **attack-move** with
  Ctrl-click (or F, then click). **Camera:** WASD / arrows, right-drag to turn, wheel to zoom.
- **Build:** double-click your HQ. Structures must go inside your energy grid.
- **Train:** click a finished structure. Up to 5 queue; set a rally point from the same menu.
- **Grow:** infantry capture core nodes (income + population) and buildings (energy grid). Server
  nodes in the centre unlock Tier 2 and Tier 3 units and doctrine powers.

The design, numbers and AI are described in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).
