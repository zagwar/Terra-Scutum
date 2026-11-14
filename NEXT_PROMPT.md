# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F138 + F05 preview link and merging that pull request. **F125 is a ⚑ Fable task: choose Claude Fable 5.2 as the model for this session.**

```
Build F125 (realistic terrain; M1, step 7 of the M1 build order, after F05). This is a ⚑ Fable task (map and rendering architecture). Read CLAUDE.md, GAME_DESIGN.md, docs/11_ui_art_audio.md (sections 12.5 and 12.6), docs/02_world_and_characters.md (only what terrain needs), docs/12_feature_tracker.md, docs/13_technical.md (including the Performance plan and engine checkpoints, "What F01 built", "What F03 built", "What F138 built" and "What F05 built") and docs/14_decision_log.md.

First: since the CI change made with F138, the WebGPU browser tests only run after a merge to main. Check that the latest CI run on main (the F138 + F05 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: F132, F64, F01, F02, F70, F03, F04, F71, F122, F138 and F05 are merged. The game opens on a "Choose your country" mode on the world map (HOI4-style: click a country, search, or 8 quick picks; Play as … starts paused). Then it has the UI shell (top bar with my real flag, alerts row, outliner, lens bar, notifications, information panel with Back) and the HOI4-style country screen (Government view for my country, Diplomacy view for others). The map is flat: province and sea polygons on the ground plane (y = 0), drawn in order without depth; picking intersects the mouse ray with y = 0 (see "What F01 built": when terrain arrives the ray must hit the terrain instead).

What F125 should do: realistic terrain from public elevation and land-cover data, chunked with levels of detail, and the zoom levels of section 12.5 (strategic, operational, close), while keeping province borders, map-mode colors, selection, picking and the camera working, within the performance budgets of docs/13_technical.md. Before building, tell me which public data you plan to use (and its licence), how big the downloads and the game's terrain files will be, and how it will look at each zoom level; agree it with me first. If the environment's network allowlist blocks a download, tell me exactly which setting to change, step by step. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
