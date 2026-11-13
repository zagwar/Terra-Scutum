# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after merging the F70 pull request and then the F03 pull request. Your usual model is fine (F04 is not a ⚑ Fable task).

```
Build F04 (time system: day ticks, pause, 5 speeds, date display; M1, step 4 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/03_military.md (only the first lines of section 5: real-time with pause, days, 5 speeds), docs/11_ui_art_audio.md (section 12.1, the top bar's date and speed controls), docs/12_feature_tracker.md, docs/13_technical.md (including "What F132 built" and "How the parts talk") and docs/14_decision_log.md (the F132 entry about game speed being a worker-level control).

Where we are: F132, F64, F01, F02, F70 (sea zones) and F03 (strategy camera) are merged. The game shows the 3D world map with four map modes, province, sea zone and country panels, and a strategy camera (gliding zoom and scrolling, WASD, edge scrolling, Q/E and middle mouse button to turn, Home for the whole world). The sim runs in a Web Worker; today it only advances when the temporary "Foundation check" panel's "Advance one day" button (or a test) asks it to; the date is shown in that panel. The daily tick is still empty (no systems yet).

What F04 should do: real-time with pause, like Hearts of Iron IV. The sim worker runs the daily tick by itself at the chosen game speed (5 speeds, plus pause; the game starts paused). A small date and speed control (date, pause/play, speed 1–5) where the top bar will be (the full top bar is F122), with keys: Space pauses and unpauses, + and - on the number pad or 1–5 choose the speed (check these don't clash with the camera's +/- zoom keys and pick sensible ones, telling me what you chose). The speeds (days per second) go in data as [DEFAULT]. The worker should never run behind: if a tick is slow it skips waiting rather than piling up. Keep game speed out of GameState (decision log, F132), and keep the test hooks working (tests must still be able to step days exactly).

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
