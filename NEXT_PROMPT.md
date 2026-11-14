# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F138 preview link and merging the F138 pull request. Your usual model is fine (F05 is not a ⚑ Fable task).

```
Build F05 (country selection screen; M1, step 6 of the M1 build order, after F138). Read CLAUDE.md, GAME_DESIGN.md, docs/01_concept_and_campaign.md (game setup, only what the selection needs), docs/11_ui_art_audio.md (sections 12.1 and 12.4), docs/12_feature_tracker.md, docs/13_technical.md (including "What F122 built" and "What F138 built") and docs/14_decision_log.md.

First: since the CI change made with F138, the WebGPU browser tests only run after a merge to main. Check that the latest CI run on main (the F138 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: F132, F64, F01, F02, F70, F03, F04, F71, F122 and F138 are merged. The game has the UI shell (top bar, alerts row, outliner, lens bar, notifications, one information panel on the left with Back) and the HOI4-style country screen: a large panel over the left part of the map with real flags (flag-icons package), the Government view for my country (from the flag in the top bar) and the Diplomacy view for other countries (from a country's name in any panel). The player's country is the United States, fixed in data (playerCountry in data/game_config.json), read by the UI only and not stored in GameState or the save.

What F05 should do: let me choose which country I lead at the start of a game, so the top bar, the Government view and everything "mine" follow that choice. Decide with me, before building: where the selection happens (a screen before the map, or picking a country on the map as in HOI4), what it shows for each country (flag, name, government type, population, GDP, a difficulty hint?), and how the choice is stored (in GameState and the save, which changes the save format). Show me the layout you plan and agree it with me first. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
