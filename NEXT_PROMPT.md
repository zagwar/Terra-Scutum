# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after merging the F64 pull request. Your usual model is fine (F01 is not a ⚑ Fable task).

```
Build F01 (3D world map: province meshes, adjacency graph, click a province for its info panel; M1, step 3 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/02_world_and_characters.md, docs/11_ui_art_audio.md (only the map and map-mode parts), docs/12_feature_tracker.md and docs/13_technical.md (including "What F132 built" and "What F64 built").

Where we are: F132 (core architecture) and F64 (map import) are merged. The map data exists: data/countries.json, data/provinces.json, data/regions.json, data/sea_zones.json, and the shapes in data/geometry/*.topo.json (TopoJSON), with names in locales/en.map.json. The sim has GameState.world (fast lookups and neighbor lists). The page map-preview.html is a temporary 2D viewer of this data; the 3D map should replace it as the way to look at the world (keep or remove the preview page, and say which).

What F01 should do: draw the provinces on the flat 3D map in the Babylon scene (replacing the placeholder sphere and grid), with sea zones underneath, so the whole world is visible from the fixed camera; pick a province with the mouse (section 14 suggests picking against a province ID map) and show a simple info panel with its name, country, region and neighbors. Keep it simple and fast: the strategy camera is F03, terrain is F125 and the political overlay is F02. Check the performance with all 1,354 provinces and take screenshots.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
