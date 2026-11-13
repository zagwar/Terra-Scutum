# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F71 preview link and merging the F71 pull request. Your usual model is fine (F122 is not a ⚑ Fable task). Start the session in the **terra-scutum** environment (the environment selector under the message box), which can download the IMF and World Bank data.

```
Build F122 (UI shell; M1, step 6 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/11_ui_art_audio.md (sections 12.1 to 12.3, and 12.4.1 only to leave room for the country screen), docs/12_feature_tracker.md, docs/13_technical.md (including "What F132 built", "What F01 built", "What F02 built", "What F04 built" and "What F71 built") and docs/14_decision_log.md.

Where we are: F132, F64, F01, F02, F70, F03, F04 and F71 are merged. The game shows the 3D world map with four map modes, province, sea zone and country panels, a strategy camera, and real time with pause (date and speed control top-right). Since F71 every country has real-world 2025 starting data (population, GDP, government type) in data/country_start.json, shown in the country panel. A temporary "Foundation check" panel is still on screen (bottom-left), and the region panel promised by F64 doesn't exist yet.

What F122 should do (first pass, as the build order says): the UI shell of section 12.1: the top bar (with the date and speed control moved into it), the alerts row, the outliner, the lens bar and empty screens, notifications and message settings, laid out so later features can fill them. Most numbers the top bar should show don't exist in the sim yet: before building, show me which ones you plan to show now (and how, for example as "—" or hidden), and agree the layout with me. Replace the Foundation check panel and decide with me where the region panel goes. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
