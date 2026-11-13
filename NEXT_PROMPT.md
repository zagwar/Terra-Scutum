# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after merging the F70 pull request. Your usual model is fine (F03 is not a ⚑ Fable task).

```
Build F03 (camera: pan, zoom, rotate; top-down/angled; M1, step 4 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/03_military.md (only the first lines of section 5 about the 3D world and camera), docs/11_ui_art_audio.md (section 12.5 "Zoom levels" only), docs/12_feature_tracker.md and docs/13_technical.md (including "What F01 built", "What F02 built" and "What F70 built").

Where we are: F132, F64, F01, F02 and F70 are merged. The map has 1,294 provinces and 126 sea zones, wraps east–west, has four map modes (Political, Provinces, Regions, Sea zones), a hover tooltip, a province panel, a sea zone panel and a country panel. Basic map controls already exist in packages/game/src/render/map/map-view.ts (mouse wheel zooms towards the mouse, dragging moves the map, arrow keys move it, +/- zoom; clampZ limits north–south movement; focusProvince and focusSeaZone bring a picked item into view). Camera settings live in data/map_view.json under "camera".

What F03 should do: turn the basic controls into the full strategy camera, like Hearts of Iron IV's: smooth movement (zoom and pan glide instead of jumping), edge scrolling (mouse at the window edge), WASD as well as the arrow keys, rotation (for example holding the middle mouse button, or Q/E), a tilt that changes with zoom (almost straight down from far away, more angled close up), and a way to reset the view (north up, whole world). Keep the east–west wrap, the levels of detail and picking working (picking and dragging must still be exact when rotated and tilted). All the numbers go in data/map_view.json as [DEFAULT]. Keep it simple: no terrain yet (F125), no minimap (F122).

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
