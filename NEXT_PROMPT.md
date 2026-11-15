# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F125 preview link and merging that pull request. F133 is **not** a ⚑ Fable task: your usual model is fine.

```
Build F133 (asset generator framework; M1, second half of step 7 of the M1 build order, after F125). Read CLAUDE.md, GAME_DESIGN.md, docs/11_ui_art_audio.md (sections 12.5 and 12.6), docs/12_feature_tracker.md, docs/13_technical.md (including the Performance plan and engine checkpoints, "What F01 built", "What F125 built" and "Playing on a phone") and docs/14_decision_log.md.

First: the WebGPU browser tests only run after a merge to main. Check that the latest CI run on main (the F125 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: F132, F64, F01, F02, F70, F03, F04, F71, F122, F138, F05 and F125 are merged. The world map is real 3D terrain now (F125): terrain tiles in five levels of detail made by `npm run import:terrain` from public elevation and land-cover data, the provinces cut into the terrain (borders, map-mode colors, selection and picking work on it; mouse and touch hit the terrain), map-mode colors that fade as the view zooms in, the Provinces map mode showing the natural terrain, and rivers. `MapView.heightAt(longitude, latitude)` gives the height of the land as drawn (things standing on the map use it); the land is drawn higher than in reality (`terrain.exaggeration` in `data/map_view.json`). The game can also be played on a phone for testing (keep it working).

What F133 should do (section 12.6): the framework every later generated 3D asset uses: a generator takes a definition from the data files plus a seed and produces a mesh, materials and several detail levels (icon, simple, detailed); procedural materials (no texture files); model lookup through data, so any generated asset can later be replaced by a real model by changing one data entry; generators live in `packages/game/src/generators`, work from engine-neutral specs in data (section 14, "Keep the project portable"), and use thin instances for repeated objects. Prove it with one or two very simple placeholder generators (for example a tree or a box building, marked [DEFAULT]) placed on the terrain through `MapView.heightAt`, so I can see it on the preview link; don't build the real buildings (F126, M2), cities or units yet. Before building, tell me what you plan to show as the proof and agree it with me. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

After F133 comes F139 (performance stress tests and engine checkpoint 1), the last feature of M1.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
