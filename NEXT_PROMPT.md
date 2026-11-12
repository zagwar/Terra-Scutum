# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after merging the F132 pull request. Your usual model is fine for this one (F64 is not a ⚑ Fable task).

```
Build F64 (map import tool, M1 — step 2 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/02_world_and_characters.md, docs/12_feature_tracker.md, docs/13_technical.md (including "What F132 built") and docs/15_open_questions_and_gaps.md.

Where we are: F132 (core architecture) is done and merged: the monorepo (packages/sim, game, runner, tools), the sim worker, the Babylon scene, the React UI, data validation with zod, the daily tick, seeded RNG, save versioning, tests and CI all exist. Cloudflare Pages should be connected so pull requests get preview links; if no preview link appears on this feature's pull request, help me fix that step by step.

What F64 should do, per the M1 build order: an import tool in packages/tools that turns public map data (for example Natural Earth) into the game's JSON data: provinces (about 1,000), countries, regions (about 50) and sea zones, with adjacency, plus compact geometry files, each with a zod schema registered in the sim's data list. Draft the curated country list (tiny countries merged into a neighbor) and show it to me to approve before finalizing. The map itself is drawn in the next features (F01, F02, F70), so for this one show me a simple way to see the result (for example counts and a small picture of the generated provinces).

If the cloud machine can't download the map data because of the network allowlist, tell me exactly which setting to change, step by step. Start by running npm install if node_modules is missing.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
