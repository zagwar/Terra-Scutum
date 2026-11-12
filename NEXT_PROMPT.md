# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after merging the F01 pull request. Your usual model is fine (F02 is not a ⚑ Fable task).

```
Build F02 (countries layer: ownership of provinces, political overlay, country panel; M1, step 3 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/02_world_and_characters.md, docs/11_ui_art_audio.md (only the map and map-mode parts), docs/12_feature_tracker.md and docs/13_technical.md (including "What F64 built" and "What F01 built").

Where we are: F132 (core architecture), F64 (map import) and F01 (3D world map) are merged. The 3D map draws all 1,423 provinces and the sea zones, wraps east–west, and has a hover tooltip, a province info panel (click a province) and two map modes (Provinces, Regions). The code is in packages/game/src/render/map/ and its drawing settings are in data/map_view.json. The province panel still shows each province's STARTING country, read from the fixed world facts (WorldMap), because the sim doesn't track ownership yet.

What F02 should do: make province ownership part of the sim state (a typed array of owner per province in GameState, saved and sent to the game in the snapshot, since ownership will change during the game), add the "political" map mode that colors provinces by their owner's map color (data/countries.json) and make it the default mode, and add a simple country panel (name, capital, number of provinces, total area, neighboring countries) that opens from the province panel's country name. The province panel should show the current owner. Adding a map mode is described under "What F01 built" in docs/13_technical.md. Keep it simple: sea zone picking and overlay are F70, the camera is F03, starting data (population, economy) is F71.

One decision to ask me about before coding (docs/15_open_questions_and_gaps.md, "Tiny provinces"): Vatican City, Gibraltar, British Indian Ocean Territory and Rose Atoll are too small for the map data and can't be seen or clicked. Explain my options in plain words and ask me what I want; if it needs the map import to run again, do that as part of this feature.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
