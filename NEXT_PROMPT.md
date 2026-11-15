# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F133 preview link and merging that pull request. F139 is **not** a ⚑ Fable task: your usual model is fine.

```
Build F139 (performance stress tests and engine checkpoint 1; M1, step 8 of the M1 build order, the last feature of M1). Read CLAUDE.md, GAME_DESIGN.md, docs/11_ui_art_audio.md (section 12.5), docs/12_feature_tracker.md, docs/13_technical.md (above all "Performance plan and engine checkpoints", "Testing", "What F01 built", "What F125 built", "What F133 built" and "Playing on a phone") and docs/14_decision_log.md.

First: the WebGPU browser tests only run after a merge to main. Check that the latest CI run on main (the F133 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: F132, F64, F01, F02, F70, F03, F04, F71, F122, F138, F05, F125 and F133 are merged. The map is real 3D terrain (F125). F133 added the asset generator framework: the model library `data/models.json` (each model is a generator with an engine-neutral spec and seeded variants, or a glTF file), generators in `packages/game/src/generators` with three detail levels (icon, simple, detailed) and procedural materials, thin-instanced drawing (`render/models/instanced-models.ts`), forests on the map from the terrain's land cover (small symbols, 9–15 pixels tall, denser as the view zooms in), placeholder capital markers (a cluster of box buildings at each capital), and a model gallery (`?debug=models`). Measured in the cloud's headless browser: about 13,000 trees and 350,000 triangles at the operational zoom over a forest, about 24,000 trees and 1.8 million triangles at the closest zoom (all settings under `scenery` in `data/map_view.json`). The game can also be played on a phone for testing (keep it working).

What F139 should do (section 14, "Performance plan and engine checkpoints"): the sim stress test (campaign runner: full map, every country, 10+ years, many seeds, placeholder load; average and worst tick times and memory) and the render stress test (`?debug=stress`: the full map with late-game load: about 20,000 building instances, 5,000 unit models, a battle with 2,000+ bugs, full infrastructure lines, weather and effects, using simple placeholder models from the F133 framework, with an on-screen counter of FPS, frame time, draw calls, triangles and memory; Playwright records the numbers). Then give me the engine checkpoint 1 report in plain language: the numbers vs the budgets, what you tried, and a clear recommendation (continue in the browser, or switch to Godot now). Ask me to open the stress test on the preview link (on my PC, and on my phone) and tell you the FPS I see, and don't start M2 until I decide. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
