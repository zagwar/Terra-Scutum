# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F133 preview link and merging that pull request. This task changes the terrain's rendering (F125, map/rendering architecture), a **⚑ Fable** task: choose **Claude Fable 5.2** as the model for that session.

```
Smooth the terrain's level-of-detail changes (no pop-in), a follow-up on F125 (realistic terrain; map/rendering architecture, ⚑ Fable), before F139. Read CLAUDE.md, GAME_DESIGN.md, docs/11_ui_art_audio.md (section 12.5), docs/12_feature_tracker.md, docs/13_technical.md (above all "What F125 built", "What F133 built", "Performance plan and engine checkpoints" and "Playing on a phone") and docs/14_decision_log.md.

First: the WebGPU browser tests only run after a merge to main. Check that the latest CI run on main (the F133 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: F132, F64, F01, F02, F70, F03, F04, F71, F122, F138, F05, F125 and F133 are merged. F133 added the asset generator framework (`data/models.json`, generators in `packages/game/src/generators`, thin-instanced drawing) and forests: tree clumps only in forest regions, the tree types by the region's climate, latitude and height (jungle, palms, acacias, broadleaf trees, conifers), small and dense, from zoom 20, and trees that grow in over 0.6 s instead of popping in.

What I want (designer feedback on the F133 preview: "the pop-in is really bad and breaks immersion, same goes for the terrain"): when the view zooms or moves and a finer terrain tile replaces a coarser one (or the other way round), the change must not jump. The mountains should morph smoothly from the coarse shape to the fine one over a short time (for example geomorphing: each finer tile also stores the coarser surface's height at its corners and the shaders blend between them), and the ground colors, borders and rivers should blend too, without visible seams or holes. Keep picking, dragging, `MapView.heightAt` and the scenery standing exactly on the land as drawn. Measure the cost (frame time, memory, tile build time) and keep the phone working. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

Also: the browser tests on pull requests now take about 19 of CI's 20 minutes. Make CI comfortably faster (for example split the browser tests into two parallel jobs, or trim slow tests without losing what they check), so F139's stress tests fit.

After this comes F139 (performance stress tests and engine checkpoint 1), the last feature of M1.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
